import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readBusinessScheduleOpportunities } from "@/lib/businessScheduleOpportunitiesServer";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  try {
    context = await requireSalonOwner(request);
    if (new URL(request.url).searchParams.size) return Response.json({ code: "SCHEDULE_INVALID_SELECTION" }, { status: 400, headers });
    enforceRateLimit(request, `schedule-opportunities:${context.user.id}`, 20, 60_000);
    return Response.json(await readBusinessScheduleOpportunities(context), { headers });
  } catch (error) {
    const message = String((error as { message?: unknown })?.message || "");
    if (/Unauthorized|Forbidden|ACCESS_DENIED/.test(message)) return Response.json({ code: "SCHEDULE_ACCESS_DENIED" }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
    if (error instanceof RateLimitError) return Response.json({ code: "SCHEDULE_RATE_LIMIT" }, { status: 429, headers });
    if (message === "SCHEDULE_HOURS_UNAVAILABLE") return Response.json({ code: message }, { status: 409, headers });
    if (message === "SCHEDULE_CHANGED") return Response.json({ code: message }, { status: 409, headers });
    const safeMessage = "Schedule opportunities could not be verified. Refresh to check the current calendar.";
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "schedule-opportunities", action: "read", error, safeMessage });
    return safeFailure(safeMessage, reference, 503, { code: "SCHEDULE_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/schedule-opportunities", "GET"), handle);
