import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { ASSISTANT_AVATARS } from "@/lib/assistantAppearance";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

async function handle(request: Request) {
  let context;
  const headers = { "Cache-Control": "private, no-store" };
  try {
    context = await requireSalonOwner(request);
    if (!context.isOwner) throw new Error("ASSISTANT_ACCESS_DENIED");
    enforceRateLimit(request, `assistant-appearance:${context.user.id}`, 30, 60_000);
    const raw = await request.text();
    if (raw.length > 200) throw new Error("ASSISTANT_INVALID_AVATAR");
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.avatar !== "string" || !Object.hasOwn(ASSISTANT_AVATARS, body.avatar)) throw new Error("ASSISTANT_INVALID_AVATAR");
    const { data, error } = await context.admin.rpc("update_business_assistant_avatar", { p_salon: context.salon.id, p_user: context.user.id, p_avatar: body.avatar });
    if (error) throw error;
    if (data !== body.avatar) throw new Error("ASSISTANT_APPEARANCE_UNVERIFIED");
    return Response.json({ avatar: data, business_id: context.salon.id, verified: true }, { headers });
  } catch (error) {
    const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    const status = /Unauthorized/.test(code) ? 401 : /Forbidden|ACCESS_DENIED/.test(code) ? 403 : error instanceof RateLimitError ? 429 : error instanceof SyntaxError || code === "ASSISTANT_INVALID_AVATAR" ? 400 : 503;
    const reference = await capturePlatformError({ request, admin: context?.admin, error, feature: "gc-assistant", action: "appearance", actorRole: "salon", actorId: context?.user.id, salonId: context?.salon.id, safeMessage: "Assistant appearance could not be saved.", severity: status >= 500 ? "high" : "low" });
    return Response.json({ code: status === 400 ? "ASSISTANT_INVALID_AVATAR" : status === 403 ? "ASSISTANT_ACCESS_DENIED" : "ASSISTANT_APPEARANCE_UNAVAILABLE", request_id: reference }, { status, headers: { ...headers, "X-Request-ID": reference } });
  }
}
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/salon/assistant/appearance", "PATCH"), handle);
