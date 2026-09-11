import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BusinessSignupContentValidationError, type BusinessSignupContent, type BusinessSignupMedia } from "./businessSignupContent";

type MediaKind = "still" | "gif" | "video";
type MediaField = { path: string; src: string; role: "hero" | "poster" | "image" };
type RegisteredMedia = {
  public_url: string;
  bucket_id: string;
  mime_type: string;
  source_mime_type: string | null;
  status: string;
  renditions: unknown;
};
const STILL_MIMES = new Set(["image/jpeg", "image/png", "image/avif"]);

function invalid(path: string, message: string): never {
  throw new BusinessSignupContentValidationError(path, message);
}

function canonicalUrl(src: string) {
  const url = new URL(src, "https://girlzculture.invalid");
  url.search = "";
  url.hash = "";
  return url;
}

function localKind(src: string, ordinaryImage = false): MediaKind | null {
  if (!src.startsWith("/")) return null;
  const path = canonicalUrl(src).pathname;
  // These are developer-controlled static assets, unlike uploaded filenames.
  if (/^\/images\/.+\.gif$/i.test(path)) return "gif";
  if (/^\/images\/.+\.(?:avif|jpe?g|png)$/i.test(path)) return "still";
  // Existing local logo/card assets may also use WebP or SVG. This does not
  // certify those formats as still reduced-motion hero posters.
  if (ordinaryImage && /^\/images\/.+\.(?:webp|svg)$/i.test(path)) return "still";
  if (/^\/videos\/.+\.mp4$/i.test(path)) return "video";
  return null;
}

function registeredKind(asset: RegisteredMedia, path: string): MediaKind {
  if (asset.bucket_id !== "content-media" || !["Staged", "Attached", "Archived"].includes(asset.status)) {
    invalid(path, "Choose an available image or video from Content Management uploads.");
  }
  const mime = String(asset.mime_type || "").toLowerCase();
  const sourceMime = String(asset.source_mime_type || "").toLowerCase();
  const renditions = asset.renditions && typeof asset.renditions === "object" && !Array.isArray(asset.renditions)
    ? Object.values(asset.renditions as Record<string, unknown>) : [];
  const matchingMimes = renditions.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const rendition = value as Record<string, unknown>;
    return rendition.url === asset.public_url && typeof rendition.mime_type === "string" ? [rendition.mime_type.toLowerCase()] : [];
  });
  // GIF uploads retain animation in the canonical server-generated .img
  // renditions. Never infer that they are still images from the URL extension.
  if ([mime, sourceMime, ...matchingMimes].includes("image/gif")) return "gif";
  if (matchingMimes.some(value => value !== mime)) invalid(path, "This upload has conflicting media metadata. Upload it again before publishing.");
  if (STILL_MIMES.has(mime)) return "still";
  if (mime === "video/mp4") return "video";
  return invalid(path, "The uploaded media format could not be verified. Upload a JPG, PNG, GIF, or MP4 through Content Management.");
}

/** Call after content/auth validation, only when publishing or scheduling this page. */
export async function validateBusinessSignupMediaForPublication(admin: SupabaseClient, content: BusinessSignupContent): Promise<void> {
  const { hero } = content;
  const fields: MediaField[] = [];
  const activeMedia: { path: string; media: BusinessSignupMedia }[] = [];
  function addMedia(media: BusinessSignupMedia, path: string) {
    if (media.type === "none" || !media.src) return;
    activeMedia.push({ path, media });
    fields.push({ path: `${path}.src`, src: media.src, role: "hero" });
    if (media.poster.src) fields.push({ path: `${path}.poster.src`, src: media.poster.src, role: "poster" });
  }
  function addImage(src: string | undefined, path: string) {
    if (src) fields.push({ path, src, role: "image" });
  }
  if (hero.visible) addMedia(hero.media, "hero.media");
  const logo = content.header.logo;
  if (logo.visible && logo.mode === "image" && logo.image.src) fields.push({ path: "header.logo.image.src", src: logo.image.src, role: "image" });
  for (const category of content.categories.filter(category => category.visible)) {
    if (category.image.src) fields.push({ path: `categories.${category.id}.image.src`, src: category.image.src, role: "image" });
    if (category.mode === "waitlist" && category.waitlist?.image?.src) fields.push({ path: `categories.${category.id}.waitlist.image.src`, src: category.waitlist.image.src, role: "image" });
  }
  for (const section of (content.sections ?? []).filter(section => section.enabled)) {
    const path = `sections.${section.id}`;
    if (section.type === "image_text" || section.type === "quote") addImage(section.image?.src, `${path}.image.src`);
    if (section.type === "gallery") for (const item of section.items) addImage(item.image.src, `${path}.items.${item.id}.image.src`);
    if (section.type === "media") addMedia(section.media, `${path}.media`);
  }
  const uploadedUrls = [...new Set(fields.filter(field => !field.src.startsWith("/")).map(field => canonicalUrl(field.src).href))];
  const registered = new Map<string, RegisteredMedia>();
  if (uploadedUrls.length) {
    const { data, error } = await admin.from("media_assets")
      .select("public_url,bucket_id,mime_type,source_mime_type,status,renditions")
      .eq("bucket_id", "content-media")
      .in("public_url", uploadedUrls);
    if (error) invalid("media", "Media verification is temporarily unavailable. Save your draft and retry publishing.");
    for (const row of (data || []) as RegisteredMedia[]) registered.set(row.public_url, row);
  }
  const kinds = new Map<string, MediaKind>();
  for (const field of fields) {
    if (field.src.startsWith("/")) {
      const kind = localKind(field.src, field.role === "image");
      if (!kind) invalid(field.path, "Choose a supported local JPG, PNG, AVIF, GIF, or MP4 asset, or upload media through Content Management.");
      kinds.set(field.path, kind);
    } else {
      const asset = registered.get(canonicalUrl(field.src).href);
      if (!asset) invalid(field.path, "This media has no verified upload record. Upload it through Content Management before publishing.");
      kinds.set(field.path, registeredKind(asset, field.path));
    }
    if (field.role === "image" && kinds.get(field.path) === "video") invalid(field.path, "This field displays an image. Choose a still image or GIF, not a video.");
  }
  for (const { path, media } of activeMedia) {
    const sourceKind = kinds.get(`${path}.src`);
    if (media.type === "image" && sourceKind === "gif") invalid(`${path}.type`, "This upload is a GIF. Choose GIF and provide a still poster so reduced motion is respected.");
    if (media.type === "image" && sourceKind !== "still") invalid(`${path}.src`, "Image mode requires a still JPG, PNG, or AVIF image.");
    if (media.type === "gif" && sourceKind !== "gif") invalid(`${path}.src`, "GIF mode requires a verified GIF image. Choose Image for a still photo.");
    if (media.type === "video" && sourceKind !== "video") invalid(`${path}.src`, "Video mode requires a verified MP4 video.");
    if (media.poster.src && kinds.get(`${path}.poster.src`) !== "still") invalid(`${path}.poster.src`, "Use a still JPG, PNG, or AVIF poster. Animated GIFs and videos cannot be reduced-motion fallbacks.");
    if ((media.type === "gif" || media.type === "video") && !media.poster.src) invalid(`${path}.poster.src`, "Choose a still poster before publishing animated media.");
  }
}
