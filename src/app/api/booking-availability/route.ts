import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { bookingAvailability, nextAvailableSlot } from "@/lib/bookingAvailabilityServer";
import { cleanText, enforceRateLimit, publicErrorResponse } from "@/lib/requestSecurity";

export const runtime = "nodejs";

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "booking-availability", 120, 10 * 60_000);
    const query = new URL(request.url).searchParams;
    const salonId = cleanText(query.get("salon_id"), 50);
    const styleId = cleanText(query.get("style_id"), 50);
    const stylistId = cleanText(query.get("stylist_id"), 50) || null;
    const date = cleanText(query.get("date"), 10);
    if (!salonId || !styleId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({code:"AVAILABILITY_INPUT_REQUIRED",error:"Choose a business, service and date to see availability."},{status:400,headers:{"Cache-Control":"no-store"}});
    const result = await bookingAvailability({ salonId, styleId, stylistId, date });
    const next = result.slots.length ? null : await nextAvailableSlot({ salonId, styleId, stylistId, afterDate: date });
    return Response.json({ ...result, next });
  } catch (error) {
    noteOperationalFailure("Booking availability failed", error);
    return publicErrorResponse(error, "Unable to load live availability.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/booking-availability", "GET"), GETHandler);
