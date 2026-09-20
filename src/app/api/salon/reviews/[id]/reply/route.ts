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
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key=>!['reply','request_id','expected_revision'].includes(key))) {
      return Response.json({error:'Check the reply and try again.'},{status:400});
    }
    const revised = body.request_id !== undefined || body.expected_revision !== undefined;
    if(revised && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(body.request_id)) || !Number.isSafeInteger(body.expected_revision) || Number(body.expected_revision)<0)) {
      return Response.json({error:'Check the reply and try again.'},{status:400});
    }
    const reply = cleanText(body.reply, 2_000);
    if (!reply) {
      return Response.json({ error: "Write a reply before saving." }, { status: 400 });
    }
    // Resolve the selected authenticated business before any provider call.
    // A permission at one business never authorizes another business's review.
    const authorized = await admin.from('reviews').select('id').eq('id',id).eq('salon_id',salonContext.salon.id).maybeSingle();
    if(authorized.error) throw authorized.error;
    if(!authorized.data) return Response.json({error:'Review not found.'},{status:404});
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
    const { data, error } = revised ? await admin.rpc('save_business_review_reply',{
      p_salon:salonContext.salon.id,p_review:id,p_actor:salonContext.user.id,
      p_request:body.request_id,p_revision:body.expected_revision,p_reply:reply,
      p_moderation:pending?'Pending':'Clear',p_reason:pending?moderation.reason||'provider-context-review':null,p_source:pending?moderation.source:null,
    }) : await admin.rpc("submit_salon_review_reply", {
      target_review_id: id,
      reply_text: reply,
      content_moderation_status: pending ? "Pending" : "Clear",
      detection_reason: pending ? moderation.reason || "provider-context-review" : null,
      detection_source: pending ? moderation.source : null,
      acting_user_id: salonContext.user.id,
    });
    if (error) {
      if (/REPLY_STALE/i.test(error.message)) {
        return Response.json({error:'This reply changed elsewhere. Your draft is kept; reload the current review before saving.',code:'REVIEW_REPLY_STALE'},{status:409});
      }
      if (/REQUEST_REUSED|INPUT_INVALID/i.test(error.message)) {
        return Response.json({error:'Check the reply and try again.'},{status:400});
      }
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
    const held = revised ? data.content_status==='pending' : pending;
    return Response.json({
      review: revised ? data.review : data,
      content_status: held ? "pending" : "published",
      message: revised && data.replayed ? 'This request was already processed. The current review has been loaded.' : held
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
