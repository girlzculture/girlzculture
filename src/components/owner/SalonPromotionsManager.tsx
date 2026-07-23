"use client";

import { FormEvent, useMemo, useState } from "react";
import { Archive, Eye, Pause, Pencil, Play, Plus, Tag } from "lucide-react";

type Row = Record<string, unknown> & { id?: string };
type Props = {
  promotions: Row[];
  styles: Row[];
  products: Row[];
  setPromotions: React.Dispatch<React.SetStateAction<Row[]>>;
  saveRecord: (table: string, values: Record<string, unknown>, id?: string) => Promise<Row | null>;
  removeRecord: (table: string, id: string, setter: React.Dispatch<React.SetStateAction<Row[]>>) => Promise<void>;
};

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-xs outline-none focus:border-magenta";
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
const localDateTime = (value: unknown) => value ? new Date(String(value)).toISOString().slice(0, 16) : "";
const values = (value: unknown) => Array.isArray(value) ? value.map(String) : [];

export default function SalonPromotionsManager({ promotions, styles, products, setPromotions, saveRecord, removeRecord }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scope, setScope] = useState("salon");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const editing = promotions.find((promotion) => promotion.id === editingId) || null;
  const ordered = useMemo(() => [...promotions].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))), [promotions]);
  const serviceGroups = useMemo(() => uniqueTargets(styles, "service_group_id", "category"), [styles]);
  const masterStyles = useMemo(() => uniqueTargets(styles, "master_style_id", "name"), [styles]);
  const targets = scope === "services" ? styles.map((row) => ({ id: String(row.id || ""), label: String(row.name || "Service") }))
    : scope === "service_groups" ? serviceGroups
    : scope === "master_styles" ? masterStyles
    : scope === "products" ? products.map((row) => ({ id: String(row.id || ""), label: String(row.name || "Product") }))
    : scope === "addons" ? uniqueAddons(styles)
    : [];

  function startEdit(row: Row | null) {
    setEditingId(row?.id || null);
    setScope(String(row?.target_scope || "salon"));
    setSelectedTargets(values(row?.target_ids));
    window.setTimeout(() => document.getElementById("promotion-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  }

  function setTarget(id: string) {
    setSelectedTargets((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("promotion_type") || "descriptive");
    const status = String(form.get("status") || "Draft");
    const start = String(form.get("starts_at") || "");
    const end = String(form.get("ends_at") || "");
    const minimum = String(form.get("minimum_subtotal") || "");
    const saved = await saveRecord("salon_promotions", {
      title: form.get("title"),
      public_headline: form.get("public_headline"),
      description: form.get("description"),
      promotion_type: type,
      discount_value: ["percentage", "fixed"].includes(type) ? form.get("discount_value") : 0,
      discount_label: form.get("discount_label"),
      starts_at: start ? new Date(start).toISOString() : null,
      ends_at: end ? new Date(end).toISOString() : null,
      timezone: form.get("timezone") || timeZone,
      status,
      is_active: status === "Active",
      paused_at: status === "Paused" ? new Date().toISOString() : null,
      target_scope: scope,
      target_ids: scope === "salon" ? [] : selectedTargets,
      restrictions: { minimum_subtotal: minimum === "" ? 0 : Number(minimum), new_customers_only: form.get("new_customers_only") === "on", terms: String(form.get("terms") || "").trim() },
      archived_at: status === "Archived" ? new Date().toISOString() : null,
    }, editing?.id);
    if (!saved) return;
    setPromotions((current) => editing ? current.map((row) => row.id === editing.id ? saved : row) : [saved, ...current]);
    startEdit(null);
    event.currentTarget.reset();
  }

  async function changeStatus(promotion: Row, status: "Active" | "Paused") {
    const saved = await saveRecord("salon_promotions", { status, is_active: status === "Active", paused_at: status === "Paused" ? new Date().toISOString() : null }, promotion.id);
    if (saved) setPromotions((current) => current.map((row) => row.id === promotion.id ? saved : row));
  }

  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-serif text-4xl font-semibold text-plum">Promotions</h1><p className="mt-2 text-sm text-ink/60">Create offers customers can see and safely apply to eligible bookings.</p></div>
      <button type="button" onClick={() => startEdit(null)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><Plus size={16}/>New promotion</button>
    </div>

    <section id="promotion-editor" className="mt-5 rounded-[15px] border border-plum/10 bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">{editing ? "Edit promotion" : "Create a deal or offer"}</h2><p className="mt-1 text-xs text-ink/55">Draft offers stay private. Only active offers inside their date window appear publicly.</p></div><Tag className="text-magenta"/></div>
      <form key={editing?.id || "new"} onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Label text="Internal title"><input required name="title" defaultValue={String(editing?.title || "")} placeholder="Summer knotless special" className={inputClass}/></Label>
        <Label text="Public headline"><input required name="public_headline" defaultValue={String(editing?.public_headline || editing?.title || "")} placeholder="Save on your next style" className={inputClass}/></Label>
        <Label text="Offer type"><select name="promotion_type" defaultValue={String(editing?.promotion_type || "percentage")} className={inputClass}><option value="percentage">Percentage discount</option><option value="fixed">Fixed discount</option><option value="free_addon">Free eligible add-on</option><option value="free_service">Free eligible service</option><option value="descriptive">Descriptive offer</option></select></Label>
        <Label text="Discount value"><input name="discount_value" type="number" inputMode="decimal" min="0" max="10000" step="0.01" defaultValue={String(editing?.discount_value ?? "")} placeholder="20" className={`${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}/></Label>
        <Label text="Customer-facing discount label"><input name="discount_label" defaultValue={String(editing?.discount_label || "")} placeholder="20% off" className={inputClass}/></Label>
        <Label text="Status"><select name="status" defaultValue={String(editing?.status || "Draft")} className={inputClass}><option>Draft</option><option>Active</option><option>Paused</option></select></Label>
        <Label text="Starts"><input name="starts_at" type="datetime-local" defaultValue={localDateTime(editing?.starts_at)} className={inputClass}/></Label>
        <Label text="Ends"><input name="ends_at" type="datetime-local" defaultValue={localDateTime(editing?.ends_at)} className={inputClass}/></Label>
        <Label text="Time zone"><input name="timezone" defaultValue={String(editing?.timezone || timeZone)} className={inputClass}/></Label>
        <Label text="Applies to"><select value={scope} onChange={(event) => { setScope(event.target.value); setSelectedTargets([]); }} className={inputClass}><option value="salon">Entire salon</option><option value="services">Selected services</option><option value="service_groups">Selected service groups</option><option value="master_styles">Selected styles</option><option value="products">Selected products</option><option value="addons">Selected add-ons</option></select></Label>
        <Label text="Minimum booking subtotal"><input name="minimum_subtotal" type="number" min="0" step="0.01" defaultValue={String((editing?.restrictions as Row | undefined)?.minimum_subtotal ?? "")} className={`${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}/></Label>
        <Label text="Public terms"><input name="terms" defaultValue={String((editing?.restrictions as Row | undefined)?.terms || "")} placeholder="One offer per appointment" className={inputClass}/></Label>
        <label className="md:col-span-2 xl:col-span-4"><span className="text-[10px] font-bold">Description</span><textarea name="description" rows={3} defaultValue={String(editing?.description || "")} className={`${inputClass} py-3`}/></label>
        {targets.length ? <fieldset className="rounded-lg border border-plum/10 p-3 md:col-span-2 xl:col-span-4"><legend className="px-2 text-[10px] font-bold">Eligible targets</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{targets.map((target) => <label key={target.id} className="flex items-center gap-2 rounded-lg bg-cream p-3 text-xs"><input type="checkbox" checked={selectedTargets.includes(target.id)} onChange={() => setTarget(target.id)} className="accent-magenta"/>{target.label}</label>)}</div></fieldset> : null}
        <label className="flex items-center gap-2 text-xs md:col-span-2"><input name="new_customers_only" type="checkbox" defaultChecked={(editing?.restrictions as Row | undefined)?.new_customers_only === true} className="accent-magenta"/>New customers only</label>
        <div className="flex gap-2 md:col-span-2 xl:col-span-4"><button className="min-h-11 flex-1 rounded-lg bg-magenta px-5 text-xs font-bold text-white">{editing ? "Save promotion" : "Create promotion"}</button>{editing ? <button type="button" onClick={() => startEdit(null)} className="min-h-11 rounded-lg border border-plum/15 px-5 text-xs font-bold">Cancel</button> : null}</div>
      </form>
    </section>

    <section className="mt-5 rounded-[15px] border border-plum/10 bg-white p-5"><h2 className="font-serif text-2xl text-plum">Saved promotions</h2><div className="mt-4 grid gap-3 lg:grid-cols-2">{ordered.map((promotion) => <article key={promotion.id} className="rounded-[12px] border border-plum/10 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-xl text-plum">{String(promotion.public_headline || promotion.title || "Promotion")}</h3><Status value={String(promotion.status || (promotion.is_active ? "Active" : "Draft"))}/></div><p className="mt-2 text-xs text-ink/60">{String(promotion.discount_label || "Special offer")} · {scopeLabel(String(promotion.target_scope || "salon"))}</p><p className="mt-1 text-[10px] text-ink/45">{dateText(promotion.starts_at)} – {dateText(promotion.ends_at)} · {String(promotion.timezone || timeZone)}</p></div><Eye size={17} className="text-magenta"/></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => startEdit(promotion)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta"><Pencil size={13}/>Edit</button>{promotion.status === "Active" ? <button type="button" onClick={() => void changeStatus(promotion, "Paused")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-plum/15 px-3 text-[10px] font-bold"><Pause size={13}/>Pause</button> : <button type="button" onClick={() => void changeStatus(promotion, "Active")} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-plum px-3 text-[10px] font-bold text-white"><Play size={13}/>Activate</button>}<button type="button" onClick={() => promotion.id && void removeRecord("salon_promotions", promotion.id, setPromotions)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-200 px-3 text-[10px] font-bold text-red-700"><Archive size={13}/>Archive / remove</button></div></article>)}{!ordered.length ? <p className="rounded-lg bg-cream p-8 text-center text-xs text-ink/55 lg:col-span-2">No promotions yet. Create a draft, preview it, then activate it when ready.</p> : null}</div></section>
  </>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label><span className="text-[10px] font-bold">{text}</span>{children}</label>; }
function Status({ value }: { value: string }) { const color = value === "Active" ? "bg-green-100 text-green-800" : value === "Paused" ? "bg-amber/20 text-[#8b5500]" : "bg-blush text-plum"; return <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${color}`}>{value}</span>; }
function dateText(value: unknown) { if (!value) return "No date"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? "Invalid date" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function scopeLabel(scope: string) { return ({ salon: "Entire salon", services: "Selected services", service_groups: "Selected service groups", master_styles: "Selected styles", products: "Selected products", addons: "Selected add-ons" } as Record<string, string>)[scope] || scope; }
function uniqueTargets(rows: Row[], idKey: string, labelKey: string) { const map = new Map<string, string>(); for (const row of rows) { const id = String(row[idKey] || ""); if (id) map.set(id, String(row[labelKey] || "Service group")); } return [...map].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)); }
function uniqueAddons(styles: Row[]) { const map = new Map<string, string>(); for (const style of styles) for (const addon of Array.isArray(style.addons) ? style.addons as Row[] : []) { const id = String(addon.value || addon.label || addon.name || ""); if (id) map.set(id, String(addon.label || addon.name || addon.value)); } return [...map].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)); }
