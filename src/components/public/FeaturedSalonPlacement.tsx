"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LocateFixed, MapPin, Megaphone, RotateCcw } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import { LocationAutocomplete } from "@/components/search/AutocompleteInputs";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import {
  DEFAULT_NEARBY_RADIUS_MILES,
  validCoordinates,
  type CustomerLocation,
} from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";

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
}: {
  title?: string;
  description?: string | null;
  viewAll?: boolean;
}) {
  const customerLocation = useCustomerLocation();
  const [locationText, setLocationText] = useState("");
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
  const location = customerLocation.location;
  const limit = viewAll ? 24 : 12;

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
        radius: String(DEFAULT_NEARBY_RADIUS_MILES),
        limit: String(limit),
        offset: String(offset),
        seed: rotationSeed(),
      });
      const response = await fetch(`/api/discovery/featured?${params}`, {
        cache: "no-store",
        signal,
      });
      const body = (await response.json()) as {
        salons?: PublicSalonResult[];
        total?: number;
        promo?: Promo;
        error?: string;
      };
      if (!response.ok) throw new Error("request failed");
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
        setError("Featured salons could not be loaded. Please try again.");
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
  }, [location?.lat, location?.lng, viewAll]);

  async function requestDeviceLocation() {
    await customerLocation.useDeviceLocation();
  }
  function resolved(next: CustomerLocation | null) {
    if (next) {
      customerLocation.setLocation(next);
      setLocationText(next.label);
    }
  }

  return (
    <section
      aria-labelledby="featured-salons-heading"
      className={viewAll ? "py-6" : "pb-5 pt-3 sm:pb-6"}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <h2
              id="featured-salons-heading"
              className="font-serif text-[23px] font-semibold text-ink sm:text-[28px]"
            >
              {title}
            </h2>
            <span className="text-[10px] font-normal text-ink/55">
              Sponsored
            </span>
          </div>
          {description ? (
            <p className="mt-1 text-xs text-ink/60">{description}</p>
          ) : null}
          {location ? (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-ink/55">
              <MapPin size={12} />
              Near {location.label}
            </p>
          ) : null}
        </div>
        {!viewAll && salons.length ? (
          <Link href="/featured" className="text-[11px] font-bold text-magenta">
            View all →
          </Link>
        ) : null}
      </div>
      {!customerLocation.ready ? (
        <Skeletons count={viewAll ? 8 : 4} />
      ) : !location ? (
        <div className="rounded-[15px] border border-plum/10 bg-white p-5">
          <h3 className="font-serif text-xl text-plum">
            Choose a location for local featured salons
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink/65">
            Featured placement is local. We will not fill this row with distant
            or unpaid salons.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <LocationAutocomplete
              value={locationText}
              onChange={setLocationText}
              onResolved={resolved}
              placeholder="City, neighborhood, or ZIP"
              className="rounded-[9px] border border-plum/15 px-3"
            />
            <button
              type="button"
              onClick={() => void requestDeviceLocation()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[9px] bg-magenta px-5 text-xs font-bold text-white"
            >
              <LocateFixed size={15} />
              Use my location
            </button>
          </div>
          {customerLocation.permissionError ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {customerLocation.permissionError}
            </p>
          ) : null}
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
          <div
            className={`-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden ${viewAll ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4"}`}
          >
            {salons.map((salon) => (
              <MarketplaceSalonCard
                key={salon.id}
                salon={salon}
                variant="grid"
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
          className="flex min-h-40 items-center gap-5 rounded-[16px] border border-plum/10 bg-[linear-gradient(120deg,#fff,#f7dce6)] p-6 shadow-[0_6px_20px_rgba(26,18,32,.06)]"
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
