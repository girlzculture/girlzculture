import { getSupabaseAdmin, sendEmail, sendSms } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const { bookingId } = await request.json();
    if (!bookingId) return Response.json({ error: "bookingId is required" }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data: booking } = await admin.from("bookings").select("*").eq("id", bookingId).single();
    if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });
    if (booking.notifications_sent_at) return Response.json({ ok: true, alreadySent: true });
    const [{ data: salon }, { data: style }, { data: stylist }] = await Promise.all([
      admin.from("salons").select("name,email,phone,notification_preferences").eq("id", booking.salon_id).single(),
      admin.from("styles").select("name").eq("id", booking.style_id).maybeSingle(),
      booking.stylist_id ? admin.from("stylists").select("name").eq("id", booking.stylist_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!salon) return Response.json({ error: "Salon not found" }, { status: 404 });
    const preferences = salon.notification_preferences || { email: true, sms: true };
    const when = new Date(booking.appointment_datetime).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
    const summary = `${style?.name || "Service"} on ${when}${stylist?.name ? ` with ${stylist.name}` : ""}. Deposit: $${Number(booking.deposit_amount || 0).toFixed(2)}.`;
    const deliveries = await Promise.allSettled([
      preferences.email === false ? Promise.resolve({ skipped: true }) : sendEmail(salon.email, "New Girlz Culture booking", `<h1>New booking for ${salon.name}</h1><p>${summary}</p><p>Open your dashboard to confirm or manage it.</p>`),
      preferences.sms === false ? Promise.resolve({ skipped: true }) : sendSms(salon.phone, `Girlz Culture: New booking — ${summary}`),
    ]);
    await admin.from("bookings").update({ notifications_sent_at: new Date().toISOString() }).eq("id", bookingId).is("notifications_sent_at", null);
    return Response.json({ ok: true, deliveries: deliveries.map((item) => item.status) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Notification failed" }, { status: 500 });
  }
}
