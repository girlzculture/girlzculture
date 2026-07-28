import type {
  ImagePresetKey,
  ImageRenditionDevice,
  ResponsiveImageTransforms,
} from "@/lib/imageUpload";

export const MEDIA_SOURCE_BUCKET = "media-originals";
export const MEDIA_UPLOAD_SLOTS = [
  "source",
  "desktop",
  "tablet",
  "mobile",
] as const;
export const MEDIA_RENDITION_SLOTS: ImageRenditionDevice[] = [
  "desktop",
  "tablet",
  "mobile",
];

export type MediaUploadSlot = (typeof MEDIA_UPLOAD_SLOTS)[number];

export type MediaAttachment =
  | {
      record_type: "salon";
      record_id: string;
      field: "logo_url" | "cover_photo_url" | "gallery_photos";
    }
  | {
      record_type: "style";
      record_id: string;
      field: "photos";
    }
  | {
      record_type: "stylist";
      record_id: string;
      field: "avatar_url" | "photos";
    }
  | {
      record_type: "product";
      record_id: string;
      field: "images";
    };

export type MediaFileDescriptor = {
  name: string;
  mime_type: string;
  file_size_bytes: number;
  width: number;
  height: number;
};

export type PreparedMediaObject = MediaFileDescriptor & {
  slot: MediaUploadSlot;
  bucket: string;
  path: string;
  token: string;
};

export type MediaPrepareRequest = {
  bucket: string;
  folder: string;
  kind: ImagePresetKey;
  crop_metadata: {
    version: number;
    source?: { width: number; height: number } | null;
    transforms?: ResponsiveImageTransforms;
    mode?: string;
  };
  files: Partial<Record<MediaUploadSlot, MediaFileDescriptor>>;
  attachment?: MediaAttachment | null;
};

export type MediaPrepareResponse = {
  upload_id: string;
  uploads: PreparedMediaObject[];
  expires_at: string;
  request_id: string;
  error?: string;
};

export type MediaFinalizeResponse = {
  asset_id?: string;
  url?: string;
  attached?: boolean;
  status?: string;
  request_id?: string;
  error?: string;
};

export function isUuid(value: unknown): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function normalizeAttachment(
  value: unknown,
): MediaAttachment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const recordType = String(row.record_type || "");
  const recordId = String(row.record_id || "");
  const field = String(row.field || "");
  if (!isUuid(recordId)) throw new Error("The media attachment is invalid.");
  if (
    recordType === "salon" &&
    new Set(["logo_url", "cover_photo_url", "gallery_photos"]).has(field)
  ) {
    return {
      record_type: "salon",
      record_id: recordId,
      field: field as "logo_url" | "cover_photo_url" | "gallery_photos",
    };
  }
  if (recordType === "style" && field === "photos") {
    return { record_type: "style", record_id: recordId, field: "photos" };
  }
  if (
    recordType === "stylist" &&
    new Set(["avatar_url", "photos"]).has(field)
  ) {
    return {
      record_type: "stylist",
      record_id: recordId,
      field: field as "avatar_url" | "photos",
    };
  }
  if (recordType === "product" && field === "images") {
    return { record_type: "product", record_id: recordId, field: "images" };
  }
  throw new Error("This media attachment is not supported.");
}

export function appendUniqueMediaUrl(
  current: string[],
  url: string,
  maxFiles: number,
) {
  return [...current.filter(Boolean), url]
    .filter((item, index, rows) => rows.indexOf(item) === index)
    .slice(0, Math.max(1, maxFiles));
}
