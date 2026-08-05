/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CheckCircle2, Film, Pause, Play, Search, Upload, XCircle } from "lucide-react";
import { adminSupabase, getValidSessionForScope } from "@/lib/supabase";
import { canonicalVideoMime, getVideoDuration, optimizeTrendingVideo, uploadTrendingFile } from "@/lib/videoUploadClient";
import NumericInput from "@/components/forms/NumericInput";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import {
  pollVideoJobUntilReady,
  type VideoProcessingJob,
} from "@/lib/videoJobPollingCore";
import ActionToast from "@/components/ActionToast";
import {
  clearPendingTrendingVideoJob,
  loadPendingTrendingVideoJob,
  resumeOrCreateReadyVideoJob,
  savePendingTrendingVideoJob,
  type PendingTrendingVideoJob,
} from "@/lib/trendingVideoRetryCore";

type Row = Record<string, any>;
type NumericValue = number | "";

function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function sourceVideoMime(file: File) {
  const canonical = canonicalVideoMime(file);
  if (canonical) return canonical;
  if (file.type === "video/quicktime" || file.type === "video/x-m4v" || file.type === "video/x-matroska") return file.type;
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

function campaignEntitlement(campaign: Row | null | undefined) {
  const related = campaign?.entitlement;
  if (Array.isArray(related)) return related[0] || null;
  return related && typeof related === "object" ? related : null;
}

export default function AdminTrendingCampaigns() {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [salons, setSalons] = useState<Row[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [needsServerPipeline, setNeedsServerPipeline] = useState(false);
  const [trimStart, setTrimStart] = useState<NumericValue>(0);
  const [trimEnd, setTrimEnd] = useState<NumericValue>(0);
  const [notice, setNotice] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retryReady, setRetryReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [activeJobId, setActiveJobId] = useState("");
  const [pendingJob, setPendingJob] = useState<PendingTrendingVideoJob | null>(null);
  const [windowDefaults] = useState(() => ({ start: localInput(new Date(Date.now() + 3600000).toISOString()), end: localInput(new Date(Date.now() + 8 * 86400000).toISOString()) }));
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  const pendingMatchesCurrent = Boolean(
    pendingJob &&
      pendingJob.salonId === String(editing?.salon_id || selectedSalon?.id || "") &&
      pendingJob.campaignId === (editing?.id ? String(editing.id) : null),
  );

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => uploadController.current?.abort(), []);
  useEffect(() => {
    const restored = loadPendingTrendingVideoJob(window.sessionStorage);
    if (!restored) return;
    const timer = window.setTimeout(() => {
      setPendingJob(restored);
      setSelectedSalon((current) => current || {
        id: restored.salonId,
        name: restored.salonName || "Previously selected salon",
      });
      setQuery(restored.salonName || "Previously selected salon");
      setRetryReady(true);
      setNotice(
        `Video job ${restored.jobId} is still available. Resume it without uploading the source again.`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function load() {
    const api = await createAuthenticatedApiClient("admin");
    const body = await api.request<{ campaigns: Row[] }>(
      "/api/admin/trending-campaigns",
    );
    const rows = Array.isArray(body.campaigns) ? body.campaigns : [];
    setCampaigns(rows);
    return rows;
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

  function rememberPendingJob(next: PendingTrendingVideoJob) {
    setPendingJob(next);
    savePendingTrendingVideoJob(window.sessionStorage, next);
  }

  function forgetPendingJob() {
    setPendingJob(null);
    clearPendingTrendingVideoJob(window.sessionStorage);
  }

  function resetMedia() {
    forgetPendingJob();
    setFile(null);
    setSourceDuration(0);
    setNeedsServerPipeline(false);
    setTrimStart(0);
    setTrimEnd(0);
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
      const providerPreparationRequired = !canonicalVideoMime(next);
      setNeedsServerPipeline(providerPreparationRequired);
      setNotice(
        providerPreparationRequired
            ? "This video will be converted to a browser-safe H.264/AAC MP4 automatically after upload."
          : duration > 30.5
            ? "Choose a trim range of 30 seconds or less before saving."
            : "Preview the clip before saving. A public poster is generated automatically.",
      );
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
      forgetPendingJob();
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
    const editingCampaignId = editing?.id ? String(editing.id) : null;
    const pendingForSelection = pendingMatchesCurrent ? pendingJob : null;
    const fail = (message: string) => { setMediaError(message); setNotice(message); };
    setMediaError("");
    if (!salonId) { fail("Search for and select an eligible salon."); return; }
    if (!editing && !file && !pendingForSelection) { fail("Choose a video to upload."); return; }
    if (file && !needsServerPipeline && (trimStart === "" || trimEnd === "" || Number(trimEnd) - Number(trimStart) <= 0 || Number(trimEnd) - Number(trimStart) > 30.5)) { fail("Choose a trim range between 0.1 and 30 seconds."); return; }
    const requestedStatus=String(form.get("status")||"Draft");
    const placementBasis=String(form.get("placement_basis")||"paid");
    const reason=String(form.get("reason")||"").trim();
    const existingEntitlement = campaignEntitlement(editing);
    const enteredEntitlementSource = String(form.get("entitlement_source") || "");
    const enteredEntitlementReference = String(form.get("entitlement_reference") || "").trim();
    const enteredAnyEntitlement = Boolean(enteredEntitlementSource || enteredEntitlementReference);
    if (enteredAnyEntitlement && (!enteredEntitlementSource || !enteredEntitlementReference)) { fail("Choose both a funding source and its verified payment, invoice, or platform-credit reference."); return; }
    const effectiveEntitlementSource = enteredAnyEntitlement ? enteredEntitlementSource : String(existingEntitlement?.source || "");
    const effectiveEntitlementReference = enteredAnyEntitlement ? enteredEntitlementReference : String(existingEntitlement?.external_reference || "");
    if (["Scheduled","Active"].includes(requestedStatus) && placementBasis === "paid" && (!effectiveEntitlementSource || !effectiveEntitlementReference)) { fail("This paid campaign has no verified funding evidence. Enter the payment, invoice, or platform-credit source and reference before scheduling it."); return; }
    if (placementBasis === "complimentary_admin" && reason.length < 5) { fail("Enter an internal reason of at least 5 characters for a complimentary placement."); return; }
    setBusy(true);
    setUploading(true);
    setRetryReady(false);
    setProgress(8);
    const controller = new AbortController();
    uploadController.current = controller;
    setNotice("Validating and optimizing video…");
    let uploadedPath = "";
    let processingJobId = pendingForSelection?.jobId || "";
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
      if (file || pendingForSelection) {
        let preparedSource = file;
        let preparedDuration = pendingForSelection?.sourceDuration || sourceDuration;
        let preparedSize = pendingForSelection?.sourceSize || file?.size || 0;
        let preparedMime = pendingForSelection?.sourceMime || (file ? sourceVideoMime(file) : "video/mp4");
        uploadedPath = pendingForSelection?.sourcePath || "";

        const inspectJob = async (jobId: string) => {
          setProgress(62);
          setActiveJobId(jobId);
          setNotice("Checking the existing video processing job…");
          const body = await api.request<{ jobs?: VideoProcessingJob[] }>(
            `/api/admin/media/video-jobs?id=${encodeURIComponent(jobId)}&recover=1`,
            { signal: controller.signal },
          );
          return Array.isArray(body.jobs) ? body.jobs[0] || null : null;
        };
        const startJob = async (jobId: string) => {
          const body = await api.request<{ job?: VideoProcessingJob }>(
            "/api/admin/media/video-jobs",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "process", id: jobId }),
              signal: controller.signal,
            },
          );
          if (!body.job) throw new Error(`Video job ${jobId} could not be started.`);
          return body.job;
        };
        const waitForJob = (jobId: string) => pollVideoJobUntilReady({
          jobId,
          signal: controller.signal,
          // Cloudinary also calls the authenticated server callback when eager
          // derivatives finish. Sparse fallback checks resume this exact job.
          maxAttempts: 10,
          intervalMs: 2_000,
          maxIntervalMs: 15_000,
          backoffFactor: 2,
          onUpdate: (current) => {
            setProgress(62 + Math.round(Number(current.progress_percent || 0) * 0.2));
            const recoveryMessage = String(current.recovery_message || "").trim();
            setNotice(
              recoveryMessage || (current.status === "Transcoding"
                ? "Cloudinary accepted the upload. Creating the browser-safe video and poster…"
                : current.status === "Inspecting"
                  ? "Inspecting video and audio tracks…"
                  : `Video processing: ${current.status}.`),
            );
          },
          getJob: () => inspectJob(jobId),
        });

        const result = await resumeOrCreateReadyVideoJob({
          pendingJobId: pendingForSelection?.jobId,
          inspect: inspectJob,
          create: async () => {
            // The existing job is explicitly Failed, Cancelled, or missing.
            // Only now may a replacement source upload and job be created.
            processingJobId = "";
            uploadedPath = "";
            forgetPendingJob();
            if (!file) {
              throw new Error(
                "The previous video job can no longer be resumed. Choose the source video again to create a replacement.",
              );
            }
            const session = await getValidSessionForScope("admin");
            if (!session) throw new Error("Your admin session has expired. Sign in and try again.");
            if (session.user.id !== api.actingUserId) {
              throw new Error(
                "The signed-in admin account changed during this upload. Start again.",
              );
            }
            preparedSource = file;
            preparedDuration = sourceDuration;
            if (!needsServerPipeline && sourceDuration > 30.5) {
              setProgress(12);
              setNotice("Preparing the selected 30-second clip…");
              const optimized = await optimizeTrendingVideo(file, {
                startSeconds: Number(trimStart),
                endSeconds: Number(trimEnd),
                signal: controller.signal,
              });
              preparedSource = optimized.file;
              preparedDuration = optimized.duration;
            }
            preparedSize = preparedSource.size;
            preparedMime = sourceVideoMime(preparedSource);
            setProgress(18);
            setNotice("Uploading the source video for secure inspection…");
            uploadedPath = `incoming/${session.user.id}/${Date.now()}-${crypto.randomUUID()}.${sourceVideoExtension(preparedSource)}`;
            await uploadTrendingFile(uploadedPath, preparedSource, {
              accessToken: session.access_token,
              signal: controller.signal,
              onProgress: (value) => setProgress(18 + Math.round(value * .42)),
            });
            setProgress(62);
            setNotice("Inspecting codecs and preparing a browser-safe MP4…");
            const creationBody = await api.request<{ job?: VideoProcessingJob }>(
              "/api/admin/media/video-jobs",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "create",
                  salon_id: salonId,
                  source_path: uploadedPath,
                  mime_type: preparedMime,
                  file_size_bytes: preparedSize,
                  duration_seconds: preparedDuration || null,
                }),
                signal: controller.signal,
              },
            );
            if (!creationBody.job) {
              throw new Error("The video processing job was not created.");
            }
            return creationBody.job;
          },
          start: startJob,
          waitUntilReady: waitForJob,
          onJobSelected: (jobId, created) => {
            processingJobId = jobId;
            setActiveJobId(jobId);
            if (!created) return;
            rememberPendingJob({
              jobId,
              salonId: String(salonId),
              campaignId: editingCampaignId,
              salonName: String(editing?.salon?.name || selectedSalon?.name || ""),
              sourcePath: uploadedPath,
              sourceMime: preparedMime,
              sourceSize: preparedSize,
              sourceDuration: preparedDuration,
              createdAt: Date.now(),
            });
          },
        });
        processingJobId = result.jobId;
        const job = result.job;
        if (job.status !== "Ready" || !job.output_url || !job.poster_url)
          throw new Error("Video preparation did not finish with both a public video and poster. Resume the existing job.");
        video = {
          video_url: job.output_url,
          storage_path: job.output_path || uploadedPath,
          thumbnail_url: job.poster_url,
          duration_seconds: job.duration_seconds || preparedDuration || 30,
          file_size_bytes: job.output_size_bytes || Math.min(preparedSize, 25 * 1024 * 1024),
          mime_type: job.detected_container === "webm" ? "video/webm" : "video/mp4",
        };
      }
      setProgress(84);
      setNotice("Saving the governed campaign record…");
      const payload = {
        action: "save", id: editing?.id || null, salon_id: salonId, ...video,
        video_processing_job_id: processingJobId || editing?.video_processing_job_id || null,
        description: form.get("description"), status: form.get("status"), starts_at: form.get("starts_at"), ends_at: form.get("ends_at"), timezone: form.get("timezone"),
        radius_miles: form.get("radius"), priority: form.get("priority"), rotation_weight: form.get("weight"), internal_note: form.get("note"),
        placement_basis: placementBasis,
        entitlement_source: ["Scheduled", "Active"].includes(requestedStatus) ? effectiveEntitlementSource : enteredEntitlementSource,
        entitlement_reference: ["Scheduled", "Active"].includes(requestedStatus) ? effectiveEntitlementReference : enteredEntitlementReference,
        entitlement_amount_minor: form.get("amount") ? Math.round(Number(form.get("amount")) * 100) : null,
        reason,
      };
      if (payload.mime_type === "application/octet-stream" || !payload.mime_type) {
        payload.mime_type = file ? sourceVideoMime(file) : payload.mime_type;
      }
      const saved = await api.request<{ campaign?: Row; campaign_id?: string }>("/api/admin/trending-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!saved.campaign?.id || saved.campaign.video_url !== video.video_url || saved.campaign.thumbnail_url !== video.thumbnail_url) {
        throw new Error("The campaign save could not be verified. The selected video remains available for retry.");
      }
      if (processingJobId && (
        saved.campaign.video_processing_job_id !== processingJobId ||
        saved.campaign.status !== "Draft"
      )) {
        throw new Error("The Ready video job was not attached to the saved Draft campaign.");
      }
      if (file && editing?.storage_path && editing.storage_path !== uploadedPath) await adminSupabase.storage.from("trending-videos").remove([editing.storage_path]);
      const reloaded = await load();
      const persisted = reloaded.find((campaign) => campaign.id === saved.campaign?.id);
      if (!persisted || persisted.video_url !== saved.campaign.video_url || persisted.storage_path !== saved.campaign.storage_path || persisted.thumbnail_url !== saved.campaign.thumbnail_url) {
        throw new Error("The campaign was saved but did not survive a fresh reload. Retry before publishing it.");
      }
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
      ].filter(Boolean);
      if (paths.length) await adminSupabase.storage.from("trending-videos").remove(paths);
      setProgress(0);
      const wasCancelled = error instanceof DOMException && error.name === "AbortError";
      setRetryReady(!wasCancelled);
      const message = wasCancelled
          ? "Upload cancelled. The selected file was not saved."
          : scopedApiErrorMessage(
              error,
              "Unable to save campaign.",
              processingJobId || null,
            );
      setMediaError(message);
      setNotice(message);
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
    const entitlement = campaignEntitlement(campaign);
    if (["Scheduled", "Active"].includes(next) && campaign.placement_basis !== "complimentary_admin" && (!entitlement?.source || !entitlement?.external_reference)) {
      setNotice("This paid campaign has no verified funding evidence. Edit it and enter the payment, invoice, or platform-credit source and reference before activation.");
      return;
    }
    const payload = { action: "save", id: campaign.id, salon_id: campaign.salon_id, video_url: campaign.video_url, storage_path: campaign.storage_path, thumbnail_url: campaign.thumbnail_url, description: campaign.description, duration_seconds: campaign.duration_seconds, file_size_bytes: campaign.file_size_bytes, mime_type: campaign.mime_type, video_processing_job_id: campaign.video_processing_job_id || null, status: next, starts_at: campaign.starts_at, ends_at: campaign.ends_at, timezone: campaign.timezone, radius_miles: campaign.radius_miles, priority: campaign.priority, rotation_weight: campaign.rotation_weight, internal_note: campaign.internal_note, placement_basis: campaign.placement_basis || "paid", entitlement_source: entitlement?.source || null, entitlement_reference: entitlement?.external_reference || null, reason };
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

  const activePoster = !file ? editing?.thumbnail_url : "";
  return <div className="space-y-5">
    <ActionToast message={notice} onDismiss={() => setNotice("")} />
    {progress > 0 ? <div className="rounded-lg border border-plum/10 bg-white p-3"><div className="flex justify-between text-[10px] font-bold text-plum"><span>Campaign upload</span><span>{progress}%</span></div><progress aria-label="Campaign upload progress" max="100" value={progress} className="mt-2 h-2 w-full accent-magenta" /></div> : null}
    <section className="rounded-[15px] border border-plum/10 bg-white p-5">
      <div className="flex items-center gap-3"><Film className="text-magenta" /><div><h2 className="font-serif text-2xl text-plum">Trending Picks campaigns</h2><p className="text-xs text-ink/55">Upload, trim where your browser supports it, preview, moderate, and schedule local placement. The media provider generates the public poster.</p></div></div>
      <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative sm:col-span-2"><Label text="Eligible salon"><div className="relative"><Search className="absolute left-3 top-3.5 text-ink/40" size={15} /><input disabled={Boolean(editing)} value={editing?.salon?.name || query} onChange={(event) => { setQuery(event.target.value); setSelectedSalon(null); }} className="min-h-11 w-full rounded-lg border border-plum/15 pl-9 text-xs" placeholder="Search salons" /></div></Label>{salons.length && !selectedSalon ? <div className="absolute z-20 mt-1 w-full rounded-lg border bg-white p-1 shadow-xl">{salons.map((salon) => <button type="button" key={salon.id} onClick={() => { setSelectedSalon(salon); setQuery(salon.name); setSalons([]); }} className="block w-full rounded p-3 text-left text-xs hover:bg-blush"><b>{salon.name}</b> · {salon.address_city}, {salon.address_state}</button>)}</div> : null}</div>
        <label onDragOver={(event) => event.preventDefault()} onDrop={dropVideo} className="block rounded-lg border border-dashed border-magenta/40 bg-blush/20 p-3 text-[10px] font-bold transition-colors hover:bg-blush/40 focus-within:ring-2 focus-within:ring-magenta"><span>{editing ? "Replacement video (optional; resets moderation)" : "Video (MP4/WebM/MOV/M4V/MKV, final clip ≤30 sec)"}</span><span className="mt-1 block font-normal text-ink/55">Drag and drop, or choose a file. Browser-incompatible tracks are prepared automatically when the media provider is configured.</span><input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska,.mp4,.webm,.mov,.m4v,.mkv" required={!editing && !pendingMatchesCurrent} onChange={(event) => void selectVideo(event.target.files?.[0] || null)} className="mt-2 min-h-11 w-full rounded-lg border bg-white p-2 text-xs" /></label>
        <Field name="description" label="Description" defaultValue={editing?.description} required />
        {mediaError?<p role="alert" className="rounded-lg bg-red-50 p-3 text-[10px] leading-4 text-red-700 sm:col-span-2 xl:col-span-4">{mediaError}</p>:null}
        {pendingMatchesCurrent && pendingJob ? <p className="rounded-lg border border-amber/30 bg-amber/10 p-3 text-[10px] leading-4 text-plum sm:col-span-2 xl:col-span-4">Resume video job <b>{pendingJob.jobId}</b>. Retrying checks this job first and does not upload the source again while it is still processing.</p> : null}
        {file && needsServerPipeline ? <div className="rounded-xl border border-amber/30 bg-amber/10 p-4 text-xs text-plum sm:col-span-2 xl:col-span-4"><b>Automatic browser-safe conversion</b><p className="mt-1 text-ink/65">The original is inspected after upload. Incompatible video or audio tracks are converted to H.264/AAC MP4 and a poster frame is generated by the configured secure media processor. If processing fails, the original is retained temporarily for retry.</p></div> : null}
        {file && previewUrl && !needsServerPipeline ? <div className="space-y-3 rounded-xl border border-plum/10 bg-cream p-3 sm:col-span-2 xl:col-span-4">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <video ref={previewRef} src={previewUrl} controls playsInline preload="metadata" poster={activePoster || undefined} className="aspect-video w-full rounded-lg bg-ink object-contain" />
            <div className="space-y-3">
              <div><b className="text-xs text-plum">Trim and placement preview</b><p className="mt-1 text-[10px] leading-4 text-ink/55">Source {sourceDuration.toFixed(1)} sec. Final clips must be 30 seconds or less. Trimming uses the browser’s safe MediaRecorder support and will explain when the browser cannot perform it.</p></div>
              <div className="grid grid-cols-2 gap-2"><Field name="trim_start_preview" label="Trim start (sec)" type="number" min="0" max={String(Math.max(0, sourceDuration - 0.1))} step="0.1" value={trimStart} onValue={setTrimStart} /><Field name="trim_end_preview" label="Trim end (sec)" type="number" min="0.1" max={String(sourceDuration)} step="0.1" value={trimEnd} onValue={setTrimEnd} /></div>
              <p className="rounded-lg bg-blush/50 p-3 text-[10px] leading-4 text-ink/60">The secure media provider generates and saves a public poster together with the Ready video. A campaign cannot be saved unless both are present.</p>
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
        <div className="flex items-end gap-2 xl:col-span-2"><button disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Upload size={14} />{busy ? "Saving…" : pendingMatchesCurrent ? "Resume processing" : retryReady ? "Retry upload" : editing ? "Save audited changes" : "Upload draft campaign"}</button>{uploading ? <button type="button" onClick={() => void cancelActiveUpload()} className="min-h-11 rounded-lg border border-red-300 px-4 text-xs font-bold text-red-700">Cancel upload</button> : editing ? <button type="button" onClick={() => { setEditing(null); resetMedia(); }} className="min-h-11 rounded-lg border px-4 text-xs font-bold">Cancel</button> : null}</div>
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
