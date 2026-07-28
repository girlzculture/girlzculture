"use client";

import {
  type DragEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ImagePlus,
  LoaderCircle,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";
import { readApiResponse } from "@/lib/apiResponseClient";
import {
  getImageUploadError,
  getSourceImageQualityError,
  IMAGE_UPLOAD_PROFILES,
  inferImagePreset,
  inspectImageFile,
  optimizeImageFile,
  profileForRendition,
  type ImagePresetKey,
  type ImageRenditionDevice,
  type ImageTransform,
  type ImageUploadProfile,
  type ResponsiveImageTransforms,
} from "@/lib/imageUpload";
import {
  directMediaUpload,
  persistMediaOrder,
} from "@/lib/mediaUploadClient";
import {
  appendUniqueMediaUrl,
  type MediaAttachment,
} from "@/lib/mediaUploadProtocol";
import { runMediaUploadQueue } from "@/lib/mediaUploadQueueCore";
import {
  getSupabaseForScope,
  getValidSessionForScope,
  type AuthScope,
} from "@/lib/supabase";

type ImageUploadProps = {
  bucket:
    | "salon-photos"
    | "stylist-photos"
    | "style-photos"
    | "review-photos"
    | "content-media"
    | string;
  value: string | string[] | null | undefined;
  onChange: (value: string | string[] | null) => void;
  label: string;
  helperText?: string;
  folder?: string;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  authScope?: AuthScope;
  preset?: ImagePresetKey;
  attachment?: MediaAttachment | null;
  onPersisted?: (value: string | string[] | null) => void;
};

type QueueStatus = "ready" | "uploading" | "complete" | "error";

type QueueItem = {
  id: string;
  file: File;
  sourcePreview: string;
  dimensions: { width: number; height: number } | null;
  transforms: ResponsiveImageTransforms;
  status: QueueStatus;
  progress: number;
  stage: string;
  error: string;
  canUpload: boolean;
  resultUrl?: string;
  attached?: boolean;
  pendingUploadId?: string;
  placement: {
    bucket: string;
    folder: string;
    preset: ImagePresetKey;
    profile: ImageUploadProfile;
    attachment?: MediaAttachment | null;
  };
};

const DEVICES: ImageRenditionDevice[] = ["desktop", "tablet", "mobile"];
const DEFAULT_TRANSFORM: ImageTransform = {
  zoom: 1,
  positionX: 0,
  positionY: 0,
  rotation: 0,
};

function freshTransforms(): ResponsiveImageTransforms {
  return {
    desktop: { ...DEFAULT_TRANSFORM },
    tablet: { ...DEFAULT_TRANSFORM },
    mobile: { ...DEFAULT_TRANSFORM },
  };
}

function values(value: ImageUploadProps["value"], multiple: boolean) {
  return multiple
    ? Array.isArray(value)
      ? value.filter(Boolean)
      : []
    : typeof value === "string" && value
      ? [value]
      : [];
}

function queueId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ImageUpload({
  bucket,
  value,
  onChange,
  label,
  helperText,
  folder,
  multiple = false,
  maxFiles = 8,
  disabled = false,
  className,
  authScope = "customer",
  preset,
  attachment,
  onPersisted,
}: ImageUploadProps) {
  const supabase = getSupabaseForScope(authScope);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const committedRef = useRef<string[]>([]);
  const cropDrag = useRef<{
    id: number;
    x: number;
    y: number;
    positionX: number;
    positionY: number;
  } | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [renderedPreview, setRenderedPreview] = useState({
    key: "",
    url: "",
  });
  const [device, setDevice] =
    useState<ImageRenditionDevice>("desktop");
  const [configuredProfile, setConfiguredProfile] = useState<{
    key: ImagePresetKey;
    profile: ImageUploadProfile;
  } | null>(null);
  const [profileLoad, setProfileLoad] = useState<{
    key: ImagePresetKey;
    status: "loading" | "ready" | "error";
  }>({
    key: preset || inferImagePreset(label, bucket, folder),
    status: "loading",
  });
  const [profileReload, setProfileReload] = useState(0);
  const current = useMemo(() => values(value, multiple), [multiple, value]);
  const presetKey = preset || inferImagePreset(label, bucket, folder);
  const profileReady =
    configuredProfile?.key === presetKey &&
    profileLoad.key === presetKey &&
    profileLoad.status === "ready";
  const profile =
    profileReady
      ? configuredProfile.profile
      : IMAGE_UPLOAD_PROFILES[presetKey];
  const active = useMemo(
    () => queue.find((item) => item.id === activeId) || null,
    [activeId, queue],
  );
  const activeProfile = useMemo(
    () => profileForRendition(active?.placement.profile || profile, device),
    [active?.placement.profile, device, profile],
  );
  const transform = active?.transforms[device] || DEFAULT_TRANSFORM;
  const previewKey = active
    ? `${active.id}:${device}:${activeProfile.outputWidth}:${JSON.stringify(transform)}`
    : "";
  const animatedGif = active?.file.type === "image/gif";
  const pendingCount = queue.filter(
    (item) =>
      item.canUpload &&
      (item.status === "ready" || item.status === "error"),
  ).length;

  function updateQueue(
    update: QueueItem[] | ((current: QueueItem[]) => QueueItem[]),
  ) {
    setQueue((currentQueue) => {
      const next =
        typeof update === "function" ? update(currentQueue) : update;
      queueRef.current = next;
      return next;
    });
  }

  function updateQueueItem(
    id: string,
    update: Partial<QueueItem> | ((current: QueueItem) => QueueItem),
  ) {
    updateQueue((currentQueue) =>
      currentQueue.map((item) =>
        item.id === id
          ? typeof update === "function"
            ? update(item)
            : { ...item, ...update }
          : item,
      ),
    );
  }

  useEffect(() => {
    committedRef.current = current;
  }, [current]);

  useEffect(() => {
    let mounted = true;
    void getValidSessionForScope(authScope, 15)
      .then((session) => {
        if (mounted) setAuthenticated(Boolean(session));
      })
      .catch(() => {
        if (mounted) setAuthenticated(false);
      });
    return () => {
      mounted = false;
    };
  }, [authScope]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/media/upload?kind=${presetKey}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await readApiResponse(
          response,
          "The image requirements could not be loaded.",
        );
        if (response.ok && body.profile) {
          setConfiguredProfile({
            key: presetKey,
            profile: body.profile as ImageUploadProfile,
          });
          setProfileLoad({ key: presetKey, status: "ready" });
          return;
        }
        throw new Error("The image requirements could not be loaded.");
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setProfileLoad({ key: presetKey, status: "error" });
        setError(
          reason instanceof Error
            ? reason.message
            : "The image requirements could not be loaded.",
        );
      });
    return () => controller.abort();
  }, [presetKey, profileReload]);

  useEffect(
    () => () => {
      queueRef.current.forEach((item) =>
        URL.revokeObjectURL(item.sourcePreview),
      );
    },
    [],
  );

  useEffect(() => {
    if (!active?.canUpload || !active.dimensions) {
      return;
    }
    let live = true;
    let nextUrl = "";
    const timer = window.setTimeout(() => {
      const previewProfile = {
        ...activeProfile,
        outputWidth: Math.min(560, activeProfile.outputWidth),
        maxBytes: 3 * 1024 * 1024,
      };
      void optimizeImageFile(active.file, previewProfile, transform)
        .then((file) => {
          if (!live) return;
          nextUrl = URL.createObjectURL(file);
          setRenderedPreview({ key: previewKey, url: nextUrl });
        })
        .catch((reason) => {
          if (live) {
            updateQueueItem(active.id, {
              error:
                reason instanceof Error
                  ? reason.message
                  : "The crop preview could not be prepared.",
              status: "error",
            });
          }
        });
    }, 100);
    return () => {
      live = false;
      window.clearTimeout(timer);
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
    // active.transforms[device] changes by identity for every crop adjustment.
    // updateQueueItem intentionally stays outside the dependency list: the
    // preview is keyed only by the selected file, device profile, and crop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active?.id,
    active?.file,
    active?.canUpload,
    active?.dimensions,
    active?.transforms,
    activeProfile,
    previewKey,
    transform,
  ]);

  function setTransform(
    update: (current: ImageTransform) => ImageTransform,
  ) {
    if (!active || active.pendingUploadId) return;
    updateQueueItem(active.id, (item) => ({
      ...item,
      transforms: {
        ...item.transforms,
        [device]: update(item.transforms[device]),
      },
    }));
  }

  function removeQueueItem(id: string) {
    const target = queueRef.current.find((item) => item.id === id);
    if (target) URL.revokeObjectURL(target.sourcePreview);
    updateQueue((rows) => rows.filter((item) => item.id !== id));
    if (activeId === id) {
      const next = queueRef.current.find((item) => item.id !== id);
      setActiveId(next?.id || "");
    }
  }

  async function prepareFiles(fileList: File[]) {
    setError("");
    setStatus("");
    const inFlight = queueRef.current.filter(
      (item) => item.status !== "complete",
    ).length;
    const capacity = multiple
      ? Math.max(0, maxFiles - committedRef.current.length - inFlight)
      : 1;
    const candidates = (multiple ? fileList : fileList.slice(0, 1)).slice(
      0,
      capacity,
    );
    if (!candidates.length) {
      setError(
        multiple
          ? `This gallery can contain up to ${maxFiles} images.`
          : "Choose an image to upload.",
      );
      return;
    }
    if (!multiple) {
      queueRef.current.forEach((item) =>
        URL.revokeObjectURL(item.sourcePreview),
      );
      updateQueue([]);
    }

    const prepared: QueueItem[] = [];
    for (const file of candidates) {
      const id = queueId();
      const sourcePreview = URL.createObjectURL(file);
      const placement: QueueItem["placement"] = {
        bucket,
        folder: folder || "",
        preset: presetKey,
        profile: {
          ...profile,
          acceptedMimeTypes: profile.acceptedMimeTypes
            ? [...profile.acceptedMimeTypes]
            : undefined,
        },
        attachment: attachment ? { ...attachment } : null,
      };
      const validation = getImageUploadError(file, profile);
      if (validation) {
        prepared.push({
          id,
          file,
          sourcePreview,
          dimensions: null,
          transforms: freshTransforms(),
          status: "error",
          progress: 0,
          stage: "Needs attention",
          error: validation,
          canUpload: false,
          placement,
        });
        continue;
      }
      try {
        const dimensions = await inspectImageFile(file);
        const qualityError = getSourceImageQualityError(dimensions);
        if (qualityError) throw new Error(qualityError);
        prepared.push({
          id,
          file,
          sourcePreview,
          dimensions,
          transforms: freshTransforms(),
          status: "ready",
          progress: 0,
          stage: "Ready to upload",
          error: "",
          canUpload: true,
          placement,
        });
      } catch (reason) {
        prepared.push({
          id,
          file,
          sourcePreview,
          dimensions: null,
          transforms: freshTransforms(),
          status: "error",
          progress: 0,
          stage: "Needs attention",
          error:
            reason instanceof Error
              ? reason.message
              : "This image could not be read.",
          canUpload: false,
          placement,
        });
      }
    }
    updateQueue((rows) => [...rows, ...prepared]);
    setActiveId(prepared.find((item) => item.canUpload)?.id || prepared[0]?.id);
    setDevice("desktop");
    if (fileList.length > candidates.length) {
      setError(
        `${fileList.length - candidates.length} image${fileList.length - candidates.length === 1 ? " was" : "s were"} not added because this gallery is full.`,
      );
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadOne(id: string) {
    const item = queueRef.current.find((row) => row.id === id);
    if (!item?.canUpload || !item.dimensions) return false;
    updateQueueItem(id, {
      status: "uploading",
      progress: 2,
      stage: "Preparing original image",
      error: "",
    });
    let finalizePendingId = item.pendingUploadId || "";
    try {
      const session = await getValidSessionForScope(authScope);
      if (!session) throw new Error("Please sign in again before uploading.");
      const oldUrls = [...committedRef.current];
      const result = await directMediaUpload({
        client: supabase,
        session,
        bucket: item.placement.bucket,
        folder: item.placement.folder,
        kind: item.placement.preset,
        source: item.file,
        sourceDimensions: item.dimensions,
        transforms: item.transforms,
        attachment: item.placement.attachment,
        resumeUploadId: item.pendingUploadId,
        onFinalizePending: (pendingUploadId) => {
          finalizePendingId = pendingUploadId || "";
          updateQueueItem(id, {
            pendingUploadId: pendingUploadId || undefined,
          });
        },
        onProgress: (progress, stage) =>
          updateQueueItem(id, { progress, stage }),
      });
      const nextValues = multiple
        ? appendUniqueMediaUrl(
            committedRef.current,
            result.url,
            maxFiles,
          )
        : [result.url];
      committedRef.current = nextValues;
      const nextValue = multiple ? nextValues : result.url;
      onChange(nextValue);
      onPersisted?.(nextValue);
      updateQueueItem(id, {
        status: "complete",
        progress: 100,
        stage: result.attached
          ? "Saved to this record"
          : "Uploaded; save this form to attach",
        error: "",
        resultUrl: result.url,
        attached: result.attached,
        pendingUploadId: undefined,
      });
      if (!multiple && oldUrls[0] && oldUrls[0] !== result.url) {
        void fetch("/api/media/upload", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: oldUrls[0] }),
          cache: "no-store",
        }).catch(() => undefined);
      }
      return true;
    } catch (reason) {
      updateQueueItem(id, {
        status: "error",
        progress: finalizePendingId ? 84 : 0,
        stage: finalizePendingId
          ? "Image uploaded; save confirmation interrupted"
          : "Upload failed",
        error:
          reason instanceof Error
            ? reason.message
            : "Upload failed. Try this image again.",
      });
      return false;
    }
  }

  async function uploadAll(preferredId?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    const ids = preferredId
      ? [preferredId]
      : queueRef.current
          .filter(
            (item) =>
              item.canUpload &&
              (item.status === "ready" || item.status === "error"),
          )
          .map((item) => item.id);
    const { completed, failed } = await runMediaUploadQueue(ids, uploadOne);
    setStatus(
      completed
        ? `${completed} image${completed === 1 ? "" : "s"} saved${failed ? `; ${failed} still needs attention` : ""}.`
        : "",
    );
    if (failed && !completed) {
      setError(
        "No images were saved. Review the message beside each image and retry.",
      );
    }
    setBusy(false);
  }

  async function persistExisting(next: string[]) {
    if (!attachment) return next;
    const session = await getValidSessionForScope(authScope);
    if (!session) throw new Error("Please sign in again before saving.");
    return persistMediaOrder({
      session,
      bucket,
      folder: folder || "",
      attachment,
      urls: next,
    });
  }

  async function removeSaved(target: string) {
    setError("");
    try {
      const proposed = multiple
        ? committedRef.current.filter((item) => item !== target)
        : [];
      const persisted = await persistExisting(proposed);
      committedRef.current = persisted;
      const nextValue = multiple ? persisted : null;
      onChange(nextValue);
      onPersisted?.(nextValue);
      const session = await getValidSessionForScope(authScope);
      if (session) {
        void fetch("/api/media/upload", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: target }),
          cache: "no-store",
        }).catch(() => undefined);
      }
      setStatus("The image change was saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The image could not be removed.",
      );
    }
  }

  async function moveSaved(target: string, direction: -1 | 1) {
    const index = committedRef.current.indexOf(target);
    const nextIndex = index + direction;
    if (
      !multiple ||
      index < 0 ||
      nextIndex < 0 ||
      nextIndex >= committedRef.current.length
    )
      return;
    setError("");
    try {
      const proposed = [...committedRef.current];
      [proposed[index], proposed[nextIndex]] = [
        proposed[nextIndex],
        proposed[index],
      ];
      const persisted = await persistExisting(proposed);
      committedRef.current = persisted;
      onChange(persisted);
      onPersisted?.(persisted);
      setStatus("Image order saved.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The image order could not be saved.",
      );
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    void prepareFiles(Array.from(event.dataTransfer.files || []));
  }

  function beginCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (active?.pendingUploadId) return;
    cropDrag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positionX: Number(transform.positionX || 0),
      positionY: Number(transform.positionY || 0),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveCrop(event: PointerEvent<HTMLDivElement>) {
    const drag = cropDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    const width = Math.max(1, event.currentTarget.clientWidth);
    const height = Math.max(1, event.currentTarget.clientHeight);
    setTransform((currentTransform) => ({
      ...currentTransform,
      positionX: Math.max(
        -100,
        Math.min(
          100,
          drag.positionX -
            ((event.clientX - drag.x) / width) * 200,
        ),
      ),
      positionY: Math.max(
        -100,
        Math.min(
          100,
          drag.positionY -
            ((event.clientY - drag.y) / height) * 200,
        ),
      ),
    }));
  }

  function endCropDrag(event: PointerEvent<HTMLDivElement>) {
    if (cropDrag.current?.id === event.pointerId) cropDrag.current = null;
  }

  function nudge(
    axis: "positionX" | "positionY",
    amount: number,
  ) {
    setTransform((currentTransform) => ({
      ...currentTransform,
      [axis]: Math.max(
        -100,
        Math.min(100, Number(currentTransform[axis] || 0) + amount),
      ),
    }));
  }

  const occupied =
    current.length +
    queue.filter((item) => item.status !== "complete").length;
  const requiresSavedRecord =
    !attachment &&
    (bucket === "stylist-photos" ||
      (bucket === "salon-photos" &&
        (folder || "").split("/").filter(Boolean)[2] === "products"));
  const locked =
    disabled ||
    authenticated !== true ||
    !profileReady ||
    busy ||
    requiresSavedRecord ||
    (multiple && occupied >= maxFiles);
  const aspect = `${activeProfile.aspectWidth} / ${activeProfile.aspectHeight}`;
  const savedAspect = `${profile.aspectWidth} / ${profile.aspectHeight}`;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[.16em] text-magenta">
            {label}
          </p>
          {helperText ? (
            <p className="mt-1 text-xs leading-5 text-ink/65">
              {helperText}
            </p>
          ) : null}
        </div>
        <ul className="space-y-0.5 text-[10px] font-semibold text-ink/55">
          <li>
            {profile.acceptedMimeTypes?.includes("image/gif")
              ? "JPG, PNG, or animated GIF"
              : "JPG or PNG"}{" "}
            · original up to 12 MB
          </li>
          <li>
            {profile.label} guide: {profile.minWidth}×{profile.minHeight}px
            (recommended, not required)
          </li>
          <li>
            One original is preserved; responsive crops are created securely
            after upload
          </li>
        </ul>
      </div>
      <input
        ref={inputRef}
        type="file"
        disabled={locked}
        multiple={multiple}
        accept={
          profile.acceptedMimeTypes?.join(",") ||
          "image/jpeg,image/png"
        }
        onChange={(event) =>
          void prepareFiles(Array.from(event.target.files || []))
        }
        className="sr-only"
      />

      {active?.canUpload && active.dimensions ? (
        <section
          className="mt-4 rounded-[16px] border border-plum/15 bg-cream/55 p-4"
          aria-label={`Edit ${active.file.name}`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2" role="tablist">
              <span className="mr-2 self-center text-xs font-bold text-plum">
                Preview for
              </span>
              {DEVICES.map((target) => (
                <button
                  key={target}
                  type="button"
                  role="tab"
                  aria-selected={device === target}
                  onClick={() => setDevice(target)}
                  className={`min-h-10 rounded-lg px-4 text-xs font-bold capitalize ${
                    device === target
                      ? "bg-plum text-white"
                      : "border border-plum/15 bg-white text-plum"
                  }`}
                >
                  {target}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setActiveId("")}
              className="min-h-10 rounded-lg border border-plum/15 px-3 text-xs font-bold text-plum"
            >
              Done cropping
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <div>
              <div
                onPointerDown={animatedGif ? undefined : beginCropDrag}
                onPointerMove={animatedGif ? undefined : moveCrop}
                onPointerUp={animatedGif ? undefined : endCropDrag}
                onPointerCancel={animatedGif ? undefined : endCropDrag}
                className="relative mx-auto max-h-[520px] max-w-2xl touch-none overflow-hidden rounded-[13px] bg-ink/10"
                style={{
                  aspectRatio: aspect,
                  backgroundImage:
                    renderedPreview.key === previewKey &&
                    renderedPreview.url
                    ? `url(${renderedPreview.url})`
                    : `url(${active.sourcePreview})`,
                  backgroundSize: animatedGif ? "cover" : "100% 100%",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }}
              >
                {activeProfile.safeArea ? (
                  <div
                    className="pointer-events-none absolute inset-[10%] rounded-lg border border-dashed border-white/80 shadow-[0_0_0_999px_rgba(13,17,20,.12)]"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <p className="mt-2 text-center text-[10px] text-ink/55">
                {active.pendingUploadId
                  ? "This crop is locked because the original is already uploaded. Retry finishes the same saved upload without creating a duplicate."
                  : animatedGif
                  ? `Animated source preview in the ${device} frame. The original file is preserved.`
                  : `Canonical ${device} crop · drag with a mouse or finger. The server creates this output.`}
              </p>
            </div>
            {animatedGif ? (
              <div className="rounded-xl border border-amber/30 bg-white p-4 text-xs leading-5 text-ink/65">
                The private original keeps its animation. Responsive public
                crops use a still frame; JPG and PNG files provide independent
                crop controls for each device.
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold">
                  Zoom
                  <input
                    aria-label={`${device} image zoom`}
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={transform.zoom || 1}
                    onChange={(event) =>
                      setTransform((row) => ({
                        ...row,
                        zoom: Number(event.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-magenta"
                  />
                </label>
                <label className="mt-3 block text-[10px] font-bold">
                  Move left/right
                  <input
                    aria-label={`${device} horizontal image position`}
                    type="range"
                    min="-100"
                    max="100"
                    value={transform.positionX || 0}
                    onChange={(event) =>
                      setTransform((row) => ({
                        ...row,
                        positionX: Number(event.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-magenta"
                  />
                </label>
                <label className="mt-3 block text-[10px] font-bold">
                  Move up/down
                  <input
                    aria-label={`${device} vertical image position`}
                    type="range"
                    min="-100"
                    max="100"
                    value={transform.positionY || 0}
                    onChange={(event) =>
                      setTransform((row) => ({
                        ...row,
                        positionY: Number(event.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-magenta"
                  />
                </label>
                <div className="mt-3 grid grid-cols-4 gap-1">
                  <CropButton
                    label="Move crop left"
                    onClick={() => nudge("positionX", 10)}
                  >
                    <ArrowLeft size={15} />
                  </CropButton>
                  <CropButton
                    label="Move crop right"
                    onClick={() => nudge("positionX", -10)}
                  >
                    <ArrowRight size={15} />
                  </CropButton>
                  <CropButton
                    label="Move crop up"
                    onClick={() => nudge("positionY", 10)}
                  >
                    <ArrowUp size={15} />
                  </CropButton>
                  <CropButton
                    label="Move crop down"
                    onClick={() => nudge("positionY", -10)}
                  >
                    <ArrowDown size={15} />
                  </CropButton>
                </div>
                <button
                  type="button"
                  onClick={() => setTransform(() => ({ ...DEFAULT_TRANSFORM }))}
                  className="mt-2 min-h-10 w-full rounded-lg border border-plum/15 text-xs font-bold text-plum"
                >
                  Reset {device} crop
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTransform((row) => ({
                      ...row,
                      rotation: (((row.rotation || 0) + 90) % 360) as
                        | 0
                        | 90
                        | 180
                        | 270,
                    }))
                  }
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-plum/15 text-xs font-bold text-plum"
                >
                  <RotateCw size={15} />
                  Rotate 90°
                </button>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-ink/60">
            Original: {active.dimensions.width}×{active.dimensions.height}px.{" "}
            {device} output: {activeProfile.outputWidth}×
            {Math.round(
              (activeProfile.outputWidth * activeProfile.aspectHeight) /
                activeProfile.aspectWidth,
            )}
            px.
          </p>
          <div className="mt-4 flex justify-end">
            {active.status === "complete" ? (
              <p className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-50 px-5 text-xs font-bold text-emerald-800">
                <Check size={16} />
                {active.attached
                  ? "Image saved to this record"
                  : "Upload ready; save this form"}
              </p>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void uploadAll(active.id)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-60"
              >
                <UploadCloud size={16} />
                {active.status === "uploading"
                  ? "Uploading..."
                  : animatedGif
                    ? "Upload animated GIF"
                    : "Upload this image"}
              </button>
            )}
          </div>
        </section>
      ) : null}

      {queue.length ? (
        <section
          className="mt-4 rounded-[16px] border border-plum/10 bg-white p-3"
          aria-label="Image upload queue"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg text-plum">Upload queue</h3>
              <p className="text-[10px] text-ink/55">
                Each file continues independently if another one fails.
              </p>
            </div>
            {pendingCount ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void uploadAll()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-60"
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <UploadCloud size={16} />
                )}
                Upload {pendingCount === 1 ? "image" : `${pendingCount} images`}
              </button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2">
            {queue.map((item) => (
              <article
                key={item.id}
                className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[72px_1fr_auto] sm:items-center ${
                  item.status === "error"
                    ? "border-red-200 bg-red-50/40"
                    : item.status === "complete"
                      ? "border-emerald-200 bg-emerald-50/35"
                      : "border-plum/10 bg-cream/35"
                }`}
              >
                <div
                  className="h-[72px] w-[72px] rounded-lg bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${item.sourcePreview})`,
                  }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-bold text-ink">
                      {item.file.name}
                    </p>
                    {item.status === "complete" ? (
                      <Check size={15} className="text-emerald-700" />
                    ) : item.status === "uploading" ? (
                      <LoaderCircle
                        size={15}
                        className="animate-spin text-magenta"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-ink/55">
                    {item.stage}
                  </p>
                  {item.status === "uploading" ? (
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-blush"
                      role="progressbar"
                      aria-valuenow={item.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-magenta transition-[width]"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {item.error ? (
                    <p className="mt-1 text-[10px] leading-4 text-red-700">
                      {item.error}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.canUpload &&
                  item.status !== "uploading" &&
                  item.status !== "complete" ? (
                    <>
                      {!item.pendingUploadId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveId(item.id);
                            setDevice("desktop");
                          }}
                          className="min-h-10 rounded-lg border border-plum/15 px-3 text-[10px] font-bold text-plum"
                        >
                          Edit crop
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void uploadAll(item.id)}
                        className="min-h-10 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta disabled:opacity-50"
                      >
                        {item.status === "error" ? "Retry" : "Upload"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={item.status === "uploading"}
                    onClick={() => removeQueueItem(item.id)}
                    className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-plum/15 text-plum disabled:opacity-40"
                    aria-label={`Remove ${item.file.name} from upload queue`}
                  >
                    <X size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {current.map((src) => (
          <article
            key={src}
            className="group relative overflow-hidden rounded-[14px] border border-plum/10 bg-white shadow-sm"
          >
            <div
              className="bg-cover bg-center"
              style={{
                aspectRatio: savedAspect,
                backgroundImage: `url(${src})`,
              }}
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-ink/85 to-transparent p-3 text-white opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {multiple ? (
                <>
                  <CropButton
                    label="Move image left"
                    onClick={() => void moveSaved(src, -1)}
                  >
                    <ArrowLeft size={15} />
                  </CropButton>
                  <CropButton
                    label="Move image right"
                    onClick={() => void moveSaved(src, 1)}
                  >
                    <ArrowRight size={15} />
                  </CropButton>
                </>
              ) : (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => inputRef.current?.click()}
                  className="min-h-10 rounded-full bg-white/20 px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Replace
                </button>
              )}
              <CropButton
                label={`Remove ${label} image`}
                onClick={() => void removeSaved(src)}
              >
                <X size={15} />
              </CropButton>
            </div>
          </article>
        ))}
        {(!current.length || (multiple && occupied < maxFiles)) ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`rounded-[16px] border border-dashed p-2 transition ${
              dragging
                ? "border-magenta bg-blush/50"
                : "border-plum/25 bg-cream/50"
            }`}
          >
            <button
              type="button"
              disabled={locked}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[150px] w-full flex-col items-center justify-center rounded-[12px] px-4 text-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus size={28} className="text-magenta" />
              <b className="mt-2 text-sm text-plum">
                {current.length || queue.length
                  ? "Add more images"
                  : multiple
                    ? "Drag images here or choose files"
                    : "Drag and drop or choose a file"}
              </b>
              <span className="mt-1 text-[10px] text-ink/55">
                {authenticated === null
                  ? "Checking access..."
                  : profileLoad.key !== presetKey ||
                      profileLoad.status === "loading"
                    ? "Loading image requirements..."
                    : profileLoad.status === "error"
                      ? "Image requirements unavailable"
                  : authenticated
                    ? requiresSavedRecord
                      ? "Save the record details before adding photos"
                      : multiple
                        ? `${Math.min(occupied, maxFiles)}/${maxFiles} selected or saved`
                        : "One image"
                    : "Sign in to upload"}
              </span>
            </button>
            {profileLoad.key === presetKey &&
            profileLoad.status === "error" ? (
              <button
                type="button"
                onClick={() => {
                  setProfileLoad({ key: presetKey, status: "loading" });
                  setProfileReload((value) => value + 1);
                }}
                className="mx-auto mb-2 block min-h-10 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta"
              >
                Retry image requirements
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      ) : null}
      {status ? (
        <p
          role="status"
          className="mt-3 rounded-lg bg-blush/55 px-3 py-2 text-xs text-plum"
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}

function CropButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-current/15 bg-white/10"
    >
      {children}
    </button>
  );
}
