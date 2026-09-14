import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { publicErrorResponse } from "@/lib/requestSecurity";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function GETHandler(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireSalonPermission(request, "bookings");
    const { id } = await route.params;
    const booking = await context.admin.from("bookings").select("id,stylist_id").eq("id", id).eq("salon_id", context.salon.id).maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) return Response.json({ code: "BOOKING_NOT_FOUND" }, { status: 404 });
    if (context.teamMember?.stylist_id && booking.data.stylist_id !== context.teamMember.stylist_id) return Response.json({ code: "ASSISTANT_ACCESS_DENIED" }, { status: 403 });
    const notes = await context.admin.from("owner_booking_notes").select("id,body,created_at,created_by").eq("salon_id", context.salon.id).eq("booking_id", id).order("created_at", { ascending: false }).limit(100);
    if (notes.error) throw notes.error;
    return Response.json({ notes: notes.data, capped_at: 100 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return publicErrorResponse(error, "Private booking notes could not be loaded."); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/notes", "GET"), GETHandler);
