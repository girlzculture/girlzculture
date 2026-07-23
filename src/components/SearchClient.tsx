"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSearchParams, useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { getSalonStatusLabel, isSalonClosedToday } from "@/lib/salonOpenStatus";

type Salon = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  rating_overall?: number | null;
  review_count?: number | null;
  is_closed_override?: boolean | null;
  closed_override_date?: string | null;
  time_zone?: string | null;
  hours?: unknown;
};

export default function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialStyle = searchParams?.get("style") || "";
  const initialLocation = searchParams?.get("location") || "";

  const [style, setStyle] = useState(initialStyle);
  const [location, setLocation] = useState(initialLocation);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [startingMap, setStartingMap] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  const fetchSalons = async () => {
    setLoading(true);
    const { data: salonsData, error } = await supabase.from("salons").select("id,name,slug,address_city,address_state,address_zip,rating_overall,review_count,is_closed_override,closed_override_date,time_zone,hours");
    if (error) {
      setSalons([]);
      setLoading(false);
      return;
    }

    const items = (salonsData || []) as Salon[];
    setSalons(items);

    const ids = items.map((s) => s.id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: stylesData } = await supabase
        .from("styles")
        .select("salon_id, price_display_min")
        .in("salon_id", ids) as { data?: { salon_id?: string; price_display_min?: number }[] };

      const styles = stylesData || [];
      const map = ids.reduce((acc, id) => {
        const prices = styles.filter((st) => st.salon_id === id).map((s) => s.price_display_min).filter(Boolean) as number[];
        acc[id] = prices.length ? Math.min(...prices) : null;
        return acc;
      }, {} as Record<string, number | null>);
      setStartingMap(map);
    }

    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSalons();
  }, []);

  const resultCount = salons.length;

  const onSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const qs = new URLSearchParams();
    if (style) qs.set("style", style);
    if (location) qs.set("location", location);
    router.push(`/search?${qs.toString()}`);
    void fetchSalons();
  };

  return (
    <div>
      <form onSubmit={onSearch} className="mb-4">
        <div className="flex w-full gap-3">
          <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="What style are you looking for?" className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where? (city, state, or ZIP)" className="w-44 rounded-full border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm" />
          <button type="submit" className="rounded-full bg-magenta px-5 py-3 text-sm font-semibold text-white">Search</button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <div className="mr-4 font-medium">Filters:</div>
        {[
          "Style",
          "Price",
          "Distance",
          "Rating",
          "Availability",
        ].map((f) => (
          <button key={f} className="rounded-full bg-blush px-3 py-1 text-sm text-plum">{f}</button>
        ))}
      </div>

      <div className="mb-4 text-sm text-ink/70">{loading ? "Searching salons..." : `${resultCount} salons match your search`}</div>

      <div className="grid gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-lg border border-ink/10 bg-white p-4">
                <div className="mb-3 h-36 w-full rounded-md bg-cream/60" />
                <div className="h-4 w-3/5 rounded bg-ink/10" />
                <div className="mt-2 h-3 w-2/5 rounded bg-ink/10" />
              </div>
            ))
          : salons.length === 0
          ? (
            <div className="rounded-lg border border-plum/10 bg-blush/40 p-6 text-center text-ink/80">No salons found — try a nearby area.</div>
          )
          : salons.map((s) => (
              <div key={s.id} className="rounded-lg border border-plum/10 bg-white p-4 shadow-sm">
                <div className="mb-3 h-36 w-full rounded-md bg-cream/60" />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-plum">{s.name}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${isSalonClosedToday(s)?"bg-red-100 text-red-700":"bg-blush/55 text-plum"}`}>{getSalonStatusLabel(s)}</span></div>
                    <div className="text-sm text-ink/70">{[s.address_city,s.address_state].filter(Boolean).join(", ") || "Location not provided"}</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-ink/80">
                      {Number(s.review_count || 0) > 0 ? <><Star size={15} className="fill-amber text-amber" aria-hidden="true" /><div>{Number(s.rating_overall || 0).toFixed(1)} · {s.review_count} reviews</div></> : <div className="rounded-full bg-blush px-2 py-1 font-bold text-plum">New</div>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-ink/80">{startingMap[s.id || ""] ? `From $${startingMap[s.id || ""]}` : "Price not listed"}</div>
                    <a href={`/salon/${s.slug}`} className="rounded-full bg-magenta px-4 py-2 text-xs font-semibold text-white">View salon</a>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
