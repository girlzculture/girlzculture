"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getImageUploadError,
  getSourceImageQualityError,
  IMAGE_UPLOAD_PROFILES,
  inspectImageFile,
  profileForRendition,
  type ImagePresetKey,
  type ImageRenditionDevice,
} from "@/lib/imageUpload";
import { canonicalCropRegion } from "@/lib/mediaImageProcessingCore";
import { runMediaUploadQueue } from "@/lib/mediaUploadQueueCore";

const PLACEMENTS = Object.keys(IMAGE_UPLOAD_PROFILES) as ImagePresetKey[];
const DEVICES: ImageRenditionDevice[] = ["desktop", "tablet", "mobile"];

type BrowserImage = {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  blobVerified: boolean;
  acceptedPlacements: ImagePresetKey[];
  error: string;
  queueStatus: "ready" | "uploading" | "complete" | "error";
};

export default function MediaUploadAcceptanceHarness() {
  const [images, setImages] = useState<BrowserImage[]>([]);
  const previewUrls = useRef<string[]>([]);
  const [placement, setPlacement] = useState<ImagePresetKey>("cover");
  const [device, setDevice] = useState<ImageRenditionDevice>("desktop");
  const [queueSummary, setQueueSummary] = useState("");
  const profile = IMAGE_UPLOAD_PROFILES[placement];
  const output = profileForRendition(profile, device);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  async function selectFiles(files: File[]) {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    const next = await Promise.all(
      files.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        try {
          const dimensions = await inspectImageFile(file);
          const qualityError = getSourceImageQualityError(dimensions);
          const acceptedPlacements = PLACEMENTS.filter(
            (key) =>
              !qualityError &&
              !getImageUploadError(file, IMAGE_UPLOAD_PROFILES[key]),
          );
          const fileBytes = new Uint8Array(await file.arrayBuffer());
          const blob = new Blob([fileBytes], { type: file.type });
          const blobBytes = new Uint8Array(await blob.arrayBuffer());
          return {
            id: crypto.randomUUID(),
            file,
            previewUrl,
            width: dimensions.width,
            height: dimensions.height,
            blobVerified:
              blob.size === file.size &&
              blob.type === file.type &&
              blobBytes.byteLength === fileBytes.byteLength,
            acceptedPlacements,
            error:
              qualityError ||
              (acceptedPlacements.length === PLACEMENTS.length
                ? ""
                : "One or more placements rejected this source."),
            queueStatus: "ready" as const,
          };
        } catch (error) {
          return {
            id: crypto.randomUUID(),
            file,
            previewUrl,
            width: 0,
            height: 0,
            blobVerified: false,
            acceptedPlacements: [],
            error:
              error instanceof Error
                ? error.message
                : "The browser could not decode this image.",
            queueStatus: "error" as const,
          };
        }
      }),
    );
    previewUrls.current = next.map((image) => image.previewUrl);
    setImages(next);
    setQueueSummary("");
  }

  async function simulateQueue() {
    setQueueSummary("");
    const result = await runMediaUploadQueue(
      images.map((image) => image.id),
      async (id) => {
        const image = images.find((row) => row.id === id);
        if (!image) throw new Error("The selected browser File is unavailable.");
      setImages((rows) =>
        rows.map((row) =>
          row.id === image.id ? { ...row, queueStatus: "uploading" } : row,
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      if (image.file.name.includes("partial-failure")) {
        setImages((rows) =>
          rows.map((row) =>
            row.id === image.id ? { ...row, queueStatus: "error" } : row,
          ),
        );
        throw new Error("Acceptance harness forced one isolated failure.");
      }
      setImages((rows) =>
        rows.map((row) =>
          row.id === image.id ? { ...row, queueStatus: "complete" } : row,
        ),
      );
      return true;
      },
    );
    setQueueSummary(`${result.completed} complete, ${result.failed} failed`);
  }

  const firstCrop = useMemo(() => {
    const image = images[0];
    if (!image?.width || !image.height) return null;
    const target = {
      width: output.outputWidth,
      height: Math.round(
        (output.outputWidth * output.aspectHeight) / output.aspectWidth,
      ),
    };
    return {
      target,
      crop: canonicalCropRegion(
        { width: image.width, height: image.height },
        target,
        { zoom: 1, positionX: 0, positionY: 0, rotation: 0 },
      ),
    };
  }, [images, output]);

  return (
    <main className="min-h-screen bg-cream p-5 text-ink">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-serif text-4xl text-plum">
          Media upload browser acceptance
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/65">
          This test-only page decodes genuine browser File and Blob objects. It
          does not write to Storage or the database.
        </p>

        <label className="mt-6 block rounded-xl border border-plum/15 bg-white p-4 text-sm font-bold">
          Real image files
          <input
            aria-label="Real image files"
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={(event) =>
              void selectFiles(Array.from(event.currentTarget.files || []))
            }
            className="mt-3 block w-full text-xs"
          />
        </label>

        <section className="mt-5 grid gap-3 rounded-xl border border-plum/15 bg-white p-4 sm:grid-cols-2">
          <label className="text-xs font-bold">
            Placement
            <select
              aria-label="Preview placement"
              value={placement}
              onChange={(event) =>
                setPlacement(event.target.value as ImagePresetKey)
              }
              className="mt-1 min-h-11 w-full rounded-lg border px-3"
            >
              {PLACEMENTS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            Device
            <select
              aria-label="Preview device"
              value={device}
              onChange={(event) =>
                setDevice(event.target.value as ImageRenditionDevice)
              }
              className="mt-1 min-h-11 w-full rounded-lg border px-3"
            >
              {DEVICES.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <output
            data-testid="canonical-output"
            data-output-dimensions={
              firstCrop
                ? `${firstCrop.target.width}x${firstCrop.target.height}`
                : ""
            }
            data-crop-region={
              firstCrop ? JSON.stringify(firstCrop.crop) : ""
            }
            className="rounded-lg bg-blush/35 p-3 text-xs sm:col-span-2"
          >
            {firstCrop
              ? `${placement}/${device}: ${firstCrop.target.width}×${firstCrop.target.height}; crop ${JSON.stringify(firstCrop.crop)}`
              : "Choose an image to calculate the canonical crop."}
          </output>
        </section>

        <section
          aria-label="Placement preview"
          className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {images.map((image) => (
            <article
              key={image.id}
              data-testid="browser-image-result"
              data-file-name={image.file.name}
              data-source-dimensions={`${image.width}x${image.height}`}
              data-accepted={
                image.acceptedPlacements.length === PLACEMENTS.length
              }
              data-accepted-placements={image.acceptedPlacements.join(",")}
              data-blob-verified={image.blobVerified}
              data-queue-status={image.queueStatus}
              className="rounded-xl border border-plum/15 bg-white p-3"
            >
              <div
                className="overflow-hidden rounded-lg bg-blush/40"
                style={{
                  aspectRatio: `${output.aspectWidth}/${output.aspectHeight}`,
                }}
              >
                {/* This is deliberately a real browser-decoded object URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt={`Crop preview for ${image.file.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
              <h2 className="mt-3 truncate text-sm font-bold">
                {image.file.name}
              </h2>
              <p className="mt-1 text-xs text-ink/60">
                {image.width}×{image.height}px · Blob{" "}
                {image.blobVerified ? "verified" : "failed"}
              </p>
              <p className="mt-1 text-xs text-ink/60">
                Queue: {image.queueStatus}
              </p>
              {image.error ? (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {image.error}
                </p>
              ) : (
                <p className="mt-2 text-xs text-green-700">
                  Accepted for every placement
                </p>
              )}
            </article>
          ))}
        </section>

        {images.length ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void simulateQueue()}
              className="min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white"
            >
              Run isolated multi-file outcomes
            </button>
            <output role="status" data-testid="queue-summary">
              {queueSummary}
            </output>
          </div>
        ) : null}
      </div>
    </main>
  );
}
