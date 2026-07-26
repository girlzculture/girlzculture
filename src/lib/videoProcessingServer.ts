import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

type Row = Record<string, unknown>;

export type VideoInspection = {
  container: "mp4" | "quicktime" | "webm" | "matroska" | "unknown";
  videoCodec: "h264" | "hevc" | "vp8" | "vp9" | "av1" | "unknown";
  audioCodec: "aac" | "opus" | "vorbis" | "dolby" | "none" | "unknown";
  browserSafe: boolean;
};

export function inspectVideoBytes(
  bytes: Uint8Array,
  requestedMime = "",
): VideoInspection {
  const text = new TextDecoder("latin1").decode(bytes);
  const isIsoMedia = text.slice(4, 16).includes("ftyp");
  const webmSignature =
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
  const quickTime =
    /video\/quicktime|video\/x-m4v/i.test(requestedMime) ||
    /qt  |M4V /.test(text.slice(4, 40));
  const matroska =
    webmSignature &&
    (/matroska/i.test(text) || /video\/x-matroska/i.test(requestedMime));
  const container = matroska
    ? "matroska"
    : webmSignature
      ? "webm"
      : isIsoMedia && quickTime
        ? "quicktime"
        : isIsoMedia
          ? "mp4"
          : "unknown";
  const videoCodec = /avc1|avc3/.test(text)
    ? "h264"
    : /hvc1|hev1/.test(text)
      ? "hevc"
      : /V_VP8|vp08/.test(text)
        ? "vp8"
        : /V_VP9|vp09/.test(text)
          ? "vp9"
          : /V_AV1|av01/.test(text)
            ? "av1"
            : "unknown";
  const hasAudio = /soun|mp4a|ac-3|ec-3|A_OPUS|A_VORBIS/i.test(text);
  const audioCodec = /mp4a/.test(text)
    ? "aac"
    : /A_OPUS|opus/i.test(text)
      ? "opus"
      : /A_VORBIS|vorbis/i.test(text)
        ? "vorbis"
        : /ac-3|ec-3/.test(text)
          ? "dolby"
          : hasAudio
            ? "unknown"
            : "none";
  return {
    container,
    videoCodec,
    audioCodec,
    browserSafe:
      (container === "mp4" &&
        videoCodec === "h264" &&
        (audioCodec === "aac" || audioCodec === "none")) ||
      (container === "webm" &&
        ["vp8", "vp9"].includes(videoCodec) &&
        ["opus", "vorbis", "none"].includes(audioCodec)),
  };
}

export function inspectMp4Bytes(bytes: Uint8Array) {
  return inspectVideoBytes(bytes, "video/mp4");
}

function safeHttpsUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function governedOutputPath(value: unknown) {
  const path = String(value || "");
  return /^processed\/[a-zA-Z0-9/_-]+\.(mp4|webm)$/.test(path) ? path : null;
}

function cloudinaryConfig() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  return cloudName && apiKey && apiSecret
    ? { cloudName, apiKey, apiSecret }
    : null;
}

export function videoTranscoderConfigured() {
  return Boolean(
    cloudinaryConfig() ||
      (safeHttpsUrl(process.env.MEDIA_TRANSCODE_ENDPOINT) &&
        process.env.MEDIA_TRANSCODE_TOKEN),
  );
}

function cloudinarySignature(
  params: Record<string, string | number | boolean>,
  secret: string,
) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== "" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return createHash("sha1").update(`${payload}${secret}`).digest("hex");
}

async function transcodeWithCloudinary(input: {
  signedUrl: string;
  jobId: string;
  maxDuration: number;
  maxWidth: number;
  maxHeight: number;
  signal: AbortSignal;
}) {
  const config = cloudinaryConfig();
  if (!config) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `girlz-culture/trending/${input.jobId}`;
  const eager = [
    `c_limit,h_${input.maxHeight},w_${input.maxWidth},q_auto:good,vc_h264,ac_aac,f_mp4`,
    `c_limit,h_${input.maxHeight},w_${input.maxWidth},q_auto:good,so_0,f_jpg`,
  ].join("|");
  const signedParams = {
    eager,
    eager_async: "false",
    invalidate: "true",
    overwrite: "true",
    public_id: publicId,
    timestamp,
  };
  const form = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(signedParams).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
    api_key: config.apiKey,
    file: input.signedUrl,
    signature: cloudinarySignature(signedParams, config.apiSecret),
  });
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/video/upload`,
    {
      method: "POST",
      body: form,
      signal: input.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );
  if (!response.ok) throw new Error("VIDEO_TRANSCODER_REQUEST_FAILED");
  const payload = (await response.json()) as Row & {
    eager?: Array<Row>;
  };
  const duration = Number(payload.duration || 0);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > input.maxDuration
  ) {
    throw new Error("VIDEO_TRANSCODER_DURATION_INVALID");
  }
  const derivatives = Array.isArray(payload.eager) ? payload.eager : [];
  const video = derivatives.find(
    (item) =>
      String(item.format || "").toLowerCase() === "mp4" &&
      safeHttpsUrl(item.secure_url),
  );
  const poster = derivatives.find(
    (item) =>
      ["jpg", "jpeg"].includes(String(item.format || "").toLowerCase()) &&
      safeHttpsUrl(item.secure_url),
  );
  const outputSize = Number(video?.bytes || 0);
  if (
    !video ||
    !poster ||
    !Number.isFinite(outputSize) ||
    outputSize < 1 ||
    outputSize > 25 * 1024 * 1024
  ) {
    throw new Error("VIDEO_TRANSCODER_INVALID_OUTPUT");
  }
  return {
    output_url: safeHttpsUrl(video.secure_url),
    poster_url: safeHttpsUrl(poster.secure_url),
    output_size_bytes: outputSize,
    duration_seconds: duration,
    width_px: Number(video.width || payload.width || 0) || null,
    height_px: Number(video.height || payload.height || 0) || null,
    provider_job_id: `cloudinary:${String(payload.public_id || publicId)}`,
  };
}

export async function testVideoTranscoderConnection() {
  const cloudinary = cloudinaryConfig();
  if (cloudinary) {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/resources/video?max_results=1`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${cloudinary.apiKey}:${cloudinary.apiSecret}`,
          ).toString("base64")}`,
        },
      },
    );
    if (!response.ok) throw new Error("PROVIDER_CONNECTION_FAILED");
    return;
  }
  const endpoint = safeHttpsUrl(process.env.MEDIA_TRANSCODE_ENDPOINT);
  const token = process.env.MEDIA_TRANSCODE_TOKEN;
  if (!endpoint || !token) throw new Error("NOT_CONFIGURED");
  const response = await fetch(endpoint, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 405) {
    throw new Error("PROVIDER_CONNECTION_FAILED");
  }
}

async function assertJobActive(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from("video_processing_jobs")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (data.status === "Cancelled") throw new Error("VIDEO_PROCESSING_CANCELLED");
}

export async function processVideoJob(
  admin: SupabaseClient,
  job: Row,
  profile: Row,
) {
  const id = String(job.id);
  await admin
    .from("video_processing_jobs")
    .update({
      status: "Inspecting",
      progress_percent: 10,
      attempt_count: Number(job.attempt_count || 0) + 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      safe_error_code: null,
      error_reference: null,
      source_cleanup_status: "Retained",
      source_cleanup_after: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .eq("id", id)
    .neq("status", "Cancelled");
  await assertJobActive(admin, id);
  const { data: signed, error: signedError } = await admin.storage
    .from(String(job.source_bucket))
    .createSignedUrl(String(job.source_path), 600);
  if (signedError || !signed?.signedUrl) {
    throw signedError || new Error("VIDEO_SOURCE_UNAVAILABLE");
  }
  const inspectionResponse = await fetch(signed.signedUrl, {
    headers: { Range: "bytes=0-2097151" },
  });
  if (!inspectionResponse.ok) {
    throw new Error("VIDEO_SOURCE_INSPECTION_FAILED");
  }
  const inspected = inspectVideoBytes(
    new Uint8Array(await inspectionResponse.arrayBuffer()),
    String(job.source_mime_type),
  );
  await admin
    .from("video_processing_jobs")
    .update({
      detected_container: inspected.container,
      detected_video_codec: inspected.videoCodec,
      detected_audio_codec: inspected.audioCodec,
      progress_percent: 25,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "Cancelled");
  await assertJobActive(admin, id);

  if (
    inspected.browserSafe &&
    Number(job.source_size_bytes) <= 25 * 1024 * 1024
  ) {
    const { data } = admin.storage
      .from(String(job.source_bucket))
      .getPublicUrl(String(job.source_path));
    return await complete(admin, id, {
      output_bucket: job.source_bucket,
      output_path: job.source_path,
      output_url: data.publicUrl,
      output_size_bytes: job.source_size_bytes,
      detected_container: inspected.container,
      detected_video_codec: inspected.videoCodec,
      detected_audio_codec: inspected.audioCodec,
      source_cleanup_after: null,
      source_cleanup_status: "Retained",
    });
  }

  const endpoint = safeHttpsUrl(process.env.MEDIA_TRANSCODE_ENDPOINT);
  const token = process.env.MEDIA_TRANSCODE_TOKEN;
  if (!videoTranscoderConfigured())
    throw new Error("VIDEO_TRANSCODER_NOT_CONFIGURED");
  await admin
    .from("video_processing_jobs")
    .update({
      status: "Transcoding",
      progress_percent: 35,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "Cancelled");
  await assertJobActive(admin, id);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110_000);
  try {
    const cloudinary = await transcodeWithCloudinary({
      signedUrl: signed.signedUrl,
      jobId: id,
      maxDuration: Number(profile.max_duration_seconds),
      maxWidth: Number(profile.max_width_px),
      maxHeight: Number(profile.max_height_px),
      signal: controller.signal,
    });
    if (cloudinary) {
      await assertJobActive(admin, id);
      return await complete(admin, id, {
        output_bucket: null,
        output_path: null,
        ...cloudinary,
        detected_container: "mp4",
        detected_video_codec: "h264",
        detected_audio_codec: "aac",
        source_cleanup_after: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        source_cleanup_status: "Scheduled",
        original_preserved: true,
      });
    }
    if (!endpoint || !token)
      throw new Error("VIDEO_TRANSCODER_NOT_CONFIGURED");
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        job_id: id,
        input: {
          signed_url: signed.signedUrl,
          mime_type: job.source_mime_type,
        },
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
    const payload = (await response.json()) as Row;
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
    ) {
      throw new Error("VIDEO_TRANSCODER_INVALID_OUTPUT");
    }
    await assertJobActive(admin, id);
    return await complete(admin, id, {
      output_bucket: governedOutputPath(payload.output_path)
        ? job.source_bucket
        : null,
      output_path: governedOutputPath(payload.output_path),
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
      source_cleanup_after: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString(),
      source_cleanup_status: "Scheduled",
      original_preserved: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function complete(
  admin: SupabaseClient,
  id: string,
  output: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from("video_processing_jobs")
    .update({
      ...output,
      status: "Ready",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "Cancelled")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("VIDEO_PROCESSING_CANCELLED");
  return data;
}
