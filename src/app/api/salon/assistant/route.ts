import { requireSalonOwner, deliverBookingMessageNotifications } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { AssistantError, assertSchema } from "@/lib/gcAssistantCore";
import { executeAssistantTool, confirmAssistantTool } from "@/lib/gcAssistantServer";
import { planOwnerRequest } from "@/lib/gcAssistantPlanningServer";
import { PolicyInputError } from "@/lib/businessPolicyCore";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

const headers = { "Cache-Control": "private, no-store" };
const validId = (value: unknown) => assertSchema(value, { type: "string", maxLength: 36, pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" });
async function POSTHandler(request: Request) {
  let admin;
  try {
    const context = await requireSalonOwner(request); admin = context.admin;
    enforceRateLimit(request, `gc-assistant:${context.user.id}`, 25, 60_000);
    const raw = await request.text();
    if (raw.length > 18000) throw new AssistantError("ASSISTANT_INPUT_TOO_LONG", 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) || !["en", "fr", "wo", "es", "zh-CN"].includes(body.locale)) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    validId(body.request_id);
    const allowed = body.action === "confirm" ? ["action", "request_id", "locale", "digest", "confirm", "policy_reviewed"] : body.action === "plan" ? ["action", "request_id", "locale", "text", "previous_request_ids"] : ["action", "request_id", "locale", "tool", "args"];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
    if (body.action === "confirm") {
      if (body.confirm !== true || typeof body.policy_reviewed !== "boolean" || !/^[0-9a-f]{64}$/.test(body.digest)) throw new AssistantError("ASSISTANT_CONFIRMATION_REQUIRED");
      const confirmed = await confirmAssistantTool(context, body.request_id, body.digest, body.policy_reviewed);
      let warnings: { code: string; request_id: string }[] = [];
      if (confirmed.result?.booking_id && confirmed.result?.id && typeof confirmed.result?.body === "string") {
        try { warnings = (await deliverBookingMessageNotifications(confirmed.result.id)).warnings; }
        catch (error) { warnings = [{ code: "MESSAGE_NOTIFICATION_FAILED", request_id: await capturePlatformError({ request, admin, error, feature: "booking-messages", action: "assistant-message-notification", actorRole: "salon", safeMessage: "The message was saved, but a notification could not be delivered." }) }]; }
      }
      return Response.json({ ...confirmed, warnings }, { headers });
    }
    if (body.action === "plan") {
      if (!Array.isArray(body.previous_request_ids) || body.previous_request_ids.length > 6 || typeof body.text !== "string") throw new AssistantError("ASSISTANT_INVALID_INPUT");
      body.previous_request_ids.forEach(validId);
      const planned = await planOwnerRequest({ admin, salonId: context.salon.id, userId: context.user.id, locale: body.locale, text: body.text, timeZone: String(context.salon.time_zone), previousRequestIds: body.previous_request_ids });
      if (!planned.plan) return Response.json(planned, { headers });
      return Response.json(await executeAssistantTool(context, { requestId: body.request_id, locale: body.locale, tool: planned.plan.tool, args: planned.plan.args }), { headers });
    }
    if (body.action !== "tool") throw new AssistantError("ASSISTANT_INVALID_INPUT");
    return Response.json(await executeAssistantTool(context, { requestId: body.request_id, locale: body.locale, tool: body.tool, args: body.args }), { headers });
  } catch (error) {
    if (error instanceof RateLimitError) return Response.json({ code: "ASSISTANT_RATE_LIMIT" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    if (error instanceof AssistantError || error instanceof PolicyInputError) return Response.json({ code: error.code }, { status: error instanceof AssistantError ? error.status : 400, headers });
    if (error instanceof SyntaxError) return Response.json({ code: "ASSISTANT_INVALID_INPUT" }, { status: 400, headers });
    if (error instanceof Error && /Unauthorized|Forbidden/.test(error.message)) return Response.json({ code: /Unauthorized/.test(error.message) ? "AUTH_REQUIRED" : "ASSISTANT_ACCESS_DENIED" }, { status: /Unauthorized/.test(error.message) ? 401 : 403, headers });
    const reference = await capturePlatformError({ request, admin, error, feature: "gc-assistant", action: "owner-request", actorRole: "salon", safeMessage: "GC Assistant is temporarily unavailable." });
    return safeFailure("GC Assistant is temporarily unavailable.", reference);
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/assistant", "POST"), POSTHandler);
