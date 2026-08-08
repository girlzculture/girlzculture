import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let admin;
  try {
    enforceRateLimit(request, "salon-review-reply", 30, 60_000);
    const salonContext = await requireSalonPermission(request, "reviews");
    admin = salonContext.admin;
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return Response.json({ error: "Review not found." }, { status: 404 });
    }
    const body = await request.json() as Record<string, unknown>;
    const reply = cleanText(body.reply, 2_000);
    if (!reply) {
      return Response.json({ error: "Write a reply before saving." }, { status: 400 });
    }
    const moderation = await moderatePublicContent(admin, { body: reply });
    if (moderation.outcome === "block") {
      return Response.json({
        error: `Please revise your reply. "${moderation.matchedInput || moderation.matchedText || "unsafe language"}" appears to contain prohibited language. Your text has been kept in the editor.`,
        field: "body",
        prohibited_phrase: moderation.matchedInput || moderation.matchedText,
        code: "REVIEW_REPLY_BLOCKED",
      }, { status: 422 });
    }
    const pending = moderation.outcome === "review";
    const { data, error } = await admin.rpc("submit_salon_review_reply", {
      target_review_id: id,
      reply_text: reply,
      content_moderation_status: pending ? "Pending" : "Clear",
      detection_reason: pending ? moderation.reason || "provider-context-review" : null,
      detection_source: pending ? moderation.source : null,
      acting_user_id: salonContext.user.id,
    });
    if (error) {
      if (/NOT_FOUND/i.test(error.message)) {
        return Response.json({ error: "Review not found." }, { status: 404 });
      }
      if (/FORBIDDEN/i.test(error.message)) {
        return Response.json({ error: "Your salon role cannot reply to this review." }, { status: 403 });
      }
      if (/NOT_VISIBLE/i.test(error.message)) {
        return Response.json({ error: "A hidden or removed review cannot receive a public reply." }, { status: 409 });
      }
      if (/ALREADY_EXISTS/i.test(error.message)) {
        return Response.json({ error: "This review already has a salon reply." }, { status: 409 });
      }
      if (/REPLY_PENDING/i.test(error.message)) {
        return Response.json({ error: "This reply is already awaiting platform moderation." }, { status: 409 });
      }
      throw error;
    }
    return Response.json({
      review: data,
      content_status: pending ? "pending" : "published",
      message: pending
        ? "Your reply is pending platform moderation and is not public yet."
        : "Your reply is now public.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "verified-reviews",
      action: "reply-to-review",
      actorRole: "salon",
      safeMessage: "The review reply could not be saved.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/reviews/[id]/reply", "POST", {
    feature: "verified-reviews",
    actorRole: "salon",
    safeMessage: "The review reply could not be saved.",
  }),
  POSTHandler,
);
