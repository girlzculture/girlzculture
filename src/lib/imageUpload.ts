export const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_IMAGE_WIDTH = 1600;

export function isSupportedImageType(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

export function getImageUploadError(file: File) {
  if (!isSupportedImageType(file)) {
    return "Please upload a JPG or PNG image.";
  }

  return null;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.{2,}/g, ".");
}

export function createStoragePath(bucket: string, folder: string | undefined, fileName: string) {
  const safeName = sanitizeFileName(fileName || "image");
  const folderPrefix = folder ? `${folder.replace(/\/+$/g, "")}/` : "";
  return `${folderPrefix}${bucket}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

export async function optimizeImageFile(file: File, maxWidth = DEFAULT_MAX_IMAGE_WIDTH) {
  if (typeof window === "undefined") {
    return file;
  }

  if (!isSupportedImageType(file)) {
    return file;
  }

  if (file.size <= MAX_IMAGE_UPLOAD_BYTES && file.type === "image/jpeg") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to read image file."));
      element.src = objectUrl;
    });

    const scale = Math.min(1, maxWidth / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const quality = outputType === "image/jpeg" ? 0.86 : undefined;

    const optimizedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputType, quality);
    });

    if (!optimizedBlob) {
      return file;
    }

    return new File([optimizedBlob], sanitizeFileName(file.name || "image"), {
      type: optimizedBlob.type || outputType,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}