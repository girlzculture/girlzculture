"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, List, LocateFixed, Map, MapPin, RotateCcw } from "lucide-react";
import { LocationAutocomplete, StyleAutocomplete } from "@/components/search/AutocompleteInputs";
import GoogleSalonMap from "@/components/search/GoogleSalonMap";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import { DEFAULT_NEARBY_RADIUS_MILES, validCoordinates, type Coordinates, type CustomerLocation } from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";

type Props = {
  initialSalons: PublicSalonResult[];
  initialTotal: number;
  initialStyle?: string;
  initialLocation?: string;
  initialOrigin?: Coordinates | null;
};

const PAGE_SIZE = 20;

export default function SalonDiscovery({ initialSalons, initialTotal, initialStyle = "", initialLocation = "", initialOrigin = null }: Props) {
  const customerLocation = useCustomerLocation();
  const [style, setStyle] = useState(initialStyle);
  const [locationText, setLocationText] = useState(initialLocation);
  const [manualLocation, setManualLocation] = useState<CustomerLocation | null>(initialOrigin ? { ...initialOrigin, label: initialLocation || "Selected location", source: "explicit" } : null);
  const [editingLocation, setEditingLocation] = useState(Boolean(initialLocation && !initialOrigin));
  const [view, setView] = useState<"list" | "map">("list");
  const [radius, setRadius] = useState(DEFAULT_NEARBY_RADIUS_MILES);
  const [rating, setRating] = useState(0);
  const [price, setPrice] = useState("any");
  const [sort, setSort] = useState("distance");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [salons, setSalons] = useState(initialSalons);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const firstQuery = useRef(true);

  const resolvedLocation = manualLocation || (!editingLocation ? customerLocation.location : null);
  const displayedLocation = editingLocation ? locationText : locationText || customerLocation.location?.label || "";
  const origin = useMemo(() => resolvedLocation && validCoordinates(resolvedLocation) ? { lat: resolvedLocation.lat, lng: resolvedLocation.lng } : null, [resolvedLocation]);
  const contextQuery = useMemo(() => {
    if (!origin) return "";
    const query = new URLSearchParams({ location: resolvedLocation?.label || displayedLocation, lat: String(origin.lat), lng: String(origin.lng) });
    if (style) query.set("style", style);
    return query.toString();
  }, [displayedLocation, origin, resolvedLocation?.label, style]);
  const priceRange = useMemo(() => ({
    any: [null, null], under_100: [null, 100], under_150: [null, 150], 150_250: [150, 250], over_250: [250, null],
  } as Record<string, [number | null, number | null]>)[price] || [null, null], [price]);

  async function requestResults(offset = 0, append = false) {
    if (!origin) { setSalons([]); setTotal(0); setLoading(false); return; }
    if (append) setLoadingMore(true); else setLoading(true);
    setError("");
    const controller = new AbortController();
    try {
      const params = new URLSearchParams({ lat: String(origin.lat), lng: String(origin.lng), radius: String(radius), limit: String(PAGE_SIZE), offset: String(offset), sort });
      if (style.trim()) params.set("style", style.trim());
      if (rating) params.set("rating", String(rating));
      if (priceRange[0] !== null) params.set("min_price", String(priceRange[0]));
      if (priceRange[1] !== null) params.set("max_price", String(priceRange[1]));
      const response = await fetch(`/api/discovery/salons?${params}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json() as { salons?: PublicSalonResult[]; total?: number; error?: string };
      if (!response.ok) throw new Error(body.error || "Nearby salons could not be loaded.");
      const next = Array.isArray(body.salons) ? body.salons : [];
      setSalons((current) => append ? [...current, ...next.filter((row) => !current.some((item) => item.id === row.id))] : next);
      setTotal(Number(body.total || 0));
    } catch (requestError) {
      if ((requestError as Error).name !== "AbortError") setError(requestError instanceof Error ? requestError.message : "Nearby salons could not be loaded.");
    } finally { setLoading(false); setLoadingMore(false); }
    return () => controller.abort();
  }

  useEffect(() => {
    if (firstQuery.current && initialSalons.length && initialOrigin && origin?.lat === initialOrigin.lat && origin?.lng === initialOrigin.lng && radius === DEFAULT_NEARBY_RADIUS_MILES && !rating && price === "any" && sort === "distance" && style === initialStyle) {
      firstQuery.current = false;
      return;
    }
    firstQuery.current = false;
    const timer = window.setTimeout(() => { void requestResults(); }, 180);
    return () => window.clearTimeout(timer);
    // Request inputs are intentionally the complete discovery state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng, price, radius, rating, sort, style]);

  useEffect(() => {
    if (!origin) return;
    const params = new URLSearchParams();
    if (style) params.set("style", style);
    params.set("location", resolvedLocation?.label || displayedLocation);
    params.set("lat", String(origin.lat));
    params.set("lng", String(origin.lng));
    if (radius !== DEFAULT_NEARBY_RADIUS_MILES) params.set("radius", String(radius));
    if (rating) params.set("rating", String(rating));
    if (price !== "any") params.set("price", price);
    if (sort !== "distance") params.set("sort", sort);
    window.history.replaceState(null, "", `/salons?${params}`);
  }, [displayedLocation, origin, price, radius, rating, resolvedLocation?.label, sort, style]);

  useEffect(() => {
    if (!availabilityDate) {
      const resetTimer = window.setTimeout(() => { setAvailability({}); setAvailabilityLoading(false); }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    const rows = salons.map((salon) => ({ salonId: salon.id, styleId: salon.services[0]?.id })).filter((row) => row.styleId);
    const controller = new AbortController();
    const timer = window.setTimeout(() => void (async () => {
      setAvailabilityLoading(true);
      try {
        const response = await fetch("/api/discovery/availability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: availabilityDate, salons: rows }), signal: controller.signal });
        const body = await response.json() as { availability?: Record<string, boolean> };
        setAvailability(response.ok && body.availability ? body.availability : {});
      } catch (requestError) { if ((requestError as Error).name !== "AbortError") setAvailability({}); }
      finally { setAvailabilityLoading(false); }
    })(), 120);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [availabilityDate, salons]);

  function resolveLocation(next: CustomerLocation | null) {
    setManualLocation(next);
    setEditingLocation(Boolean(next));
    if (next) { setLocationText(next.label); customerLocation.setLocation(next); }
  }
  async function requestDeviceLocation() {
    setManualLocation(null);
    setEditingLocation(false);
    setLocationText("");
    await customerLocation.useDeviceLocation();
  }
  function submit(event: FormEvent) { event.preventDefault(); if (origin) void requestResults(); }
  function clearFilters() { setStyle(""); setRadius(DEFAULT_NEARBY_RADIUS_MILES); setRating(0); setPrice("any"); setSort("distance"); setAvailabilityDate(""); }
  function changeLocation() { setManualLocation(null); setEditingLocation(true); setLocationText(""); customerLocation.clearLocation(); setSalons([]); setTotal(0); }

  const activeFilters = [style ? `Style: ${style}` : "", radius !== DEFAULT_NEARBY_RADIUS_MILES ? `Within ${radius} mi` : "", rating ? `${rating}+ stars` : "", price !== "any" ? price.replaceAll("_", " ") : "", availabilityDate ? `Available ${availabilityDate}` : ""].filter(Boolean);
  const visibleSalons = availabilityDate ? salons.filter((salon) => availability[salon.id]) : salons;

  return <>
    <form onSubmit={submit} className="relative z-20 rounded-[14px] border border-plum/10 bg-white/95 p-2 shadow-[0_8px_24px_rgba(26,18,32,.08)] md:max-w-[1120px] md:p-3"><div className="grid gap-2 md:grid-cols-[1.2fr_.9fr_auto]"><StyleAutocomplete value={style} onChange={setStyle} onLocation={resolveLocation} contextQuery={contextQuery} placeholder="Describe the service you want" className="rounded-[9px] border border-plum/10 px-3"/><div><LocationAutocomplete value={displayedLocation} onChange={(value)=>{setEditingLocation(true);setLocationText(value);setManualLocation(null);}} onResolved={resolveLocation} className="rounded-[9px] border border-plum/10 px-3"/><button type="button" onClick={()=>void requestDeviceLocation()} className="mt-1 inline-flex min-h-9 items-center gap-1.5 px-2 text-[11px] font-bold text-magenta focus-visible:outline-2 focus-visible:outline-magenta"><LocateFixed size={14}/>Use my location</button>{customerLocation.permissionError?<p role="alert" className="px-2 text-[11px] text-red-700">{customerLocation.permissionError}</p>:null}</div><button className="min-h-11 rounded-[9px] bg-magenta px-8 text-sm font-bold text-white">Search</button></div></form>

    {!origin?<LocationPrompt onUseDevice={requestDeviceLocation}/>:<>
      <div className="mt-3 flex flex-wrap items-center gap-2"><Select label="Distance" value={String(radius)} onChange={(value)=>setRadius(Number(value))} options={[["5","5 miles"],["10","10 miles"],["25","25 miles"],["50","50 miles"],["100","100 miles"]]}/><Select label="Rating" value={String(rating)} onChange={(value)=>setRating(Number(value))} options={[["0","Any rating"],["4","4.0+"],["4.5","4.5+"],["4.8","4.8+"]]}/><Select label="Price" value={price} onChange={setPrice} options={[["any","Any price"],["under_100","Under $100"],["under_150","Under $150"],["150_250","$150–$250"],["over_250","$250+"]]}/><Select label="Sort" value={sort} onChange={setSort} options={[["distance","Nearest"],["rating","Highest rated"],["price_low","Lowest price"],["price_high","Highest price"]]}/><label className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-plum/15 bg-white px-3 text-[11px] font-semibold"><CalendarDays size={15}/><span className="sr-only">Availability date</span><input aria-label="Availability date" type="date" value={availabilityDate} min={new Date().toISOString().slice(0,10)} onChange={(event)=>setAvailabilityDate(event.target.value)} className="bg-transparent outline-none"/></label><button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[11px] font-bold text-magenta"><RotateCcw size={14}/>Clear filters</button></div>
      {activeFilters.length?<div aria-label="Active filters" className="mt-2 flex flex-wrap gap-2">{activeFilters.map((filter)=><span key={filter} className="rounded-full bg-blush/70 px-3 py-1.5 text-[10px] font-semibold text-plum">{filter}</span>)}</div>:null}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-2xl font-semibold text-ink">Salons Near You</h2><p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink/65"><MapPin size={13}/>Near {resolvedLocation?.label || displayedLocation} · <button type="button" onClick={changeLocation} className="font-bold text-magenta">Change</button></p></div><div className="flex items-center gap-3"><span aria-live="polite" className="text-[11px] text-ink/60">{loading?"Finding nearby salons…":availabilityLoading?"Checking availability…":availabilityDate?`${visibleSalons.length} available`:`${total} ${total===1?"salon":"salons"}`}</span><div className="flex overflow-hidden rounded-[9px] border border-plum/15"><Toggle active={view==="list"} onClick={()=>setView("list")} icon={<List size={16}/>} label="List"/><Toggle active={view==="map"} onClick={()=>setView("map")} icon={<Map size={16}/>} label="Map"/></div></div></div>
      {error?<ErrorState message={error} retry={()=>void requestResults()}/>:loading&&!salons.length?<Skeletons/>:view==="map"?<GoogleSalonMap salons={visibleSalons} selectedSalonId={selectedSalonId} onSelect={setSelectedSalonId}/>:<div className="mt-3 grid gap-4 lg:grid-cols-[1.18fr_.92fr]"><div className="space-y-3">{visibleSalons.map((salon)=><MarketplaceSalonCard key={salon.id} salon={salon} variant="list" selected={selectedSalonId===salon.id} onFocus={setSelectedSalonId}/>)}{!visibleSalons.length&&!availabilityLoading?<EmptyState changeLocation={changeLocation}/>:null}{!availabilityDate&&salons.length<total?<button disabled={loadingMore} onClick={()=>void requestResults(salons.length,true)} className="min-h-12 w-full rounded-[10px] border border-magenta bg-white text-sm font-bold text-magenta disabled:opacity-50">{loadingMore?"Loading…":"Load more salons"}</button>:null}</div><div className="hidden lg:block"><GoogleSalonMap salons={visibleSalons} compact selectedSalonId={selectedSalonId} onSelect={setSelectedSalonId}/></div></div>}
    </>}
  </>;
}

function LocationPrompt({onUseDevice}:{onUseDevice:()=>Promise<void>}) { return <section className="mt-5 rounded-[18px] border border-plum/10 bg-[linear-gradient(120deg,#fff,#f8e6ed)] p-7 text-center"><MapPin className="mx-auto text-magenta" size={28}/><h2 className="mt-3 font-serif text-2xl text-plum">Choose a location to see nearby salons</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/70">Enter a city, neighborhood, or ZIP above, or share your location when you are ready. We never ask for location permission automatically.</p><button type="button" onClick={()=>void onUseDevice()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[9px] bg-magenta px-5 text-sm font-bold text-white"><LocateFixed size={16}/>Use my location</button><Link href="/styles" className="ml-3 inline-flex min-h-11 items-center rounded-[9px] border border-magenta px-5 text-sm font-bold text-magenta">Browse styles</Link></section> }
function Select({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Array<[string,string]>}) { return <label className="shrink-0"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event)=>onChange(event.target.value)} className="min-h-11 rounded-[9px] border border-plum/15 bg-white px-3 text-[11px] font-semibold">{options.map(([option,text])=><option value={option} key={option}>{text}</option>)}</select></label> }
function Toggle({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}) { return <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-10 items-center gap-2 px-4 text-[11px] font-bold ${active?"bg-magenta text-white":"bg-white text-ink"}`}>{icon}{label}</button> }
function Skeletons() { return <div aria-label="Loading salons" className="mt-4 space-y-3">{[1,2,3].map((item)=><div key={item} className="grid animate-pulse grid-cols-[118px_1fr] overflow-hidden rounded-[14px] border border-plum/10 bg-white sm:grid-cols-[220px_1fr]"><div className="min-h-[168px] bg-blush/70"/><div className="space-y-3 p-4"><div className="h-5 w-1/2 rounded bg-blush"/><div className="h-3 w-2/3 rounded bg-blush/70"/><div className="h-3 w-1/3 rounded bg-blush/70"/></div></div>)}</div> }
function EmptyState({changeLocation}:{changeLocation:()=>void}) { return <div className="rounded-[16px] border border-dashed border-plum/25 bg-white p-9 text-center"><h3 className="font-serif text-2xl text-plum">No salons within this distance yet</h3><p className="mt-2 text-sm text-ink/65">Try a wider distance or choose another location. We will not call a distant salon nearby.</p><div className="mt-4 flex justify-center gap-3"><button onClick={changeLocation} className="min-h-11 rounded-[9px] bg-magenta px-5 text-sm font-bold text-white">Change location</button><Link href="/styles" className="inline-flex min-h-11 items-center rounded-[9px] border border-magenta px-5 text-sm font-bold text-magenta">Browse styles</Link></div></div> }
function ErrorState({message,retry}:{message:string;retry:()=>void}) { return <div role="alert" className="mt-4 rounded-[16px] border border-red-200 bg-white p-8 text-center"><h3 className="font-serif text-2xl text-plum">Nearby salons could not load</h3><p className="mt-2 text-sm text-ink/70">{message}</p><button onClick={retry} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[9px] bg-magenta px-5 text-sm font-bold text-white"><RotateCcw size={15}/>Try again</button></div> }
