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
};

export const IMAGE_UPLOAD_PROFILES: Record<ImagePresetKey, ImageUploadProfile> = {
  logo: { key: "logo", label: "Square logo", aspectWidth: 1, aspectHeight: 1, minWidth: 400, minHeight: 400, outputWidth: 900, maxBytes: 3 * 1024 * 1024 },
  cover: { key: "cover", label: "Salon cover", aspectWidth: 16, aspectHeight: 7, minWidth: 1200, minHeight: 525, outputWidth: 1920, maxBytes: 4 * 1024 * 1024, safeArea: true },
  gallery: { key: "gallery", label: "Gallery/card", aspectWidth: 4, aspectHeight: 3, minWidth: 800, minHeight: 600, outputWidth: 1600, maxBytes: 4 * 1024 * 1024 },
  avatar: { key: "avatar", label: "Profile portrait", aspectWidth: 1, aspectHeight: 1, minWidth: 400, minHeight: 400, outputWidth: 900, maxBytes: 3 * 1024 * 1024, safeArea: true },
  service: { key: "service", label: "Service card", aspectWidth: 4, aspectHeight: 3, minWidth: 800, minHeight: 600, outputWidth: 1600, maxBytes: 4 * 1024 * 1024 },
  product: { key: "product", label: "Product card", aspectWidth: 1, aspectHeight: 1, minWidth: 700, minHeight: 700, outputWidth: 1200, maxBytes: 4 * 1024 * 1024 },
  review: { key: "review", label: "Review result", aspectWidth: 4, aspectHeight: 3, minWidth: 600, minHeight: 450, outputWidth: 1400, maxBytes: 4 * 1024 * 1024 },
  content: { key: "content", label: "Editorial image", aspectWidth: 16, aspectHeight: 9, minWidth: 1200, minHeight: 675, outputWidth: 1920, maxBytes: 4 * 1024 * 1024, safeArea: true },
};

export const MAX_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_WIDTH = 1920;

export function isSupportedImageType(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

export function getImageUploadError(file: File, profile: ImageUploadProfile = IMAGE_UPLOAD_PROFILES.gallery) {
  if (!isSupportedImageType(file)) return "Upload a JPG or PNG image.";
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return "This original image is larger than 12 MB. Choose a smaller JPG or PNG.";
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
  return { ...profile };
}

export async function optimizeImageFile(file: File, profileOrWidth: ImageUploadProfile | number = IMAGE_UPLOAD_PROFILES.gallery, transform: ImageTransform = {}) {
  if (typeof window === "undefined" || !isSupportedImageType(file)) return file;
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
    if (image.naturalWidth < profile.minWidth || image.naturalHeight < profile.minHeight) {
      throw new Error(`This image is ${image.naturalWidth} × ${image.naturalHeight}px. ${profile.label} images must be at least ${profile.minWidth} × ${profile.minHeight}px.`);
    }
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
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputWidth, outputHeight);
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
