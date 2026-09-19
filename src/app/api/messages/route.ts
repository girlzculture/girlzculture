import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { cleanText, enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { getSupabaseAdmin, deliverBookingMessageNotifications } from "@/lib/supabaseAdmin";

import { generateTranslationDraft } from "@/lib/aiAutomationServer";
import { normalizeLocale } from "@/i18n/catalog";
import { translatedMessageFields } from "@/lib/localizationCore";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { bookingMessageTranslation } from "@/lib/bookingMessageTranslationServer";
import { translationProviderFailure } from "@/lib/translationProviderErrors";

import { bookingConversationWindow } from "@/lib/bookingConversation";

type Row = Record<string, unknown>;
type Role = "customer" | "salon" | "admin";
async function messageFailure(request: Request, error: unknown) {
  if (error instanceof RateLimitError) return Response.json({ code: "MESSAGE_RATE_LIMIT" }, { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "private, no-store" } });
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (["MESSAGE_CONVERSATION_CLOSED", "MESSAGE_ACCESS_DENIED"].includes(message)) return Response.json({ code: message }, { status: message === "MESSAGE_ACCESS_DENIED" ? 403 : 409, headers: { "Cache-Control": "private, no-store" } });
  const translation = translationProviderFailure(error);
  if (translation) {
    const reference = await capturePlatformError({ request, error, feature: "booking-messages", action: "translation", actorRole: "authenticated", safeMessage: translation.error });
    return safeFailure(translation.error, reference, translation.status, { code: translation.code });
  }
  const known: Record<string, [string, number]> = {
    "Sign in to view booking messages.": ["AUTH_REQUIRED", 401], "Your session has expired. Please sign in again.": ["AUTH_REQUIRED", 401],
    "Forbidden": ["MESSAGE_ACCESS_DENIED", 403], "You do not have access to this booking conversation.": ["MESSAGE_ACCESS_DENIED", 403],
    "Booking not found.": ["MESSAGE_NOT_FOUND", 404], "Preview the translation before sending it.": ["MESSAGE_PREVIEW_REQUIRED", 400],
  };
  if (known[message]) return Response.json({ code: known[message][0] }, { status: known[message][1], headers: { "Cache-Control": "private, no-store" } });
  if (error instanceof SyntaxError) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
  const reference = await capturePlatformError({ request, error, feature: "booking-messages", action: request.method.toLowerCase(), actorRole: "authenticated", safeMessage: "Booking messages are temporarily unavailable." });
  return safeFailure("Booking messages are temporarily unavailable.", reference, 503, { code: "MESSAGE_UNAVAILABLE" });
}

async function identity(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in to view booking messages.");
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Your session has expired. Please sign in again.");
  const canonical = await admin.from("platform_identities").select("status,email_normalized").eq("user_id", data.user.id).maybeSingle();
  if (canonical.error) throw canonical.error;
  if (!canonical.data || canonical.data.status !== "Active" || canonical.data.email_normalized !== data.user.email?.trim().toLowerCase()) throw new Error("Forbidden");
  return { admin, user: data.user };
}

async function messageScope(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, email: string) {
  const canonical = await admin.from("platform_identities").select("primary_role,status,email_normalized").eq("user_id", userId).maybeSingle();
  if (canonical.error) throw canonical.error;
  if (!canonical.data || canonical.data.status !== "Active" || canonical.data.email_normalized !== email.trim().toLowerCase()) throw new Error("Forbidden");
  const [owned, team, admins] = await Promise.all([
    admin.from("salons").select("id").eq("user_id", userId).limit(1).maybeSingle(),
    admin.from("salon_team_members").select("salon_id,stylist_id,permissions,status").eq("user_id", userId).eq("status", "Active").limit(1).maybeSingle(),
    admin.from("admin_users").select("permissions,is_super_admin,status").eq("user_id", userId).ilike("email", email).eq("status", "Active"),
  ]);
  for (const result of [owned, team, admins]) if (result.error) throw result.error;
  const primary = canonical.data.primary_role;
  if (primary === "salon_owner" && owned.data?.id) return { role: "salon" as Role, salonId: owned.data.id, stylistId: null, customerId: null };
  if (primary === "salon_team" && team.data?.salon_id && Boolean((team.data.permissions as Row)?.bookings)) return { role: "salon" as Role, salonId: team.data.salon_id, stylistId: team.data.stylist_id, customerId: null };
  if (primary === "customer") return { role: "customer" as Role, salonId: null, stylistId: null, customerId: userId };
  if (primary === "admin" && (admins.data || []).some(row => row.is_super_admin || Boolean((row.permissions as Row)?.support))) return { role: "admin" as Role, salonId: null, stylistId: null, customerId: null };
  throw new Error("Forbidden");
}
function bookingQuery(admin: ReturnType<typeof getSupabaseAdmin>, scope: Awaited<ReturnType<typeof messageScope>>) {
  let query = admin.from("bookings").select("*,salon:salons(id,name,slug,cover_photo_url,time_zone),style:styles(name)");
  if (scope.salonId) query = query.eq("salon_id", scope.salonId);
  if (scope.stylistId) query = query.eq("stylist_id", scope.stylistId);
  if (scope.customerId) query = query.eq("customer_id", scope.customerId);
  return query;
}
async function accessForBooking(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, email: string, bookingId: string) {
  const scope = await messageScope(admin, userId, email);
  const result = await bookingQuery(admin, scope).eq("id", bookingId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Forbidden");
  return { booking: result.data, role: scope.role };
}
async function authorizedBookings(admin: ReturnType<typeof getSupabaseAdmin>, userId: string, email: string) {
  const scope = await messageScope(admin, userId, email);
  const bookings = await messagePages(() => bookingQuery(admin, scope).order("appointment_datetime", { ascending: false }).order("id"));
  return { bookings, role: scope.role };
}
// Stable ordering, explicit pages and a fail-closed bound avoid silent provider caps.
async function messagePages(query: () => ReturnType<ReturnType<ReturnType<typeof getSupabaseAdmin>["from"]>["select"]>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const result = await query().range(offset, offset + 999);
    if (result.error) throw result.error;
    rows.push(...((result.data || []) as Row[]));
    if ((result.data || []).length < 1000) return rows;
  }
  throw new Error("MESSAGE_PAGE_LIMIT");
}

async function GETHandler(request: Request) {
  try {
    const { admin, user } = await identity(request);
    const url = new URL(request.url);
    const requestedBookingId = cleanText(url.searchParams.get("booking_id"), 60);
    if (requestedBookingId) {
      const access = await accessForBooking(admin, user.id, user.email || "", requestedBookingId);
      const welcome = await admin.from("booking_conversation_events").select("event_type,facts,created_at").eq("booking_id", requestedBookingId).maybeSingle();
      if (welcome.error) throw welcome.error;
      const messages = await messagePages(() => admin.from("booking_messages").select("*").eq("booking_id", requestedBookingId).order("created_at").order("id"));
      const readAt = new Date().toISOString();
      const readColumn = access.role === "customer" ? "read_by_customer_at" : "read_by_salon_at";
      if (access.role !== "admin") {
        const marked = await admin.from("booking_messages").update({ [readColumn]: readAt }).eq("booking_id", requestedBookingId).neq("sender_role", access.role).is(readColumn, null);
        if (marked.error) throw marked.error;
      }
      return Response.json({ role: access.role, booking: access.booking, messages: messages.map(message => access.role !== "admin" && message.sender_role !== access.role && !message[readColumn] ? { ...message, [readColumn]: readAt } : message), welcome: welcome.data, conversation: bookingConversationWindow(access.booking) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const access = await authorizedBookings(admin, user.id, user.email || "");
    const ids = access.bookings.map((booking) => booking.id).filter(Boolean);
    const messages: Row[] = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batch = ids.slice(offset, offset + 200);
      messages.push(...await messagePages(() => admin.from("booking_messages").select("*").in("booking_id", batch).order("created_at", { ascending: false }).order("id")));
    }
    const grouped = new Map<string, Row[]>();
    for (const message of messages || []) grouped.set(String(message.booking_id), [...(grouped.get(String(message.booking_id)) || []), message]);
    const threads = access.bookings

      .map((booking) => ({ booking, messages: grouped.get(String(booking.id)) || [], conversation: bookingConversationWindow(booking) }));
    return Response.json({ role: access.role, threads }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    noteOperationalFailure("Booking message load failed", error);
    return messageFailure(request, error);
  }
}

async function POSTHandler(request: Request) {
  try {
    const { admin, user } = await identity(request);
    const body = await request.json() as Row;
    if (!body || typeof body !== "object" || Array.isArray(body) || (body.action !== undefined && !["translate_display", "translate_preview"].includes(String(body.action)))) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
    enforceRateLimit(request, `${body.action === "translate_display" ? "booking-message-display" : "booking-message"}:${user.id}`, body.action === "translate_display" ? 60 : 20, 60_000);
    const bookingId = cleanText(body.booking_id, 60);
    if (body.action === "translate_display") {
      const access = await accessForBooking(admin, user.id, user.email || "", bookingId);
      const messageId = cleanText(body.message_id, 36);
      if (!/^[0-9a-f-]{36}$/i.test(messageId)) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
      const salon = access.booking.salon as Row | null; const style = access.booking.style as Row | null;
      const names = [salon?.name, style?.name, access.booking.guest_name].filter((name): name is string => typeof name === "string" && Boolean(name));
      if (access.booking.customer_id) {
        const customer = await admin.from("customers").select("name").eq("id", access.booking.customer_id).maybeSingle();
        if (customer.error) throw customer.error;
        if (customer.data?.name) names.push(customer.data.name);
      }
      const translation = await bookingMessageTranslation({ admin, messageId, bookingId, locale: normalizeLocale(body.locale || user.user_metadata?.locale), userId: user.id, names });
      return Response.json({ translation }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const messageBody = typeof body.body === "string" ? body.body : "";
    if (messageBody.length > 2000 || !messageBody.trim()) return Response.json({ code: "MESSAGE_INVALID", error: "Enter a message of up to 2,000 characters." }, { status: 400 });
    if (!bookingId || !messageBody) throw new Error("Enter a message before sending.");
    const access = await accessForBooking(admin, user.id, user.email || "", bookingId);
    if (access.booking.booking_origin === "business_added" && !access.booking.customer_id) return Response.json({ code: "MESSAGE_CUSTOMER_PARTICIPANT_REQUIRED" }, { status: 409 });
    if (access.role === "admin") throw new Error("Forbidden");
    // Allow acknowledgement of a previously saved request after closure, never a new send.
    if (body.client_request_id != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.client_request_id))) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
    if (body.action === undefined && body.client_request_id) {
      const prior = await admin.from("booking_messages").select("*").eq("sender_user_id", user.id).eq("client_request_id", body.client_request_id).maybeSingle();
      if (prior.error) throw prior.error;
      if (prior.data) {
        if (prior.data.booking_id !== bookingId || prior.data.original_body !== messageBody || (prior.data.source_locale ?? null) !== (body.source_locale ?? null)) return Response.json({ code: "MESSAGE_IDEMPOTENCY_CONFLICT" }, { status: 409 });
        if (!bookingConversationWindow(access.booking).open) return Response.json({ message: prior.data, warnings: [], replayed: true }, { headers: { "Cache-Control": "private, no-store" } });
      }
    }
    if (!bookingConversationWindow(access.booking).open) return Response.json({ code: "MESSAGE_CONVERSATION_CLOSED", conversation: bookingConversationWindow(access.booking) }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    const moderation = await moderatePublicContent(admin, { body: messageBody });
    if (!moderation.allowed) {
      return Response.json(
        { code: "MESSAGE_CONTENT_REVIEW_REQUIRED" },
        { status: 400 },
      );
    }
    if (body.action === "translate_preview") {
      const targetLocale = normalizeLocale(body.target_locale);
      if (!["en", "fr", "es", "wo", "zh-CN"].includes(targetLocale)) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
      const { data: feature, error: featureError } = await admin
        .from("ai_automation_features")
        .select("*")
        .eq("feature_key", "translation_drafts")
        .single();
      if (featureError || !feature)
        throw featureError || new Error("Message translation is unavailable.");
      const generated = await generateTranslationDraft(
        admin,
        feature,
        user.id,
        messageBody,
        targetLocale,
      );
      return Response.json({
        preview: {
          original: messageBody,
          translated: generated.translatedText,
          locale: targetLocale,
          provider: generated.provider,
        },
      });
    }
    const translatedBody = cleanText(body.translated_body, 2000);
    const translationLocale = translatedBody
      ? normalizeLocale(body.translation_locale)
      : "";
    if (translatedBody && body.translation_previewed !== true)
      throw new Error("Preview the translation before sending it.");
    const now = new Date().toISOString();
    const clientRequestId = body.client_request_id == null ? null : String(body.client_request_id);
    if (clientRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientRequestId)) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
    const translatedFields = translatedMessageFields({
      original: messageBody,
      translated: translatedBody,
      locale: translationLocale,
      provider: cleanText(body.translation_provider, 40),
      previewed: body.translation_previewed === true,
      now,
    });
    const sourceLocale = body.source_locale ?? null;
    if (sourceLocale !== null && !["en", "fr", "wo", "es", "zh-CN"].includes(String(sourceLocale))) return Response.json({ code: "MESSAGE_INVALID" }, { status: 400 });
    const inserted = await admin.from("booking_messages").insert({
      booking_id: bookingId,
      salon_id: access.booking.salon_id,
      sender_user_id: user.id,
      sender_role: access.role,
      client_request_id: clientRequestId,
      source_locale: sourceLocale,
      source_locale_provenance: sourceLocale ? "sender_selected" : "unknown",
      ...translatedFields,
      ...(access.role === "customer" ? { read_by_customer_at: now } : { read_by_salon_at: now }),
    }).select().single();
    let message = inserted.data;
    const error = inserted.error;
    let replayed = false;
    if (error?.code === "23505" && clientRequestId) {
      const prior = await admin.from("booking_messages").select("*").eq("sender_user_id", user.id).eq("client_request_id", clientRequestId).maybeSingle();
      if (prior.error) throw prior.error;
      if (prior.data?.booking_id !== bookingId || prior.data?.original_body !== messageBody || (prior.data?.source_locale ?? null) !== sourceLocale) return Response.json({ code: "MESSAGE_IDEMPOTENCY_CONFLICT" }, { status: 409 });
      message = prior.data; replayed = true;
    }
    if (error && !replayed) throw error;
    if (!message) throw new Error("MESSAGE_PERSISTENCE_UNVERIFIED");

    let warnings: { code: string; request_id: string }[] = [];
    try { warnings = (await deliverBookingMessageNotifications(message.id)).warnings; }
    catch (error) {
      warnings = [{ code: "MESSAGE_NOTIFICATION_FAILED", request_id: await capturePlatformError({ request, admin, error, feature: "booking-messages", action: "message-notification", actorRole: access.role, safeMessage: "The message was saved, but a notification could not be delivered." }) }];
    }
    return Response.json({ message, warnings, replayed }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    noteOperationalFailure("Booking message send failed", error);
    return messageFailure(request, error);
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/messages", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/messages", "POST"), POSTHandler);
