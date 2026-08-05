import type { ImageTransform } from "@/lib/imageUpload";

export type ImageCropAxis = "x" | "y";

export type ImageCropDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  positionX: number;
  positionY: number;
  axis: ImageCropAxis | null;
};

const CROP_LIMIT = 100;
const CROP_DRAG_THRESHOLD_PX = 4;
export const INTERACTIVE_CROP_ZOOM = 1.15;

function clampCrop(value: number) {
  return Math.max(-CROP_LIMIT, Math.min(CROP_LIMIT, value));
}

export function createImageCropDrag(
  pointerId: number,
  clientX: number,
  clientY: number,
  transform: ImageTransform,
): ImageCropDrag {
  return {
    pointerId,
    startX: clientX,
    startY: clientY,
    positionX: Number(transform.positionX || 0),
    positionY: Number(transform.positionY || 0),
    axis: null,
  };
}

/**
 * Locks each touch/mouse gesture to its dominant axis. Mobile pointer events
 * always contain a little motion on both axes, so changing X and Y together
 * makes a vertical adjustment appear to slide the image sideways.
 */
export function transformForCropPointer(
  drag: ImageCropDrag,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
  current: ImageTransform,
) {
  const deltaX = clientX - drag.startX;
  const deltaY = clientY - drag.startY;
  if (
    !drag.axis &&
    Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= CROP_DRAG_THRESHOLD_PX
  ) {
    drag.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
  }
  if (!drag.axis) return current;

  const next: ImageTransform = {
    ...current,
    zoom: Math.max(
      INTERACTIVE_CROP_ZOOM,
      Number(current.zoom || 1),
    ),
  };
  if (drag.axis === "x") {
    next.positionX = clampCrop(
      drag.positionX - (deltaX / Math.max(1, width)) * 200,
    );
    // Preserve Y exactly: horizontal pointer movement must never alter it.
    next.positionY = Number(current.positionY || 0);
  } else {
    next.positionX = Number(current.positionX || 0);
    next.positionY = clampCrop(
      drag.positionY - (deltaY / Math.max(1, height)) * 200,
    );
  }
  return next;
}

export function nudgeImageCrop(
  current: ImageTransform,
  axis: "positionX" | "positionY",
  amount: number,
) {
  return {
    ...current,
    zoom: Math.max(
      INTERACTIVE_CROP_ZOOM,
      Number(current.zoom || 1),
    ),
    [axis]: clampCrop(Number(current[axis] || 0) + amount),
  };
}
