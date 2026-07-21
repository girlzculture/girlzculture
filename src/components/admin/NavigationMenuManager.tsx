"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw, Save } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Surface = "header" | "mobile_menu" | "mobile_bottom" | "footer";
type Item = { id:string; surface:Surface; group_key:string; item_key:string; label:string; translation_key?:string|null; href:string; sort_order:number; is_enabled:boolean; show_new_badge:boolean; archived_at?:string|null };
const empty:Omit<Item,"id"> = { surface:"header", group_key:"main", item_key:"", label:"", translation_key:"", href:"/", sort_order:10, is_enabled:true, show_new_badge:false, archived_at:null };
const surfaceNames:Record<Surface,string> = { header:"Desktop header", mobile_menu:"Mobile menu", mobile_bottom:"Mobile bottom bar", footer:"Footer" };

export default function NavigationMenuManager() {
  const [items,setItems] = useState<Item[]>([]);
  const [surface,setSurface] = useState<Surface>("header");
  const [selectedId,setSelectedId] = useState("");
  const [form,setForm] = useState<Omit<Item,"id">>(empty);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");

  async function authHeaders(json=false) {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session expired.");
    return { Authorization:`Bearer ${session.access_token}`, ...(json ? {"Content-Type":"application/json"} : {}) };
  }

  async function load(preferred?:string) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/engine/navigation", { headers:await authHeaders(), cache:"no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const rows = Array.isArray(body.items) ? body.items : [];
      setItems(rows);
      const selected = rows.find((item:Item) => item.id === (preferred || selectedId));
      if (selected) { setSelectedId(selected.id); setSurface(selected.surface); setForm({...selected}); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load navigation."); }
    finally { setLoading(false); }
  }

  useEffect(() => { const timer=window.setTimeout(() => void load(),0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => items.filter((item) => item.surface === surface).sort((a,b) => a.sort_order-b.sort_order), [items,surface]);
  function select(item:Item) { setSelectedId(item.id); setForm({...item}); setMessage(""); }
  function create() { setSelectedId(""); setForm({...empty,surface,group_key:surface === "footer" ? "company" : "main",sort_order:(visible.at(-1)?.sort_order || 0)+10}); setMessage(""); }

  async function submit() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/engine/navigation", { method:selectedId?"PATCH":"POST", headers:await authHeaders(true), body:JSON.stringify({...form,id:selectedId||undefined,action:"update"}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(selectedId ? "Navigation item saved." : "Navigation item created.");
      await load(body.item.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save navigation."); }
    finally { setBusy(false); }
  }

  async function action(id:string,kind:"archive"|"restore") {
    if (kind === "archive" && !window.confirm("Archive this navigation item? It will disappear from the public site.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/engine/navigation", { method:"PATCH", headers:await authHeaders(true), body:JSON.stringify({id,action:kind}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(kind === "archive" ? "Navigation item archived." : "Navigation item restored.");
      await load(body.item.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update navigation."); }
    finally { setBusy(false); }
  }

  async function move(item:Item,direction:-1|1) {
    const peers = visible.filter((row) => !row.archived_at);
    const index = peers.findIndex((row) => row.id === item.id);
    const other = peers[index+direction];
    if (!other) return;
    setBusy(true);
    try {
      for (const row of [{...item,sort_order:other.sort_order},{...other,sort_order:item.sort_order}]) {
        const response = await fetch("/api/admin/engine/navigation", { method:"PATCH", headers:await authHeaders(true), body:JSON.stringify({...row,action:"update"}) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
      }
      await load(item.id); setMessage("Navigation order updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reorder navigation."); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-[15px] border border-plum/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-serif text-2xl text-plum">Navigation & menus</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-ink/60">Control public labels, safe internal destinations, order, visibility, and New badges. External URLs and markup are rejected server-side.</p></div>
        <button type="button" onClick={create} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><Plus size={15}/>Add item</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{(Object.keys(surfaceNames) as Surface[]).map((key) => <button type="button" key={key} onClick={() => { setSurface(key); setSelectedId(""); setForm({...empty,surface:key,group_key:key === "footer" ? "company" : "main"}); }} className={`rounded-full px-3 py-2 text-[10px] font-bold ${surface === key ? "bg-plum text-white" : "bg-cream text-plum"}`}>{surfaceNames[key]}</button>)}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="space-y-2">
          {loading ? <p className="text-xs text-ink/50">Loading navigation…</p> : visible.map((item,index) => <div key={item.id} className={`rounded-xl border p-3 ${selectedId === item.id ? "border-magenta bg-blush/20" : "border-plum/10"} ${item.archived_at ? "opacity-55" : ""}`}>
            <button type="button" onClick={() => select(item)} className="w-full text-left"><span className="flex items-center justify-between gap-2"><b className="text-sm text-plum">{item.label}</b><span className="text-[9px] text-ink/45">{item.href}</span></span><span className="mt-1 block text-[9px] text-ink/45">{item.group_key} · order {item.sort_order}{item.archived_at ? " · archived" : item.is_enabled ? " · visible" : " · hidden"}</span></button>
            <div className="mt-2 flex gap-1"><button type="button" aria-label="Move earlier" disabled={busy||index===0||Boolean(item.archived_at)} onClick={() => void move(item,-1)} className="rounded border p-1 disabled:opacity-30"><ArrowUp size={13}/></button><button type="button" aria-label="Move later" disabled={busy||index===visible.length-1||Boolean(item.archived_at)} onClick={() => void move(item,1)} className="rounded border p-1 disabled:opacity-30"><ArrowDown size={13}/></button></div>
          </div>)}
          {!loading&&!visible.length ? <p className="rounded-xl border border-dashed p-5 text-center text-xs text-ink/50">No items on this surface.</p> : null}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="rounded-xl border border-plum/10 p-4">
          <h4 className="font-serif text-xl text-plum">{selectedId ? "Edit navigation item" : "New navigation item"}</h4>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Label" value={form.label} onChange={(label) => setForm({...form,label})}/><Field label="Internal destination" value={form.href} onChange={(href) => setForm({...form,href})}/><Field label="Item key" value={form.item_key} onChange={(item_key) => setForm({...form,item_key:item_key.toLowerCase().replace(/\s+/g,"-")})}/><Field label="Group key" value={form.group_key} onChange={(group_key) => setForm({...form,group_key:group_key.toLowerCase().replace(/\s+/g,"-")})}/><Field label="Translation key (optional)" value={form.translation_key||""} onChange={(translation_key) => setForm({...form,translation_key})}/><label className="text-xs font-bold">Order<input type="number" min={0} max={100000} value={form.sort_order} onChange={(event) => setForm({...form,sort_order:Number(event.target.value)})} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label></div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={form.is_enabled} onChange={(event) => setForm({...form,is_enabled:event.target.checked})} className="accent-magenta"/>Visible</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.show_new_badge} onChange={(event) => setForm({...form,show_new_badge:event.target.checked})} className="accent-magenta"/>Show New badge</label></div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="submit" disabled={busy||Boolean(form.archived_at)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-40"><Save size={14}/>{selectedId?"Save item":"Add item"}</button>{selectedId ? (form.archived_at ? <button type="button" disabled={busy} onClick={() => void action(selectedId,"restore")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-xs font-bold"><RotateCcw size={14}/>Restore</button> : <button type="button" disabled={busy} onClick={() => void action(selectedId,"archive")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-200 px-4 text-xs font-bold text-red-700"><Archive size={14}/>Archive</button>) : null}</div>
          {message ? <p role="status" className="mt-4 rounded-lg bg-blush p-3 text-xs text-plum">{message}</p> : null}
        </form>
      </div>
    </section>
  );
}

function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  return <label className="text-xs font-bold">{label}<input value={value} onChange={(event) => onChange(event.target.value)} maxLength={240} required={!label.includes("optional")} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 px-3 font-normal"/></label>;
}
