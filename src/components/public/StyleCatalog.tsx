"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";

export type StyleCatalogItem = {
  name: string;
  count: number;
  image: string;
  length?: string;
  maintenance?: string;
  price?: number;
};

export default function StyleCatalog({ items }: { items: StyleCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [length, setLength] = useState("Length");
  const [maintenance, setMaintenance] = useState("Maintenance");
  const [price, setPrice] = useState("Price");
  const [sort, setSort] = useState("Popularity");
  const chips = useMemo(() => [...items].sort((left, right) => right.count - left.count).slice(0, 5), [items]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = items.filter((item) => {
      if (term && !item.name.toLowerCase().includes(term)) return false;
      if (length !== "Length" && item.length !== length) return false;
      if (maintenance !== "Maintenance" && item.maintenance !== maintenance) return false;
      if (price === "Under $150" && (item.price || 0) >= 150) return false;
      if (price === "$150–$250" && ((item.price || 0) < 150 || (item.price || 0) > 250)) return false;
      return true;
    });
    return [...result].sort((a, b) => sort === "A–Z" ? a.name.localeCompare(b.name) : b.count - a.count);
  }, [items, length, maintenance, price, query, sort]);

  return (
    <>
      <div className="rounded-[14px] border border-plum/10 bg-white/85 p-3 shadow-[0_10px_32px_rgba(26,18,32,0.08)]">
        <div className="md:grid md:grid-cols-[1.6fr_repeat(3,0.55fr)_0.75fr_auto] md:gap-2">
          <label className="flex min-h-12 items-center gap-3 rounded-[10px] border border-plum/10 px-4">
            <Search size={19} className="text-plum" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search styles" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:contents [&::-webkit-scrollbar]:hidden">
            <FilterSelect value={length} onChange={setLength} options={["Length", "Shoulder", "Mid-back", "Waist"]} />
            <FilterSelect value={maintenance} onChange={setMaintenance} options={["Maintenance", "Low", "Medium", "High"]} />
            <FilterSelect value={price} onChange={setPrice} options={["Price", "Under $150", "$150–$250", "$250+"]} />
            <FilterSelect value={sort} onChange={setSort} options={["Popularity", "A–Z"]} prefix="Sort: " />
            <button type="button" aria-label="More filters" className="hidden min-h-12 items-center justify-center rounded-[10px] border border-plum/10 text-magenta md:flex"><SlidersHorizontal size={21} /></button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-xs font-semibold text-ink">Available styles</span>
        {chips.map((chip) => <button key={chip.name} type="button" onClick={() => setQuery(chip.name)} className="inline-flex shrink-0 items-center rounded-full border border-plum/10 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-ink/75">{chip.name}</button>)}
        <button type="button" onClick={() => { setQuery(""); setLength("Length"); setMaintenance("Maintenance"); setPrice("Price"); }} className="ml-auto shrink-0 text-xs font-bold text-magenta">View all</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {filtered.map((item) => (
          <Link key={item.name} href={`/salons?style=${encodeURIComponent(item.name)}`} className="group overflow-hidden rounded-[12px] border border-plum/10 bg-blush/45 shadow-[0_6px_22px_rgba(26,18,32,0.06)] transition hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(26,18,32,0.12)]">
            {item.image ? <div className="aspect-[1.55/1] overflow-hidden bg-cream sm:aspect-[1.65/1]">
              <SafeImage src={item.image} fallbackSrc={item.image} alt={`${item.name} hairstyle`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            </div> : null}
            <div className="px-3 py-3 sm:px-4">
              <h2 className="font-serif text-[15px] font-semibold leading-tight text-ink sm:text-[18px]">{item.name}</h2>
              <p className="mt-1 text-[10px] font-semibold text-magenta sm:text-xs">{item.count} {item.count === 1 ? "salon" : "salons"}</p>
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length ? <div className="mt-6 rounded-[14px] border border-dashed border-plum/20 bg-white/65 p-8 text-center text-sm text-ink/65">No styles match those filters. Try clearing one.</div> : null}
    </>
  );
}

function FilterSelect({ value, onChange, options, prefix = "" }: { value: string; onChange: (value: string) => void; options: string[]; prefix?: string }) {
  return <label className="min-w-[128px]"><span className="sr-only">{options[0]}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-[10px] border border-plum/10 bg-white px-3 text-xs font-medium text-ink outline-none">{options.map((option, index) => <option key={option} value={option}>{prefix && index === 0 ? `${prefix}${option}` : option}</option>)}</select></label>;
}
