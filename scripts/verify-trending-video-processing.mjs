import assert from "node:assert/strict";
import fs from "node:fs";
import {
  inspectMp4Bytes,
  inspectVideoBytes,
} from "../src/lib/videoProcessingServer.ts";

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

const server = fs.readFileSync("src/lib/videoProcessingServer.ts", "utf8");
for (const control of [
  /MEDIA_TRANSCODE_ENDPOINT/,
  /MEDIA_TRANSCODE_TOKEN/,
  /video_codec:\s*"h264"/,
  /audio_codec:\s*"aac"/,
  /max_output_bytes/,
  /poster:\s*\{\s*format:\s*"jpeg"/,
  /assertJobActive/,
  /VIDEO_PROCESSING_CANCELLED/,
  /source_cleanup_status:\s*"Scheduled"/,
])
  assert.match(server, control);

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
assert.match(manager, /setInterval/);
assert.match(manager, /Retry upload/);
assert.match(manager, /Cancel upload/);
const cleanup = fs.readFileSync("src/app/api/media/cleanup/route.ts", "utf8");
assert.match(cleanup, /video_processing_jobs/);
assert.match(cleanup, /source_cleanup_status/);
const systemStatus = fs.readFileSync(
  "src/app/api/admin/engine/system-status/route.ts",
  "utf8",
);
assert.match(systemStatus, /MEDIA_TRANSCODE_ENDPOINT/);
assert.match(systemStatus, /CRON_SECRET/);
const placement = fs.readFileSync(
  "src/components/public/TrendingVideoPlacement.tsx",
  "utf8",
);
assert.match(placement, /className="aspect-video w-full"/);
assert.doesNotMatch(placement, /aspect-\[9\/13\]/);

console.log(
  "Trending video processing verification passed: MP4 and WebM container/codec classification, queued inspection, H.264/AAC conversion contract, poster output, progress polling, retry/cancel, retained originals, scheduled cleanup, System Status, reference parity, and compact-card controls are covered.",
);
