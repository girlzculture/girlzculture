import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  cleanText,
  enforceRateLimit,
  publicErrorResponse,
} from "@/lib/requestSecurity";
import {
  resolveBookingReviewLink,
  reviewTokenHash,
  verifyReviewToken,
} from "@/lib/reviewAccessServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { moderatePublicContent } from "@/lib/contentModerationServer";

export const runtime = "nodejs";

async function GETHandler(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    const resolution = await resolveBookingReviewLink(token);
    return Response.json(resolution, {
      status: resolution.state === "invalid" ? 404 : 200,
    });
  } catch (error) {
    noteOperationalFailure("Review-link resolution failed", error);
    return publicErrorResponse(error, "This review link could not be opened.");
  }
}

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    enforceRateLimit(request, "verified-guest-review", 8, 10 * 60_000);
    const { token } = await context.params;
    if (!verifyReviewToken(token))
      return Response.json(
        { error: "This review link is invalid or has expired." },
        { status: 404 },
      );
    const body = (await request.json()) as Record<string, unknown>;
    const ratings = [
      "rating_overall",
      "rating_price_accuracy",
      "rating_punctuality",
      "rating_quality",
      "rating_cleanliness",
    ].map((key) => Number(body[key]));
    if (ratings.some((value) => !Number.isInteger(value) || value < 1 || value > 5))
      return Response.json({ error: "Choose a rating from 1 to 5 for every category." }, { status: 400 });
    const writtenReview = cleanText(body.written_review, 3000);
    const displayName = cleanText(body.display_name, 40);
    const reviewTitle = cleanText(body.review_title, 100);
    const admin = getSupabaseAdmin();
    const moderation = await moderatePublicContent(admin, {
      name: displayName,
      title: reviewTitle,
      body: writtenReview,
    });
    if (moderation.outcome === "block")
      return Response.json(
        {
          error: `Please revise your review. "${moderation.matchedInput || moderation.matchedText || "unsafe language"}" appears to contain prohibited language. Your ratings and other entries have been kept.`,
          field: moderation.field,
          prohibited_phrase: moderation.matchedInput || moderation.matchedText,
          code: "REVIEW_CONTENT_BLOCKED",
        },
        { status: 422 },
      );
    if (!displayName || /\s/u.test(displayName) || !/^[\p{L}\p{M}'\u2019-]+$/u.test(displayName))
      return Response.json(
        { error: "Enter your first name only, using letters, an apostrophe, or a hyphen." },
        { status: 400 },
      );
    if (writtenReview.length > 0 && writtenReview.length < 10)
      return Response.json({ error: "Write at least 10 characters, or leave the written review blank to submit a rating only." }, { status: 400 });
    const contentPending = moderation.outcome === "review";
    const { data, error } = await admin.rpc("submit_verified_guest_review", {
      p_token_hash: reviewTokenHash(token),
      p_display_name: displayName,
      p_review_title: reviewTitle || null,
      p_rating_overall: ratings[0],
      p_rating_price_accuracy: ratings[1],
      p_rating_punctuality: ratings[2],
      p_rating_quality: ratings[3],
      p_rating_cleanliness: ratings[4],
      p_would_return: body.would_return !== false,
      p_written_review: writtenReview,
      p_result_photos: [],
      p_content_moderation_status: contentPending ? "Pending" : "Clear",
      p_pending_reason: contentPending ? moderation.reason || "provider-context-review" : null,
      p_pending_source: contentPending ? moderation.source : null,
    });
    if (error) {
      if (/INVALID|EXPIRED|NOT_ELIGIBLE/i.test(error.message))
        return Response.json(
          { error: "This review link is invalid, expired, or no longer eligible." },
          { status: 409 },
        );
      throw error;
    }
    return Response.json({
      review: data,
      state: "submitted",
      content_status: contentPending ? "pending" : "published",
      message: contentPending
        ? "Thank you for your feedback. Your written review is being checked before it is published."
        : "Your verified review was submitted.",
    });
  } catch (error) {
    noteOperationalFailure("Verified guest review submission failed", error);
    return publicErrorResponse(error, "Your review could not be submitted.");
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/reviews/[token]", "GET", {
    classification: "public-read-only",
    feature: "verified-reviews",
    actorRole: "guest",
    safeMessage: "This review link could not be opened.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/reviews/[token]", "POST", {
    classification: "provider-backed",
    feature: "verified-reviews",
    actorRole: "guest",
    safeMessage: "Your review could not be submitted.",
  }),
  POSTHandler,
);
