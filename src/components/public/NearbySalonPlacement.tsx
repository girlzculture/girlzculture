"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, RotateCcw } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import { validCoordinates } from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";

export default function NearbySalonPlacement({ title = "Salons Near You", description,maxCards=6 }: { title?: string; description?: string | null;maxCards?:number }) {
  const locationState = useCustomerLocation();
  const [salons, setSalons] = useState<PublicSalonResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const carousel = useRef<HTMLDivElement>(null);
  const location = locationState.location;
  const viewAllHref = useMemo(() => {
    if (!location) return "/salons";
    const query = new URLSearchParams({ location: location.label, lat: String(location.lat), lng: String(location.lng), radius: String(locationState.radiusMiles) });
    return `/salons?${query}`;
  }, [location, locationState.radiusMiles]);

  async function load(signal?: AbortSignal) {
    if (!location || !validCoordinates(location)) { setSalons([]); setTotal(0); return; }
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng), radius: String(locationState.radiusMiles), limit: String(Math.max(1,Math.min(24,Math.round(maxCards)))), offset: "0", sort: "distance" });
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
  }, [location?.lat, location?.lng,locationState.radiusMiles,maxCards]);

  function scroll(direction: -1 | 1) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    carousel.current?.scrollBy({ left: direction * Math.min(720, carousel.current.clientWidth * 0.82), behavior });
  }

  return <section aria-labelledby="nearby-salons-heading" className="py-2 sm:py-5">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="nearby-salons-heading" className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]">{title}</h2>{description ? <p className="mt-1 text-xs text-ink/60">{description}</p> : null}{location ? <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/55"><MapPin size={12}/>Near {location.label}</p> : null}</div>
      {salons.length && total ? <div className="flex items-center gap-2"><button type="button" aria-label="Previous nearby salons" onClick={()=>scroll(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum"><ArrowLeft size={16}/></button><button type="button" aria-label="Next nearby salons" onClick={()=>scroll(1)} className="grid h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum"><ArrowRight size={16}/></button><Link href={viewAllHref} className="ml-1 text-[11px] font-bold text-magenta">View all {total} →</Link></div> : null}
    </div>
    {!locationState.ready ? <Skeletons/> : !location ? <div className="rounded-[15px] border border-plum/10 bg-white p-6 text-center"><h3 className="font-serif text-xl text-plum">Local salons are ready when you are</h3><p className="mt-1 text-xs leading-5 text-ink/65">We could not estimate your area. Choose a city, neighborhood, or ZIP in Find Salons.</p><Link href="/salons" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-magenta px-5 text-xs font-bold text-white">Choose a search location</Link></div> : error ? <div role="alert" className="rounded-[15px] border border-red-200 bg-white p-6 text-center"><p className="text-sm text-red-700">{error}</p><button onClick={() => void load()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><RotateCcw size={14}/>Try again</button></div> : loading && !salons.length ? <Skeletons/> : salons.length ? <div ref={carousel} tabIndex={0} aria-label="Nearby salons carousel" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">{salons.map((salon) => <MarketplaceSalonCard key={salon.id} salon={salon} variant="compact"/>)}</div> : <div className="rounded-[15px] border border-dashed border-plum/20 bg-white p-7 text-center"><h3 className="font-serif text-xl text-plum">No salons are nearby yet</h3><p className="mt-2 text-sm text-ink/60">Try another location or widen the distance on Find Salons.</p><Link href={viewAllHref} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Open Find Salons</Link></div>}
  </section>;
}

function Skeletons() {
  return <div aria-label="Loading nearby salons" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-[14px] border border-plum/10 bg-white"><div className="aspect-[16/10] bg-blush/70"/><div className="space-y-2 p-3"><div className="h-5 w-2/3 rounded bg-blush"/><div className="h-3 w-1/2 rounded bg-blush/60"/></div></div>)}</div>;
}
