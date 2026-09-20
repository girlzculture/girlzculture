import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyGuestBookingToken } from "@/lib/guestBookingAccess";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { incidentFailure, incidentHeaders, incidentUuid, readBookingIncident } from "@/lib/bookingIncidentServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function handle(request: Request, route: { params: Promise<{ id: string }> }) {
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    enforceRateLimit(request, "customer-attendance", 20, 60_000);
    const { id } = await route.params;
    if (!incidentUuid.test(id) || new URL(request.url).searchParams.size) throw Error("INCIDENT_INVALID");
    admin = getSupabaseAdmin();
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const guestToken = request.headers.get("x-guest-booking-token");
    // The secure booking link is confined to exactly one booking; never trust a typed email.
    const guest = guestToken && guestToken.length <= 1200 ? await verifyGuestBookingToken(admin, guestToken) : null;
    const auth = bearer ? await admin.auth.getUser(bearer) : null;
    if (auth?.error) throw Error("Unauthorized");
    const user = auth?.data.user;
    if (!user && (!guest || guest.bookingId !== id)) throw Error("Unauthorized");
    const booking = await admin.from("bookings").select("id,salon_id,customer_id,guest_email").eq("id", id).maybeSingle();
    if (booking.error) throw booking.error;
    const row = booking.data;
    if (!row || !(guest?.bookingId === id || (user && (row.customer_id === user.id || (user.email_confirmed_at && user.email?.toLowerCase() === row.guest_email?.toLowerCase()))))) throw Error("INCIDENT_BOOKING_NOT_FOUND");
    if (request.method === "GET") return Response.json({ incident: await readBookingIncident(admin, row.salon_id, id) }, { headers: incidentHeaders });
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000) throw Error("INCIDENT_INVALID");
    const result = await admin.rpc("request_booking_incident_review", { p_user: user?.id || null, p_booking: id, p_reason: body.reason, p_guest_token: guest?.tokenId || null });
    if (result.error) throw result.error;
    return Response.json({ ...result.data, incident: await readBookingIncident(admin, row.salon_id, id) }, { headers: incidentHeaders });
  } catch (error) { return incidentFailure(request, error, admin); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/customer/bookings/[id]/attendance", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/customer/bookings/[id]/attendance", "POST"), handle);
