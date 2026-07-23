import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import { enforceRateLimit } from "@/lib/requestSecurity";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "discovery-availability", 30, 60_000);
    const body = await request.json() as { date?: string; salons?: Array<{ salonId?: string; styleId?: string }> };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) return Response.json({ error: "Choose a valid availability date." }, { status: 400 });
    const requested = Array.isArray(body.salons) ? body.salons.slice(0, 20).filter((row) => /^[0-9a-f-]{36}$/i.test(row.salonId || "") && /^[0-9a-f-]{36}$/i.test(row.styleId || "")) : [];
    const entries = await Promise.all(requested.map(async (row) => {
      try {
        const result = await bookingAvailability({ salonId: row.salonId!, styleId: row.styleId!, date: body.date! });
        return [row.salonId!, result.slots.length > 0] as const;
      } catch (error) {
        noteOperationalFailure("Salon availability lookup failed", {
          salonId: row.salonId,
          error,
        });
        return [row.salonId!, false] as const;
      }
    }));
    return Response.json({ availability: Object.fromEntries(entries) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    noteOperationalFailure("Discovery availability batch failed", error);
    return Response.json({ error: "Availability could not be checked." }, { status: 500 });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/discovery/availability", "POST"), POSTHandler);
