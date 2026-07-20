import { createHash, randomUUID } from "crypto";
import { getSupabaseAdmin, requireAdminPermission, requireSalonPermission } from "@/lib/supabaseAdmin";
import { IMAGE_UPLOAD_PROFILES, type ImagePresetKey } from "@/lib/imageUpload";

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
    const { data } = await getSupabaseAdmin().from("media_upload_profiles").select("*").eq("profile_key", kind).eq("is_active", true).maybeSingle();
    return Response.json({ profile: data ? { key: kind, label: data.display_name, aspectWidth: data.aspect_width, aspectHeight: data.aspect_height, minWidth: data.min_width_px, minHeight: data.min_height_px, outputWidth: data.output_width_px, maxBytes: data.max_bytes, safeArea: data.safe_area_enabled } : fallback });
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
    const { data } = await context.admin.from("stylists").select("salon_id").eq("id", segments[1] || "").maybeSingle();
    if (segments[0] !== "stylists" || data?.salon_id !== context.salon.id) throw new Error("Save this stylist before uploading profile or portfolio images.");
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
  try {
    const form = await request.formData(); const file = form.get("file"); const bucket = String(form.get("bucket") || ""); const folder = safeFolder(String(form.get("folder") || "")); const kind = String(form.get("kind") || "gallery") as ImagePresetKey;
    if (!(file instanceof File) || !file.size) throw new Error("Choose an image to upload.");
    if (!BUCKETS.has(bucket)) throw new Error("This upload destination is not supported.");
    const fallbackProfile = IMAGE_UPLOAD_PROFILES[kind]; if (!fallbackProfile) throw new Error("This image placement is not supported.");
    if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Upload a JPG or PNG image.");
    const context = await authorize(request, bucket, folder);
    const { data: configured } = await context.admin.from("media_upload_profiles").select("*").eq("profile_key", kind).eq("is_active", true).maybeSingle();
    const profile = configured ? { ...fallbackProfile, label: configured.display_name, minWidth: configured.min_width_px, minHeight: configured.min_height_px, maxBytes: configured.max_bytes } : fallbackProfile;
    if (file.size > profile.maxBytes) throw new Error(`The optimized image must be ${Math.round(profile.maxBytes / 1024 / 1024)} MB or smaller.`);
    const buffer = Buffer.from(await file.arrayBuffer()); const dimensions = imageDimensions(buffer, file.type);
    if (dimensions.width < profile.minWidth || dimensions.height < profile.minHeight) throw new Error(`This image is ${dimensions.width} × ${dimensions.height}px. ${profile.label} images must be at least ${profile.minWidth} × ${profile.minHeight}px.`);
    const extension = file.type === "image/png" ? "png" : "jpg"; const path = `${folder ? `${folder}/` : ""}${Date.now()}-${randomUUID()}-${safeName(file.name)}.${extension}`;
    const { error: uploadError } = await context.admin.storage.from(bucket).upload(path, buffer, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = context.admin.storage.from(bucket).getPublicUrl(path); const url = publicUrl.publicUrl;
    const { error: registryError } = await context.admin.from("media_assets").insert({ bucket_id: bucket, object_path: path, public_url: url, media_kind: kind, owner_user_id: context.user.id, salon_id: "salon" in context ? context.salon.id : null, mime_type: file.type, file_size_bytes: file.size, width_px: dimensions.width, height_px: dimensions.height, checksum_sha256: createHash("sha256").update(buffer).digest("hex"), status: "Staged" });
    if (registryError) { await context.admin.storage.from(bucket).remove([path]); throw registryError; }
    return Response.json({ url, path, bucket, width: dimensions.width, height: dimensions.height, requestId: correlationId });
  } catch (error) {
    console.error("Media upload failed", { correlationId, error });
    const message = error instanceof Error ? error.message : "Upload failed.";
    return Response.json({ error: /Unauthorized|session/i.test(message) ? "Please sign in again before uploading." : /Forbidden/i.test(message) ? "You do not have permission to upload this media." : message, requestId: correlationId }, { status: /permission|Forbidden/.test(message) ? 403 : /sign in|Unauthorized|session/.test(message) ? 401 : 400 });
  }
}

export async function DELETE(request: Request) {
  const correlationId = requestId();
  try {
    const body = await request.json() as { url?: string }; const url = String(body.url || "");
    const admin = getSupabaseAdmin(); const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!auth.user) throw new Error("Unauthorized");
    const { data: asset, error } = await admin.from("media_assets").select("*").eq("public_url", url).maybeSingle(); if (error) throw error;
    if (!asset) return Response.json({ removed: false, reason: "The image is not managed by the media registry." });
    if (asset.owner_user_id !== auth.user.id) { await requireAdminPermission(request, "content"); }
    if (asset.status !== "Staged") { await admin.from("media_assets").update({ status: "Archived", archived_at: new Date().toISOString() }).eq("id", asset.id); return Response.json({ removed: false, archived: true, reason: "The image is attached to a saved record and was archived safely." }); }
    const { error: removeError } = await admin.storage.from(asset.bucket_id).remove([asset.object_path]); if (removeError) throw removeError;
    await admin.from("media_assets").delete().eq("id", asset.id);
    return Response.json({ removed: true });
  } catch (error) { console.error("Media cleanup failed", { correlationId, error }); return Response.json({ error: "The image was removed from the form, but storage cleanup needs attention.", requestId: correlationId }, { status: 400 }); }
}
