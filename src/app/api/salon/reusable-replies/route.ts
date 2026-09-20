import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { parseReusableReplyAction, parseReusableReplyQuery, ReusableReplyError } from "@/lib/businessReusableReplies";
import { readBusinessReusableReplies, saveBusinessReusableReply } from "@/lib/businessReusableReplyServer";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
  try {
    context = await requireSalonPermission(request, "bookings");
    const params = new URL(request.url).searchParams;
    if (params.get("business_id") !== context.salon.id) throw new ReusableReplyError("REPLY_FORBIDDEN");
    const query = parseReusableReplyQuery(params);
    enforceRateLimit(request, `reusable-replies:${context.user.id}`, 60, 60_000);
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 12_000) throw new ReusableReplyError("REPLY_INVALID");
      const action = parseReusableReplyAction(JSON.parse(raw));
      return Response.json({ reply: await saveBusinessReusableReply(context, action) }, { headers });
    }
    return Response.json(await readBusinessReusableReplies(context, query), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (error instanceof RateLimitError) return Response.json({ code: "REPLY_RATE_LIMIT" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    if (/Unauthorized/.test(message)) return Response.json({ code: "AUTH_REQUIRED" }, { status: 401, headers });
    if (/Forbidden/.test(message) || message === "REPLY_FORBIDDEN") return Response.json({ code: "REPLY_FORBIDDEN" }, { status: 403, headers });
    if (error instanceof SyntaxError || message === "REPLY_INVALID") return Response.json({ code: "REPLY_INVALID" }, { status: 400, headers });
    if (["REPLY_STALE", "REPLY_NOT_FOUND", "REPLY_REQUEST_REUSED"].includes(message)) return Response.json({ code: message }, { status: 409, headers });
    const safeMessage = "Reusable replies are temporarily unavailable.";
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "reusable-replies", action: request.method.toLowerCase(), error: new Error("REPLY_UNAVAILABLE"), safeMessage });
    return safeFailure(safeMessage, reference, 503, { code: "REPLY_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/reusable-replies", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/reusable-replies", "POST"), handle);
