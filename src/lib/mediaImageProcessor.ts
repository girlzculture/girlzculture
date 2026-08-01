import "server-only";

import { createHash } from "crypto";
import sharp from "sharp";
import type { Sharp } from "sharp";
import {
  MAX_SOURCE_PIXELS,
  getSourceImageQualityError,
  type ImageTransform,
} from "@/lib/imageUpload";
import {
  canonicalCropRegion,
  orientedDimensions,
  sanitizeImageTransform,
} from "@/lib/mediaImageProcessingCore";

export type ServerMediaSource = {
  buffer: Buffer;
  normalizedBuffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/gif";
  width: number;
  height: number;
  checksum: string;
};

export type ServerMediaRendition = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/gif";
  width: number;
  height: number;
  checksum: string;
};

/**
 * Animated editorial media is displayed in relatively small promotional
 * cards. Upscaling every GIF frame to the static-image master dimensions can
 * multiply the encoded payload by an order of magnitude and make an otherwise
 * valid GIF impossible to save. Keep the requested aspect ratio, but never
 * enlarge the animation beyond either its source pixels or the display-sized
 * animated ceiling.
 */
export function animatedRenditionDimensions(input: {
  source: { width: number; height: number };
  target: { width: number; height: number };
  maximumLongEdge?: number;
}) {
  const sourceWidth = Math.max(1, Math.floor(input.source.width));
  const sourceHeight = Math.max(1, Math.floor(input.source.height));
  const targetWidth = Math.max(1, Math.floor(input.target.width));
  const targetHeight = Math.max(1, Math.floor(input.target.height));
  const ceiling = Math.max(
    1,
    Math.min(
      Math.max(targetWidth, targetHeight),
      Math.floor(input.maximumLongEdge || 960),
    ),
  );
  const ratio = targetWidth / targetHeight;
  let width = Math.min(targetWidth, sourceWidth, ceiling);
  let height = Math.max(1, Math.round(width / ratio));
  if (height > sourceHeight || height > targetHeight || height > ceiling) {
    height = Math.min(targetHeight, sourceHeight, ceiling);
    width = Math.max(1, Math.round(height * ratio));
  }
  return { width, height };
}

function mimeForFormat(format: string | undefined) {
  if (format === "jpeg") return "image/jpeg" as const;
  if (format === "png") return "image/png" as const;
  if (format === "gif") return "image/gif" as const;
  return null;
}

export async function inspectCanonicalMediaSource(
  buffer: Buffer,
  declaredMimeType: string,
): Promise<ServerMediaSource> {
  if (!buffer.length) throw new Error("This image is empty or damaged.");
  const metadata = await sharp(buffer, {
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
    animated: true,
  }).metadata();
  const mimeType = mimeForFormat(metadata.format);
  if (!mimeType) {
    throw new Error("Upload a supported JPG, PNG, or animated GIF.");
  }
  if (mimeType !== declaredMimeType) {
    throw new Error(
      "This image format does not match the selected file. Export it as JPG, PNG, or GIF and try again.",
    );
  }
  const dimensions =
    mimeType === "image/gif" && metadata.width && metadata.pageHeight
      ? { width: metadata.width, height: metadata.pageHeight }
      : orientedDimensions(metadata);
  const qualityError = getSourceImageQualityError(dimensions);
  if (qualityError) throw new Error(qualityError);
  const normalizedBuffer = await sharp(buffer, {
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
    animated: false,
  })
    .autoOrient()
    .toBuffer();
  return {
    buffer,
    normalizedBuffer,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}

async function encodeRendition(
  pipeline: Sharp,
  preferredMimeType: "image/jpeg" | "image/png",
  quality: number,
  maximumBytes: number,
) {
  if (preferredMimeType === "image/png") {
    const png = await pipeline
      .clone()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    if (png.length <= maximumBytes) {
      return { buffer: png, mimeType: "image/png" as const };
    }
  }
  for (let candidate = quality; candidate >= 60; candidate -= 6) {
    const jpeg = await pipeline
      .clone()
      .flatten({ background: "#ffffff" })
      .jpeg({
        quality: candidate,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();
    if (jpeg.length <= maximumBytes) {
      return { buffer: jpeg, mimeType: "image/jpeg" as const };
    }
  }
  throw new Error(
    "This image could not be optimized safely. Choose a less detailed original and try again.",
  );
}

export async function createCanonicalMediaRendition(input: {
  source: ServerMediaSource;
  target: { width: number; height: number };
  transform?: ImageTransform;
  quality: number;
  maximumBytes: number;
}): Promise<ServerMediaRendition> {
  const transform = sanitizeImageTransform(input.transform);
  if (input.source.mimeType === "image/gif") {
    const animated = sharp(input.source.buffer, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_SOURCE_PIXELS,
    });
    const metadata = await animated.metadata();
    const sourceDimensions = {
      width: Number(metadata.width || 0),
      height: Number(metadata.pageHeight || metadata.height || 0),
    };
    const rotatedDimensions = transform.rotation % 180
      ? { width: sourceDimensions.height, height: sourceDimensions.width }
      : sourceDimensions;
    const crop = canonicalCropRegion(rotatedDimensions, input.target, transform);
    const pipeline = sharp(input.source.buffer, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_SOURCE_PIXELS,
    })
      .rotate(transform.rotation)
      .extract(crop)
      .resize(input.target.width, input.target.height, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      });
    let output: Buffer | null = null;
    for (const colours of [256, 192, 128, 96, 64, 48, 32]) {
      const candidate = await pipeline
        .clone()
        .gif({ effort: 4, colours, dither: colours >= 128 ? 1 : 0.75 })
        .toBuffer();
      if (candidate.length <= input.maximumBytes) {
        output = candidate;
        break;
      }
    }
    if (!output) {
      throw new Error("This animated GIF remains too large after responsive resizing. Choose a shorter or more compressed GIF.");
    }
    const outputMetadata = await sharp(output, { animated: true }).metadata();
    if (Number(outputMetadata.width) !== input.target.width || Number(outputMetadata.pageHeight || outputMetadata.height) !== input.target.height) {
      throw new Error("The responsive animated GIF could not be verified.");
    }
    return {
      buffer: output,
      mimeType: "image/gif",
      width: input.target.width,
      height: input.target.height,
      checksum: createHash("sha256").update(output).digest("hex"),
    };
  }
  const rotated =
    transform.rotation === 0
      ? input.source.normalizedBuffer
      : await sharp(input.source.normalizedBuffer, {
          failOn: "error",
          limitInputPixels: MAX_SOURCE_PIXELS,
        })
          .rotate(transform.rotation, {
            background:
              input.source.mimeType === "image/png"
                ? { r: 0, g: 0, b: 0, alpha: 0 }
                : "#ffffff",
          })
          .toBuffer();
  const metadata = await sharp(rotated, {
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
  }).metadata();
  const sourceDimensions = {
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
  };
  const crop = canonicalCropRegion(
    sourceDimensions,
    input.target,
    transform,
  );
  const pipeline = sharp(rotated, {
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .extract(crop)
    .resize(input.target.width, input.target.height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
  const preferredMimeType =
    input.source.mimeType === "image/png" && metadata.hasAlpha
      ? "image/png"
      : "image/jpeg";
  const encoded = await encodeRendition(
    pipeline,
    preferredMimeType,
    Math.max(60, Math.min(100, Math.round(input.quality))),
    input.maximumBytes,
  );
  const outputMetadata = await sharp(encoded.buffer).metadata();
  if (
    Number(outputMetadata.width) !== input.target.width ||
    Number(outputMetadata.height) !== input.target.height
  ) {
    throw new Error("The canonical image derivative could not be verified.");
  }
  return {
    ...encoded,
    width: input.target.width,
    height: input.target.height,
    checksum: createHash("sha256").update(encoded.buffer).digest("hex"),
  };
}
