import { requireSalonOwner, deliverBookingMessageNotifications } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { AssistantError, ASSISTANT_TOOLS, assertSchema, stableJson, type AssistantTool } from "@/lib/gcAssistantCore";
import { createHash } from "node:crypto";
import { executeAssistantTool, confirmAssistantTool } from "@/lib/gcAssistantServer";
import { deliverAssistantReschedule } from "@/lib/assistantBookingReschedule";
import { planOwnerRequest } from "@/lib/gcAssistantPlanningServer";
import { isAssistantPage } from "@/lib/assistantPageContext";
import { assistantResponseLanguage, persistAssistantLanguage } from "@/lib/assistantLanguagePreference";
import { isAssistantLanguage } from "@/lib/assistantLanguage";
import {continuesActiveTask,taskSummary} from '@/lib/assistantActiveTask';
import {readActiveTask,rememberTask,endActiveTask} from '@/lib/assistantActiveTaskServer';
import { PolicyInputError } from "@/lib/businessPolicyCore";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

const headers = { "Cache-Control": "private, no-store" };
const validId = (value: unknown) => assertSchema(value, { type: "string", maxLength: 36, pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" });
async function POSTHandler(request: Request) {
  let admin;
  let actorId: string | undefined;
  let salonId: string | undefined;
  const audit: Record<string, unknown> = {};
  function noteTool(tool: unknown, args: unknown) {
    if (typeof tool !== "string" || !Object.hasOwn(ASSISTANT_TOOLS, tool)) return;
    audit.proposed_tool = tool;
    audit.risk_class = ASSISTANT_TOOLS[tool as AssistantTool].risk;
    // Failed preparation must not copy rejected private prose into monitoring.
    // Persisted proposals already retain normalized arguments; their ID links
    // confirmation failures to that protected audit, while this digest lets
    // support correlate an attempted payload without recording its raw text.
    audit.arguments_sha256 = createHash("sha256").update(stableJson(args) ?? "null").digest("hex");
  }
  try {
    const context = await requireSalonOwner(request); admin = context.admin;
    actorId = context.user.id; salonId = context.salon.id;
    enforceRateLimit(request, `gc-assistant:${context.user.id}`, 25, 60_000);
    const raw = await request.text();
    if (raw.length > 18000) throw new AssistantError("ASSISTANT_INPUT_TOO_LONG", 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) || !["en", "fr", "wo", "es", "zh-CN"].includes(body.locale)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    validId(body.request_id);
    audit.assistant_request_id = body.request_id; audit.locale = body.locale;
    if (["tool", "plan", "confirm"].includes(body.action)) audit.stage = body.action;
    const allowed = body.action === "confirm" ? ["action", "request_id", "locale", "digest", "confirm", "policy_reviewed"] : body.action === "plan" ? ["action", "request_id", "locale", "text", "previous_request_ids", "conversation", "page"] : ["action", "request_id", "locale", "tool", "args"];
    allowed.push('task_tracking');
    if(body.task_tracking!==undefined&&body.task_tracking!==true)throw new AssistantError('ASSISTANT_INVALID_INPUT');
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if (body.action === "confirm") {
      if (body.confirm !== true || typeof body.policy_reviewed !== "boolean" || !/^[0-9a-f]{64}$/.test(body.digest)) throw new AssistantError("ASSISTANT_CONFIRMATION_REQUIRED");
      const confirmed = await confirmAssistantTool(context, body.request_id, body.digest, body.policy_reviewed);
      if(body.task_tracking){const active=await readActiveTask(context);if(active&&active.user_context.some(turn=>turn.request_id===body.request_id)&&active.tool===confirmed.tool)await endActiveTask(context,active,body.request_id);}
      let warnings: { code: string; request_id: string }[] = [];
      if (confirmed.tool === "prepare_booking_reschedule_proposal") {
        try { warnings = await deliverAssistantReschedule(context, confirmed.result, (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, "")); }
        catch (error) { warnings = [{ code: "RESCHEDULE_NOTIFICATION_FAILED", request_id: await capturePlatformError({ request, admin, error, feature: "booking-rescheduling", action: "assistant-reschedule-notification", actorRole: "salon", actorId, salonId, safeMessage: "The proposal was saved, but a notification could not be delivered." }) }]; }
      }
      if (confirmed.tool === "prepare_customer_message" && confirmed.result?.booking_id && confirmed.result?.id && typeof confirmed.result?.body === "string") {
        try { warnings = (await deliverBookingMessageNotifications(confirmed.result.id)).warnings; }
        catch (error) { warnings = [{ code: "MESSAGE_NOTIFICATION_FAILED", request_id: await capturePlatformError({ request, admin, error, feature: "booking-messages", action: "assistant-message-notification", actorRole: "salon", safeMessage: "The message was saved, but a notification could not be delivered." }) }]; }
      }
      return Response.json({ ...confirmed, warnings }, { headers });
    }
    if (body.action === "plan") {
      if (body.page != null && !isAssistantPage(body.page)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
      if (!Array.isArray(body.previous_request_ids) || body.previous_request_ids.length > 6 || typeof body.text !== "string") throw new AssistantError("ASSISTANT_INVALID_INPUT");
      body.previous_request_ids.forEach(validId);
      if (body.conversation !== undefined) assertSchema(body.conversation, { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["role", "text"], properties: { role: { type: "string", enum: ["user", "assistant"] }, text: { type: "string", maxLength: 2400 } } } });
      const preferredLocale = assistantResponseLanguage(context.user.user_metadata, body.locale);
      audit.locale = preferredLocale;
      const active=body.task_tracking?await readActiveTask(context):null;
      const previousRequestIds=[...new Set<string>([...body.previous_request_ids,...(active?.request_ids||[])])].slice(-6);
      const planned = await planOwnerRequest({ context, admin, salonId: context.salon.id, userId: context.user.id, locale: preferredLocale, text: body.text, timeZone: String(context.salon.time_zone), previousRequestIds, conversation: body.conversation, page: body.page,trackTask:body.task_tracking,activeTask:active });
      const responseLocale = isAssistantLanguage(planned.response_locale) ? planned.response_locale : preferredLocale;
      await persistAssistantLanguage(context, preferredLocale, responseLocale, planned.language_switch != null);
      if(body.task_tracking&&!continuesActiveTask(active,planned))return Response.json({task_switch_required:true,active_task:taskSummary(active),response_locale:responseLocale},{headers});
      const task=body.task_tracking?await rememberTask(context,active,planned.task_tool,body.request_id,body.text):null;
      if (!planned.plan) return Response.json({...planned,...(body.task_tracking?{active_task:taskSummary(task)}:{})}, { headers });
      noteTool(planned.plan.tool, planned.plan.args);
      const executed = await executeAssistantTool(context, { requestId: body.request_id, locale: responseLocale, tool: planned.plan.tool, args: planned.plan.args });
      if (ASSISTANT_TOOLS[planned.plan.tool as AssistantTool].risk === 1) {
        // A read is followed by a short answer to the actual question. The
        // responder can neither call tools nor confirm a write. If it fails,
        // the authorized, deterministic summary remains available.
        try {
          // Client prose without distinct prior records has no authorization
          // anchor. The current read is evidence for this answer, not proof
          // that older text can be replayed. The planner rechecks every anchor.
          const conversationRequestIds = body.previous_request_ids.filter((id: string) => id !== body.request_id);
          const answer = await planOwnerRequest({ context, admin, salonId: context.salon.id, userId: context.user.id, locale: responseLocale, text: body.text, timeZone: String(context.salon.time_zone), previousRequestIds: [body.request_id], conversationRequestIds, conversation: conversationRequestIds.length ? body.conversation : undefined, page: body.page, answerOnly: true });
          if (answer.reply) executed.assistant_message = answer.reply;
        } catch (error) {
          await capturePlatformError({ request, admin, error, feature: "gc-assistant", action: "answer-fallback", actorRole: "salon", actorId, salonId, severity: "low", safeMessage: "The authorized business summary was returned without AI wording." });
        }
      }
      return Response.json({ ...executed, response_locale: responseLocale,...(body.task_tracking?{active_task:taskSummary(task)}:{}) }, { headers });
    }
    if (body.action !== "tool") throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if(body.task_tracking){const active=await readActiveTask(context);if(!continuesActiveTask(active,{task_tool:active?.tool,plan:{tool:body.tool}}))return Response.json({task_switch_required:true,active_task:taskSummary(active)},{headers});}
    noteTool(body.tool, body.args);
    return Response.json(await executeAssistantTool(context, { requestId: body.request_id, locale: assistantResponseLanguage(context.user.user_metadata, body.locale), tool: body.tool, args: body.args }), { headers });
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ code: "ASSISTANT_RATE_LIMIT" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    if (error instanceof AssistantError || error instanceof PolicyInputError) {
      const reference = await capturePlatformError({ request, admin, error, feature: "gc-assistant", action: "owner-request-rejected", actorRole: "salon", actorId, salonId, severity: "low", safeMessage: "GC Assistant could not complete this request.", metadata: { ...audit, failure_code: error.code } });
      return Response.json({ code: error.code, request_id: reference }, { status: error instanceof AssistantError ? error.status : 400, headers: { ...headers, "X-Request-ID": reference } });
    }
    if (error instanceof SyntaxError) return Response.json({ code: "ASSISTANT_INVALID_INPUT" }, { status: 400, headers });
    if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message)) return Response.json({ code: /Unauthorized/.test(error.message) ? "AUTH_REQUIRED" : "ASSISTANT_ACCESS_DENIED" }, { status: /Unauthorized/.test(error.message) ? 401 : 403, headers });
    const reference = await capturePlatformError({ request, admin, error, feature: "gc-assistant", action: "owner-request", actorRole: "salon", actorId, salonId, metadata: { ...audit, failure_code: "ASSISTANT_UNAVAILABLE" }, safeMessage: "GC Assistant is temporarily unavailable." });
    return safeFailure("GC Assistant is temporarily unavailable.", reference);
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/assistant", "POST"), POSTHandler);
