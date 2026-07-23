import { createHash, randomUUID } from "crypto";
import { getSupabaseAdmin, requireAdminPermission, requireSalonPermission } from "@/lib/supabaseAdmin";
import { IMAGE_UPLOAD_PROFILES, type ImagePresetKey } from "@/lib/imageUpload";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { monitoredRouteFailure } from "@/lib/platformErrors";

export const runtime = "nodejs";

const BUCKETS = new Set(["salon-photos", "stylist-photos", "style-photos", "review-photos", "content-media"]);

function requestId() { return `media_${randomUUID().slice(0, 12)}`; }
function safeFolder(value: string) { return value.split("/").map((part) => part.replace(/[^a-zA-Z0-9_-]/g, "")).filter(Boolean).join("/"); }
function safeName(value: string) { return value.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "image"; }
function imageDimensions(buffer: Buffer, mime: string) {
  if (mime === "image/png" && buffer.length >= 24 && buffer.subarray(1, 4).toString() === "PNG") return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mime === "image/jpeg" && buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1]; const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      if (length < 2) break; offset += 2 + length;
    }
  }
  throw new Error("This file is damaged or its image format does not match its extension.");
}

export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") as ImagePresetKey | null;
  const fallback = kind ? IMAGE_UPLOAD_PROFILES[kind] : null;
  if (!fallback) return Response.json({ error: "Unknown media placement." }, { status: 400 });
  try {
    const [{ data },quality]=await Promise.all([
      getSupabaseAdmin().from("media_upload_profiles").select("*").eq("profile_key", kind).eq("is_active", true).maybeSingle(),
      getEngineNumber("media.public_image_quality",88,60,100),
    ]);
    return Response.json({ profile: data ? { key: kind, label: data.display_name, aspectWidth: data.aspect_width, aspectHeight: data.aspect_height, minWidth: data.min_width_px, minHeight: data.min_height_px, outputWidth: data.output_width_px, maxBytes: data.max_bytes, safeArea: data.safe_area_enabled, quality } : { ...fallback, quality } });
  } catch { return Response.json({ profile: fallback }); }
}

async function authorize(request: Request, bucket: string, folder: string) {
  const segments = folder.split("/").filter(Boolean);
  if (bucket === "content-media") return requireAdminPermission(request, "content");
  if (bucket === "salon-photos") {
    const context = await requireSalonPermission(request, segments[2] === "products" ? "products" : "photos");
    if (segments[0] !== "salons" || segments[1] !== context.salon.id) throw new Error("This upload folder does not belong to your salon.");
    return context;
  }
  if (bucket === "style-photos") {
    const context = await requireSalonPermission(request, "styles");
    const { data } = await context.admin.from("styles").select("salon_id").eq("id", segments[1] || "").maybeSingle();
    if (segments[0] !== "styles" || data?.salon_id !== context.salon.id) throw new Error("Save this service before uploading its images.");
    return context;
  }
  if (bucket === "stylist-photos") {
    const context = await requireSalonPermission(request, "stylists");
    if (segments[0] === "salons" && segments[1] === context.salon.id && segments[2] === "staging" && /^stylist-[a-f0-9-]{20,60}$/i.test(segments[3] || "")) {
      return context;
    }
    const { data } = await context.admin.from("stylists").select("salon_id").eq("id", segments[1] || "").maybeSingle();
    if (segments[0] !== "stylists" || data?.salon_id !== context.salon.id) throw new Error("This photo does not belong to your salon or stylist form.");
    return context;
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Please sign in before uploading review photos.");
  const admin = getSupabaseAdmin(); const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) throw new Error("Your session has expired. Please sign in again.");
  const bookingId = segments[0] === "reviews" ? segments[1] : "";
  const { data: booking } = await admin.from("bookings").select("id,customer_id,guest_email,status").eq("id", bookingId || "").maybeSingle();
  const email = auth.user.email?.trim().toLowerCase();
  if (!booking || (booking.customer_id !== auth.user.id && booking.guest_email?.trim().toLowerCase() !== email) || String(booking.status).toLowerCase() !== "completed") throw new Error("Review photos are available only for your completed booking.");
  return { admin, user: auth.user };
}

export async function POST(request: Request) {
  const correlationId = requestId();
  let monitoringAdmin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    const form = await request.formData(); const file = form.get("file"); const tabletFile = form.get("tablet_file"); const mobileFile = form.get("mobile_file"); const bucket = String(form.get("bucket") || ""); const folder = safeFolder(String(form.get("folder") || "")); const kind = String(form.get("kind") || "gallery") as ImagePresetKey;
    if (!(file instanceof File) || !file.size) throw new Error("Choose an image to upload.");
    if (!BUCKETS.has(bucket)) throw new Error("This upload destination is not supported.");
    const fallbackProfile = IMAGE_UPLOAD_PROFILES[kind]; if (!fallbackProfile) throw new Error("This image placement is not supported.");
    if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Upload a JPG or PNG image.");
    const context = await authorize(request, bucket, folder);
    monitoringAdmin = context.admin;
    const { data: configured } = await context.admin.from("media_upload_profiles").select("*").eq("profile_key", kind).eq("is_active", true).maybeSingle();
    const profile = configured ? { ...fallbackProfile, label: configured.display_name, minWidth: configured.min_width_px, minHeight: configured.min_height_px, maxBytes: configured.max_bytes } : fallbackProfile;
    if (file.size > profile.maxBytes) throw new Error(`The optimized image must be ${Math.round(profile.maxBytes / 1024 / 1024)} MB or smaller.`);
    const buffer = Buffer.from(await file.arrayBuffer()); const dimensions = imageDimensions(buffer, file.type);
    if (dimensions.width < profile.minWidth || dimensions.height < profile.minHeight) throw new Error(`This image is ${dimensions.width} × ${dimensions.height}px. ${profile.label} images must be at least ${profile.minWidth} × ${profile.minHeight}px.`);
    const cropMetadata = JSON.parse(String(form.get("crop_metadata") || "{}")) as Record<string, unknown>;
    const renditions: Record<string, { url: string; path: string; width: number; height: number }> = {};
    const uploadedPaths: string[] = [];
    try {
      for (const [device, candidate] of [["desktop", file], ["tablet", tabletFile], ["mobile", mobileFile]] as const) {
        if (!(candidate instanceof File) || !candidate.size) continue;
        if (!["image/jpeg", "image/png"].includes(candidate.type)) throw new Error(`${device} rendition must be a JPG or PNG image.`);
        const candidateBuffer = Buffer.from(await candidate.arrayBuffer());
        const candidateDimensions = imageDimensions(candidateBuffer, candidate.type);
        if (candidate.size > profile.maxBytes) throw new Error(`${device} rendition is larger than the configured upload limit.`);
        const extension = candidate.type === "image/png" ? "png" : "jpg";
        const path = `${folder ? `${folder}/` : ""}${Date.now()}-${randomUUID()}-${device}-${safeName(candidate.name)}.${extension}`;
        const { error: uploadError } = await context.admin.storage.from(bucket).upload(path, candidateBuffer, { contentType: candidate.type, cacheControl: "31536000", upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);
        const { data: publicUrl } = context.admin.storage.from(bucket).getPublicUrl(path);
        renditions[device] = { url: publicUrl.publicUrl, path, width: candidateDimensions.width, height: candidateDimensions.height };
      }
      const primary = renditions.desktop;
      if (!primary) throw new Error("The desktop image rendition was not prepared.");
      const { error: registryError } = await context.admin.from("media_assets").insert({ bucket_id: bucket, object_path: primary.path, public_url: primary.url, media_kind: kind, owner_user_id: context.user.id, salon_id: "salon" in context ? context.salon.id : null, mime_type: file.type, file_size_bytes: file.size, width_px: primary.width, height_px: primary.height, checksum_sha256: createHash("sha256").update(buffer).digest("hex"), status: "Staged", crop_metadata: cropMetadata, renditions });
      if (registryError) throw registryError;
      return Response.json({ url: primary.url, path: primary.path, bucket, width: primary.width, height: primary.height, renditions, cropMetadata, requestId: correlationId });
    } catch (error) {
      if (uploadedPaths.length) await context.admin.storage.from(bucket).remove(uploadedPaths);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    if (/Choose an image|not supported|JPG|PNG|must be|larger|damaged|folder does not belong/i.test(message)) return Response.json({ error: message, requestId: correlationId }, { status: 400 });
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "media", action: "upload_responsive_image", actorRole: "authenticated", safeMessage: "We couldn't upload this image. Please try again." });
  }
}

export async function DELETE(request: Request) {
  const admin = getSupabaseAdmin();
  try {
    const body = await request.json() as { url?: string }; const url = String(body.url || "");
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) throw new Error("Unauthorized");
    const { data: asset, error } = await admin.from("media_assets").select("*").eq("public_url", url).maybeSingle(); if (error) throw error;
    if (!asset) return Response.json({ removed: false, reason: "The image is not managed by the media registry." });
    if (asset.owner_user_id !== auth.user.id) { await requireAdminPermission(request, "content"); }
    if (asset.status !== "Staged") { await admin.from("media_assets").update({ status: "Archived", archived_at: new Date().toISOString() }).eq("id", asset.id); return Response.json({ removed: false, archived: true, reason: "The image is attached to a saved record and was archived safely." }); }
    const renditionPaths = Object.values((asset.renditions || {}) as Record<string, { path?: string }>)
      .map((rendition) => rendition.path)
      .filter((path): path is string => Boolean(path));
    const paths = [...new Set([asset.object_path, ...renditionPaths].filter(Boolean))];
    const { error: removeError } = await admin.storage.from(asset.bucket_id).remove(paths); if (removeError) throw removeError;
    await admin.from("media_assets").delete().eq("id", asset.id);
    return Response.json({ removed: true });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "media", action: "remove_staged_media", actorRole: "authenticated", safeMessage: "The image was removed from the form, but storage cleanup needs attention." });
  }
}
