"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import SalonCardSkeletons from "@/components/public/SalonCardSkeletons";
import { validCoordinates } from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";
import { readApiResponse } from "@/lib/apiResponseClient";

type NearbySnapshot = { key: string; salons: PublicSalonResult[]; total: number; error: string };

export default function NearbySalonPlacement({ title = "Salons Near You", description,maxCards=6 }: { title?: string; description?: string | null;maxCards?:number }) {
  const locationState = useCustomerLocation();
  const [snapshot, setSnapshot] = useState<NearbySnapshot | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const requestEpoch = useRef({ value: 0 });
  const carousel = useRef<HTMLDivElement>(null);
  const location = locationState.location;
  const limit = Math.max(1, Math.min(24, Math.round(maxCards)));
  const queryKey = location && validCoordinates(location)
    ? JSON.stringify([location.lat, location.lng, locationState.radiusMiles, limit]) : null;
  const current = snapshot?.key === queryKey ? snapshot : null;
  const salons = current?.salons || [];
  const total = current?.total || 0;
  // A location is ready before its delayed request starts. Only a completed
  // response for this exact query can establish an empty result.
  const loading = queryKey !== null && (!current || pendingKey === queryKey);
  const error = pendingKey === queryKey ? "" : current?.error || "";
  const viewAllHref = useMemo(() => {
    if (!location || !validCoordinates(location)) return "/salons";
    const query = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
      location: location.label,
      radius: String(locationState.radiusMiles),
    });
    return `/salons?${query.toString()}`;
  }, [location, locationState.radiusMiles]);

  async function load(signal?: AbortSignal) {
    if (!location || !queryKey) return;
    const epoch = ++requestEpoch.current.value;
    setPendingKey(queryKey);
    try {
      const query = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng), radius: String(locationState.radiusMiles), limit: String(limit), offset: "0", sort: "distance" });
      const response = await fetch(`/api/discovery/salons?${query}`, { cache: "no-store", signal });
      const body = await readApiResponse(response, "Nearby salons could not be loaded.") as { salons?: PublicSalonResult[]; total?: number; error?: string };
      if (!response.ok) throw new Error(body.error || "Nearby salons could not be loaded.");
      if (epoch !== requestEpoch.current.value || signal?.aborted) return;
      setSnapshot({ key: queryKey, salons: Array.isArray(body.salons) ? body.salons : [], total: Number(body.total || 0), error: "" });
    } catch (loadError) {
      if (epoch === requestEpoch.current.value && !signal?.aborted && (loadError as Error).name !== "AbortError") {
        setSnapshot({ key: queryKey, salons: [], total: 0, error: loadError instanceof Error ? loadError.message : "We could not load nearby salons just now." });
      }
    } finally { if (epoch === requestEpoch.current.value) setPendingKey(null); }
  }

  useEffect(() => {
    if (!queryKey) return;
    const epochCounter = requestEpoch.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 80);
    return () => { ++epochCounter.value; window.clearTimeout(timer); controller.abort(); };
    // The key contains every effective query input; a label change is not a new area.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  function scroll(direction: -1 | 1) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    carousel.current?.scrollBy({ left: direction * Math.min(720, carousel.current.clientWidth * 0.82), behavior });
  }

  return <section data-home-salon-section="nearby" aria-labelledby="nearby-salons-heading" className="pb-2 pt-1 sm:py-5">
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3 sm:mb-3">
      <div><h2 id="nearby-salons-heading" className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]">{title}</h2>{description ? <p className="mt-1 text-xs text-ink/60">{description}</p> : null}</div>
      {salons.length && total ? <div className="flex items-center gap-2"><button type="button" aria-label="Previous nearby salons" onClick={()=>scroll(-1)} className="hidden h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum sm:grid"><ArrowLeft size={16}/></button><button type="button" aria-label="Next nearby salons" onClick={()=>scroll(1)} className="hidden h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum sm:grid"><ArrowRight size={16}/></button><Link href={viewAllHref} className="ml-1 text-[11px] font-bold text-magenta">View all →</Link></div> : null}
    </div>
    {!locationState.ready ? <SalonCardSkeletons label="Loading nearby salons"/> : !queryKey ? <div className="rounded-[15px] border border-plum/10 bg-white p-6 text-center"><h3 className="font-serif text-xl text-plum">Local salons are ready when you are</h3><p className="mt-1 text-xs leading-5 text-ink/65">We could not estimate your area. Choose a city, neighborhood, or ZIP in Find Salons.</p><Link href="/salons" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-magenta px-5 text-xs font-bold text-white">Choose a search location</Link></div> : error ? <div role="alert" className="rounded-[15px] border border-red-200 bg-white p-6 text-center"><p className="text-sm gc-text-danger">{error}</p><button onClick={() => void load()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><RotateCcw size={14}/>Try again</button></div> : loading && !salons.length ? <SalonCardSkeletons label="Loading nearby salons"/> : salons.length ? <div ref={carousel} tabIndex={0} role="region" aria-label="Nearby salons carousel" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">{salons.map((salon) => <MarketplaceSalonCard key={salon.id} salon={salon} variant="compact" surface="homepage"/>)}</div> : <div className="rounded-[15px] border border-dashed border-plum/20 bg-white p-7 text-center"><h3 className="font-serif text-xl text-plum">No salons are nearby yet</h3><p className="mt-2 text-sm text-ink/60">Try another location or widen the distance on Find Salons.</p><Link href={viewAllHref} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Open Find Salons</Link></div>}
  </section>;
}
