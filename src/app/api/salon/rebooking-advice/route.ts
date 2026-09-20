import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { readBusinessRebookingAdvice } from "@/lib/businessRebookingAdviceServer";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
 let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
 try {
  context = await requireSalonOwner(request);
  if (new URL(request.url).searchParams.size) return Response.json({ code: "REBOOKING_INVALID_SELECTION" }, { status: 400, headers });
  enforceRateLimit(request, "rebooking-advice:" + context.user.id, 20, 60_000);
  return Response.json(await readBusinessRebookingAdvice(context), { headers });
 } catch (error) {
  const message = String((error as { message?: unknown })?.message || "");
  if (/Unauthorized|Forbidden|ACCESS_DENIED/.test(message)) return Response.json({ code: "REBOOKING_ACCESS_DENIED" }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
  if (error instanceof RateLimitError) return Response.json({ code: "REBOOKING_RATE_LIMIT" }, { status: 429, headers });
  const safeMessage = "Returning-client advice could not be verified. Refresh to check the current records.";
  const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "rebooking-advice", action: "read", error: new Error("REBOOKING_UNAVAILABLE"), safeMessage });
  return safeFailure(safeMessage, reference, 503, { code: "REBOOKING_UNAVAILABLE" });
 }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/rebooking-advice", "GET"), handle);
