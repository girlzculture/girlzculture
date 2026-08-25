/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarClock,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, any>;
type Basis = "paid" | "platform_credit" | "complimentary_admin";
const statuses = ["Active", "Scheduled", "Draft", "Paused", "Expired", "Archived"] as const;
const defaultSettings = {
  empty_title: "Own a business? Get featured here.",
  empty_body: "Put your salon in front of nearby clients with a clearly labeled featured placement.",
  empty_href: "/partner",
};

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function newDraft() {
  return {
    id: "",
    salon_id: "",
    status: "Draft",
    starts_at: localDateTime(),
    ends_at: localDateTime(new Date(Date.now() + 30 * 86400000).toISOString()),
    indefinite: false,
    timezone: "America/New_York",
    radius_miles: 25,
    priority: 50,
    rotation_weight: 1,
    placement_basis: "complimentary_admin" as Basis,
    entitlement_source: "stripe_payment",
    entitlement_reference: "",
    entitlement_amount_minor: "",
    internal_note: "",
    optional_note: "",
  };
}
async function headers(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session has expired.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}
function campaignBasisLabel(row: Row) {
  if (row.placement_basis === "platform_credit") return "Platform credit";
  if (row.placement_basis === "complimentary_admin") return "Complimentary Admin placement";
  return row.entitlement?.source === "verified_invoice" ? "Verified invoice" : "Stripe payment";
}
function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Until I change it";
}

export default function AdminFeaturedCampaigns() {
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row>(defaultSettings);
  const [total, setTotal] = useState(0);
  const [canDelete, setCanDelete] = useState(false);
  const [tab, setTab] = useState("Active");
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<Row>(newDraft());
  const [salonQuery, setSalonQuery] = useState("");
  const [salons, setSalons] = useState<Row[]>([]);
  const [salonTotal, setSalonTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const params = new URLSearchParams({ page_size: "100" });
    if (tab !== "All") params.set("status", tab);
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/api/admin/featured-campaigns?${params}`, { headers: await headers(), cache: "no-store" });
    const body = await readApiResponse(response, "Unable to load campaigns.");
    if (!response.ok) throw new Error(String(body.error || "Unable to load campaigns."));
    setCampaigns(Array.isArray(body.campaigns) ? body.campaigns : []);
    setSettings(body.settings || defaultSettings);
    setTotal(Number(body.total || 0));
    setCanDelete(Boolean(body.can_delete));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load campaigns.")), 0);
    return () => window.clearTimeout(timer);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ mode: "salons", page_size: "100" });
      if (salonQuery.trim()) params.set("q", salonQuery.trim());
      headers()
        .then((requestHeaders) => fetch(`/api/admin/featured-campaigns?${params}`, { headers: requestHeaders, cache: "no-store" }))
        .then(async (response) => {
          const body = await readApiResponse(response, "Unable to load eligible salons.");
          if (!response.ok) throw new Error(String(body.error || "Unable to load eligible salons."));
          return body;
        })
        .then((body) => {
          if (!live) return;
          setSalons(Array.isArray(body.salons) ? body.salons : []);
          setSalonTotal(Number(body.total || 0));
        })
        .catch((error) => live && setNotice(error instanceof Error ? error.message : "Unable to load eligible salons."));
    }, salonQuery.trim() ? 220 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [salonQuery]);

  const selectedSalon = salons.find((row) => String(row.id) === String(form.salon_id)) || (form.salon ? form.salon : null);
  const groupedCounts = useMemo(() => statuses.reduce((result, status) => {
    result[status] = campaigns.filter((row) => row.status === status).length;
    return result;
  }, {} as Record<string, number>), [campaigns]);

  function openNew() {
    setForm(newDraft());
    setSalonQuery("");
    setEditorOpen(true);
    setNotice("");
  }
  function openEdit(campaign: Row, duplicate = false) {
    setForm({
      ...newDraft(),
      ...campaign,
      id: duplicate ? "" : campaign.id,
      salon_id: campaign.salon_id,
      starts_at: localDateTime(duplicate ? undefined : campaign.starts_at),
      ends_at: localDateTime(duplicate ? new Date(Date.now() + 30 * 86400000).toISOString() : campaign.ends_at || undefined),
      indefinite: campaign.ends_at == null,
      placement_basis: campaign.placement_basis || "paid",
      entitlement_source: campaign.entitlement?.source === "verified_invoice" ? "verified_invoice" : "stripe_payment",
      entitlement_reference: duplicate ? "" : campaign.entitlement?.external_reference || "",
      entitlement_amount_minor: duplicate ? "" : campaign.entitlement?.amount_minor ?? "",
      optional_note: "",
      salon: campaign.salon,
    });
    setSalonQuery(String(campaign.salon?.name || ""));
    setEditorOpen(true);
    setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.salon_id) { setNotice("Choose an eligible salon."); return; }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({ action: "save", ...form }),
      });
      const body = await readApiResponse(response, "Unable to save this Featured Salon campaign.");
      if (!response.ok) throw new Error(String(body.error || "Unable to save this Featured Salon campaign."));
      setNotice("Featured Salon campaign saved, audited, and published state revalidated.");
      setEditorOpen(false);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save this Featured Salon campaign.");
    } finally { setBusy(false); }
  }

  async function lifecycle(campaign: Row, action: string) {
    const destructive = action === "delete";
    if (destructive && !window.confirm(`Permanently remove ${campaign.salon?.name || "this campaign"} from operational campaign records? Its immutable audit tombstone will remain.`)) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/featured-campaigns", {
        method: "POST",
        headers: await headers(true),
        body: JSON.stringify({ action, id: campaign.id }),
      });
      const body = await readApiResponse(response, "Unable to update this campaign.");
      if (!response.ok) throw new Error(String(body.error || "Unable to update this campaign."));
      setNotice(action === "delete" ? "Campaign deleted from operational records; audit evidence was retained." : `Campaign ${action}d successfully.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update this campaign.");
    } finally { setBusy(false); }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/featured-campaigns", { method: "POST", headers: await headers(true), body: JSON.stringify({ action: "settings", ...settings }) });
      const body = await readApiResponse(response, "Unable to save section settings.");
      if (!response.ok) throw new Error(String(body.error || "Unable to save section settings."));
      setSettings(body.settings || settings);
      setNotice("Featured Salons empty-state settings saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save section settings."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-magenta">Marketing & Promotions</p><h2 className="mt-1 font-serif text-3xl text-plum">Featured Salons</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">Create, schedule, pause, archive, restore, or delete geographically relevant salon placements without wading through expired records.</p></div>
      <button type="button" onClick={openNew} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Plus size={16}/>New placement</button>
    </header>

    {notice ? <p role="status" className="rounded-xl border border-magenta/20 bg-blush/40 p-4 text-sm text-plum">{notice}</p> : null}

    <div className="flex flex-wrap gap-2">{["Active", "Scheduled", "Draft", "Paused", "Expired", "Archived", "All"].map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`min-h-10 rounded-full px-4 text-xs font-bold ${tab === item ? "bg-plum text-white" : "border border-plum/15 bg-white text-plum"}`}>{item}{item !== "All" && groupedCounts[item] ? ` (${groupedCounts[item]})` : ""}</button>)}</div>

    <div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-plum/15 bg-white px-3"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="Search campaigns" className="min-w-0 flex-1 text-sm outline-none"/></label><button type="button" onClick={() => void load()} className="min-h-11 rounded-lg border border-plum/15 px-5 text-xs font-bold text-plum">Search</button></div>
    <p className="text-[10px] text-ink/45">Showing {campaigns.length.toLocaleString()} of {total.toLocaleString()} matching campaign{total === 1 ? "" : "s"}.</p>

    <div className="space-y-2">{campaigns.map((campaign) => <article key={campaign.id} className="grid gap-3 rounded-xl border border-plum/10 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-xl text-plum">{campaign.salon?.name || "Salon"}</h3><span className="rounded-full bg-blush px-2 py-1 text-[9px] font-bold uppercase text-magenta">{campaign.status}</span><span className="rounded-full bg-cream px-2 py-1 text-[9px] font-bold text-plum">{campaignBasisLabel(campaign)}</span></div><p className="mt-1 text-xs text-ink/55">{[campaign.salon?.address_city, campaign.salon?.address_state].filter(Boolean).join(", ") || "Location not recorded"} · {campaign.radius_miles} mile radius · Priority {campaign.priority}</p><p className="mt-1 text-[10px] text-ink/45">{dateLabel(campaign.starts_at)} → {dateLabel(campaign.ends_at)}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => openEdit(campaign)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"><Pencil size={14}/>Edit</button><details className="relative"><summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-plum/15 text-plum"><MoreHorizontal size={17}/></summary><div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-plum/10 bg-white p-2 shadow-xl">{campaign.status === "Active" ? <MenuAction icon={<Pause size={14}/>} label="Pause" onClick={() => void lifecycle(campaign,"pause")}/> : !["Archived","Expired"].includes(campaign.status) ? <MenuAction icon={<Play size={14}/>} label="Resume / activate" onClick={() => void lifecycle(campaign,"resume")}/> : null}<MenuAction icon={<Copy size={14}/>} label="Duplicate" onClick={() => openEdit(campaign,true)}/>{campaign.status === "Archived" ? <MenuAction icon={<RotateCcw size={14}/>} label="Restore as draft" onClick={() => void lifecycle(campaign,"restore")}/> : <MenuAction icon={<Archive size={14}/>} label="Archive" onClick={() => void lifecycle(campaign,"archive")}/>} {campaign.status !== "Expired" && campaign.status !== "Archived" ? <MenuAction icon={<CalendarClock size={14}/>} label="End now" onClick={() => void lifecycle(campaign,"expire")}/> : null}{canDelete ? <MenuAction icon={<Trash2 size={14}/>} label="Delete permanently" danger onClick={() => void lifecycle(campaign,"delete")}/> : null}</div></details></div></article>)}{!campaigns.length ? <p className="rounded-xl border border-dashed border-plum/15 p-10 text-center text-sm text-ink/50">No campaigns match this view.</p> : null}</div>

    <details className="rounded-xl border border-plum/10 bg-white"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-xs font-bold text-plum">Homepage empty-state settings<ChevronDown size={15}/></summary><form onSubmit={saveSettings} className="grid gap-3 border-t border-plum/10 p-4 md:grid-cols-3"><label className="text-xs font-bold">Title<input value={settings.empty_title || ""} onChange={(event)=>setSettings({...settings,empty_title:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label><label className="text-xs font-bold">Message<input value={settings.empty_body || ""} onChange={(event)=>setSettings({...settings,empty_body:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label><label className="text-xs font-bold">Internal link<input value={settings.empty_href || ""} onChange={(event)=>setSettings({...settings,empty_href:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label><button disabled={busy} className="min-h-10 rounded-lg bg-plum px-5 text-xs font-bold text-white md:col-span-3 md:justify-self-start">Save empty-state settings</button></form></details>

    {editorOpen ? <div className="fixed inset-0 z-[90] overflow-y-auto bg-charcoal/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Featured Salon campaign editor"><form onSubmit={save} className="mx-auto max-w-4xl space-y-5 rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase text-magenta">Focused campaign editor</p><h3 className="font-serif text-2xl text-plum">{form.id ? "Edit placement" : "New placement"}</h3></div><button type="button" onClick={()=>setEditorOpen(false)} className="min-h-10 rounded-lg border px-4 text-xs font-bold">Close</button></header>
      <section className="rounded-xl bg-cream/50 p-4"><label className="text-xs font-bold">Eligible salon<div className="relative mt-1"><input value={salonQuery} onFocus={()=>setSalonQuery((value)=>value)} onChange={(event)=>{setSalonQuery(event.target.value);setForm({...form,salon_id:"",salon:null});}} placeholder="Choose or type a salon name" className="min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"/>{salons.length ? <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-plum/10 bg-white p-2 shadow-xl">{salons.map((item)=><button key={item.id} type="button" onClick={()=>{setForm({...form,salon_id:item.id,salon:item});setSalonQuery(item.name);setSalons([]);}} className="block w-full rounded-lg p-3 text-left hover:bg-blush/30"><b className="text-plum">{item.name}</b><span className="mt-1 block font-normal text-ink/50">{[item.address_city,item.address_state].filter(Boolean).join(", ")}</span></button>)}</div>:null}</div><span className="mt-1 block text-[9px] font-normal text-ink/45">Alphabetical searchable list · {salonTotal.toLocaleString()} eligible salon{salonTotal===1?"":"s"}</span></label></section>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-bold">Start<input type="datetime-local" value={form.starts_at} onChange={(event)=>setForm({...form,starts_at:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label><label className="text-xs font-bold">End<input type="datetime-local" disabled={form.indefinite} value={form.ends_at} onChange={(event)=>setForm({...form,ends_at:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal disabled:bg-cream"/><span className="mt-2 flex items-center gap-2 font-normal"><input type="checkbox" checked={Boolean(form.indefinite)} onChange={(event)=>setForm({...form,indefinite:event.target.checked})}/>Until I change it</span></label><label className="text-xs font-bold">Status<select value={form.status} onChange={(event)=>setForm({...form,status:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal">{["Draft","Scheduled","Active","Paused"].map(item=><option key={item}>{item}</option>)}</select></label><label className="text-xs font-bold">Audience radius (miles)<input type="number" min="1" max="250" value={form.radius_miles} onChange={(event)=>setForm({...form,radius_miles:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label><label className="text-xs font-bold">Priority<input type="number" min="0" max="100" value={form.priority} onChange={(event)=>setForm({...form,priority:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label><label className="text-xs font-bold">Rotation weight<input type="number" min="0.1" max="100" step="0.1" value={form.rotation_weight} onChange={(event)=>setForm({...form,rotation_weight:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label></div>
      <section className="rounded-xl border border-plum/10 p-4"><h4 className="font-serif text-xl text-plum">Placement basis</h4><div className="mt-3 grid gap-3 md:grid-cols-3">{([{value:"paid",title:"Paid placement"},{value:"platform_credit",title:"Platform credit"},{value:"complimentary_admin",title:"Complimentary Admin placement"}] as Array<{value:Basis;title:string}>).map(item=><label key={item.value} className={`cursor-pointer rounded-xl border p-3 ${form.placement_basis===item.value?"border-magenta bg-blush/30":"border-plum/10"}`}><input type="radio" checked={form.placement_basis===item.value} onChange={()=>setForm({...form,placement_basis:item.value})} className="mr-2 accent-magenta"/><b className="text-xs text-plum">{item.title}</b></label>)}</div>{form.placement_basis==="paid"?<div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-bold">Verified source<select value={form.entitlement_source} onChange={(event)=>setForm({...form,entitlement_source:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal"><option value="stripe_payment">Stripe payment</option><option value="verified_invoice">Verified invoice</option></select></label><label className="text-xs font-bold">Stripe reference<input value={form.entitlement_reference} onChange={(event)=>setForm({...form,entitlement_reference:event.target.value})} placeholder={form.entitlement_source==="verified_invoice"?"in_...":"pi_..."} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal"/></label></div>:<p className="mt-3 text-xs leading-5 text-ink/55">No reference or internal reason is required. The platform automatically records the Super Admin, selected basis, campaign, dates, and amounts.</p>}</section>
      <label className="block text-xs font-bold">Optional internal note<textarea rows={3} value={form.internal_note || ""} onChange={(event)=>setForm({...form,internal_note:event.target.value})} className="mt-1 w-full rounded-lg border p-3 font-normal"/></label><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={()=>setEditorOpen(false)} className="min-h-11 rounded-lg border px-5 text-xs font-bold">Cancel</button><button disabled={busy} className="min-h-11 rounded-lg bg-magenta px-6 text-xs font-bold text-white disabled:opacity-50">{busy?"Saving…":"Save campaign"}</button></div>
    </form></div>:null}
  </section>;
}

function MenuAction({icon,label,onClick,danger=false}:{icon:React.ReactNode;label:string;onClick:()=>void;danger?:boolean}){return <button type="button" onClick={onClick} className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-bold hover:bg-blush/30 ${danger?"text-red-700":"text-plum"}`}>{icon}{label}</button>;}