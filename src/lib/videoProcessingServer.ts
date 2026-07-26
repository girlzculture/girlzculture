import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  classifyVideoProviderStatus,
  classifyVideoTranscoderError,
  missingVideoTranscoderConfiguration,
  providerNetworkFailure,
  VideoTranscoderError,
} from "@/lib/videoTranscoderCore";
import { inspectVideoBytes } from "@/lib/videoInspection";
import { loadVideoTranscoderRuntimeConfig } from "@/lib/videoTranscoderServer";

type Row = Record<string, unknown>;

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
  config: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  signedUrl: string;
  jobId: string;
  maxDuration: number;
  maxWidth: number;
  maxHeight: number;
  signal: AbortSignal;
}) {
  const config = input.config;
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
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/video/upload`,
      {
        method: "POST",
        body: form,
        signal: input.signal,
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
  } catch (error) {
    throw providerNetworkFailure(error);
  }
  if (!response.ok)
    throw classifyVideoProviderStatus(response.status, "transcode");
  const payload = (await response.json()) as Row & {
    eager?: Array<Row>;
  };
  const duration = Number(payload.duration || 0);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > input.maxDuration
  ) {
    throw new VideoTranscoderError({
      code: "VIDEO_TRANSCODING_FAILED",
      state: "transcoding_failure",
      status: 502,
      safeMessage: "Cloudinary returned an invalid video duration.",
    });
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
    throw new VideoTranscoderError({
      code: "VIDEO_TRANSCODING_FAILED",
      state: "transcoding_failure",
      status: 502,
      safeMessage: "Cloudinary did not return a valid video and poster.",
    });
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

  const runtime = loadVideoTranscoderRuntimeConfig();
  if (!runtime.diagnostic.configured)
    throw missingVideoTranscoderConfiguration();
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
    if (runtime.cloudinary) {
      const cloudinary = await transcodeWithCloudinary({
        config: runtime.cloudinary,
        signedUrl: signed.signedUrl,
        jobId: id,
        maxDuration: Number(profile.max_duration_seconds),
        maxWidth: Number(profile.max_width_px),
        maxHeight: Number(profile.max_height_px),
        signal: controller.signal,
      });
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
    if (!runtime.custom) throw missingVideoTranscoderConfiguration();
    let response: Response;
    try {
      response = await fetch(runtime.custom.endpoint, {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${runtime.custom.token}`,
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
    } catch (error) {
      throw providerNetworkFailure(error);
    }
    if (!response.ok)
      throw classifyVideoProviderStatus(response.status, "transcode");
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
      throw new VideoTranscoderError({
        code: "VIDEO_TRANSCODING_FAILED",
        state: "transcoding_failure",
        status: 502,
        safeMessage:
          "The video provider did not return a valid video and poster.",
      });
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
  } catch (error) {
    throw classifyVideoTranscoderError(error);
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
