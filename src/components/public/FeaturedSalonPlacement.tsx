"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Megaphone, RotateCcw } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import { validCoordinates } from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";
import { readApiResponse } from "@/lib/apiResponseClient";

type Promo = { title: string; body: string; href: string };
const SESSION_SEED_KEY = "girlz-culture-featured-rotation-v1";

function rotationSeed() {
  let seed = sessionStorage.getItem(SESSION_SEED_KEY);
  if (!seed) {
    seed = crypto.randomUUID();
    sessionStorage.setItem(SESSION_SEED_KEY, seed);
  }
  return seed;
}

export default function FeaturedSalonPlacement({
  title = "Featured Salons",
  description,
  viewAll = false,
  maxCards=12,
}: {
  title?: string;
  description?: string | null;
  viewAll?: boolean;
  maxCards?:number;
}) {
  const customerLocation = useCustomerLocation();
  const [salons, setSalons] = useState<PublicSalonResult[]>([]);
  const [total, setTotal] = useState(0);
  const [promo, setPromo] = useState<Promo>({
    title: "Own a business? Get featured here.",
    body: "Put your salon in front of nearby clients with a clearly labeled featured placement.",
    href: "/partner",
  });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const carousel = useRef<HTMLDivElement>(null);
  const location = customerLocation.location;
  const limit = viewAll ? 24 : Math.max(1,Math.min(24,Math.round(maxCards)));

  async function load(offset = 0, append = false, signal?: AbortSignal) {
    if (!location || !validCoordinates(location)) {
      setSalons([]);
      setTotal(0);
      return;
    }
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        lat: String(location.lat),
        lng: String(location.lng),
        radius: String(customerLocation.radiusMiles),
        limit: String(limit),
        offset: String(offset),
        seed: rotationSeed(),
      });
      const response = await fetch(`/api/discovery/featured?${params}`, {
        cache: "no-store",
        signal,
      });
      const body = (await readApiResponse(response, "Featured salons could not be loaded.")) as {
        salons?: PublicSalonResult[];
        total?: number;
        promo?: Promo;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Featured salons could not be loaded.");
      const next = Array.isArray(body.salons) ? body.salons : [];
      setSalons((current) =>
        append
          ? [
              ...current,
              ...next.filter(
                (row) => !current.some((item) => item.id === row.id),
              ),
            ]
          : next,
      );
      setTotal(Number(body.total || 0));
      if (body.promo) setPromo(body.promo);
    } catch (loadError) {
      if ((loadError as Error).name !== "AbortError")
        setError(loadError instanceof Error ? loadError.message : "Featured salons could not be loaded. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!location || !validCoordinates(location)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void load(0, false, controller.signal),
      80,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // Location coordinates are the complete public placement inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng, customerLocation.radiusMiles, viewAll,maxCards]);

  function scroll(direction: -1 | 1) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    carousel.current?.scrollBy({ left: direction * Math.min(720, carousel.current.clientWidth * 0.82), behavior });
  }

  return (
    <section
      aria-labelledby="featured-salons-heading"
      data-home-salon-section="featured"
      className={viewAll ? "py-6" : "pb-3 pt-1 sm:pb-6 sm:pt-3"}
    >
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3 sm:mb-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h2
              id="featured-salons-heading"
              className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]"
            >
              {title}
            </h2>
            <span className="text-[10px] font-normal text-ink/55">
              Featured
            </span>
          </div>
          {description ? (
            <p className="mt-1 text-xs text-ink/60">{description}</p>
          ) : null}
        </div>
        {!viewAll && salons.length ? (
          <div className="flex items-center gap-2"><button type="button" aria-label="Previous featured salons" onClick={()=>scroll(-1)} className="hidden h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum sm:grid"><ArrowLeft size={16}/></button><button type="button" aria-label="Next featured salons" onClick={()=>scroll(1)} className="hidden h-10 w-10 place-items-center rounded-full border border-plum/15 bg-white text-plum sm:grid"><ArrowRight size={16}/></button><Link href="/featured" className="ml-1 text-[11px] font-bold text-magenta">View all →</Link></div>
        ) : null}
      </div>
      {!customerLocation.ready ? (
        <Skeletons count={viewAll ? 8 : 4} />
      ) : !location ? (
        <div className="rounded-[15px] border border-plum/10 bg-white p-6 text-center">
          <h3 className="font-serif text-xl text-plum">
            Local featured salons need a search area
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink/65">
            Choose a city or ZIP in Find Salons. We only show eligible featured
            placements within their real campaign radius. We will not fill this row with distant
            or ineligible salons.
          </p>
          <Link
            href="/salons"
            className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-magenta px-5 text-xs font-bold text-white"
          >
            Choose a search location
          </Link>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-[15px] border border-red-200 bg-white p-6 text-center"
        >
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-magenta px-4 text-xs font-bold text-white"
          >
            <RotateCcw size={14} />
            Try again
          </button>
        </div>
      ) : loading && !salons.length ? (
        <Skeletons count={viewAll ? 8 : 4} />
      ) : salons.length ? (
        <>
          <div ref={viewAll ? undefined : carousel} tabIndex={viewAll ? undefined : 0} aria-label={viewAll ? undefined : "Featured salons carousel"}
            className={viewAll ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"}
          >
            {salons.map((salon) => (
              <MarketplaceSalonCard
                key={salon.id}
                salon={salon}
                variant={viewAll ? "grid" : "compact"}
              />
            ))}
          </div>
          {viewAll && salons.length < total ? (
            <button
              disabled={loadingMore}
              onClick={() => void load(salons.length, true)}
              className="mt-5 min-h-12 w-full rounded-[10px] border border-magenta bg-white text-sm font-bold text-magenta disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more featured salons"}
            </button>
          ) : null}
        </>
      ) : (
        <Link
          href={promo.href}
          className="flex min-h-40 items-center gap-5 rounded-[16px] border border-plum/10 bg-[linear-gradient(120deg,#fff,#F5F7F8)] p-6 shadow-[0_6px_20px_rgba(13,17,20,.06)]"
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-plum text-white">
            <Megaphone />
          </span>
          <span>
            <b className="font-serif text-2xl text-plum">{promo.title}</b>
            <span className="mt-2 block max-w-xl text-sm leading-6 text-ink/65">
              {promo.body}
            </span>
            <span className="mt-3 inline-block text-xs font-bold text-magenta">
              Learn about featured placement →
            </span>
          </span>
        </Link>
      )}
    </section>
  );
}

function Skeletons({ count }: { count: number }) {
  return (
    <div
      aria-label="Loading featured salons"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="animate-pulse overflow-hidden rounded-[14px] border border-plum/10 bg-white"
        >
          <div className="aspect-[16/10] bg-blush/70" />
          <div className="space-y-2 p-3">
            <div className="h-5 w-2/3 rounded bg-blush" />
            <div className="h-3 w-1/2 rounded bg-blush/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
