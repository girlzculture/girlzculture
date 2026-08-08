"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";

export type StyleCatalogItem = {
  name: string;
  category: string;
  categorySlug?: string;
  styleId?: string;
  styleSlug?: string;
  count: number;
  image: string;
  length?: string;
  maintenance?: string;
  price?: number;
};

const STYLE_STATE_KEY = "girlz-culture-style-catalog-v1";
const STYLE_STATE_TTL_MS = 30 * 60_000;

type StyleCatalogState = {
  savedAt: number;
  query: string;
  category: string;
  length: string;
  maintenance: string;
  price: string;
  sort: string;
  scrollY: number;
};

export default function StyleCatalog({ items }: { items: StyleCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [length, setLength] = useState("Length");
  const [maintenance, setMaintenance] = useState("Maintenance");
  const [price, setPrice] = useState("Price");
  const [sort, setSort] = useState("Popularity");
  const restored = useRef(false);
  const chips = useMemo(() => [...items].sort((left, right) => right.count - left.count).slice(0, 5), [items]);
  const categories = useMemo(() => ["All categories", ...Array.from(new Set(items.map((item) => item.category))).sort()], [items]);

  const persist = useCallback((scrollY = window.scrollY) => {
    try {
      const state: StyleCatalogState = {
        savedAt: Date.now(), query, category, length, maintenance, price, sort, scrollY,
      };
      sessionStorage.setItem(STYLE_STATE_KEY, JSON.stringify(state));
    } catch {
      // Browser history still preserves the route when storage is unavailable.
    }
  }, [category, length, maintenance, price, query, sort]);

  useEffect(() => {
    if (restored.current) return;
    try {
      const state = JSON.parse(sessionStorage.getItem(STYLE_STATE_KEY) || "null") as StyleCatalogState | null;
      if (!state || Date.now() - Number(state.savedAt || 0) > STYLE_STATE_TTL_MS) return;
      let scrollFrame = 0;
      const restoreFrame = window.requestAnimationFrame(() => {
        restored.current = true;
        setQuery(state.query || "");
        setCategory(categories.includes(state.category) ? state.category : "All categories");
        setLength(state.length || "Length");
        setMaintenance(state.maintenance || "Maintenance");
        setPrice(state.price || "Price");
        setSort(state.sort || "Popularity");
        scrollFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: Number(state.scrollY || 0), behavior: "auto" });
        });
      });
      return () => {
        window.cancelAnimationFrame(restoreFrame);
        if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      };
    } catch {
      // Ignore malformed or blocked session storage.
    }
  }, [categories]);

  useEffect(() => {
    const save = () => persist();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [persist]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = items.filter((item) => {
      if (term && !item.name.toLowerCase().includes(term)) return false;
      if (category !== "All categories" && item.category !== category) return false;
      if (length !== "Length" && item.length !== length) return false;
      if (maintenance !== "Maintenance" && item.maintenance !== maintenance) return false;
      if (price === "Under $150" && (item.price || 0) >= 150) return false;
      if (price === "$150–$250" && ((item.price || 0) < 150 || (item.price || 0) > 250)) return false;
      return true;
    });
    return [...result].sort((a, b) => sort === "A–Z" ? a.name.localeCompare(b.name) : b.count - a.count);
  }, [category, items, length, maintenance, price, query, sort]);

  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="min-w-0 max-w-full rounded-[14px] border border-plum/10 bg-white/85 p-3 shadow-[0_10px_32px_rgba(13,17,20,0.08)]">
        <div className="min-w-0 md:grid md:grid-cols-[1.5fr_repeat(4,0.55fr)_0.75fr_auto] md:gap-2">
          <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-[10px] border border-plum/10 px-4">
            <Search size={19} className="text-plum" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search styles" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="mt-2 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:contents [&::-webkit-scrollbar]:hidden">
            <FilterSelect value={category} onChange={setCategory} options={categories} />
            <FilterSelect value={length} onChange={setLength} options={["Length", "Shoulder", "Mid-back", "Waist"]} />
            <FilterSelect value={maintenance} onChange={setMaintenance} options={["Maintenance", "Low", "Medium", "High"]} />
            <FilterSelect value={price} onChange={setPrice} options={["Price", "Under $150", "$150–$250", "$250+"]} />
            <FilterSelect value={sort} onChange={setSort} options={["Popularity", "A–Z"]} prefix="Sort: " />
            <button type="button" aria-label="More filters" className="hidden min-h-12 items-center justify-center rounded-[10px] border border-plum/10 text-magenta md:flex"><SlidersHorizontal size={21} /></button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-xs font-semibold text-ink">Available styles</span>
        {chips.map((chip) => <button key={chip.name} type="button" onClick={() => setQuery(chip.name)} className="inline-flex shrink-0 items-center rounded-full border border-plum/10 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-ink/75">{chip.name}</button>)}
        <button type="button" onClick={() => { setQuery(""); setCategory("All categories"); setLength("Length"); setMaintenance("Maintenance"); setPrice("Price"); }} className="ml-auto shrink-0 text-xs font-bold text-magenta">View all</button>
      </div>

      <div className="mt-3 grid min-w-0 max-w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {filtered.map((item) => (
          <Link onClick={() => persist()} key={`${item.categorySlug || item.category}-${item.name}`} href={`/salons?style=${encodeURIComponent(item.name)}&style_slug=${encodeURIComponent(item.styleSlug || item.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-"))}${item.styleId ? `&style_id=${encodeURIComponent(item.styleId)}` : ""}&category=${encodeURIComponent(item.categorySlug || item.category)}`} className="group min-w-0 overflow-hidden rounded-[12px] border border-plum/10 bg-blush/45 shadow-[0_6px_22px_rgba(13,17,20,0.06)] transition hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(13,17,20,0.12)]">
            {item.image ? <div className="aspect-[1.55/1] overflow-hidden bg-cream sm:aspect-[1.65/1]">
              <SafeImage src={item.image} fallbackSrc={item.image} alt={`${item.name} hairstyle`} rendition="thumbnail" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            </div> : null}
            <div className="px-3 py-3 sm:px-4">
              <p className="mb-1 break-words text-[9px] font-bold uppercase tracking-[0.12em] text-amber">{item.category}</p>
              <h2 className="break-words font-serif text-[15px] font-semibold leading-tight text-ink sm:text-[18px]">{item.name}</h2>
              <p className="mt-1 text-[10px] font-semibold text-magenta sm:text-xs">{item.count} {item.count === 1 ? "salon" : "salons"}</p>
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length ? <div className="mt-6 rounded-[14px] border border-dashed border-plum/20 bg-white/65 p-8 text-center text-sm text-ink/65">No styles match those filters. Try clearing one.</div> : null}
    </div>
  );
}

function FilterSelect({ value, onChange, options, prefix = "" }: { value: string; onChange: (value: string) => void; options: string[]; prefix?: string }) {
  return <label className="w-[128px] min-w-[128px] max-w-full shrink-0 overflow-hidden md:w-auto md:min-w-0 md:overflow-visible"><span className="sr-only">{options[0]}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 min-w-0 w-full max-w-full rounded-[10px] border border-plum/10 bg-white px-3 text-xs font-medium text-ink outline-none">{options.map((option, index) => <option key={option} value={option}>{prefix && index === 0 ? `${prefix}${option}` : option}</option>)}</select></label>;
}
