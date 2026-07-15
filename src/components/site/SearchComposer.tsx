"use client";

import { useState } from "react";
import { LocationAutocomplete, StyleAutocomplete } from "@/components/search/AutocompleteInputs";

export default function SearchComposer({ compact = false }: { compact?: boolean }) {
  const [style, setStyle] = useState("");
  const [location, setLocation] = useState("");
  return <form action="/salons" method="get" className={`border border-plum/10 bg-[#fffdfa] shadow-[0_12px_34px_rgba(26,18,32,.10)] ${compact ? "rounded-[14px] p-2.5" : "rounded-[16px] p-2.5 sm:p-3 md:p-1.5"}`}><div className="grid gap-2 md:grid-cols-[1.1fr_.9fr_auto] md:items-end"><label className="block min-w-0 rounded-[10px] px-3 py-1 focus-within:bg-cream/55"><span className="block text-[10px] font-bold text-ink">What service are you looking for?</span><StyleAutocomplete value={style} onChange={setStyle} placeholder="e.g., Knotless Braids" className="mt-0.5"/></label><label className="block min-w-0 border-t border-plum/10 px-3 py-1 focus-within:bg-cream/55 md:border-l md:border-t-0"><span className="block text-[10px] font-bold text-ink">Where?</span><LocationAutocomplete value={location} onChange={setLocation} placeholder="City, neighborhood, or ZIP" className="mt-0.5"/></label><button type="submit" className="min-h-11 rounded-[10px] bg-magenta px-8 text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(214,24,107,.18)] transition hover:-translate-y-0.5 hover:bg-[#bb145d]">Search</button></div></form>;
}
