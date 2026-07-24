import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  auditGuestBookingAccess,
  issueGuestBookingToken,
  recoveryCodeMatches,
} from "@/lib/guestBookingAccess";
import {
  cleanText,
  enforceRateLimit,
  publicErrorResponse,
} from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "guest-booking-recovery-verify", 10, 15 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    const challengeId = cleanText(body.challenge_id, 60);
    const code = cleanText(body.code, 8);
    if (
      !/^[0-9a-f-]{36}$/i.test(challengeId) ||
      !/^\d{6}$/.test(code)
    ) {
      return Response.json(
        { error: "Enter the six-digit code from your message." },
        { status: 400 },
      );
    }
    const admin = getSupabaseAdmin();
    const { data: challenge, error } = await admin
      .from("booking_guest_recovery_challenges")
      .select("id,booking_id,code_hash,expires_at,consumed_at,attempts")
      .eq("id", challengeId)
      .maybeSingle();
    if (error) throw error;
    const available =
      challenge &&
      !challenge.consumed_at &&
      challenge.attempts < 5 &&
      new Date(challenge.expires_at).getTime() > Date.now();
    const matches =
      available &&
      recoveryCodeMatches(challenge.id, code, challenge.code_hash);
    if (!matches) {
      if (challenge && !challenge.consumed_at && challenge.attempts < 5) {
        const { error: attemptError } = await admin
          .from("booking_guest_recovery_challenges")
          .update({ attempts: challenge.attempts + 1 })
          .eq("id", challenge.id)
          .is("consumed_at", null);
        if (attemptError) throw attemptError;
      }
      await auditGuestBookingAccess(admin, request, {
        bookingId: challenge?.booking_id || null,
        action: "recovery_failed",
        outcome: "denied",
      });
      return Response.json(
        { error: "That code is invalid or expired. Request a new code." },
        { status: 400 },
      );
    }
    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await admin
      .from("booking_guest_recovery_challenges")
      .update({ consumed_at: consumedAt })
      .eq("id", challenge.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumed) {
      return Response.json(
        { error: "That code was already used. Request a new code." },
        { status: 409 },
      );
    }
    const root = (
      process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
    ).replace(/\/$/, "");
    const access = await issueGuestBookingToken(admin, challenge.booking_id, {
      reason: "Verified recovery",
      rootUrl: root,
    });
    await auditGuestBookingAccess(admin, request, {
      bookingId: challenge.booking_id,
      tokenId: access.tokenId,
      action: "recovery_verified",
      outcome: "completed",
    });
    return Response.json({ manage_url: access.url });
  } catch (error) {
    noteOperationalFailure("Guest booking recovery verification failed", error);
    return publicErrorResponse(
      error,
      "We could not verify this recovery code. Try again shortly.",
    );
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/guest/bookings/recovery/verify", "POST", {
    classification: "provider-backed",
    feature: "guest-booking-recovery",
    actorRole: "guest",
    safeMessage: "The secure booking recovery code could not be verified.",
  }),
  POSTHandler,
);
