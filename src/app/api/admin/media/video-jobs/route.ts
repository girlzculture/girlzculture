import { cleanText, errorResponse } from "@/lib/requestSecurity";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { processVideoJob } from "@/lib/videoProcessingServer";

async function GETHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    let query = admin.from("video_processing_jobs").select("*")
      .order("created_at", { ascending: false }).limit(100);
    if (id) query = query.eq("id", id);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ jobs: data || [] });
  } catch (error) {
    return errorResponse(error, "Unable to load video processing jobs.");
  }
}

async function POSTHandler(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"] | null = null;
  let userId = "";
  let jobId = "";
  try {
    const auth = await requireAdminPermission(request, "marketing");
    admin = auth.admin;
    userId = auth.user.id;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 20) || "create";
    if (action === "cancel") {
      jobId = cleanText(body.id, 80);
      const { data, error } = await admin.from("video_processing_jobs").update({
        status: "Cancelled",
        cancellation_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId).in("status", ["Uploaded", "Inspecting", "Transcoding", "Failed"]).select().single();
      if (error) throw error;
      return Response.json({ job: data });
    }
    let job: Record<string, unknown>;
    if (action === "retry") {
      jobId = cleanText(body.id, 80);
      const { data, error } = await admin.from("video_processing_jobs")
        .select("*").eq("id", jobId).in("status", ["Failed", "Uploaded"]).single();
      if (error || !data) throw error || new Error("Choose a retryable video job.");
      job = data;
    } else {
      const sourcePath = cleanText(body.source_path, 700);
      const salonId = cleanText(body.salon_id, 80);
      const mime = cleanText(body.mime_type, 100).toLowerCase();
      const size = Number(body.file_size_bytes);
      if (!sourcePath.startsWith(`incoming/${userId}/`) || !salonId)
        throw new Error("Choose a valid uploaded video.");
      if (!["video/mp4", "video/webm"].includes(mime))
        throw new Error("Upload an MP4 or WebM video.");
      const { data: profile, error: profileError } = await admin
        .from("media_video_profiles").select("*").eq("profile_key", "trending").single();
      if (profileError || !profile) throw profileError || new Error("Video limits are unavailable.");
      if (!Number.isFinite(size) || size < 1 || size > Number(profile.max_source_bytes))
        throw new Error(`The source video must be ${Math.round(Number(profile.max_source_bytes) / 1048576)} MB or smaller.`);
      const { data, error } = await admin.from("video_processing_jobs").insert({
        profile_key: "trending",
        requested_by: userId,
        salon_id: salonId,
        source_bucket: "trending-videos",
        source_path: sourcePath,
        source_mime_type: mime,
        source_size_bytes: size,
      }).select().single();
      if (error) throw error;
      job = data;
      jobId = String(data.id);
    }
    const { data: profile, error: profileError } = await admin
      .from("media_video_profiles").select("*").eq("profile_key", "trending").single();
    if (profileError || !profile) throw profileError || new Error("Video limits are unavailable.");
    const ready = await processVideoJob(admin, job, profile);
    return Response.json({ job: ready });
  } catch (error) {
    if (admin && jobId) {
      const reference = await capturePlatformError({
        request,
        admin,
        error,
        feature: "trending-video-processing",
        action: "inspect-or-transcode-video",
        actorRole: "admin",
        actorId: userId,
        recordType: "video_processing_job",
        recordId: jobId,
        provider: "media-transcoder",
        safeMessage: "The video could not be prepared for browser playback.",
      });
      await admin.from("video_processing_jobs").update({
        status: "Failed",
        progress_percent: 0,
        safe_error_code: "VIDEO_PROCESSING_FAILED",
        error_reference: reference,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      return Response.json({
        error: `We couldn't prepare this video. Retry it or contact support with reference ${reference}.`,
        request_id: reference,
      }, { status: 502 });
    }
    return errorResponse(error, "Unable to start video processing.");
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/media/video-jobs", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  {
    ...routeMonitoringProfile("/api/admin/media/video-jobs", "POST"),
    classification: "provider-backed",
    feature: "trending-video-processing",
    provider: "media-transcoder",
  },
  POSTHandler,
);

