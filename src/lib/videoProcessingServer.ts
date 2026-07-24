import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export function inspectMp4Bytes(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  const isMp4 = text.slice(4, 12).includes("ftyp");
  const videoCodec = /avc1|avc3/.test(text)
    ? "h264"
    : /hvc1|hev1/.test(text)
      ? "hevc"
      : /vp09/.test(text)
        ? "vp9"
        : "unknown";
  const hasAudio = /soun|mp4a|ac-3|ec-3/.test(text);
  const audioCodec = /mp4a/.test(text)
    ? "aac"
    : /ac-3|ec-3/.test(text)
      ? "dolby"
      : hasAudio
        ? "unknown"
        : "none";
  return {
    container: isMp4 ? "mp4" : "unknown",
    videoCodec,
    audioCodec,
    browserSafe:
      isMp4 &&
      videoCodec === "h264" &&
      (audioCodec === "aac" || audioCodec === "none"),
  };
}

function safeHttpsUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function processVideoJob(
  admin: SupabaseClient,
  job: Row,
  profile: Row,
) {
  const id = String(job.id);
  await admin.from("video_processing_jobs").update({
    status: "Inspecting",
    progress_percent: 10,
    attempt_count: Number(job.attempt_count || 0) + 1,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    safe_error_code: null,
    error_reference: null,
  }).eq("id", id);
  const { data: signed, error: signedError } = await admin.storage
    .from(String(job.source_bucket))
    .createSignedUrl(String(job.source_path), 600);
  if (signedError || !signed?.signedUrl) throw signedError || new Error("VIDEO_SOURCE_UNAVAILABLE");
  const inspectionResponse = await fetch(signed.signedUrl, {
    headers: { Range: "bytes=0-2097151" },
  });
  if (!inspectionResponse.ok) throw new Error("VIDEO_SOURCE_INSPECTION_FAILED");
  const inspected = inspectMp4Bytes(
    new Uint8Array(await inspectionResponse.arrayBuffer()),
  );
  await admin.from("video_processing_jobs").update({
    detected_container: inspected.container,
    detected_video_codec: inspected.videoCodec,
    detected_audio_codec: inspected.audioCodec,
    progress_percent: 25,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (inspected.browserSafe && Number(job.source_size_bytes) <= 25 * 1024 * 1024) {
    const { data } = admin.storage
      .from(String(job.source_bucket))
      .getPublicUrl(String(job.source_path));
    return await complete(admin, id, {
      output_bucket: job.source_bucket,
      output_path: job.source_path,
      output_url: data.publicUrl,
      output_size_bytes: job.source_size_bytes,
      duration_seconds: 30,
      detected_container: "mp4",
      detected_video_codec: "h264",
      detected_audio_codec: inspected.audioCodec,
    });
  }

  const endpoint = safeHttpsUrl(process.env.MEDIA_TRANSCODE_ENDPOINT);
  const token = process.env.MEDIA_TRANSCODE_TOKEN;
  if (!endpoint || !token) throw new Error("VIDEO_TRANSCODER_NOT_CONFIGURED");
  await admin.from("video_processing_jobs").update({
    status: "Transcoding",
    progress_percent: 35,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_id: id,
        input: { signed_url: signed.signedUrl, mime_type: job.source_mime_type },
        output: {
          container: "mp4",
          video_codec: "h264",
          audio_codec: "aac",
          max_duration_seconds: Number(profile.max_duration_seconds),
          max_width_px: Number(profile.max_width_px),
          max_height_px: Number(profile.max_height_px),
          max_output_bytes: 25 * 1024 * 1024,
          poster: { format: "jpeg" },
        },
      }),
    });
    if (!response.ok) throw new Error("VIDEO_TRANSCODER_REQUEST_FAILED");
    const payload = await response.json() as Row;
    const outputUrl = safeHttpsUrl(payload.output_url);
    const posterUrl = safeHttpsUrl(payload.poster_url);
    const outputSize = Number(payload.output_size_bytes || 0);
    const duration = Number(payload.duration_seconds || 0);
    if (
      !outputUrl ||
      !posterUrl ||
      !Number.isFinite(outputSize) ||
      outputSize < 1 ||
      outputSize > 25 * 1024 * 1024 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > Number(profile.max_duration_seconds)
    )
      throw new Error("VIDEO_TRANSCODER_INVALID_OUTPUT");
    const ready = await complete(admin, id, {
      output_path: `processed/${id}.mp4`,
      output_url: outputUrl,
      poster_url: posterUrl,
      output_size_bytes: outputSize,
      duration_seconds: duration,
      width_px: Number(payload.width_px || 0) || null,
      height_px: Number(payload.height_px || 0) || null,
      detected_container: "mp4",
      detected_video_codec: "h264",
      detected_audio_codec: "aac",
      provider_job_id: String(payload.provider_job_id || "") || null,
    });
    await admin.storage
      .from(String(job.source_bucket))
      .remove([String(job.source_path)]);
    return ready;
  } finally {
    clearTimeout(timer);
  }
}

async function complete(
  admin: SupabaseClient,
  id: string,
  output: Record<string, unknown>,
) {
  const { data, error } = await admin.from("video_processing_jobs").update({
    ...output,
    status: "Ready",
    progress_percent: 100,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
