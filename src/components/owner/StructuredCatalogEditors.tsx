/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ImageIcon, Plus, Trash2, UserRound } from "lucide-react";
import BaseImageUpload from "@/components/ImageUpload";
import { salonSupabase as supabase } from "@/lib/supabase";
import {
  INCLUDED_ITEM_OPTIONS,
  LENGTH_OPTIONS,
  MATERIAL_LONGEVITY_WEEKS,
  MATERIAL_OPTIONS,
  MATERIAL_QUALITY_OPTIONS,
  SIZE_OPTIONS,
} from "@/lib/salonPresets";

type Row = Record<string, any> & { id?: string; name?: string };
type MasterStyle = Record<string, any> & { id: string; name: string; category?: string; category_id?: string; service_group_id?: string; service_category?: { id?: string; name?: string; slug?: string } | null; service_group?: { id?: string; name?: string; category_id?: string } | null };
type NumericValue = number | "";
type OptionRow = { label: string; price_add: NumericValue };
type MaterialRow = { id?: string; name: string; price: NumericValue; longevity_weeks: number; quality_grade: string };
type Context = {
  salon: Row;
  styles: Row[];
  stylists: Row[];
  selectedStyle: string | null;
  selectedStylist: string | null;
  setSelectedStyle: (id: string | null) => void;
  setSelectedStylist: (id: string | null) => void;
  setStyles: React.Dispatch<React.SetStateAction<any[]>>;
  setStylists: React.Dispatch<React.SetStateAction<any[]>>;
  saveRecord: (table: string, values: Record<string, unknown>, id?: string) => Promise<any>;
  removeRecord: (table: string, id: string, setter: React.Dispatch<React.SetStateAction<any[]>>) => Promise<void>;
  setNotice: (message: string) => void;
};

const ImageUpload = (props: React.ComponentProps<typeof BaseImageUpload>) => <BaseImageUpload {...props} authScope="salon" />;

function normalizedOptions(raw: unknown): OptionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => typeof item === "string" ? { label: item, price_add: 0 } : {
    label: String(item?.label || item?.value || ""),
    price_add: Number(item?.price_add ?? item?.price ?? 0),
  }).filter((item) => item.label);
}

function MoneyInput({ value, onChange, label = "Price" }: { value: NumericValue; onChange: (value: NumericValue) => void; label?: string }) {
  return <label className="text-[10px] font-bold">{label}<span className="mt-1 flex min-h-10 items-center rounded-[7px] border border-plum/15 bg-white px-3"><span className="mr-1 text-ink/45">$</span><input type="number" inputMode="decimal" min="0" max="10000" step="0.01" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} onKeyDown={(event)=>{if(/[eE+-]/.test(event.key))event.preventDefault()}} className="min-w-0 flex-1 outline-none" /></span></label>;
}

function OptionEditor({ title, options, rows, setRows, allowOther = false }: { title: string; options: readonly string[]; rows: OptionRow[]; setRows: React.Dispatch<React.SetStateAction<OptionRow[]>>; allowOther?: boolean }) {
  function add() {
    const next = options.find((option) => !rows.some((row) => row.label === option)) || options[0];
    if (next) setRows((current) => [...current, { label: next, price_add: "" }]);
  }
  return <section className="rounded-[11px] border border-plum/10 bg-cream/35 p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="font-serif text-lg text-plum">{title}</h3><button type="button" onClick={add} className="flex items-center gap-1 text-[10px] font-bold text-magenta"><Plus size={13} />Add another</button></div>
    <div className="mt-3 space-y-2">{rows.map((row, index) => {
      const other = allowOther && row.label.startsWith("Other:");
      return <div key={`${row.label}-${index}`} className="grid grid-cols-[1fr_105px_28px] items-end gap-2">
        <label className="text-[10px] font-bold">Option<select value={other ? "Other" : row.label} onChange={(event) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, label: event.target.value === "Other" ? "Other: " : event.target.value } : item))} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-2 font-normal">{options.map((option) => <option key={option}>{option}</option>)}</select></label>
        <MoneyInput value={row.price_add} onChange={(value) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, price_add: value } : item))} />
        <button type="button" aria-label={`Remove ${row.label}`} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="mb-2 text-magenta"><Trash2 size={15} /></button>
        {other ? <label className="col-span-3 text-[10px] font-bold">Other add-on name<input value={row.label.slice(7)} maxLength={80} onChange={(event) => setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, label: `Other: ${event.target.value}` } : item))} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 font-normal" /></label> : null}
      </div>;
    })}{!rows.length ? <p className="rounded-[8px] border border-dashed border-plum/15 p-3 text-center text-[10px] text-ink/45">No options selected.</p> : null}</div>
  </section>;
}

function ManagedAddonEditor({ options, rows, setRows }: { options: string[]; rows: OptionRow[]; setRows: React.Dispatch<React.SetStateAction<OptionRow[]>> }) {
  return <section className="rounded-[11px] border border-plum/10 bg-cream/35 p-4"><h3 className="font-serif text-lg text-plum">Add-ons</h3><p className="mt-1 text-[10px] text-ink/55">Choose from the platform catalog, then set your price.</p><div className="mt-3 space-y-2">{options.map((option) => { const selected=rows.find((row)=>row.label===option); return <div key={option} className="grid grid-cols-[1fr_115px] items-center gap-3 rounded-[8px] border border-plum/10 bg-white p-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(selected)} onChange={(event)=>setRows((current)=>event.target.checked?[...current,{label:option,price_add:""}]:current.filter((row)=>row.label!==option))} className="accent-magenta"/>{option}</label>{selected?<MoneyInput value={selected.price_add} onChange={(value)=>setRows((current)=>current.map((row)=>row.label===option?{...row,price_add:value}:row))}/>:<span className="text-right text-[10px] text-ink/40">Not offered</span>}</div>;})}{!options.length?<Empty text="No active add-ons are available for this category."/>:null}</div></section>;
}

export function StructuredStylesEditor({ c }: { c: Context }) {
  const active = c.styles.find((style) => style.id === c.selectedStyle) || null;
  const [masters, setMasters] = useState<MasterStyle[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [groups, setGroups] = useState<Row[]>([]);
  const [catalogAddons, setCatalogAddons] = useState<Row[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [masterId, setMasterId] = useState("");
  const [description, setDescription] = useState("");
  const [durationMin, setDurationMin] = useState<NumericValue>("");
  const [durationMax, setDurationMax] = useState<NumericValue>("");
  const [basePrice, setBasePrice] = useState<NumericValue>("");
  const [maxPrice, setMaxPrice] = useState<NumericValue>("");
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [sizes, setSizes] = useState<OptionRow[]>([]);
  const [lengths, setLengths] = useState<OptionRow[]>([]);
  const [addons, setAddons] = useState<OptionRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [included, setIncluded] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void (async()=>{const [masterResult,categoryResult,groupResult,addonResult]=await Promise.all([
      supabase.from("master_styles").select("*,service_category:service_categories(id,name,slug),service_group:service_groups(id,name,category_id)").eq("is_active",true).order("name"),
      supabase.from("service_categories").select("id,name,slug").eq("is_active",true).order("name"),
      supabase.from("service_groups").select("id,name,category_id").eq("is_active",true).order("name"),
      supabase.from("service_addons").select("id,name,category_id").eq("is_active",true).order("name"),
    ]);if(!live)return;const error=masterResult.error||categoryResult.error||groupResult.error||addonResult.error;if(error)c.setNotice(error.message);else{setMasters((masterResult.data||[]) as MasterStyle[]);setCategories(categoryResult.data||[]);setGroups(groupResult.data||[]);setCatalogAddons(addonResult.data||[]);}})();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    setMasterId(String(active?.master_style_id || ""));
    setDescription(String(active?.description || ""));
    setDurationMin(active?.duration_min_hours == null ? "" : Number(active.duration_min_hours));
    setDurationMax(active?.duration_max_hours == null ? "" : Number(active.duration_max_hours));
    setBasePrice(active?.base_price == null ? "" : Number(active.base_price));
    setMaxPrice(active?.price_display_max == null ? (active?.base_price == null ? "" : Number(active.base_price)) : Number(active.price_display_max));
    setBufferMinutes(Number(active?.buffer_minutes ?? 15));
    setSizes(normalizedOptions(active?.size_options));
    setLengths(normalizedOptions(active?.length_options));
    setAddons(normalizedOptions(active?.addons));
    setIncluded(Array.isArray(active?.included_items) ? active.included_items.map(String) : []);
    setPhotos(Array.isArray(active?.photos) ? active.photos.map(String) : []);
    if (!active?.id) { setMaterials([]); return () => { live = false; }; }
    supabase.from("style_materials").select("*").eq("style_id", active.id).order("created_at").then(({ data, error }) => {
      if (!live) return;
      if (error) c.setNotice(error.message); else setMaterials((data || []).map((row) => ({ id: row.id, name: row.name, price: Number(row.price || 0), longevity_weeks: Number(row.longevity_weeks || 4), quality_grade: row.quality_grade || "Good" })));
    });
    return () => { live = false; };
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenMaster = masters.find((master) => master.id === masterId);
  useEffect(()=>{if(!chosenMaster)return;setCategoryId(String(chosenMaster.category_id||""));setGroupId(String(chosenMaster.service_group_id||chosenMaster.service_group?.id||""));},[chosenMaster]);
  const isBraiding = !chosenMaster?.service_category?.slug || chosenMaster.service_category.slug === "braiding";
  const availableGroups=groups.filter((group)=>group.category_id===categoryId);
  const availableServices=masters.filter((master)=>master.category_id===categoryId&&String(master.service_group_id||master.service_group?.id||"")===groupId);
  const availableAddons=catalogAddons.filter((addon)=>addon.category_id===categoryId).map((addon)=>String(addon.name));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!masterId || !chosenMaster) { c.setNotice("Choose a service from the managed style list."); return; }
    if (durationMin === "" || durationMax === "" || basePrice === "") { c.setNotice("Enter the service duration and base price before saving."); return; }
    if (durationMax < durationMin) { c.setNotice("Maximum duration must be equal to or greater than minimum duration."); return; }
    const resolvedMaxPrice = maxPrice === "" ? basePrice : maxPrice;
    if (resolvedMaxPrice < basePrice) { c.setNotice("Maximum price must be equal to or greater than base price."); return; }
    setSaving(true);
    const saved = await c.saveRecord("styles", {
      master_style_id: masterId,
      name: chosenMaster.name,
      category: chosenMaster.category,
      category_id: chosenMaster.category_id,
      description,
      duration_min_hours: durationMin,
      duration_max_hours: durationMax,
      buffer_minutes: bufferMinutes,
      base_price: basePrice,
      price_display_min: basePrice,
      price_display_max: resolvedMaxPrice,
      size_options: sizes.map((row)=>({...row,price_add:row.price_add === "" ? 0 : row.price_add})),
      length_options: lengths.map((row)=>({...row,price_add:row.price_add === "" ? 0 : row.price_add})),
      addons: addons.map((row)=>({...row,price_add:row.price_add === "" ? 0 : row.price_add})),
      included_items: included,
      option_groups: Array.isArray(active?.option_groups) ? active.option_groups : [],
      photos,
    }, active?.id);
    if (saved?.id) {
      const { error: materialError } = await supabase.rpc("replace_style_materials", { p_style_id: saved.id, p_materials: materials.map((material) => ({ name: material.name, price: material.price === "" ? 0 : material.price, longevity_weeks: material.longevity_weeks, quality_grade: material.quality_grade, option_type: "material", metadata: {} })) });
      if (materialError) c.setNotice(materialError.message);
      c.setStyles((rows) => active ? rows.map((row) => row.id === active.id ? saved : row) : [saved, ...rows]);
      c.setSelectedStyle(saved.id);
    }
    setSaving(false);
  }

  function addMaterial() {
    const next = MATERIAL_OPTIONS.find((option) => !materials.some((material) => material.name === option)) || MATERIAL_OPTIONS[0];
    if (next) setMaterials((current) => [...current, { name: next, price: "", longevity_weeks: 4, quality_grade: "Good" }]);
  }

  return <>
    <EditorTitle title="Styles & Pricing" subtitle="Use category-aware service options so customers can compare and book accurately." action={<button type="button" onClick={() => c.setSelectedStyle(null)} className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"><Plus className="mr-1 inline" size={16} />Add Service</button>} />
    <div className="grid gap-4 xl:grid-cols-[.7fr_1.3fr]">
      <EditorPanel><h2 className="font-serif text-xl text-plum">Your Services</h2><div className="mt-3 space-y-2">{c.styles.map((style) => { const managed = masters.find((master) => master.id === style.master_style_id); return <button key={style.id} type="button" onClick={() => c.setSelectedStyle(style.id || null)} className={`grid w-full ${style.photos?.[0] ? "grid-cols-[64px_1fr_auto]" : "grid-cols-[1fr_auto]"} gap-3 rounded-[10px] border p-3 text-left ${active?.id === style.id ? "border-magenta bg-blush/30" : "border-plum/10"}`}>{style.photos?.[0] ? <Image unoptimized width={64} height={64} src={String(style.photos[0])} alt={style.name || "Service"} className="h-16 w-16 rounded-[8px] object-cover" /> : null}<span><b className="font-serif text-base">{style.name}</b><span className="mt-1 block text-[10px] text-ink/55">{managed?.service_category?.name || "Service"} · {style.category || "General"} · {Number(style.duration_min_hours || 0)}–{Number(style.duration_max_hours || 0)} hrs</span>{!style.photos?.[0] ? <span className="mt-1 flex items-center gap-1 text-[9px] text-ink/40"><ImageIcon size={11} />No service image uploaded</span> : null}</span><span className="text-right text-[10px]">From<br /><b className="text-sm">${Number(style.price_display_min || style.base_price || 0)}</b></span></button>; })}{!c.styles.length ? <Empty text="Add your first service." /> : null}</div></EditorPanel>
      <form key={active?.id || "new"} onSubmit={save}><EditorPanel><div className="flex items-center justify-between"><h2 className="font-serif text-xl text-plum">{active ? "Edit Service" : "Add Service"}</h2><span className="text-[9px] font-bold uppercase text-green-700">Category-aware</span></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField label="Top-level category" value={categoryId} onChange={(value)=>{setCategoryId(value);setGroupId("");setMasterId("");setAddons([]);}} options={categories.map((category)=>({value:String(category.id),label:String(category.name)}))} placeholder="Choose category" /><SelectField label="Service group" value={groupId} onChange={(value)=>{setGroupId(value);setMasterId("");}} options={availableGroups.map((group)=>({value:String(group.id),label:String(group.name)}))} placeholder="Choose service group" /><SelectField label="Service name" value={masterId} onChange={setMasterId} options={availableServices.map((master)=>({value:String(master.id),label:master.name}))} placeholder="Choose service name" /><label className="sm:col-span-2 text-[10px] font-bold">Description<textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} rows={3} className="mt-1 w-full rounded-[7px] border border-plum/15 p-3 font-normal" /></label><NumberField label="Duration minimum (hours)" value={durationMin} onChange={setDurationMin} step="0.25" max={24}/><NumberField label="Duration maximum (hours)" value={durationMax} onChange={setDurationMax} step="0.25" max={24}/><MoneyInput label="Base price" value={basePrice} onChange={setBasePrice} /><MoneyInput label="Maximum displayed price" value={maxPrice} onChange={setMaxPrice} /><SelectField label="Cleanup buffer" value={String(bufferMinutes)} onChange={(value) => setBufferMinutes(Number(value))} options={[0,15,30,45,60].map((value) => ({ value: String(value), label: `${value} minutes` }))} /></div>
        {isBraiding ? <><div className="mt-5 grid gap-4 lg:grid-cols-2"><OptionEditor title="Size Options" options={SIZE_OPTIONS} rows={sizes} setRows={setSizes} /><OptionEditor title="Length Options" options={LENGTH_OPTIONS} rows={lengths} setRows={setLengths} /><ManagedAddonEditor options={availableAddons} rows={addons} setRows={setAddons} />
          <section className="rounded-[11px] border border-plum/10 bg-cream/35 p-4"><div className="flex items-center justify-between"><h3 className="font-serif text-lg text-plum">Hair / Material</h3><button type="button" onClick={addMaterial} className="flex items-center gap-1 text-[10px] font-bold text-magenta"><Plus size={13} />Add another</button></div><div className="mt-3 space-y-3">{materials.map((material, index) => <div key={`${material.name}-${index}`} className="rounded-[8px] border border-plum/10 bg-white p-3"><div className="grid gap-2 sm:grid-cols-2"><SelectField label="Material" value={material.name} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, name: value } : item))} options={MATERIAL_OPTIONS.map((value) => ({ value, label: value }))} /><MoneyInput value={material.price} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, price: value } : item))} /><SelectField label="Longevity" value={String(material.longevity_weeks)} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, longevity_weeks: Number(value) } : item))} options={MATERIAL_LONGEVITY_WEEKS.map((value) => ({ value: String(value), label: `${value} week${value === 1 ? "" : "s"}` }))} /><SelectField label="Quality" value={material.quality_grade} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, quality_grade: value } : item))} options={MATERIAL_QUALITY_OPTIONS.map((value) => ({ value, label: value }))} /></div><button type="button" onClick={() => setMaterials((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="mt-2 flex items-center gap-1 text-[10px] text-magenta"><Trash2 size={12} />Remove material</button></div>)}{!materials.length ? <Empty text="No material choices selected." /> : null}</div></section>
        </div>
        <section className="mt-4 rounded-[11px] border border-plum/10 p-4"><h3 className="font-serif text-lg text-plum">What’s Included</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{INCLUDED_ITEM_OPTIONS.map((item) => <label key={item} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={included.includes(item)} onChange={() => setIncluded((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} className="accent-magenta" />{item}</label>)}</div></section></> : <div className="mt-5 grid gap-4 lg:grid-cols-2"><ManagedAddonEditor options={availableAddons} rows={addons} setRows={setAddons}/><section className="rounded-[11px] border border-plum/10 bg-blush/25 p-4 text-xs leading-5 text-plum">This category uses the generic option-group model. Category-specific controls can be enabled when that category is launched; the managed catalog and checkout already support them.</section></div>}
        <section className="mt-4 rounded-[11px] border border-plum/10 p-4"><h3 className="font-serif text-lg text-plum">Service Image</h3><p className="mt-1 text-[10px] text-ink/55">Only salon-uploaded work is shown. No stock or generated fallback will appear.</p>{active?.id ? <ImageUpload bucket="style-photos" folder={`styles/${active.id}`} label="Upload image" value={photos} multiple maxFiles={6} onChange={(value) => setPhotos(Array.isArray(value) ? value : [])} /> : <p className="mt-3 rounded-[8px] bg-blush/30 p-3 text-xs text-plum">Save the service details first, then upload its images.</p>}</section>
        <button disabled={saving} className="mt-5 min-h-12 w-full rounded-[8px] bg-magenta text-xs font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Service"}</button>
      </EditorPanel></form>
    </div>
  </>;
}

export function StructuredStylistsEditor({ c }: { c: Context }) {
  const active = c.stylists.find((stylist) => stylist.id === c.selectedStylist) || null;
  const [masters, setMasters] = useState<MasterStyle[]>([]);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [years, setYears] = useState<NumericValue>("");
  const [avatar, setAvatar] = useState("");
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [creatingDraft, setCreatingDraft] = useState(false);

  useEffect(() => { let live = true; supabase.from("master_styles").select("id,name").eq("is_active", true).order("sort_order").order("name").then(({ data, error }) => { if (!live) return; if (error) c.setNotice(error.message); else setMasters((data || []) as MasterStyle[]); }); return () => { live = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setName(String(active?.name || "")); setBio(String(active?.bio || "").slice(0, 250)); setSpecialties(Array.isArray(active?.specialties) ? active.specialties.map(String) : []); setYears(active?.years_experience == null ? "" : Number(active.years_experience)); setAvatar(String(active?.avatar_url || "")); setPortfolio(Array.isArray(active?.photos) ? active.photos.map(String) : []); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await c.saveRecord("stylists", { name: name.trim(), bio: bio.slice(0, 250), specialties, years_experience: years === "" ? 0 : Math.min(70,Math.max(0,years)), avatar_url: avatar || null, photos: portfolio, is_active: true, is_draft: false }, active?.id);
    if (!saved) return;
    c.setStylists((rows) => active ? rows.map((row) => row.id === active.id ? saved : row) : [saved, ...rows]);
    c.setSelectedStylist(saved.id || null);
  }

  async function addDraft() {
    setCreatingDraft(true);
    const { data, error } = await supabase.rpc("create_stylist_draft", { p_salon_id: c.salon.id });
    setCreatingDraft(false);
    if (error) { c.setNotice(error.message); return; }
    const draft = data as Row;
    c.setStylists((rows) => rows.some((row) => row.id === draft.id) ? rows.map((row) => row.id === draft.id ? draft : row) : [draft, ...rows]);
    c.setSelectedStylist(draft.id || null);
    c.setNotice("Secure stylist draft created. You can upload photos or fill details in any order.");
  }

  const selectedNames = useMemo(() => new Set(specialties), [specialties]);
  return <>
    <EditorTitle title="Stylists" subtitle="Manage your team with consistent specialties drawn from the platform style list." action={<button type="button" disabled={creatingDraft} onClick={() => void addDraft()} className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white disabled:opacity-60"><Plus className="mr-1 inline" size={16} />{creatingDraft ? "Creating…" : "Add Stylist"}</button>} />
    <div className="flex gap-3 overflow-x-auto pb-4">{c.stylists.map((stylist) => <button key={stylist.id} type="button" onClick={() => c.setSelectedStylist(stylist.id || null)} className={`min-w-[190px] rounded-[11px] border p-4 text-left ${active?.id === stylist.id ? "border-magenta bg-blush/30" : "border-plum/10 bg-white"}`}>{stylist.avatar_url ? <Image unoptimized width={80} height={80} src={String(stylist.avatar_url)} alt={stylist.name || "Stylist"} className="h-20 w-20 rounded-full object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-full bg-blush text-plum"><UserRound size={30} /></span>}<p className="mt-3 font-serif text-xl text-plum">{stylist.name || "New stylist"}</p><p className="mt-1 text-[10px] text-ink/55">{Number(stylist.years_experience || 0)} years experience</p><p className="mt-2 line-clamp-2 text-[10px] text-ink/55">{Array.isArray(stylist.specialties) && stylist.specialties.length ? stylist.specialties.join(" · ") : "No specialties selected"}</p></button>)}</div>
    <form key={active?.id || "new"} onSubmit={save}><EditorPanel><h2 className="font-serif text-xl text-plum">{active ? "Edit Stylist" : "Add Stylist"}</h2><div className="mt-4 grid gap-5 xl:grid-cols-[.75fr_1fr_1.25fr]"><div>{active?.id ? <ImageUpload bucket="stylist-photos" folder={`stylists/${active.id}`} label="Profile photo" value={avatar} onChange={(value) => setAvatar(typeof value === "string" ? value : "")} /> : <div className="rounded-[12px] border border-dashed border-plum/20 bg-blush/25 p-5 text-center text-xs text-plum">Save the new stylist once to create their secure photo folder.</div>}</div><div className="space-y-4"><label className="block text-[10px] font-bold">Name<input required value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 px-3 font-normal" /></label><label className="block text-[10px] font-bold">Bio / Description<textarea value={bio} maxLength={250} onChange={(event) => setBio(event.target.value)} rows={6} className="mt-1 w-full rounded-[7px] border border-plum/15 p-3 font-normal" /><span className="mt-1 block text-right font-normal text-ink/45">{bio.length}/250</span></label><NumberField label="Years of Experience" value={years} onChange={setYears} step="1" max={70}/><button className="min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">Save Stylist</button></div><div><h3 className="font-serif text-lg text-plum">Specialties</h3><p className="mt-1 text-[10px] text-ink/55">Select from the centrally managed style list.</p><div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-[10px] border border-plum/10 p-3 sm:grid-cols-2">{masters.map((master) => <label key={master.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedNames.has(master.name)} onChange={() => setSpecialties((current) => current.includes(master.name) ? current.filter((item) => item !== master.name) : [...current, master.name])} className="accent-magenta" />{master.name}</label>)}</div>{active?.id ? <div className="mt-5"><ImageUpload bucket="stylist-photos" multiple maxFiles={10} folder={`stylists/${active.id}/portfolio`} label="Work Portfolio" value={portfolio} onChange={(value) => setPortfolio(Array.isArray(value) ? value : [])} /></div> : null}</div></div></EditorPanel></form>
  </>;
}

function EditorTitle({ title, subtitle, action }: { title: string; subtitle: string; action: React.ReactNode }) { return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="font-serif text-[36px] font-semibold leading-none tracking-[-.035em] text-plum sm:text-[48px]">{title}</h1><p className="mt-2 text-sm text-ink/65">{subtitle}</p></div>{action}</div>; }
function EditorPanel({ children }: { children: React.ReactNode }) { return <section className="min-w-0 rounded-[13px] border border-plum/10 bg-white/70 p-4 shadow-[0_5px_18px_rgba(26,18,32,.035)] sm:p-5">{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="rounded-[8px] border border-dashed border-plum/15 p-4 text-center text-[10px] text-ink/50">{text}</p>; }
function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) { return <label className="text-[10px] font-bold">{label}<select value={value} required onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-2 font-normal">{placeholder ? <option value="">{placeholder}</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function NumberField({ label, value, onChange, step, max=10000 }: { label: string; value: NumericValue; onChange: (value: NumericValue) => void; step: string; max?: number }) { return <label className="text-[10px] font-bold">{label}<input type="number" inputMode="decimal" min="0" max={max} step={step} value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} onKeyDown={(event)=>{if(/[eE+-]/.test(event.key))event.preventDefault()}} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 px-3 font-normal" /></label>; }
