import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { addMinutesToLocal, dateKeyInTimeZone, salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request) {
  try {
    const { admin, salon, isOwner, user } = await requireSalonOwner(request);
    if (!isOwner) throw new Error("Only the salon owner can change the open/closed status.");
    const body = await request.json() as { closed?: boolean };
    const now = new Date();
    const timeZone = salonTimeZone(salon.time_zone);
    const date = dateKeyInTimeZone(now, timeZone);
    const closed = Boolean(body.closed);
    const alreadyClosed =
      Boolean(salon.is_closed_override) &&
      String(salon.closed_override_date || "") === date;
    if (closed === alreadyClosed) {
      return Response.json({
        status: closed ? "Closed today" : "Open according to normal hours",
        salon: {
          is_closed_override: alreadyClosed,
          closed_override_date: alreadyClosed ? date : null,
          closed_override_updated_at: salon.closed_override_updated_at || null,
        },
        idempotent: true,
      });
    }
    const updatedAt = now.toISOString();
    const patch = { is_closed_override: closed, closed_override_date: closed ? date : null, closed_override_updated_at: updatedAt };
    const { data, error } = await admin.from("salons").update(patch).eq("id", salon.id).select("is_closed_override,closed_override_date,closed_override_updated_at").single();
    if (error) throw error;
    const nextDate = addMinutesToLocal(date, "00:00", 24 * 60).date;
    const expiresAt = zonedLocalToUtc(`${nextDate}T00:00`, timeZone).toISOString();
    const audit = await admin.from("salon_availability_override_audit").insert({
      salon_id: salon.id,
      blockout_id: null,
      stylist_id: null,
      action: closed ? "Blocked" : "Released",
      block_type: "salon_closed_today",
      starts_at: closed ? updatedAt : String(salon.closed_override_updated_at || updatedAt),
      ends_at: expiresAt,
      reason: closed ? "Salon marked full or closed today" : "Salon reopened today",
      acting_user_id: user.id,
    });
    if (audit.error) throw audit.error;
    return Response.json({ status: closed ? "Closed today" : "Open according to normal hours", salon: data, expires_at: expiresAt, idempotent: false });
  } catch (error) { noteOperationalFailure("Salon open status update failed", error); return errorResponse(error, "Unable to update salon status."); }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/open-status", "POST"), POSTHandler);
