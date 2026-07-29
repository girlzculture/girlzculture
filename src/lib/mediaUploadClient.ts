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
import { isUuid } from "@/lib/mediaUploadProtocol";
import {
  MEDIA_FINALIZE_MAX_ATTEMPTS,
  mediaFinalizeSessionIsTerminal,
  runBoundedMediaFinalize,
} from "@/lib/mediaUploadRetryCore";
import type {
  ImagePresetKey,
  ResponsiveImageTransforms,
} from "@/lib/imageUpload";

type UploadFiles = Partial<Record<MediaUploadSlot, File>>;

export type DirectMediaUploadInput = {
  client: SupabaseClient;
  session: Session;
  bucket: string;
  folder: string;
  kind: ImagePresetKey;
  source: File;
  sourceDimensions: { width: number; height: number };
  transforms: ResponsiveImageTransforms;
  attachment?: MediaAttachment | null;
  resumeUploadId?: string | null;
  onFinalizePending?: (uploadId: string | null) => void;
  onProgress?: (progress: number, stage: string) => void;
};

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
  onProgress?: (progress: number, stage: string) => void;
}) {
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
        "The image uploaded, but could not be attached.",
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
            "The image uploaded, but could not be attached.",
          ),
          failureStatus,
        ),
      };
    },
    onRetry: (nextAttempt) =>
      input.onProgress?.(
        84,
        `Confirming saved image (attempt ${nextAttempt} of ${MEDIA_FINALIZE_MAX_ATTEMPTS})`,
      ),
  });
}

export async function directMediaUpload(input: DirectMediaUploadInput) {
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
      input.onProgress?.(78, "Resuming saved image confirmation");
    } else {
      input.onProgress?.(5, "Preparing original image");
      const files = {
        source: descriptor(input.source, input.sourceDimensions),
      } as MediaPrepareRequest["files"];
      const request: MediaPrepareRequest = {
        bucket: input.bucket,
        folder: input.folder,
        kind: input.kind,
        crop_metadata: {
          version: 2,
          source: input.sourceDimensions,
          transforms: input.transforms,
          mode: "server_canonical_crop",
        },
        files,
        attachment: input.attachment || null,
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
      uploadId = prepareBody.upload_id;
      prepareRequestId = prepareBody.request_id || "";
      const uploadFiles: UploadFiles = { source: input.source };
      const total = Math.max(1, prepareBody.uploads.length);
      for (let index = 0; index < prepareBody.uploads.length; index += 1) {
        const prepared = prepareBody.uploads[index];
        const file = uploadFiles[prepared.slot];
        if (!file) throw new Error(`The ${prepared.slot} image is unavailable.`);
        input.onProgress?.(
          15 + Math.round((index / total) * 65),
          "Preserving original image",
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
            code: "SIGNED_IMAGE_UPLOAD_FAILED",
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
    input.onProgress?.(72, "Creating responsive crops");
    const finalized = await finalizePreparedMediaUpload({
      uploadId,
      session: input.session,
      prepareRequestId,
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
