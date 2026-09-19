import "server-only";
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import { normalizeRescheduleLocalOptions } from "@/lib/bookingRescheduleCore";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { issueGuestBookingToken } from "@/lib/guestBookingAccess";
import { cleanText } from "@/lib/requestSecurity";
import { sendEmail, sendSms, runDeliveries, bookingDeliveryChannels } from "@/lib/supabaseAdmin";
import { sendPushToUsers } from "@/lib/webPushServer";
import { rescheduleCopy } from "@/lib/bookingRescheduleCopy";
import { NON_DOM_VISUAL_TOKENS } from "@/lib/nonDomVisualTokens.mjs";

type Row = Record<string, unknown>;

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        } as Record<string, string>
      )[character] || character,
  );
}

function displayWhen(value: string, timeZone: string, locale = "en") {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

async function engineValue(
  admin: SupabaseClient,
  key: string,
  fallback: unknown,
) {
  const { data, error } = await admin
    .from("engine_settings")
    .select("published_value")
    .eq("setting_key", key)
    .eq("status", "Published")
    .maybeSingle();
  if (error) throw error;
  return data?.published_value ?? fallback;
}

export type CustomerRescheduleInput = {
  admin: SupabaseClient;
  request?: Request;
  booking: Row;
  salon: Row;
  actorUserId: string;
  actorRole: string;
  reason: unknown;
  message: unknown;
  localOptions: unknown;
  rootUrl: string;
  requestId?: unknown;
  changeKind?: unknown;
};

/** Read-only canonical validation. No proposal, guest token or notification is created. */
export async function validateCustomerReschedule(input: CustomerRescheduleInput) {
  const {
    admin,
    booking,
    salon,
  } = input;
  const reason = cleanText(input.reason, 300);
  const message = cleanText(input.message, 600);
  if (!reason) throw new Error("Add a reason for this reschedule proposal.");
  const localOptions = normalizeRescheduleLocalOptions(
    input.localOptions,
    cleanText,
  );
  if (!localOptions.length || localOptions.length > 5) {
    throw new Error("Choose between one and five available appointment times.");
  }
  if (
    ["cancelled", "canceled", "completed", "refunded"].includes(
      String(booking.status || "").toLowerCase(),
    )
  ) {
    throw new Error("This booking can no longer be rescheduled.");
  }
  const timeZone = salonTimeZone(salon.time_zone);
  const duration = Number(booking.duration_hours);
  if (!Number.isFinite(duration) || duration < 0.25 || duration > 24) throw new Error("This booking duration must be corrected before proposing a change.");
  const requestId = cleanText(input.requestId, 40) || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("Choose a valid proposal request.");
  if (input.changeKind === "substitution" && localOptions.some(option => !option.stylistId || option.stylistId === booking.stylist_id || zonedLocalToUtc(option.local, timeZone).getTime() !== new Date(String(booking.appointment_datetime)).getTime())) {
    throw new Error("Choose another professional at the current appointment time.");
  }
  const availabilityByDate = new Map<
    string,
    Awaited<ReturnType<typeof bookingAvailability>>
  >();
  const verifiedOptions: Array<{
    appointment_datetime: string;
    duration_hours: number;
    stylist_id: string | null;
    stylist_name: string;
  }> = [];
  for (const option of localOptions) {
    const local = option.local;
    const [date, time] = local.split("T");
    const availabilityKey = `${date}:${option.stylistId || "any"}`;
    let availability = availabilityByDate.get(availabilityKey);
    if (!availability) {
      availability = await bookingAvailability({
        salonId: String(booking.salon_id),
        styleId: String(booking.style_id),
        stylistId: option.stylistId,
        customerId: booking.customer_id ? String(booking.customer_id) : null,
        guestEmail: String(booking.guest_email || ""),
        date,
        excludeBookingId: String(booking.id),
        includeAllStylists: true,
        durationMinutes: duration * 60,
        bufferMinutes: Math.max(0, Number(booking.buffer_minutes ?? 15)),
      });
      availabilityByDate.set(availabilityKey, availability);
    }
    const slot = availability.slots.find(
      (candidate) =>
        candidate.value === time &&
        (!option.stylistId || candidate.stylistId === option.stylistId),
    );
    if (!slot) {
      throw new Error(
        availability.reason ||
          `${local} is no longer available. Choose another time.`,
      );
    }
    verifiedOptions.push({
      appointment_datetime: zonedLocalToUtc(
        `${date}T${time}`,
        timeZone,
      ).toISOString(),
      duration_hours: duration,
      stylist_id: slot.stylistId,
      stylist_name: slot.stylistName,
    });
  }
  const expiryConfigured = Number(
    await engineValue(
      admin,
      "booking.reschedule_proposal_expiry_hours",
      72,
    ),
  );
  const expiryHours =
    Number.isFinite(expiryConfigured) &&
    expiryConfigured >= 1 &&
    expiryConfigured <= 336
      ? expiryConfigured
      : 72;
  return { reason, message, timeZone, verifiedOptions, expiryHours, requestId };
}

export async function createCustomerApprovedReschedule(input: CustomerRescheduleInput) {
  const { admin, booking, salon, actorUserId, actorRole } = input;
  const { reason, message, verifiedOptions, expiryHours, requestId } = await validateCustomerReschedule(input);
  const expiresAt = new Date(
    Date.now() + expiryHours * 60 * 60 * 1000,
  ).toISOString();
  const { data: proposalId, error: proposalError } = await admin.rpc(
    "create_booking_reschedule_proposal",
    {
      p_booking_id: booking.id,
      p_salon_id: booking.salon_id,
      p_proposed_by_user_id: actorUserId,
      p_proposed_by_role: actorRole,
      p_reason: reason,
      p_message: message || null,
      p_options: verifiedOptions,
      p_expires_at: expiresAt,
      p_request_id: requestId,
    },
  );
  if (proposalError) throw proposalError;
  const { data: proposal, error: loadError } = await admin
    .from("booking_reschedule_proposals")
    .select(
      "id,booking_id,status,message,reason,previous_appointment_datetime,expires_at,created_at",
    )
    .eq("id", proposalId)
    .eq("salon_id", salon.id)
    .eq("booking_id", booking.id)
    .single();
  if (loadError) throw loadError;
  return deliverCustomerRescheduleProposal({ admin, booking, salon, proposal, verifiedOptions, rootUrl: input.rootUrl });
}

/** Existing per-channel delivery deduplication is reused only after a durable proposal exists. */
export async function deliverCustomerRescheduleProposal(input: {
  admin: SupabaseClient; booking: Row; salon: Row; proposal: Row;
  verifiedOptions: Array<{ appointment_datetime: string; duration_hours: number; stylist_id: string | null; stylist_name: string }>;
  rootUrl: string;
}) {
  const { admin, booking, salon, proposal, verifiedOptions } = input;
  const proposalId = String(proposal.id);
  const message = String(proposal.message || "");
  const timeZone = salonTimeZone(salon.time_zone);
  if (proposal.status !== "Pending" || new Date(String(proposal.expires_at)).getTime() <= Date.now()) return {proposal,warnings:[]};
  const access = await issueGuestBookingToken(admin, String(booking.id), {
    reason: "Reschedule proposal",
    rootUrl: input.rootUrl,
    reuseActive: true,
  });
  const copy = rescheduleCopy(String(booking.preferred_locale || "en"));
  const subject = cleanText(
    await engineValue(
      admin,
      "notifications.booking_reschedule_subject",
      "Your salon proposed new appointment times",
    ),
    140,
  );
  const proposedList = verifiedOptions
    .map(
      (option) =>
        `<li style="margin:8px 0">${escapeHtml(
          displayWhen(option.appointment_datetime, timeZone, copy.locale),
        )} · ${escapeHtml(option.stylist_name)}</li>`,
    )
    .join("");
  const currentTime = displayWhen(
    String(booking.appointment_datetime),
    timeZone,
    copy.locale,
  );
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:${NON_DOM_VISUAL_TOKENS.lightSurface};padding:28px;color:${NON_DOM_VISUAL_TOKENS.primaryText}"><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(salon.name)}</p><p>${escapeHtml(copy.current)} <strong>${escapeHtml(currentTime)}</strong></p><ul>${proposedList}</ul>${message ? `<p>${escapeHtml(copy.originalMessage)}: ${escapeHtml(message)}</p>` : ""}<p>${escapeHtml(copy.unchanged)}</p><p>${escapeHtml(copy.expires)} ${escapeHtml(displayWhen(String(proposal.expires_at), timeZone, copy.locale))}</p><a href="${escapeHtml(access.url)}">${escapeHtml(copy.review)}</a></div>`;
  const sms = `${String(salon.name)}: ${copy.title}. ${copy.unchanged} ${access.url}`;
  const tasks: Array<{ recipientType: "customer"; channel: "email" | "sms" | "push"; destination: string; run: () => Promise<unknown> }> = [];
  if (booking.guest_email) tasks.push({ recipientType: "customer", channel: "email", destination: String(booking.guest_email), run: () => sendEmail(String(booking.guest_email), copy.locale === "en" ? subject : copy.title, emailHtml, "bookings", { idempotencyKey: `reschedule-${proposalId}-email` }) });
  if (booking.guest_phone) tasks.push({ recipientType: "customer", channel: "sms", destination: String(booking.guest_phone), run: () => sendSms(String(booking.guest_phone), sms) });
  if (booking.customer_id) {
    tasks.push({ recipientType: "customer", channel: "push", destination: String(booking.customer_id), run: () => sendPushToUsers([String(booking.customer_id)], { title: copy.title, body: copy.unchanged, url: new URL(access.url).pathname, tag: `reschedule-${proposalId}`, requireInteraction: true }) });
    const { error } = await admin.from("notifications").upsert({ user_id: booking.customer_id, salon_id: booking.salon_id, booking_id: booking.id, recipient_role: "customer", category: "bookings", severity: "info", dedupe_key: `reschedule-proposal:${proposalId}`, title: copy.title, body: copy.unchanged, action_url: new URL(access.url).pathname, delivery_status: "delivered" }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) throw error;
  }
  const channels = await bookingDeliveryChannels(admin);
  const deliveries = await runDeliveries(String(booking.id), `reschedule_proposal:${proposalId}`, tasks.filter(task => channels.has(task.channel)));
  const warningReferences = deliveries.flatMap(result => result.request_id ? [result.request_id] : []);
  return {
    proposal: {
      ...proposal,
      options: verifiedOptions,
    },
    manageUrl: access.url,
    warnings: warningReferences.map((reference) => ({
      message: `The proposal was saved, but a notification needs attention. Reference ${reference}.`,
      request_id: reference,
    })),
  };
}
