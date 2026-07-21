"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LocateFixed, MapPin, RotateCcw } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import { LocationAutocomplete } from "@/components/search/AutocompleteInputs";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import { DEFAULT_NEARBY_RADIUS_MILES, validCoordinates, type CustomerLocation } from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";

export default function NearbySalonPlacement({ title = "Salons Near You", description,maxCards=6 }: { title?: string; description?: string | null;maxCards?:number }) {
  const locationState = useCustomerLocation();
  const [locationText, setLocationText] = useState("");
  const [salons, setSalons] = useState<PublicSalonResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const location = locationState.location;
  const viewAllHref = useMemo(() => {
    if (!location) return "/salons";
    const query = new URLSearchParams({ location: location.label, lat: String(location.lat), lng: String(location.lng), radius: String(DEFAULT_NEARBY_RADIUS_MILES) });
    return `/salons?${query}`;
  }, [location]);

  async function load(signal?: AbortSignal) {
    if (!location || !validCoordinates(location)) { setSalons([]); setTotal(0); return; }
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng), radius: String(DEFAULT_NEARBY_RADIUS_MILES), limit: String(Math.max(1,Math.min(24,Math.round(maxCards)))), offset: "0", sort: "distance" });
      const response = await fetch(`/api/discovery/salons?${query}`, { cache: "no-store", signal });
      const body = await response.json() as { salons?: PublicSalonResult[]; total?: number; error?: string };
      if (!response.ok) throw new Error(body.error || "Nearby salons could not be loaded.");
      setSalons(Array.isArray(body.salons) ? body.salons : []);
      setTotal(Number(body.total || 0));
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") setError("We could not load nearby salons just now.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!location || !validCoordinates(location)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 80);
    return () => { window.clearTimeout(timer); controller.abort(); };
    // Coordinates are the complete proximity query inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng,maxCards]);

  function resolve(next: CustomerLocation | null) {
    if (!next) return;
    locationState.setLocation(next);
    setLocationText(next.label);
  }

  return <section aria-labelledby="nearby-salons-heading" className="py-2 sm:py-5">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="nearby-salons-heading" className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]">{title}</h2>{description ? <p className="mt-1 text-xs text-ink/60">{description}</p> : null}{location ? <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/55"><MapPin size={12}/>Near {location.label}</p> : null}</div>
      {salons.length && total ? <Link href={viewAllHref} className="text-[11px] font-bold text-magenta">View all {total} →</Link> : null}
    </div>
    {!locationState.ready ? <Skeletons/> : !location ? <div className="rounded-[15px] border border-plum/10 bg-white p-5"><h3 className="font-serif text-xl text-plum">Choose a location to see nearby salons</h3><p className="mt-1 text-xs leading-5 text-ink/65">Enter a city, neighborhood, or ZIP, or share your location when you are ready.</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><LocationAutocomplete value={locationText} onChange={setLocationText} onResolved={resolve} placeholder="City, neighborhood, or ZIP" className="rounded-[9px] border border-plum/15 px-3"/><button type="button" onClick={() => void locationState.useDeviceLocation()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] bg-magenta px-5 text-xs font-bold text-white"><LocateFixed size={15}/>Use my location</button></div>{locationState.permissionError ? <p role="alert" className="mt-2 text-xs text-red-700">{locationState.permissionError}</p> : null}</div> : error ? <div role="alert" className="rounded-[15px] border border-red-200 bg-white p-6 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={() => void load()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><RotateCcw size={14}/>Try again</button></div> : loading && !salons.length ? <Skeletons/> : salons.length ? <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">{salons.map((salon) => <MarketplaceSalonCard key={salon.id} salon={salon}/>)}</div> : <div className="rounded-[15px] border border-dashed border-plum/20 bg-white p-7 text-center"><h3 className="font-serif text-xl text-plum">No salons are nearby yet</h3><p className="mt-2 text-sm text-ink/60">Try another location or widen the distance on Find Salons.</p><Link href={viewAllHref} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Open Find Salons</Link></div>}
  </section>;
}

function Skeletons() {
  return <div aria-label="Loading nearby salons" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-[14px] border border-plum/10 bg-white"><div className="aspect-[16/10] bg-blush/70"/><div className="space-y-2 p-3"><div className="h-5 w-2/3 rounded bg-blush"/><div className="h-3 w-1/2 rounded bg-blush/60"/></div></div>)}</div>;
}
