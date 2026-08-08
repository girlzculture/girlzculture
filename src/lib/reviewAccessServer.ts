import "server-only";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const DAY = 24 * 60 * 60 * 1000;

function secret() {
  const value =
    process.env.REVIEW_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("REVIEW_LINK_SIGNING_NOT_CONFIGURED");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function reviewTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyReviewToken(token: string) {
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied || !/^[A-Za-z0-9_-]+$/.test(payload + supplied))
    return null;
  const expected = signature(payload);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { booking_id?: string; nonce?: string; expires_at?: number };
    if (
      !/^[0-9a-f-]{36}$/i.test(String(value.booking_id || "")) ||
      !value.nonce ||
      Number(value.expires_at || 0) <= Date.now()
    )
      return null;
    return {
      bookingId: String(value.booking_id),
      expiresAt: Number(value.expires_at),
    };
  } catch {
    return null;
  }
}

export async function issueBookingReviewLink(
  bookingId: string,
  rootUrl: string,
) {
  const expiresAt = Date.now() + 30 * DAY;
  const payload = Buffer.from(
    JSON.stringify({
      booking_id: bookingId,
      nonce: randomBytes(24).toString("base64url"),
      expires_at: expiresAt,
    }),
  ).toString("base64url");
  const token = `${payload}.${signature(payload)}`;
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("booking_review_links").upsert(
    {
      booking_id: bookingId,
      token_hash: reviewTokenHash(token),
      expires_at: new Date(expiresAt).toISOString(),
      first_opened_at: null,
      used_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id" },
  );
  if (error) throw error;
  return {
    token,
    url: `${rootUrl.replace(/\/$/, "")}/review/${encodeURIComponent(token)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function resolveBookingReviewLink(token: string) {
  const verified = verifyReviewToken(token);
  if (!verified)
    return { state: "invalid" as const, message: "This review link is invalid or has expired." };
  const admin = getSupabaseAdmin();
  const tokenHash = reviewTokenHash(token);
  const { data: link, error: linkError } = await admin
    .from("booking_review_links")
    .select("id,booking_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link || new Date(link.expires_at).getTime() <= Date.now())
    return { state: "invalid" as const, message: "This review link is invalid or has expired." };
  if (link.booking_id !== verified.bookingId)
    return { state: "invalid" as const, message: "This review link is invalid or has expired." };
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id,salon_id,status,appointment_datetime,public_reference,confirmation_code,cancelled_at,refund_status",
    )
    .eq("id", link.booking_id)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking)
    return { state: "invalid" as const, message: "This review link is invalid or has expired." };
  const [{ data: salon, error: salonError }, { data: existing, error: reviewError }] =
    await Promise.all([
      admin.from("salons").select("id,name,slug").eq("id", booking.salon_id).maybeSingle(),
      admin
        .from("reviews")
        .select(
          "id,display_name,review_title,rating_overall,rating_price_accuracy,rating_punctuality,rating_quality,rating_cleanliness,would_return,written_review,moderation_status,dispute_status,created_at",
        )
        .eq("booking_id", booking.id)
        .maybeSingle(),
    ]);
  if (salonError) throw salonError;
  if (reviewError) throw reviewError;
  if (!salon)
    return { state: "invalid" as const, message: "This review link is invalid or has expired." };
  if (existing)
    return {
      state: "used" as const,
      booking,
      salon,
      review:
        existing.moderation_status === "Published" && existing.dispute_status !== "Removed"
          ? existing
          : undefined,
      message:
        existing.moderation_status === "Published" && existing.dispute_status !== "Removed"
          ? "A verified review was already submitted for this booking."
          : "A verified rating was submitted for this booking. Moderated review text is not displayed.",
    };
  const eligible =
    booking.status === "Completed" &&
    !booking.cancelled_at &&
    !["pending", "succeeded", "refunded"].includes(
      String(booking.refund_status || "").toLowerCase(),
    );
  if (!eligible)
    return {
      state: "ineligible" as const,
      booking,
      salon,
      message: "This booking is not eligible for a review.",
    };
  await admin
    .from("booking_review_links")
    .update({ first_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", link.id)
    .is("first_opened_at", null);
  return { state: "eligible" as const, booking, salon, tokenHash };
}
