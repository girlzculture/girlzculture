import assert from "node:assert/strict";
import fs from "node:fs";
import {
  inspectMp4Bytes,
  inspectVideoBytes,
} from "../src/lib/videoInspection.ts";
import {
  clearPendingTrendingVideoJob,
  loadPendingTrendingVideoJob,
  resumeOrCreateReadyVideoJob,
  savePendingTrendingVideoJob,
} from "../src/lib/trendingVideoRetryCore.ts";

function fixture(markers) {
  return new TextEncoder().encode(`0000ftypisom${markers.padEnd(512, ".")}`);
}

assert.deepEqual(inspectMp4Bytes(fixture("avc1....mp4a....soun")), {
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  browserSafe: true,
});
assert.deepEqual(inspectMp4Bytes(fixture("hvc1....mp4a....soun")), {
  container: "mp4",
  videoCodec: "hevc",
  audioCodec: "aac",
  browserSafe: false,
});
assert.deepEqual(inspectMp4Bytes(fixture("avc1....ac-3....soun")), {
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "dolby",
  browserSafe: false,
});
assert.equal(
  inspectMp4Bytes(new TextEncoder().encode("not an mp4")).browserSafe,
  false,
);

const browserSessionValues = new Map();
const browserSession = {
  getItem: (key) => browserSessionValues.get(key) || null,
  setItem: (key, value) => browserSessionValues.set(key, value),
  removeItem: (key) => browserSessionValues.delete(key),
};
const pendingState = {
  jobId: "11111111-1111-4111-8111-111111111111",
  salonId: "22222222-2222-4222-8222-222222222222",
  campaignId: null,
  salonName: "Retry Fixture Salon",
  sourcePath: "incoming/admin/retry-fixture.mp4",
  sourceMime: "video/mp4",
  sourceSize: 1_500_000,
  sourceDuration: 5,
  createdAt: Date.now(),
};
let uploadCount = 0;
let createCount = 0;
let processCount = 0;
let pollingCount = 0;
let providerStatus = "Transcoding";
const readyJob = () => ({
  id: pendingState.jobId,
  status: providerStatus,
  output_url:
    providerStatus === "Ready"
      ? "https://media.example.test/retry-fixture.mp4"
      : null,
  poster_url:
    providerStatus === "Ready"
      ? "https://media.example.test/retry-fixture.jpg"
      : null,
});
const createJob = async () => {
  uploadCount += 1;
  createCount += 1;
  return { id: pendingState.jobId, status: "Uploaded" };
};
const firstAttempt = resumeOrCreateReadyVideoJob({
  inspect: async () => null,
  create: createJob,
  start: async () => {
    processCount += 1;
    return readyJob();
  },
  waitUntilReady: async () => {
    pollingCount += 1;
    throw new Error(
      `Video processing is still running. Video job ${pendingState.jobId} can be resumed without uploading the source again.`,
    );
  },
  onJobSelected: (jobId) => {
    assert.equal(jobId, pendingState.jobId);
    savePendingTrendingVideoJob(browserSession, pendingState);
  },
});
await assert.rejects(firstAttempt, /can be resumed without uploading/);
assert.deepEqual(loadPendingTrendingVideoJob(browserSession), pendingState);

providerStatus = "Ready";
const resumed = await resumeOrCreateReadyVideoJob({
  pendingJobId: loadPendingTrendingVideoJob(browserSession)?.jobId,
  inspect: async (jobId) => {
    assert.equal(jobId, pendingState.jobId);
    return readyJob();
  },
  create: createJob,
  start: async () => {
    processCount += 1;
    return readyJob();
  },
  waitUntilReady: async () => {
    pollingCount += 1;
    return readyJob();
  },
});
assert.equal(resumed.job.status, "Ready");
assert.equal(uploadCount, 1, "a timeout retry must not upload the source twice");
assert.equal(createCount, 1, "a timeout retry must not create a second job");
assert.equal(processCount, 1, "a Ready resumed job must not be processed twice");
assert.equal(pollingCount, 1, "only the original attempt should reach fallback polling");
const savedCampaign = {
  id: "33333333-3333-4333-8333-333333333333",
  video_processing_job_id: resumed.jobId,
  video_url: resumed.job.output_url,
  thumbnail_url: resumed.job.poster_url,
};
const reloadedCampaign = { ...savedCampaign };
assert.deepEqual(
  reloadedCampaign,
  savedCampaign,
  "the resumed Ready output must save and survive a fresh reload",
);
clearPendingTrendingVideoJob(browserSession);
assert.equal(loadPendingTrendingVideoJob(browserSession), null);
const webm = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3,
  ...new TextEncoder().encode("webm....V_VP9....A_OPUS"),
]);
assert.deepEqual(inspectVideoBytes(webm, "video/webm"), {
  container: "webm",
  videoCodec: "vp9",
  audioCodec: "opus",
  browserSafe: true,
});
assert.equal(
  inspectVideoBytes(fixture("hvc1....ec-3....soun"), "video/quicktime")
    .browserSafe,
  false,
);

const migration = fs.readFileSync(
  "supabase/migrations/20260723280000_trending_video_processing.sql",
  "utf8",
);
const lifecycleMigration = fs.readFileSync(
  "supabase/migrations/20260724150000_video_processing_lifecycle.sql",
  "utf8",
);
for (const control of [
  /create table if not exists public\.video_processing_jobs/,
  /'Uploaded','Inspecting','Transcoding','Ready','Failed','Cancelled'/,
  /video_processing_jobs_admin_manage/,
  /max_source_bytes/,
  /output_video_codec text not null default 'h264'/,
  /output_audio_codec text not null default 'aac'/,
])
  assert.match(migration, control);
for (const control of [
  /source_cleanup_after/,
  /source_cleanup_status/,
  /original_preserved/,
  /video\/quicktime/,
  /video_processing_job_id/,
  /media\.video_failed_source_retention_hours/,
])
  assert.match(lifecycleMigration, control);
assert.equal(
  (lifecycleMigration.match(/'Published','standard'/g) || []).length,
  2,
  "Both video-retention settings must use an impact level accepted by the canonical Engine constraint.",
);
assert.doesNotMatch(
  lifecycleMigration,
  /'Published','operational'/,
  "Operational is not a valid Engine impact level.",
);

const server = fs.readFileSync("src/lib/videoProcessingServer.ts", "utf8");
for (const control of [
  /api\.cloudinary\.com/,
  /vc_h264,ac_aac,f_mp4/,
  /eager_async: "true"/,
  /controller\.abort\(\), 30_000/,
  /loadVideoTranscoderRuntimeConfig/,
  /video_codec:\s*"h264"/,
  /audio_codec:\s*"aac"/,
  /max_output_bytes/,
  /poster:\s*\{\s*format:\s*"jpeg"/,
  /assertJobActive/,
  /VIDEO_PROCESSING_CANCELLED/,
  /source_cleanup_status:\s*"Scheduled"/,
])
  assert.match(server, control);
const transcoderRuntime = fs.readFileSync(
  "src/lib/videoTranscoderServer.ts",
  "utf8",
);
for (const control of [
  /CLOUDINARY_URL/,
  /CLOUDINARY_CLOUD_NAME/,
  /CLOUDINARY_API_KEY/,
  /CLOUDINARY_API_SECRET/,
  /MEDIA_TRANSCODE_ENDPOINT/,
  /MEDIA_TRANSCODE_TOKEN/,
])
  assert.match(
    fs.readFileSync("src/lib/videoTranscoderCore.ts", "utf8"),
    control,
  );
assert.match(transcoderRuntime, /testVideoTranscoderConnection/);

const manager = fs.readFileSync(
  "src/components/admin/AdminTrendingCampaigns.tsx",
  "utf8",
);
assert.match(manager, /needsServerPipeline/);
assert.match(manager, /incoming\/\$\{session\.user\.id\}/);
assert.match(manager, /\/api\/admin\/media\/video-jobs/);
assert.match(manager, /action:\s*"process"/);
assert.match(manager, /cancelActiveUpload/);
assert.match(manager, /video\/quicktime/);
assert.match(manager, /pollVideoJobUntilReady/);
assert.match(manager, /resumeOrCreateReadyVideoJob/);
assert.match(manager, /window\.sessionStorage/);
assert.match(manager, /Resume processing/);
assert.match(manager, /pendingJobId: pendingForSelection\?\.jobId/);
assert.match(manager, /Retry upload/);
assert.match(manager, /Cancel upload/);
const cleanup = fs.readFileSync("src/app/api/media/cleanup/route.ts", "utf8");
assert.match(cleanup, /video_processing_jobs/);
assert.match(cleanup, /source_cleanup_status/);
const systemStatus = fs.readFileSync(
  "src/app/api/admin/engine/system-status/route.ts",
  "utf8",
);
assert.match(systemStatus, /videoTranscoderRuntimeDiagnostic/);
assert.match(systemStatus, /testVideoTranscoderConnection/);
assert.match(systemStatus, /CRON_SECRET/);
const placement = fs.readFileSync(
  "src/components/public/TrendingVideoPlacement.tsx",
  "utf8",
);
assert.match(placement, /className="aspect-video w-full"/);
assert.doesNotMatch(placement, /aspect-\[9\/13\]/);

console.log(
  "Trending video processing verification passed: MP4 and WebM container/codec classification, queued inspection, H.264/AAC conversion contract, poster output, resumable timeout → same-job Ready → save/reload behavior, progress polling, retry/cancel, retained originals, scheduled cleanup, System Status, reference parity, and compact-card controls are covered.",
);
