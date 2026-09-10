import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readApiResponse } from "@/lib/apiResponseClient";
import { reportClientOperationalFailure } from "@/lib/supabase";
import type {
  MediaAttachment,
  MediaFileDescriptor,
  MediaFinalizeResponse,
  MediaPrepareRequest,
  MediaPrepareResponse,
  MediaUploadSlot,
} from "@/lib/mediaUploadProtocol";
import {
  isCanonicalDirectUploadPlan,
  isUuid,
} from "@/lib/mediaUploadProtocol";
import {
  MEDIA_FINALIZE_MAX_ATTEMPTS,
  mediaFinalizeSessionIsTerminal,
  runBoundedMediaFinalize,
} from "@/lib/mediaUploadRetryCore";
import type {
  ImagePresetKey,
  ResponsiveImageTransforms,
} from "@/lib/imageUpload";
import { normalizeImageFile } from "@/lib/imageUpload";
import { BUSINESS_HERO_VIDEO_BUCKET, BUSINESS_HERO_VIDEO_FOLDER, BUSINESS_HERO_VIDEO_KIND, normalizeBusinessHeroVideo } from "@/lib/businessHeroVideoCore";

type UploadFiles = Partial<Record<MediaUploadSlot, File>>;

export type DirectMediaUploadInput = {
  client: SupabaseClient;
  session: Session;
  bucket: string;
  folder: string;
  source: File;
  resumeUploadId?: string | null;
  onFinalizePending?: (uploadId: string | null) => void;
  onProgress?: (progress: number, stage: string) => void;
} & ({
  kind: ImagePresetKey;
  sourceDimensions: { width: number; height: number };
  transforms: ResponsiveImageTransforms;
  attachment?: MediaAttachment | null;
} | { kind: typeof BUSINESS_HERO_VIDEO_KIND });

function descriptor(
  file: File,
  dimensions: { width: number; height: number },
): MediaFileDescriptor {
  return {
    name: file.name,
    mime_type: file.type,
    file_size_bytes: file.size,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function safeApiError(body: Record<string, unknown>, fallback: string) {
  const message = String(body.error || fallback);
  const reference = String(body.request_id || body.reference || "");
  if (
    reference &&
    !message.toLowerCase().includes(reference.toLowerCase())
  ) {
    return `${message} Reference ${reference}.`;
  }
  return message;
}

async function abortPreparedUpload(
  uploadId: string,
  session: Session,
) {
  try {
    await fetch("/api/media/upload", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ upload_id: uploadId }),
      cache: "no-store",
    });
  } catch {
    // The scheduled cleanup route owns abandoned signed-upload sessions.
  }
}

class MediaFinalizeError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MediaFinalizeError";
    this.status = status;
  }
}

async function finalizePreparedMediaUpload(input: {
  uploadId: string;
  session: Session;
  prepareRequestId?: string;
  mediaName?: "image" | "video";
  onProgress?: (progress: number, stage: string) => void;
}) {
  const failureMessage = input.mediaName === "video" ? "The video uploaded, but could not be saved." : "The image uploaded, but could not be attached.";
  return runBoundedMediaFinalize({
    uploadId: input.uploadId,
    attempt: async (uploadId) => {
      const finalizeResponse = await fetch("/api/media/upload/finalize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ upload_id: uploadId }),
        cache: "no-store",
      });
      const finalizeBody = (await readApiResponse(
        finalizeResponse,
        failureMessage,
      )) as MediaFinalizeResponse;
      if (finalizeResponse.ok && finalizeBody.url) {
        return {
          ok: true as const,
          value: {
            uploadId,
            url: finalizeBody.url,
            attached: finalizeBody.attached === true,
            assetId: finalizeBody.asset_id || "",
            requestId:
              finalizeBody.request_id || input.prepareRequestId || "",
          },
        };
      }
      const failureStatus = finalizeResponse.ok
        ? 503
        : finalizeResponse.status;
      return {
        ok: false as const,
        status: failureStatus,
        error: new MediaFinalizeError(
          safeApiError(
            finalizeBody,
            failureMessage,
          ),
          failureStatus,
        ),
      };
    },
    onRetry: (nextAttempt) =>
      input.onProgress?.(
        84,
        `Confirming saved ${input.mediaName || "image"} (attempt ${nextAttempt} of ${MEDIA_FINALIZE_MAX_ATTEMPTS})`,
      ),
  });
}

export async function directMediaUpload(input: DirectMediaUploadInput) {
  const isVideo = input.kind === BUSINESS_HERO_VIDEO_KIND;
  let uploadId = String(input.resumeUploadId || "");
  let prepareRequestId = "";
  let everyObjectUploaded = Boolean(uploadId);
  try {
    if (uploadId) {
      if (!isUuid(uploadId)) {
        input.onFinalizePending?.(null);
        throw new Error("The saved image reference is invalid. Upload it again.");
      }
      input.onFinalizePending?.(uploadId);
      input.onProgress?.(78, isVideo ? "Resuming saved video confirmation" : "Resuming saved image confirmation");
    } else {
      input.onProgress?.(5, isVideo ? "Preparing original video" : "Preparing original image");
      const preparedVideo = input.kind === BUSINESS_HERO_VIDEO_KIND ? await normalizeBusinessHeroVideo(input.source) : null;
      const normalizedSource = preparedVideo?.file || await normalizeImageFile(input.source);
      const sourceDimensions = preparedVideo?.metadata || (input.kind !== BUSINESS_HERO_VIDEO_KIND ? input.sourceDimensions : { width: 0, height: 0 });
      const files = {
        source: descriptor(normalizedSource, sourceDimensions),
      } as MediaPrepareRequest["files"];
      const request: MediaPrepareRequest = {
        bucket: input.bucket,
        folder: input.folder,
        kind: input.kind,
        crop_metadata: {
          version: 2,
          source: sourceDimensions,
          transforms: input.kind !== BUSINESS_HERO_VIDEO_KIND ? input.transforms : undefined,
          mode: preparedVideo ? "preserved_business_hero_video" : "server_canonical_crop",
        },
        files,
        attachment: input.kind !== BUSINESS_HERO_VIDEO_KIND ? input.attachment || null : null,
      };
      const prepareResponse = await fetch("/api/media/upload/prepare", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        cache: "no-store",
      });
      const prepareBody = (await readApiResponse(
        prepareResponse,
        "The image upload could not be prepared.",
      )) as MediaPrepareResponse;
      if (
        !prepareResponse.ok ||
        !prepareBody.upload_id ||
        !Array.isArray(prepareBody.uploads)
      ) {
        throw new Error(
          safeApiError(
            prepareBody,
            "The image upload could not be prepared.",
          ),
        );
      }
      if (
        !isCanonicalDirectUploadPlan(
          prepareBody.uploads.map((prepared) => prepared.slot),
        )
      ) {
        throw new Error(
          "The image upload protocol is out of date. Refresh the page and try again.",
        );
      }
      uploadId = prepareBody.upload_id;
      prepareRequestId = prepareBody.request_id || "";
      const uploadFiles: UploadFiles = { source: normalizedSource };
      const total = Math.max(1, prepareBody.uploads.length);
      for (let index = 0; index < prepareBody.uploads.length; index += 1) {
        const prepared = prepareBody.uploads[index];
        const file = uploadFiles[prepared.slot];
        if (!file) throw new Error(`The ${prepared.slot} image is unavailable.`);
        input.onProgress?.(
          15 + Math.round((index / total) * 65),
          isVideo ? "Preserving original video" : "Preserving original image",
        );
        const result = await input.client.storage
          .from(prepared.bucket)
          .uploadToSignedUrl(prepared.path, prepared.token, file, {
            contentType: file.type,
            cacheControl: "31536000",
          });
        if (result.error) {
          const status = Number(
            (result.error as unknown as { statusCode?: number }).statusCode ||
              500,
          );
          const report = await reportClientOperationalFailure({
            status,
            code: isVideo ? "SIGNED_VIDEO_UPLOAD_FAILED" : "SIGNED_IMAGE_UPLOAD_FAILED",
            operation: `media-upload:${prepared.slot}:${uploadId}`,
            provider: "supabase",
            authorization: `Bearer ${input.session.access_token}`,
          });
          throw new Error(report.message);
        }
      }
      everyObjectUploaded = true;
      input.onFinalizePending?.(uploadId);
    }
    input.onProgress?.(72, input.kind === BUSINESS_HERO_VIDEO_KIND ? "Verifying hero video" : "Creating responsive crops");
    const finalized = await finalizePreparedMediaUpload({
      uploadId,
      session: input.session,
      prepareRequestId,
      mediaName: isVideo ? "video" : "image",
      onProgress: input.onProgress,
    });
    input.onFinalizePending?.(null);
    input.onProgress?.(100, "Saved");
    return finalized;
  } catch (error) {
    // If the browser-to-Storage transfer failed, remove the partial upload
    // immediately. Once every object exists, keep the prepared session so a
    // transient finalize/database failure can be retried until its expiry.
    if (!everyObjectUploaded && uploadId) {
      await abortPreparedUpload(uploadId, input.session);
      input.onFinalizePending?.(null);
    } else if (
      error instanceof MediaFinalizeError &&
      mediaFinalizeSessionIsTerminal(error.status)
    ) {
      await abortPreparedUpload(uploadId, input.session);
      input.onFinalizePending?.(null);
    }
    throw error;
  }
}

export function directBusinessHeroVideoUpload(input: {
  client: SupabaseClient;
  session: Session;
  source: File;
  resumeUploadId?: string | null;
  onFinalizePending?: (uploadId: string | null) => void;
  onProgress?: (progress: number, stage: string) => void;
}) {
  return directMediaUpload({ ...input, bucket: BUSINESS_HERO_VIDEO_BUCKET, folder: BUSINESS_HERO_VIDEO_FOLDER, kind: BUSINESS_HERO_VIDEO_KIND });
}

export async function persistMediaOrder(input: {
  session: Session;
  bucket: string;
  folder: string;
  attachment: MediaAttachment;
  urls: string[];
}) {
  const response = await fetch("/api/media/upload", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucket: input.bucket,
      folder: input.folder,
      attachment: input.attachment,
      urls: input.urls,
    }),
    cache: "no-store",
  });
  const body = await readApiResponse(
    response,
    "The image order could not be saved.",
  );
  if (!response.ok) {
    throw new Error(
      safeApiError(body, "The image order could not be saved."),
    );
  }
  return Array.isArray(body.persisted_urls)
    ? body.persisted_urls.map(String)
    : input.urls;
}
