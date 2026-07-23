import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { bookingAvailability, nextAvailableSlot } from "@/lib/bookingAvailabilityServer";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "booking-availability", 120, 10 * 60_000);
    const query = new URL(request.url).searchParams;
    const salonId = cleanText(query.get("salon_id"), 50);
    const styleId = cleanText(query.get("style_id"), 50);
    const stylistId = cleanText(query.get("stylist_id"), 50) || null;
    const date = cleanText(query.get("date"), 10);
    if (!salonId || !styleId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Salon, style, and date are required.");
    const result = await bookingAvailability({ salonId, styleId, stylistId, date });
    const next = result.slots.length ? null : await nextAvailableSlot({ salonId, styleId, stylistId, afterDate: date });
    return Response.json({ ...result, next });
  } catch (error) {
    noteOperationalFailure("Booking availability failed", error);
    return errorResponse(error, "Unable to load live availability.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/booking-availability", "GET"), GETHandler);
