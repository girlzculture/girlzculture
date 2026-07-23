"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImagePlus, RotateCw, UploadCloud, X } from "lucide-react";
import { getSupabaseForScope, type AuthScope } from "@/lib/supabase";
import {
  getImageUploadError,
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

type ImageUploadProps = {
  bucket: "salon-photos" | "stylist-photos" | "style-photos" | "review-photos" | "content-media" | string;
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
};

const DEVICES: ImageRenditionDevice[] = ["desktop", "tablet", "mobile"];
const DEFAULT_TRANSFORM: ImageTransform = { zoom: 1, positionX: 0, positionY: 0, rotation: 0 };
const DEFAULT_TRANSFORMS: ResponsiveImageTransforms = {
  desktop: { ...DEFAULT_TRANSFORM }, tablet: { ...DEFAULT_TRANSFORM }, mobile: { ...DEFAULT_TRANSFORM },
};

function values(value: ImageUploadProps["value"], multiple: boolean) {
  return multiple ? (Array.isArray(value) ? value.filter(Boolean) : []) : typeof value === "string" && value ? [value] : [];
}

export default function ImageUpload({ bucket, value, onChange, label, helperText, folder, multiple = false, maxFiles = 8, disabled = false, className, authScope = "customer", preset }: ImageUploadProps) {
  const supabase = getSupabaseForScope(authScope);
  const inputRef = useRef<HTMLInputElement>(null);
  const cropDrag = useRef<{ id: number; x: number; y: number; positionX: number; positionY: number } | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [renderedPreview, setRenderedPreview] = useState("");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [device, setDevice] = useState<ImageRenditionDevice>("desktop");
  const [transforms, setTransforms] = useState<ResponsiveImageTransforms>(DEFAULT_TRANSFORMS);
  const [configuredProfile, setConfiguredProfile] = useState<ImageUploadProfile | null>(null);
  const current = useMemo(() => values(value, multiple), [multiple, value]);
  const presetKey = preset || inferImagePreset(label, bucket, folder);
  const profile = configuredProfile || IMAGE_UPLOAD_PROFILES[presetKey];
  const activeProfile = useMemo(() => profileForRendition(profile, device), [device, profile]);
  const transform = transforms[device];

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => { if (mounted) setAuthenticated(Boolean(data.user)); });
    return () => { mounted = false; };
  }, [supabase]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/media/upload?kind=${presetKey}`, { signal: controller.signal })
      .then((response) => response.json()).then((body) => { if (body.profile) setConfiguredProfile(body.profile); }).catch(() => undefined);
    return () => controller.abort();
  }, [presetKey]);
  useEffect(() => () => {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    if (renderedPreview) URL.revokeObjectURL(renderedPreview);
  }, [sourcePreview, renderedPreview]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    let nextUrl = "";
    const timer = window.setTimeout(() => {
      const previewProfile = { ...activeProfile, outputWidth: Math.min(560, activeProfile.outputWidth), maxBytes: 3 * 1024 * 1024 };
      void optimizeImageFile(selected, previewProfile, transform).then((file) => {
        if (!active) return;
        nextUrl = URL.createObjectURL(file);
        setRenderedPreview((old) => { if (old) URL.revokeObjectURL(old); return nextUrl; });
      }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "The crop preview could not be prepared."); });
    }, 100);
    return () => { active = false; window.clearTimeout(timer); if (nextUrl) URL.revokeObjectURL(nextUrl); };
  }, [activeProfile, selected, transform]);

  function setTransform(update: (current: ImageTransform) => ImageTransform) {
    setTransforms((current) => ({ ...current, [device]: update(current[device]) }));
  }
  function resetEditor() {
    if (sourcePreview) URL.revokeObjectURL(sourcePreview);
    if (renderedPreview) URL.revokeObjectURL(renderedPreview);
    setSourcePreview(""); setRenderedPreview(""); setSelected(null); setDimensions(null); setDevice("desktop");
    setTransforms({ desktop: { ...DEFAULT_TRANSFORM }, tablet: { ...DEFAULT_TRANSFORM }, mobile: { ...DEFAULT_TRANSFORM } });
    if (inputRef.current) inputRef.current.value = "";
  }
  async function prepare(file: File) {
    setError(""); setStatus("");
    const validation = getImageUploadError(file, profile);
    if (validation) { setError(validation); return; }
    try {
      const size = await inspectImageFile(file);
      if (size.width < profile.minWidth || size.height < profile.minHeight) throw new Error(`This image is ${size.width} × ${size.height}px. Choose one at least ${profile.minWidth} × ${profile.minHeight}px.`);
      if (sourcePreview) URL.revokeObjectURL(sourcePreview);
      setSelected(file); setDimensions(size); setSourcePreview(URL.createObjectURL(file)); setDevice("desktop");
      setTransforms({ desktop: { ...DEFAULT_TRANSFORM }, tablet: { ...DEFAULT_TRANSFORM }, mobile: { ...DEFAULT_TRANSFORM } });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This image could not be read."); }
  }
  async function upload() {
    if (!selected || busy) return;
    setBusy(true); setError(""); setStatus("Preparing responsive images...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again before uploading.");
      const outputs = await Promise.all(DEVICES.map(async (target) => [target, await optimizeImageFile(selected, profileForRendition(profile, target), transforms[target])] as const));
      const form = new FormData();
      for (const [target, file] of outputs) form.set(target === "desktop" ? "file" : `${target}_file`, file);
      form.set("bucket", bucket); form.set("folder", folder || ""); form.set("kind", presetKey);
      form.set("crop_metadata", JSON.stringify({ version: 1, source: dimensions, transforms }));
      const response = await fetch("/api/media/upload", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const body = await response.json() as { url?: string; error?: string; requestId?: string };
      if (!response.ok || !body.url) throw new Error(`${body.error || "Upload failed."}${body.requestId ? ` Reference: ${body.requestId}` : ""}`);
      onChange(multiple ? [...current, body.url].slice(0, maxFiles) : body.url);
      setStatus("Upload complete. The saved image now uses the same crop shown in preview.");
      resetEditor();
    } catch (reason) { setStatus(""); setError(reason instanceof Error ? reason.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }
  async function remove(target: string) {
    onChange(multiple ? current.filter((item) => item !== target) : null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await fetch("/api/media/upload", { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) });
    } catch { /* Registry cleanup handles an unattached object. */ }
  }
  function move(target: string, direction: -1 | 1) {
    const index = current.indexOf(target); const nextIndex = index + direction;
    if (!multiple || index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; onChange(next);
  }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files?.[0]; if (file) void prepare(file); }
  function beginCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    cropDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, positionX: Number(transform.positionX || 0), positionY: Number(transform.positionY || 0) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCrop(event: React.PointerEvent<HTMLDivElement>) {
    const drag = cropDrag.current; if (!drag || drag.id !== event.pointerId) return;
    const width = Math.max(1, event.currentTarget.clientWidth); const height = Math.max(1, event.currentTarget.clientHeight);
    setTransform((current) => ({ ...current, positionX: Math.max(-100, Math.min(100, drag.positionX - ((event.clientX - drag.x) / width) * 200)), positionY: Math.max(-100, Math.min(100, drag.positionY - ((event.clientY - drag.y) / height) * 200)) }));
  }
  function endCropDrag(event: React.PointerEvent<HTMLDivElement>) { if (cropDrag.current?.id === event.pointerId) cropDrag.current = null; }
  function nudge(axis: "positionX" | "positionY", amount: number) { setTransform((current) => ({ ...current, [axis]: Math.max(-100, Math.min(100, Number(current[axis] || 0) + amount)) })); }

  const locked = disabled || authenticated !== true || busy || (multiple && current.length >= maxFiles);
  const aspect = `${activeProfile.aspectWidth} / ${activeProfile.aspectHeight}`;
  const savedAspect = `${profile.aspectWidth} / ${profile.aspectHeight}`;

  return <div className={className}>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[.16em] text-magenta">{label}</p>{helperText ? <p className="mt-1 text-xs leading-5 text-ink/65">{helperText}</p> : null}</div><ul className="space-y-0.5 text-[10px] font-semibold text-ink/55"><li>JPG or PNG · maximum original size 12 MB</li><li>Recommended {profile.minWidth}×{profile.minHeight}px or larger</li><li>Each device crop is saved as its own rendition</li></ul></div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void prepare(file); }} className="sr-only" />

    {selected && sourcePreview ? <section className="mt-4 rounded-[16px] border border-plum/15 bg-cream/55 p-4" aria-label={`Edit ${label}`}>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Image crop device"><span className="mr-2 self-center text-xs font-bold text-plum">Preview for</span>{DEVICES.map((target) => <button key={target} type="button" role="tab" aria-selected={device === target} onClick={() => setDevice(target)} className={`min-h-10 rounded-lg px-4 text-xs font-bold capitalize ${device === target ? "bg-plum text-white" : "border border-plum/15 bg-white text-plum"}`}>{target}</button>)}</div>
      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div><div onPointerDown={beginCropDrag} onPointerMove={moveCrop} onPointerUp={endCropDrag} onPointerCancel={endCropDrag} className="relative mx-auto max-h-[520px] max-w-2xl touch-none overflow-hidden rounded-[13px] bg-ink/10" style={{ aspectRatio: aspect, backgroundImage: renderedPreview ? `url(${renderedPreview})` : "none", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}>{activeProfile.safeArea ? <div className="pointer-events-none absolute inset-[10%] rounded-lg border border-dashed border-white/80 shadow-[0_0_0_999px_rgba(26,18,32,.12)]" aria-hidden="true" /> : null}</div><p className="mt-2 text-center text-[10px] text-ink/55">Canonical {device} crop · drag with a mouse or finger. This exact rendered crop is uploaded.</p></div>
        <div><label className="block text-[10px] font-bold">Zoom<input aria-label={`${device} image zoom`} type="range" min="1" max="3" step="0.05" value={transform.zoom || 1} onChange={(event) => setTransform((current) => ({ ...current, zoom: Number(event.target.value) }))} className="mt-1 w-full accent-magenta" /></label>
          <label className="mt-3 block text-[10px] font-bold">Move left/right<input aria-label={`${device} horizontal image position`} type="range" min="-100" max="100" value={transform.positionX || 0} onChange={(event) => setTransform((current) => ({ ...current, positionX: Number(event.target.value) }))} className="mt-1 w-full accent-magenta" /></label>
          <label className="mt-3 block text-[10px] font-bold">Move up/down<input aria-label={`${device} vertical image position`} type="range" min="-100" max="100" value={transform.positionY || 0} onChange={(event) => setTransform((current) => ({ ...current, positionY: Number(event.target.value) }))} className="mt-1 w-full accent-magenta" /></label>
          <div className="mt-3 grid grid-cols-4 gap-1"><CropButton label="Move crop left" onClick={() => nudge("positionX", 10)}><ArrowLeft size={15}/></CropButton><CropButton label="Move crop right" onClick={() => nudge("positionX", -10)}><ArrowRight size={15}/></CropButton><CropButton label="Move crop up" onClick={() => nudge("positionY", 10)}><ArrowUp size={15}/></CropButton><CropButton label="Move crop down" onClick={() => nudge("positionY", -10)}><ArrowDown size={15}/></CropButton></div>
          <button type="button" onClick={() => setTransform(() => ({ ...DEFAULT_TRANSFORM }))} className="mt-2 min-h-10 w-full rounded-lg border border-plum/15 text-xs font-bold text-plum">Reset {device} crop</button>
          <button type="button" onClick={() => setTransform((current) => ({ ...current, rotation: (((current.rotation || 0) + 90) % 360) as 0 | 90 | 180 | 270 }))} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-plum/15 text-xs font-bold text-plum"><RotateCw size={15}/>Rotate 90°</button>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink/60">Original: {dimensions?.width}×{dimensions?.height}px. {device} output: {activeProfile.outputWidth}×{Math.round(activeProfile.outputWidth * activeProfile.aspectHeight / activeProfile.aspectWidth)}px. Exporting also strips embedded metadata and applies browser image orientation consistently.</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={resetEditor} className="min-h-11 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum">Cancel</button><button type="button" onClick={() => { resetEditor(); inputRef.current?.click(); }} className="min-h-11 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Replace</button><button type="button" disabled={busy} onClick={() => void upload()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-60"><UploadCloud size={16}/>{busy ? "Uploading..." : "Save all crops"}</button></div>
    </section> : null}

    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {current.map((src) => <article key={src} className="group relative overflow-hidden rounded-[14px] border border-plum/10 bg-white shadow-sm"><div className="bg-cover bg-center" style={{ aspectRatio: savedAspect, backgroundImage: `url(${src})` }} /><div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-ink/85 to-transparent p-3 text-white opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">{multiple ? <><CropButton label="Move image left" onClick={() => move(src, -1)}><ArrowLeft size={15}/></CropButton><CropButton label="Move image right" onClick={() => move(src, 1)}><ArrowRight size={15}/></CropButton></> : <button type="button" onClick={() => inputRef.current?.click()} className="min-h-10 rounded-full bg-white/20 px-3 text-xs font-bold">Replace</button>}<CropButton label={`Remove ${label} image`} onClick={() => void remove(src)}><X size={15}/></CropButton></div></article>)}
      {!selected && (!current.length || multiple && current.length < maxFiles) ? <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`rounded-[16px] border border-dashed p-2 transition ${dragging ? "border-magenta bg-blush/50" : "border-plum/25 bg-cream/50"}`}><button type="button" disabled={locked} onClick={() => inputRef.current?.click()} className="flex min-h-[150px] w-full flex-col items-center justify-center rounded-[12px] px-4 text-center disabled:cursor-not-allowed disabled:opacity-50"><ImagePlus size={28} className="text-magenta"/><b className="mt-2 text-sm text-plum">{current.length ? "Add another image" : "Drag and drop or choose a file"}</b><span className="mt-1 text-[10px] text-ink/55">{authenticated === null ? "Checking access..." : authenticated ? `${current.length}/${multiple ? maxFiles : 1} uploaded` : "Sign in to upload"}</span></button></div> : null}
    </div>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}{status ? <p role="status" className="mt-3 rounded-lg bg-blush/55 px-3 py-2 text-xs text-plum">{status}</p> : null}
  </div>;
}

function CropButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className="grid min-h-10 min-w-10 place-items-center rounded-lg border border-current/15 bg-white/10">{children}</button>;
}
