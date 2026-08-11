/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet, Plus, Search, Trash2, Upload } from "lucide-react";
import ActionToast from "@/components/ActionToast";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import { sortCatalogRecords } from "@/lib/catalogOrdering";

type Row = Record<string, any>;
type CatalogKind = "service_category" | "service_group" | "master_style" | "service_addon";
type CatalogView = "active" | "archived" | "all";
type CatalogDataKey = "serviceCategories" | "serviceGroups" | "masterStyles" | "serviceAddons";
type CatalogData = Record<CatalogDataKey, Row[]>;
const CONFIG: Array<{ kind: CatalogKind; label: string; singular: string; dataKey: CatalogDataKey }> = [
  { kind: "service_category", label: "Categories", singular: "Category", dataKey: "serviceCategories" },
  { kind: "service_group", label: "Service Groups", singular: "Service Group", dataKey: "serviceGroups" },
  { kind: "master_style", label: "Service Names", singular: "Service Name", dataKey: "masterStyles" },
  { kind: "service_addon", label: "Add-ons", singular: "Add-on", dataKey: "serviceAddons" },
];
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const objectRow = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
function visibleRows(items: Row[], view: CatalogView) { return items.filter((item) => { if (view === "all") return true; const archived = Boolean(item.archived_at) || item.is_active === false; return view === "archived" ? archived : !archived; }); }
function blank(kind: CatalogKind, categories: Row[], groups: Row[]): Row {
  if (kind === "service_category") return { name: "", slug: "", description: "", sort_order: 0, is_active: true };
  if (kind === "master_style") return { name: "", service_group_id: groups.find((item) => item.is_active)?.id || "", sort_order: 0, is_active: true };
  return { name: "", category_id: categories.find((item) => item.is_active)?.id || "", sort_order: 0, is_active: true };
}

export default function AdminServiceCatalogWorkspace() {
  const [data, setData] = useState<CatalogData>({ serviceCategories: [], serviceGroups: [], masterStyles: [], serviceAddons: [] });
  const [kind, setKind] = useState<CatalogKind>("service_category");
  const [view, setView] = useState<CatalogView>("active");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [dependency, setDependency] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Row | null>(null);
  const currentConfig = CONFIG.find((item) => item.kind === kind)!;
  const collection = useMemo(() => sortCatalogRecords(data[currentConfig.dataKey] || []), [currentConfig.dataKey, data]);
  const filtered = useMemo(() => { const normalized = query.trim().toLowerCase(); return visibleRows(collection, view).filter((item) => !normalized ? true : [item.name, item.slug, item.service_category?.name, item.service_group?.name].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized))); }, [collection, query, view]);

  async function headers(json = true) {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required.");
    return { Authorization: `Bearer ${session.access_token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
  }
  const load = useCallback(async (): Promise<CatalogData> => {
    const response = await fetch("/api/admin/content", { headers: await headers(false), cache: "no-store" });
    const body = await readApiResponse(response, "Unable to load the service catalog.");
    if (!response.ok) throw new Error(body.error || "Unable to load the service catalog.");
    const next: CatalogData = { serviceCategories: rows(body.serviceCategories), serviceGroups: rows(body.serviceGroups), masterStyles: rows(body.masterStyles), serviceAddons: rows(body.serviceAddons) };
    setData(next); return next;
  }, []);
  useEffect(() => { let active = true; void (async () => { try { const loaded = await load(); if (!active) return; const first = visibleRows(loaded.serviceCategories, "active")[0] || null; setSelected(first); setDraft(first ? { ...first } : null); } catch (error) { if (active) setNotice(error instanceof Error ? error.message : "Unable to load the service catalog."); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [load]);
  useEffect(() => {
    let active = true;
    if (!selected?.id) return;
    void (async () => { try { const response = await fetch(`/api/admin/records?resource=${encodeURIComponent(kind)}&id=${encodeURIComponent(String(selected.id))}`, { headers: await headers(false), cache: "no-store" }); const body = await readApiResponse(response, "Unable to inspect dependencies."); if (!response.ok) throw new Error(body.error || "Unable to inspect dependencies."); if (active) setDependency(body as Row); } catch (error) { if (active) setDependency({ error: error instanceof Error ? error.message : "Dependency preview unavailable." }); } })();
    return () => { active = false; };
  }, [kind, selected?.id]);
  function choose(next: Row | null) { setSelected(next); setDraft(next ? { ...next } : blank(kind, data.serviceCategories, data.serviceGroups)); setDependency(null); }
  function switchKind(next: CatalogKind) { setKind(next); setQuery(""); setView("active"); const config = CONFIG.find((item) => item.kind === next)!; const first = visibleRows(data[config.dataKey] || [], "active")[0] || null; setSelected(first); setDraft(first ? { ...first } : null); setDependency(null); }
  async function save() {
    if (!draft) return;
    setSaving(true); setNotice("");
    try { const response = await fetch("/api/admin/content", { method: "PUT", headers: await headers(), body: JSON.stringify({ type: kind, payload: draft }) }); const body = await readApiResponse(response, "Catalog save failed."); if (!response.ok) throw new Error(body.error || "Catalog save failed."); const loaded = await load(); const config = CONFIG.find((item) => item.kind === kind)!; const savedRecord = objectRow(body.data); const persisted = loaded[config.dataKey].find((item) => String(item.id) === String(savedRecord.id || "")); if (!persisted) throw new Error("The catalog record was saved but could not be verified after reload."); setSelected(persisted); setDraft({ ...persisted }); setNotice(`${currentConfig.singular} saved and verified after reload.`); } catch (error) { setNotice(error instanceof Error ? `Save failed: ${error.message}` : "Save failed."); } finally { setSaving(false); }
  }
  async function managedAction(action: "archive" | "restore" | "delete") {
    if (!selected?.id) return;
    const reason = window.prompt(`Reason to ${action} this ${currentConfig.singular.toLowerCase()}:`, "Catalog maintenance")?.trim();
    if (!reason) return;
    const dependencyCount = Number(dependency?.dependencies?.total || 0);
    const warning = action === "delete" ? `Permanently delete ${selected.name}? ${dependencyCount} dependent record${dependencyCount === 1 ? "" : "s"} were found. Protected dependencies will block deletion.` : `${action === "archive" ? "Archive" : "Restore"} ${selected.name}?`;
    if (!window.confirm(warning)) return;
    setSaving(true); setNotice("");
    try { const response = await fetch("/api/admin/records", { method: "POST", headers: await headers(), body: JSON.stringify({ resource: kind, id: selected.id, action, reason, confirmation: selected.name }) }); const body = await readApiResponse(response, `${action} failed.`); if (!response.ok) throw new Error(body.error || `${action} failed.`); const loaded = await load(); const config = CONFIG.find((item) => item.kind === kind)!; const nextRows = loaded[config.dataKey]; const refreshed = nextRows.find((item) => String(item.id) === String(selected.id)) || null; const next = action === "delete" ? visibleRows(nextRows, view)[0] || null : refreshed; setSelected(next); setDraft(next ? { ...next } : null); setDependency(null); setNotice(`${currentConfig.singular} ${action} completed and verified after reload.`); } catch (error) { setNotice(error instanceof Error ? `${action} failed: ${error.message}` : `${action} failed.`); } finally { setSaving(false); }
  }
  async function download(mode: "template" | "export") {
    setSaving(true);
    try { const response = await fetch(`/api/admin/catalog-spreadsheet?mode=${mode}`, { headers: await headers(false), cache: "no-store" }); if (!response.ok) { const body = await readApiResponse(response, "Catalog download failed."); throw new Error(body.error || "Catalog download failed."); } const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = mode === "template" ? "girlz-culture-platform-catalog-template.xlsx" : `girlz-culture-platform-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); setNotice(mode === "template" ? "Blank catalog template downloaded." : "Current catalog exported."); } catch (error) { setNotice(error instanceof Error ? error.message : "Download failed."); } finally { setSaving(false); }
  }
  async function validateImport() {
    if (!importFile) return;
    setSaving(true); setNotice("");
    try { const form = new FormData(); form.set("file", importFile); const response = await fetch("/api/admin/catalog-spreadsheet", { method: "POST", headers: await headers(false), body: form }); const body = await readApiResponse(response, "Catalog file validation failed."); if (!response.ok) throw new Error(body.error || "Catalog file validation failed."); const summary = objectRow(body.summary); setImportPreview(body as Row); setNotice(`${Number(summary.importable || 0)} valid row${Number(summary.importable || 0) === 1 ? "" : "s"} ready to import; ${Number(summary.skipped || 0)} will be skipped.`); } catch (error) { setImportPreview(null); setNotice(error instanceof Error ? error.message : "Catalog file validation failed."); } finally { setSaving(false); }
  }
  async function commitImport() {
    const importRows = rows(importPreview?.import_rows); if (!importRows.length) return;
    setSaving(true); setNotice("");
    try { const response = await fetch("/api/admin/catalog-spreadsheet", { method: "POST", headers: await headers(), body: JSON.stringify({ action: "commit", rows: importRows }) }); const body = await readApiResponse(response, "Catalog import failed."); if (!response.ok) throw new Error(body.error || "Catalog import failed."); const result = objectRow(body.result); await load(); setImportPreview(null); setImportFile(null); setNotice(`Catalog import completed and verified: ${Number(result.rows_processed || importRows.length)} rows processed.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Catalog import failed."); } finally { setSaving(false); }
  }
  if (loading) return <div className="min-h-screen bg-cream p-12 text-center text-plum">Loading Service Catalog…</div>;
  const counts = Object.fromEntries(CONFIG.map((config) => [config.kind, visibleRows(data[config.dataKey] || [], "active").length]));
  return <main className="min-h-screen bg-cream px-4 py-6 text-ink sm:px-8"><ActionToast message={notice} onDismiss={() => setNotice("")} /><div className="mx-auto max-w-[1500px]">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Link href="/admin/content" aria-label="Back to Content Management" className="rounded-lg border border-plum/15 bg-white p-2.5 text-plum"><ArrowLeft size={18}/></Link><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-magenta">Content Management</p><h1 className="font-serif text-3xl text-plum">Service Catalog</h1><p className="mt-1 text-xs text-ink/55">Manage shared categories, service groups, service names, and add-ons. Salon prices, durations, and images remain salon-owned.</p></div></div></header>
    <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{CONFIG.map((item) => <button key={item.kind} type="button" onClick={() => switchKind(item.kind)} className={`rounded-2xl border p-4 text-left ${kind === item.kind ? "border-magenta bg-blush/45" : "border-plum/10 bg-white"}`}><span className="text-[10px] font-bold uppercase tracking-[.12em] text-magenta">{counts[item.kind]} active</span><b className="mt-2 block font-serif text-xl text-plum">{item.label}</b></button>)}</section>
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-plum/10 bg-white p-3"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum/15 px-3"><Search size={16} className="text-magenta"/><span className="sr-only">Search catalog</span><input type="search" inputMode="search" enterKeyHint="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${currentConfig.label.toLowerCase()}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label><select value={view} onChange={(event) => { setView(event.target.value as CatalogView); setSelected(null); setDraft(null); }} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs font-bold text-plum"><option value="active">Active</option><option value="archived">Archived & hidden</option><option value="all">All</option></select><button type="button" onClick={() => choose(null)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><Plus size={15}/>Add {currentConfig.singular}</button></div>
    <div className="mt-5 grid min-w-0 items-start gap-5 xl:grid-cols-[330px_1fr]"><aside className="max-h-[720px] overflow-y-auto rounded-2xl border border-plum/10 bg-white p-3"><p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[.12em] text-ink/50">{filtered.length} record{filtered.length === 1 ? "" : "s"}</p>{filtered.map((item) => <button key={item.id} type="button" onClick={() => choose(item)} className={`mb-1 w-full rounded-xl p-3 text-left ${selected?.id === item.id ? "bg-blush" : "hover:bg-cream"}`}><b className="block text-xs text-plum">{item.name}</b><small className="mt-1 block text-ink/50">{item.service_category?.name || item.service_group?.name || item.slug || "Shared catalog"}{item.archived_at || item.is_active === false ? " · Archived" : " · Active"}</small></button>)}{!filtered.length ? <p className="p-6 text-center text-xs text-ink/50">No matching catalog records.</p> : null}</aside>
      {draft ? <section className="rounded-2xl border border-plum/10 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-magenta">{draft.id ? "Edit" : "Create"}</p><h2 className="font-serif text-2xl text-plum">{currentConfig.singular}</h2></div>{selected?.id ? <span className="rounded-full bg-cream px-3 py-1 text-[10px] font-bold text-plum">{selected.archived_at || selected.is_active === false ? "Archived" : "Active"}</span> : null}</div><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={draft.name || ""} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
        {kind === "service_category" ? <Field label="URL slug" value={draft.slug || ""} onChange={(value) => setDraft((current) => ({ ...current, slug: value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }))} /> : null}
        {kind === "service_group" || kind === "service_addon" ? <label className="text-xs font-bold text-plum">Category<select value={draft.category_id || ""} onChange={(event) => setDraft((current) => ({ ...current, category_id: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value="">Choose category</option>{data.serviceCategories.filter((item) => item.is_active && !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
        {kind === "master_style" ? <label className="text-xs font-bold text-plum">Service group<select value={draft.service_group_id || ""} onChange={(event) => setDraft((current) => ({ ...current, service_group_id: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value="">Choose service group</option>{data.serviceGroups.filter((item) => item.is_active && !item.archived_at).map((item) => <option key={item.id} value={item.id}>{item.service_category?.name} · {item.name}</option>)}</select></label> : null}
        <label className="text-xs font-bold text-plum">Display order<input type="number" min={0} max={100000} value={draft.sort_order || 0} onChange={(event) => setDraft((current) => ({ ...current, sort_order: Number(event.target.value || 0) }))} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label><label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-plum/15 px-3 text-xs font-bold text-plum"><input type="checkbox" checked={draft.is_active !== false} onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))} className="accent-magenta"/>Visible to salon owners</label>
        {kind === "service_category" ? <label className="text-xs font-bold text-plum sm:col-span-2">Description<textarea rows={4} value={draft.description || ""} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-plum/15 p-3 font-normal"/></label> : null}
      </div><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving and verifying…" : `Save ${currentConfig.singular}`}</button>{selected?.id && !selected.archived_at && selected.is_active !== false ? <button type="button" disabled={saving} onClick={() => void managedAction("archive")} className="min-h-11 rounded-lg border border-plum/20 px-4 text-xs font-bold text-plum">Archive</button> : null}{selected?.id && (selected.archived_at || selected.is_active === false) ? <button type="button" disabled={saving} onClick={() => void managedAction("restore")} className="min-h-11 rounded-lg border border-green-300 px-4 text-xs font-bold text-green-700">Restore</button> : null}{selected?.id ? <button type="button" disabled={saving} onClick={() => void managedAction("delete")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-4 text-xs font-bold text-red-700"><Trash2 size={14}/>Safe delete</button> : null}</div>
      {selected?.id ? <div className="mt-5 rounded-xl border border-plum/10 bg-cream/60 p-4"><h3 className="font-serif text-lg text-plum">Dependencies & audit-safe actions</h3>{dependency?.dependencies?.details?.length ? <ul className="mt-2 space-y-1 text-xs text-ink/60">{dependency.dependencies.details.map((item: Row) => <li key={item.label}>{item.label}: <b>{item.count}</b> · {item.retention}</li>)}</ul> : <p className="mt-2 text-xs text-ink/55">{dependency?.error || (dependency ? "No protected dependencies found." : "Checking dependencies…")}</p>}</div> : null}</section> : <section className="rounded-2xl border border-dashed border-plum/20 bg-white p-10 text-center"><h2 className="font-serif text-2xl text-plum">Choose a catalog record</h2><p className="mt-2 text-sm text-ink/55">Select one item to edit, or add a new {currentConfig.singular.toLowerCase()}.</p></section>}
    </div>
    <details className="mt-6 rounded-2xl border border-plum/10 bg-white p-5"><summary className="cursor-pointer list-none"><div className="flex items-center gap-3"><FileSpreadsheet className="text-magenta" size={20}/><div><h2 className="font-serif text-xl text-plum">Import & Export</h2><p className="text-xs text-ink/55">Download a template, export the current catalog, or validate and import an Excel/CSV file.</p></div></div></summary><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => void download("template")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta"><Download size={14}/>Download blank template</button><button type="button" onClick={() => void download("export")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-plum/20 px-4 text-xs font-bold text-plum"><Download size={14}/>Export current catalog</button></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><label className="text-xs font-bold text-plum">Choose completed catalog file<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportPreview(null); }} className="mt-1 block w-full rounded-lg border border-plum/15 p-2 font-normal"/></label><button type="button" disabled={!importFile || saving} onClick={() => void validateImport()} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-plum px-5 text-xs font-bold text-white disabled:opacity-40"><Upload size={14}/>Validate file</button></div>{importPreview ? <div className="mt-4 rounded-xl bg-cream/60 p-4"><p className="text-xs text-ink/60"><b className="text-plum">{Number(importPreview.summary?.importable || 0)} valid rows</b> · {Number(importPreview.summary?.skipped || 0)} skipped</p><button type="button" disabled={!rows(importPreview.import_rows).length || saving} onClick={() => void commitImport()} className="mt-3 min-h-10 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-40">Import {rows(importPreview.import_rows).length} valid row{rows(importPreview.import_rows).length === 1 ? "" : "s"}</button></div> : null}</details>
  </div></main>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-bold text-plum">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 font-normal text-ink"/></label>; }