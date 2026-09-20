import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { moderatePublicContent } from "@/lib/contentModerationServer";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { draftMarketingCopies, marketingCopies, marketingDestinations, marketingId, MarketingInputError, marketingPublication, marketingRecord, marketingRevision, marketingSource, MARKETING_LOCALES, type MarketingSnapshot } from "@/lib/businessMarketing";
import { publicGalleryPhotos } from "@/lib/businessPhotoMetadata";

const headers = { "Cache-Control": "private, no-store" };
const fields = "id,revision,status,source,snapshot,copies,booking_path,public_path,scheduled_at,expires_at,published_at,updated_at,last_error";
async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonPermission>> | undefined;
  try {
    context = await requireSalonPermission(request, "promotions");
    const { admin, salon, user, isOwner } = context;
    // Publishing marketing claims and customer work requires the owner. Team
    // section permission never substitutes for owner consent.
    if (!isOwner) return Response.json({ code: "MARKETING_FORBIDDEN", error: "The business owner manages approved marketing content." }, { status: 403, headers });
    enforceRateLimit(request, `business-marketing:${user.id}`, 40, 60_000);
    if (request.method === "GET") {
      const [posts, services, offers, completed] = await Promise.all([
        admin.from("business_marketing_posts").select(fields).eq("salon_id", salon.id).order("updated_at", { ascending: false }).limit(100),
        admin.from("styles").select("id,name,base_price,price_display_min,price_display_max,service_group_id,master_style_id").eq("salon_id", salon.id).is("archived_at", null).or("is_draft.is.null,is_draft.eq.false").order("name").limit(200),
        admin.from("salon_promotions").select("id,title,public_headline,target_scope,target_ids,starts_at,ends_at").eq("salon_id", salon.id).eq("status", "Active").eq("is_active", true).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
        admin.from("bookings").select("id,style_id,appointment_datetime").eq("salon_id", salon.id).eq("status", "Completed").order("appointment_datetime", { ascending: false }).limit(50),
      ]);
      for (const result of [posts, services, offers, completed]) if (result.error) throw result.error;
      return Response.json({ posts: posts.data, sources: { photos: publicGalleryPhotos(salon.gallery_photos).map(url => ({ url, ...(salon.photo_metadata?.[url] || {}) })), services: services.data, promotions: offers.data, completed_services: completed.data }, time_zone: salon.time_zone || "America/New_York", external_posting: false }, { headers });
    }
    const body = await request.json();
    if (body?.action === "generate") {
      marketingRecord(body, ["action", "source"]);
      const source = marketingSource(body.source);
      const result = await admin.rpc("business_marketing_snapshot", { p_salon: salon.id, p_source: source });
      if (result.error) throw result.error;
      const snapshot = result.data as MarketingSnapshot;
      if (snapshot?.business?.id !== salon.id) throw new Error("MARKETING_SOURCE_CHANGED");
      return Response.json({ source, snapshot, copies: draftMarketingCopies(snapshot), ...marketingDestinations(snapshot), generated_from: "verified_business_records", saved: false, external_posting: false }, { headers });
    }
    let result;
    if (body?.action === "save") {
      marketingRecord(body, ["action", "id", "revision", "source", "copies"]);
      const id = marketingId(body.id);
      const revision = body.revision === 0 ? 0 : marketingRevision(body.revision);
      const source = marketingSource(body.source), copies = marketingCopies(body.copies);
      const moderation = await moderatePublicContent(admin, { name: copies.en.title, body: MARKETING_LOCALES.map(locale => `${copies[locale].title}\n${copies[locale].body}`).join("\n") });
      if (!moderation.allowed) throw new MarketingInputError("MARKETING_CONTENT_REVIEW");
      result = await admin.rpc("save_business_marketing_post", { p_salon: salon.id, p_actor: user.id, p_id: id, p_revision: revision, p_source: source, p_copies: copies });
    } else if (body?.action === "approve") {
      const confirmation = marketingPublication(body);
      const saved = await admin.from("business_marketing_posts").select(fields).eq("id", confirmation.id).eq("salon_id", salon.id).maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) throw new MarketingInputError("MARKETING_NOT_FOUND");
      const copies = marketingCopies(saved.data.copies);
      const moderation = await moderatePublicContent(admin, { name: copies.en.title, body: MARKETING_LOCALES.map(locale => `${copies[locale].title}\n${copies[locale].body}`).join("\n") });
      if (!moderation.allowed) throw new MarketingInputError("MARKETING_CONTENT_REVIEW");
      result = await admin.rpc("approve_business_marketing_post", { p_salon: salon.id, p_actor: user.id, p_id: confirmation.id, p_revision: confirmation.revision, p_scheduled: confirmation.scheduled_at, p_expires: confirmation.expires_at, p_reviewed: [...MARKETING_LOCALES], p_media_permission: true });
    } else if (body?.action === "cancel") {
      marketingRecord(body, ["action", "id", "revision", "confirm"]);
      if (body.confirm !== true) throw new MarketingInputError("MARKETING_REVIEW_REQUIRED");
      result = await admin.rpc("cancel_business_marketing_post", { p_salon: salon.id, p_actor: user.id, p_id: marketingId(body.id), p_revision: marketingRevision(body.revision) });
    } else throw new MarketingInputError("MARKETING_INVALID");
    if (result.error) throw result.error;
    if (!result.data?.id || !Number.isInteger(result.data.revision)) throw new Error("MARKETING_READBACK_FAILED");
    const fresh = await admin.from("business_marketing_posts").select(fields).eq("id", result.data.id).eq("salon_id", salon.id).single();
    if (fresh.error || fresh.data?.revision !== result.data.revision || fresh.data?.status !== result.data.status) throw fresh.error || new Error("MARKETING_READBACK_FAILED");
    return Response.json({ post: fresh.data, verified: true, external_posting: false }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof MarketingInputError) {
      const code = error instanceof MarketingInputError ? error.code : "MARKETING_INVALID";
      return Response.json({ code, error: "Review the selected source, caption and publication details." }, { status: code === "MARKETING_NOT_FOUND" ? 404 : 400, headers });
    }
    if (error instanceof RateLimitError) return Response.json({ code: "MARKETING_RATE_LIMIT", error: "Wait a moment before trying again." }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
    const message = String((error as { message?: unknown })?.message || "");
    if (/Unauthorized|Forbidden|MARKETING_FORBIDDEN/.test(message)) return Response.json({ code: "MARKETING_FORBIDDEN", error: "The business owner must sign in to manage marketing." }, { status: /Unauthorized/.test(message) ? 401 : 403, headers });
    const conflict = message.match(/MARKETING_(?:STALE|NOT_FOUND|SOURCE_CHANGED|PAGE_NOT_READY|SCHEDULE_INVALID|OFFER_WINDOW|REVIEW_REQUIRED)/)?.[0];
    const safeMessage = conflict ? "The saved marketing source or publication details changed. Reload and review the draft before approval." : "Marketing content could not be verified. Your entered work is still available to retry.";
    const reference = await capturePlatformError({ request, admin: context?.admin, actorId: context?.user.id, salonId: context?.salon.id, actorRole: "salon", feature: "business-marketing", action: request.method.toLowerCase(), error, safeMessage });
    return safeFailure(safeMessage, reference, conflict ? 409 : 500, { code: conflict || "MARKETING_UNAVAILABLE" });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/marketing", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/marketing", "POST"), handle);
