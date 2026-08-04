import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanText } from "@/lib/requestSecurity";
import {
  UserSafeRequestError,
  capturePlatformError,
  monitoredRouteFailure,
  rejectRequest,
} from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { verifyMarketingEntitlement } from "@/lib/marketingEntitlements";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["Draft", "Scheduled", "Active", "Paused", "Expired"]);
const ENTITLEMENT_SOURCES = new Set(["stripe_payment", "verified_invoice", "platform_credit"]);

function validationField(message: string) {
  if (/salon|campaign id/i.test(message)) return "salon_id";
  if (/end time|start time|timezone/i.test(message)) return "schedule";
  if (/playback url/i.test(message)) return "video_url";
  if (/storage path/i.test(message)) return "storage_path";
  if (/description/i.test(message)) return "description";
  if (/mp4|webm|mime/i.test(message)) return "mime_type";
  if (/processing/i.test(message)) return "video_processing_job_id";
  if (/duration/i.test(message)) return "duration_seconds";
  if (/file size/i.test(message)) return "file_size_bytes";
  if (/funding|entitlement|payment|invoice|credit/i.test(message)) return "entitlement";
  if (/complimentary|reason/i.test(message)) return "reason";
  if (/radius/i.test(message)) return "radius_miles";
  if (/priority/i.test(message)) return "priority";
  if (/rotation/i.test(message)) return "rotation_weight";
  if (/status|moderation/i.test(message)) return "status";
  return "campaign";
}

async function validateReadyVideoJob(input: {
  admin: SupabaseClient;
  jobId: string;
  salonId: string;
  videoUrl: string;
  storagePath: string;
  posterUrl: string | null;
}) {
  if (!input.jobId) return;
  const { data: job, error } = await input.admin
    .from("video_processing_jobs")
    .select("id,salon_id,status,source_path,source_size_bytes,output_url,output_path,poster_url,duration_seconds,output_size_bytes,detected_container,safe_error_code,error_reference")
    .eq("id", input.jobId)
    .maybeSingle();
  if (error) throw error;
  if (!job || job.salon_id !== input.salonId) {
    rejectRequest("The video processing reference does not belong to this salon.");
  }
  if (job.status !== "Ready" || !job.output_url || !job.poster_url) {
    rejectRequest(
      job.error_reference
        ? `Video processing is not Ready. Check media reference ${job.error_reference}.`
        : "Video processing must reach Ready with a public video and poster before the campaign can be saved.",
    );
  }
  const expectedStoragePath = job.output_path || job.source_path;
  if (job.output_url !== input.videoUrl || expectedStoragePath !== input.storagePath) {
    rejectRequest("The saved video must use the Ready processing job output.");
  }
  if (job.poster_url !== input.posterUrl) {
    rejectRequest("The saved poster must use the Ready processing job output.");
  }
  return job;
}

async function savedCampaignResponse(
  admin: SupabaseClient,
  campaignId: string,
  details: Record<string, unknown> = {},
) {
  const { data: campaign, error } = await admin
    .from("trending_video_campaigns")
    .select("id,salon_id,status,moderation_status,placement_basis,video_url,storage_path,thumbnail_url,mime_type,duration_seconds,file_size_bytes,video_processing_job_id,updated_at")
    .eq("id", campaignId)
    .single();
  if (error) throw error;
  return Response.json({ campaign_id: campaignId, campaign, ...details });
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number, label: string, integer = false) {
  const parsed = value === null || value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    rejectRequest(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function validTimezone(value: unknown) {
  const timezone = cleanText(value, 80) || "America/New_York";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); }
  catch { rejectRequest("Choose a valid IANA timezone."); }
  return timezone;
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    await admin.rpc("refresh_trending_campaign_states");
    const search = new URL(request.url).searchParams;
    if (search.get("mode") === "salons") {
      const q = cleanText(search.get("q"), 100);
      let query = admin.from("salons")
        .select("id,name,address_city,address_state")
        .eq("status", "Active")
        .eq("is_discoverable", true)
        .eq("geocode_status", "success")
        .eq("address_needs_review", false)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("name")
        .limit(25);
      if (q) query = query.ilike("name", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return Response.json({ salons: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const { data, error } = await admin.from("trending_video_campaigns")
      .select("*,salon:salons(id,name,slug,address_city,address_state),entitlement:marketing_entitlements(id,source,external_reference,status,amount_minor,currency,valid_from,valid_until),audit:trending_campaign_audit(id,action,reason,created_at,acting_admin_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return Response.json({ campaigns: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "marketing", action: "load_trending_campaigns", actorRole: "admin", safeMessage: "We couldn't load Trending Picks campaigns." });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "marketing");
    monitoringAdmin = admin;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30);
    const id = cleanText(body.id, 60);
    if (action === "moderate") {
      if (!UUID.test(id)) rejectRequest("Campaign ID is invalid.");
      const decision = cleanText(body.decision, 20);
      const reason = cleanText(body.reason, 1000);
      if (!["Approved", "Rejected"].includes(decision) || reason.length < 5) rejectRequest("Choose a moderation decision and enter a reason of at least 5 characters.");
      const { error } = await admin.rpc("admin_moderate_trending_campaign", {
        acting_admin_id: user.id,
        target_campaign_id: id,
        decision,
        moderation_reason: reason,
      });
      if (error) throw error;
      return Response.json({ moderated: true });
    }
    if (action !== "save") rejectRequest("Choose a valid campaign action.");

    const salonId = cleanText(body.salon_id, 60);
    if (!UUID.test(salonId) || (id && !UUID.test(id))) rejectRequest("Choose a valid salon and campaign.");
    const startsAt = cleanText(body.starts_at, 50);
    const endsAt = cleanText(body.ends_at, 50);
    const startTime = Date.parse(startsAt);
    const endTime = Date.parse(endsAt);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) rejectRequest("Campaign end time must be after its start time.");

    const reason = cleanText(body.reason, 1000) || null;
    if (id && (!reason || reason.length < 5)) rejectRequest("Enter an internal change reason of at least 5 characters.");
    const mime = cleanText(body.mime_type, 40);
    const videoUrl = cleanText(body.video_url, 1200);
    const storagePath = cleanText(body.storage_path, 600);
    const thumbnailUrl = cleanText(body.thumbnail_url, 1200) || null;
    const description = cleanText(body.description, 180);
    if (!videoUrl) rejectRequest("The uploaded video is missing its saved playback URL. Upload the video again.");
    if (!storagePath) rejectRequest("The uploaded video is missing its storage path. Upload the video again.");
    if (!description) rejectRequest("Enter a description for this Trending Picks video.");
    if (!["video/mp4", "video/webm"].includes(mime)) rejectRequest("The saved video must be an MP4 or WebM file.");
    const processingJobId = cleanText(body.video_processing_job_id, 60);
    if (processingJobId && !UUID.test(processingJobId)) rejectRequest("Video processing reference is invalid.");
    if (processingJobId && !thumbnailUrl) rejectRequest("The Ready video is missing its generated public poster.");
    let existingMedia: Record<string, unknown> | null = null;
    if (id) {
      const existingMediaResult = await admin
        .from("trending_video_campaigns")
        .select("id,salon_id,video_url,storage_path,thumbnail_url,video_processing_job_id")
        .eq("id", id)
        .maybeSingle();
      if (existingMediaResult.error) throw existingMediaResult.error;
      if (!existingMediaResult.data) rejectRequest("Campaign not found.");
      if (existingMediaResult.data.salon_id !== salonId)
        rejectRequest("A campaign salon cannot be replaced.");
      existingMedia = existingMediaResult.data;
    }
    const mediaChanged =
      !existingMedia ||
      existingMedia.video_url !== videoUrl ||
      existingMedia.storage_path !== storagePath ||
      existingMedia.thumbnail_url !== thumbnailUrl;
    if (mediaChanged && !processingJobId) {
      rejectRequest(
        "Every new or changed video must use a Ready video processing job. Unchanged legacy campaign media remains available for status-only updates.",
      );
    }

    const status = cleanText(body.status, 20) || "Draft";
    if (!STATUSES.has(status)) rejectRequest("Choose a valid campaign status.");
    const placementBasis = cleanText(body.placement_basis, 30) || "paid";
    if (!new Set(["paid", "complimentary_admin"]).has(placementBasis)) rejectRequest("Choose a valid placement basis.");
    if (placementBasis === "complimentary_admin" && (!reason || reason.length < 5)) rejectRequest("Enter an internal reason of at least 5 characters for this complimentary placement.");
    const durationSeconds = boundedNumber(body.duration_seconds, 0, 0.01, 30.5, "Video duration");
    const fileSizeBytes = boundedNumber(body.file_size_bytes, 0, 1, 26_214_400, "Video file size", true);
    const timezone = validTimezone(body.timezone);
    const radiusMiles = boundedNumber(body.radius_miles, 25, 1, 250, "Radius");
    const priority = boundedNumber(body.priority, 50, 0, 100, "Priority", true);
    const rotationWeight = boundedNumber(body.rotation_weight, 1, 0.1, 100, "Rotation weight");
    const internalNote = cleanText(body.internal_note, 1000) || null;
    const readyVideoJob = await validateReadyVideoJob({
      admin,
      jobId: processingJobId,
      salonId,
      videoUrl,
      storagePath,
      posterUrl: thumbnailUrl,
    });
    if (readyVideoJob) {
      const authoritativeDuration = Number(readyVideoJob.duration_seconds || 0);
      if (authoritativeDuration > 0 && Math.abs(authoritativeDuration - durationSeconds) > 0.1) {
        rejectRequest("The saved duration must match the Ready processing job.");
      }
      const authoritativeSize = Number(readyVideoJob.output_size_bytes || readyVideoJob.source_size_bytes || 0);
      if (authoritativeSize > 0 && authoritativeSize !== fileSizeBytes) {
        rejectRequest("The saved file size must match the Ready processing job.");
      }
      const authoritativeMime = readyVideoJob.detected_container === "webm" ? "video/webm" : "video/mp4";
      if (mime !== authoritativeMime) {
        rejectRequest("The saved video type must match the Ready processing job.");
      }
    }

    if (placementBasis === "complimentary_admin") {
      const { data: salon, error: salonError } = await admin.from("salons")
        .select("id,status,is_discoverable,latitude,longitude,geocode_status,address_needs_review")
        .eq("id", salonId).maybeSingle();
      if (salonError) throw salonError;
      if (!salon) rejectRequest("Salon not found.");
      let existing: Record<string, unknown> | null = null;
      if (id) {
        const existingResult = await admin.from("trending_video_campaigns").select("*").eq("id", id).maybeSingle();
        if (existingResult.error) throw existingResult.error;
        if (!existingResult.data) rejectRequest("Campaign not found.");
        if (existingResult.data.salon_id !== salonId) rejectRequest("A campaign salon cannot be replaced.");
        existing = existingResult.data;
      }
      const replacementVideo = Boolean(existing && existing.storage_path !== storagePath);
      if (["Scheduled", "Active"].includes(status)) {
        if (!existing || existing.moderation_status !== "Approved") rejectRequest("Approve video moderation before scheduling or activation.");
        if (replacementVideo) rejectRequest("Save a replacement video as Draft and approve it before activation.");
        if (salon.status !== "Active" || !salon.is_discoverable || salon.latitude == null || salon.longitude == null || salon.geocode_status !== "success" || salon.address_needs_review) {
          rejectRequest("Only active, public, discoverable salons with a verified location can trend.");
        }
      }
      const now = Date.now();
      const normalizedStatus = replacementVideo ? "Draft" : ["Scheduled", "Active"].includes(status)
        ? startTime > now ? "Scheduled" : endTime <= now ? "Expired" : "Active"
        : status;
      const savedValues: Record<string, unknown> = {
        salon_id: salonId,
        entitlement_id: null,
        placement_basis: "complimentary_admin",
        complimentary_reason: reason,
        complimentary_approved_by: user.id,
        complimentary_approved_at: new Date().toISOString(),
        video_url: videoUrl,
        storage_path: storagePath,
        thumbnail_url: thumbnailUrl,
        description,
        duration_seconds: durationSeconds,
        file_size_bytes: fileSizeBytes,
        mime_type: mime,
        status: normalizedStatus,
        starts_at: new Date(startTime).toISOString(),
        ends_at: new Date(endTime).toISOString(),
        timezone,
        radius_miles: radiusMiles,
        priority,
        rotation_weight: rotationWeight,
        internal_note: internalNote,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      if (replacementVideo) Object.assign(savedValues, { moderation_status: "Pending", moderation_note: null, moderated_by: null, moderated_at: null });
      let savedId = id;
      if (id) {
        const updateResult = await admin.from("trending_video_campaigns").update(savedValues).eq("id", id).select("id").single();
        if (updateResult.error) throw updateResult.error;
      } else {
        const insertResult = await admin.from("trending_video_campaigns").insert({ ...savedValues, created_by: user.id }).select("id").single();
        if (insertResult.error) throw insertResult.error;
        savedId = insertResult.data.id;
      }
      const auditResult = await admin.from("trending_campaign_audit").insert({
        campaign_id: savedId,
        action: id ? "Complimentary placement edited" : "Complimentary placement created",
        previous_values: existing,
        new_values: savedValues,
        reason,
        acting_admin_id: user.id,
      });
      if (auditResult.error) throw auditResult.error;
      if (processingJobId) {
        const linked = await admin.from("trending_video_campaigns").update({ video_processing_job_id: processingJobId }).eq("id", savedId).eq("salon_id", salonId);
        if (linked.error) throw linked.error;
      }
      return savedCampaignResponse(admin, savedId, { placement_basis: placementBasis });
    }
    let entitlementSource = cleanText(body.entitlement_source, 40) || null;
    if (entitlementSource && !ENTITLEMENT_SOURCES.has(entitlementSource)) rejectRequest("Choose a valid paid entitlement source.");
    let entitlementReference = cleanText(body.entitlement_reference, 160) || null;
    if (Boolean(entitlementSource) !== Boolean(entitlementReference)) {
      rejectRequest("Choose both a verified funding source and its payment, invoice, or platform-credit reference.");
    }
    // Status controls and older admin screens must not detach evidence that is
    // already linked to a paid campaign. Reuse the canonical entitlement by ID;
    // if it is absent, activation below fails with an actionable field error.
    if (id && status !== "Draft" && !entitlementSource && !entitlementReference) {
      const existingCampaign = await admin
        .from("trending_video_campaigns")
        .select("salon_id,entitlement_id")
        .eq("id", id)
        .maybeSingle();
      if (existingCampaign.error) throw existingCampaign.error;
      if (!existingCampaign.data) rejectRequest("Campaign not found.");
      if (existingCampaign.data.salon_id !== salonId) rejectRequest("A campaign salon cannot be replaced.");
      if (existingCampaign.data.entitlement_id) {
        const linkedEntitlement = await admin
          .from("marketing_entitlements")
          .select("source,external_reference")
          .eq("id", existingCampaign.data.entitlement_id)
          .maybeSingle();
        if (linkedEntitlement.error) throw linkedEntitlement.error;
        const linkedSource = cleanText(linkedEntitlement.data?.source, 40) || null;
        const linkedReference = cleanText(linkedEntitlement.data?.external_reference, 160) || null;
        if (linkedSource && ENTITLEMENT_SOURCES.has(linkedSource) && linkedReference) {
          entitlementSource = linkedSource;
          entitlementReference = linkedReference;
        }
      }
    }
    if (status !== "Draft" && (!entitlementSource || !entitlementReference)) {
      rejectRequest("This paid campaign has no verified funding evidence. Enter its payment, invoice, or platform-credit source and reference before changing its status.");
    }
    const requestedEntitlementAmount = body.entitlement_amount_minor === null || body.entitlement_amount_minor === "" || body.entitlement_amount_minor === undefined
      ? null
      : boundedNumber(body.entitlement_amount_minor, 0, 0, 100_000_000, "Entitlement amount", true);

    // A draft is editorial work, not a claim that payment has occurred. Save
    // it without fabricating an entitlement; real evidence is still mandatory
    // before the campaign can be Scheduled or Active.
    if (status === "Draft" && !entitlementSource && !entitlementReference) {
      let existing: Record<string, unknown> | null = null;
      if (id) {
        const existingResult = await admin.from("trending_video_campaigns").select("*").eq("id", id).maybeSingle();
        if (existingResult.error) throw existingResult.error;
        if (!existingResult.data) rejectRequest("Campaign not found.");
        if (existingResult.data.salon_id !== salonId) rejectRequest("A campaign salon cannot be replaced.");
        existing = existingResult.data;
      }
      const replacementVideo = Boolean(existing && existing.storage_path !== storagePath);
      const savedValues: Record<string, unknown> = {
        salon_id: salonId,
        entitlement_id: existing?.entitlement_id || null,
        placement_basis: "paid",
        complimentary_reason: null,
        complimentary_approved_by: null,
        complimentary_approved_at: null,
        video_url: videoUrl,
        storage_path: storagePath,
        thumbnail_url: thumbnailUrl,
        description,
        duration_seconds: durationSeconds,
        file_size_bytes: fileSizeBytes,
        mime_type: mime,
        status: "Draft",
        starts_at: new Date(startTime).toISOString(),
        ends_at: new Date(endTime).toISOString(),
        timezone,
        radius_miles: radiusMiles,
        priority,
        rotation_weight: rotationWeight,
        internal_note: internalNote,
        video_processing_job_id: processingJobId || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
        ...(replacementVideo
          ? { moderation_status: "Pending", moderation_note: null, moderated_by: null, moderated_at: null }
          : {}),
      };
      let savedId = id;
      if (id) {
        const updateResult = await admin.from("trending_video_campaigns").update(savedValues).eq("id", id).select("id").single();
        if (updateResult.error) throw updateResult.error;
      } else {
        const insertResult = await admin.from("trending_video_campaigns").insert({ ...savedValues, created_by: user.id }).select("id").single();
        if (insertResult.error) throw insertResult.error;
        savedId = insertResult.data.id;
      }
      const auditResult = await admin.from("trending_campaign_audit").insert({
        campaign_id: savedId,
        action: id ? "Draft edited" : "Draft created",
        previous_values: existing,
        new_values: savedValues,
        reason,
        acting_admin_id: user.id,
      });
      if (auditResult.error) throw auditResult.error;
      return savedCampaignResponse(admin, savedId, { placement_basis: "paid", entitlement_attached: Boolean(existing?.entitlement_id) });
    }

    const verifiedEntitlement = await verifyMarketingEntitlement({ admin, source: entitlementSource, reference: entitlementReference, salonId, placement: "Trending Video", startsAt: new Date(startTime).toISOString(), endsAt: new Date(endTime).toISOString() });
    const entitlementAmount = verifiedEntitlement?.amountMinor ?? requestedEntitlementAmount;

    const { data, error } = await admin.rpc("admin_save_trending_campaign", {
      acting_admin_id: user.id,
      target_campaign_id: id || null,
      target_salon_id: salonId,
      campaign_video_url: videoUrl,
      campaign_storage_path: storagePath,
      campaign_thumbnail_url: thumbnailUrl,
      campaign_description: description,
      campaign_duration_seconds: durationSeconds,
      campaign_file_size_bytes: fileSizeBytes,
      campaign_mime_type: mime,
      requested_status: status,
      campaign_starts_at: new Date(startTime).toISOString(),
      campaign_ends_at: new Date(endTime).toISOString(),
      campaign_timezone: timezone,
      campaign_radius_miles: radiusMiles,
      campaign_priority: priority,
      campaign_rotation_weight: rotationWeight,
      campaign_internal_note: internalNote,
      entitlement_source: entitlementSource,
      entitlement_reference: entitlementReference,
      entitlement_amount_minor: entitlementAmount,
      change_reason: reason,
    });
    if (error) throw error;
    const basisUpdate = await admin.from("trending_video_campaigns")
      .update({ placement_basis: "paid", complimentary_reason: null, complimentary_approved_by: null, complimentary_approved_at: null })
      .eq("id", data);
    if (basisUpdate.error) throw basisUpdate.error;
    if(processingJobId){
      const linked=await admin.from("trending_video_campaigns").update({video_processing_job_id:processingJobId}).eq("id",data).eq("salon_id",salonId);
      if(linked.error)throw linked.error;
    }
    return savedCampaignResponse(admin, data);
  } catch (error) {
    if (error instanceof UserSafeRequestError) {
      const field = validationField(error.message);
      const reference = await capturePlatformError({
        request,
        admin: monitoringAdmin,
        error,
        feature: "marketing",
        action: "validate_trending_campaign",
        actorRole: "admin",
        recordType: "trending_video_campaign",
        recordId: null,
        safeMessage: error.message,
        severity: "low",
        metadata: { field, code: "TRENDING_CAMPAIGN_VALIDATION" },
      });
      return Response.json(
        {
          error: error.message,
          code: "TRENDING_CAMPAIGN_VALIDATION",
          field,
          request_id: reference,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Request-ID": reference,
          },
        },
      );
    }
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "marketing", action: "save_trending_campaign", actorRole: "admin", safeMessage: "We couldn't save this Trending Picks campaign." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/trending-campaigns", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/trending-campaigns", "POST"), POSTHandler);
