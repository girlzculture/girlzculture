import { randomUUID } from "node:crypto";
import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  auditGuestBookingAccess,
  createRecoveryCode,
  guestRequestFingerprint,
  recoveryCodeHash,
} from "@/lib/guestBookingAccess";
import {
  cleanText,
  enforceRateLimit,
  publicErrorResponse,
} from "@/lib/requestSecurity";
import { normalizeEmail, normalizeUsPhone } from "@/lib/validation";
import { getSupabaseAdmin, sendEmail, sendSms } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request) {
  const challengeId = randomUUID();
  try {
    enforceRateLimit(request, "guest-booking-recovery-request", 5, 15 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    const confirmationCode = cleanText(body.confirmation_code, 60).toUpperCase();
    let email = "";
    let phone = "";
    try {
      email = body.email ? normalizeEmail(body.email) : "";
      phone = body.phone ? normalizeUsPhone(body.phone) : "";
    } catch {
      // The generic response prevents booking/email/phone enumeration.
    }
    const admin = getSupabaseAdmin();
    const { data: booking, error } = confirmationCode
      ? await admin
          .from("bookings")
          .select("id,guest_email,guest_phone")
          .eq("confirmation_code", confirmationCode)
          .maybeSingle()
      : { data: null, error: null };
    if (error) throw error;
    const emailMatches =
      Boolean(email) &&
      normalizeEmail(booking?.guest_email || "") === email;
    let phoneMatches = false;
    if (phone && booking?.guest_phone) {
      try {
        phoneMatches = normalizeUsPhone(booking.guest_phone) === phone;
      } catch {
        phoneMatches = false;
      }
    }
    if (booking && (emailMatches || phoneMatches)) {
      const code = createRecoveryCode();
      const destinationType = emailMatches ? "email" : "phone";
      const { error: insertError } = await admin
        .from("booking_guest_recovery_challenges")
        .insert({
          id: challengeId,
          booking_id: booking.id,
          code_hash: recoveryCodeHash(challengeId, code),
          destination_type: destinationType,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          request_fingerprint: guestRequestFingerprint(request),
        });
      if (insertError) throw insertError;
      if (destinationType === "email") {
        await sendEmail(
          email,
          "Your Girlz Culture secure booking code",
          `<h1>Your secure booking code</h1><p>Enter <strong>${code}</strong> to receive a new Manage Booking link. This code expires in 10 minutes.</p><p>If you did not request this, no action is needed.</p>`,
          "security",
        );
      } else {
        await sendSms(
          phone,
          `Girlz Culture secure booking code: ${code}. It expires in 10 minutes.`,
        );
      }
      await auditGuestBookingAccess(admin, request, {
        bookingId: booking.id,
        action: "recovery_requested",
        outcome: "completed",
        metadata: { channel: destinationType },
      });
    }
    return Response.json({
      challenge_id: challengeId,
      message:
        "If those details match a booking, a six-digit code is on its way.",
    });
  } catch (error) {
    noteOperationalFailure("Guest booking recovery request failed", error);
    return publicErrorResponse(
      error,
      "We could not send a recovery code. Try again shortly.",
    );
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/guest/bookings/recovery/request", "POST", {
    classification: "provider-backed",
    feature: "guest-booking-recovery",
    actorRole: "guest",
    safeMessage: "The secure booking recovery code could not be sent.",
  }),
  POSTHandler,
);
