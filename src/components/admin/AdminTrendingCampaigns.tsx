/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Film, ImageIcon, Pause, Play, Search, Upload, XCircle } from "lucide-react";
import { adminSupabase, getSessionForScope } from "@/lib/supabase";
import { createVideoPoster, getVideoDuration, optimizeTrendingVideo } from "@/lib/videoUploadClient";

type Row = Record<string, any>;

async function headers(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session has expired.");
  return { Authorization: `Bearer ${session.access_token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

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

export default function AdminTrendingCampaigns() {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [salons, setSalons] = useState<Row[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [posterTime, setPosterTime] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [windowDefaults] = useState(() => ({ start: localInput(new Date(Date.now() + 3600000).toISOString()), end: localInput(new Date(Date.now() + 8 * 86400000).toISOString()) }));
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  const posterPreviewUrl = useMemo(() => posterFile ? URL.createObjectURL(posterFile) : "", [posterFile]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => () => { if (posterPreviewUrl) URL.revokeObjectURL(posterPreviewUrl); }, [posterPreviewUrl]);

  async function load() {
    const response = await fetch("/api/admin/trending-campaigns", { headers: await headers(), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load campaigns.");
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
      const response = await fetch(`/api/admin/trending-campaigns?mode=salons&q=${encodeURIComponent(query)}`, { headers: await headers(), signal: controller.signal });
      const body = await response.json();
      if (response.ok) setSalons(Array.isArray(body.salons) ? body.salons : []);
    })().catch((error) => { if (error.name !== "AbortError") console.error("Trending salon search failed", error); }), 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [editing, query]);

  function resetMedia() {
    setFile(null);
    setPosterFile(null);
    setSourceDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setPosterTime(0);
    setProgress(0);
  }

  async function selectVideo(next: File | null) {
    resetMedia();
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
      setFile(null);
      setNotice(error instanceof Error ? error.message : "Unable to read this video.");
    }
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
    const bounded = Math.max(trimStart, Math.min(trimEnd || sourceDuration, value));
    setPosterTime(bounded);
    if (previewRef.current) previewRef.current.currentTime = bounded;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const salonId = editing?.salon_id || selectedSalon?.id;
    if (!salonId) { setNotice("Search for and select an eligible salon."); return; }
    if (!editing && !file) { setNotice("Choose a video to upload."); return; }
    if (file && (trimEnd - trimStart <= 0 || trimEnd - trimStart > 30.5)) { setNotice("Choose a trim range between 0.1 and 30 seconds."); return; }
    setBusy(true);
    setProgress(8);
    setNotice("Validating and optimizing video…");
    let uploadedPath = "";
    let uploadedPosterPath = "";
    try {
      let video = {
        video_url: editing?.video_url,
        storage_path: editing?.storage_path,
        thumbnail_url: editing?.thumbnail_url,
        duration_seconds: editing?.duration_seconds,
        file_size_bytes: editing?.file_size_bytes,
        mime_type: editing?.mime_type,
      };
      if (file) {
        const optimized = await optimizeTrendingVideo(file, { startSeconds: trimStart, endSeconds: trimEnd });
        setProgress(36);
        setNotice("Uploading optimized video…");
        uploadedPath = `campaigns/${salonId}/${Date.now()}-${crypto.randomUUID()}.${optimized.file.type === "video/webm" ? "webm" : "mp4"}`;
        const { error } = await adminSupabase.storage.from("trending-videos").upload(uploadedPath, optimized.file, { cacheControl: "31536000", contentType: optimized.file.type, upsert: false });
        if (error) throw error;
        const { data } = adminSupabase.storage.from("trending-videos").getPublicUrl(uploadedPath);
        setProgress(68);
        setNotice("Uploading poster frame…");
        const selectedPoster = posterFile || await createVideoPoster(file, posterTime);
        uploadedPosterPath = `campaigns/${salonId}/posters/${Date.now()}-${crypto.randomUUID()}.jpg`;
        const posterUpload = await adminSupabase.storage.from("trending-videos").upload(uploadedPosterPath, selectedPoster, { cacheControl: "31536000", contentType: selectedPoster.type, upsert: false });
        if (posterUpload.error) throw posterUpload.error;
        const poster = adminSupabase.storage.from("trending-videos").getPublicUrl(uploadedPosterPath);
        video = { video_url: data.publicUrl, storage_path: uploadedPath, thumbnail_url: poster.data.publicUrl, duration_seconds: optimized.duration, file_size_bytes: optimized.file.size, mime_type: optimized.file.type };
      }
      setProgress(84);
      setNotice("Saving the governed campaign record…");
      const payload = {
        action: "save", id: editing?.id || null, salon_id: salonId, ...video,
        description: form.get("description"), status: form.get("status"), starts_at: form.get("starts_at"), ends_at: form.get("ends_at"), timezone: form.get("timezone"),
        radius_miles: form.get("radius"), priority: form.get("priority"), rotation_weight: form.get("weight"), internal_note: form.get("note"),
        entitlement_source: form.get("entitlement_source"), entitlement_reference: form.get("entitlement_reference"), entitlement_amount_minor: form.get("amount") ? Math.round(Number(form.get("amount")) * 100) : null,
        reason: form.get("reason"),
      };
      const response = await fetch("/api/admin/trending-campaigns", { method: "POST", headers: await headers(true), body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save campaign.");
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
      const paths = [uploadedPath, uploadedPosterPath].filter(Boolean);
      if (paths.length) await adminSupabase.storage.from("trending-videos").remove(paths);
      setProgress(0);
      setNotice(error instanceof Error ? error.message : "Unable to save campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function moderate(campaign: Row, decision: string) {
    const reason = window.prompt(`${decision} reason:`)?.trim() || "";
    if (reason.length < 5) { setNotice("Enter a moderation reason of at least 5 characters."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/trending-campaigns", { method: "POST", headers: await headers(true), body: JSON.stringify({ action: "moderate", id: campaign.id, decision, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to moderate video.");
      await load();
      setNotice(`Video ${decision.toLowerCase()} and audit recorded.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to moderate video."); }
    finally { setBusy(false); }
  }

  async function status(campaign: Row, next: string) {
    const reason = window.prompt(`Reason for ${next.toLowerCase()}:`)?.trim() || "";
    if (reason.length < 5) { setNotice("Enter a reason of at least 5 characters."); return; }
    const payload = { action: "save", id: campaign.id, salon_id: campaign.salon_id, video_url: campaign.video_url, storage_path: campaign.storage_path, thumbnail_url: campaign.thumbnail_url, description: campaign.description, duration_seconds: campaign.duration_seconds, file_size_bytes: campaign.file_size_bytes, mime_type: campaign.mime_type, status: next, starts_at: campaign.starts_at, ends_at: campaign.ends_at, timezone: campaign.timezone, radius_miles: campaign.radius_miles, priority: campaign.priority, rotation_weight: campaign.rotation_weight, internal_note: campaign.internal_note, reason };
    setBusy(true);
    try {
      const response = await fetch("/api/admin/trending-campaigns", { method: "POST", headers: await headers(true), body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to change status.");
      await load();
      setNotice(`Campaign ${next.toLowerCase()}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to change status."); }
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
        <Label text={editing ? "Replacement video (optional; resets moderation)" : "Video (MP4/WebM, final clip ≤30 sec)"}><input type="file" accept="video/mp4,video/webm" required={!editing} onChange={(event) => void selectVideo(event.target.files?.[0] || null)} className="min-h-11 w-full rounded-lg border p-2 text-xs" /></Label>
        <Field name="description" label="Description" defaultValue={editing?.description} />
        {file && previewUrl ? <div className="space-y-3 rounded-xl border border-plum/10 bg-cream p-3 sm:col-span-2 xl:col-span-4">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <video ref={previewRef} src={previewUrl} controls preload="metadata" poster={activePoster || undefined} className="aspect-video w-full rounded-lg bg-ink object-contain" />
            <div className="space-y-3">
              <div><b className="text-xs text-plum">Trim and placement preview</b><p className="mt-1 text-[10px] leading-4 text-ink/55">Source {sourceDuration.toFixed(1)} sec. Final clips must be 30 seconds or less. Trimming uses the browser’s safe MediaRecorder support and will explain when the browser cannot perform it.</p></div>
              <div className="grid grid-cols-2 gap-2"><Field name="trim_start_preview" label="Trim start (sec)" type="number" min="0" max={String(Math.max(0, sourceDuration - 0.1))} step="0.1" value={trimStart} onValue={(value) => { setTrimStart(value); if (posterTime < value) updatePosterTime(value); }} /><Field name="trim_end_preview" label="Trim end (sec)" type="number" min="0.1" max={String(sourceDuration)} step="0.1" value={trimEnd} onValue={(value) => { setTrimEnd(value); if (posterTime > value) updatePosterTime(value); }} /></div>
              <Label text={`Poster frame (${posterTime.toFixed(1)} sec)`}><input aria-label="Poster frame time" type="range" min={trimStart} max={Math.max(trimStart + 0.05, trimEnd || sourceDuration)} step="0.1" value={posterTime} onChange={(event) => updatePosterTime(Number(event.target.value))} className="w-full accent-magenta" /></Label>
              <button type="button" disabled={busy} onClick={() => void capturePoster()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-magenta font-bold text-magenta"><ImageIcon size={15} />Choose current frame</button>
              {activePoster ? <div><p className="mb-1 text-[10px] font-bold text-plum">Selected public poster</p><Image unoptimized width={640} height={360} src={activePoster} alt="Selected campaign poster preview" className="aspect-video w-full rounded-lg border border-plum/10 object-cover" /></div> : <p className="rounded-lg bg-blush/50 p-3 text-[10px] text-ink/60">Choose a frame or the selected frame will be generated automatically when you save.</p>}
            </div>
          </div>
        </div> : null}
        <Field name="starts_at" label="Start" type="datetime-local" defaultValue={editing ? localInput(editing.starts_at) : windowDefaults.start} />
        <Field name="ends_at" label="End" type="datetime-local" defaultValue={editing ? localInput(editing.ends_at) : windowDefaults.end} />
        <Field name="timezone" label="Timezone" defaultValue={editing?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} />
        <Select name="status" label="Status" defaultValue={editing?.status || "Draft"} options={["Draft", "Scheduled", "Active", "Paused", "Expired"]} />
        <Field name="radius" label="Radius miles" type="number" min="1" max="250" defaultValue={editing?.radius_miles || 25} />
        <Field name="priority" label="Priority" type="number" min="0" max="100" defaultValue={editing?.priority ?? 50} />
        <Field name="weight" label="Rotation weight" type="number" min="0.1" max="100" step="0.1" defaultValue={editing?.rotation_weight || 1} />
        <Select name="entitlement_source" label="Entitlement" defaultValue="" options={["", "stripe_payment", "verified_invoice", "platform_credit"]} />
        <Field name="entitlement_reference" label="Payment / credit reference" placeholder={editing?.entitlement?.external_reference || "Reference ID"} />
        <Field name="amount" label="Amount USD" type="number" min="0" step="0.01" />
        <Field name="note" label="Internal note" defaultValue={editing?.internal_note} />
        {editing ? <Field name="reason" label="Change reason" required /> : null}
        <div className="flex items-end gap-2 xl:col-span-2"><button disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Upload size={14} />{busy ? "Saving…" : editing ? "Save audited changes" : "Upload draft campaign"}</button>{editing ? <button type="button" onClick={() => { setEditing(null); resetMedia(); }} className="min-h-11 rounded-lg border px-4 text-xs font-bold">Cancel</button> : null}</div>
      </form>
    </section>
    <section className="grid gap-4 lg:grid-cols-2">{campaigns.map((campaign) => <article key={campaign.id} className="overflow-hidden rounded-[15px] border border-plum/10 bg-white"><video src={campaign.video_url} controls preload="metadata" poster={campaign.thumbnail_url || undefined} className="aspect-video w-full bg-ink object-cover" /><div className="p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-lg text-plum">{campaign.salon?.name}</h3><Badge value={campaign.status} /><Badge value={campaign.moderation_status} /></div><p className="mt-2 text-xs text-ink/65">{campaign.description}</p><p className="mt-2 text-[10px] text-ink/50">{campaign.radius_miles} mi · priority {campaign.priority} · {new Date(campaign.starts_at).toLocaleString()} → {new Date(campaign.ends_at).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { setEditing(campaign); resetMedia(); }} className="min-h-10 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta">Edit</button>{campaign.moderation_status !== "Approved" ? <button disabled={busy} onClick={() => void moderate(campaign, "Approved")} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-green-700 px-3 text-[10px] font-bold text-white"><CheckCircle2 size={13} />Approve</button> : null}{campaign.moderation_status !== "Rejected" ? <button disabled={busy} onClick={() => void moderate(campaign, "Rejected")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-300 px-3 text-[10px] font-bold text-red-700"><XCircle size={13} />Reject</button> : null}{campaign.status === "Active" ? <button onClick={() => void status(campaign, "Paused")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-[10px] font-bold"><Pause size={13} />Pause</button> : campaign.status === "Paused" ? <button onClick={() => void status(campaign, "Active")} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-plum px-3 text-[10px] font-bold text-white"><Play size={13} />Resume</button> : null}</div>{campaign.audit?.length ? <details className="mt-3 text-[10px]"><summary className="font-bold text-magenta">Audit history ({campaign.audit.length})</summary>{[...campaign.audit].sort((a: Row, b: Row) => String(b.created_at).localeCompare(String(a.created_at))).map((entry: Row) => <p key={entry.id} className="mt-2 border-l-2 border-magenta pl-2"><b>{entry.action}</b> · {entry.reason || "Initial creation"}</p>)}</details> : null}</div></article>)}{!campaigns.length ? <p className="rounded-[15px] bg-white p-10 text-center text-xs text-ink/55 lg:col-span-2">No Trending Picks campaigns yet.</p> : null}</section>
  </div>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="block text-[10px] font-bold">{text}<span className="mt-1 block">{children}</span></label>; }

function Field({ name, label, type = "text", defaultValue, placeholder, required = false, min, max, step, value, onValue }: { name: string; label: string; type?: string; defaultValue?: string | number; placeholder?: string; required?: boolean; min?: string; max?: string; step?: string; value?: number; onValue?: (value: number) => void }) {
  return <Label text={label}><input key={onValue ? undefined : `${name}-${defaultValue}`} name={name} type={type} required={required} defaultValue={onValue ? undefined : defaultValue} value={onValue ? value : undefined} onChange={onValue ? (event) => onValue(Number(event.target.value)) : undefined} placeholder={placeholder} min={min} max={max} step={step} className="min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" /></Label>;
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[] }) { return <Label text={label}><select key={`${name}-${defaultValue}`} name={name} defaultValue={defaultValue} className="min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs font-normal">{options.map((option) => <option value={option} key={option}>{option || "Attach later"}</option>)}</select></Label>; }
function Badge({ value }: { value: string }) { return <span className="rounded-full bg-blush px-2 py-1 text-[9px] font-bold text-plum">{value}</span>; }
