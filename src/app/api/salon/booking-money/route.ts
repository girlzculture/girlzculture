import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { validateFinancePeriod } from "@/lib/businessFinanceCore";
import { readBusinessBookingMoney } from "@/lib/businessBookingMoneyServer";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: Request) {
 let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
 try {
  context = await requireSalonOwner(request);
  enforceRateLimit(request, `booking-money:${context.user.id}`, 20, 60_000);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some(key => !["from", "to"].includes(key))) throw Error("BOOKING_MONEY_INVALID_PERIOD");
  const period = { from: url.searchParams.get("from") || "", to: url.searchParams.get("to") || "", timeZone: String(context.salon.time_zone || "America/New_York") };
  if ([period.from, period.to].some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)))) throw Error("BOOKING_MONEY_INVALID_PERIOD");
  validateFinancePeriod(period);
  if ((Date.parse(period.to) - Date.parse(period.from)) / 86400000 > 365) throw Error("BOOKING_MONEY_RANGE_TOO_LARGE");
  return Response.json(await readBusinessBookingMoney(context, period), { headers });
 } catch (error) {
  const message = String((error as { message?: unknown })?.message || "");
  if (/Unauthorized|Forbidden|ACCESS_DENIED/.test(message)) return Response.json({ code: "BOOKING_MONEY_ACCESS_DENIED" }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
  if (error instanceof RateLimitError) return Response.json({ code: "BOOKING_MONEY_RATE_LIMIT" }, { status: 429, headers });
  if (/INVALID_PERIOD|RANGE_TOO_LARGE/.test(message)) return Response.json({ code: "BOOKING_MONEY_RANGE_REQUIRED" }, { status: 400, headers });
  if (message === "BOOKING_MONEY_CHANGED") return Response.json({ code: message }, { status: 409, headers });
  const safeMessage = "Booking money evidence could not be verified. Reload to check the current records.";
  const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "booking-money", action: "read", error, safeMessage });
  return safeFailure(safeMessage, reference, 500, { code: "BOOKING_MONEY_UNAVAILABLE" });
 }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/booking-money", "GET"), handle);
