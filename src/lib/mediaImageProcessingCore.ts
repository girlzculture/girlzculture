import type {
  ImageTransform,
  ResponsiveImageTransforms,
} from "@/lib/imageUpload";

export type CanonicalCropTarget = {
  width: number;
  height: number;
};

export type PixelCropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const DEFAULT_TRANSFORM: Required<ImageTransform> = {
  zoom: 1,
  positionX: 0,
  positionY: 0,
  rotation: 0,
};

function finiteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizeImageTransform(
  value: unknown,
): Required<ImageTransform> {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const requestedRotation = Math.round(
    finiteNumber(record.rotation, DEFAULT_TRANSFORM.rotation),
  );
  const rotation = ([0, 90, 180, 270] as const).includes(
    requestedRotation as 0 | 90 | 180 | 270,
  )
    ? (requestedRotation as 0 | 90 | 180 | 270)
    : 0;
  return {
    zoom: clamp(finiteNumber(record.zoom, 1), 1, 3),
    positionX: clamp(finiteNumber(record.positionX, 0), -100, 100),
    positionY: clamp(finiteNumber(record.positionY, 0), -100, 100),
    rotation,
  };
}

export function sanitizeResponsiveTransforms(
  value: unknown,
): ResponsiveImageTransforms {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    desktop: sanitizeImageTransform(record.desktop),
    tablet: sanitizeImageTransform(record.tablet),
    mobile: sanitizeImageTransform(record.mobile),
  };
}

/**
 * Calculates the source-pixel crop represented by the browser focal controls.
 * The result is independent of browser DPR and is used by the server-side
 * renderer before resizing to the exact canonical target.
 */
export function canonicalCropRegion(
  source: { width: number; height: number },
  target: CanonicalCropTarget,
  transformValue: unknown,
): PixelCropRegion {
  const transform = sanitizeImageTransform(transformValue);
  const sourceWidth = Math.max(1, Math.floor(source.width));
  const sourceHeight = Math.max(1, Math.floor(source.height));
  const targetWidth = Math.max(1, Math.floor(target.width));
  const targetHeight = Math.max(1, Math.floor(target.height));
  const baseScale = Math.max(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  );
  const scale = baseScale * transform.zoom;
  const cropWidth = Math.min(sourceWidth, targetWidth / scale);
  const cropHeight = Math.min(sourceHeight, targetHeight / scale);
  const availableX = Math.max(0, sourceWidth - cropWidth);
  const availableY = Math.max(0, sourceHeight - cropHeight);
  const centerX = (transform.positionX + 100) / 200;
  const centerY = (transform.positionY + 100) / 200;
  const roundedWidth = Math.max(1, Math.min(sourceWidth, Math.round(cropWidth)));
  const roundedHeight = Math.max(
    1,
    Math.min(sourceHeight, Math.round(cropHeight)),
  );
  return {
    left: Math.max(
      0,
      Math.min(sourceWidth - roundedWidth, Math.round(availableX * centerX)),
    ),
    top: Math.max(
      0,
      Math.min(sourceHeight - roundedHeight, Math.round(availableY * centerY)),
    ),
    width: roundedWidth,
    height: roundedHeight,
  };
}

export function orientedDimensions(input: {
  width?: number;
  height?: number;
  orientation?: number;
}) {
  const width = Math.max(1, Number(input.width || 0));
  const height = Math.max(1, Number(input.height || 0));
  return Number(input.orientation || 1) >= 5 &&
    Number(input.orientation || 1) <= 8
    ? { width: height, height: width }
    : { width, height };
}
