export type ImagePresetKey = "logo" | "cover" | "gallery" | "avatar" | "service" | "product" | "review" | "content";

export type ImageUploadProfile = {
  key: ImagePresetKey;
  label: string;
  aspectWidth: number;
  aspectHeight: number;
  minWidth: number;
  minHeight: number;
  outputWidth: number;
  maxBytes: number;
  safeArea?: boolean;
  quality?: number;
  acceptedMimeTypes?: string[];
};

export const IMAGE_UPLOAD_PROFILES: Record<ImagePresetKey, ImageUploadProfile> = {
  logo: { key: "logo", label: "Square logo", aspectWidth: 1, aspectHeight: 1, minWidth: 400, minHeight: 400, outputWidth: 900, maxBytes: 3 * 1024 * 1024 },
  cover: { key: "cover", label: "Salon cover", aspectWidth: 16, aspectHeight: 7, minWidth: 1200, minHeight: 525, outputWidth: 1920, maxBytes: 4 * 1024 * 1024, safeArea: true },
  gallery: { key: "gallery", label: "Gallery/card", aspectWidth: 4, aspectHeight: 3, minWidth: 800, minHeight: 600, outputWidth: 1600, maxBytes: 4 * 1024 * 1024 },
  avatar: { key: "avatar", label: "Profile portrait", aspectWidth: 1, aspectHeight: 1, minWidth: 400, minHeight: 400, outputWidth: 900, maxBytes: 3 * 1024 * 1024, safeArea: true },
  service: { key: "service", label: "Service card", aspectWidth: 4, aspectHeight: 3, minWidth: 800, minHeight: 600, outputWidth: 1600, maxBytes: 4 * 1024 * 1024 },
  product: { key: "product", label: "Product card", aspectWidth: 1, aspectHeight: 1, minWidth: 700, minHeight: 700, outputWidth: 1200, maxBytes: 4 * 1024 * 1024 },
  review: { key: "review", label: "Review result", aspectWidth: 4, aspectHeight: 3, minWidth: 600, minHeight: 450, outputWidth: 1400, maxBytes: 4 * 1024 * 1024 },
  content: { key: "content", label: "Editorial image", aspectWidth: 16, aspectHeight: 9, minWidth: 1200, minHeight: 675, outputWidth: 1920, maxBytes: 8 * 1024 * 1024, safeArea: true, acceptedMimeTypes: ["image/jpeg", "image/png", "image/gif"] },
};

export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_WIDTH = 1920;
export const MIN_SOURCE_EDGE_PX = 320;
export const MIN_SOURCE_PIXELS = 160_000;
export const MIN_SAFE_SOURCE_EDGE_PX = 48;
export const MIN_SAFE_SOURCE_PIXELS = 4_096;
export const MAX_SOURCE_PIXELS = 40_000_000;

export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/gif";

export function detectSupportedImageMimeType(bytes: Uint8Array): SupportedImageMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6));
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  return null;
}

function canonicalImageExtension(mimeType: SupportedImageMimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

/**
 * Browser MIME and filename extensions are hints only. The byte signature is
 * authoritative, so renamed JPG/PNG files and generic browser MIME values are
 * normalized before the prepare request and signed Storage upload.
 */
export async function normalizeImageFile(file: File) {
  if (!file.size) throw new Error("This image is empty or damaged. Choose another file.");
  const signature = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const mimeType = detectSupportedImageMimeType(signature);
  if (!mimeType) {
    const ascii = String.fromCharCode(...signature);
    const knownUnsupported = ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
      || ascii.startsWith("BM")
      || ascii.includes("ftypheic")
      || ascii.includes("ftypheif")
      || ascii.includes("ftypavif")
      || (signature[0] === 0x49 && signature[1] === 0x49 && signature[2] === 0x2a)
      || (signature[0] === 0x4d && signature[1] === 0x4d && signature[3] === 0x2a);
    throw new Error(knownUnsupported
      ? "Upload a supported JPG, PNG, or animated GIF."
      : "This image is damaged or cannot be read.");
  }
  const extension = canonicalImageExtension(mimeType);
  const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, "") || "image").replace(/\.+$/g, "") || "image";
  const canonicalName = `${base}.${extension}`;
  if (file.type === mimeType && file.name.toLowerCase().endsWith(`.${extension}`)) return file;
  return new File([file], canonicalName, { type: mimeType, lastModified: file.lastModified });
}

export function isSupportedImageType(file: File) {
  return ["image/jpeg", "image/png", "image/gif"].includes(file.type);
}

export function getImageUploadError(file: File, profile: ImageUploadProfile = IMAGE_UPLOAD_PROFILES.gallery) {
  const accepted = profile.acceptedMimeTypes || ["image/jpeg", "image/png", "image/gif"];
  if (!isSupportedImageType(file) || !accepted.includes(file.type)) return "Upload a JPG, PNG, or animated GIF.";
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return "This original image is larger than 12 MB. Choose a smaller JPG, PNG, or GIF.";
  if (!file.size) return "This image is empty or damaged. Choose another file.";
  if (profile.maxBytes < 1) return "This media profile is not configured correctly. Contact support.";
  return null;
}

function sanitizeFileName(fileName: string) {
  return fileName.toLowerCase().trim().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").replace(/\.{2,}/g, ".");
}

export function createStoragePath(bucket: string, folder: string | undefined, fileName: string) {
  const safeName = sanitizeFileName(fileName || "image");
  const folderPrefix = folder ? `${folder.replace(/^\/+|\/+$/g, "")}/` : "";
  return `${folderPrefix}${bucket}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

export async function inspectImageFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image is damaged or cannot be read."));
      element.src = objectUrl;
    });
    return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  } finally { URL.revokeObjectURL(objectUrl); }
}

/**
 * Source quality is intentionally placement-independent. A single safe image
 * can be cropped for a cover, card, square logo, or portrait without asking
 * the salon owner to manufacture separate source files.
 */
export function getSourceImageQualityError(dimensions: {
  width: number;
  height: number;
}) {
  const width = Math.floor(Number(dimensions.width || 0));
  const height = Math.floor(Number(dimensions.height || 0));
  if (!width || !height) return "This image could not be read.";
  if (Math.min(width, height) < MIN_SAFE_SOURCE_EDGE_PX || width * height < MIN_SAFE_SOURCE_PIXELS) {
    return `This image is ${width} × ${height}px and does not contain enough image data to process safely.`;
  }
  if (width * height > MAX_SOURCE_PIXELS) {
    return "This image contains too many pixels to process safely. Choose a smaller original.";
  }
  return null;
}

export function getSourceImageQualityWarning(dimensions: {
  width: number;
  height: number;
}) {
  const width = Math.floor(Number(dimensions.width || 0));
  const height = Math.floor(Number(dimensions.height || 0));
  if (
    width &&
    height &&
    (Math.min(width, height) < MIN_SOURCE_EDGE_PX ||
      width * height < MIN_SOURCE_PIXELS)
  ) {
    return `This ${width} × ${height}px image is below the recommended source size. Girlz Culture will enlarge and crop it automatically; review the device previews before uploading.`;
  }
  return null;
}

export type ImageTransform = { zoom?: number; positionX?: number; positionY?: number; rotation?: 0 | 90 | 180 | 270 };
export type ImageRenditionDevice = "desktop" | "tablet" | "mobile";
export type ResponsiveImageTransforms = Record<ImageRenditionDevice, ImageTransform>;

export function profileForRendition(profile: ImageUploadProfile, device: ImageRenditionDevice): ImageUploadProfile {
  if ((profile.key === "cover" || profile.key === "content") && device === "tablet") {
    return { ...profile, aspectWidth: 4, aspectHeight: 3, outputWidth: Math.min(profile.outputWidth, 1440) };
  }
  if ((profile.key === "cover" || profile.key === "content") && device === "mobile") {
    return { ...profile, aspectWidth: 9, aspectHeight: 16, outputWidth: Math.min(profile.outputWidth, 1080) };
  }
  if (device === "tablet") {
    return { ...profile, outputWidth: Math.min(profile.outputWidth, 1200) };
  }
  if (device === "mobile") {
    return { ...profile, outputWidth: Math.min(profile.outputWidth, 720) };
  }
  return { ...profile };
}

export async function optimizeImageFile(file: File, profileOrWidth: ImageUploadProfile | number = IMAGE_UPLOAD_PROFILES.gallery, transform: ImageTransform = {}) {
  if (typeof window === "undefined" || !isSupportedImageType(file) || file.type === "image/gif") return file;
  const profile = typeof profileOrWidth === "number"
    ? { ...IMAGE_UPLOAD_PROFILES.gallery, outputWidth: profileOrWidth }
    : profileOrWidth;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image is damaged or cannot be read."));
      element.src = objectUrl;
    });
    const rotation = transform.rotation || 0;
    const rotatedWidth = rotation % 180 ? image.naturalHeight : image.naturalWidth;
    const rotatedHeight = rotation % 180 ? image.naturalWidth : image.naturalHeight;
    const outputWidth = Math.max(1, profile.outputWidth);
    const outputHeight = Math.max(1, Math.round(outputWidth * profile.aspectHeight / profile.aspectWidth));
    const coverScale = Math.max(outputWidth / rotatedWidth, outputHeight / rotatedHeight) * Math.min(3, Math.max(1, transform.zoom || 1));
    const drawnWidth = rotatedWidth * coverScale;
    const drawnHeight = rotatedHeight * coverScale;
    const offsetX = (Math.min(100, Math.max(-100, transform.positionX || 0)) / 100) * Math.max(0, drawnWidth - outputWidth) / 2;
    const offsetY = (Math.min(100, Math.max(-100, transform.positionY || 0)) / 100) * Math.max(0, drawnHeight - outputHeight) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare images for upload.");
    if (file.type !== "image/png") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, outputWidth, outputHeight);
    }
    context.translate(outputWidth / 2 - offsetX, outputHeight / 2 - offsetY);
    context.rotate(rotation * Math.PI / 180);
    const sourceDrawWidth = image.naturalWidth * coverScale;
    const sourceDrawHeight = image.naturalHeight * coverScale;
    context.drawImage(image, -sourceDrawWidth / 2, -sourceDrawHeight / 2, sourceDrawWidth, sourceDrawHeight);
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const jpegQuality=Math.min(1,Math.max(0.6,Number(profile.quality ?? 86)/100));
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, outputType === "image/jpeg" ? jpegQuality : undefined));
    if (!blob) throw new Error("The image could not be optimized. Choose another file.");
    if (blob.size > profile.maxBytes) throw new Error(`The optimized image is still over ${Math.round(profile.maxBytes / 1024 / 1024)} MB. Crop closer or choose a smaller file.`);
    const base = sanitizeFileName(file.name.replace(/\.[^.]+$/, "") || "image");
    return new File([blob], `${base}.${outputType === "image/png" ? "png" : "jpg"}`, { type: outputType, lastModified: Date.now() });
  } finally { URL.revokeObjectURL(objectUrl); }
}

export function inferImagePreset(label: string, bucket: string, folder = ""): ImagePresetKey {
  const value = `${label} ${bucket} ${folder}`.toLowerCase();
  if (value.includes("logo")) return "logo";
  if (value.includes("cover") || value.includes("hero") || value.includes("background")) return value.includes("content") ? "content" : "cover";
  if (value.includes("portfolio") || value.includes("work") || value.includes("gallery") || value.includes("media library")) return "gallery";
  if (value.includes("profile") || value.includes("avatar") || value.includes("stylist")) return "avatar";
  if (value.includes("product")) return "product";
  if (value.includes("review") || bucket === "review-photos") return "review";
  if (value.includes("service") || bucket === "style-photos") return "service";
  if (bucket === "content-media") return "content";
  return "gallery";
}
