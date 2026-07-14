import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "@/lib/dateTime";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getSupabaseAdmin() {
  if (!url || !serviceKey) throw new Error("Missing Supabase server credentials.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const { data } = await admin.auth.getUser(token);
  if (!data.user) throw new Error("Unauthorized");
  const normalizedEmail = data.user.email?.trim().toLowerCase() || "";
  const { data: rows } = await admin.from("admin_users").select("email,role,status").ilike("email", normalizedEmail);
  const row = (rows || []).find((candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail && candidate.status === "Active");
  const master = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!row && normalizedEmail !== master) throw new Error("Forbidden");
  return { admin, user: data.user };
}

export async function requireSalonOwner(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: salon, error: salonError } = await admin.from("salons").select("*").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (salonError || !salon) throw new Error("This account is not linked to a salon.");
  return { admin, user: data.user, salon };
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY || !to) return { skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Girlz Culture <bookings@notifications.girlzculture.com>", to, subject, html }),
  });
  if (!response.ok) throw new Error(`Email delivery failed: ${await response.text()}`);
  return response.json();
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return { skipped: true };
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!response.ok) throw new Error(`SMS delivery failed: ${await response.text()}`);
  return response.json();
}

type DeliveryTask = { recipientType: "salon" | "customer"; channel: "email" | "sms"; destination: string; run: () => Promise<unknown> };

function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

async function bookingNotificationContext(bookingId: string) {
  const admin = getSupabaseAdmin();
  const { data: booking } = await admin.from("bookings").select("*").eq("id", bookingId).single();
  if (!booking) throw new Error("Booking not found");
  const [{ data: salon }, { data: style }, { data: stylist }] = await Promise.all([
    admin.from("salons").select("name,email,phone,time_zone,slug").eq("id", booking.salon_id).single(),
    admin.from("styles").select("name").eq("id", booking.style_id).maybeSingle(),
    booking.stylist_id ? admin.from("stylists").select("name").eq("id", booking.stylist_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!salon) throw new Error("Salon not found");
  return { admin, booking, salon, style, stylist };
}

async function runDeliveries(bookingId: string, eventType: "booking_confirmed" | "booking_cancelled", tasks: DeliveryTask[]) {
  const admin = getSupabaseAdmin();
  const results: Array<{ recipientType: string; channel: string; status: "delivered" | "failed" | "skipped"; error?: string }> = [];
  for (const task of tasks) {
    let status: "delivered" | "failed" | "skipped" = "delivered";
    let errorMessage = "";
    try {
      const response = await task.run() as { skipped?: boolean } | undefined;
      if (response?.skipped) status = "skipped";
    } catch (error) {
      status = "failed";
      errorMessage = error instanceof Error ? error.message : "Delivery failed";
      console.error("Transactional notification delivery failed", { bookingId, eventType, recipientType: task.recipientType, channel: task.channel, error });
    }
    await admin.from("notification_delivery_log").insert({ booking_id: bookingId, recipient_type: task.recipientType, channel: task.channel, destination: task.destination, event_type: eventType, delivery_status: status, error_message: errorMessage || null });
    results.push({ recipientType: task.recipientType, channel: task.channel, status, ...(errorMessage ? { error: errorMessage } : {}) });
  }
  return results;
}

export async function deliverBookingNotifications(bookingId: string) {
  const { admin, booking, salon, style, stylist } = await bookingNotificationContext(bookingId);
  if (booking.notifications_sent_at) return { alreadySent: true };
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const duration = `${Number(booking.duration_hours || 0)} hour${Number(booking.duration_hours || 0) === 1 ? "" : "s"}`;
  const service = String(style?.name || "Braiding service");
  const professional = String(stylist?.name || "Salon owner");
  const customer = String(booking.guest_name || "Customer");
  const root = (process.env.NEXT_PUBLIC_SITE_URL || "https://girlzculture.com").replace(/\/$/, "");
  const dashboardUrl = `${root}/salon/dashboard/bookings?booking=${booking.id}`;
  const accountUrl = `${root}/account?tab=upcoming`;
  const salonSummary = `${customer} booked ${service} for ${when}. Duration: ${duration}. Stylist: ${professional}.`;
  const customerSummary = `${service} at ${salon.name} is confirmed for ${when}. Stylist: ${professional}.`;
  const tasks: DeliveryTask[] = [
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), "New confirmed Girlz Culture booking", `<h1>New confirmed booking</h1><p>${escapeHtml(salonSummary)}</p><p><a href="${dashboardUrl}">Open this booking</a></p>`) },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), `Girlz Culture confirmed booking: ${salonSummary} ${dashboardUrl}`) },
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), "Your Girlz Culture appointment is confirmed", `<h1>Your appointment is confirmed</h1><p>${escapeHtml(customerSummary)}</p><p>Confirmation code: ${escapeHtml(booking.confirmation_code)}</p><p><a href="${accountUrl}">View your booking</a></p>`) },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), `Girlz Culture: ${customerSummary} Confirmation ${booking.confirmation_code || ""}. ${accountUrl}`) },
  ];
  const deliveries = await runDeliveries(bookingId, "booking_confirmed", tasks);
  const delivered = deliveries.every((item) => item.status === "delivered");
  if (delivered) await admin.from("bookings").update({ notifications_sent_at: new Date().toISOString() }).eq("id", bookingId).is("notifications_sent_at", null);
  await admin.from("notifications").update({ delivery_status: delivered ? "delivered" : "attention_required" }).eq("booking_id", bookingId);
  return { deliveries, delivered };
}

export async function deliverCancellationNotifications(bookingId: string, reason: string) {
  const { booking, salon, style, stylist } = await bookingNotificationContext(bookingId);
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const service = String(style?.name || "Braiding service");
  const refundMessage = booking.refund_status === "Succeeded"
    ? `Your $${Number(booking.refund_amount || 0).toFixed(2)} reservation deposit was refunded in full.`
    : "No deposit refund was due for this booking.";
  const message = `Your ${service} appointment at ${salon.name} for ${when}${stylist?.name ? ` with ${stylist.name}` : ""} was cancelled by the salon. Reason: ${reason}. ${refundMessage}`;
  const tasks: DeliveryTask[] = [
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), "Your Girlz Culture appointment was cancelled", `<h1>Appointment cancelled</h1><p>${escapeHtml(message)}</p><p>We are sorry for the disruption. Visit Girlz Culture to find another available salon.</p>`) },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), `Girlz Culture: ${message}`) },
  ];
  return { deliveries: await runDeliveries(bookingId, "booking_cancelled", tasks) };
}
