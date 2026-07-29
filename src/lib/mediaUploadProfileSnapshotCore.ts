import type { ImagePresetKey } from "@/lib/imageUpload";

const IMAGE_PRESET_KEYS = new Set<ImagePresetKey>([
  "gallery",
  "cover",
  "logo",
  "avatar",
  "service",
  "product",
  "review",
  "content",
]);

export type PreparedMediaProfileSnapshot = {
  key: ImagePresetKey;
  aspectWidth: number;
  aspectHeight: number;
  outputWidth: number;
  quality: number;
  maximumBytes: number;
};

export type PreparedMediaRenditionSlot =
  | "desktop"
  | "tablet"
  | "mobile"
  | "thumbnail";

function preparedProfileNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(`The prepared image ${label} is invalid.`);
  }
  return parsed;
}

function preparedProfileQuality(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 60 || parsed > 100) {
    throw new Error("The prepared image quality is invalid.");
  }
  return parsed;
}

export function preparedMediaProfileSnapshot(
  cropMetadataValue: unknown,
  expectedKind: ImagePresetKey,
): PreparedMediaProfileSnapshot {
  if (
    !cropMetadataValue ||
    typeof cropMetadataValue !== "object" ||
    Array.isArray(cropMetadataValue)
  ) {
    throw new Error("The prepared image profile is unavailable.");
  }
  const cropMetadata = cropMetadataValue as Record<string, unknown>;
  if (
    !cropMetadata.profile ||
    typeof cropMetadata.profile !== "object" ||
    Array.isArray(cropMetadata.profile)
  ) {
    throw new Error("The prepared image profile is unavailable.");
  }
  const profile = cropMetadata.profile as Record<string, unknown>;
  const key = String(profile.key || "") as ImagePresetKey;
  if (!IMAGE_PRESET_KEYS.has(key) || key !== expectedKind) {
    throw new Error("The prepared image profile does not match this upload.");
  }
  return {
    key,
    aspectWidth: preparedProfileNumber(
      profile.aspect_width,
      "aspect ratio",
      1,
      100,
    ),
    aspectHeight: preparedProfileNumber(
      profile.aspect_height,
      "aspect ratio",
      1,
      100,
    ),
    outputWidth: preparedProfileNumber(
      profile.output_width,
      "output width",
      64,
      8192,
    ),
    quality: preparedProfileQuality(profile.quality),
    maximumBytes: preparedProfileNumber(
      profile.maximum_bytes,
      "file-size limit",
      64 * 1024,
      4 * 1024 * 1024,
    ),
  };
}

export function preparedMediaRenditionDimensions(
  profile: PreparedMediaProfileSnapshot,
  slot: PreparedMediaRenditionSlot,
) {
  const editorial =
    profile.key === "cover" || profile.key === "content";
  let aspectWidth = profile.aspectWidth;
  let aspectHeight = profile.aspectHeight;
  let width = profile.outputWidth;
  if (slot === "tablet") {
    width = Math.min(width, editorial ? 1440 : 1200);
    if (editorial) {
      aspectWidth = 4;
      aspectHeight = 3;
    }
  } else if (slot === "mobile") {
    width = Math.min(width, editorial ? 1080 : 720);
    if (editorial) {
      aspectWidth = 9;
      aspectHeight = 16;
    }
  } else if (slot === "thumbnail") {
    width = Math.min(width, 480);
    if (editorial) {
      aspectWidth = 4;
      aspectHeight = 3;
    }
  }
  return {
    width,
    height: Math.round((width * aspectHeight) / aspectWidth),
  };
}
