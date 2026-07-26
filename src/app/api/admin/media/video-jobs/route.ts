import { cleanText, errorResponse } from "@/lib/requestSecurity";
import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import {
  processVideoJob,
  reconcileCloudinaryVideoJob,
} from "@/lib/videoProcessingServer";
import {
  classifyVideoTranscoderError,
} from "@/lib/videoTranscoderCore";
import {
  videoTranscoderRuntimeDiagnostic,
} from "@/lib/videoTranscoderServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "marketing");
    const search = new URL(request.url).searchParams;
    const id = cleanText(search.get("id"), 80);
    let query = admin.from("video_processing_jobs").select("*")
      .order("created_at", { ascending: false }).limit(100);
    if (id) query = query.eq("id", id);
    const { data, error } = await query;
    if (error) throw error;
    let jobs = data || [];
    if (
      id &&
      search.get("recover") === "1" &&
      jobs[0]?.status === "Transcoding"
    ) {
      try {
        jobs = [await reconcileCloudinaryVideoJob(admin, jobs[0])];
      } catch (providerError) {
        noteOperationalFailure(
          "Cloudinary video-job reconciliation failed",
          providerError,
        );
      }
    }
    return Response.json(
      {
        jobs,
        transcoder: videoTranscoderRuntimeDiagnostic(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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
    if (!["create", "process", "retry", "cancel"].includes(action)) {
      throw new Error("Choose a valid video-processing action.");
    }
    if (action === "cancel") {
      jobId = cleanText(body.id, 80);
      const { data, error } = await admin.from("video_processing_jobs").update({
        status: "Cancelled",
        cancellation_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_cleanup_after: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        source_cleanup_status: "Scheduled",
      }).eq("id", jobId).in("status", ["Uploaded", "Inspecting", "Transcoding", "Failed"]).select().single();
      if (error) throw error;
      return Response.json({ job: data });
    }
    let job: Record<string, unknown>;
    if (["retry", "process"].includes(action)) {
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
      if (![
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-m4v",
        "video/x-matroska",
      ].includes(mime))
        throw new Error("Upload an MP4, WebM, MOV, M4V, or Matroska video.");
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
        source_cleanup_after: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        source_cleanup_status: "Scheduled",
      }).select().single();
      if (error) throw error;
      return Response.json({ job: data }, { status: 202 });
    }
    const { data: profile, error: profileError } = await admin
      .from("media_video_profiles").select("*").eq("profile_key", "trending").single();
    if (profileError || !profile) throw profileError || new Error("Video limits are unavailable.");
    const ready = await processVideoJob(admin, job, profile);
    return Response.json({ job: ready });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "VIDEO_PROCESSING_CANCELLED"
    ) {
      return Response.json(
        { error: "Video processing was cancelled.", cancelled: true },
        { status: 409 },
      );
    }
    if (admin && jobId) {
      const failure = classifyVideoTranscoderError(error);
      const diagnostic = videoTranscoderRuntimeDiagnostic();
      if (failure.state === "unsupported_input_media") {
        await admin.from("video_processing_jobs").update({
          status: "Failed",
          progress_percent: 0,
          safe_error_code: failure.code,
          error_reference: null,
          updated_at: new Date().toISOString(),
          source_cleanup_after: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          source_cleanup_status: "Scheduled",
          original_preserved: true,
        }).eq("id", jobId);
        return Response.json(
          {
            error: failure.safeMessage,
            code: failure.code,
            state: failure.state,
          },
          {
            status: failure.status,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
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
        provider:
          diagnostic.provider === "custom"
            ? "media-transcoder"
            : "cloudinary",
        safeMessage: failure.safeMessage,
        metadata: {
          provider_state: failure.state,
          variable_presence: diagnostic.variables,
          missing_variable_names: diagnostic.missingVariables,
          runtime: diagnostic.runtime,
        },
      });
      await admin.from("video_processing_jobs").update({
        status: "Failed",
        progress_percent: 0,
        safe_error_code: failure.code,
        error_reference: reference,
        updated_at: new Date().toISOString(),
        source_cleanup_after: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        source_cleanup_status: "Scheduled",
        original_preserved: true,
      }).eq("id", jobId);
      return Response.json(
        {
          error: `${failure.safeMessage} Contact the platform owner with reference ${reference}.`,
          code: failure.code,
          state: failure.state,
          request_id: reference,
          ...(failure.state === "missing_deployment_configuration"
            ? { transcoder: diagnostic }
            : {}),
        },
        {
          status: failure.status,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Request-ID": reference,
          },
        },
      );
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
