import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "admin-manual-booking", 30, 10 * 60_000);
    const { admin, user } = await requireAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const salonId = cleanText(body.salon_id, 50);
    const guestName = cleanText(body.guest_name, 120);
    const guestEmail = cleanEmail(body.guest_email);
    const guestPhone = cleanUsPhone(body.guest_phone, false);
    const appointment = new Date(cleanText(body.appointment_datetime, 60));
    if (!salonId || !guestName || !Number.isFinite(appointment.getTime())) throw new Error("Salon, customer name, and appointment time are required.");
    const { data: style, error: styleError } = await admin.from("styles").select("id,price_display_min,base_price,duration_min_hours").eq("salon_id", salonId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (styleError) throw styleError;
    if (!style?.id) throw new Error("Add a style to that salon before creating a booking.");
    const total = Number(style.price_display_min || style.base_price || 0);
    if (!(total >= 0)) throw new Error("The style price could not be verified.");
    const deposit = Math.round(total * 10) / 100;
    const { data, error } = await admin.from("bookings").insert({
      salon_id: salonId, style_id: style.id, guest_name: guestName, guest_email: guestEmail,
      guest_phone: guestPhone || null, appointment_datetime: appointment.toISOString(),
      duration_hours: Number(style.duration_min_hours || 0), estimated_total: total,
      deposit_amount: deposit, balance_due: Math.round((total - deposit) * 100) / 100,
      confirmation_code: `GC-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
      status: "Confirmed", deposit_status: "Manual", source: "Admin",
    }).select("id").single();
    if (error) throw error;
    console.info("Admin manual booking created", { bookingId: data.id, salonId, adminUserId: user.id });
    return Response.json({ ok: true, booking: data });
  } catch (error) {
    console.error("Admin manual booking failed", error);
    return errorResponse(error, "Unable to create booking.");
  }
}
