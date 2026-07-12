import Link from "next/link";
import { MapPin, Search } from "lucide-react";

export default function SearchComposer({ compact = false }: { compact?: boolean }) {
  return (
    <form
      action="/salons"
      method="get"
      className={`border border-plum/10 bg-[#fffdfa] shadow-[0_12px_34px_rgba(26,18,32,0.10)] ${compact ? "rounded-[14px] p-2.5" : "rounded-[16px] p-2.5 sm:p-3 md:p-1.5"}`}
    >
      <div className="grid gap-2 md:grid-cols-[1.1fr_0.9fr_auto] md:items-end">
        <label className="block min-w-0 rounded-[10px] px-3 py-1.5 focus-within:bg-cream/55 md:py-0">
          <span className="block text-[10px] font-bold text-ink">What style are you looking for?</span>
          <span className="mt-1 flex items-center gap-2">
            <input
              name="style"
              type="search"
              placeholder="e.g., Knotless Braids"
              className="min-h-6 min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink/40"
            />
            <Search aria-hidden="true" size={18} className="shrink-0 text-magenta" />
          </span>
        </label>
        <label className="block min-w-0 border-t border-plum/10 px-3 py-1.5 focus-within:bg-cream/55 md:border-l md:border-t-0 md:py-0">
          <span className="block text-[10px] font-bold text-ink">Where?</span>
          <span className="mt-1 flex items-center gap-2">
            <input
              name="location"
              type="search"
              placeholder="Neighborhood, city, or zip code"
              className="min-h-6 min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink/40"
            />
            <MapPin aria-hidden="true" size={18} className="shrink-0 text-magenta" />
          </span>
        </label>
        <button type="submit" className="min-h-11 rounded-[10px] bg-magenta px-8 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(214,24,107,0.18)] transition hover:-translate-y-0.5 hover:bg-[#bb145d]">
          Search
        </button>
      </div>
      {!compact ? (
        <div className="mt-1 flex items-center gap-2 overflow-x-auto px-2 pb-0.5 text-[9px] [scrollbar-width:none] md:mt-0 [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 font-semibold text-ink/65">Popular searches:</span>
          {[
            ["Knotless Braids", "Knotless"],
            ["Boho Braids", "Boho"],
            ["Cornrows", "Cornrows"],
            ["Locs", "Locs"],
            ["Box Braids", "Box Braids"],
          ].map(([value, label], index) => (
            <Link key={value} href={`/salons?style=${encodeURIComponent(value)}`} className={`shrink-0 rounded-full border border-plum/10 bg-cream px-3 py-1 font-semibold text-ink/70 hover:border-magenta/30 hover:text-magenta ${index === 4 ? "hidden sm:inline-flex" : ""}`}>
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </form>
  );
}
