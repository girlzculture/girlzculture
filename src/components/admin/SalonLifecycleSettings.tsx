"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Config = {
  version: number;
  auto_activation: boolean;
  loss_behavior: "needs_attention" | "hide_immediately" | "grace_period";
  grace_period_days: number | "";
  required: Record<string, boolean | number | "">;
};

const gateLabels: Array<[string, string]> = [
  ["application_approved", "Approved application and identity"],
  ["business_name", "Business name"],
  ["structured_address", "Complete US address"],
  ["precise_geocoding", "Verified coordinates"],
  ["logo", "Logo"],
  ["cover_photo", "Cover image"],
  ["business_details", "Description and contact details"],
  ["priced_service", "Priced service with duration"],
  ["active_stylist", "Active stylist or owner-stylist"],
  ["business_hours", "Business hours"],
  ["active_subscription", "Active subscription"],
  ["payout_account", "Connected payout account"],
  ["agreements", "Agreements and media permissions"],
];

export default function SalonLifecycleSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function request(method: "GET" | "PATCH", body?: Config) {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session has expired.");
    const response = await fetch("/api/admin/engine/lifecycle", {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load lifecycle controls.");
    setConfig(result.config);
    return result;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void request("GET").catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load lifecycle controls.")), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save() {
    if (!config) return;
    if (config.grace_period_days === "" || config.required.gallery_photos === "") { setMessage("Enter the gallery-photo requirement and grace-period days before saving."); return; }
    setSaving(true);
    setMessage("Saving and recalculating salons…");
    try {
      const result = await request("PATCH", config);
      setMessage(`Saved. ${result.reconciled} salon records recalculated${result.failures ? `; ${result.failures} require support review` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save lifecycle controls.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-[14px] border border-plum/10 bg-white/75 p-5 shadow-[0_8px_26px_rgba(26,18,32,.03)]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="font-serif text-xl font-semibold text-plum">Salon lifecycle engine</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-ink/60">These are the actual gates used to calculate setup progress and public eligibility. Saving recalculates every salon.</p></div>
      <span className="rounded-full bg-blush px-3 py-1 text-[10px] font-bold text-plum">Version {config?.version || "—"}</span>
    </div>
    {!config ? <div className="mt-5 flex items-center gap-2 text-sm text-ink/60"><RefreshCw className="animate-spin" size={16}/>Loading lifecycle rules…</div> : <>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {gateLabels.map(([key, label]) => <label key={key} className="flex min-h-12 items-center gap-3 rounded-xl border border-plum/10 bg-cream/50 p-3 text-xs font-semibold"><input type="checkbox" checked={config.required[key] === true} onChange={(event) => setConfig((current) => current ? { ...current, required: { ...current.required, [key]: event.target.checked } } : current)} className="accent-magenta"/>{label}</label>)}
        <label className="rounded-xl border border-plum/10 bg-cream/50 p-3 text-xs font-semibold">Required gallery photos<input type="number" inputMode="numeric" min="0" max="20" step="1" value={config.required.gallery_photos === undefined ? "" : String(config.required.gallery_photos)} onChange={(event) => setConfig({ ...config, required: { ...config.required, gallery_photos: event.target.value === "" ? "" : Number(event.target.value) } })} onKeyDown={(event)=>{if(/[eE+\-.]/.test(event.key))event.preventDefault()}} className="mt-2 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3"/></label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-3 rounded-xl border border-plum/10 p-3 text-xs font-semibold"><input type="checkbox" checked={config.auto_activation} onChange={(event) => setConfig({ ...config, auto_activation: event.target.checked })} className="accent-magenta"/>Automatically activate eligible salons</label>
        <label className="text-xs font-bold">If eligibility is lost<select value={config.loss_behavior} onChange={(event) => setConfig({ ...config, loss_behavior: event.target.value as Config["loss_behavior"] })} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3"><option value="needs_attention">Needs Attention + hide</option><option value="hide_immediately">Hide immediately</option><option value="grace_period">Grace period</option></select></label>
        <label className="text-xs font-bold">Grace period days<input type="number" inputMode="numeric" min="0" max="90" step="1" value={config.grace_period_days} onChange={(event) => setConfig({ ...config, grace_period_days: event.target.value === "" ? "" : Number(event.target.value) })} onKeyDown={(event)=>{if(/[eE+\-.]/.test(event.key))event.preventDefault()}} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3"/></label>
      </div>
      <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-6 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 size={16}/>{saving ? "Saving…" : "Save lifecycle rules"}</button>
    </>}
    {message ? <p role="status" className="mt-4 rounded-lg bg-blush/45 p-3 text-xs text-plum">{message}</p> : null}
  </section>;
}
