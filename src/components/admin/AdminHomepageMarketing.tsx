/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Film, Trash2, Upload } from "lucide-react";
import { adminSupabase, getSessionForScope } from "@/lib/supabase";

type Row = Record<string, any>;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 10 * 1024 * 1024;

async function videoDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Unable to read this video."));
      video.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

async function compressVideo(file: File) {
  if (file.size <= TARGET_BYTES) return file;
  const duration = await videoDuration(file);
  const video = document.createElement("video") as HTMLVideoElement & { captureStream?: () => MediaStream };
  if (typeof MediaRecorder === "undefined" || !video.captureStream) throw new Error("This browser cannot compress video. Export the clip under 10 MB, then upload it again.");
  const url = URL.createObjectURL(file);
  try {
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("Unable to prepare this video.")); });
    const stream = video.captureStream();
    const type = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_800_000, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const finished = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("Video compression failed.")); });
    recorder.start(500);
    await video.play();
    await new Promise<void>((resolve) => { video.onended = () => resolve(); window.setTimeout(resolve, Math.ceil(duration * 1000) + 1500); });
    if (recorder.state !== "inactive") recorder.stop();
    await finished;
    const blob = new Blob(chunks, { type: "video/webm" });
    if (!blob.size || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webm`, { type: "video/webm", lastModified: Date.now() });
  } finally { URL.revokeObjectURL(url); }
}

export default function AdminHomepageMarketing({ salons }: { salons: Row[] }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sections, setSections] = useState<Row[]>([]);
  const [videos, setVideos] = useState<Row[]>([]);
  const [slot, setSlot] = useState(1);
  const [salonId, setSalonId] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function headers() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required.");
    return { Authorization: `Bearer ${session.access_token}` };
  }
  async function load() {
    const response = await fetch("/api/admin/marketing", { headers: await headers(), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load homepage controls.");
    setSections(Array.isArray(body.sections) ? body.sections : []);
    setVideos(Array.isArray(body.videos) ? body.videos : []);
  }
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load homepage controls.")); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveSection(section: Row) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/marketing", { method: "POST", headers: { ...(await headers()), "Content-Type": "application/json" }, body: JSON.stringify({ kind: "section", ...section }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save section.");
      setSections((current) => current.map((row) => row.section_key === body.section.section_key ? body.section : row));
      setNotice("Homepage section saved. The public homepage will use this setting on reload.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save section."); } finally { setBusy(false); }
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || !salonId || !description.trim()) { setNotice("Choose a video and salon, then enter a short description."); return; }
    setBusy(true); setNotice("Validating and optimizing video…");
    let path = "";
    try {
      if (!["video/mp4", "video/webm"].includes(file.type)) throw new Error("Upload an MP4 or WebM video.");
      const initialDuration = await videoDuration(file);
      if (!(initialDuration > 0 && initialDuration <= 30.5)) throw new Error("Trending videos must be 30 seconds or shorter.");
      const processed = await compressVideo(file);
      if (processed.size > MAX_UPLOAD_BYTES) throw new Error("The optimized video is still over 25 MB. Export a shorter or lower-resolution clip.");
      const finalDuration = await videoDuration(processed);
      path = `homepage/slot-${slot}/${Date.now()}-${crypto.randomUUID()}.${processed.type === "video/webm" ? "webm" : "mp4"}`;
      const { error: uploadError } = await adminSupabase.storage.from("trending-videos").upload(path, processed, { cacheControl: "31536000", contentType: processed.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = adminSupabase.storage.from("trending-videos").getPublicUrl(path);
      const response = await fetch("/api/admin/marketing", { method: "POST", headers: { ...(await headers()), "Content-Type": "application/json" }, body: JSON.stringify({ kind: "video", slot, salon_id: salonId, description, video_url: data.publicUrl, storage_path: path, duration_seconds: finalDuration, file_size_bytes: processed.size, mime_type: processed.type }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to save video card.");
      await load();
      setFile(null); setDescription(""); if (inputRef.current) inputRef.current.value = "";
      setNotice(`Slot ${slot} is staged. Turn on Trending Now when all cards are ready.`);
    } catch (error) {
      if (path) await adminSupabase.storage.from("trending-videos").remove([path]);
      setNotice(error instanceof Error ? error.message : "Unable to upload video.");
    } finally { setBusy(false); }
  }

  async function remove(slotNumber: number) {
    setBusy(true);
    try { const response = await fetch(`/api/admin/marketing?slot=${slotNumber}`, { method: "DELETE", headers: await headers() }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to remove video."); await load(); setNotice(`Slot ${slotNumber} cleared.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Unable to remove video."); } finally { setBusy(false); }
  }

  return <div className="space-y-5"><section className="rounded-[14px] border border-plum/10 bg-white p-5"><div className="flex items-center gap-3"><Eye className="text-magenta" /><div><h2 className="font-serif text-2xl text-plum">Homepage Rows</h2><p className="text-xs text-ink/55">Edit titles, visibility, and order without a code change.</p></div></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{sections.map((section) => <article key={section.section_key} className="rounded-[12px] border border-plum/10 bg-cream/35 p-4"><div className="grid gap-3 sm:grid-cols-[1fr_92px]"><label className="text-[10px] font-bold">Title<input value={section.title || ""} onChange={(event) => setSections((current) => current.map((row) => row.section_key === section.section_key ? { ...row, title: event.target.value } : row))} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" /></label><label className="text-[10px] font-bold">Order<input type="number" min="1" max="20" value={section.sort_order} onChange={(event) => setSections((current) => current.map((row) => row.section_key === section.section_key ? { ...row, sort_order: Number(event.target.value) } : row))} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" /></label></div><label className="mt-3 block text-[10px] font-bold">Description<input value={section.description || ""} onChange={(event) => setSections((current) => current.map((row) => row.section_key === section.section_key ? { ...row, description: event.target.value } : row))} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" /></label><div className="mt-3 flex items-center justify-between"><button type="button" onClick={() => setSections((current) => current.map((row) => row.section_key === section.section_key ? { ...row, is_visible: !row.is_visible } : row))} className={`flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-bold ${section.is_visible ? "bg-green-100 text-green-800" : "bg-blush text-plum"}`}>{section.is_visible ? <Eye size={14}/> : <EyeOff size={14}/>} {section.is_visible ? "Shown" : "Hidden"}</button><button type="button" disabled={busy} onClick={() => void saveSection(section)} className="rounded-lg bg-magenta px-4 py-2 text-[10px] font-bold text-white disabled:opacity-50">Save row</button></div></article>)}</div></section>
    <section className="rounded-[14px] border border-plum/10 bg-white p-5"><div className="flex items-center gap-3"><Film className="text-magenta" /><div><h2 className="font-serif text-2xl text-plum">Trending Now Videos</h2><p className="text-xs text-ink/55">Six vertical slots · maximum 30 seconds · MP4/WebM · optimized before upload.</p></div></div><form onSubmit={upload} className="mt-5 grid gap-3 lg:grid-cols-[100px_1fr_1fr]"><label className="text-[10px] font-bold">Card slot<select value={slot} onChange={(event) => setSlot(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal">{[1,2,3,4,5,6].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-[10px] font-bold">Linked salon<select value={salonId} onChange={(event) => setSalonId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"><option value="">Choose salon</option>{salons.map((salon) => <option key={salon.id} value={salon.id}>{salon.name}</option>)}</select></label><label className="text-[10px] font-bold">Video<input ref={inputRef} type="file" accept="video/mp4,video/webm" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white p-2 text-xs font-normal" /></label><label className="text-[10px] font-bold lg:col-span-3">Short description<input maxLength={180} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What customers are seeing in this clip" className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal" /></label><button disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-magenta font-bold text-white disabled:opacity-50 lg:col-span-3"><Upload size={16}/>{busy ? "Working…" : `Upload to slot ${slot}`}</button></form><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map((position) => { const video = videos.find((row) => row.slot === position); return <article key={position} className="overflow-hidden rounded-[12px] border border-plum/10 bg-cream/40">{video ? <><video src={video.video_url} controls preload="metadata" className="aspect-[9/12] w-full bg-black object-cover" /><div className="p-3"><b className="font-serif text-plum">Slot {position} · {video.salon?.name}</b><p className="mt-1 text-[10px] text-ink/60">{video.description}</p><button disabled={busy} onClick={() => void remove(position)} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-magenta"><Trash2 size={13}/>Clear slot</button></div></> : <div className="grid aspect-[9/12] place-items-center p-5 text-center text-xs text-ink/45">Slot {position}<br/>Not staged</div>}</article>; })}</div></section>{notice ? <p role="status" className="rounded-lg bg-blush/55 p-3 text-sm text-plum">{notice}</p> : null}</div>;
}
