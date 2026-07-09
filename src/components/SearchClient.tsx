"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSearchParams, useRouter } from "next/navigation";

type Salon = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  neighborhood?: string | null;
  rating_overall?: number | null;
  review_count?: number | null;
  badges?: string[] | string | null;
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

  const fetchSalons = async (styleQuery?: string) => {
    setLoading(true);
    const { data: salonsData, error } = await supabase.from("salons").select("*");
    if (error) {
      console.error("search salons error", error);
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
    fetchSalons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resultCount = salons.length;

  const onSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const qs = new URLSearchParams();
    if (style) qs.set("style", style);
    if (location) qs.set("location", location);
    router.push(`/search?${qs.toString()}`);
    fetchSalons(style);
  };

  return (
    <div>
      <form onSubmit={onSearch} className="mb-4">
        <div className="flex w-full gap-3">
          <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="What style are you looking for?" className="flex-1 rounded-full border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm" />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where? (neighborhood, city, or zip)" className="w-44 rounded-full border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm" />
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
                    <div className="font-semibold text-plum">{s.name}</div>
                    <div className="text-sm text-ink/70">{s.neighborhood}</div>
                    <div className="mt-2 flex items-center gap-2 text-sm text-ink/80">
                      <div className="flex">{Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < Math.round(s.rating_overall || 0) ? "text-amber" : "text-ink/20"}>★</span>
                      ))}</div>
                      <div>{(s.rating_overall || 0).toFixed(1)} · {s.review_count || 0} reviews</div>
                    </div>
                    <div className="mt-2 text-sm text-ink/80">{Array.isArray(s.badges) ? s.badges.join(" • ") : s.badges}</div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm text-ink/80">From {startingMap[s.id || ""] ? `$${startingMap[s.id || ""]}` : "—"}</div>
                    <a href={`/salon/${s.slug}`} className="rounded-full bg-magenta px-4 py-2 text-xs font-semibold text-white">View salon</a>
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
