"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LocateFixed, MapPin, RotateCcw, Video } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import SafeCampaignVideo from "@/components/public/SafeCampaignVideo";
import { LocationAutocomplete } from "@/components/search/AutocompleteInputs";
import { DEFAULT_NEARBY_RADIUS_MILES, validCoordinates, type CustomerLocation } from "@/lib/location";

type Trending = {
  campaign_id: string;
  video_url: string;
  thumbnail_url: string | null;
  description: string;
  salon_id: string;
  salon_name: string;
  salon_slug: string;
  address_city: string | null;
  address_state: string | null;
  borough: string | null;
  distance_miles: number;
  total_count: number;
};

const SEED_KEY = "girlz-culture-trending-rotation-v1";

function rotationSeed() {
  let value = sessionStorage.getItem(SEED_KEY);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(SEED_KEY, value);
  }
  return value;
}

export default function TrendingVideoPlacement({
  title = "Trending Picks This Week",
  description,
  viewAll = false,
  maxCards=12,
}: { title?: string; description?: string | null; viewAll?: boolean;maxCards?:number }) {
  const locationState = useCustomerLocation();
  const [locationText, setLocationText] = useState("");
  const [videos, setVideos] = useState<Trending[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const carousel = useRef<HTMLDivElement>(null);
  const location = locationState.location;
  const limit = viewAll ? 24 : Math.max(1,Math.min(24,Math.round(maxCards)));

  async function load(offset = 0, append = false, signal?: AbortSignal) {
    if (!location || !validCoordinates(location)) {
      setVideos([]);
      setTotal(0);
      return;
    }
    if (append) setMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        lat: String(location.lat),
        lng: String(location.lng),
        radius: String(DEFAULT_NEARBY_RADIUS_MILES),
        limit: String(limit),
        offset: String(offset),
        seed: rotationSeed(),
      });
      const response = await fetch(`/api/discovery/trending?${params}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error("request failed");
      const next = Array.isArray(body.videos) ? body.videos : [];
      setVideos((current) => append
        ? [...current, ...next.filter((row: Trending) => !current.some((item) => item.campaign_id === row.campaign_id))]
        : next);
      setTotal(Number(body.total || 0));
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError") setError("Trending Picks could not be loaded. Please try again.");
    } finally {
      setLoading(false);
      setMore(false);
    }
  }

  useEffect(() => {
    if (!location || !validCoordinates(location)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(0, false, controller.signal), 80);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [location?.lat, location?.lng, viewAll,maxCards]); // eslint-disable-line react-hooks/exhaustive-deps

  function resolved(next: CustomerLocation | null) {
    if (next) {
      locationState.setLocation(next);
      setLocationText(next.label);
    }
  }

  function scroll(direction: -1 | 1) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    carousel.current?.scrollBy({ left: direction * Math.min(720, carousel.current.clientWidth * 0.82), behavior });
  }

  return (
    <section aria-labelledby="trending-picks-heading" className={viewAll ? "py-6" : "pb-5 pt-3 sm:pb-6"}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h2 id="trending-picks-heading" className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]">{title}</h2>
            <span className="text-[10px] font-normal text-ink/55">Sponsored</span>
          </div>
          {description ? <p className="mt-1 text-xs text-ink/60">{description}</p> : null}
          {location ? <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/55"><MapPin size={12} aria-hidden="true" />Near {location.label}</p> : null}
        </div>
        {!viewAll && videos.length ? <div className="flex items-center gap-2"><button type="button" aria-label="Previous Trending Picks" onClick={()=>scroll(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum"><ArrowLeft size={16}/></button><button type="button" aria-label="Next Trending Picks" onClick={()=>scroll(1)} className="grid h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum"><ArrowRight size={16}/></button><Link href="/trending" className="ml-1 text-[11px] font-bold text-magenta">View all →</Link></div> : null}
      </div>

      {!locationState.ready || (loading && !videos.length) ? <Skeletons /> : !location ? (
        <div className="rounded-[15px] border border-plum/10 bg-white p-5">
          <h3 className="font-serif text-xl text-plum">Choose a location for local Trending Picks</h3>
          <p className="mt-1 text-xs text-ink/60">Only approved, paid video campaigns within their real radius are shown.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <LocationAutocomplete value={locationText} onChange={setLocationText} onResolved={resolved} className="rounded-lg border px-3" />
            <button type="button" onClick={() => void locationState.useDeviceLocation()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white"><LocateFixed size={15} aria-hidden="true" />Use my location</button>
          </div>
        </div>
      ) : error ? (
        <div role="alert" className="rounded-[15px] border border-red-200 bg-white p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"><RotateCcw size={14} aria-hidden="true" />Try again</button>
        </div>
      ) : videos.length ? (
        <>
          <div ref={viewAll ? undefined : carousel} tabIndex={viewAll ? undefined : 0} aria-label={viewAll ? undefined : "Trending Picks carousel"} className={viewAll ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"}>
            {videos.map((video) => (
              <article key={video.campaign_id} className="w-[54vw] max-w-[250px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-plum/10 bg-white shadow-[0_5px_18px_rgba(26,18,32,.07)] sm:w-auto sm:max-w-none">
                <SafeCampaignVideo src={video.video_url} poster={video.thumbnail_url} label={`${video.salon_name} Trending Pick`} className="aspect-[9/13] w-full" />
                <div className="p-3">
                  <Link href={`/salon/${video.salon_slug}`} className="font-serif text-base font-semibold text-plum">{video.salon_name}</Link>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-ink/60">{video.description}</p>
                  <p className="mt-2 text-[9px] text-ink/50">{video.distance_miles < 0.1 ? "Under 0.1" : Number(video.distance_miles).toFixed(1)} mi away</p>
                </div>
              </article>
            ))}
          </div>
          {viewAll && videos.length < total ? <button type="button" disabled={more} onClick={() => void load(videos.length, true)} className="mt-5 min-h-12 w-full rounded-lg border border-magenta bg-white text-sm font-bold text-magenta disabled:opacity-60">{more ? "Loading…" : "Load more Trending Picks"}</button> : null}
        </>
      ) : (
        <Link href="/partner" className="flex min-h-36 items-center gap-4 rounded-[15px] border border-plum/10 bg-[linear-gradient(120deg,#fff,#f7dce6)] p-6">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-plum text-white"><Video aria-hidden="true" /></span>
          <span><b className="font-serif text-xl text-plum">Share your salon’s work with nearby clients.</b><span className="mt-1 block text-xs text-ink/60">Learn about approved Trending Picks placements.</span></span>
        </Link>
      )}
    </section>
  );
}

function Skeletons() {
  return <div aria-label="Loading Trending Picks" className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className="animate-pulse overflow-hidden rounded-[14px] bg-white"><div className="aspect-[9/13] bg-blush" /><div className="space-y-2 p-3"><div className="h-4 rounded bg-blush" /><div className="h-3 w-2/3 rounded bg-blush/60" /></div></div>)}</div>;
}
