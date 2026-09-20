import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { incidentFailure, incidentHeaders, incidentUuid, readBookingIncident } from "@/lib/bookingIncidentServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function handle(request: Request, route: { params: Promise<{ id: string }> }) {
  let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
  try {
    context = await requireSalonPermission(request, "bookings");
    enforceRateLimit(request, `attendance:${context.user.id}`, 30, 60_000);
    const { id } = await route.params;
    if (!incidentUuid.test(id) || new URL(request.url).searchParams.size) throw Error("INCIDENT_INVALID");
    const booking = await context.admin.from("bookings").select("id,stylist_id,status").eq("salon_id", context.salon.id).eq("id", id).maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) throw Error("INCIDENT_BOOKING_NOT_FOUND");
    if (!context.isOwner && context.teamMember?.stylist_id && booking.data.stylist_id !== context.teamMember.stylist_id) throw Error("INCIDENT_ACCESS_DENIED");
    if (request.method === "GET") return Response.json({ incident: await readBookingIncident(context.admin, context.salon.id, id) }, { headers: incidentHeaders });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["request_id", "action", "kind", "reason"].includes(key)) || typeof body.request_id !== "string" || !incidentUuid.test(body.request_id) || !["confirm", "void", "reinstate"].includes(body.action) || ![null, "no_show", "late_cancellation"].includes(body.kind) || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000) throw Error("INCIDENT_INVALID");
    const saved = await context.admin.rpc("record_business_booking_incident", { p_salon: context.salon.id, p_user: context.user.id, p_booking: id, p_request: body.request_id, p_action: body.action, p_kind: body.kind, p_reason: body.reason });
    if (saved.error) throw saved.error;
    if (saved.data?.booking_id !== id || saved.data?.verified !== true) throw Error("INCIDENT_NOT_VERIFIED");
    return Response.json({ ...saved.data, incident: await readBookingIncident(context.admin, context.salon.id, id) }, { headers: incidentHeaders });
  } catch (error) { return incidentFailure(request, error, context?.admin, context?.user.id, context?.salon.id); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/attendance", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/attendance", "POST"), handle);
