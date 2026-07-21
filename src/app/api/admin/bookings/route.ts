import { bookingAvailability, nextAvailableSlot } from "@/lib/bookingAvailabilityServer";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { deliverBookingNotifications, requireAdminPermission } from "@/lib/supabaseAdmin";
import { getEngineNumber } from "@/lib/engineConfigServer";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "admin-manual-booking", 30, 10 * 60_000);
    const { admin, user } = await requireAdminPermission(request, "bookings");
    const body = await request.json() as Record<string, unknown>;
    const salonId = cleanText(body.salon_id, 50);
    const guestName = cleanText(body.guest_name, 120);
    const guestEmail = cleanEmail(body.guest_email);
    const guestPhone = cleanUsPhone(body.guest_phone, true);
    const appointmentLocal = cleanText(body.appointment_local, 20);
    const [localDate, localTime] = appointmentLocal.split("T");
    if (!salonId || !guestName || !/^\d{4}-\d{2}-\d{2}$/.test(localDate || "") || !/^\d{2}:\d{2}$/.test(localTime || "")) throw new Error("Salon, customer name, and a valid local appointment time are required.");
    const [{ data: salon }, { data: style, error: styleError }] = await Promise.all([
      admin.from("salons").select("id,time_zone").eq("id", salonId).single(),
      admin.from("styles").select("id,price_display_min,base_price,duration_min_hours,duration_max_hours,buffer_minutes").eq("salon_id", salonId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (!salon) throw new Error("Salon not found.");
    if (styleError) throw styleError;
    if (!style?.id) throw new Error("Add a style to that salon before creating a booking.");
    const appointment = zonedLocalToUtc(appointmentLocal, salonTimeZone(salon.time_zone));
    const availability = await bookingAvailability({ salonId, styleId: style.id, guestEmail, date: localDate });
    const slot = availability.slots.find((item) => item.value === localTime);
    if (!slot) {
      const next = await nextAvailableSlot({ salonId, styleId: style.id, guestEmail, afterDate: localDate, afterTime: localTime });
      return Response.json({ error: "That appointment overlaps an existing booking or falls outside availability.", next_available: next }, { status: 409 });
    }
    const total = Number(style.price_display_min || style.base_price || 0);
    if (!(total >= 0)) throw new Error("The style price could not be verified.");
    const depositPercentage = await getEngineNumber("booking.deposit_percentage", 10, 0, 100);
    const deposit = Math.round(total * depositPercentage) / 100;
    const { data, error } = await admin.from("bookings").insert({
      salon_id: salonId,
      style_id: style.id,
      stylist_id: slot.stylistId,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone || null,
      appointment_datetime: appointment.toISOString(),
      duration_hours: Math.max(0.25, Number(style.duration_min_hours || style.duration_max_hours || 0)),
      buffer_minutes: Math.max(0, Number(style.buffer_minutes ?? availability.bufferMinutes ?? 15)),
      estimated_total: total,
      deposit_amount: deposit,
      balance_due: Math.round((total - deposit) * 100) / 100,
      confirmation_code: `GC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      status: "Confirmed",
      deposit_status: "Manual",
      source: "Admin",
    }).select("id").single();
    if (error) {
      if (error.code === "23P01") return Response.json({ error: "That appointment overlaps an existing booking." }, { status: 409 });
      throw error;
    }
    await deliverBookingNotifications(data.id).catch((notificationError) => console.error("Admin booking notification delivery failed", { bookingId: data.id, notificationError }));
    console.info("Admin manual booking created", { bookingId: data.id, salonId, adminUserId: user.id });
    return Response.json({ ok: true, booking: data });
  } catch (error) {
    console.error("Admin manual booking failed", error);
    return errorResponse(error, "Unable to create booking.");
  }
}
