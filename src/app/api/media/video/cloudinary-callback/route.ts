import { cleanText } from "@/lib/requestSecurity";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  reconcileCloudinaryVideoJob,
  validCloudinaryVideoCallbackToken,
} from "@/lib/videoProcessingServer";
import { loadVideoTranscoderRuntimeConfig } from "@/lib/videoTranscoderServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Cloudinary calls this URL after asynchronous eager video/poster generation.
 * The unguessable HMAC query token authenticates the specific job, and the
 * callback still reads the asset through Cloudinary's authenticated Admin API
 * before marking it Ready. Sparse browser polling remains a recovery path.
 */
async function POSTHandler(request: Request) {
  const search = new URL(request.url).searchParams;
  const jobId = cleanText(search.get("job"), 80);
  const token = cleanText(search.get("token"), 80);
  const runtimeConfig = loadVideoTranscoderRuntimeConfig();
  if (!UUID.test(jobId) || !runtimeConfig.cloudinary) {
    return Response.json(
      { error: "Video callback is unavailable." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (
    !validCloudinaryVideoCallbackToken(
      jobId,
      runtimeConfig.cloudinary.apiSecret,
      token,
    )
  ) {
    return Response.json(
      { error: "Video callback authentication failed." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: job, error } = await admin
    .from("video_processing_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!job) {
    return Response.json(
      { error: "Video job was not found." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (!["Transcoding", "Ready"].includes(String(job.status))) {
    return Response.json(
      { accepted: true, status: job.status },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (job.status === "Ready") {
    return Response.json(
      { accepted: true, status: "Ready" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const reconciled = await reconcileCloudinaryVideoJob(admin, job);
  if (reconciled.status !== "Ready") {
    // Ask Cloudinary to retry its authenticated callback if the Admin resource
    // has not exposed both eager derivatives yet. This also completes jobs
    // when the initiating browser has already closed.
    return Response.json(
      { accepted: false, status: reconciled.status },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return Response.json(
    { accepted: true, status: reconciled.status },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/video/cloudinary-callback", "POST", {
    classification: "provider-backed",
    feature: "trending-video-processing",
    actorRole: "provider",
    provider: "cloudinary",
    safeMessage: "The video processing callback could not be completed.",
  }),
  POSTHandler,
);
