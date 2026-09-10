import { createHash, randomUUID } from "node:crypto";
import { authorizeMediaUpload } from "@/lib/mediaUploadServer";
import { MEDIA_SOURCE_BUCKET, type MediaFileDescriptor, type MediaPrepareRequest, type PreparedMediaObject } from "@/lib/mediaUploadProtocol";
import { BUSINESS_HERO_VIDEO_BUCKET, BUSINESS_HERO_VIDEO_FOLDER, BUSINESS_HERO_VIDEO_KIND, BUSINESS_HERO_VIDEO_MAX_BYTES, BusinessHeroVideoValidationError, inspectBusinessHeroMp4 } from "@/lib/businessHeroVideoCore";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PreparedVideoObject = Omit<PreparedMediaObject, "token">;

export async function prepareBusinessHeroVideoUpload(request: Request, body: MediaPrepareRequest) {
  // The new preset has exactly one editorial scope; salon/review uploads cannot
  // opt into video or the larger bucket ceiling by changing their kind.
  if (body.kind !== BUSINESS_HERO_VIDEO_KIND || body.bucket !== BUSINESS_HERO_VIDEO_BUCKET || body.folder !== BUSINESS_HERO_VIDEO_FOLDER) {
    throw new BusinessHeroVideoValidationError("Choose the business hero video upload destination.");
  }
  const context = await authorizeMediaUpload(request, BUSINESS_HERO_VIDEO_BUCKET, BUSINESS_HERO_VIDEO_FOLDER);
  const source = body.files?.source;
  if (!source || Object.keys(body.files).length !== 1 || body.attachment) {
    throw new BusinessHeroVideoValidationError("Upload one original business hero video without a record attachment.");
  }
  if (source.mime_type !== "video/mp4") throw new BusinessHeroVideoValidationError("Upload an MP4 video for the business hero.");
  if (!Number.isInteger(source.file_size_bytes) || source.file_size_bytes < 1 || source.file_size_bytes > BUSINESS_HERO_VIDEO_MAX_BYTES) {
    throw new BusinessHeroVideoValidationError("The hero video must be 12 MB or smaller and must not be empty.");
  }
  const dimensions = [source.width, source.height];
  if (dimensions.some(value => !Number.isInteger(value) || value < 48 || value > 7680) || source.width * source.height > 33_177_600) {
    throw new BusinessHeroVideoValidationError("Choose a readable hero video no larger than 8K.");
  }
  const uploadId = randomUUID();
  const descriptor: MediaFileDescriptor = { name: "business-signup-hero.mp4", mime_type: "video/mp4", file_size_bytes: source.file_size_bytes, width: source.width, height: source.height };
  const original: PreparedVideoObject = { ...descriptor, slot: "source", bucket: MEDIA_SOURCE_BUCKET, path: `${BUSINESS_HERO_VIDEO_BUCKET}/${BUSINESS_HERO_VIDEO_FOLDER}/${uploadId}-source.mp4` };
  const published: PreparedVideoObject = { ...descriptor, slot: "desktop", bucket: BUSINESS_HERO_VIDEO_BUCKET, path: `${BUSINESS_HERO_VIDEO_FOLDER}/${uploadId}-desktop.mp4` };
  const { data, error } = await context.admin.storage.from(MEDIA_SOURCE_BUCKET).createSignedUploadUrl(original.path, { upsert: false });
  if (error || !data?.token) throw error || new Error("BUSINESS_HERO_VIDEO_SIGNED_UPLOAD_UNAVAILABLE");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: sessionError } = await context.admin.from("media_upload_sessions").insert({
    id: uploadId, owner_user_id: context.user.id, salon_id: null,
    destination_bucket: BUSINESS_HERO_VIDEO_BUCKET, destination_folder: BUSINESS_HERO_VIDEO_FOLDER,
    media_kind: BUSINESS_HERO_VIDEO_KIND, expected_objects: { source: original, desktop: published },
    crop_metadata: { version: 1, mode: "preserved_business_hero_video" }, attachment: {},
    status: "Prepared", expires_at: expiresAt,
  });
  if (sessionError) throw sessionError;
  return { context, uploadId, uploads: [{ ...original, token: data.token }], expiresAt };
}

export async function verifyBusinessHeroVideoUpload(admin: ReturnType<typeof getSupabaseAdmin>, session: Record<string, unknown>) {
  const expected = session.expected_objects as { source?: PreparedVideoObject; desktop?: PreparedVideoObject } | undefined;
  const original = expected?.source;
  const target = expected?.desktop;
  const id = String(session.id || "");
  if (session.media_kind !== BUSINESS_HERO_VIDEO_KIND || session.destination_bucket !== BUSINESS_HERO_VIDEO_BUCKET || session.destination_folder !== BUSINESS_HERO_VIDEO_FOLDER || !original || !target
    || original.bucket !== MEDIA_SOURCE_BUCKET || original.path !== `${BUSINESS_HERO_VIDEO_BUCKET}/${BUSINESS_HERO_VIDEO_FOLDER}/${id}-source.mp4`
    || target.bucket !== BUSINESS_HERO_VIDEO_BUCKET || target.path !== `${BUSINESS_HERO_VIDEO_FOLDER}/${id}-desktop.mp4`
    || original.mime_type !== "video/mp4" || target.mime_type !== "video/mp4") throw new Error("BUSINESS_HERO_VIDEO_PREPARED_SCOPE_INVALID");
  const { data: source, error } = await admin.storage.from(MEDIA_SOURCE_BUCKET).download(original.path);
  if (error || !source) throw error || new Error("BUSINESS_HERO_VIDEO_SOURCE_UNAVAILABLE");
  if (source.type !== "video/mp4") throw new BusinessHeroVideoValidationError("Upload an MP4 video for the business hero.");
  if (source.size !== original.file_size_bytes || source.size > BUSINESS_HERO_VIDEO_MAX_BYTES) throw new BusinessHeroVideoValidationError("The uploaded hero video does not match its prepared size.");
  const bytes = new Uint8Array(await source.arrayBuffer());
  const metadata = inspectBusinessHeroMp4(bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  // The submitted final MP4 is preserved; this preset makes no claims about
  // transcoding, generated posters or separate responsive video renditions.
  const { error: uploadError } = await admin.storage.from(BUSINESS_HERO_VIDEO_BUCKET).upload(target.path, bytes, { contentType: "video/mp4", cacheControl: "31536000", upsert: true });
  if (uploadError) throw uploadError;
  const { data: stored, error: storedError } = await admin.storage.from(BUSINESS_HERO_VIDEO_BUCKET).download(target.path);
  if (storedError || !stored || stored.type !== "video/mp4" || stored.size !== bytes.length || createHash("sha256").update(new Uint8Array(await stored.arrayBuffer())).digest("hex") !== checksum) throw new Error("BUSINESS_HERO_VIDEO_STORAGE_VERIFY_FAILED");
  const details = { mime_type: "video/mp4", file_size_bytes: bytes.length, width: metadata.width, height: metadata.height, duration_seconds: metadata.durationSeconds, checksum_sha256: checksum };
  const { data: publicData } = admin.storage.from(BUSINESS_HERO_VIDEO_BUCKET).getPublicUrl(target.path);
  return {
    source: { ...details, bucket: MEDIA_SOURCE_BUCKET, path: original.path },
    renditions: { desktop: { ...details, bucket: BUSINESS_HERO_VIDEO_BUCKET, path: target.path, url: publicData.publicUrl } },
  };
}
