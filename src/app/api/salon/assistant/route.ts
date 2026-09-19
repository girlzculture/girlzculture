import { requireSalonOwner, deliverBookingMessageNotifications } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { AssistantError, ASSISTANT_TOOLS, assertSchema, stableJson, type AssistantTool } from "@/lib/gcAssistantCore";
import { createHash } from "node:crypto";
import { executeAssistantTool, confirmAssistantTool } from "@/lib/gcAssistantServer";
import { planOwnerRequest } from "@/lib/gcAssistantPlanningServer";
import { isAssistantPage } from "@/lib/assistantPageContext";
import { isAssistantLanguage } from "@/lib/assistantLanguage";
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
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if (body.action === "confirm") {
      if (body.confirm !== true || typeof body.policy_reviewed !== "boolean" || !/^[0-9a-f]{64}$/.test(body.digest)) throw new AssistantError("ASSISTANT_CONFIRMATION_REQUIRED");
      const confirmed = await confirmAssistantTool(context, body.request_id, body.digest, body.policy_reviewed);
      let warnings: { code: string; request_id: string }[] = [];
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
      const planned = await planOwnerRequest({ context, admin, salonId: context.salon.id, userId: context.user.id, locale: body.locale, text: body.text, timeZone: String(context.salon.time_zone), previousRequestIds: body.previous_request_ids, conversation: body.conversation, page: body.page });
      const responseLocale = isAssistantLanguage(planned.response_locale) ? planned.response_locale : body.locale;
      if (!planned.plan) return Response.json(planned, { headers });
      noteTool(planned.plan.tool, planned.plan.args);
      const executed = await executeAssistantTool(context, { requestId: body.request_id, locale: responseLocale, tool: planned.plan.tool, args: planned.plan.args });
      if (ASSISTANT_TOOLS[planned.plan.tool as AssistantTool].risk === 1) {
        // A read is followed by a short answer to the actual question. The
        // responder can neither call tools nor confirm a write. If it fails,
        // the authorized, deterministic summary remains available.
        try {
          const answer = await planOwnerRequest({ context, admin, salonId: context.salon.id, userId: context.user.id, locale: responseLocale, text: body.text, timeZone: String(context.salon.time_zone), previousRequestIds: [body.request_id], conversationRequestIds: body.previous_request_ids, conversation: body.conversation, page: body.page, answerOnly: true });
          if (answer.reply) executed.assistant_message = answer.reply;
        } catch (error) {
          await capturePlatformError({ request, admin, error, feature: "gc-assistant", action: "answer-fallback", actorRole: "salon", actorId, salonId, severity: "low", safeMessage: "The authorized business summary was returned without AI wording." });
        }
      }
      return Response.json({ ...executed, response_locale: responseLocale }, { headers });
    }
    if (body.action !== "tool") throw new AssistantError("ASSISTANT_INVALID_INPUT");
    noteTool(body.tool, body.args);
    return Response.json(await executeAssistantTool(context, { requestId: body.request_id, locale: body.locale, tool: body.tool, args: body.args }), { headers });
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
