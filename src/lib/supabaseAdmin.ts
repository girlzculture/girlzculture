import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "@/lib/dateTime";
import { sendPushToUsers } from "@/lib/webPushServer";
import { assertAuthorizedAdminUser } from "@/lib/adminSecurityServer";

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
  const { data: identity, error: identityError } = await admin.from("platform_identities").select("email_normalized,primary_role,status").eq("user_id", data.user.id).maybeSingle();
  if (identityError && identityError.code !== "PGRST205") throw identityError;
  if (!identity || identity.status !== "Active" || identity.primary_role !== "admin" || identity.email_normalized !== normalizedEmail) throw new Error("Forbidden");
  let row = await assertAuthorizedAdminUser(admin, data.user);
  if (row?.status === "Invited") {
    const activatedAt = new Date().toISOString();
    const { error: activationError } = await admin.from("admin_users").update({ status: "Active", activated_at: activatedAt }).eq("id", row.id).eq("status", "Invited");
    if (activationError) throw activationError;
    row = { ...row, status: "Active", activated_at: activatedAt };
  }
  return { admin, user: data.user, adminUser: row };
}

export async function requireAdminPermission(request: Request, permission: string) {
  const context = await requireAdmin(request);
  const row = context.adminUser as { is_super_admin?: boolean; permissions?: Record<string, boolean> };
  if (!row.is_super_admin && !row.permissions?.[permission]) throw new Error("Forbidden: this admin role does not have access to this section.");
  return context;
}

export async function requireSalonOwner(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: ownedSalon, error: salonError } = await admin.from("salons").select("*").eq("user_id", data.user.id).limit(1).maybeSingle();
  if (salonError) throw salonError;
  if (ownedSalon) return { admin, user: data.user, salon: ownedSalon, teamMember: null, isOwner: true };
  const { data: teamMember, error: teamError } = await admin.from("salon_team_members").select("*,salon:salons(*)").eq("user_id", data.user.id).in("status", ["Invited", "Active"]).limit(1).maybeSingle();
  if (teamError || !teamMember?.salon) throw new Error("This account is not linked to a salon.");
  if (teamMember.status === "Invited") await admin.from("salon_team_members").update({ status: "Active", activated_at: new Date().toISOString() }).eq("id", teamMember.id);
  return { admin, user: data.user, salon: teamMember.salon, teamMember, isOwner: false };
}

export async function requireSalonPermission(request: Request, permission: string) {
  const context = await requireSalonOwner(request);
  if (!context.isOwner && !(context.teamMember?.permissions as Record<string, boolean> | undefined)?.[permission]) throw new Error("Forbidden: this salon role does not have access to this section.");
  return context;
}

export type TransactionalEmailCategory = "security" | "bookings" | "account" | "support";

function senderFor(category: TransactionalEmailCategory) {
  const senders: Record<TransactionalEmailCategory, string> = {
    security: process.env.EMAIL_FROM_SECURITY || "Girlz Culture Security <noreply@notifications.girlzculture.com>",
    bookings: process.env.EMAIL_FROM_BOOKINGS || "Girlz Culture Bookings <bookings@notifications.girlzculture.com>",
    account: process.env.EMAIL_FROM_ACCOUNT || "Girlz Culture <hello@notifications.girlzculture.com>",
    support: process.env.EMAIL_FROM_SUPPORT || "Girlz Culture Support <support@notifications.girlzculture.com>",
  };
  return senders[category];
}

export async function sendEmail(to: string, subject: string, html: string, category: TransactionalEmailCategory = "account") {
  if (!process.env.RESEND_API_KEY || !to) return { skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: senderFor(category), to, subject, html }),
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

type DeliveryTask = { recipientType: "salon" | "customer" | "stylist"; channel: "email" | "sms" | "push"; destination: string; run: () => Promise<unknown> };

function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

async function bookingNotificationContext(bookingId: string) {
  const admin = getSupabaseAdmin();
  const { data: booking } = await admin.from("bookings").select("*").eq("id", bookingId).single();
  if (!booking) throw new Error("Booking not found");
  const [{ data: salon }, { data: style }, { data: stylist }] = await Promise.all([
    admin.from("salons").select("name,email,phone,time_zone,slug,user_id").eq("id", booking.salon_id).single(),
    admin.from("styles").select("name").eq("id", booking.style_id).maybeSingle(),
    booking.stylist_id ? admin.from("stylists").select("id,name,user_id").eq("id", booking.stylist_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!salon) throw new Error("Salon not found");
  let stylistContact: { email: string; phone: string; userId: string } | null = null;
  if (stylist?.id) {
    const { data: member } = await admin.from("salon_team_members").select("user_id,email,phone").eq("salon_id", booking.salon_id).eq("stylist_id", stylist.id).eq("status", "Active").maybeSingle();
    const userId = String(stylist.user_id || member?.user_id || "");
    const authResult = userId ? await admin.auth.admin.getUserById(userId) : null;
    stylistContact = {
      email: String(member?.email || authResult?.data.user?.email || ""),
      phone: String(member?.phone || authResult?.data.user?.user_metadata?.phone || ""),
      userId,
    };
  }
  return { admin, booking, salon, style, stylist, stylistContact };
}

async function bookingNotificationSettings(admin:ReturnType<typeof getSupabaseAdmin>){
  const keys=["notifications.channels","notifications.booking_customer_confirmed_subject","notifications.booking_salon_confirmed_subject","notifications.booking_customer_cancelled_subject","notifications.booking_salon_cancelled_subject"];
  const{data,error}=await admin.from("engine_settings").select("setting_key,published_value").eq("status","Published").in("setting_key",keys);
  if(error)console.warn("Booking notification Engine settings unavailable; using safe defaults",{code:error.code});
  const values=Object.fromEntries((data||[]).map(row=>[row.setting_key,row.published_value]));
  const rawChannels=Array.isArray(values["notifications.channels"])?values["notifications.channels"]:[];
  const channels=new Set((rawChannels.length?rawChannels:["email","sms","push"]).map(value=>String(value)).filter(value=>["email","sms","push"].includes(value)));
  const subject=(key:string,fallback:string)=>{const value=String(values[key]||"").trim();return value&&value.length<=140?value:fallback};
  return{channels,customerConfirmed:subject("notifications.booking_customer_confirmed_subject","Your Girlz Culture appointment is confirmed"),salonConfirmed:subject("notifications.booking_salon_confirmed_subject","New confirmed Girlz Culture booking"),customerCancelled:subject("notifications.booking_customer_cancelled_subject","Your Girlz Culture appointment was cancelled"),salonCancelled:subject("notifications.booking_salon_cancelled_subject","Girlz Culture booking cancelled")};
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
  const { admin, booking, salon, style, stylist, stylistContact } = await bookingNotificationContext(bookingId);
  const notification=await bookingNotificationSettings(admin);
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
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), notification.salonConfirmed, `<h1>New confirmed booking</h1><p>${escapeHtml(salonSummary)}</p><p><a href="${dashboardUrl}">Open this booking</a></p>`, "bookings") },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), `Girlz Culture confirmed booking: ${salonSummary} ${dashboardUrl}`) },
    { recipientType: "salon", channel: "push", destination: String(salon.user_id || ""), run: () => sendPushToUsers([String(salon.user_id || "")], { title: "New confirmed booking", body: salonSummary, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) },
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), notification.customerConfirmed, `<h1>Your appointment is confirmed</h1><p>${escapeHtml(customerSummary)}</p><p>Confirmation code: ${escapeHtml(booking.confirmation_code)}</p><p><a href="${accountUrl}">View your booking</a></p>`, "bookings") },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), `Girlz Culture: ${customerSummary} Confirmation ${booking.confirmation_code || ""}. ${accountUrl}`) },
  ];
  if (booking.customer_id) tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: "Appointment confirmed", body: customerSummary, url: "/account?tab=upcoming", tag: `booking-${booking.id}` }) });
  if (stylistContact?.email) tasks.push({ recipientType: "stylist", channel: "email", destination: stylistContact.email, run: () => sendEmail(stylistContact.email, "A Girlz Culture booking was assigned to you", `<h1>New assigned booking</h1><p>${escapeHtml(salonSummary)}</p><p><a href="${dashboardUrl}">Open your appointment</a></p>`, "bookings") });
  if (stylistContact?.phone) tasks.push({ recipientType: "stylist", channel: "sms", destination: stylistContact.phone, run: () => sendSms(stylistContact.phone, `Girlz Culture assigned booking: ${salonSummary} ${dashboardUrl}`) });
  if (stylistContact?.userId) tasks.push({ recipientType: "stylist", channel: "push", destination: stylistContact.userId, run: () => sendPushToUsers([stylistContact.userId], { title: "A booking was assigned to you", body: salonSummary, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) });
  const deliveries = await runDeliveries(bookingId, "booking_confirmed", tasks.filter(task=>notification.channels.has(task.channel)));
  const delivered = deliveries.every((item) => item.status === "delivered");
  if (delivered) await admin.from("bookings").update({ notifications_sent_at: new Date().toISOString() }).eq("id", bookingId).is("notifications_sent_at", null);
  await admin.from("notifications").update({ delivery_status: delivered ? "delivered" : "attention_required" }).eq("booking_id", bookingId);
  return { deliveries, delivered };
}

export async function deliverCancellationNotifications(bookingId: string, reason: string) {
  const { admin,booking, salon, style, stylist, stylistContact } = await bookingNotificationContext(bookingId);
  const notification=await bookingNotificationSettings(admin);
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const service = String(style?.name || "Braiding service");
  const refundMessage = booking.refund_status === "Succeeded"
    ? `Your $${Number(booking.refund_amount || 0).toFixed(2)} reservation deposit was refunded in full.`
    : "No deposit refund was due for this booking.";
  const message = `Your ${service} appointment at ${salon.name} for ${when}${stylist?.name ? ` with ${stylist.name}` : ""} was cancelled. Reason: ${reason}. ${refundMessage}`;
  const businessMessage = `${String(booking.guest_name || "A customer")}'s ${service} appointment for ${when}${stylist?.name ? ` with ${stylist.name}` : ""} was cancelled. Reason: ${reason}.`;
  const tasks: DeliveryTask[] = [
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), notification.customerCancelled, `<h1>Appointment cancelled</h1><p>${escapeHtml(message)}</p><p>We are sorry for the disruption. Visit Girlz Culture to find another available salon.</p>`, "bookings") },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), `Girlz Culture: ${message}`) },
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), notification.salonCancelled, `<h1>Booking cancelled</h1><p>${escapeHtml(businessMessage)}</p>`, "bookings") },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), `Girlz Culture: ${businessMessage}`) },
    { recipientType: "salon", channel: "push", destination: String(salon.user_id || ""), run: () => sendPushToUsers([String(salon.user_id || "")], { title: "Booking cancelled", body: businessMessage, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) },
  ];
  if (booking.customer_id) tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: "Appointment cancelled", body: message, url: "/account?tab=past", tag: `booking-${booking.id}`, requireInteraction: true }) });
  if (stylistContact?.email) tasks.push({ recipientType: "stylist", channel: "email", destination: stylistContact.email, run: () => sendEmail(stylistContact.email, "An assigned Girlz Culture booking was cancelled", `<h1>Assigned booking cancelled</h1><p>${escapeHtml(businessMessage)}</p>`, "bookings") });
  if (stylistContact?.phone) tasks.push({ recipientType: "stylist", channel: "sms", destination: stylistContact.phone, run: () => sendSms(stylistContact.phone, `Girlz Culture: ${businessMessage}`) });
  if (stylistContact?.userId) tasks.push({ recipientType: "stylist", channel: "push", destination: stylistContact.userId, run: () => sendPushToUsers([stylistContact.userId], { title: "Assigned booking cancelled", body: businessMessage, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) });
  return { deliveries: await runDeliveries(bookingId, "booking_cancelled", tasks.filter(task=>notification.channels.has(task.channel))) };
}
