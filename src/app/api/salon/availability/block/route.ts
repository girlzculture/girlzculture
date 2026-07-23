import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { addMinutesToLocal, dateKeyInTimeZone, salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

const modes = new Set(["stylist_three_hours", "stylist_today", "stylist_until", "salon_today", "salon_until"]);

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "salon-availability-block", 40, 10 * 60_000);
    const { admin, user, salon } = await requireSalonPermission(request, "availability");
    const body = await request.json() as Record<string, unknown>;
    const mode = cleanText(body.mode, 40);
    if (!modes.has(mode)) throw new Error("Choose a valid availability override.");
    const stylistId = mode.startsWith("stylist_") ? cleanText(body.stylist_id, 50) : "";
    if (mode.startsWith("stylist_") && !stylistId) throw new Error("Choose a stylist.");
    if (stylistId) {
      const { data: stylist } = await admin.from("stylists").select("id").eq("id", stylistId).eq("salon_id", salon.id).maybeSingle();
      if (!stylist) throw new Error("That stylist does not belong to this salon.");
    }

    const now = new Date();
    const timeZone = salonTimeZone(salon.time_zone);
    const localDate = dateKeyInTimeZone(now, timeZone);
    let endsAt: Date;
    let allDay = false;
    if (mode === "stylist_three_hours") {
      endsAt = new Date(now.getTime() + 3 * 60 * 60_000);
    } else if (mode.endsWith("_today")) {
      const nextDate = addMinutesToLocal(localDate, "00:00", 24 * 60).date;
      endsAt = zonedLocalToUtc(`${nextDate}T00:00`, timeZone);
      allDay = true;
    } else {
      const until = cleanText(body.until, 5);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(until)) throw new Error("Choose a valid booked-until time.");
      endsAt = zonedLocalToUtc(`${localDate}T${until}`, timeZone);
      if (endsAt <= now) throw new Error("Booked-until time must be later today.");
    }

    const reason = cleanText(body.reason, 180) || "Walk-in availability override";
    const { data, error } = await admin.from("salon_blockouts").insert({
      salon_id: salon.id,
      stylist_id: stylistId || null,
      starts_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      reason,
      all_day: allDay,
      block_type: mode,
      created_by_user_id: user.id,
    }).select("*").single();
    if (error) throw error;
    return Response.json({ ok: true, blockout: data, time_zone: timeZone });
  } catch (error) {
    noteOperationalFailure("Salon availability override failed", error);
    return errorResponse(error, "Unable to block availability.");
  }
}

async function DELETEHandler(request: Request) {
  try {
    enforceRateLimit(request, "salon-availability-unblock", 40, 10 * 60_000);
    const { admin, salon } = await requireSalonPermission(request, "availability");
    const id = cleanText(new URL(request.url).searchParams.get("id"), 50);
    if (!id) throw new Error("Blockout id is required.");
    const { error } = await admin.from("salon_blockouts").delete().eq("id", id).eq("salon_id", salon.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    noteOperationalFailure("Salon availability unblock failed", error);
    return errorResponse(error, "Unable to restore availability.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/availability/block", "POST"), POSTHandler);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/salon/availability/block", "DELETE"), DELETEHandler);
