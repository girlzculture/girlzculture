import {isSampleEmail,isSamplePhone} from '@/lib/demoWorkspace';
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { formatInTimeZone } from "@/lib/dateTime";
import { sendPushToUsers } from "@/lib/webPushServer";
import { assertAuthorizedAdminUser } from "@/lib/adminSecurityServer";
import { ENGLISH_MESSAGES, normalizeLocale } from "@/i18n/catalog";
import { reminderTranslation, reminderDate, reminderStylistClause } from "@/lib/bookingReminderCopy";
import {bookingCommunicationPreferences,communicationUnsubscribeToken} from "@/lib/businessCommunicationServer";
import {bookingFollowupCopy} from "@/lib/bookingFollowupCopy";
import {salonPublicPath} from "@/lib/salonVanity";
import { capturePlatformError } from "@/lib/platformErrors";
import { shouldCaptureProviderResponse } from "@/lib/operationalMonitoringCore";
import { noteOperationalFailure } from "@/lib/operationalTelemetryContext";
import {
  renderBookingCancellation,
  renderCustomerBookingConfirmation,
  renderSalonBookingConfirmation,
  type BookingCommunicationInput,
} from "@/lib/bookingCommunications";
import { issueGuestBookingToken } from "@/lib/guestBookingAccess";
import { getPublishedBrandAsset } from "@/lib/brandAssets";
import { assertRoleSurfaceHost } from "@/lib/hostRouting";
import { bookingReference } from "@/lib/bookingReference";
import { authorizedMessageRecipients } from "@/lib/bookingMessageRecipientsServer";
import {
  accessibleSurfaceColor,
  accessibleTextColor,
  hasMinimumContrastOnAll,
} from "@/lib/colorContrast";
import { NON_DOM_VISUAL_TOKENS } from "@/lib/nonDomVisualTokens.mjs";
import {
  cancellationActorLabel,
  refundCustomerSummary,
  safeCancellationReason,
} from "@/lib/bookingCancellation";
import {
  classifySupabaseAuthFailure,
  retryTransientAuthOperation,
} from "@/lib/authSessionCore";
import { notificationDeliveryKey, runIsolatedReminderBatch, type ReminderStage } from "@/lib/bookingReminderCore";
import {
  isActiveSalonTeamMembership,
  resolveSalonIdentityScope,
} from "@/lib/salonAuthorizationCore";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function monitoredSupabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    noteOperationalFailure(
      "Supabase provider network request failed",
      Object.assign(new Error("SUPABASE_PROVIDER_NETWORK_FAILURE"), {
        provider: "supabase",
        code: error instanceof Error && error.name === "TimeoutError"
          ? "TIMEOUT"
          : "NETWORK",
      }),
    );
    throw error;
  }
  if (!response.ok) {
    let code = "";
    let message = "";
    try {
      const payload = await response.clone().json() as Record<string, unknown>;
      code = String(payload.code || payload.error_code || "").slice(0, 80);
      message = String(payload.message || payload.error || "").slice(0, 300);
    } catch {
      // Provider response bodies are deliberately not retained.
    }
    let isAuthResponse = false;
    try {
      isAuthResponse = new URL(
        input instanceof Request ? input.url : String(input),
      ).pathname.startsWith("/auth/v1/");
    } catch {
      // An unparseable provider URL remains an operational provider failure.
    }
    const terminalAuthFailure =
      isAuthResponse &&
      classifySupabaseAuthFailure({
        status: response.status,
        code,
        message,
      }) === "terminal";
    const operationalFailure = !terminalAuthFailure && shouldCaptureProviderResponse(
      response.status,
      code,
      message,
    );
    if (operationalFailure) {
      noteOperationalFailure(
        "Supabase provider request failed",
        Object.assign(
          new Error(`SUPABASE_PROVIDER_FAILURE:${response.status}`),
          { code: code || `HTTP_${response.status}`, provider: "supabase" },
        ),
      );
    }
  }
  return response;
}

export function getSupabaseAdmin() {
  if (!url || !serviceKey) throw new Error("Missing Supabase server credentials.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: monitoredSupabaseFetch },
  });
}

export class AuthenticationProviderUnavailableError extends Error {
  readonly status = 503;
  readonly code = "AUTHENTICATION_PROVIDER_UNAVAILABLE";
  readonly provider = "supabase";
  readonly retryable = true;

  constructor() {
    super("The authentication service is temporarily unavailable.");
    this.name = "AuthenticationProviderUnavailableError";
  }
}

async function verifiedAuthUser(
  admin: SupabaseClient,
  token: string,
): Promise<User> {
  try {
    const { data, error } = await retryTransientAuthOperation(async () => {
      const result = await admin.auth.getUser(token);
      if (
        result.error &&
        classifySupabaseAuthFailure(result.error) === "transient"
      ) {
        throw result.error;
      }
      return result;
    });
    if (error) {
      throw new Error("Unauthorized");
    }
    if (!data.user) throw new Error("Unauthorized");
    return data.user;
  } catch (error) {
    if (
      error instanceof AuthenticationProviderUnavailableError ||
      (error instanceof Error && error.message === "Unauthorized")
    ) {
      throw error;
    }
    throw new AuthenticationProviderUnavailableError();
  }
}

export async function requireAdmin(request: Request) {
  assertRoleSurfaceHost(request, "admin");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const user = await verifiedAuthUser(admin, token);
  const normalizedEmail = user.email?.trim().toLowerCase() || "";
  const { data: identity, error: identityError } = await admin.from("platform_identities").select("email_normalized,primary_role,status").eq("user_id", user.id).maybeSingle();
  if (identityError && identityError.code !== "PGRST205") throw identityError;
  if (!identity || identity.status !== "Active" || identity.primary_role !== "admin" || identity.email_normalized !== normalizedEmail) throw new Error("Forbidden");
  let row = await assertAuthorizedAdminUser(admin, user);
  if (row?.status === "Invited") {
    const activatedAt = new Date().toISOString();
    const { error: activationError } = await admin.from("admin_users").update({ status: "Active", activated_at: activatedAt }).eq("id", row.id).eq("status", "Invited");
    if (activationError) throw activationError;
    row = { ...row, status: "Active", activated_at: activatedAt };
  }
  return { admin, user, adminUser: row };
}

export async function requireAdminPermission(request: Request, permission: string) {
  const context = await requireAdmin(request);
  const row = context.adminUser as { is_super_admin?: boolean; permissions?: Record<string, boolean> };
  if (!row.is_super_admin && !row.permissions?.[permission]) throw new Error("Forbidden: this admin role does not have access to this section.");
  return context;
}

export async function requireSalonOwner(request: Request) {
  assertRoleSurfaceHost(request, "salon");
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const admin = getSupabaseAdmin();
  const user = await verifiedAuthUser(admin, token);
  const { data: identity, error: identityError } = await admin
    .from("platform_identities")
    .select("email_normalized,primary_role,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (identityError && identityError.code !== "PGRST205") throw identityError;
  const identityScope = resolveSalonIdentityScope(identity, user.email);
  if (!identityScope) throw new Error("Forbidden: this account is not authorized for the salon workspace.");

  if (identityScope === "owner") {
    const { data: ownedSalon, error: salonError } = await admin
      .from("salons")
      .select("*")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (salonError) throw salonError;
    if (!ownedSalon) throw new Error("Forbidden: this salon-owner identity is not linked to a salon.");
    return { admin, user, salon: ownedSalon, teamMember: null, isOwner: true };
  }

  const { data: teamMember, error: teamError } = await admin
    .from("salon_team_members")
    .select("*,salon:salons(*)")
    .eq("user_id", user.id)
    .eq("status", "Active")
    .limit(1)
    .maybeSingle();
  if (teamError) throw teamError;
  if (!teamMember?.salon || !isActiveSalonTeamMembership(teamMember.status)) {
    throw new Error("Forbidden: this active salon-team identity is not linked to an active team membership.");
  }
  const solo = await admin.rpc("salon_is_solo", { target_salon_id: teamMember.salon.id });
  if (solo.error) throw solo.error;
  if (solo.data) throw new Error("Forbidden: this business plan does not include staff access.");
  return { admin, user, salon: teamMember.salon, teamMember, isOwner: false };
}

export async function assertBusinessTeamAccess(context: Awaited<ReturnType<typeof requireSalonOwner>>) {
  const result = await context.admin.rpc("salon_is_solo", { target_salon_id: context.salon.id });
  if (result.error) throw result.error;
  if (result.data) throw new Error("Forbidden: team features require a business team plan.");
}

export async function requireSalonPermission(request: Request, permission: string) {
  const context = await requireSalonOwner(request);
  if (["stylists", "team", "team_payouts"].includes(permission)) await assertBusinessTeamAccess(context);
  if (!context.isOwner && !(context.teamMember?.permissions as Record<string, boolean> | undefined)?.[permission]) throw new Error("Forbidden: this salon role does not have access to this section.");
  return context;
}

export type TransactionalEmailCategory = "security" | "bookings" | "account" | "support";

function senderFor(category: TransactionalEmailCategory, displayName?: string) {
  const senders: Record<TransactionalEmailCategory, string> = {
    security: process.env.EMAIL_FROM_SECURITY || "Girlz Culture Security <noreply@notifications.girlzculture.com>",
    bookings: process.env.EMAIL_FROM_BOOKINGS || "Girlz Culture Bookings <bookings@notifications.girlzculture.com>",
    account: process.env.EMAIL_FROM_ACCOUNT || "Girlz Culture <hello@notifications.girlzculture.com>",
    support: process.env.EMAIL_FROM_SUPPORT || "Girlz Culture Support <support@notifications.girlzculture.com>",
  };
  const configured = senders[category];
  const match = configured.match(/<([^>]+)>/);
  const address = match?.[1] || configured;
  const safeName = String(displayName || "").trim().replace(/[<>\r\n"]/g, "").slice(0, 60);
  return safeName ? `${safeName} <${address}>` : configured;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  category: TransactionalEmailCategory = "account",
  options: { fromName?: string; replyTo?: string; idempotencyKey?: string; signal?: AbortSignal } = {},
) {
  if (isSampleEmail(to)) return {skipped:true,reason:"sample_data"};
  if (!process.env.RESEND_API_KEY || !to) return { skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey.slice(0, 256) }
        : {}),
    },
    body: JSON.stringify({
      from: senderFor(category, options.fromName),
      to,
      subject,
      html,
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
    }),
  });
  if (!response.ok) throw new Error(`EMAIL_DELIVERY_FAILED_${response.status}`);
  return response.json();
}

export async function sendSms(to: string, body: string) {
  if(isSamplePhone(to))return {skipped:true,reason:"sample_data"};
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return { skipped: true };
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!response.ok) throw new Error(`SMS_DELIVERY_FAILED_${response.status}`);
  return response.json();
}

type DeliveryTask = { recipientType: "salon" | "customer" | "stylist"; channel: "email" | "sms" | "push"; destination: string; run: () => Promise<unknown> };

function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

async function bookingNotificationContext(bookingId: string) {
  const admin = getSupabaseAdmin();
  const { data: booking, error: bookingError } = await admin.from("bookings").select("*").eq("id", bookingId).single();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Booking not found");
  const [salonResult, styleResult, stylistResult, materialResult] = await Promise.all([
    admin.from("salons").select("name,email,phone,time_zone,slug,user_id,address_street,address_line2,address_city,address_state,address_zip").eq("id", booking.salon_id).single(),
    admin.from("styles").select("*").eq("id", booking.style_id).maybeSingle(),
    booking.stylist_id ? admin.from("stylists").select("id,name,user_id").eq("id", booking.stylist_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    booking.selected_material_id ? admin.from("style_materials").select("*").eq("id", booking.selected_material_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (salonResult.error) throw salonResult.error;
  if (styleResult.error) throw styleResult.error;
  if (stylistResult.error) throw stylistResult.error;
  if (materialResult.error) throw materialResult.error;
  const salon = salonResult.data;
  const style = styleResult.data;
  const stylist = stylistResult.data;
  const material = materialResult.data;
  if (!salon) throw new Error("Salon not found");
  const fullAddress = [
    salon.address_street,
    salon.address_line2,
    salon.address_city,
    [salon.address_state, salon.address_zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const salonAuth = salon.user_id
    ? await admin.auth.admin.getUserById(String(salon.user_id))
    : null;
  if (salonAuth?.error) throw salonAuth.error;
  const communicationPreferences = await bookingCommunicationPreferences(admin, booking);
  const customerLocale = normalizeLocale(communicationPreferences.locale);
  const salonLocale = normalizeLocale(
    salonAuth?.data.user?.user_metadata?.locale,
  );
  let stylistContact: { email: string; phone: string; userId: string; locale: string } | null = null;
  if (stylist?.id) {
    const { data: member, error: memberError } = await admin.from("salon_team_members").select("user_id,email,phone").eq("salon_id", booking.salon_id).eq("stylist_id", stylist.id).eq("status", "Active").maybeSingle();
    if(memberError)throw memberError;
    const userId = String(stylist.user_id || member?.user_id || "");
    const authResult = userId ? await admin.auth.admin.getUserById(userId) : null;
    if(authResult?.error)throw authResult.error;
    stylistContact = {
      email: String(member?.email || authResult?.data.user?.email || ""),
      phone: String(member?.phone || authResult?.data.user?.user_metadata?.phone || ""),
      userId,
      locale: normalizeLocale(authResult?.data.user?.user_metadata?.locale),
    };
  }
  return {
    admin,
    booking,
    salon: { ...salon, full_address: fullAddress },
    style,
    stylist,
    material,
    stylistContact,
    customerLocale,
    communicationPreferences,
    salonLocale,
  };
}

type PublishedNotificationTemplate={template_key:string;published_subject:string;published_body:string;allowed_variables:string[]};
type NotificationTemplateMap=Record<string,PublishedNotificationTemplate>;
type NotificationTranslationMap=Record<string,string>;
function renderNotificationText(translations:NotificationTranslationMap,locale:string,key:string,fallback:string,variables:Record<string,string>={}){
  const source=translations[`${locale}:${key}`]||reminderTranslation(locale,key)||ENGLISH_MESSAGES[key]||fallback;
  return String(source).replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_match,name:string)=>variables[name]||"");
}
function renderNotificationEmail(templates:NotificationTemplateMap,translations:NotificationTranslationMap,locale:string,key:string,variables:Record<string,string>,fallbackSubject:string,fallbackBody:string){
  const template=templates[key];
  const substitute=(value:string)=>value.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_match,name:string)=>variables[name]||"");
  const subjectKey=`notification.${key}.subject`;const bodyKey=`notification.${key}.body`;
  const englishSubject=String(template?.published_subject||fallbackSubject);const englishBody=String(template?.published_body||fallbackBody);
  const subject=(locale==="en"?substitute(englishSubject):renderNotificationText(translations,locale,subjectKey,englishSubject,variables)).slice(0,140);
  const plainText=locale==="en"?substitute(englishBody):renderNotificationText(translations,locale,bodyKey,englishBody,variables);
  return{subject,html:`<p>${escapeHtml(plainText).replaceAll("\n","<br/>")}</p>`};
}

async function bookingNotificationSettings(admin:ReturnType<typeof getSupabaseAdmin>,requestedLocales:string[]=[]){
  const keys=["notifications.channels","notifications.booking_customer_confirmed_subject","notifications.booking_salon_confirmed_subject","notifications.booking_customer_cancelled_subject","notifications.booking_salon_cancelled_subject","notifications.booking_reminder_hours","notifications.booking_reminder_subject","notifications.sender_name","notifications.reply_to_email","notifications.booking_confirmation_intro","notifications.booking_cancellation_intro","notifications.booking_policy_summary","notifications.booking_email_footer","booking.deposit_percentage","branding.primary_color","branding.cta_color","branding.page_background","branding.card_background","branding.heading_color","branding.body_color","branding.muted_color","branding.heading_font","branding.body_font"];
  const locales=[...new Set(requestedLocales.map(normalizeLocale).filter(locale=>locale!=="en"))];
  const[{data,error},{data:templateRows,error:templateError},{data:translationRows,error:translationError}]=await Promise.all([admin.from("engine_settings").select("setting_key,published_value").eq("status","Published").in("setting_key",keys),admin.from("notification_templates").select("template_key,published_subject,published_body,allowed_variables").eq("status","Published"),locales.length?admin.from("translation_entries").select("translation_key,locale,translated_text").eq("status","Published").in("locale",locales).like("translation_key","notification.%"):Promise.resolve({data:[],error:null})]);
  const warningReferences:string[]=[];
  for(const [action,failure] of [["load_engine_settings",error],["load_templates",templateError],["load_translations",translationError]] as const){
    if(failure)warningReferences.push(await capturePlatformError({
      admin,
      error:failure,
      feature:"booking-notifications",
      action,
      actorRole:"system",
      provider:"supabase",
      safeMessage:"Notification configuration was unavailable, so safe defaults were used.",
    }));
  }
  const values=Object.fromEntries((data||[]).map(row=>[row.setting_key,row.published_value]));
  const templates=Object.fromEntries((templateRows||[]).map(row=>[row.template_key,row])) as NotificationTemplateMap;
  const translations=Object.fromEntries((translationRows||[]).map(row=>[`${row.locale}:${row.translation_key}`,row.translated_text])) as NotificationTranslationMap;
  const rawChannels=Array.isArray(values["notifications.channels"])?values["notifications.channels"]:[];
  const channels=new Set((Array.isArray(values["notifications.channels"])?rawChannels:["email","sms","push"]).map(value=>String(value)).filter(value=>["email","sms","push"].includes(value)));
  const subject=(key:string,fallback:string)=>{const value=String(values[key]||"").trim();return value&&value.length<=140?value:fallback};
  const text=(key:string,fallback:string,maxLength=1200)=>{const value=String(values[key]||"").trim();return value&&value.length<=maxLength?value:fallback};
  const reminderHours=(Array.isArray(values["notifications.booking_reminder_hours"])?values["notifications.booking_reminder_hours"]:[24,2]).map(Number).filter(value=>Number.isInteger(value)&&value>=1&&value<=336).slice(0,6);
  const configuredDepositPercentage=Number(values["booking.deposit_percentage"]??10);
  const color=(key:string,fallback:string)=>{const value=String(values[key]||"");return /^#[0-9a-f]{6}$/i.test(value)?value:fallback};
  const font=(key:string,allowed:string[],fallback:string)=>{const value=String(values[key]||"");return allowed.includes(value)?value:fallback};
  const rawEmailPage=color("branding.page_background","#FFFFFF");
  const rawEmailCard=color("branding.card_background","#FFFFFF");
  const rawEmailHeading=color("branding.heading_color","#0D1114");
  const rawEmailBody=color("branding.body_color","#0D1114");
  const rawEmailMuted=color("branding.muted_color","#52616A");
  const configuredEmailSurfaces=[rawEmailPage,rawEmailCard];
  const emailPaletteIsReadable=[rawEmailHeading,rawEmailBody,rawEmailMuted].every((foreground)=>hasMinimumContrastOnAll(foreground,configuredEmailSurfaces));
  const emailPage=emailPaletteIsReadable?rawEmailPage:"#FFFFFF";
  const emailCard=emailPaletteIsReadable?rawEmailCard:"#FFFFFF";
  const emailSurfaces=[emailPage,emailCard];
  const emailBody=accessibleTextColor(rawEmailBody,emailSurfaces,["#0D1114","#FFFFFF"]);
  return{
    channels,templates,translations,warningReferences,
    reminderHours:reminderHours.length?reminderHours:[24,2],
    customerConfirmed:subject("notifications.booking_customer_confirmed_subject","Your Girlz Culture appointment is confirmed"),
    salonConfirmed:subject("notifications.booking_salon_confirmed_subject","New confirmed Girlz Culture booking"),
    customerCancelled:subject("notifications.booking_customer_cancelled_subject","Your Girlz Culture appointment was cancelled"),
    salonCancelled:subject("notifications.booking_salon_cancelled_subject","Girlz Culture booking cancelled"),
    reminderSubject:subject("notifications.booking_reminder_subject","Your Girlz Culture appointment is coming up"),
    senderName:text("notifications.sender_name","Girlz Culture",60),
    replyTo:text("notifications.reply_to_email","support@girlzculture.com",160),
    confirmationIntro:text("notifications.booking_confirmation_intro","Thank you for booking with Girlz Culture. Your confirmed appointment details are below.",400),
    cancellationIntro:text("notifications.booking_cancellation_intro","Your appointment has been cancelled. The details and any refund status are below.",400),
    policy:text("notifications.booking_policy_summary","Use the secure Manage Booking link to cancel or respond to a reschedule. Deposit treatment follows the terms accepted at checkout.",1200),
    footer:text("notifications.booking_email_footer","Only use Girlz Culture links from this message. Contact support if you did not make this booking.",400),
    depositPercentage:Number.isFinite(configuredDepositPercentage)?configuredDepositPercentage:10,
    emailTheme:{
      primary:accessibleSurfaceColor(color("branding.primary_color",NON_DOM_VISUAL_TOKENS.action),NON_DOM_VISUAL_TOKENS.onAction,NON_DOM_VISUAL_TOKENS.action),
      cta:accessibleSurfaceColor(color("branding.cta_color",NON_DOM_VISUAL_TOKENS.action),NON_DOM_VISUAL_TOKENS.onAction,NON_DOM_VISUAL_TOKENS.action),
      page:emailPage,
      card:emailCard,
      heading:accessibleTextColor(rawEmailHeading,emailSurfaces,["#0D1114",emailBody,"#FFFFFF"]),
      body:emailBody,
      muted:accessibleTextColor(rawEmailMuted,emailSurfaces,["#52616A",emailBody,"#FFFFFF"]),
      headingFont:font("branding.heading_font",["Playfair Display","Fraunces","Georgia"],"Playfair Display"),
      bodyFont:font("branding.body_font",["Montserrat","Inter","Arial"],"Montserrat"),
    },
  };
}

async function bookingCommunicationInput(
  context: Awaited<ReturnType<typeof bookingNotificationContext>>,
  notification: Awaited<ReturnType<typeof bookingNotificationSettings>>,
  urls: Pick<BookingCommunicationInput, "manageUrl" | "dashboardUrl" | "directionsUrl">,
  intro: string,
): Promise<BookingCommunicationInput> {
  const { booking, salon, style, stylist, material } = context;
  const durationValue = Number(booking.duration_hours || 0);
  const emailLogoUrl =
    (await getPublishedBrandAsset("email_logo"))?.published_url || undefined;
  return {
    booking,
    salon,
    style,
    stylist,
    material,
    when: formatInTimeZone(booking.appointment_datetime, salon.time_zone),
    duration: `${durationValue} hour${durationValue === 1 ? "" : "s"}`,
    depositPercentage: Number(booking.deposit_percentage || notification.depositPercentage),
    receiptUrl: String(booking.stripe_receipt_url || ""),
    policy: notification.policy,
    intro,
    footer: notification.footer,
    emailLogoUrl,
    emailTheme: notification.emailTheme,
    ...urls,
  };
}

export async function runDeliveries(bookingId: string, eventType: string, tasks: DeliveryTask[], scheduleRevision?: number, followupLease?: string) {
  const admin = getSupabaseAdmin();
  const results: Array<{ recipientType: string; channel: string; status: "delivered" | "failed" | "skipped"; request_id?: string }> = [];
  for (const task of tasks) {
    const deduplicationKey = notificationDeliveryKey({
      bookingId,
      eventType,
      recipientType: task.recipientType,
      channel: task.channel,
      scheduleRevision,
    });
    const claim = await admin.rpc(followupLease ? "claim_followup_notification_delivery" : scheduleRevision === undefined ? "claim_notification_delivery" : "claim_scheduled_notification_delivery", {
      p_booking_id: bookingId,
      p_event_type: eventType,
      p_recipient_type: task.recipientType,
      p_channel: task.channel,
      p_destination: task.destination,
      p_deduplication_key: deduplicationKey,
      ...(scheduleRevision === undefined ? {} : { p_schedule_revision: scheduleRevision }),
      ...(followupLease ? {p_lease:followupLease} : {}),
    });
    if (claim.error) {
      const reference = await capturePlatformError({
        admin,
        error: claim.error,
        feature: "booking-notifications",
        action: "claim_delivery",
        actorRole: "system",
        recordType: "booking",
        recordId: bookingId,
        provider: "supabase",
        safeMessage: "A booking notification could not be reserved for delivery.",
      });
      results.push({ recipientType: task.recipientType, channel: task.channel, status: "failed", request_id: reference });
      continue;
    }
    const deliveryLogId = typeof claim.data === "string" ? claim.data : "";
    if (!deliveryLogId) {
      results.push({ recipientType: task.recipientType, channel: task.channel, status: "skipped" });
      continue;
    }
    let status: "delivered" | "failed" | "skipped" = "delivered";
    let reference = "";
    try {
      const response = await task.run() as {
        skipped?: boolean;
        failed?: number;
        warnings?: Array<{ request_id?: string }>;
      } | undefined;
      if (response?.skipped) status = "skipped";
      if(Number(response?.failed||0)>0){
        status="failed";
        reference=String(response?.warnings?.[0]?.request_id||"");
      }
    } catch (error) {
      status = "failed";
      reference = await capturePlatformError({
        admin,
        error,
        feature:"booking-notifications",
        action:`deliver:${eventType}:${task.channel}`,
        actorRole:"system",
        recordType:"booking",
        recordId:bookingId,
        provider:task.channel,
        safeMessage:"A booking notification could not be delivered.",
      });
    }
    const deliveryLog=await admin.from("notification_delivery_log").update({ delivery_status: status, error_message: reference?`DELIVERY_FAILED_REFERENCE:${reference}`:null }).eq("id",deliveryLogId);
    if(deliveryLog.error){
      const logReference=await capturePlatformError({
        admin,
        error:deliveryLog.error,
        feature:"booking-notifications",
        action:"write_delivery_log",
        actorRole:"system",
        recordType:"booking",
        recordId:bookingId,
        provider:"supabase",
        safeMessage:"A booking notification result could not be recorded.",
      });
      if(!reference)reference=logReference;
    }
    results.push({ recipientType: task.recipientType, channel: task.channel, status, ...(reference ? { request_id: reference } : {}) });
  }
  return results;
}

export async function bookingDeliveryChannels(admin: SupabaseClient) {
  return (await bookingNotificationSettings(admin)).channels;
}

/** Share the established per-event delivery claim/lease for typed and
 * Assistant messages. A retry can retry a failed channel without resending a
 * successfully delivered channel or creating another message. */
export async function deliverBookingMessageNotifications(messageId: string) {
  const admin = getSupabaseAdmin();
  const messageResult = await admin.from("booking_messages").select("id,booking_id,sender_role,original_body,body").eq("id", messageId).single();
  if (messageResult.error) throw messageResult.error;
  const message = messageResult.data;
  const { booking, salon, customerLocale, salonLocale } = await bookingNotificationContext(message.booking_id);
  const recipientRole = message.sender_role === "customer" ? "salon" : "customer";
  const notification = await bookingNotificationSettings(admin, [recipientRole === "salon" ? salonLocale : customerLocale]);
  const original = String(message.original_body || message.body);
  const preview = original.length > 140 ? `${original.slice(0, 137)}…` : original;
  const root = (process.env.NEXT_PUBLIC_SITE_URL || "https://girlzculture.com").replace(/\/$/, "");
  let email = String(salon.email || ""), phone = String(salon.phone || "");
  let recipientIds = [String(salon.user_id || "")].filter(Boolean);
  let path = `/salon/dashboard/messages/${message.booking_id}`;
  if (recipientRole === "customer") {
    email = String(booking.guest_email || ""); phone = String(booking.guest_phone || "");
    recipientIds = booking.customer_id ? [String(booking.customer_id)] : [];
    path = `/account?tab=inbox&booking=${message.booking_id}`;
    if (booking.customer_id) {
      const customer = await admin.from("customers").select("email,phone").eq("id", booking.customer_id).maybeSingle();
      if (customer.error) throw customer.error;
      email = String(customer.data?.email || email); phone = String(customer.data?.phone || phone);
    } else {
      // Guest replies remain in the established secure management/contact flow.
      path = (await issueGuestBookingToken(admin, message.booking_id, { reason: "Booking message notification", rootUrl: root })).url;
    }
  } else {
    const team = await admin.from("salon_team_members").select("user_id,permissions").eq("salon_id", booking.salon_id).eq("status", "Active");
    if (team.error) throw team.error;
    recipientIds.push(...(team.data || []).filter(row => Boolean(row.permissions?.bookings)).map(row => String(row.user_id || "")).filter(Boolean));
    recipientIds = await authorizedMessageRecipients(admin, String(booking.salon_id), String(booking.id), recipientIds);
    if (!recipientIds.includes(String(salon.user_id || ""))) { email = ""; phone = ""; }
  }
  const url = path.startsWith("https://") ? path : `${root}${path}`;
  const title = renderNotificationText(notification.translations, recipientRole === "salon" ? salonLocale : customerLocale, "notification.booking.message.title", "New booking message");
  const tasks: DeliveryTask[] = [
    { recipientType: recipientRole, channel: "email", destination: email, run: () => sendEmail(email, title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(preview)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(bookingReference(booking))}</a></p>`, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) },
    { recipientType: recipientRole, channel: "sms", destination: phone, run: () => sendSms(phone, `Girlz Culture: ${preview} ${url}`) },
    { recipientType: recipientRole, channel: "push", destination: recipientIds.join(","), run: () => sendPushToUsers(recipientIds, { title, body: preview, url: path, tag: `message-${message.booking_id}` }) },
  ];
  const deliveries = await runDeliveries(message.booking_id, `booking_message:${message.id}`, tasks.filter(task => notification.channels.has(task.channel) && Boolean(task.destination)));
  return { warnings: [...notification.warningReferences, ...deliveries.flatMap(item => item.request_id ? [item.request_id] : [])].map(request_id => ({ code: "MESSAGE_NOTIFICATION_FAILED", request_id })), deliveries };
}

export async function deliverBookingNotifications(
  bookingId: string,
  options: { manageUrl?: string; skipCustomerEmail?: boolean; acceptedProposalId?: string } = {},
) {
  const context = await bookingNotificationContext(bookingId);
  const { admin, booking, salon, style, stylist, stylistContact, customerLocale, salonLocale } = context;
  const stylistLocale=stylistContact?.locale||salonLocale;
  const notification=await bookingNotificationSettings(admin,[customerLocale,salonLocale,stylistLocale]);
  let confirmationEvent = "booking_confirmed";
  if (options.acceptedProposalId) {
    const accepted = await admin.from("booking_reschedule_proposals").select("id").eq("id", options.acceptedProposalId).eq("booking_id", bookingId).eq("status", "Accepted").maybeSingle();
    if (accepted.error) throw accepted.error;
    if (!accepted.data) throw new Error("RESCHEDULE_PROPOSAL_UNAVAILABLE");
    confirmationEvent = `reschedule_accepted:${accepted.data.id}`;
  } else if (booking.notifications_sent_at) return { alreadySent: true };
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const duration = `${Number(booking.duration_hours || 0)} hour${Number(booking.duration_hours || 0) === 1 ? "" : "s"}`;
  const service = String(style?.name || "Braiding service");
  const professional = String(stylist?.name || "Salon owner");
  const customer = String(booking.guest_name || "Customer");
  const reference = bookingReference(booking);
  const root = (process.env.NEXT_PUBLIC_SITE_URL || "https://girlzculture.com").replace(/\/$/, "");
  const dashboardUrl = `${root}/salon/dashboard/bookings?booking=${booking.id}`;
  const accountUrl = options.manageUrl || (
    await issueGuestBookingToken(admin, booking.id, {
      reason: "Booking confirmation",
      rootUrl: root,
    })
  ).url;
  const directionsUrl = salon.full_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(salon.full_address))}`
    : "";
  const summaryVariables={customer,service,when,duration,professional,salon:String(salon.name||"")};
  const salonSummary=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_confirmed.summary",`${customer} booked ${service} for ${when}. Duration: ${duration}. Stylist: ${professional}.`,summaryVariables);
  const stylistSummary=renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_confirmed.summary",salonSummary,summaryVariables);
  const customerSummary=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_confirmed.summary",`${service} at ${salon.name} is confirmed for ${when}. Stylist: ${professional}.`,summaryVariables);
  const salonSubject=renderNotificationEmail(notification.templates,notification.translations,salonLocale,"booking.salon_confirmed",{summary:salonSummary,dashboard_url:dashboardUrl},notification.salonConfirmed,`A new booking is confirmed.\n\n${salonSummary}\n\nOpen this booking: ${dashboardUrl}`).subject;
  const customerSubject=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_confirmed",{summary:customerSummary,confirmation_code:reference,account_url:accountUrl},notification.customerConfirmed,`Your appointment is confirmed.\n\n${customerSummary}\n\nBooking reference: ${reference}\n\nView your booking: ${accountUrl}`).subject;
  const communication = await bookingCommunicationInput(
    context,
    notification,
    { manageUrl: accountUrl, dashboardUrl, directionsUrl },
    notification.confirmationIntro,
  );
  const salonEmail={subject:salonSubject,html:renderSalonBookingConfirmation(communication)};
  const customerEmail={subject:customerSubject,html:renderCustomerBookingConfirmation(communication)};
  const stylistEmail=renderNotificationEmail(notification.templates,notification.translations,stylistLocale,"booking.stylist_confirmed",{summary:stylistSummary,dashboard_url:dashboardUrl},"A Girlz Culture booking was assigned to you",`A booking was assigned to you.\n\n${stylistSummary}\n\nOpen your appointment: ${dashboardUrl}`);
  const salonSms=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_confirmed.sms",`Girlz Culture confirmed booking: ${salonSummary} ${dashboardUrl}`,{summary:salonSummary,dashboard_url:dashboardUrl});
  const customerSms=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_confirmed.sms",`Girlz Culture: ${customerSummary} Reference ${reference}. ${accountUrl}`,{summary:customerSummary,confirmation_code:reference,account_url:accountUrl});
  const stylistSms=renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_confirmed.sms",`Girlz Culture assigned booking: ${stylistSummary} ${dashboardUrl}`,{summary:stylistSummary,dashboard_url:dashboardUrl});
  const tasks: DeliveryTask[] = [
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), salonEmail.subject, salonEmail.html, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), salonSms) },
    { recipientType: "salon", channel: "push", destination: String(salon.user_id || ""), run: () => sendPushToUsers([String(salon.user_id || "")], { title: renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_confirmed.push_title","New confirmed booking"), body: salonSummary, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), customerSms) },
  ];
  if (!options.skipCustomerEmail) tasks.push({ recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), customerEmail.subject, customerEmail.html, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) });
  if (booking.customer_id) tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_confirmed.push_title","Appointment confirmed"), body: customerSummary, url: "/account?tab=upcoming", tag: `booking-${booking.id}` }) });
  if (stylistContact?.email) tasks.push({ recipientType: "stylist", channel: "email", destination: stylistContact.email, run: () => sendEmail(stylistContact.email, stylistEmail.subject, stylistEmail.html, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) });
  if (stylistContact?.phone) tasks.push({ recipientType: "stylist", channel: "sms", destination: stylistContact.phone, run: () => sendSms(stylistContact.phone, stylistSms) });
  if (stylistContact?.userId) tasks.push({ recipientType: "stylist", channel: "push", destination: stylistContact.userId, run: () => sendPushToUsers([stylistContact.userId], { title: renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_confirmed.push_title","A booking was assigned to you"), body: stylistSummary, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) });
  const deliveries = await runDeliveries(bookingId, confirmationEvent, tasks.filter(task=>notification.channels.has(task.channel)));
  const delivered = deliveries.every((item) => item.status === "delivered");
  const warningReferences=[...notification.warningReferences,...deliveries.map(item=>item.request_id).filter((value):value is string=>Boolean(value))];
  if (delivered) {
    const sentUpdate=await admin.from("bookings").update({ notifications_sent_at: new Date().toISOString() }).eq("id", bookingId).is("notifications_sent_at", null);
    if(sentUpdate.error)warningReferences.push(await capturePlatformError({admin,error:sentUpdate.error,feature:"booking-notifications",action:"mark_notifications_sent",actorRole:"system",recordType:"booking",recordId:bookingId,provider:"supabase",safeMessage:"Notification delivery completed, but its booking status could not be recorded."}));
  }
  const attentionUpdate=await admin.from("notifications").update({ delivery_status: delivered ? "delivered" : "attention_required" }).eq("booking_id", bookingId);
  if(attentionUpdate.error)warningReferences.push(await capturePlatformError({admin,error:attentionUpdate.error,feature:"booking-notifications",action:"update_notification_status",actorRole:"system",recordType:"booking",recordId:bookingId,provider:"supabase",safeMessage:"Notification delivery completed, but its status could not be recorded."}));
  return { deliveries, delivered, warnings:warningReferences.map(reference=>({message:`A booking notification needs attention. Reference ${reference}.`,request_id:reference})) };
}

export async function deliverCancellationNotifications(bookingId: string) {
  const context = await bookingNotificationContext(bookingId);
  const { admin,booking, salon, style, stylist, stylistContact,customerLocale,salonLocale } = context;
  const stylistLocale=stylistContact?.locale||salonLocale;
  const notification=await bookingNotificationSettings(admin,[customerLocale,salonLocale,stylistLocale]);
  const when = formatInTimeZone(booking.appointment_datetime, salon.time_zone);
  const service = String(style?.name || "Braiding service");
  const refundMessage=refundCustomerSummary(
    booking.refund_status,
    booking.refund_amount,
    booking.refund_provider_accepted_at,
  );
  const customerReason=safeCancellationReason(
    booking.cancellation_customer_reason||booking.cancellation_reason,
    String(booking.cancelled_by||booking.cancellation_initiated_by||"system").toLowerCase() as "customer"|"salon"|"admin"|"system",
  );
  const internalReason=String(
    booking.cancellation_internal_reason||
      booking.cancellation_detail||
      customerReason,
  ).slice(0,500);
  const customerNote=String(booking.cancellation_customer_message||"").trim().slice(0,500);
  const customer=String(booking.guest_name||"A customer");const stylistClause=stylist?.name?` with ${stylist.name}`:"";
  const variables={service,salon:String(salon.name||""),when,stylist_clause:stylistClause,reason:customerReason,refund_message:refundMessage,customer};
  const noteClause=customerNote?` Message: ${customerNote}`:"";
  const message=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_cancelled.summary",`Your ${service} appointment at ${salon.name} for ${when}${stylistClause} was cancelled. Reason: ${customerReason}.${noteClause} ${refundMessage}`,variables);
  const businessMessage=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_cancelled.summary",`${customer}'s ${service} appointment for ${when}${stylistClause} was cancelled. Internal reason: ${internalReason}. Customer-facing reason: ${customerReason}.`,variables);
  const stylistMessage=renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_cancelled.summary",`${customer}'s ${service} appointment for ${when}${stylistClause} was cancelled. Reason: ${customerReason}.`,variables);
  const root=(process.env.NEXT_PUBLIC_SITE_URL||"https://girlzculture.com").replace(/\/$/,"");
  const dashboardUrl=`${root}/salon/dashboard/bookings?booking=${booking.id}`;
  const accountUrl=booking.customer_id
    ? `${root}/account?tab=past`
    : (await issueGuestBookingToken(admin,booking.id,{reason:"Cancellation record",rootUrl:root})).url;
  const customerSubject=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_cancelled",{message,browse_url:`${root}/salons`},notification.customerCancelled,`Your appointment was cancelled.\n\n${message}\n\nWe are sorry for the disruption. Find another available salon: ${root}/salons`).subject;
  const salonSubject=renderNotificationEmail(notification.templates,notification.translations,salonLocale,"booking.salon_cancelled",{message:businessMessage},notification.salonCancelled,`A booking was cancelled.\n\n${businessMessage}`).subject;
  const communication=await bookingCommunicationInput(
    context,
    notification,
    {manageUrl:accountUrl,dashboardUrl},
    notification.cancellationIntro,
  );
  const cancelledBy=cancellationActorLabel(
    booking.cancelled_by||booking.cancellation_initiated_by,
  );
  const refundStatus=refundMessage;
  const customerEmail={
    subject:customerSubject,
    html:renderBookingCancellation({...communication,audience:"customer",cancelledBy,reason:customerReason,customerMessage:customerNote,refundStatus,browseUrl:`${root}/salons`,supportUrl:`${root}/contact`}),
  };
  const salonEmail={
    subject:salonSubject,
    html:renderBookingCancellation({...communication,audience:"salon",cancelledBy,reason:internalReason,customerMessage:customerNote,refundStatus,supportUrl:`${root}/contact`}),
  };
  const stylistEmail=renderNotificationEmail(notification.templates,notification.translations,stylistLocale,"booking.stylist_cancelled",{message:stylistMessage},"An assigned Girlz Culture booking was cancelled",`An assigned booking was cancelled.\n\n${stylistMessage}`);
  const tasks: DeliveryTask[] = [
    { recipientType: "customer", channel: "email", destination: String(booking.guest_email || ""), run: () => sendEmail(String(booking.guest_email || ""), customerEmail.subject, customerEmail.html, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) },
    { recipientType: "customer", channel: "sms", destination: String(booking.guest_phone || ""), run: () => sendSms(String(booking.guest_phone || ""), renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_cancelled.sms",`Girlz Culture: ${message}`,{message})) },
    { recipientType: "salon", channel: "email", destination: String(salon.email || ""), run: () => sendEmail(String(salon.email || ""), salonEmail.subject, salonEmail.html, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) },
    { recipientType: "salon", channel: "sms", destination: String(salon.phone || ""), run: () => sendSms(String(salon.phone || ""), renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_cancelled.sms",`Girlz Culture: ${businessMessage}`,{message:businessMessage})) },
    { recipientType: "salon", channel: "push", destination: String(salon.user_id || ""), run: () => sendPushToUsers([String(salon.user_id || "")], { title: renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_cancelled.push_title","Booking cancelled"), body: businessMessage, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) },
  ];
  if (booking.customer_id) tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_cancelled.push_title","Appointment cancelled"), body: message, url: "/account?tab=past", tag: `booking-${booking.id}`, requireInteraction: true }) });
  if (stylistContact?.email) tasks.push({ recipientType: "stylist", channel: "email", destination: stylistContact.email, run: () => sendEmail(stylistContact.email, stylistEmail.subject, stylistEmail.html, "bookings", { fromName: notification.senderName, replyTo: notification.replyTo }) });
  if (stylistContact?.phone) tasks.push({ recipientType: "stylist", channel: "sms", destination: stylistContact.phone, run: () => sendSms(stylistContact.phone, renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_cancelled.sms",`Girlz Culture: ${stylistMessage}`,{message:stylistMessage})) });
  if (stylistContact?.userId) tasks.push({ recipientType: "stylist", channel: "push", destination: stylistContact.userId, run: () => sendPushToUsers([stylistContact.userId], { title: renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_cancelled.push_title","Assigned booking cancelled"), body: stylistMessage, url: `/salon/dashboard/bookings?booking=${booking.id}`, tag: `booking-${booking.id}`, requireInteraction: true }) });
  const deliveries=await runDeliveries(bookingId, "booking_cancelled", tasks.filter(task=>notification.channels.has(task.channel)));
  return { deliveries, warnings:[...notification.warningReferences,...deliveries.map(item=>item.request_id).filter((value):value is string=>Boolean(value))].map(reference=>({message:`A cancellation notification needs attention. Reference ${reference}.`,request_id:reference})) };
}

export async function deliverBookingReminder(bookingId:string,reminderHours:number,scheduleRevision:number){
  const{admin,booking,salon,style,stylist,stylistContact,customerLocale,salonLocale}=await bookingNotificationContext(bookingId);
  const stylistLocale=stylistContact?.locale||salonLocale;
  if(String(booking.status||"").toLowerCase()!=="confirmed" || booking.schedule_revision!==scheduleRevision)return{skipped:true,reason:"Booking is no longer confirmed at the selected schedule."};
  const notification=await bookingNotificationSettings(admin,[customerLocale,salonLocale,stylistLocale]);
  const when=reminderDate(booking.appointment_datetime,salon.time_zone,customerLocale);
  const service=String(style?.name||"Braiding service");
  const root=(process.env.NEXT_PUBLIC_SITE_URL||"https://girlzculture.com").replace(/\/$/,"");
  const customer=String(booking.guest_name||"A customer");const stylistClause=reminderStylistClause(customerLocale,stylist?.name);const variables={service,salon:String(salon.name||""),when,stylist_clause:stylistClause,customer};
  const summary=renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_reminder.summary",`Reminder: ${service} at ${salon.name} is scheduled for ${when}${stylistClause}.`,variables);
  const salonSummary=renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_reminder.summary",`Reminder: ${customer}'s ${service} appointment is scheduled for ${when}${stylistClause}.`,{...variables,when:reminderDate(booking.appointment_datetime,salon.time_zone,salonLocale),stylist_clause:reminderStylistClause(salonLocale,stylist?.name)});
  const stylistSummary=renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_reminder.summary",salonSummary,{...variables,when:reminderDate(booking.appointment_datetime,salon.time_zone,stylistLocale),stylist_clause:reminderStylistClause(stylistLocale,stylist?.name)});
  const accountUrl=booking.customer_id?`${root}/account?tab=upcoming`:(await issueGuestBookingToken(admin,booking.id,{reason:"Scheduled booking reminder",rootUrl:root,reuseActive:true})).url;const dashboardUrl=`${root}/salon/dashboard/bookings?booking=${booking.id}`;
  const customerEmail=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_reminder",{summary,account_url:accountUrl},notification.reminderSubject,`Appointment reminder.\n\n${summary}\n\nView your booking: ${accountUrl}`);
  const salonEmail=renderNotificationEmail(notification.templates,notification.translations,salonLocale,"booking.salon_reminder",{summary:salonSummary,dashboard_url:dashboardUrl},"Upcoming Girlz Culture appointment",`Appointment reminder.\n\n${salonSummary}\n\nOpen booking: ${dashboardUrl}`);
  const stylistEmail=renderNotificationEmail(notification.templates,notification.translations,stylistLocale,"booking.stylist_reminder",{summary:stylistSummary},"Upcoming assigned appointment",`Appointment reminder.\n\n${stylistSummary}`);
  const emailOptions=(recipientType:string)=>({fromName:notification.senderName,replyTo:notification.replyTo,idempotencyKey:notificationDeliveryKey({bookingId,eventType:`booking_reminder_${reminderHours}h`,recipientType,channel:"email",scheduleRevision})});
  const tasks:DeliveryTask[]=[
    {recipientType:"customer",channel:"email",destination:String(booking.guest_email||""),run:()=>sendEmail(String(booking.guest_email||""),customerEmail.subject,customerEmail.html,"bookings",emailOptions("customer"))},
    {recipientType:"customer",channel:"sms",destination:String(booking.guest_phone||""),run:()=>sendSms(String(booking.guest_phone||""),renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_reminder.sms",`Girlz Culture: ${summary}`,{summary}))},
    {recipientType:"salon",channel:"email",destination:String(salon.email||""),run:()=>sendEmail(String(salon.email||""),salonEmail.subject,salonEmail.html,"bookings",emailOptions("salon"))},
    {recipientType:"salon",channel:"sms",destination:String(salon.phone||""),run:()=>sendSms(String(salon.phone||""),renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_reminder.sms",`Girlz Culture: ${salonSummary}`,{summary:salonSummary}))},
    {recipientType:"salon",channel:"push",destination:String(salon.user_id||""),run:()=>sendPushToUsers([String(salon.user_id||"")],{title:renderNotificationText(notification.translations,salonLocale,"notification.booking.salon_reminder.push_title","Upcoming appointment"),body:salonSummary,url:`/salon/dashboard/bookings?booking=${booking.id}`,tag:`booking-reminder-${booking.id}-${reminderHours}h`})},
  ];
  if(booking.customer_id)tasks.push({recipientType:"customer",channel:"push",destination:String(booking.customer_id),run:()=>sendPushToUsers([String(booking.customer_id)],{title:renderNotificationText(notification.translations,customerLocale,"notification.booking.customer_reminder.push_title","Appointment reminder"),body:summary,url:"/account?tab=upcoming",tag:`booking-reminder-${booking.id}-${reminderHours}h`})});
  if(stylistContact?.email)tasks.push({recipientType:"stylist",channel:"email",destination:stylistContact.email,run:()=>sendEmail(stylistContact.email,stylistEmail.subject,stylistEmail.html,"bookings",emailOptions("stylist"))});
  if(stylistContact?.phone)tasks.push({recipientType:"stylist",channel:"sms",destination:stylistContact.phone,run:()=>sendSms(stylistContact.phone,renderNotificationText(notification.translations,stylistLocale,"notification.booking.salon_reminder.sms",`Girlz Culture: ${stylistSummary}`,{summary:stylistSummary}))});
  if(stylistContact?.userId)tasks.push({recipientType:"stylist",channel:"push",destination:stylistContact.userId,run:()=>sendPushToUsers([stylistContact.userId],{title:renderNotificationText(notification.translations,stylistLocale,"notification.booking.stylist_reminder.push_title","Upcoming assigned appointment"),body:stylistSummary,url:`/salon/dashboard/bookings?booking=${booking.id}`,tag:`booking-reminder-${booking.id}-${reminderHours}h`})});
  const deliveries=await runDeliveries(bookingId,`booking_reminder_${reminderHours}h`,tasks.filter(task=>notification.channels.has(task.channel)),scheduleRevision);
  return{deliveries,warnings:[...notification.warningReferences,...deliveries.map(item=>item.request_id).filter((value):value is string=>Boolean(value))].map(reference=>({message:`A reminder notification needs attention. Reference ${reference}.`,request_id:reference}))};
}

export async function deliverBookingFollowup(bookingId:string,leaseId:string){
  const {admin,booking,salon,style,customerLocale,communicationPreferences:preferences}=await bookingNotificationContext(bookingId);
  const end=new Date(booking.appointment_datetime).getTime()+Number(booking.duration_hours)*3_600_000;
  if(booking.status!=="Completed"||!preferences.follow_up||!preferences.id||!Number.isFinite(end)||end>Date.now()-86_400_000||end<=Date.now()-259_200_000){
    return {deliveries:[],skipped:true};
  }
  const notification=await bookingNotificationSettings(admin,[customerLocale]);
  // Optional messages fail closed when channel/template settings cannot load.
  if(notification.warningReferences.length)throw Error("FOLLOWUP_CONFIGURATION_UNAVAILABLE");
  if(!salon.slug||!style?.name)throw Error("FOLLOWUP_CONTEXT_UNAVAILABLE");
  const root=(process.env.NEXT_PUBLIC_SITE_URL||"https://girlzculture.com").replace(/\/$/,"");
  const bookPath=salonPublicPath(String(salon.slug));
  const bookUrl=new URL(bookPath,root).toString();
  const unsubscribe=new URL("/communications/unsubscribe",root);
  unsubscribe.searchParams.set("token",communicationUnsubscribeToken(preferences.id));
  const copy=bookingFollowupCopy(customerLocale,String(salon.name),String(style.name));
  const variables={salon:String(salon.name),service:String(style.name),booking_url:bookUrl,unsubscribe_url:unsubscribe.toString()};
  const email=renderNotificationEmail(notification.templates,notification.translations,customerLocale,"booking.customer_follow_up",variables,copy.subjectTemplate,copy.bodyTemplate);
  // The opt-out remains present even when the Engine overrides the template.
  const html=`${email.html}<p><a href="${escapeHtml(bookUrl)}">${escapeHtml(copy.book)}</a></p><p><a href="${escapeHtml(unsubscribe.toString())}">${escapeHtml(copy.preferences)}</a></p>`;
  const tasks:DeliveryTask[]=[];
  if(preferences.email_enabled&&booking.guest_email&&notification.channels.has("email"))tasks.push({recipientType:"customer",channel:"email",destination:String(booking.guest_email),run:()=>sendEmail(String(booking.guest_email),email.subject,html,"bookings",{fromName:notification.senderName,replyTo:notification.replyTo,idempotencyKey:notificationDeliveryKey({bookingId,eventType:"booking_follow_up",recipientType:"customer",channel:"email"})})});
  if(preferences.sms_enabled&&booking.guest_phone&&notification.channels.has("sms"))tasks.push({recipientType:"customer",channel:"sms",destination:String(booking.guest_phone),run:()=>sendSms(String(booking.guest_phone),`${copy.body}\n${copy.book}: ${bookUrl}\n${copy.preferences}: ${unsubscribe}`)});
  if(preferences.push_enabled&&booking.customer_id&&notification.channels.has("push"))tasks.push({recipientType:"customer",channel:"push",destination:String(booking.customer_id),run:()=>sendPushToUsers([String(booking.customer_id)],{title:copy.subject,body:copy.body,url:bookPath,tag:`booking-follow-up-${booking.id}`})});
  return {deliveries:await runDeliveries(bookingId,"booking_follow_up",tasks,undefined,leaseId),skipped:tasks.length===0};
}

export async function processBookingFollowups(){
  const admin=getSupabaseAdmin();
  const batch=await admin.rpc("claim_due_booking_followups",{p_limit:10});
  if(batch.error)throw batch.error;
  const results:Array<{bookingId:string;status:string;request_id?:string}>=[];
  for(const item of (batch.data||[]) as Array<{booking_id:string;lease_id:string}>){
    let reference:string|undefined;
    let skipped=false;
    try{
      const delivery=await deliverBookingFollowup(item.booking_id,item.lease_id);
      skipped=delivery.skipped;
      const failure=delivery.deliveries.find(result=>result.status==="failed"||result.request_id);
      if(failure)reference=failure.request_id||await capturePlatformError({admin,error:Error("FOLLOWUP_DELIVERY_FAILED"),feature:"booking-followups",action:"deliver",actorRole:"system",recordType:"booking",recordId:item.booking_id,safeMessage:"A post-visit message could not be delivered."});
    }catch(error){
      reference=await capturePlatformError({admin,error,feature:"booking-followups",action:"deliver",actorRole:"system",recordType:"booking",recordId:item.booking_id,safeMessage:"A post-visit message could not be delivered."});
    }
    const finished=await admin.rpc("finish_booking_followup",{p_booking:item.booking_id,p_lease:item.lease_id,p_success:!reference,p_reference:reference||null});
    if(finished.error){
      reference=await capturePlatformError({admin,error:finished.error,feature:"booking-followups",action:"complete",actorRole:"system",recordType:"booking",recordId:item.booking_id,safeMessage:"A post-visit delivery result could not be recorded."});
    }
    results.push({bookingId:item.booking_id,status:reference?"failed":finished.data!==true?"superseded":skipped?"skipped":"completed",...(reference?{request_id:reference}:{})});
  }
  return {processed:results.length,results};
}

export async function processBookingReminders(){
  const admin=getSupabaseAdmin();const notification=await bookingNotificationSettings(admin);const results:Array<Record<string,unknown>>=[];
  for(const reminderHours of notification.reminderHours){
    const{data:bookings,error}=await admin.rpc("due_booking_reminders",{p_reminder_hours:reminderHours});
    if(error){
      const reference=await capturePlatformError({admin,error,feature:"booking-reminders",action:"load_due_bookings",actorRole:"system",provider:"supabase",safeMessage:"Due booking reminders could not be loaded."});
      results.push({reminderHours,status:"failed",stage:"load_due_bookings",request_id:reference});
      continue;
    }
    const revisions=new Map<string,number>((bookings||[]).map((booking:{id:string;schedule_revision:number})=>[booking.id,Number(booking.schedule_revision)]));
    results.push(...await runIsolatedReminderBatch({
      bookings:bookings||[],
      reminderHours,
      claim:async bookingId=>{
        const claim=await admin.rpc("claim_booking_reminder",{p_booking_id:bookingId,p_reminder_hours:reminderHours,p_schedule_revision:revisions.get(bookingId)});
        if(claim.error)throw claim.error;
        return claim.data===true;
      },
      deliver:bookingId=>deliverBookingReminder(bookingId,reminderHours,revisions.get(bookingId)!),
      getDeliveryFailure:delivery=>{
        const failedDelivery=delivery.deliveries?.find(item=>item.status==="failed");
        if(!failedDelivery)return null;
        return{
          error:Object.assign(new Error("BOOKING_REMINDER_DELIVERY_REPORTED_FAILURE"),{
            code:"BOOKING_REMINDER_DELIVERY_REPORTED_FAILURE",
          }),
          ...(failedDelivery.request_id?{request_id:failedDelivery.request_id}:{}),
        };
      },
      complete:async bookingId=>{
        const update=await admin.rpc("complete_booking_reminder",{p_booking_id:bookingId,p_reminder_hours:reminderHours,p_schedule_revision:revisions.get(bookingId)});
        if(update.error)throw update.error;
      },
      recordDeliveryFailure:async (bookingId,reference)=>{
        const failure=await admin.rpc("fail_booking_reminder_claim",{p_booking_id:bookingId,p_reminder_hours:reminderHours,p_reference:reference,p_schedule_revision:revisions.get(bookingId)});
        if(failure.error)throw failure.error;
      },
      reportFailure:async (stage:ReminderStage,error,bookingId)=>capturePlatformError({
        admin,error,feature:"booking-reminders",action:stage,actorRole:"system",
        recordType:"booking",recordId:bookingId,
        provider:stage==="deliver_booking_reminder"?"transactional-notifications":"supabase",
        safeMessage:stage==="deliver_booking_reminder"
          ?"A scheduled booking reminder could not be delivered."
          :stage==="claim_booking_reminder"
            ?"A booking reminder could not be claimed."
            :stage==="complete_booking_reminder_claim"
              ?"A delivered reminder could not be marked complete."
              :"A reminder failure could not be recorded.",
      }),
    }));
  }
  return{configuredHours:notification.reminderHours,processed:results.length,results,warnings:notification.warningReferences.map(reference=>({message:`Reminder configuration needs attention. Reference ${reference}.`,request_id:reference}))};
}
