import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(request, "admin-review-moderation", 40, 60_000);
    const { admin, user } = await requireAdminPermission(request, "reviews");
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 20).toLowerCase();
    const reason = cleanText(body.reason, 1_000);
    if (!["hidden", "restored", "resolved"].includes(action)) {
      return Response.json(
        { error: "Choose Hide, Restore, or Resolve." },
        { status: 400 },
      );
    }
    if (reason.length < 10) {
      return Response.json(
        { error: "Enter a moderation reason of at least 10 characters." },
        { status: 400 },
      );
    }
    const { data, error } = await admin.rpc("admin_moderate_review", {
      target_review_id: id,
      moderation_action: action,
      moderation_reason: reason,
      acting_admin_id: user.id,
    });
    if (error) {
      if (/REVIEW_NOT_FOUND/i.test(error.message)) {
        return Response.json({ error: "Review not found." }, { status: 404 });
      }
      if (/ACTION_INVALID|REASON_INVALID/i.test(error.message)) {
        return Response.json(
          { error: "Check the moderation action and enter a clear reason." },
          { status: 400 },
        );
      }
      throw error;
    }
    return Response.json(
      { review: data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfter) },
        },
      );
    }
    const message = error instanceof Error ? error.message : "";
    if (/^Unauthorized\b/i.test(message)) {
      return Response.json(
        { error: "Admin sign-in is required." },
        { status: 401 },
      );
    }
    if (/^Forbidden\b/i.test(message)) {
      return Response.json(
        { error: "Your admin role cannot moderate reviews." },
        { status: 403 },
      );
    }
    throw error;
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/reviews/[id]/moderate", "POST", {
    feature: "verified-reviews",
    actorRole: "admin",
    safeMessage: "The review moderation action could not be completed.",
  }),
  POSTHandler,
);
