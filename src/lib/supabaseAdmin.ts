import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "@/lib/dateTime";
import { sendPushToUsers } from "@/lib/webPushServer";
import { assertAuthorizedAdminUser } from "@/lib/adminSecurityServer";
import { ENGLISH_MESSAGES, normalizeLocale } from "@/i18n/catalog";

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
  const salonAuth = salon.user_id
    ? await admin.auth.admin.getUserById(String(salon.user_id))
    : null;
  const customerLocale = normalizeLocale(booking.preferred_locale);
  const salonLocale = normalizeLocale(
    salonAuth?.data.user?.user_metadata?.locale,
  );
  let stylistContact: { email: string; phone: string; userId: string; locale: string } | null = null;
  if (stylist?.id) {
    const { data: member } = await admin.from("salon_team_members").select("user_id,email,phone").eq("salon_id", booking.salon_id).eq("stylist_id", stylist.id).eq("status", "Active").maybeSingle();
    const userId = String(stylist.user_id || member?.user_id || "");
    const authResult = userId ? await admin.auth.admin.getUserById(userId) : null;
    stylistContact = {
      email: String(member?.email || authResult?.data.user?.email || ""),
      phone: String(member?.phone || authResult?.data.user?.user_metadata?.phone || ""),
      userId,
      locale: normalizeLocale(authResult?.data.user?.user_metadata?.locale),
    };
  }
  return { admin, booking, salon, style, stylist, stylistContact, customerLocale, salonLocale };
}

type PublishedNotificationTemplate={template_key:string;published_subject:string;published_body:string;allowed_variables:string[]};
type NotificationTemplateMap=Record<string,PublishedNotificationTemplate>;
type NotificationTranslationMap=Record<string,string>;
function renderNotificationText(translations:NotificationTranslationMap,locale:string,key:string,fallback:string,variables:Record<string,string>={}){
  const source=translations[`${locale}:${key}`]||ENGLISH_MESSAGES[key]||fallback;
  return String(source).replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_match,name:string)=>variables[name]||"");
}
function renderNotificationEmail(templates:NotificationTemplateMap,translations:NotificationTranslationMap,locale:string,key:string,variables:Record<string,string>,fallbackSubject:string,fallbackBody:string){
  const template=templates[key];
  const substitute=(value:string)=>value.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_match,name:string)=>variables[name]||"");
  const subjectKey=`notification.${key}.subject`;const bodyKey=`notification.${key}.body`;
  const englishSubject=String(template?.published_subject||fallbackSubject);const englishBody=String(template?.published_body||fallbackBody);
  const subject=substitute(locale==="en"?englishSubject:renderNotificationText(translations,locale,subjectKey,englishSubject)).slice(0,140);
  const plainText=substitute(locale==="en"?englishBody:renderNotificationText(translations,locale,bodyKey,englishBody));
  return{subject,html:`<p>${escapeHtml(plainText).replaceAll("\n","<br/>")}</p>`};
}

async function bookingNotificationSettings(admin:ReturnType<typeof getSupabaseAdmin>,requestedLocales:string[]=[]){
  const keys=["notifications.channels","notifications.booking_customer_confirmed_subject","notifications.booking_salon_confirmed_subject","notifications.booking_customer_cancelled_subject","notifications.booking_salon_cancelled_subject","notifications.booking_reminder_hours","notifications.booking_reminder_subject"];
  const locales=[...new Set(requestedLocales.map(normalizeLocale).filter(locale=>locale!=="en"))];
  const[{data,error},{data:templateRows,error:templateError},{data:translationRows,error:translationError}]=await Promise.all([admin.from("engine_settings").select("setting_key,published_value").eq("status","Published").in("setting_key",keys),admin.from("notification_templates").select("template_key,published_subject,published_body,allowed_variables").eq("status","Published"),locales.length?admin.from("translation_entries").select("translation_key,locale,translated_text").eq("status","Published").in("locale",locales).like("translation_key","notification.%"):Promise.resolve({data:[],error:null})]);
  if(error)console.warn("Booking notification Engine settings unavailable; using safe defaults",{code:error.code});
  if(templateError)console.warn("Booking notification templates unavailable; using safe defaults",{code:templateError.code});
  if(translationError)console.warn("Localized notification copy unavailable; using English fallback",{code:translationError.code});
  const values=Object.fromEntries((data||[]).map(row=>[row.setting_key,row.published_value]));
  const templates=Object.fromEntries((templateRows||[]).map(row=>[row.template_key,row])) as NotificationTemplateMap;
  const translations=Object.fromEntries((translationRows||[]).map(row=>[`${row.locale}:${row.translation_key}`,row.translated_text])) as NotificationTranslationMap;
  const rawChannels=Array.isArray(values["notifications.channels"])?values["notifications.channels"]:[];
  const channels=new Set((rawChannels.length?rawChannels:["email","sms","push"]).map(value=>String(value)).filter(value=>["email","sms","push"].includes(value)));
  const subject=(key:string,fallback:string)=>{const value=String(values[key]||"").trim();return value&&value.length<=140?value:fallback};
  const reminderHours=(Array.isArray(values["notifications.booking_reminder_hours"])?values["notifications.booking_reminder_hours"]:[24,2]).map(Number).filter(value=>Number.isInteger(value)&&value>=1&&value<=336).slice(0,6);
  return{channels,templates,translations,reminderHours:reminderHours.length?reminderHours:[24,2],customerConfirmed:subject("notifications.booking_customer_confirmed_subject","Your Girlz Culture appointment is confirmed"),salonConfirmed:subject("notifications.booking_salon_confirmed_subject","New confirmed Girlz Culture booking"),customerCancelled:subject("notifications.booking_customer_cancelled_subject","Your Girlz Culture appointment was cancelled"),salonCancelled:subject("notifications.booking_salon_cancelled_subject","Girlz Culture booking cancelled"),reminderSubject:subject("notifications.booking_reminder_subject","Your Girlz Culture appointment is coming up")};
}

async function runDeliveries(bookingId: string, eventType: string, tasks: DeliveryTask[]) {
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
  const { admin, booking, salon, style, stylist, stylistContact, customerLocale, salonLocale } = await bookingNotificationContext(bookingId);
  const stylistLocale=stylistContact?.locale||salonLocale;
  const notification=await bookingNotificationSettings(admin,[customerLocale,salonLocale,stylistLocale]);
  if (booking.notifications_sent_at) return { alreadySent: true };
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const duration = `${Number(booking.duration_hours || 0)} hour${Number(booking.duration_hours || 0) === 1 ? "" : "s"}`;
  const service = String(style?.name || "Braiding service");
  const professional = String(stylist?.name || "Salon owner");
  const customer = String(booking.guest_name || "Customer");
  const root = (process.env.NEXT_PUBLIC_SITE_URL || "https://girlzculture.com").replace(/\/$/, "");
  const dashboardUrl = `${root}/salon/dashboard/bookings?booking=${booking.id}`;
  const accountUrl = `${root}/account?tab=upcoming`;
  const summaryVariables={customer,service,when,duration,professional,salon:String(salon.name||"")};
  const salonSummary=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_confirmed.summary",`${customer} booked ${service} for ${when}. Duration: ${duration}. Stylist: ${professional}.`,summaryVariables);
  const stylistSummary=renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_confirmed.summary",salonSummary,summaryVariables);
  const customerSummary=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_confirmed.summary",`${service} at ${salon.name} is confirmed for ${when}. Stylist: ${professional}.`,summaryVariables);
  const salonEmail=renderNotificationEmail(notification.templates,notification.translations,salonLocale,"booking.salon_confirmed",{summary:salonSummary,dashboard_url:dashboardUrl},notification.salonConfirmed,`A new booking is confirmed.\n\n${salonSummary}\n\nOpen this booking: ${dashboardUrl}`);
  const customerEmail=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_confirmed",{summary:customerSummary,confirmation_code:String(booking.confirmation_code||""),account_url:accountUrl},notification.customerConfirmed,`Your appointment is confirmed.\n\n${customerSummary}\n\nConfirmation code: ${booking.confirmation_code||""}\n\nView your booking: ${accountUrl}`);
  const stylistEmail=renderNotificationEmail(notification.templates,notification.translations,stylistLocale,"booking.stylist_confirmed",{summary:stylistSummary,dashboard_url:dashboardUrl},"A Girlz Culture booking was assigned to you",`A booking was assigned to you.\n\n${stylistSummary}\n\nOpen your appointment: ${dashboardUrl}`);
  const salonSms=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_confirmed.sms",`Girlz Culture confirmed booking: ${salonSummary} ${dashboardUrl}`,{summary:salonSummary,dashboard_url:dashboardUrl});
  const customerSms=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_confirmed.sms",`Girlz Culture: ${customerSummary} Confirmation ${booking.confirmation_code||""}. ${accountUrl}`,{summary:customerSummary,confirmation_code:String(booking.confirmation_code||""),account_url:accountUrl});
  const stylistSms=renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_confirmed.sms",`Girlz Culture assigned booking: ${stylistSummary} ${dashboardUrl}`,{summary:stylistSummary,dashboard_url:dashboardUrl});
  const tasks: DeliveryTask[] = [
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), salonEmail.subject, salonEmail.html, "bookings") },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), salonSms) },
    { recipientType: "salon", channel: "push", destination: String(salon.user_id || ""), run: () => sendPushToUsers([String(salon.user_id || "")], { title: renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_confirmed.push_title","New confirmed booking"), body: salonSummary, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) },
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), customerEmail.subject, customerEmail.html, "bookings") },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), customerSms) },
  ];
  if (booking.customer_id) tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_confirmed.push_title","Appointment confirmed"), body: customerSummary, url: "/account?tab=upcoming", tag: `booking-${booking.id}` }) });
  if (stylistContact?.email) tasks.push({ recipientType: "stylist", channel: "email", destination: stylistContact.email, run: () => sendEmail(stylistContact.email, stylistEmail.subject, stylistEmail.html, "bookings") });
  if (stylistContact?.phone) tasks.push({ recipientType: "stylist", channel: "sms", destination: stylistContact.phone, run: () => sendSms(stylistContact.phone, stylistSms) });
  if (stylistContact?.userId) tasks.push({ recipientType: "stylist", channel: "push", destination: stylistContact.userId, run: () => sendPushToUsers([stylistContact.userId], { title: renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_confirmed.push_title","A booking was assigned to you"), body: stylistSummary, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) });
  const deliveries = await runDeliveries(bookingId, "booking_confirmed", tasks.filter(task=>notification.channels.has(task.channel)));
  const delivered = deliveries.every((item) => item.status === "delivered");
  if (delivered) await admin.from("bookings").update({ notifications_sent_at: new Date().toISOString() }).eq("id", bookingId).is("notifications_sent_at", null);
  await admin.from("notifications").update({ delivery_status: delivered ? "delivered" : "attention_required" }).eq("booking_id", bookingId);
  return { deliveries, delivered };
}

export async function deliverCancellationNotifications(bookingId: string, reason: string) {
  const { admin,booking, salon, style, stylist, stylistContact,customerLocale,salonLocale } = await bookingNotificationContext(bookingId);
  const stylistLocale=stylistContact?.locale||salonLocale;
  const notification=await bookingNotificationSettings(admin,[customerLocale,salonLocale,stylistLocale]);
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const service = String(style?.name || "Braiding service");
  const refundAmount=`$${Number(booking.refund_amount || 0).toFixed(2)}`;
  const refundMessage = booking.refund_status === "Succeeded"
    ? renderNotificationText(notification.translations,customerLocale,"notification.booking.refund.succeeded",`Your ${refundAmount} reservation deposit was refunded in full.`,{refund_amount:refundAmount})
    : renderNotificationText(notification.translations,customerLocale,"notification.booking.refund.none","No deposit refund was due for this booking.");
  const customer=String(booking.guest_name||"A customer");const stylistClause=stylist?.name?` with ${stylist.name}`:"";
  const variables={service,salon:String(salon.name||""),when,stylist_clause:stylistClause,reason,refund_message:refundMessage,customer};
  const message=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_cancelled.summary",`Your ${service} appointment at ${salon.name} for ${when}${stylistClause} was cancelled. Reason: ${reason}. ${refundMessage}`,variables);
  const businessMessage=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_cancelled.summary",`${customer}'s ${service} appointment for ${when}${stylistClause} was cancelled. Reason: ${reason}.`,variables);
  const stylistMessage=renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_cancelled.summary",businessMessage,variables);
  const root=(process.env.NEXT_PUBLIC_SITE_URL||"https://girlzculture.com").replace(/\/$/,"");
  const customerEmail=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_cancelled",{message,browse_url:`${root}/salons`},notification.customerCancelled,`Your appointment was cancelled.\n\n${message}\n\nWe are sorry for the disruption. Find another available salon: ${root}/salons`);
  const salonEmail=renderNotificationEmail(notification.templates,notification.translations,salonLocale,"booking.salon_cancelled",{message:businessMessage},notification.salonCancelled,`A booking was cancelled.\n\n${businessMessage}`);
  const stylistEmail=renderNotificationEmail(notification.templates,notification.translations,stylistLocale,"booking.stylist_cancelled",{message:stylistMessage},"An assigned Girlz Culture booking was cancelled",`An assigned booking was cancelled.\n\n${stylistMessage}`);
  const tasks: DeliveryTask[] = [
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), customerEmail.subject, customerEmail.html, "bookings") },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_cancelled.sms",`Girlz Culture: ${message}`,{message})) },
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), salonEmail.subject, salonEmail.html, "bookings") },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_cancelled.sms",`Girlz Culture: ${businessMessage}`,{message:businessMessage})) },
    { recipientType: "salon", channel: "push", destination: String(salon.user_id || ""), run: () => sendPushToUsers([String(salon.user_id || "")], { title: renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_cancelled.push_title","Booking cancelled"), body: businessMessage, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) },
  ];
  if (booking.customer_id) tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_cancelled.push_title","Appointment cancelled"), body: message, url: "/account?tab=past", tag: `booking-${booking.id}`, requireInteraction: true }) });
  if (stylistContact?.email) tasks.push({ recipientType: "stylist", channel: "email", destination: stylistContact.email, run: () => sendEmail(stylistContact.email, stylistEmail.subject, stylistEmail.html, "bookings") });
  if (stylistContact?.phone) tasks.push({ recipientType: "stylist", channel: "sms", destination: stylistContact.phone, run: () => sendSms(stylistContact.phone, renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_cancelled.sms",`Girlz Culture: ${stylistMessage}`,{message:stylistMessage})) });
  if (stylistContact?.userId) tasks.push({ recipientType: "stylist", channel: "push", destination: stylistContact.userId, run: () => sendPushToUsers([stylistContact.userId], { title: renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_cancelled.push_title","Assigned booking cancelled"), body: stylistMessage, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) });
  return { deliveries: await runDeliveries(bookingId, "booking_cancelled", tasks.filter(task=>notification.channels.has(task.channel))) };
}

export async function deliverBookingReminder(bookingId:string,reminderHours:number){
  const{admin,booking,salon,style,stylist,stylistContact,customerLocale,salonLocale}=await bookingNotificationContext(bookingId);
  const stylistLocale=stylistContact?.locale||salonLocale;
  if(String(booking.status||"").toLowerCase()!=="confirmed")return{skipped:true,reason:"Booking is no longer confirmed."};
  const notification=await bookingNotificationSettings(admin,[customerLocale,salonLocale,stylistLocale]);
  const when=formatInTimeZone(booking.appointment_datetime,salon.time_zone);
  const service=String(style?.name||"Braiding service");
  const root=(process.env.NEXT_PUBLIC_SITE_URL||"https://girlzculture.com").replace(/\/$/,"");
  const customer=String(booking.guest_name||"A customer");const stylistClause=stylist?.name?` with ${stylist.name}`:"";const variables={service,salon:String(salon.name||""),when,stylist_clause:stylistClause,customer};
  const summary=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_reminder.summary",`Reminder: ${service} at ${salon.name} is scheduled for ${when}${stylistClause}.`,variables);
  const salonSummary=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_reminder.summary",`Reminder: ${customer}'s ${service} appointment is scheduled for ${when}${stylistClause}.`,variables);
  const stylistSummary=renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_reminder.summary",salonSummary,variables);
  const accountUrl=`${root}/account?tab=upcoming`;const dashboardUrl=`${root}/salon/dashboard/bookings?booking=${booking.id}`;
  const customerEmail=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_reminder",{summary,account_url:accountUrl},notification.reminderSubject,`Appointment reminder.\n\n${summary}\n\nView your booking: ${accountUrl}`);
  const salonEmail=renderNotificationEmail(notification.templates,notification.translations,salonLocale,"booking.salon_reminder",{summary:salonSummary,dashboard_url:dashboardUrl},"Upcoming Girlz Culture appointment",`Appointment reminder.\n\n${salonSummary}\n\nOpen booking: ${dashboardUrl}`);
  const stylistEmail=renderNotificationEmail(notification.templates,notification.translations,stylistLocale,"booking.stylist_reminder",{summary:stylistSummary},"Upcoming assigned appointment",`Appointment reminder.\n\n${stylistSummary}`);
  const tasks:DeliveryTask[]=[
    {recipientType:"customer",channel:"email",destination:String(booking.guest_email||""),run:()=>sendEmail(String(booking.guest_email||""),customerEmail.subject,customerEmail.html,"bookings")},
    {recipientType:"customer",channel:"sms",destination:String(booking.guest_phone||""),run:()=>sendSms(String(booking.guest_phone||""),renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_reminder.sms",`Girlz Culture: ${summary}`,{summary}))},
    {recipientType:"salon",channel:"email",destination:String(salon.email||""),run:()=>sendEmail(String(salon.email||""),salonEmail.subject,salonEmail.html,"bookings")},
    {recipientType:"salon",channel:"sms",destination:String(salon.phone||""),run:()=>sendSms(String(salon.phone||""),renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_reminder.sms",`Girlz Culture: ${salonSummary}`,{summary:salonSummary}))},
    {recipientType:"salon",channel:"push",destination:String(salon.user_id||""),run:()=>sendPushToUsers([String(salon.user_id||"")],{title:renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_reminder.push_title","Upcoming appointment"),body:salonSummary,url:`/salon/dashboard/bookings?booking=${booking.id}`,tag:`booking-reminder-${booking.id}-${reminderHours}h`})},
  ];
  if(booking.customer_id)tasks.push({recipientType:"customer",channel:"push",destination:String(booking.customer_id),run:()=>sendPushToUsers([String(booking.customer_id)],{title:renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_reminder.push_title","Appointment reminder"),body:summary,url:"/account?tab=upcoming",tag:`booking-reminder-${booking.id}-${reminderHours}h`})});
  if(stylistContact?.email)tasks.push({recipientType:"stylist",channel:"email",destination:stylistContact.email,run:()=>sendEmail(stylistContact.email,stylistEmail.subject,stylistEmail.html,"bookings")});
  if(stylistContact?.phone)tasks.push({recipientType:"stylist",channel:"sms",destination:stylistContact.phone,run:()=>sendSms(stylistContact.phone,renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_reminder.sms",`Girlz Culture: ${stylistSummary}`,{summary:stylistSummary}))});
  if(stylistContact?.userId)tasks.push({recipientType:"stylist",channel:"push",destination:stylistContact.userId,run:()=>sendPushToUsers([stylistContact.userId],{title:renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_reminder.push_title","Upcoming assigned appointment"),body:stylistSummary,url:`/salon/dashboard/bookings?booking=${booking.id}`,tag:`booking-reminder-${booking.id}-${reminderHours}h`})});
  return{deliveries:await runDeliveries(bookingId,`booking_reminder_${reminderHours}h`,tasks.filter(task=>notification.channels.has(task.channel)))};
}

export async function processBookingReminders(){
  const admin=getSupabaseAdmin();const notification=await bookingNotificationSettings(admin);const now=Date.now();const results:Array<Record<string,unknown>>=[];
  for(const reminderHours of notification.reminderHours){
    const target=now+reminderHours*60*60*1000;const from=new Date(target-10*60*1000).toISOString();const to=new Date(target+20*60*1000).toISOString();
    const{data:bookings,error}=await admin.from("bookings").select("id,appointment_datetime").eq("status","Confirmed").gte("appointment_datetime",from).lt("appointment_datetime",to).order("appointment_datetime").limit(250);
    if(error)throw error;
    for(const booking of bookings||[]){
      const claim=await admin.rpc("claim_booking_reminder",{p_booking_id:booking.id,p_reminder_hours:reminderHours});
      if(claim.error)throw claim.error;if(claim.data!==true)continue;
      try{const delivery=await deliverBookingReminder(booking.id,reminderHours);await admin.from("booking_reminder_claims").update({completed_at:new Date().toISOString(),error_message:null}).eq("booking_id",booking.id).eq("reminder_hours",reminderHours);results.push({bookingId:booking.id,reminderHours,status:"processed",delivery});}
      catch(error){const message=error instanceof Error?error.message:"Reminder failed";await admin.from("booking_reminder_claims").update({error_message:message}).eq("booking_id",booking.id).eq("reminder_hours",reminderHours);console.error("Booking reminder delivery failed",{bookingId:booking.id,reminderHours,error});results.push({bookingId:booking.id,reminderHours,status:"failed"});}
    }
  }
  return{configuredHours:notification.reminderHours,processed:results.length,results};
}
