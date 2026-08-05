import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import {
  createBoundedCleanupFailureReporter,
  runIsolatedCleanupBatch,
} from "@/lib/mediaCleanupCore";
import { removePreparedMediaObjects } from "@/lib/mediaUploadServer";

export const runtime = "nodejs";

const CLEANUP_BATCH_LIMIT = 100;
// One representative correlation record plus the aggregate category counters
// is enough to diagnose a run. More synchronous persistence attempts could
// amplify the same provider outage the cleanup job is reporting.
const FAILURE_REFERENCE_LIMIT = 1;

type CleanupQueryResult<T> = {
  data: T[] | null;
  error: unknown;
};

type StagedAsset = {
  id: string;
  bucket_id: string;
  object_path: string | null;
  renditions: unknown;
  source_bucket_id: string | null;
  source_object_path: string | null;
};

type ExpiredUploadSession = {
  id: string;
  expected_objects: unknown;
};

type VideoCleanupJob = {
  id: string;
  source_bucket: string;
  source_path: string;
};

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && supplied && secret === supplied);
}

function renditionObjectPaths(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>)
    .map((rendition) => {
      if (!rendition || typeof rendition !== "object" || Array.isArray(rendition)) {
        return "";
      }
      return String((rendition as Record<string, unknown>).path || "").trim();
    })
    .filter(Boolean);
}

async function POSTHandler(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const loadFailures = {
    staged_images: 0,
    expired_image_uploads: 0,
    video_sources: 0,
  };
  const failures = createBoundedCleanupFailureReporter(
    (scope, error) => {
      noteOperationalFailure(error, `Media cleanup ${scope}`);
    },
    FAILURE_REFERENCE_LIMIT,
  );

  const loadBatch = async <T,>(
    scope: string,
    category: keyof typeof loadFailures,
    load: () => Promise<CleanupQueryResult<T>>,
  ): Promise<T[]> => {
    try {
      const result = await load();
      if (result.error) throw result.error;
      return result.data || [];
    } catch (error) {
      loadFailures[category] += 1;
      failures.record(scope, error);
      return [];
    }
  };

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const assets = await loadBatch<StagedAsset>(
      "staged-images",
      "staged_images",
      async () => {
        const result = await admin
          .from("media_assets")
          .select(
            "id,bucket_id,object_path,renditions,source_bucket_id,source_object_path",
          )
          .eq("status", "Staged")
          .lt("created_at", cutoff)
          .order("created_at")
          .limit(CLEANUP_BATCH_LIMIT);
        return {
          data: (result.data || []) as StagedAsset[],
          error: result.error,
        };
      },
    );

    const stagedImages = await runIsolatedCleanupBatch(
      assets,
      async (asset) => {
        const paths = [
          ...new Set(
            [asset.object_path, ...renditionObjectPaths(asset.renditions)]
              .map((path) => String(path || "").trim())
              .filter(Boolean),
          ),
        ];
        if (paths.length) {
          const removal = await admin.storage
            .from(String(asset.bucket_id || ""))
            .remove(paths);
          if (removal.error) throw removal.error;
        }
        if (asset.source_bucket_id && asset.source_object_path) {
          const sourceRemoval = await admin.storage
            .from(asset.source_bucket_id)
            .remove([asset.source_object_path]);
          if (sourceRemoval.error) throw sourceRemoval.error;
        }
        const archived = await admin
          .from("media_assets")
          .update({
            status: "Archived",
            archived_at: new Date().toISOString(),
          })
          .eq("id", asset.id)
          .eq("status", "Staged");
        if (archived.error) throw archived.error;
      },
      (error) => failures.record("staged-images", error),
    );

    const expiredSessions = await loadBatch<ExpiredUploadSession>(
      "expired-image-uploads",
      "expired_image_uploads",
      async () => {
        const result = await admin
          .from("media_upload_sessions")
          .select("id,expected_objects")
          .eq("status", "Prepared")
          .lt("expires_at", new Date().toISOString())
          .order("expires_at")
          .limit(CLEANUP_BATCH_LIMIT);
        return {
          data: (result.data || []) as ExpiredUploadSession[],
          error: result.error,
        };
      },
    );

    const expiredImageUploads = await runIsolatedCleanupBatch(
      expiredSessions,
      async (session) => {
        await removePreparedMediaObjects(admin, session.expected_objects);
        const expired = await admin
          .from("media_upload_sessions")
          .update({
            status: "Expired",
            failure_code: "SIGNED_UPLOAD_EXPIRED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id)
          .eq("status", "Prepared");
        if (expired.error) throw expired.error;
      },
      (error) => failures.record("expired-image-uploads", error),
    );

    const videoJobs = await loadBatch<VideoCleanupJob>(
      "video-sources",
      "video_sources",
      async () => {
        const result = await admin
          .from("video_processing_jobs")
          .select("id,source_bucket,source_path,status")
          .eq("source_cleanup_status", "Scheduled")
          .lt("source_cleanup_after", new Date().toISOString())
          .order("source_cleanup_after")
          .limit(CLEANUP_BATCH_LIMIT);
        return {
          data: (result.data || []) as VideoCleanupJob[],
          error: result.error,
        };
      },
    );

    const markVideoCleanupFailed = async (jobId: string) => {
      try {
        const failed = await admin
          .from("video_processing_jobs")
          .update({
            source_cleanup_status: "Failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("source_cleanup_status", "Scheduled");
        if (failed.error) {
          failures.record("video-sources", failed.error);
        }
      } catch (error) {
        failures.record("video-sources", error);
      }
    };

    const videoSources = await runIsolatedCleanupBatch(
      videoJobs,
      async (job) => {
        const sourcePath = String(job.source_path || "");
        if (!sourcePath.startsWith("incoming/")) {
          await markVideoCleanupFailed(job.id);
          throw new Error("MEDIA_SOURCE_PATH_NOT_ELIGIBLE_FOR_CLEANUP");
        }

        const removal = await admin.storage
          .from(String(job.source_bucket || ""))
          .remove([sourcePath]);
        if (removal.error) throw removal.error;

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
      },
      (error) => failures.record("video-sources", error),
    );

    const loadFailureTotal = Object.values(loadFailures).reduce(
      (sum, count) => sum + count,
      0,
    );
    const failedItemTotal =
      stagedImages.failed + expiredImageUploads.failed + videoSources.failed;
    const failureSummary = failures.summary();
    const partialFailure = loadFailureTotal + failedItemTotal > 0;

    return Response.json({
      staged_images_examined: stagedImages.attempted,
      staged_images_cleaned: stagedImages.succeeded,
      staged_images_failed: stagedImages.failed,
      expired_image_uploads_examined: expiredImageUploads.attempted,
      expired_image_uploads_cleaned: expiredImageUploads.succeeded,
      expired_image_uploads_failed: expiredImageUploads.failed,
      video_sources_examined: videoSources.attempted,
      video_sources_cleaned: videoSources.succeeded,
      video_sources_failed: videoSources.failed,
      batches_unavailable: loadFailureTotal,
      failed_items_total: failedItemTotal,
      partial_failure: partialFailure,
      retry_recommended: partialFailure,
      failure_reference_limit: FAILURE_REFERENCE_LIMIT,
      failure_events_reported: failureSummary.reported,
      failure_events_omitted: failureSummary.omitted,
      remaining_batch_possible:
        assets.length === CLEANUP_BATCH_LIMIT ||
        expiredSessions.length === CLEANUP_BATCH_LIMIT ||
        videoJobs.length === CLEANUP_BATCH_LIMIT ||
        partialFailure,
    });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "media",
      action: "cleanup_staged_media",
      actorRole: "system",
      safeMessage: "Staged media cleanup could not finish.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/media/cleanup", "POST", {
    actorRole: "system",
    safeMessage: "Staged media cleanup could not finish.",
    // Partial cleanup warnings must remain process-log/correlation events.
    // Persisting them through the database that may be unavailable would turn
    // a successful partial batch back into a scheduled-function timeout.
    processOnlyPartialWarnings: true,
  }),
  POSTHandler,
);
