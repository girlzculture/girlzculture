/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Archive, CheckCircle2, Film, ImageIcon, Pause, Play, Search, Upload, XCircle } from "lucide-react";
import { adminSupabase, getValidSessionForScope } from "@/lib/supabase";
import { createVideoPoster, getVideoDuration, optimizeTrendingVideo, uploadTrendingFile } from "@/lib/videoUploadClient";
import NumericInput from "@/components/forms/NumericInput";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import {
  pollVideoJobUntilReady,
  type VideoProcessingJob,
} from "@/lib/videoJobPollingCore";

type Row = Record<string, any>;
type NumericValue = number | "";

function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function storedPosterPath(url: unknown) {
  if (typeof url !== "string") return "";
  const marker = "/storage/v1/object/public/trending-videos/";
  const index = url.indexOf(marker);
  if (index < 0) return "";
  try { return decodeURIComponent(url.slice(index + marker.length).split("?")[0]); } catch { return ""; }
}

function sourceVideoMime(file: File) {
  if (file.type) return file.type;
  if (/\.mov$/i.test(file.name)) return "video/quicktime";
  if (/\.m4v$/i.test(file.name)) return "video/x-m4v";
  if (/\.mkv$/i.test(file.name)) return "video/x-matroska";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return "video/mp4";
}

function sourceVideoExtension(file: File) {
  const match = file.name.toLowerCase().match(/\.(mp4|webm|mov|m4v|mkv)$/);
  return match?.[1] || "mp4";
}

export default function AdminTrendingCampaigns() {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [salons, setSalons] = useState<Row[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [needsServerPipeline, setNeedsServerPipeline] = useState(false);
  const [trimStart, setTrimStart] = useState<NumericValue>(0);
  const [trimEnd, setTrimEnd] = useState<NumericValue>(0);
  const [posterTime, setPosterTime] = useState(0);
  const [notice, setNotice] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retryReady, setRetryReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [activeJobId, setActiveJobId] = useState("");
  const [windowDefaults] = useState(() => ({ start: localInput(new Date(Date.now() + 3600000).toISOString()), end: localInput(new Date(Date.now() + 8 * 86400000).toISOString()) }));
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  const posterPreviewUrl = useMemo(() => posterFile ? URL.createObjectURL(posterFile) : "", [posterFile]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl); }, [posterPreviewUrl]);
  useEffect(() => () => uploadController.current?.abort(), []);

  async function load() {
    const api = await createAuthenticatedApiClient("admin");
    const body = await api.request<{ campaigns: Row[] }>(
      "/api/admin/trending-campaigns",
    );
    setCampaigns(Array.isArray(body.campaigns) ? body.campaigns : []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load campaigns.")), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || editing) {
      const timer = window.setTimeout(() => setSalons([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void (async () => {
      const api = await createAuthenticatedApiClient("admin");
      const body = await api.request<{ salons: Row[] }>(
        `/api/admin/trending-campaigns?mode=salons&q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      setSalons(Array.isArray(body.salons) ? body.salons : []);
    })().catch(()=>undefined), 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [editing, query]);

  function resetMedia() {
    setFile(null);
    setPosterFile(null);
    setSourceDuration(0);
    setNeedsServerPipeline(false);
    setTrimStart(0);
    setTrimEnd(0);
    setPosterTime(0);
    setProgress(0);
    setMediaError("");
  }

  async function selectVideo(next: File | null) {
    resetMedia();
    setRetryReady(false);
    if (!next) return;
    setFile(next);
    setNotice("Reading video details…");
    try {
      const duration = await getVideoDuration(next);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("This file does not contain a usable video.");
      setSourceDuration(duration);
      setTrimStart(0);
      setTrimEnd(Math.min(duration, 30));
      setPosterTime(Math.max(0, Math.min(duration / 3, Math.min(duration, 30) - 0.05)));
      setNotice(duration > 30.5 ? "Choose a trim range of 30 seconds or less, then choose a poster frame." : "Preview the clip and choose a poster frame before saving.");
    } catch (error) {
      const ordinaryVideo =
        next.size <= 100 * 1024 * 1024 &&
        (/\.(mp4|webm|mov|m4v|mkv)$/i.test(next.name) ||
          [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-m4v",
            "video/x-matroska",
          ].includes(next.type));
      if (!ordinaryVideo) {
        setFile(null);
        const message =
          error instanceof Error ? error.message : "Unable to read this video.";
        setMediaError(message);
        setNotice(message);
        return;
      }
      setNeedsServerPipeline(true);
      setTrimStart(0);
      setTrimEnd(30);
      setPosterTime(0);
      setMediaError("");
      setNotice(
        "This MP4 needs secure server preparation. It will be inspected and converted to H.264/AAC automatically after upload.",
      );
    }
  }

  function dropVideo(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (busy) return;
    const next = Array.from(event.dataTransfer.files).find((candidate) => candidate.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(candidate.name));
    if (!next) {
      setNotice("Drop an MP4, WebM, MOV, M4V, or MKV video file.");
      return;
    }
    void selectVideo(next);
  }

  async function capturePoster() {
    if (!file) return;
    setBusy(true);
    setNotice("Creating poster frame…");
    try {
      const frame = await createVideoPoster(file, posterTime);
      setPosterFile(frame);
      setNotice(`Poster frame selected at ${posterTime.toFixed(1)} seconds.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create the poster frame.");
    } finally {
      setBusy(false);
    }
  }

  function updatePosterTime(value: number) {
    const start = Number(trimStart || 0);
    const end = Number(trimEnd || sourceDuration);
    const bounded = Math.max(start, Math.min(end, value));
    setPosterTime(bounded);
    if (previewRef.current) previewRef.current.currentTime = bounded;
  }

  async function cancelActiveUpload() {
    const jobId = activeJobId;
    uploadController.current?.abort();
    if (!jobId) return;
    try {
      const api = await createAuthenticatedApiClient("admin");
      await api.request("/api/admin/media/video-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id: jobId }),
      });
      setNotice(
        "Video processing cancelled. The original is retained temporarily for safe cleanup.",
      );
    } catch {
      setNotice(
        "The browser stopped waiting. Check the processing job before retrying.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const salonId = editing?.salon_id || selectedSalon?.id;
    if (!salonId) { setNotice("Search for and select an eligible salon."); return; }
    if (!editing && !file) { setNotice("Choose a video to upload."); return; }
    if (file && !needsServerPipeline && (trimStart === "" || trimEnd === "" || Number(trimEnd) - Number(trimStart) <= 0 || Number(trimEnd) - Number(trimStart) > 30.5)) { setNotice("Choose a trim range between 0.1 and 30 seconds."); return; }
    const requestedStatus=String(form.get("status")||"Draft");
    const placementBasis=String(form.get("placement_basis")||"paid");
    const reason=String(form.get("reason")||"").trim();
    if (["Scheduled","Active"].includes(requestedStatus) && placementBasis === "paid" && (!String(form.get("entitlement_source")||"") || !String(form.get("entitlement_reference")||"").trim())) { setNotice("Choose a required funding source and enter its verified Stripe or platform-credit reference before scheduling this campaign."); return; }
    if (placementBasis === "complimentary_admin" && reason.length < 5) { setNotice("Enter an internal reason of at least 5 characters for a complimentary placement."); return; }
    setBusy(true);
    setUploading(true);
    setRetryReady(false);
    setProgress(8);
    const controller = new AbortController();
    uploadController.current = controller;
    setNotice("Validating and optimizing video…");
    let uploadedPath = "";
    let uploadedPosterPath = "";
    let processingJobId = "";
    try {
      const api = await createAuthenticatedApiClient("admin");
      let video = {
        video_url: editing?.video_url,
        storage_path: editing?.storage_path,
        thumbnail_url: editing?.thumbnail_url,
        duration_seconds: editing?.duration_seconds,
        file_size_bytes: editing?.file_size_bytes,
        mime_type: editing?.mime_type,
      };
      if (file) {
        const session = await getValidSessionForScope("admin");
        if (!session) throw new Error("Your admin session has expired. Sign in and try again.");
        if (session.user.id !== api.actingUserId) {
          throw new Error(
            "The signed-in admin account changed during this upload. Start again.",
          );
        }
        if (needsServerPipeline) {
          setProgress(18);
          setNotice("Uploading the original MP4 for secure inspection…");
          uploadedPath = `incoming/${session.user.id}/${Date.now()}-${crypto.randomUUID()}.${sourceVideoExtension(file)}`;
          await uploadTrendingFile(uploadedPath, file, {
            accessToken: session.access_token,
            signal: controller.signal,
            onProgress: (value) => setProgress(18 + Math.round(value * .42)),
          });
          setProgress(62);
          setNotice("Inspecting codecs and preparing a browser-safe MP4…");
          const creationBody = await api.request<{
            job?: VideoProcessingJob;
          }>("/api/admin/media/video-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create",
              salon_id: salonId,
              source_path: uploadedPath,
              mime_type: sourceVideoMime(file),
              file_size_bytes: file.size,
            }),
            signal: controller.signal,
          });
          processingJobId = String(creationBody.job?.id || "");
          if (!processingJobId)
            throw new Error("The video processing job was not created.");
          setActiveJobId(processingJobId);
          const processingBody = await api.request<{
              job?: VideoProcessingJob;
            }>("/api/admin/media/video-jobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "process",
                id: processingJobId,
              }),
              signal: controller.signal,
            });
          const submittedJob = processingBody.job;
          const job = submittedJob?.status === "Ready" && submittedJob.output_url
            ? submittedJob
            : await pollVideoJobUntilReady({
                jobId: processingJobId,
                signal: controller.signal,
                maxAttempts: 80,
                intervalMs: 1_500,
                onUpdate: (current) => {
                  setProgress(62 + Math.round(Number(current.progress_percent || 0) * 0.2));
                  setNotice(
                    current.status === "Transcoding"
                      ? "Cloudinary accepted the upload. Creating the browser-safe video and poster…"
                      : current.status === "Inspecting"
                        ? "Inspecting video and audio tracks…"
                        : `Video processing: ${current.status}.`,
                  );
                },
                getJob: async () => {
                  const body = await api.request<{ jobs?: VideoProcessingJob[] }>(
                    `/api/admin/media/video-jobs?id=${encodeURIComponent(processingJobId)}&recover=1`,
                    { signal: controller.signal },
                  );
                  return Array.isArray(body.jobs) ? body.jobs[0] || null : null;
                },
              });
          if (job?.status !== "Ready" || !job.output_url)
            throw new Error("Video preparation did not finish. Retry the upload.");
          video = {
            video_url: job.output_url,
            storage_path: job.output_path || uploadedPath,
            thumbnail_url: job.poster_url || null,
            duration_seconds: job.duration_seconds || 30,
            file_size_bytes: job.output_size_bytes || Math.min(file.size, 25 * 1024 * 1024),
            mime_type: "video/mp4",
          };
        } else {
          const optimized = await optimizeTrendingVideo(file, { startSeconds: Number(trimStart), endSeconds: Number(trimEnd), signal: controller.signal });
          if (controller.signal.aborted) throw new DOMException("Upload cancelled.", "AbortError");
          setProgress(24);
          setNotice("Uploading optimized video…");
          uploadedPath = `campaigns/${salonId}/${Date.now()}-${crypto.randomUUID()}.${optimized.file.type === "video/webm" ? "webm" : "mp4"}`;
          await uploadTrendingFile(uploadedPath, optimized.file, { accessToken: session.access_token, signal: controller.signal, onProgress: (value) => setProgress(24 + Math.round(value * .44)) });
          const { data } = adminSupabase.storage.from("trending-videos").getPublicUrl(uploadedPath);
          setProgress(68);
          setNotice("Uploading poster frame…");
          const selectedPoster = posterFile || await createVideoPoster(file, posterTime);
          uploadedPosterPath = `campaigns/${salonId}/posters/${Date.now()}-${crypto.randomUUID()}.jpg`;
          await uploadTrendingFile(uploadedPosterPath, selectedPoster, { accessToken: session.access_token, signal: controller.signal, onProgress: (value) => setProgress(68 + Math.round(value * .16)) });
          const poster = adminSupabase.storage.from("trending-videos").getPublicUrl(uploadedPosterPath);
          video = { video_url: data.publicUrl, storage_path: uploadedPath, thumbnail_url: poster.data.publicUrl, duration_seconds: optimized.duration, file_size_bytes: optimized.file.size, mime_type: optimized.file.type };
        }
      }
      setProgress(84);
      setNotice("Saving the governed campaign record…");
      const payload = {
        action: "save", id: editing?.id || null, salon_id: salonId, ...video,
        video_processing_job_id: processingJobId || editing?.video_processing_job_id || null,
        description: form.get("description"), status: form.get("status"), starts_at: form.get("starts_at"), ends_at: form.get("ends_at"), timezone: form.get("timezone"),
        radius_miles: form.get("radius"), priority: form.get("priority"), rotation_weight: form.get("weight"), internal_note: form.get("note"),
        placement_basis: placementBasis,
        entitlement_source: form.get("entitlement_source"), entitlement_reference: form.get("entitlement_reference"), entitlement_amount_minor: form.get("amount") ? Math.round(Number(form.get("amount")) * 100) : null,
        reason,
      };
      await api.request("/api/admin/trending-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (file && editing?.storage_path && editing.storage_path !== uploadedPath) await adminSupabase.storage.from("trending-videos").remove([editing.storage_path]);
      const oldPoster = storedPosterPath(editing?.thumbnail_url);
      if (file && oldPoster && oldPoster.startsWith(`campaigns/${salonId}/posters/`) && oldPoster !== uploadedPosterPath) await adminSupabase.storage.from("trending-videos").remove([oldPoster]);
      await load();
      setEditing(null);
      setSelectedSalon(null);
      setQuery("");
      resetMedia();
      formElement.reset();
      setProgress(100);
      setNotice("Trending campaign saved. New or replaced videos require moderation approval.");
    } catch (error) {
      const paths = [
        processingJobId ? "" : uploadedPath,
        uploadedPosterPath,
      ].filter(Boolean);
      if (paths.length) await adminSupabase.storage.from("trending-videos").remove(paths);
      setProgress(0);
      const wasCancelled = error instanceof DOMException && error.name === "AbortError";
      setRetryReady(!wasCancelled);
      setNotice(
        wasCancelled
          ? "Upload cancelled. The selected file was not saved."
          : scopedApiErrorMessage(
              error,
              "Unable to save campaign.",
              processingJobId || null,
            ),
      );
    } finally {
      uploadController.current = null;
      setActiveJobId("");
      setUploading(false);
      setBusy(false);
    }
  }

  async function moderate(campaign: Row, decision: string) {
    const reason = window.prompt(`${decision} reason:`)?.trim() || "";
    if (reason.length < 5) { setNotice("Enter a moderation reason of at least 5 characters."); return; }
    setBusy(true);
    try {
      const api = await createAuthenticatedApiClient("admin");
      await api.request("/api/admin/trending-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "moderate",
          id: campaign.id,
          decision,
          reason,
        }),
      });
      await load();
      setNotice(`Video ${decision.toLowerCase()} and audit recorded.`);
    } catch (error) { setNotice(scopedApiErrorMessage(error, "Unable to moderate video.", campaign.id)); }
    finally { setBusy(false); }
  }

  async function status(campaign: Row, next: string) {
    const reason = window.prompt(`Reason for ${next.toLowerCase()}:`)?.trim() || "";
    if (reason.length < 5) { setNotice("Enter a reason of at least 5 characters."); return; }
    const payload = { action: "save", id: campaign.id, salon_id: campaign.salon_id, video_url: campaign.video_url, storage_path: campaign.storage_path, thumbnail_url: campaign.thumbnail_url, description: campaign.description, duration_seconds: campaign.duration_seconds, file_size_bytes: campaign.file_size_bytes, mime_type: campaign.mime_type, status: next, starts_at: campaign.starts_at, ends_at: campaign.ends_at, timezone: campaign.timezone, radius_miles: campaign.radius_miles, priority: campaign.priority, rotation_weight: campaign.rotation_weight, internal_note: campaign.internal_note, placement_basis: campaign.placement_basis || "paid", reason };
    setBusy(true);
    try {
      const api = await createAuthenticatedApiClient("admin");
      await api.request("/api/admin/trending-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      setNotice(`Campaign ${next.toLowerCase()}.`);
    } catch (error) { setNotice(scopedApiErrorMessage(error, "Unable to change status.", campaign.id)); }
    finally { setBusy(false); }
  }

  const activePoster = posterPreviewUrl || (!file ? editing?.thumbnail_url : "");
  return <div className="space-y-5">
    {notice ? <p role="status" className="rounded-lg border border-magenta/20 bg-blush/50 p-3 text-xs text-plum">{notice}</p> : null}
    {progress > 0 ? <div className="rounded-lg border border-plum/10 bg-white p-3"><div className="flex justify-between text-[10px] font-bold text-plum"><span>Campaign upload</span><span>{progress}%</span></div><progress aria-label="Campaign upload progress" max="100" value={progress} className="mt-2 h-2 w-full accent-magenta" /></div> : null}
    <section className="rounded-[15px] border border-plum/10 bg-white p-5">
      <div className="flex items-center gap-3"><Film className="text-magenta" /><div><h2 className="font-serif text-2xl text-plum">Trending Picks campaigns</h2><p className="text-xs text-ink/55">Upload, trim where your browser supports it, choose a poster frame, preview, moderate, and schedule local placement.</p></div></div>
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative sm:col-span-2"><Label text="Eligible salon"><div className="relative"><Search className="absolute left-3 top-3.5 text-ink/40" size={15} /><input disabled={Boolean(editing)} value={editing?.salon?.name || query} onChange={(event) => { setQuery(event.target.value); setSelectedSalon(null); }} className="min-h-11 w-full rounded-lg border border-plum/15 pl-9 text-xs" placeholder="Search salons" /></div></Label>{salons.length && !selectedSalon ? <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white p-1 shadow-xl">{salons.map((salon) => <button type="button" key={salon.id} onClick={() => { setSelectedSalon(salon); setQuery(salon.name); setSalons([]); }} className="block w-full rounded p-3 text-left text-xs hover:bg-blush"><b>{salon.name}</b> · {salon.address_city}, {salon.address_state}</button>)}</div> : null}</div>
        <label onDragOver={(event) => event.preventDefault()} onDrop={dropVideo} className="block rounded-lg border border-dashed border-magenta/40 bg-blush/20 p-3 text-[10px] font-bold transition-colors hover:bg-blush/40 focus-within:ring-2 focus-within:ring-magenta"><span>{editing ? "Replacement video (optional; resets moderation)" : "Video (MP4/WebM/MOV/M4V/MKV, final clip ≤30 sec)"}</span><span className="mt-1 block font-normal text-ink/55">Drag and drop, or choose a file. Browser-incompatible tracks are prepared automatically when the media provider is configured.</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska,.mp4,.webm,.mov,.m4v,.mkv" required={!editing} onChange={(event) => void selectVideo(event.target.files?.[0] || null)} className="mt-2 min-h-11 w-full rounded-lg border bg-white p-2 text-xs" /></label>
        <Field name="description" label="Description" defaultValue={editing?.description} />
        {mediaError?<p role="alert" className="rounded-lg bg-red-50 p-3 text-[10px] leading-4 text-red-700 sm:col-span-2 xl:col-span-4">{mediaError}</p>:null}
        {file && needsServerPipeline ? <div className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-xs text-plum sm:col-span-2 xl:col-span-4"><b>Automatic browser-safe conversion</b><p className="mt-1 text-ink/65">The original is inspected after upload. Incompatible video or audio tracks are converted to H.264/AAC MP4 and a poster frame is generated by the configured secure media processor. If processing fails, the original is retained temporarily for retry.</p></div> : null}
        {file && previewUrl && !needsServerPipeline ? <div className="space-y-3 rounded-xl border border-plum/10 bg-cream p-3 sm:col-span-2 xl:col-span-4">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <video ref={previewRef} src={previewUrl} controls playsInline preload="metadata" poster={activePoster || undefined} className="aspect-video w-full rounded-lg bg-ink object-contain" />
            <div className="space-y-3">
              <div><b className="text-xs text-plum">Trim and placement preview</b><p className="mt-1 text-[10px] leading-4 text-ink/55">Source {sourceDuration.toFixed(1)} sec. Final clips must be 30 seconds or less. Trimming uses the browser’s safe MediaRecorder support and will explain when the browser cannot perform it.</p></div>
              <div className="grid grid-cols-2 gap-2"><Field name="trim_start_preview" label="Trim start (sec)" type="number" min="0" max={String(Math.max(0, sourceDuration - 0.1))} step="0.1" value={trimStart} onValue={(value) => { setTrimStart(value); if (value !== "" && posterTime < value) updatePosterTime(value); }} /><Field name="trim_end_preview" label="Trim end (sec)" type="number" min="0.1" max={String(sourceDuration)} step="0.1" value={trimEnd} onValue={(value) => { setTrimEnd(value); if (value !== "" && posterTime > value) updatePosterTime(value); }} /></div>
              <Label text={`Poster frame (${posterTime.toFixed(1)} sec)`}><input aria-label="Poster frame time" type="range" min={Number(trimStart || 0)} max={Math.max(Number(trimStart || 0) + 0.05, Number(trimEnd || sourceDuration))} step="0.1" value={posterTime} onChange={(event) => updatePosterTime(Number(event.target.value))} className="w-full accent-magenta" /></Label>
              <button type="button" disabled={busy} onClick={() => void capturePoster()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-magenta font-bold text-magenta"><ImageIcon size={15} />Choose current frame</button>
              {activePoster ? <div><p className="mb-1 text-[10px] font-bold text-plum">Selected public poster</p><Image unoptimized width={640} height={360} src={activePoster} alt="Selected campaign poster preview" className="aspect-video w-full rounded-lg border border-plum/10 object-cover" /></div> : <p className="rounded-lg bg-blush/50 p-3 text-[10px] text-ink/60">Choose a frame or the selected frame will be generated automatically when you save.</p>}
            </div>
          </div>
        </div> : null}
        <Field name="starts_at" label="Start" type="datetime-local" defaultValue={editing ? localInput(editing.starts_at) : windowDefaults.start} />
        <Field name="ends_at" label="End" type="datetime-local" defaultValue={editing ? localInput(editing.ends_at) : windowDefaults.end} />
        <Field name="timezone" label="Timezone" defaultValue={editing?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} />
        <Select name="status" label="Status" defaultValue={editing?.status || "Draft"} options={["Draft", "Scheduled", "Active", "Paused", "Expired"]} />
        <Select name="placement_basis" label="Placement basis" defaultValue={editing?.placement_basis || "paid"} options={["paid", "complimentary_admin"]} />
        <Field name="radius" label="Radius miles" type="number" min="1" max="250" defaultValue={editing?.radius_miles || 25} />
        <Field name="priority" label="Priority" type="number" min="0" max="100" defaultValue={editing?.priority ?? 50} />
        <Field name="weight" label="Rotation weight" type="number" min="0.1" max="100" step="0.1" defaultValue={editing?.rotation_weight || 1} />
        <Select name="entitlement_source" label="Required funding source for Scheduled / Active" defaultValue="" options={["", "stripe_payment", "verified_invoice", "platform_credit"]} />
        <Field name="entitlement_reference" label="Required verified payment / credit reference" placeholder={editing?.entitlement?.external_reference || "pi_, in_, or approved platform-credit reference"} />
        <Field name="amount" label="Amount USD" type="number" min="0" step="0.01" />
        <Field name="note" label="Internal note" defaultValue={editing?.internal_note} />
        <Field name="reason" label="Internal reason (required for complimentary or edits)" />
        <div className="flex items-end gap-2 xl:col-span-2"><button disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Upload size={14} />{busy ? "Saving…" : retryReady ? "Retry upload" : editing ? "Save audited changes" : "Upload draft campaign"}</button>{uploading ? <button type="button" onClick={() => void cancelActiveUpload()} className="min-h-11 rounded-lg border border-red-300 px-4 text-xs font-bold text-red-700">Cancel upload</button> : editing ? <button type="button" onClick={() => { setEditing(null); resetMedia(); }} className="min-h-11 rounded-lg border px-4 text-xs font-bold">Cancel</button> : null}</div>
      </form>
    </section>
    <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{campaigns.map((campaign) => <article key={campaign.id} className="overflow-hidden rounded-[15px] border border-plum/10 bg-white"><video src={campaign.video_url} controls playsInline preload="metadata" poster={campaign.thumbnail_url || undefined} className="aspect-video w-full bg-ink object-cover" /><div className="p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-lg text-plum">{campaign.salon?.name}</h3><Badge value={campaign.status} /><Badge value={campaign.moderation_status} /></div><p className="mt-2 line-clamp-2 text-xs text-ink/65">{campaign.description}</p><p className="mt-2 text-[10px] text-ink/50">{campaign.radius_miles} mi · priority {campaign.priority} · {new Date(campaign.starts_at).toLocaleString()} → {new Date(campaign.ends_at).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { setEditing(campaign); resetMedia(); }} className="min-h-10 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta">Edit</button>{campaign.moderation_status !== "Approved" ? <button disabled={busy} onClick={() => void moderate(campaign, "Approved")} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-green-700 px-3 text-[10px] font-bold text-white"><CheckCircle2 size={13} />Approve</button> : null}{campaign.moderation_status !== "Rejected" ? <button disabled={busy} onClick={() => void moderate(campaign, "Rejected")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-300 px-3 text-[10px] font-bold text-red-700"><XCircle size={13} />Reject</button> : null}{campaign.status === "Active" ? <button onClick={() => void status(campaign, "Paused")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-[10px] font-bold"><Pause size={13} />Pause</button> : campaign.status === "Paused" ? <button onClick={() => void status(campaign, "Active")} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-plum px-3 text-[10px] font-bold text-white"><Play size={13} />Resume</button> : null}{campaign.status !== "Expired" ? <button disabled={busy} onClick={() => void status(campaign, "Expired")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-plum/20 px-3 text-[10px] font-bold text-plum"><Archive size={13} />Archive</button> : null}</div>{campaign.audit?.length ? <details className="mt-3 text-[10px]"><summary className="font-bold text-magenta">Audit history ({campaign.audit.length})</summary>{[...campaign.audit].sort((a: Row, b: Row) => String(b.created_at).localeCompare(String(a.created_at))).map((entry: Row) => <p key={entry.id} className="mt-2 border-l-2 border-magenta pl-2"><b>{entry.action}</b> · {entry.reason || "Initial creation"}</p>)}</details> : null}</div></article>)}{!campaigns.length ? <p className="rounded-[15px] bg-white p-10 text-center text-xs text-ink/55 md:col-span-2 2xl:col-span-3">No Trending Picks campaigns yet.</p> : null}</section>
  </div>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="block text-[10px] font-bold">{text}<span className="mt-1 block">{children}</span></label>; }

function Field({ name, label, type = "text", defaultValue, placeholder, required = false, min, max, step, value, onValue }: { name: string; label: string; type?: string; defaultValue?: string | number; placeholder?: string; required?: boolean; min?: string; max?: string; step?: string; value?: NumericValue; onValue?: (value: NumericValue) => void }) {
  const numeric = type === "number";
  const decimals = String(step || "1").includes(".") ? String(step).split(".")[1].length : 0;
  return <Label text={label}>{numeric ? <NumericInput key={onValue ? undefined : `${name}-${defaultValue}`} name={name} integer={decimals === 0} decimalPlaces={decimals} required={required} defaultValue={onValue ? undefined : defaultValue} value={onValue ? value : undefined} onValueChange={onValue ? (draft) => onValue(draft === "" ? "" : Number(draft)) : undefined} placeholder={placeholder} min={min == null ? undefined : Number(min)} max={max == null ? undefined : Number(max)} className="min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" /> : <input key={`${name}-${defaultValue}`} name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} className="min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" />}</Label>;
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[] }) { return <Label text={label}><select key={`${name}-${defaultValue}`} name={name} defaultValue={defaultValue} className="min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs font-normal">{options.map((option) => <option value={option} key={option}>{option === "paid" ? "Paid / verified platform credit" : option === "complimentary_admin" ? "Complimentary admin placement" : option || "Attach later"}</option>)}</select></Label>; }
function Badge({ value }: { value: string }) { return <span className="rounded-full bg-blush px-2 py-1 text-[9px] font-bold text-plum">{value}</span>; }
