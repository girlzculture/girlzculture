import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { getSupabaseAdmin, sendEmail, sendSms } from "@/lib/supabaseAdmin";
import { sendPushToUsers } from "@/lib/webPushServer";

type Row = Record<string, unknown>;
type Role = "customer" | "salon" | "admin";

async function identity(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in to view booking messages.");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session has expired. Please sign in again.");
  return { admin, user: data.user };
}

async function accessForBooking(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, email: string, bookingId: string) {
  const { data: booking, error } = await admin.from("bookings").select("*,salon:salons(id,name,slug,email,phone,user_id,cover_photo_url),style:styles(name)").eq("id", bookingId).single();
  if (error || !booking) throw new Error("Booking not found.");
  if (booking.customer_id === userId) return { booking, role: "customer" as Role };
  const [{ data: team }, { data: adminUsers }] = await Promise.all([
    admin.from("salon_team_members").select("id,permissions,status").eq("salon_id", booking.salon_id).eq("user_id", userId).in("status", ["Invited", "Active"]).limit(1).maybeSingle(),
    admin.from("admin_users").select("permissions,is_super_admin,status").ilike("email", email).in("status", ["Invited", "Active"]),
  ]);
  const salon = booking.salon as Row | null;
  if (salon?.user_id === userId || (team && Boolean((team.permissions as Row | null)?.bookings))) return { booking, role: "salon" as Role };
  const platformAdmin = (adminUsers || []).find((row) => row.is_super_admin || Boolean((row.permissions as Row | null)?.support));
  if (platformAdmin) return { booking, role: "admin" as Role };
  throw new Error("You do not have access to this booking conversation.");
}

async function authorizedBookings(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, email: string) {
  const [{ data: owned }, { data: team }, { data: adminUsers }] = await Promise.all([
    admin.from("salons").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    admin.from("salon_team_members").select("salon_id,permissions").eq("user_id", userId).in("status", ["Invited", "Active"]).limit(1).maybeSingle(),
    admin.from("admin_users").select("permissions,is_super_admin,status").ilike("email", email).in("status", ["Invited", "Active"]),
  ]);
  const platformAdmin = (adminUsers || []).some((row) => row.is_super_admin || Boolean((row.permissions as Row | null)?.support));
  let query = admin.from("bookings").select("*,salon:salons(id,name,slug,cover_photo_url),style:styles(name)").order("appointment_datetime", { ascending: false }).limit(platformAdmin ? 300 : 100);
  let role: Role = "customer";
  if (platformAdmin) role = "admin";
  else if (owned?.id) { role = "salon"; query = query.eq("salon_id", owned.id); }
  else if (team?.salon_id && Boolean((team.permissions as Row | null)?.bookings)) { role = "salon"; query = query.eq("salon_id", team.salon_id); }
  else query = query.eq("customer_id", userId);
  const { data, error } = await query;
  if (error) throw error;
  return { bookings: data || [], role };
}

async function GETHandler(request: Request) {
  try {
    const { admin, user } = await identity(request);
    const url = new URL(request.url);
    const requestedBookingId = cleanText(url.searchParams.get("booking_id"), 60);
    if (requestedBookingId) {
      const access = await accessForBooking(admin, user.id, user.email || "", requestedBookingId);
      const { data: messages, error } = await admin.from("booking_messages").select("*").eq("booking_id", requestedBookingId).order("created_at");
      if (error) throw error;
      const readColumn = access.role === "customer" ? "read_by_customer_at" : "read_by_salon_at";
      await admin.from("booking_messages").update({ [readColumn]: new Date().toISOString() }).eq("booking_id", requestedBookingId).neq("sender_role", access.role).is(readColumn, null);
      return Response.json({ role: access.role, booking: access.booking, messages: messages || [] });
    }
    const access = await authorizedBookings(admin, user.id, user.email || "");
    const ids = access.bookings.map((booking) => booking.id).filter(Boolean);
    const { data: messages, error } = ids.length
      ? await admin.from("booking_messages").select("*").in("booking_id", ids).order("created_at", { ascending: false }).limit(1000)
      : { data: [], error: null };
    if (error) throw error;
    const grouped = new Map<string, Row[]>();
    for (const message of messages || []) grouped.set(message.booking_id, [...(grouped.get(message.booking_id) || []), message]);
    const threads = access.bookings
      .filter((booking) => access.role !== "admin" || grouped.has(booking.id))
      .map((booking) => ({ booking, messages: grouped.get(booking.id) || [] }));
    return Response.json({ role: access.role, threads });
  } catch (error) {
    noteOperationalFailure("Booking message load failed", error);
    return errorResponse(error, "Unable to load booking messages.");
  }
}

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "booking-message", 20, 60_000);
    const { admin, user } = await identity(request);
    const body = await request.json() as Row;
    const bookingId = cleanText(body.booking_id, 60);
    const messageBody = cleanText(body.body, 2000);
    if (!bookingId || !messageBody) throw new Error("Enter a message before sending.");
    const access = await accessForBooking(admin, user.id, user.email || "", bookingId);
    const now = new Date().toISOString();
    const { data: message, error } = await admin.from("booking_messages").insert({
      booking_id: bookingId,
      salon_id: access.booking.salon_id,
      sender_user_id: user.id,
      sender_role: access.role,
      body: messageBody,
      ...(access.role === "customer" ? { read_by_customer_at: now } : { read_by_salon_at: now }),
    }).select().single();
    if (error) throw error;

    const salon = access.booking.salon as Row;
    const preview = messageBody.length > 140 ? `${messageBody.slice(0, 137)}...` : messageBody;
    const root = (process.env.NEXT_PUBLIC_SITE_URL || "https://girlzculture.com").replace(/\/$/, "");
    let recipientIds: string[] = [];
    const warningReferences: string[] = [];
    if (access.role === "customer") {
      const { data: team } = await admin.from("salon_team_members").select("user_id,email,phone,permissions").eq("salon_id", access.booking.salon_id).eq("status", "Active");
      const eligibleTeam = (team || []).filter((row) => Boolean((row.permissions as Row | null)?.bookings));
      recipientIds = [String(salon.user_id || ""), ...eligibleTeam.map((row) => String(row.user_id || ""))].filter(Boolean);
      const deliveries = await Promise.allSettled([
        sendEmail(String(salon.email || ""), "New customer booking message", `<h1>New booking message</h1><p>${preview}</p><p><a href="${root}/salon/dashboard/messages">Reply in Girlz Culture</a></p>`, "bookings"),
        sendSms(String(salon.phone || ""), `Girlz Culture booking message: ${preview} ${root}/salon/dashboard/messages`),
      ]);
      for (const failure of deliveries.filter((result) => result.status === "rejected")) {
        warningReferences.push(await capturePlatformError({
          request, admin, error: failure.reason, feature: "booking-messages",
          action: "deliver-salon-message-notification", actorRole: access.role,
          actorId: user.id, salonId: String(access.booking.salon_id),
          recordType: "booking", recordId: bookingId, provider: "transactional-notifications",
          safeMessage: "The message was saved, but one notification could not be delivered.",
        }));
      }
    } else {
      recipientIds = access.booking.customer_id ? [String(access.booking.customer_id)] : [];
      const deliveries = await Promise.allSettled([
        sendEmail(String(access.booking.guest_email || ""), `New message from ${String(salon.name || "your salon")}`, `<h1>New booking message</h1><p>${preview}</p><p><a href="${root}/account?tab=inbox">Reply in Girlz Culture</a></p>`, "bookings"),
        sendSms(String(access.booking.guest_phone || ""), `Girlz Culture booking message: ${preview} ${root}/account?tab=inbox`),
      ]);
      for (const failure of deliveries.filter((result) => result.status === "rejected")) {
        warningReferences.push(await capturePlatformError({
          request, admin, error: failure.reason, feature: "booking-messages",
          action: "deliver-customer-message-notification", actorRole: access.role,
          actorId: user.id, salonId: String(access.booking.salon_id),
          recordType: "booking", recordId: bookingId, provider: "transactional-notifications",
          safeMessage: "The message was saved, but one notification could not be delivered.",
        }));
      }
    }
    if (recipientIds.length) {
      const recipientRole = access.role === "customer" ? "salon" : "customer";
      await admin.from("notifications").insert(recipientIds.map((userId) => ({
        user_id: userId,
        salon_id: access.booking.salon_id,
        booking_id: bookingId,
        recipient_role: recipientRole,
        category: "messages",
        severity: "info",
        dedupe_key: `booking-message:${bookingId}:${recipientRole}`,
        channel: "in_app",
        title: "New booking message",
        body: preview,
        action_url: recipientRole === "salon" ? "/salon/dashboard/messages" : "/account?tab=inbox",
        delivery_status: "delivered",
      })));
      try {
        const pushResult=await sendPushToUsers(recipientIds, { title: "New booking message", body: preview, url: access.role === "customer" ? "/salon/dashboard/messages" : "/account?tab=inbox", tag: `message-${bookingId}` });
        for(const warning of pushResult.warnings||[]){
          if(warning.request_id)warningReferences.push(warning.request_id);
        }
      } catch (pushError) {
        warningReferences.push(await capturePlatformError({
          request, admin, error: pushError, feature: "booking-messages",
          action: "deliver-push-notification", actorRole: access.role,
          actorId: user.id, salonId: String(access.booking.salon_id),
          recordType: "booking", recordId: bookingId, provider: "web-push",
          safeMessage: "The message was saved, but its push notification could not be delivered.",
        }));
      }
    }
    return Response.json({
      message,
      warnings: warningReferences.map((reference) => ({
        message: `A notification could not be delivered. Reference ${reference}.`,
        request_id: reference,
      })),
    });
  } catch (error) {
    noteOperationalFailure("Booking message send failed", error);
    return errorResponse(error, "Unable to send booking message.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/messages", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/messages", "POST"), POSTHandler);
