import { createHash, randomUUID } from "crypto";
import type { User } from "@supabase/supabase-js";
import {
  getSupabaseAdmin,
  requireAdminPermission,
  requireSalonPermission,
} from "@/lib/supabaseAdmin";
import {
  IMAGE_UPLOAD_PROFILES,
  MAX_IMAGE_UPLOAD_BYTES,
  profileForRendition,
  type ImagePresetKey,
  type ImageUploadProfile,
} from "@/lib/imageUpload";
import {
  MEDIA_RENDITION_SLOTS,
  MEDIA_SOURCE_BUCKET,
  normalizeAttachment,
  type MediaAttachment,
  type MediaFileDescriptor,
  type MediaPrepareRequest,
  type MediaUploadSlot,
} from "@/lib/mediaUploadProtocol";

export type MediaAuthorizationContext = {
  admin: ReturnType<typeof getSupabaseAdmin>;
  user: User;
  salon?: { id: string };
};

type ExpectedObject = MediaFileDescriptor & {
  slot: MediaUploadSlot;
  bucket: string;
  path: string;
};

export function mediaRequestId() {
  return randomUUID();
}

export async function authenticateMediaRequest(
  request: Request,
  admin = getSupabaseAdmin(),
) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export function safeMediaFolder(value: string) {
  return value
    .split("/")
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .join("/");
}

function safeMediaName(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "image";
}

function extensionFor(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

export function imageDimensions(buffer: Buffer, mime: string) {
  if (
    mime === "image/png" &&
    buffer.length >= 24 &&
    buffer.subarray(1, 4).toString() === "PNG"
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (
    mime === "image/gif" &&
    buffer.length >= 10 &&
    ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString())
  ) {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }
  if (
    mime === "image/jpeg" &&
    buffer.length > 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
          0xcd, 0xce, 0xcf,
        ].includes(marker)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  throw new Error(
    "This file is damaged or its image format does not match its extension.",
  );
}

export async function loadMediaProfile(
  admin: ReturnType<typeof getSupabaseAdmin>,
  kind: ImagePresetKey,
) {
  const fallback = IMAGE_UPLOAD_PROFILES[kind];
  if (!fallback) throw new Error("This image placement is not supported.");
  const { data, error } = await admin
    .from("media_upload_profiles")
    .select("*")
    .eq("profile_key", kind)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return fallback;
  return {
    ...fallback,
    label: String(data.display_name || fallback.label),
    aspectWidth: Number(data.aspect_width || fallback.aspectWidth),
    aspectHeight: Number(data.aspect_height || fallback.aspectHeight),
    minWidth: Number(data.min_width_px || fallback.minWidth),
    minHeight: Number(data.min_height_px || fallback.minHeight),
    outputWidth: Number(data.output_width_px || fallback.outputWidth),
    maxBytes: Number(data.max_bytes || fallback.maxBytes),
    safeArea: data.safe_area_enabled === true,
    acceptedMimeTypes: Array.isArray(data.accepted_mime_types)
      ? data.accepted_mime_types.map(String)
      : fallback.acceptedMimeTypes,
  } satisfies ImageUploadProfile;
}

export async function authorizeMediaUpload(
  request: Request,
  bucket: string,
  folder: string,
): Promise<MediaAuthorizationContext> {
  const segments = folder.split("/").filter(Boolean);
  if (bucket === "content-media") {
    return requireAdminPermission(
      request,
      "content",
    ) as Promise<MediaAuthorizationContext>;
  }
  if (bucket === "salon-photos") {
    const context = await requireSalonPermission(
      request,
      segments[2] === "products" ? "products" : "photos",
    );
    if (segments[0] !== "salons" || segments[1] !== context.salon.id) {
      throw new Error("This upload folder does not belong to your salon.");
    }
    return context as MediaAuthorizationContext;
  }
  if (bucket === "style-photos") {
    const context = await requireSalonPermission(request, "styles");
    const { data, error } = await context.admin
      .from("styles")
      .select("salon_id")
      .eq("id", segments[1] || "")
      .maybeSingle();
    if (error) throw error;
    if (
      segments[0] !== "styles" ||
      data?.salon_id !== context.salon.id
    ) {
      throw new Error("Save this service before uploading its images.");
    }
    return context as MediaAuthorizationContext;
  }
  if (bucket === "stylist-photos") {
    const context = await requireSalonPermission(request, "stylists");
    if (
      segments[0] === "salons" &&
      segments[1] === context.salon.id &&
      segments[2] === "staging" &&
      /^stylist-[a-f0-9-]{20,60}$/i.test(segments[3] || "")
    ) {
      return context as MediaAuthorizationContext;
    }
    const { data, error } = await context.admin
      .from("stylists")
      .select("salon_id")
      .eq("id", segments[1] || "")
      .maybeSingle();
    if (error) throw error;
    if (
      segments[0] !== "stylists" ||
      data?.salon_id !== context.salon.id
    ) {
      throw new Error(
        "This photo does not belong to your salon or stylist form.",
      );
    }
    return context as MediaAuthorizationContext;
  }
  if (bucket === "review-photos") {
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Please sign in before uploading review photos.");
    const admin = getSupabaseAdmin();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    const bookingId = segments[0] === "reviews" ? segments[1] : "";
    const { data: booking, error } = await admin
      .from("bookings")
      .select("id,customer_id,guest_email,status")
      .eq("id", bookingId || "")
      .maybeSingle();
    if (error) throw error;
    const email = auth.user.email?.trim().toLowerCase();
    if (
      !booking ||
      (booking.customer_id !== auth.user.id &&
        booking.guest_email?.trim().toLowerCase() !== email) ||
      String(booking.status).toLowerCase() !== "completed"
    ) {
      throw new Error(
        "Review photos are available only for your completed booking.",
      );
    }
    return { admin, user: auth.user };
  }
  throw new Error("This upload destination is not supported.");
}

function descriptor(
  value: unknown,
  slot: MediaUploadSlot,
): MediaFileDescriptor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`The ${slot} image was not prepared.`);
  }
  const row = value as Record<string, unknown>;
  const result = {
    name: String(row.name || "").slice(0, 180),
    mime_type: String(row.mime_type || "").toLowerCase(),
    file_size_bytes: Number(row.file_size_bytes),
    width: Number(row.width),
    height: Number(row.height),
  };
  if (
    !result.name ||
    !Number.isInteger(result.file_size_bytes) ||
    result.file_size_bytes <= 0 ||
    !Number.isInteger(result.width) ||
    result.width <= 0 ||
    !Number.isInteger(result.height) ||
    result.height <= 0
  ) {
    throw new Error(`The ${slot} image details are invalid.`);
  }
  return result;
}

function validateDescriptor(
  value: MediaFileDescriptor,
  slot: MediaUploadSlot,
  profile: ImageUploadProfile,
  sourceMimeType: string,
) {
  const accepted = profile.acceptedMimeTypes || ["image/jpeg", "image/png"];
  if (!accepted.includes(value.mime_type)) {
    throw new Error("Upload a supported JPG, PNG, or animated GIF.");
  }
  if (slot === "source") {
    if (value.file_size_bytes > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("The original image must be 12 MB or smaller.");
    }
    if (value.width < profile.minWidth || value.height < profile.minHeight) {
      throw new Error(
        `${profile.label} images must be at least ${profile.minWidth} × ${profile.minHeight}px.`,
      );
    }
    return;
  }
  if (sourceMimeType === "image/gif") {
    if (slot !== "desktop" || value.mime_type !== "image/gif") {
      throw new Error("Animated GIF uploads preserve one responsive source.");
    }
    if (value.file_size_bytes > profile.maxBytes) {
      throw new Error(
        `The animated GIF must be ${Math.round(profile.maxBytes / 1024 / 1024)} MB or smaller for public delivery.`,
      );
    }
    return;
  }
  if (!["image/jpeg", "image/png"].includes(value.mime_type)) {
    throw new Error("Responsive image renditions must be JPG or PNG.");
  }
  if (value.file_size_bytes > profile.maxBytes) {
    throw new Error(
      `The ${slot} image must be ${Math.round(profile.maxBytes / 1024 / 1024)} MB or smaller.`,
    );
  }
  const target = profileForRendition(profile, slot);
  const expectedHeight = Math.round(
    (target.outputWidth * target.aspectHeight) / target.aspectWidth,
  );
  if (value.width !== target.outputWidth || value.height !== expectedHeight) {
    throw new Error(
      `The ${slot} crop must be ${target.outputWidth} × ${expectedHeight}px.`,
    );
  }
}

export async function validateMediaAttachment(
  context: MediaAuthorizationContext,
  bucket: string,
  folder: string,
  attachmentValue: unknown,
) {
  const attachment = normalizeAttachment(attachmentValue);
  if (!attachment) return null;
  const segments = folder.split("/").filter(Boolean);
  if (attachment.record_type === "salon") {
    if (
      bucket !== "salon-photos" ||
      !context.salon ||
      attachment.record_id !== context.salon.id
    ) {
      throw new Error("The salon media attachment is invalid.");
    }
    return attachment;
  }
  if (attachment.record_type === "style") {
    if (
      bucket !== "style-photos" ||
      segments[0] !== "styles" ||
      segments[1] !== attachment.record_id
    ) {
      throw new Error("The service media attachment is invalid.");
    }
    return attachment;
  }
  if (attachment.record_type === "stylist") {
    if (
      bucket !== "stylist-photos" ||
      segments[0] !== "stylists" ||
      segments[1] !== attachment.record_id
    ) {
      throw new Error("The stylist media attachment is invalid.");
    }
    return attachment;
  }
  if (attachment.record_type === "product") {
    if (
      bucket !== "salon-photos" ||
      !context.salon ||
      segments[0] !== "salons" ||
      segments[1] !== context.salon.id ||
      segments[2] !== "products"
    ) {
      throw new Error("The product media attachment is invalid.");
    }
    const { data, error } = await context.admin
      .from("salon_products")
      .select("salon_id")
      .eq("id", attachment.record_id)
      .maybeSingle();
    if (error) throw error;
    if (data?.salon_id !== context.salon.id) {
      throw new Error("The product media attachment is invalid.");
    }
    return attachment;
  }
  throw new Error("This media attachment is not supported.");
}

export async function prepareMediaUpload(
  request: Request,
  body: MediaPrepareRequest,
) {
  const bucket = String(body.bucket || "");
  const folder = safeMediaFolder(String(body.folder || ""));
  const kind = String(body.kind || "") as ImagePresetKey;
  if (
    !new Set([
      "salon-photos",
      "stylist-photos",
      "style-photos",
      "review-photos",
      "content-media",
    ]).has(bucket)
  ) {
    throw new Error("This upload destination is not supported.");
  }
  const context = await authorizeMediaUpload(request, bucket, folder);
  const profile = await loadMediaProfile(context.admin, kind);
  const source = descriptor(body.files?.source, "source");
  validateDescriptor(source, "source", profile, source.mime_type);
  const animated = source.mime_type === "image/gif";
  const requiredSlots: MediaUploadSlot[] = animated
    ? ["source", "desktop"]
    : ["source", ...MEDIA_RENDITION_SLOTS];
  const files = Object.fromEntries(
    requiredSlots.map((slot) => {
      const value = descriptor(body.files?.[slot], slot);
      validateDescriptor(value, slot, profile, source.mime_type);
      return [slot, value];
    }),
  ) as Record<MediaUploadSlot, MediaFileDescriptor>;
  const attachment = await validateMediaAttachment(
    context,
    bucket,
    folder,
    body.attachment,
  );
  const uploadId = randomUUID();
  const expected: Partial<Record<MediaUploadSlot, ExpectedObject>> = {};
  for (const slot of requiredSlots) {
    const value = files[slot];
    const targetBucket = slot === "source" ? MEDIA_SOURCE_BUCKET : bucket;
    const targetFolder =
      slot === "source"
        ? [bucket, folder].filter(Boolean).join("/")
        : folder;
    const path = `${targetFolder ? `${targetFolder}/` : ""}${uploadId}-${slot}-${safeMediaName(value.name)}.${extensionFor(value.mime_type)}`;
    expected[slot] = {
      ...value,
      slot,
      bucket: targetBucket,
      path,
    };
  }

  const uploads = [];
  for (const slot of requiredSlots) {
    const target = expected[slot]!;
    const { data, error } = await context.admin.storage
      .from(target.bucket)
      .createSignedUploadUrl(target.path, { upsert: false });
    if (error || !data?.token) throw error || new Error("Signed upload unavailable.");
    uploads.push({ ...target, token: data.token });
  }

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: sessionError } = await context.admin
    .from("media_upload_sessions")
    .insert({
      id: uploadId,
      owner_user_id: context.user.id,
      salon_id: context.salon?.id || null,
      destination_bucket: bucket,
      destination_folder: folder,
      media_kind: kind,
      expected_objects: expected,
      crop_metadata:
        body.crop_metadata &&
        typeof body.crop_metadata === "object" &&
        !Array.isArray(body.crop_metadata)
          ? body.crop_metadata
          : {},
      attachment: attachment || {},
      status: "Prepared",
      expires_at: expiresAt,
    });
  if (sessionError) throw sessionError;

  return {
    context,
    uploadId,
    uploads,
    expiresAt,
  };
}

function expectedObjects(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The prepared upload is invalid.");
  }
  return value as Partial<Record<MediaUploadSlot, ExpectedObject>>;
}

export async function verifyPreparedMediaObjects(
  admin: ReturnType<typeof getSupabaseAdmin>,
  expectedValue: unknown,
) {
  const expected = expectedObjects(expectedValue);
  const sourceExpected = expected.source;
  const desktopExpected = expected.desktop;
  if (!sourceExpected || !desktopExpected) {
    throw new Error("The prepared upload is incomplete.");
  }
  const verified: Record<string, Record<string, unknown>> = {};
  for (const [slot, target] of Object.entries(expected) as Array<
    [MediaUploadSlot, ExpectedObject]
  >) {
    if (!target?.bucket || !target.path) continue;
    const { data, error } = await admin.storage
      .from(target.bucket)
      .download(target.path);
    if (error || !data) {
      throw Object.assign(new Error("MEDIA_STORAGE_OBJECT_MISSING"), {
        provider: "supabase",
        code: "STORAGE_OBJECT_MISSING",
      });
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const actualMime = String(data.type || target.mime_type).toLowerCase();
    if (actualMime && actualMime !== target.mime_type) {
      throw new Error(`The ${slot} upload type does not match its preparation.`);
    }
    if (buffer.length !== Number(target.file_size_bytes)) {
      throw new Error(`The ${slot} upload size does not match its preparation.`);
    }
    const dimensions = imageDimensions(buffer, target.mime_type);
    if (
      dimensions.width !== Number(target.width) ||
      dimensions.height !== Number(target.height)
    ) {
      throw new Error(
        `The ${slot} upload dimensions do not match its preparation.`,
      );
    }
    const object: Record<string, unknown> = {
      bucket: target.bucket,
      path: target.path,
      mime_type: target.mime_type,
      file_size_bytes: buffer.length,
      width: dimensions.width,
      height: dimensions.height,
      checksum_sha256: createHash("sha256").update(buffer).digest("hex"),
    };
    if (slot !== "source") {
      const { data: publicData } = admin.storage
        .from(target.bucket)
        .getPublicUrl(target.path);
      object.url = publicData.publicUrl;
    }
    verified[slot] = object;
  }
  const desktop = verified.desktop;
  if (!desktop?.url) throw new Error("The public image rendition is unavailable.");
  const renditions = {
    desktop,
    tablet: verified.tablet || desktop,
    mobile: verified.mobile || desktop,
  };
  return { source: verified.source, renditions };
}

export async function removePreparedMediaObjects(
  admin: ReturnType<typeof getSupabaseAdmin>,
  expectedValue: unknown,
) {
  const expected = expectedObjects(expectedValue);
  const grouped = new Map<string, string[]>();
  for (const target of Object.values(expected)) {
    if (!target?.bucket || !target.path) continue;
    grouped.set(target.bucket, [
      ...(grouped.get(target.bucket) || []),
      target.path,
    ]);
  }
  for (const [bucket, paths] of grouped) {
    const { error } = await admin.storage.from(bucket).remove([...new Set(paths)]);
    if (error) throw error;
  }
}

export async function syncMediaAttachment(
  context: MediaAuthorizationContext,
  attachment: MediaAttachment,
  urls: string[],
) {
  const cleanUrls = urls
    .map(String)
    .filter((url) => /^https:\/\//i.test(url))
    .filter((url, index, rows) => rows.indexOf(url) === index);
  const table =
    attachment.record_type === "salon"
      ? "salons"
      : attachment.record_type === "style"
        ? "styles"
        : attachment.record_type === "stylist"
          ? "stylists"
          : "salon_products";
  const field = attachment.field;
  let query = context.admin
    .from(table)
    .select(`id,${field}`)
    .eq("id", attachment.record_id);
  if (attachment.record_type !== "salon" && context.salon?.id) {
    query = query.eq("salon_id", context.salon.id);
  }
  const { data: record, error } = await query.maybeSingle();
  if (error) throw error;
  if (!record) throw new Error("The media attachment record was not found.");
  const rawCurrent = (record as Record<string, unknown>)[field];
  const current =
    field === "logo_url" || field === "cover_photo_url" || field === "avatar_url"
      ? String(rawCurrent || "")
        ? [String(rawCurrent)]
        : []
      : Array.isArray(rawCurrent)
        ? rawCurrent.map(String).filter(Boolean)
        : [];
  if (cleanUrls.some((url) => !current.includes(url))) {
    throw new Error("Only already attached media can be reordered or removed.");
  }
  const patch =
    field === "logo_url" || field === "cover_photo_url" || field === "avatar_url"
      ? { [field]: cleanUrls[0] || null }
      : attachment.record_type === "product"
        ? { images: cleanUrls, photo_url: cleanUrls[0] || null }
        : { [field]: cleanUrls };
  let update = context.admin
    .from(table)
    .update(patch)
    .eq("id", attachment.record_id);
  if (attachment.record_type !== "salon" && context.salon?.id) {
    update = update.eq("salon_id", context.salon.id);
  }
  const { data: updated, error: updateError } = await update
    .select(`id,${field}`)
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("The media attachment could not be verified.");
  const removed = current.filter((url) => !cleanUrls.includes(url));
  if (removed.length) {
    await context.admin
      .from("media_assets")
      .update({ status: "Archived", archived_at: new Date().toISOString() })
      .in("public_url", removed)
      .eq("owner_user_id", context.user.id);
  }
  return cleanUrls;
}
