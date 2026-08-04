import type { VideoProcessingJob } from "@/lib/videoJobPollingCore";

export const PENDING_TRENDING_VIDEO_JOB_KEY =
  "girlz-culture:admin:pending-trending-video-job:v1";
export const PENDING_TRENDING_VIDEO_JOB_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type PendingTrendingVideoJob = {
  jobId: string;
  salonId: string;
  campaignId: string | null;
  salonName: string;
  sourcePath: string;
  sourceMime: string;
  sourceSize: number;
  sourceDuration: number;
  createdAt: number;
};

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function validPendingJob(value: unknown): value is PendingTrendingVideoJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<PendingTrendingVideoJob>;
  return Boolean(
    String(job.jobId || "").trim() &&
      String(job.salonId || "").trim() &&
      String(job.sourcePath || "").trim() &&
      Number.isFinite(Number(job.sourceSize)) &&
      Number.isFinite(Number(job.sourceDuration)) &&
      Number.isFinite(Number(job.createdAt)) &&
      Date.now() - Number(job.createdAt) <=
        PENDING_TRENDING_VIDEO_JOB_MAX_AGE_MS,
  );
}

export function loadPendingTrendingVideoJob(
  storage: SessionStorageLike,
): PendingTrendingVideoJob | null {
  try {
    const raw = storage.getItem(PENDING_TRENDING_VIDEO_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (validPendingJob(parsed)) return parsed;
  } catch {
    // A corrupt browser draft must never block a fresh upload.
  }
  storage.removeItem(PENDING_TRENDING_VIDEO_JOB_KEY);
  return null;
}

export function savePendingTrendingVideoJob(
  storage: SessionStorageLike,
  job: PendingTrendingVideoJob,
) {
  storage.setItem(PENDING_TRENDING_VIDEO_JOB_KEY, JSON.stringify(job));
}

export function clearPendingTrendingVideoJob(storage: SessionStorageLike) {
  storage.removeItem(PENDING_TRENDING_VIDEO_JOB_KEY);
}

function replaceableJob(job: VideoProcessingJob | null) {
  return !job || ["Failed", "Cancelled"].includes(job.status);
}

/**
 * Resume-before-recreate contract. A live processing job is always inspected
 * and awaited first. Only an explicitly missing, Failed, or Cancelled job may
 * cause the caller to upload/create a replacement.
 */
export async function resumeOrCreateReadyVideoJob(input: {
  pendingJobId?: string | null;
  inspect: (jobId: string) => Promise<VideoProcessingJob | null>;
  create: () => Promise<VideoProcessingJob>;
  start: (jobId: string) => Promise<VideoProcessingJob>;
  waitUntilReady: (jobId: string) => Promise<VideoProcessingJob>;
  onJobSelected?: (jobId: string, created: boolean) => void;
}) {
  let job = input.pendingJobId
    ? await input.inspect(input.pendingJobId)
    : null;
  let jobId = String(job?.id || input.pendingJobId || "");
  let created = false;

  if (job && !replaceableJob(job)) {
    input.onJobSelected?.(jobId, false);
    if (job.status === "Ready") return { job, jobId, created };
    if (job.status === "Uploaded") job = await input.start(jobId);
    if (job.status === "Ready") return { job, jobId, created };
    if (!replaceableJob(job)) {
      job = await input.waitUntilReady(jobId);
      return { job, jobId, created };
    }
  }

  job = await input.create();
  jobId = String(job.id || "");
  if (!jobId) throw new Error("The video processing job was not created.");
  created = true;
  input.onJobSelected?.(jobId, true);
  if (job.status === "Ready") return { job, jobId, created };
  job = await input.start(jobId);
  if (job.status !== "Ready") job = await input.waitUntilReady(jobId);
  return { job, jobId, created };
}
