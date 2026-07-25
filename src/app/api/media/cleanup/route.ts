import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { monitoredRouteFailure } from "@/lib/platformErrors";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && supplied && secret === supplied);
}

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  try {
    if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const { data, error } = await admin
      .from("media_assets")
      .select("id,bucket_id,object_path,renditions")
      .eq("status", "Staged")
      .lt("created_at", cutoff)
      .order("created_at")
      .limit(100);
    if (error) throw error;

    let cleaned = 0;
    for (const asset of data || []) {
      const renditionPaths = Object.values((asset.renditions || {}) as Record<string, { path?: string }>)
        .map((rendition) => rendition.path)
        .filter((path): path is string => Boolean(path));
      const paths = [...new Set([asset.object_path, ...renditionPaths].filter(Boolean))];
      const removal = await admin.storage.from(asset.bucket_id).remove(paths);
      if (removal.error) throw removal.error;
      const archived = await admin.from("media_assets").update({ status: "Archived", archived_at: new Date().toISOString() }).eq("id", asset.id).eq("status", "Staged");
      if (archived.error) throw archived.error;
      cleaned += 1;
    }
    const { data: videoJobs, error: videoError } = await admin
      .from("video_processing_jobs")
      .select("id,source_bucket,source_path,status")
      .eq("source_cleanup_status", "Scheduled")
      .lt("source_cleanup_after", new Date().toISOString())
      .order("source_cleanup_after")
      .limit(100);
    if (videoError) throw videoError;
    let videoSourcesCleaned = 0;
    for (const job of videoJobs || []) {
      if (!String(job.source_path).startsWith("incoming/")) continue;
      const removal = await admin.storage
        .from(job.source_bucket)
        .remove([job.source_path]);
      if (removal.error) {
        await admin
          .from("video_processing_jobs")
          .update({
            source_cleanup_status: "Failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        throw removal.error;
      }
      const archived = await admin
        .from("video_processing_jobs")
        .update({
          source_cleanup_status: "Removed",
          source_cleaned_at: new Date().toISOString(),
          original_preserved: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("source_cleanup_status", "Scheduled");
      if (archived.error) throw archived.error;
      videoSourcesCleaned += 1;
    }
    return Response.json({
      staged_images_cleaned: cleaned,
      video_sources_cleaned: videoSourcesCleaned,
      remaining_batch_possible:
        (data || []).length === 100 || (videoJobs || []).length === 100,
    });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "media", action: "cleanup_staged_media", actorRole: "system", safeMessage: "Staged media cleanup could not finish." });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/media/cleanup", "POST"), POSTHandler);
