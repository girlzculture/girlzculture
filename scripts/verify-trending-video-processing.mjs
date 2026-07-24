import assert from "node:assert/strict";
import fs from "node:fs";
import { inspectMp4Bytes } from "../src/lib/videoProcessingServer.ts";

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

const migration = fs.readFileSync(
  "supabase/migrations/20260723280000_trending_video_processing.sql",
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

const server = fs.readFileSync("src/lib/videoProcessingServer.ts", "utf8");
for (const control of [
  /MEDIA_TRANSCODE_ENDPOINT/,
  /MEDIA_TRANSCODE_TOKEN/,
  /video_codec:\s*"h264"/,
  /audio_codec:\s*"aac"/,
  /max_output_bytes/,
  /poster:\s*\{\s*format:\s*"jpeg"/,
  /remove\(\[String\(job\.source_path\)\]\)/,
])
  assert.match(server, control);

const manager = fs.readFileSync(
  "src/components/admin/AdminTrendingCampaigns.tsx",
  "utf8",
);
assert.match(manager, /needsServerPipeline/);
assert.match(manager, /incoming\/\$\{session\.user\.id\}/);
assert.match(manager, /\/api\/admin\/media\/video-jobs/);
assert.match(manager, /Retry upload/);
assert.match(manager, /Cancel upload/);
const placement = fs.readFileSync(
  "src/components/public/TrendingVideoPlacement.tsx",
  "utf8",
);
assert.match(placement, /className="aspect-video w-full"/);
assert.doesNotMatch(placement, /aspect-\[9\/13\]/);

console.log(
  "Trending video processing verification passed: executable MP4 container/codec classification distinguishes H.264/AAC from HEVC and Dolby inputs; governed job, conversion, poster, cleanup, retry/cancel, monitoring, and compact-card controls are present.",
);

