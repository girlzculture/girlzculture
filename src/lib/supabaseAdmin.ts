import { createClient } from "@supabase/supabase-js";

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
  const row = (rows || []).find(candidate => candidate.email?.trim().toLowerCase() === normalizedEmail && candidate.status === "Active");
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
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Girlz Culture <notifications@girlzculture.com>", to, subject, html }),
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

export async function deliverBookingNotifications(bookingId:string){
  const admin=getSupabaseAdmin();
  const {data:booking}=await admin.from("bookings").select("*").eq("id",bookingId).single();
  if(!booking)throw new Error("Booking not found");
  if(booking.notifications_sent_at)return {alreadySent:true};
  const [{data:salon},{data:style},{data:stylist}]=await Promise.all([admin.from("salons").select("name,email,phone,notification_preferences").eq("id",booking.salon_id).single(),admin.from("styles").select("name").eq("id",booking.style_id).maybeSingle(),booking.stylist_id?admin.from("stylists").select("name").eq("id",booking.stylist_id).maybeSingle():Promise.resolve({data:null})]);
  if(!salon)throw new Error("Salon not found");
  const preferences=salon.notification_preferences||{email:true,sms:true};
  const when=new Date(booking.appointment_datetime).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"});
  const summary=`${style?.name||"Service"} on ${when}${stylist?.name?` with ${stylist.name}`:""}. Deposit: $${Number(booking.deposit_amount||0).toFixed(2)}.`;
  const deliveries=await Promise.allSettled([preferences.email===false?Promise.resolve({skipped:true}):sendEmail(salon.email,"New Girlz Culture booking",`<h1>New booking for ${salon.name}</h1><p>${summary}</p><p>Open your dashboard to confirm or manage it.</p>`),preferences.sms===false?Promise.resolve({skipped:true}):sendSms(salon.phone,`Girlz Culture: New booking — ${summary}`)]);
  await admin.from("bookings").update({notifications_sent_at:new Date().toISOString()}).eq("id",bookingId).is("notifications_sent_at",null);
  return {deliveries:deliveries.map(item=>item.status)};
}
