"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock3, Crown, ImageIcon, LayoutGrid, List, Scissors, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { completedServiceCounts, popularServiceIds } from "@/lib/businessCatalogPerformance";

type Row = Record<string, unknown> & { id?: string; name?: string };
type Props = {
  salon: Row; styles: Row[]; visible: Row[]; bookings: Row[]; canReadBookings: boolean;
  categories: Row[]; groups: Row[]; query: string; category: string; group: string; status: string;
  setQuery: (value: string) => void; setCategory: (value: string) => void; setGroup: (value: string) => void; setStatus: (value: string) => void;
  listParams: URLSearchParams; save: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
};

export default function ServicesWorkspace(p: Props) {
  const { translateSource: t, formatCurrency, formatNumber, formatDate } = useI18n();
  const view = p.listParams.get("view") === "list" ? "list" : "grid";
  const sort = p.listParams.get("sort") || "custom";
  const featuredOnly = p.listParams.get("featured") === "true";
  const [pending, setPending] = useState<string | null>(null);
  function setPreference(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (["grid","custom","false"].includes(value)) params.delete(key); else params.set(key,value);
    window.history.replaceState(null,"",window.location.pathname + (params.size ? "?" + params : ""));
  }
  const [now] = useState(() => Date.now());
  const start = now - 90 * 86400000;
  const counts = useMemo(() => completedServiceCounts(p.bookings, String(p.salon.id), start, now), [p.bookings,p.salon.id,start,now]);
  const popular = popularServiceIds(counts, p.styles.filter(row => row.is_draft !== true).map(row => String(row.id)));
  const featured = p.styles.filter(row => row.is_featured === true);
  const shown = p.visible.filter(row => !featuredOnly || row.is_featured === true).slice().sort((a,b) => sort === "name" ? String(a.name).localeCompare(String(b.name)) : sort === "price" ? Number(a.price_display_min ?? a.base_price ?? Infinity) - Number(b.price_display_min ?? b.base_price ?? Infinity) : sort === "popular" ? (counts[String(b.id)] || 0) - (counts[String(a.id)] || 0) : 0);
  const active = p.styles.filter(row => row.is_draft !== true && row.is_active !== false).length;
  const control = "min-h-11 min-w-0 rounded-lg border border-border bg-white px-3 text-sm";
  const href = (style: Row) => `/salon/dashboard/styles/${style.id}${p.listParams.size ? `?${p.listParams}` : ""}`;
  const price = (style: Row) => {
    const min = style.price_display_min ?? style.base_price, max = style.price_display_max ?? min;
    return min == null ? t("Price not set") : max != null && Number(max) !== Number(min) ? `${formatCurrency(Number(min))}–${formatCurrency(Number(max))}` : formatCurrency(Number(min));
  };
  const duration = (style: Row) => {
    const min=style.duration_min_hours,max=style.duration_max_hours??min;
    return min == null ? t("Duration not set") : Number(min) === Number(max) ? t("{value0} hours",{value0:formatNumber(Number(min))}) : t("{value0}–{value1} hours",{value0:formatNumber(Number(min)),value1:formatNumber(Number(max))});
  };
  async function update(style: Row, field: "is_featured" | "is_draft", next: boolean) {
    if (pending || !style.id) return;
    setPending(style.id);
    try { await p.save(style.id,{[field]:next}); }
    finally { setPending(null); }
  }
  const media = (style: Row, featuredCard=false) => {
    const photo = Array.isArray(style.photos) && typeof style.photos[0] === "string" ? style.photos[0] : null;
    return photo ? <Image unoptimized width={480} height={300} src={photo} alt={String(style.name || "")} className={featuredCard || view === "grid" ? "aspect-[16/9] w-full object-cover" : "h-20 w-20 rounded-lg object-cover"}/> : <span className={`flex items-center justify-center bg-subtle text-primary ${featuredCard || view === "grid" ? "aspect-[16/9] w-full" : "h-20 w-20 rounded-lg"}`}><Scissors size={28} aria-label={t("No service image uploaded")}/></span>;
  };
  return <div className="space-y-5">
    <div className="grid grid-cols-3 gap-2 sm:gap-4" aria-label={t("Service catalog summary")}>
      {[["Services",p.styles.length],["Published services",active],["Featured",featured.length]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-border bg-white p-3 sm:p-4"><p className="text-xs text-text-secondary">{t(String(label))}</p><p className="mt-1 font-serif text-2xl">{formatNumber(Number(value))}</p></div>)}
    </div>
    <div className="flex flex-wrap gap-2" aria-label={t("Browse service categories")}>
      <button type="button" aria-pressed={p.category === "all"} onClick={()=>{p.setCategory("all");p.setGroup("all");}} className={`${control} ${p.category === "all" ? "!bg-primary text-white" : "text-primary"}`}>{t("All services")} ({formatNumber(p.styles.length)})</button>
      {p.categories.map(category=>{const count=p.styles.filter(style=>style.category_id===category.id).length;return count ? <button key={category.id} type="button" aria-pressed={p.category===category.id} onClick={()=>{p.setCategory(String(category.id));p.setGroup("all");}} className={`${control} ${p.category===category.id ? "!bg-primary text-white" : "text-primary"}`}>{t(String(category.name))} ({formatNumber(count)})</button> : null;})}
    </div>
    <section className="rounded-xl border border-border bg-white p-4" aria-label={t("Featured services")}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="flex items-center gap-2 font-serif text-xl"><Crown size={18} className="text-primary"/>{t("Featured services")}</h2><p className="mt-1 text-xs text-text-secondary">{t("Your selections appear first on your public service menu. Featured does not mean most booked.")}</p></div><button type="button" aria-pressed={featuredOnly} onClick={()=>setPreference("featured",String(!featuredOnly))} className="min-h-11 rounded-lg border px-3 text-sm text-primary">{t(featuredOnly ? "Show all services" : "Manage featured")}</button></div>
      {featured.length ? <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">{featured.slice(0,4).map(style=><Link key={style.id} href={href(style)} className="min-w-0 overflow-hidden rounded-xl border border-border">{media(style,true)}<div className="space-y-1 p-3"><h3 data-no-translate className="break-words text-sm font-semibold">{style.name}</h3><p className="text-sm">{price(style)}</p><p className="text-xs text-text-secondary">{duration(style)}{style.is_draft === true ? ` · ${t("Draft")}` : ""}</p></div></Link>)}</div> : <p className="mt-4 rounded-lg bg-subtle p-4 text-sm">{t("Feature a service below to give it a prominent place on your menu.")}</p>}
    </section>
    <section aria-label={t("Your Services")} className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-border bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="relative block sm:col-span-2"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-primary"/><input aria-label={t("Search services")} value={p.query} onChange={event=>p.setQuery(event.target.value)} placeholder={t("Search services")} className={`${control} w-full pl-9`}/></label>
        <select aria-label={t("Service category")} value={p.category} onChange={event=>{p.setCategory(event.target.value);p.setGroup("all");}} className={control}><option value="all">{t("All categories")}</option>{p.categories.map(row=><option key={row.id} value={row.id}>{t(String(row.name))}</option>)}</select>
        <select aria-label={t("Service group")} value={p.group} onChange={event=>p.setGroup(event.target.value)} className={control}><option value="all">{t("All service groups")}</option>{p.groups.filter(row=>p.category === "all" || row.category_id === p.category).map(row=><option key={row.id} value={row.id}>{t(String(row.name))}</option>)}</select>
        <select aria-label={t("Service status")} value={p.status} onChange={event=>p.setStatus(event.target.value)} className={control}><option value="all">{t("All statuses")}</option><option value="active">{t("Active")}</option><option value="inactive">{t("Inactive / draft")}</option></select>
        <select aria-label={t("Sort services")} value={sort} onChange={event=>setPreference("sort",event.target.value)} className={control}><option value="custom">{t("Catalog order")}</option><option value="name">{t("Name")}</option><option value="price">{t("Price: low to high")}</option>{p.canReadBookings ? <option value="popular">{t("Most completed bookings")}</option> : null}</select>
        <div className="flex items-center gap-2 xl:col-span-2"><p className="flex-1 text-sm text-text-secondary">{t("Matching services: {value0}",{value0:formatNumber(shown.length)})}</p><button type="button" aria-label={t("Service grid view")} aria-pressed={view==='grid'} onClick={()=>setPreference('view','grid')} className={`${control} ${view==='grid'?'!bg-primary text-white':''}`}><LayoutGrid size={18}/></button><button type="button" aria-label={t("Service list view")} aria-pressed={view==='list'} onClick={()=>setPreference('view','list')} className={`${control} ${view==='list'?'!bg-primary text-white':''}`}><List size={18}/></button></div>
      </div>
      {p.canReadBookings ? <p className="text-xs text-text-secondary">{t("Popularity: the three services with the most completed appointments in the last 90 days.")} {formatDate(new Date(start),{dateStyle:'medium'})}–{formatDate(new Date(now),{dateStyle:'medium'})}. {t("Cancelled, future and test appointments are excluded.")}</p> : null}
      <div className={view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
        {shown.map(style=><article key={style.id} aria-labelledby={`service-name-${style.id}`} className="min-w-0 overflow-hidden rounded-xl border border-border bg-white">
          <Link href={href(style)} className={view === "list" ? "flex items-center gap-4 p-3" : "block"}>{media(style)}<div className={`min-w-0 flex-1 ${view === 'grid' ? 'p-4' : ''}`}>
            <div className="flex flex-wrap items-center gap-2"><h3 id={`service-name-${style.id}`} data-no-translate className="break-words font-serif text-lg">{style.name}</h3>{style.is_featured===true ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{t("Featured")}</span>:null}</div>
            <p className="mt-1 text-xs text-text-secondary">{t(String(p.categories.find(row=>row.id===style.category_id)?.name || style.category || "Service"))}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm"><span className="font-semibold">{price(style)}</span><span className="flex items-center gap-1 text-text-secondary"><Clock3 size={14}/>{duration(style)}</span></div>
            {p.canReadBookings && popular.has(String(style.id)) ? <p className="mt-3 text-xs font-semibold text-primary">{t("Popular · {value0} completed appointments",{value0:formatNumber(counts[String(style.id)])})}</p> : null}
          </div></Link>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
            <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={style.is_featured===true} disabled={pending!==null} onChange={event=>void update(style,'is_featured',event.target.checked)}/>{t("Feature service")}</label>
            <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={style.is_draft!==true && style.is_active!==false} disabled={pending!==null} onChange={event=>void update(style,'is_draft',!event.target.checked)}/>{t("Published")}</label>
            <Link href={href(style)} className="flex min-h-11 items-center px-2 text-sm font-semibold text-primary">{t("Edit service")}</Link>
          </div>
        </article>)}
      </div>
      {!shown.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm">{t(p.styles.length ? "No services match these filters." : "Add your first service.")}</p> : null}
      <p className="text-xs text-text-secondary"><ImageIcon size={14} className="mr-1 inline"/>{t("Only this service’s uploaded photos are shown.")} <Link href="/salon/dashboard/earnings" className="font-semibold text-primary underline">{t("Manage booking deposit rules in Finances")}</Link></p>
    </section>
  </div>;
}
