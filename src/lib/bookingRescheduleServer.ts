import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import { normalizeRescheduleLocalOptions } from "@/lib/bookingRescheduleCore";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { issueGuestBookingToken } from "@/lib/guestBookingAccess";
import { capturePlatformError } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { sendEmail, sendSms } from "@/lib/supabaseAdmin";
import { sendPushToUsers } from "@/lib/webPushServer";

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

function displayWhen(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
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

export async function createCustomerApprovedReschedule(input: {
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
}) {
  const {
    admin,
    request,
    booking,
    salon,
    actorUserId,
    actorRole,
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
  const availabilityByDate = new Map<
    string,
    Awaited<ReturnType<typeof bookingAvailability>>
  >();
  const verifiedOptions: Array<{
    appointment_datetime: string;
    duration_hours: number;
  }> = [];
  for (const local of localOptions) {
    const [date, time] = local.split("T");
    let availability = availabilityByDate.get(date);
    if (!availability) {
      availability = await bookingAvailability({
        salonId: String(booking.salon_id),
        styleId: String(booking.style_id),
        stylistId: booking.stylist_id ? String(booking.stylist_id) : null,
        customerId: booking.customer_id ? String(booking.customer_id) : null,
        guestEmail: String(booking.guest_email || ""),
        date,
        excludeBookingId: String(booking.id),
      });
      availabilityByDate.set(date, availability);
    }
    const slot = availability.slots.find(
      (candidate) =>
        candidate.value === time &&
        (!booking.stylist_id ||
          candidate.stylistId === String(booking.stylist_id)),
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
      duration_hours: Math.max(
        0.25,
        Number(availability.durationMinutes || 60) / 60,
      ),
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
    },
  );
  if (proposalError) throw proposalError;
  const access = await issueGuestBookingToken(admin, String(booking.id), {
    reason: "Reschedule proposal",
    rootUrl: input.rootUrl,
  });
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
          displayWhen(option.appointment_datetime, timeZone),
        )}</li>`,
    )
    .join("");
  const currentTime = displayWhen(
    String(booking.appointment_datetime),
    timeZone,
  );
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;background:#FBF4EE;padding:28px;border-radius:16px;color:#1A1220"><h1 style="font-family:Georgia,serif;color:#5B1A6B">New appointment times from ${escapeHtml(salon.name)}</h1><p>Your current appointment is <strong>${escapeHtml(currentTime)}</strong>. The salon proposed:</p><ul>${proposedList}</ul>${message ? `<p><strong>Salon message:</strong> ${escapeHtml(message)}</p>` : ""}<p>This proposal expires in ${expiryHours} hours. Your booking will not change unless you accept a time.</p><a href="${escapeHtml(access.url)}" style="display:inline-block;background:#D6186B;color:#fff;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700">Review proposed times</a></div>`;
  const sms = `${String(salon.name)} proposed new appointment times. Your booking will not change unless you accept. Review securely: ${access.url}`;
  const tasks: Array<{
    channel: string;
    run: () => Promise<unknown>;
  }> = [];
  if (booking.guest_email) {
    tasks.push({
      channel: "email",
      run: () =>
        sendEmail(
          String(booking.guest_email),
          subject || "Your salon proposed new appointment times",
          emailHtml,
          "bookings",
        ),
    });
  }
  if (booking.guest_phone) {
    tasks.push({
      channel: "sms",
      run: () => sendSms(String(booking.guest_phone), sms),
    });
  }
  if (booking.customer_id) {
    tasks.push({
      channel: "push",
      run: () =>
        sendPushToUsers([String(booking.customer_id)], {
          title: "Your salon proposed new times",
          body: `Your ${String(booking.style_name || "appointment")} will not change until you accept.`,
          url: new URL(access.url).pathname,
          tag: `reschedule-${proposalId}`,
          requireInteraction: true,
        }),
    });
    const { error: notificationError } = await admin
      .from("notifications")
      .insert({
        user_id: booking.customer_id,
        salon_id: booking.salon_id,
        booking_id: booking.id,
        recipient_role: "customer",
        category: "bookings",
        severity: "info",
        dedupe_key: `reschedule-proposal:${proposalId}`,
        title: "Your salon proposed new times",
        body: "Review the options. Your booking remains unchanged until you accept.",
        action_url: new URL(access.url).pathname,
        delivery_status: "delivered",
      });
    if (notificationError) throw notificationError;
  }
  const warningReferences: string[] = [];
  const deliveries = await Promise.allSettled(tasks.map((task) => task.run()));
  for (const [index, result] of deliveries.entries()) {
    if (result.status === "fulfilled") continue;
    warningReferences.push(
      await capturePlatformError({
        request,
        admin,
        error: result.reason,
        feature: "booking-rescheduling",
        action: `deliver_proposal_${tasks[index].channel}`,
        actorRole,
        actorId: actorUserId,
        salonId: String(booking.salon_id),
        recordType: "booking",
        recordId: String(booking.id),
        provider: tasks[index].channel,
        safeMessage:
          "The reschedule proposal was saved, but one customer notification could not be delivered.",
      }),
    );
  }
  const { data: proposal, error: loadError } = await admin
    .from("booking_reschedule_proposals")
    .select(
      "id,booking_id,status,message,reason,previous_appointment_datetime,expires_at,created_at",
    )
    .eq("id", proposalId)
    .single();
  if (loadError) throw loadError;
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
