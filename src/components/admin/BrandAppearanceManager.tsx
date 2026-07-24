"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImageIcon, Monitor, RotateCcw, Save, Smartphone, Tablet, Upload } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Asset = {
  asset_key: string;
  display_name: string;
  guidance: string;
  allowed_mime_types: string[];
  min_width_px: number;
  min_height_px: number;
  max_bytes: number;
  draft_url?: string | null;
  draft_alt_text?: string | null;
  draft_focal_x?: number | null;
  draft_focal_y?: number | null;
  draft_width_px?: number | null;
  draft_height_px?: number | null;
  published_url?: string | null;
  published_alt_text?: string | null;
  published_version: number;
  published_at?: string | null;
};
type Version = {
  id: string;
  asset_key: string;
  version: number;
  action: string;
  public_url: string;
  created_at: string;
};

async function authHeaders() {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session expired.");
  return { Authorization: `Bearer ${session.access_token}` };
}

export default function BrandAppearanceManager() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedKey, setSelectedKey] = useState("primary_header_logo");
  const [altText, setAltText] = useState("Girlz Culture");
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = assets.find((asset) => asset.asset_key === selectedKey) || null;
  const assetVersions = useMemo(
    () => versions.filter((version) => version.asset_key === selectedKey),
    [selectedKey, versions],
  );

  async function load(preferred?: string) {
    const response = await fetch("/api/admin/engine/brand-assets", {
      headers: await authHeaders(),
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load brand assets.");
    const rows = Array.isArray(body.assets) ? body.assets as Asset[] : [];
    setAssets(rows);
    setVersions(Array.isArray(body.versions) ? body.versions : []);
    const key = preferred || selectedKey || rows[0]?.asset_key || "";
    const row = rows.find((asset) => asset.asset_key === key);
    if (row) {
      setSelectedKey(row.asset_key);
      setAltText(row.draft_alt_text || row.published_alt_text || "Girlz Culture");
      setFocalX(Number(row.draft_focal_x ?? 50));
      setFocalY(Number(row.draft_focal_y ?? 50));
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load Brand & Appearance."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(asset: Asset) {
    setSelectedKey(asset.asset_key);
    setAltText(asset.draft_alt_text || asset.published_alt_text || "Girlz Culture");
    setFocalX(Number(asset.draft_focal_x ?? 50));
    setFocalY(Number(asset.draft_focal_y ?? 50));
    setMessage("");
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File) || !file.size) {
      setMessage("Choose an image before uploading.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const data = new FormData();
      data.set("asset_key", selected.asset_key);
      data.set("file", file);
      data.set("alt_text", altText);
      data.set("focal_x", String(focalX));
      data.set("focal_y", String(focalY));
      const response = await fetch("/api/admin/engine/brand-assets", {
        method: "POST",
        headers: await authHeaders(),
        body: data,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to upload this image.");
      setMessage("Draft uploaded. Review every preview, then publish when ready.");
      event.currentTarget.reset();
      await load(selected.asset_key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload this image.");
    } finally {
      setBusy(false);
    }
  }

  async function action(kind: "save_position" | "publish" | "restore", targetVersion?: number) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/engine/brand-assets", {
        method: "PATCH",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind,
          asset_key: selected.asset_key,
          alt_text: altText,
          focal_x: focalX,
          focal_y: focalY,
          target_version: targetVersion,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to update this image.");
      setMessage(kind === "publish" ? "Published. New visits use the cache-busted brand version." : kind === "restore" ? `Version ${targetVersion} restored as the new live version.` : "Crop position and alt text saved to the draft.");
      await load(selected.asset_key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this image.");
    } finally {
      setBusy(false);
    }
  }

  const previewUrl = selected?.draft_url || selected?.published_url || "";
  return (
    <section className="rounded-[15px] border border-plum/10 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blush text-magenta"><ImageIcon size={21}/></span>
        <div><h3 className="font-serif text-2xl text-plum">Brand & Appearance</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">Upload platform identity assets, position each draft, preview responsive placements, publish without a code deploy, and restore prior versions.</p></div>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="space-y-2" aria-label="Brand placements">
          {assets.map((asset) => <button key={asset.asset_key} type="button" onClick={() => choose(asset)} className={`w-full rounded-xl border p-3 text-left ${asset.asset_key === selectedKey ? "border-magenta bg-blush/30" : "border-plum/10"}`}><span className="block text-xs font-bold text-plum">{asset.display_name}</span><span className="mt-1 block text-[9px] text-ink/50">{asset.published_version ? `Live version ${asset.published_version}` : "Not published"}</span></button>)}
        </nav>
        {selected ? <div className="min-w-0">
          <div className="rounded-xl bg-cream p-4 text-xs leading-5 text-ink/65"><b className="text-plum">{selected.guidance}</b><span className="mt-1 block">Minimum {selected.min_width_px} × {selected.min_height_px}px · Maximum {(selected.max_bytes / 1_048_576).toFixed(1)} MB · {selected.allowed_mime_types.join(", ")}</span>{selected.draft_width_px && selected.draft_height_px ? <span className="mt-1 block text-green-700">Current draft: {selected.draft_width_px} × {selected.draft_height_px}px</span> : null}</div>
          <form onSubmit={upload} className="mt-4 rounded-xl border border-dashed border-magenta/35 p-4">
            <label className="block text-xs font-bold">Upload a new draft<input name="file" type="file" required accept={selected.allowed_mime_types.join(",")} className="mt-2 block w-full rounded-lg border bg-white p-3 text-xs font-normal"/></label>
            <button disabled={busy} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white disabled:opacity-50"><Upload size={15}/>Upload draft</button>
          </form>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Preview icon={<Monitor/>} label="Desktop" width="100%" height={150} url={previewUrl} alt={altText} x={focalX} y={focalY}/>
            <Preview icon={<Tablet/>} label="Tablet" width="78%" height={150} url={previewUrl} alt={altText} x={focalX} y={focalY}/>
            <Preview icon={<Smartphone/>} label="Mobile" width="48%" height={150} url={previewUrl} alt={altText} x={focalX} y={focalY}/>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold">Alt text<input value={altText} maxLength={180} onChange={(event) => setAltText(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Horizontal position<input type="range" min="0" max="100" value={focalX} onChange={(event) => setFocalX(Number(event.target.value))} className="mt-3 w-full accent-magenta"/><span className="text-[9px] text-ink/45">{focalX}%</span></label><label className="text-xs font-bold">Vertical position<input type="range" min="0" max="100" value={focalY} onChange={(event) => setFocalY(Number(event.target.value))} className="mt-3 w-full accent-magenta"/><span className="text-[9px] text-ink/45">{focalY}%</span></label></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || !previewUrl} onClick={() => void action("save_position")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta disabled:opacity-40"><Save size={15}/>Save draft position</button><button type="button" disabled={busy || !selected.draft_url} onClick={() => void action("publish")} className="min-h-11 rounded-lg bg-plum px-5 text-xs font-bold text-white disabled:opacity-40">Publish this asset</button></div>
          {assetVersions.length ? <div className="mt-5"><h4 className="font-serif text-lg text-plum">Published history</h4><div className="mt-2 space-y-2">{assetVersions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-plum/10 p-3 text-xs"><span><b>Version {version.version}</b><span className="ml-2 text-ink/45">{version.action} · {new Date(version.created_at).toLocaleString()}</span></span><button type="button" disabled={busy || version.version === selected.published_version} onClick={() => void action("restore",version.version)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-[10px] font-bold text-plum disabled:opacity-35"><RotateCcw size={13}/>Restore</button></div>)}</div></div> : null}
          {message ? <p role="status" className="mt-4 rounded-lg bg-blush/45 p-3 text-xs text-plum">{message}</p> : null}
        </div> : <p className="rounded-xl border border-dashed p-6 text-xs text-ink/50">Brand placements will appear after the migration is applied.</p>}
      </div>
    </section>
  );
}

function Preview({ icon, label, width, height, url, alt, x, y }: { icon: React.ReactNode; label: string; width: string; height: number; url: string; alt: string; x: number; y: number }) {
  return <div className="rounded-xl border border-plum/10 p-3"><p className="flex items-center gap-2 text-[10px] font-bold text-plum">{icon}{label}</p><div style={{ width, height }} className="mx-auto mt-3 overflow-hidden rounded-lg bg-[linear-gradient(135deg,#fbf4ee,#f3d9e4)]">{url ? <img src={url} alt={alt} className="h-full w-full object-contain" style={{ objectPosition: `${x}% ${y}%` }}/> : <span className="grid h-full place-items-center text-[10px] text-ink/40">Upload a draft</span>}</div></div>;
}
