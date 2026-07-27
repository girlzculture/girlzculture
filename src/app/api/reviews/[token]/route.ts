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
    const displayName = cleanText(body.display_name, 60);
    if (!displayName)
      return Response.json(
        { error: "Enter the first name or display name you want shown publicly." },
        { status: 400 },
      );
    if (writtenReview.length < 10)
      return Response.json({ error: "Write at least 10 characters about your experience." }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("submit_verified_guest_review", {
      p_token_hash: reviewTokenHash(token),
      p_display_name: displayName,
      p_rating_overall: ratings[0],
      p_rating_price_accuracy: ratings[1],
      p_rating_punctuality: ratings[2],
      p_rating_quality: ratings[3],
      p_rating_cleanliness: ratings[4],
      p_would_return: body.would_return !== false,
      p_written_review: writtenReview,
      p_result_photos: [],
    });
    if (error) {
      if (/INVALID|EXPIRED|NOT_ELIGIBLE/i.test(error.message))
        return Response.json(
          { error: "This review link is invalid, expired, or no longer eligible." },
          { status: 409 },
        );
      throw error;
    }
    return Response.json({ review: data, state: "submitted" });
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
    classification: "public-read-only",
    feature: "verified-reviews",
    actorRole: "guest",
    safeMessage: "Your review could not be submitted.",
  }),
  POSTHandler,
);
