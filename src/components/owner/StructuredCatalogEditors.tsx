/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ImageIcon, Plus, Trash2, UserRound } from "lucide-react";
import BaseImageUpload from "@/components/ImageUpload";
import { sortCatalogRecords } from "@/lib/catalogOrdering";
import { getSessionForScope, salonSupabase as supabase } from "@/lib/supabase";
import { useI18n } from "@/components/i18n/LocaleProvider";
import {
  INCLUDED_ITEM_OPTIONS,
  LENGTH_OPTIONS,
  MATERIAL_LONGEVITY_WEEKS,
  MATERIAL_OPTIONS,
  MATERIAL_QUALITY_OPTIONS,
  SIZE_OPTIONS,
} from "@/lib/salonPresets";
import NumericInput from "@/components/forms/NumericInput";
import MobileRecordEditor from "@/components/owner/MobileRecordEditor";
import { OwnerDetailHeader } from "@/components/owner/OwnerWorkflowUi";
import SalonSpreadsheetPanel from "@/components/owner/SalonSpreadsheetPanel";
import { readApiResponse } from "@/lib/apiResponseClient";

type Row = Record<string, any> & { id?: string; name?: string };
type MasterStyle = Record<string, any> & { id: string; name: string; category?: string; category_id?: string; service_group_id?: string; service_category?: { id?: string; name?: string; slug?: string } | null; service_group?: { id?: string; name?: string; category_id?: string } | null };
type NumericValue = string;
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
  return raw.map((item) => typeof item === "string" ? { label: item, price_add: "0" } : {
    label: String(item?.label || item?.value || ""),
    price_add: String(item?.price_add ?? item?.price ?? 0),
  }).filter((item) => item.label);
}

function MoneyInput({ value, onChange, label = "Price" }: { value: NumericValue; onChange: (value: NumericValue) => void; label?: string }) {
  return <label className="text-[10px] font-bold">{label}<span className="mt-1 flex min-h-10 items-center rounded-[7px] border border-plum/15 bg-white px-3"><span className="mr-1 text-ink/45">$</span><NumericInput min={0} max={10000} decimalPlaces={2} value={value} onValueChange={onChange} className="min-w-0 flex-1 outline-none" /></span></label>;
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

export function StructuredStylesEditor({ c, recordId = "" }: { c: Context; recordId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = recordId === "new" ? null : c.styles.find((style) => style.id === recordId) || null;
  const [masters, setMasters] = useState<MasterStyle[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [groups, setGroups] = useState<Row[]>([]);
  const [catalogAddons, setCatalogAddons] = useState<Row[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [masterId, setMasterId] = useState("");
  const [displayName, setDisplayName] = useState("");
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
  const [serviceQuery, setServiceQuery] = useState(searchParams.get("q") || "");
  const [serviceCategory, setServiceCategory] = useState(searchParams.get("category") || "all");
  const [serviceGroup, setServiceGroup] = useState(searchParams.get("group") || "all");
  const [serviceStatus, setServiceStatus] = useState(searchParams.get("status") || "all");
  const [engineOptions,setEngineOptions]=useState({sizes:[...SIZE_OPTIONS] as string[],lengths:[...LENGTH_OPTIONS] as string[],materials:[...MATERIAL_OPTIONS] as string[],quality:[...MATERIAL_QUALITY_OPTIONS] as string[],longevity:[...MATERIAL_LONGEVITY_WEEKS] as number[],included:[...INCLUDED_ITEM_OPTIONS] as string[],defaultBuffer:15});

  useEffect(()=>{let live=true;void fetch("/api/config?keys=catalog.size_options,catalog.length_options,catalog.material_options,catalog.material_quality_grades,catalog.material_longevity_weeks,catalog.included_items,booking.default_buffer_minutes").then((response)=>readApiResponse(response,"We couldn't load the service catalog options.")).then(body=>{if(body.error)throw new Error(body.error);if(!live)return;const config=(body.config||{}) as Record<string,unknown>;const list=(key:string,fallback:string[])=>Array.isArray(config[key])?config[key].map(String).filter(Boolean):fallback;const longevity=list("catalog.material_longevity_weeks",MATERIAL_LONGEVITY_WEEKS.map(String)).map(Number).filter(value=>Number.isInteger(value)&&value>0&&value<=52);const defaultBuffer=Number(config["booking.default_buffer_minutes"]);setEngineOptions({sizes:list("catalog.size_options",[...SIZE_OPTIONS]),lengths:list("catalog.length_options",[...LENGTH_OPTIONS]),materials:list("catalog.material_options",[...MATERIAL_OPTIONS]),quality:list("catalog.material_quality_grades",[...MATERIAL_QUALITY_OPTIONS]),longevity:longevity.length?longevity:[...MATERIAL_LONGEVITY_WEEKS],included:list("catalog.included_items",[...INCLUDED_ITEM_OPTIONS]),defaultBuffer:Number.isFinite(defaultBuffer)&&defaultBuffer>=0&&defaultBuffer<=180?defaultBuffer:15});}).catch(()=>undefined);return()=>{live=false}},[]);

  useEffect(() => {
    let live = true;
    void (async()=>{const [masterResult,categoryResult,groupResult,addonResult]=await Promise.all([
      supabase.from("master_styles").select("*,service_category:service_categories(id,name,slug),service_group:service_groups(id,name,category_id)").eq("is_active",true).order("name"),
      supabase.from("service_categories").select("id,name,slug").eq("is_active",true).order("name"),
      supabase.from("service_groups").select("id,name,category_id").eq("is_active",true).order("name"),
      supabase.from("service_addons").select("id,name,category_id").eq("is_active",true).order("name"),
    ]);if(!live)return;const error=masterResult.error||categoryResult.error||groupResult.error||addonResult.error;if(error)c.setNotice("The service catalog could not be loaded. Please retry; if this continues, contact support.");else{setMasters(sortCatalogRecords((masterResult.data||[]) as MasterStyle[]));setCategories(sortCatalogRecords(categoryResult.data||[]));setGroups(sortCatalogRecords(groupResult.data||[]));setCatalogAddons(sortCatalogRecords(addonResult.data||[]));}})();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    setMasterId(String(active?.master_style_id || ""));
    setGroupId(String(active?.service_group_id || ""));
    setCategoryId(String(active?.category_id || ""));
    setDisplayName(String(active?.name || ""));
    setDescription(String(active?.description || ""));
    setDurationMin(active?.duration_min_hours == null ? "" : String(active.duration_min_hours));
    setDurationMax(active?.duration_max_hours == null ? "" : String(active.duration_max_hours));
    setBasePrice(active?.base_price == null ? "" : String(active.base_price));
    setMaxPrice(active?.price_display_max == null ? (active?.base_price == null ? "" : String(active.base_price)) : String(active.price_display_max));
    setBufferMinutes(Number(active?.buffer_minutes ?? engineOptions.defaultBuffer));
    setSizes(normalizedOptions(active?.size_options));
    setLengths(normalizedOptions(active?.length_options));
    setAddons(normalizedOptions(active?.addons));
    setIncluded(Array.isArray(active?.included_items) ? active.included_items.map(String) : []);
    setPhotos(Array.isArray(active?.photos) ? active.photos.map(String) : []);
    if (!active?.id) { setMaterials([]); return () => { live = false; }; }
    void getSessionForScope("salon").then(async(session)=>{
      if(!session)throw new Error("Your salon session expired. Please sign in again.");
      const response=await fetch(`/api/salon/records?table=style_materials&style_id=${encodeURIComponent(String(active.id))}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"});
      const body=await readApiResponse(response,"We couldn't load the service materials.") as {records?:Row[];error?:string};
      if(!response.ok||body.error)throw new Error(body.error||"We couldn't load the service materials.");
      if (!live) return;
      setMaterials((body.records || []).map((row) => ({ id: row.id, name: String(row.name||""), price: String(row.price ?? 0), longevity_weeks: Number(row.longevity_weeks || 4), quality_grade: String(row.quality_grade || "Good") })));
    }).catch((error)=>{if(live)c.setNotice(error instanceof Error?error.message:"We couldn't load the service materials.");});
    return () => { live = false; };
  }, [active?.id,engineOptions.defaultBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenMaster = masters.find((master) => master.id === masterId);
  useEffect(()=>{if(!chosenMaster)return;setCategoryId(String(chosenMaster.category_id||""));setGroupId(String(chosenMaster.service_group_id||chosenMaster.service_group?.id||""));},[chosenMaster]);
  const chosenGroup = groups.find((group) => group.id === groupId);
  const chosenCategory = categories.find((category) => category.id === categoryId);
  const isBraiding = chosenCategory?.slug === "braiding";
  const availableGroups=groups.filter((group)=>group.category_id===categoryId);
  const availableServices=masters.filter((master)=>master.category_id===categoryId&&String(master.service_group_id||master.service_group?.id||"")===groupId);
  const availableAddons=catalogAddons.filter((addon)=>addon.category_id===categoryId).map((addon)=>String(addon.name));
  const listParams = new URLSearchParams({ ...(serviceQuery ? { q: serviceQuery } : {}), ...(serviceCategory !== "all" ? { category: serviceCategory } : {}), ...(serviceGroup !== "all" ? { group: serviceGroup } : {}), ...(serviceStatus !== "all" ? { status: serviceStatus } : {}) });
  const stylesListHref = `/salon/dashboard/styles${listParams.toString() ? `?${listParams}` : ""}`;
  const visibleStyles = c.styles.filter((style) => {
    const needle = serviceQuery.trim().toLowerCase();
    const status = style.is_active === false || style.is_draft === true ? "inactive" : "active";
    return (!needle || [style.name, style.category, masters.find((master) => master.id === style.master_style_id)?.name].some((value) => String(value || "").toLowerCase().includes(needle))) &&
      (serviceCategory === "all" || String(style.category_id || "") === serviceCategory) &&
      (serviceGroup === "all" || String(style.service_group_id || "") === serviceGroup) &&
      (serviceStatus === "all" || status === serviceStatus);
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupId || !chosenGroup || !categoryId || !chosenCategory) { c.setNotice("Choose a category and service group."); return; }
    const customerFacingName = chosenMaster?.name || displayName.trim() || String(chosenGroup.name || "").trim();
    if (!customerFacingName) { c.setNotice("Enter the service name customers should see."); return; }
    if (durationMin === "" || durationMax === "" || basePrice === "") { c.setNotice("Enter the service duration and base price before saving."); return; }
    if (Number(durationMax) < Number(durationMin)) { c.setNotice("Maximum duration must be equal to or greater than minimum duration."); return; }
    const resolvedMaxPrice = maxPrice === "" ? basePrice : maxPrice;
    if (Number(resolvedMaxPrice) < Number(basePrice)) { c.setNotice("Maximum price must be equal to or greater than base price."); return; }
    setSaving(true);
    const saved = await c.saveRecord("styles", {
      master_style_id: masterId || null,
      service_group_id: groupId,
      name: customerFacingName,
      category: String(chosenGroup.name || ""),
      category_id: categoryId,
      description,
      duration_min_hours: Number(durationMin),
      duration_max_hours: Number(durationMax),
      buffer_minutes: bufferMinutes,
      base_price: Number(basePrice),
      price_display_min: Number(basePrice),
      price_display_max: Number(resolvedMaxPrice),
      size_options: sizes.map((row)=>({...row,price_add:row.price_add === "" ? 0 : Number(row.price_add)})),
      length_options: lengths.map((row)=>({...row,price_add:row.price_add === "" ? 0 : Number(row.price_add)})),
      addons: addons.map((row)=>({...row,price_add:row.price_add === "" ? 0 : Number(row.price_add)})),
      included_items: included,
      option_groups: Array.isArray(active?.option_groups) ? active.option_groups : [],
      photos,
      style_materials: materials.map((material) => ({
        name: material.name,
        price: material.price === "" ? 0 : Number(material.price),
        longevity_weeks: material.longevity_weeks,
        quality_grade: material.quality_grade,
      })),
    }, active?.id);
    if (saved?.id) {
      c.setStyles((rows) => active ? rows.map((row) => row.id === active.id ? saved : row) : [saved, ...rows]);
      c.setSelectedStyle(saved.id);
      if (!active) router.replace(`/salon/dashboard/styles/${saved.id}${listParams.toString() ? `?${listParams}` : ""}`);
    }
    setSaving(false);
  }

  function addMaterial() {
    const next = engineOptions.materials.find((option) => !materials.some((material) => material.name === option)) || engineOptions.materials[0];
    if (next) setMaterials((current) => [...current, { name: next, price: "", longevity_weeks: 4, quality_grade: "Good" }]);
  }

  return <>
    {!recordId ? <EditorTitle title="Styles & Pricing" subtitle="Use category-aware service options so customers can compare and book accurately." action={<Link href={`/salon/dashboard/styles/new${listParams.toString() ? `?${listParams}` : ""}`} className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"><Plus className="mr-1 inline" size={16} />Add Service</Link>} /> : null}
    {!recordId ? <SalonSpreadsheetPanel
      kind="services"
      onImported={(records) => {
        c.setStyles(records);
        if (
          c.selectedStyle &&
          !records.some((record) => record.id === c.selectedStyle)
        ) {
          c.setSelectedStyle(null);
        }
      }}
    /> : null}
    <div className="block">
      {!recordId ? <EditorPanel><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-xl text-plum">Your Services</h2><p className="mt-1 text-[10px] text-ink/50">{visibleStyles.length} matching service{visibleStyles.length === 1 ? "" : "s"}</p></div><div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-4"><input aria-label="Search services" value={serviceQuery} onChange={(event)=>setServiceQuery(event.target.value)} placeholder="Search services" className="min-h-10 rounded-lg border border-plum/15 px-3 text-xs"/><select aria-label="Service category" value={serviceCategory} onChange={(event)=>{setServiceCategory(event.target.value);setServiceGroup("all");}} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All categories</option>{categories.map((category)=><option key={category.id} value={String(category.id)}>{String(category.name)}</option>)}</select><select aria-label="Service group" value={serviceGroup} onChange={(event)=>setServiceGroup(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All service groups</option>{groups.filter((group)=>serviceCategory === "all" || String(group.category_id) === serviceCategory).map((group)=><option key={group.id} value={String(group.id)}>{String(group.name)}</option>)}</select><select aria-label="Service status" value={serviceStatus} onChange={(event)=>setServiceStatus(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive / draft</option></select></div></div><div className="mt-3 space-y-2">{visibleStyles.map((style) => { const managed = masters.find((master) => master.id === style.master_style_id); const status = style.is_active === false || style.is_draft === true ? "Inactive / draft" : "Active"; return <button key={style.id} type="button" onClick={() => router.push(`/salon/dashboard/styles/${style.id}${listParams.toString() ? `?${listParams}` : ""}`)} className={`grid w-full ${style.photos?.[0] ? "grid-cols-[64px_1fr_auto]" : "grid-cols-[1fr_auto]"} gap-3 rounded-[10px] border border-plum/10 p-3 text-left`}>{style.photos?.[0] ? <Image unoptimized width={64} height={64} src={String(style.photos[0])} alt={style.name || "Service"} className="h-16 w-16 rounded-[8px] object-cover" /> : null}<span><b className="font-serif text-base">{style.name}</b><span className="mt-1 block text-[10px] text-ink/55">{managed?.service_category?.name || "Service"} · {style.category || "General"} · {Number(style.duration_min_hours || 0)}–{Number(style.duration_max_hours || 0)} hrs</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-blush text-plum"}`}>{status}</span>{!style.photos?.[0] ? <span className="mt-1 flex items-center gap-1 text-[9px] text-ink/40"><ImageIcon size={11} />No service image uploaded</span> : null}</span><span className="text-right text-[10px]">From<br /><b className="text-sm">${Number(style.price_display_min || style.base_price || 0)}</b></span></button>; })}{!visibleStyles.length ? <Empty text={c.styles.length ? "No services match these filters." : "Add your first service."} /> : null}</div></EditorPanel> : null}
      <MobileRecordEditor open={Boolean(recordId)} title={active ? `Edit ${active.name || "service"}` : "Add service"} onClose={() => router.push(stylesListHref)}><form key={active?.id || "new"} onSubmit={save}><OwnerDetailHeader hideOnMobile title={active ? `Edit ${active.name || "service"}` : "Add service"} subtitle="Keep pricing, duration, options, inclusions, and service media together." fallbackHref={stylesListHref} status={active ? "Published service" : "New service"}/><EditorPanel><div className="flex items-center justify-between"><h2 className="font-serif text-xl text-plum">Service details</h2><span className="text-[9px] font-bold uppercase text-green-700">Category-aware</span></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField label="Top-level category" value={categoryId} onChange={(value)=>{setCategoryId(value);setGroupId("");setMasterId("");setDisplayName("");setAddons([]);}} options={categories.map((category)=>({value:String(category.id),label:String(category.name)}))} placeholder="Choose category" /><SelectField label="Service group" value={groupId} onChange={(value)=>{setGroupId(value);setMasterId("");setDisplayName(String(groups.find((group)=>group.id===value)?.name||""));}} options={availableGroups.map((group)=>({value:String(group.id),label:String(group.name)}))} placeholder="Choose service group" /><SelectField required={false} label="Specific service name (optional)" value={masterId} onChange={(value)=>{setMasterId(value);const managed=masters.find((master)=>master.id===value);if(managed)setDisplayName(managed.name);}} options={availableServices.map((master)=>({value:String(master.id),label:master.name}))} placeholder="Sell the whole group" /><label className="text-[10px] font-bold">{t("services.customer_name_label", "Service name customers will see")}<input required value={displayName} onChange={(event)=>setDisplayName(event.target.value.slice(0,120))} disabled={Boolean(chosenMaster)} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 font-normal disabled:bg-blush/35" /><span className="mt-1 block font-normal text-ink/50">{t("services.customer_name_help", "Enter the name you want customers to see when browsing and booking.")}</span></label><label className="sm:col-span-2 text-[10px] font-bold">Description<textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} rows={3} className="mt-1 w-full rounded-[7px] border border-plum/15 p-3 font-normal" /></label><NumberField label="Duration minimum (hours)" value={durationMin} onChange={setDurationMin} step="0.25" max={24}/><NumberField label="Duration maximum (hours)" value={durationMax} onChange={setDurationMax} step="0.25" max={24}/><MoneyInput label="Base price" value={basePrice} onChange={setBasePrice} /><MoneyInput label="Maximum displayed price" value={maxPrice} onChange={setMaxPrice} /><SelectField label="Cleanup buffer" value={String(bufferMinutes)} onChange={(value) => setBufferMinutes(Number(value))} options={[0,15,30,45,60].map((value) => ({ value: String(value), label: `${value} minutes` }))} /></div>
        {isBraiding ? <><div className="mt-5 grid gap-4 lg:grid-cols-2"><OptionEditor title="Size Options" options={engineOptions.sizes} rows={sizes} setRows={setSizes} /><OptionEditor title="Length Options" options={engineOptions.lengths} rows={lengths} setRows={setLengths} /><ManagedAddonEditor options={availableAddons} rows={addons} setRows={setAddons} />
          <section className="rounded-[11px] border border-plum/10 bg-cream/35 p-4"><div className="flex items-center justify-between"><h3 className="font-serif text-lg text-plum">Hair / Material</h3><button type="button" onClick={addMaterial} className="flex items-center gap-1 text-[10px] font-bold text-magenta"><Plus size={13} />Add another</button></div><div className="mt-3 space-y-3">{materials.map((material, index) => <div key={`${material.name}-${index}`} className="rounded-[8px] border border-plum/10 bg-white p-3"><div className="grid gap-2 sm:grid-cols-2"><SelectField label="Material" value={material.name} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, name: value } : item))} options={engineOptions.materials.map((value) => ({ value, label: value }))} /><MoneyInput value={material.price} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, price: value } : item))} /><SelectField label="Longevity" value={String(material.longevity_weeks)} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, longevity_weeks: Number(value) } : item))} options={engineOptions.longevity.map((value) => ({ value: String(value), label: `${value} week${value === 1 ? "" : "s"}` }))} /><SelectField label="Quality" value={material.quality_grade} onChange={(value) => setMaterials((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, quality_grade: value } : item))} options={engineOptions.quality.map((value) => ({ value, label: value }))} /></div><button type="button" onClick={() => setMaterials((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="mt-2 flex items-center gap-1 text-[10px] text-magenta"><Trash2 size={12} />Remove material</button></div>)}{!materials.length ? <Empty text="No material choices selected." /> : null}</div></section>
        </div>
        <section className="mt-4 rounded-[11px] border border-plum/10 p-4"><h3 className="font-serif text-lg text-plum">What’s Included</h3><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{engineOptions.included.map((item) => <label key={item} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={included.includes(item)} onChange={() => setIncluded((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} className="accent-magenta" />{item}</label>)}</div></section></> : <div className="mt-5"><ManagedAddonEditor options={availableAddons} rows={addons} setRows={setAddons}/></div>}
        <section className="mt-4 rounded-[11px] border border-plum/10 p-4"><h3 className="font-serif text-lg text-plum">Service Image</h3><p className="mt-1 text-[10px] text-ink/55">Only salon-uploaded work is shown. No stock or generated fallback will appear.</p>{active?.id ? <ImageUpload bucket="style-photos" preset="service" folder={`styles/${active.id}`} label="Upload image" value={photos} multiple maxFiles={6} attachment={{ record_type: "style", record_id: String(active.id), field: "photos" }} onChange={(value) => setPhotos(Array.isArray(value) ? value : [])} onPersisted={(value) => { const next = Array.isArray(value) ? value.map(String) : []; setPhotos(next); c.setStyles((rows) => rows.map((row) => row.id === active.id ? { ...row, photos: next } : row)); }} /> : <p className="mt-3 rounded-[8px] bg-blush/30 p-3 text-xs text-plum">Save the service details first, then upload its images.</p>}</section>
        <button disabled={saving} className="mt-5 min-h-12 w-full rounded-[8px] bg-magenta text-xs font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save Service"}</button>
        {active?.id ? <button type="button" onClick={async () => { await c.removeRecord("styles", active.id!, c.setStyles); c.setSelectedStyle(null); router.push(stylesListHref); }} className="mt-3 min-h-12 w-full rounded-[8px] border border-red-200 text-xs font-bold text-red-700">Archive or remove service</button> : null}
      </EditorPanel></form></MobileRecordEditor>
    </div>
  </>;
}

export function StructuredStylistsEditor({ c, recordId = "" }: { c: Context; recordId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = recordId === "new" ? null : c.stylists.find((stylist) => stylist.id === recordId) || null;
  const [masters, setMasters] = useState<MasterStyle[]>([]);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [years, setYears] = useState<NumericValue>("");
  const [avatar, setAvatar] = useState("");
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [stylistQuery, setStylistQuery] = useState(searchParams.get("q") || "");
  const [stylistStatus, setStylistStatus] = useState(searchParams.get("status") || "all");
  const [availabilityFilter, setAvailabilityFilter] = useState(searchParams.get("availability") || "all");
  const [temporaryPhotoKey, setTemporaryPhotoKey] = useState(() => crypto.randomUUID());

  useEffect(() => { let live = true; supabase.from("master_styles").select("id,name,sort_order").eq("is_active", true).order("sort_order").order("name").then(({ data, error }) => { if (!live) return; if (error) c.setNotice("The specialty catalog could not be loaded. Please retry; if this continues, contact support."); else setMasters(sortCatalogRecords((data || []) as MasterStyle[])); }); return () => { live = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setName(String(active?.name || "")); setBio(String(active?.bio || "").slice(0, 250)); setSpecialties(Array.isArray(active?.specialties) ? active.specialties.map(String) : []); setYears(active?.years_experience == null ? "" : String(active.years_experience)); setAvatar(String(active?.avatar_url || "")); setPortfolio(Array.isArray(active?.photos) ? active.photos.map(String) : []); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await c.saveRecord("stylists", { name: name.trim(), bio: bio.slice(0, 250), specialties, years_experience: years === "" ? 0 : Math.min(70, Math.max(0, Number(years))), avatar_url: avatar || null, photos: portfolio, is_active: true, is_draft: false }, active?.id);
    if (!saved) return;
    c.setStylists((rows) => active ? rows.map((row) => row.id === active.id ? saved : row) : [saved, ...rows]);
    c.setSelectedStylist(saved.id || null);
    setTemporaryPhotoKey(crypto.randomUUID());
    if (!active && saved.id) router.replace(`/salon/dashboard/stylists/${saved.id}${stylistListParams.toString() ? `?${stylistListParams}` : ""}`);
  }

  const selectedNames = useMemo(() => new Set(specialties), [specialties]);
  const temporaryFolder = `salons/${c.salon.id}/staging/stylist-${temporaryPhotoKey}`;
  const stylistListParams = new URLSearchParams({ ...(stylistQuery ? { q: stylistQuery } : {}), ...(stylistStatus !== "all" ? { status: stylistStatus } : {}), ...(availabilityFilter !== "all" ? { availability: availabilityFilter } : {}) });
  const stylistListHref = `/salon/dashboard/stylists${stylistListParams.toString() ? `?${stylistListParams}` : ""}`;
  const visibleStylists = c.stylists.filter((stylist) => {
    const needle = stylistQuery.trim().toLowerCase();
    const status = stylist.is_active === false ? "inactive" : "active";
    const availability = stylist.availability && typeof stylist.availability === "object" ? Object.values(stylist.availability as Record<string, Row>) : [];
    const hasAvailability = availability.some((day) => day?.closed !== true && Boolean(day?.open && day?.close));
    return (!needle || [stylist.name, stylist.bio, ...(Array.isArray(stylist.specialties) ? stylist.specialties : [])].some((value)=>String(value || "").toLowerCase().includes(needle))) &&
      (stylistStatus === "all" || status === stylistStatus) &&
      (availabilityFilter === "all" || (availabilityFilter === "set" ? hasAvailability : !hasAvailability));
  });
  function startNewStylist() {
    c.setSelectedStylist(null);
    setName("");
    setBio("");
    setSpecialties([]);
    setYears("");
    setAvatar("");
    setPortfolio([]);
    setTemporaryPhotoKey(crypto.randomUUID());
    router.push(`/salon/dashboard/stylists/new${stylistListParams.toString() ? `?${stylistListParams}` : ""}`);
  }
  return <>
    {!recordId ? <EditorTitle title="Stylists" subtitle="Manage your team with consistent specialties drawn from the platform style list." action={<button type="button" onClick={startNewStylist} className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"><Plus className="mr-1 inline" size={16} />Add Stylist</button>} /> : null}
    {!recordId ? <><div className="mb-4 grid gap-2 rounded-xl border border-plum/10 bg-white p-4 sm:grid-cols-3"><input aria-label="Search stylists" value={stylistQuery} onChange={(event)=>setStylistQuery(event.target.value)} placeholder="Search name or specialty" className="min-h-10 rounded-lg border border-plum/15 px-3 text-xs"/><select aria-label="Stylist status" value={stylistStatus} onChange={(event)=>setStylistStatus(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><select aria-label="Stylist availability" value={availabilityFilter} onChange={(event)=>setAvailabilityFilter(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All availability states</option><option value="set">Schedule set</option><option value="missing">Schedule missing</option></select><p className="sm:col-span-3 text-[10px] text-ink/50">{visibleStylists.length} matching stylist{visibleStylists.length === 1 ? "" : "s"}</p></div><div className="flex gap-3 overflow-x-auto pb-4">{visibleStylists.map((stylist) => { const availability = stylist.availability && typeof stylist.availability === "object" ? Object.values(stylist.availability as Record<string, Row>) : []; const hasAvailability = availability.some((day) => day?.closed !== true && Boolean(day?.open && day?.close)); const status = stylist.is_active === false ? "Inactive" : "Active"; return <button key={stylist.id} type="button" onClick={() => router.push(`/salon/dashboard/stylists/${stylist.id}${stylistListParams.toString() ? `?${stylistListParams}` : ""}`)} className="min-w-[210px] rounded-[11px] border border-plum/10 bg-white p-4 text-left">{stylist.avatar_url ? <Image unoptimized width={80} height={80} src={String(stylist.avatar_url)} alt={stylist.name || "Stylist"} className="h-20 w-20 rounded-full object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-full bg-blush text-plum"><UserRound size={30} /></span>}<div className="mt-3 flex items-start justify-between gap-2"><p className="font-serif text-xl text-plum">{stylist.name || "New stylist"}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-blush text-plum"}`}>{status}</span></div><p className="mt-1 text-[10px] text-ink/55">{Number(stylist.years_experience || 0)} years experience</p><p className={`mt-2 text-[10px] font-semibold ${hasAvailability ? "text-emerald-700" : "text-amber-800"}`}>{hasAvailability ? "Availability configured" : "Availability needs setup"}</p><p className="mt-2 line-clamp-2 text-[10px] text-ink/55">{Array.isArray(stylist.specialties) && stylist.specialties.length ? stylist.specialties.join(" · ") : "No specialties selected"}</p></button>;})}{!visibleStylists.length ? <Empty text={c.stylists.length ? "No stylists match these filters." : "Add your first stylist."}/> : null}</div></> : null}
    <MobileRecordEditor open={Boolean(recordId)} title={active ? `Edit ${active.name || "stylist"}` : "Add stylist"} onClose={() => router.push(stylistListHref)}><form key={active?.id || temporaryPhotoKey} onSubmit={save}><OwnerDetailHeader hideOnMobile title={active ? `Edit ${active.name || "stylist"}` : "Add stylist"} subtitle="Manage the stylist profile, specialties, experience, and portfolio in one focused workspace." fallbackHref={stylistListHref} status={active ? "Active stylist" : "New stylist"}/><EditorPanel><h2 className="font-serif text-xl text-plum">Stylist details</h2><p className="mt-1 text-[10px] text-ink/55">Start with any field. Nothing appears publicly until the complete form saves successfully.</p><div className="mt-4 grid gap-5 xl:grid-cols-[.75fr_1fr_1.25fr]"><div><ImageUpload bucket="stylist-photos" preset="avatar" folder={active?.id ? `stylists/${active.id}` : temporaryFolder} label="Profile photo" helperText={active?.id ? "Upload or adjust the stylist’s public profile photo." : "Save the stylist details first, then add the profile photo."} value={avatar} attachment={active?.id ? { record_type: "stylist", record_id: String(active.id), field: "avatar_url" } : null} onChange={(value) => setAvatar(typeof value === "string" ? value : "")} onPersisted={(value) => { const next = typeof value === "string" ? value : ""; setAvatar(next); if (active?.id) c.setStylists((rows) => rows.map((row) => row.id === active.id ? { ...row, avatar_url: next || null } : row)); }} /></div><div className="space-y-4"><label className="block text-[10px] font-bold">Name<input required value={name} onChange={(event) => setName(event.target.value.slice(0, 120))} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 px-3 font-normal" /></label><label className="block text-[10px] font-bold">Bio / Description<textarea value={bio} maxLength={250} onChange={(event) => setBio(event.target.value)} rows={6} className="mt-1 w-full rounded-[7px] border border-plum/15 p-3 font-normal" /><span className="mt-1 block text-right font-normal text-ink/45">{bio.length}/250</span></label><NumberField label="Years of Experience" value={years} onChange={setYears} step="1" max={70}/><button className="min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">Save Stylist</button>{active?.id ? <button type="button" onClick={async () => { await c.removeRecord("stylists", active.id!, c.setStylists); c.setSelectedStylist(null); router.push(stylistListHref); }} className="min-h-11 w-full rounded-[8px] border border-red-200 text-xs font-bold text-red-700">Archive or remove stylist</button> : null}</div><div><h3 className="font-serif text-lg text-plum">Specialties</h3><p className="mt-1 text-[10px] text-ink/55">Select from the centrally managed style list.</p><div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-[10px] border border-plum/10 p-3 sm:grid-cols-2">{masters.map((master) => <label key={master.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedNames.has(master.name)} onChange={() => setSpecialties((current) => current.includes(master.name) ? current.filter((item) => item !== master.name) : [...current, master.name])} className="accent-magenta" />{master.name}</label>)}</div><div className="mt-5"><ImageUpload bucket="stylist-photos" preset="gallery" multiple maxFiles={10} folder={active?.id ? `stylists/${active.id}/portfolio` : `${temporaryFolder}/portfolio`} label="Work Portfolio" helperText={active?.id ? "Select several work photos; each upload is saved independently." : "Save the stylist details first, then add portfolio photos."} value={portfolio} attachment={active?.id ? { record_type: "stylist", record_id: String(active.id), field: "photos" } : null} onChange={(value) => setPortfolio(Array.isArray(value) ? value : [])} onPersisted={(value) => { const next = Array.isArray(value) ? value.map(String) : []; setPortfolio(next); if (active?.id) c.setStylists((rows) => rows.map((row) => row.id === active.id ? { ...row, photos: next } : row)); }} /></div></div></div></EditorPanel></form></MobileRecordEditor>
  </>;
}

function EditorTitle({ title, subtitle, action }: { title: string; subtitle: string; action: React.ReactNode }) { return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="font-serif text-[36px] font-semibold leading-none tracking-[-.035em] text-plum sm:text-[48px]">{title}</h1><p className="mt-2 text-sm text-ink/65">{subtitle}</p></div>{action}</div>; }
function EditorPanel({ children }: { children: React.ReactNode }) { return <section className="min-w-0 rounded-[13px] border border-plum/10 bg-white/70 p-4 shadow-[0_5px_18px_rgba(13,17,20,.035)] sm:p-5">{children}</section>; }
function Empty({ text }: { text: string }) { return <p className="rounded-[8px] border border-dashed border-plum/15 p-4 text-center text-[10px] text-ink/50">{text}</p>; }
function SelectField({ label, value, onChange, options, placeholder, required = true }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string; required?: boolean }) { return <label className="text-[10px] font-bold">{label}<select value={value} required={required} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-2 font-normal">{placeholder ? <option value="">{placeholder}</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function NumberField({ label, value, onChange, step, max=10000 }: { label: string; value: NumericValue; onChange: (value: NumericValue) => void; step: string; max?: number }) { const decimals = step.includes(".") ? step.split(".")[1].length : 0; return <label className="text-[10px] font-bold">{label}<NumericInput integer={decimals === 0} decimalPlaces={decimals} min={0} max={max} value={value} onValueChange={onChange} className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 px-3 font-normal" /></label>; }
