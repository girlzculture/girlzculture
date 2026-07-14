"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Heart, List, Map, MapPin, Search, ShieldCheck, SlidersHorizontal, Star, Tag } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";

export type DiscoverySalon = {
  id: string; name: string; slug: string; city: string; state: string; zip: string;
  rating: number; reviewCount: number; image: string; startingPrice: number | null;
  tier: string; verified: boolean; styles: string[]; nextAvailability: string | null;
  latitude?: number | null; longitude?: number | null;
  closedToday?: boolean;
};

const rank: Record<string, number> = { premium: 3, platinum: 3, growth: 2, pro: 2, essentials: 2, basic: 1, free: 0, "free-seed": 0 };

export default function SalonDiscovery({ initialSalons, initialStyle = "", initialLocation = "" }: { initialSalons: DiscoverySalon[]; initialStyle?: string; initialLocation?: string }) {
  const [style, setStyle] = useState(initialStyle);
  const [location, setLocation] = useState(initialLocation);
  const [submittedStyle, setSubmittedStyle] = useState(initialStyle);
  const [submittedLocation, setSubmittedLocation] = useState(initialLocation);
  const [view, setView] = useState<"list" | "map">("list");
  const [price, setPrice] = useState("Any price");
  const [rating, setRating] = useState("Any rating");

  const salons = useMemo(() => initialSalons.filter((salon) => {
    const styleTerm = submittedStyle.trim().toLowerCase();
    const locationTerm = submittedLocation.trim().toLowerCase();
    if (styleTerm && !`${salon.name} ${salon.styles.join(" ")}`.toLowerCase().includes(styleTerm)) return false;
    if (locationTerm && !`${salon.city} ${salon.state} ${salon.zip}`.toLowerCase().includes(locationTerm)) return false;
    if (price !== "Any price" && salon.startingPrice == null) return false;
    if (price === "Under $150" && (salon.startingPrice ?? Infinity) >= 150) return false;
    if (price === "$150–$250" && ((salon.startingPrice ?? 0) < 150 || (salon.startingPrice ?? Infinity) > 250)) return false;
    if (price === "$250+" && (salon.startingPrice ?? 0) < 250) return false;
    if (rating === "4.8+" && salon.rating < 4.8) return false;
    if (rating === "4.5+" && salon.rating < 4.5) return false;
    return true;
  }).sort((a, b) => (rank[b.tier.toLowerCase()] || 0) - (rank[a.tier.toLowerCase()] || 0) || b.rating - a.rating), [initialSalons, price, rating, submittedLocation, submittedStyle]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmittedStyle(style);
    setSubmittedLocation(location);
    const params = new URLSearchParams();
    if (style) params.set("style", style);
    if (location) params.set("location", location);
    window.history.replaceState(null, "", `/salons${params.size ? `?${params}` : ""}`);
  }

  return <>
    <form onSubmit={submit} className="sticky top-0 z-30 rounded-[14px] border border-plum/10 bg-white/95 p-3 shadow-[0_12px_34px_rgba(26,18,32,0.10)] backdrop-blur md:static md:max-w-[1050px]">
      <div className="grid gap-2 md:grid-cols-[1.25fr_0.85fr_auto]">
        <label className="flex min-h-12 items-center gap-3 rounded-[9px] border border-plum/10 px-4"><Search size={19} className="text-magenta" /><input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="Describe the style you want" className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm" /></label>
        <label className="flex min-h-12 items-center gap-3 rounded-[9px] border border-plum/10 px-4"><MapPin size={19} className="text-magenta" /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, state, or ZIP code" className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm" /></label>
        <button className="min-h-12 rounded-[9px] bg-magenta px-8 text-sm font-bold text-white">Search</button>
      </div>
    </form>

    <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Filter label="Style" icon={<SlidersHorizontal size={14} />} />
      <SelectFilter value={price} onChange={setPrice} options={["Any price", "Under $150", "$150–$250", "$250+"]} />
      <Filter label="Distance" icon={<MapPin size={14} />} />
      <SelectFilter value={rating} onChange={setRating} options={["Any rating", "4.5+", "4.8+"]} />
      <Filter label="Availability" icon={<CalendarDays size={14} />} />
      <button type="button" onClick={() => { setPrice("Any price"); setRating("Any rating"); setSubmittedStyle(""); setSubmittedLocation(""); }} className="shrink-0 px-2 text-[11px] font-bold text-magenta">Clear all</button>
      <div className="ml-auto hidden overflow-hidden rounded-[8px] border border-plum/10 md:flex"><Toggle active={view === "list"} onClick={() => setView("list")} icon={<List size={16} />} label="List" /><Toggle active={view === "map"} onClick={() => setView("map")} icon={<Map size={16} />} label="Map" /></div>
    </div>
    <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-[9px] border border-plum/10 md:hidden"><Toggle active={view === "list"} onClick={() => setView("list")} icon={<List size={16} />} label="List" /><Toggle active={view === "map"} onClick={() => setView("map")} icon={<Map size={16} />} label="Map" /></div>

    <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1"><h2 className="font-serif text-2xl font-semibold text-ink">Salons Near You</h2><span className="inline-flex items-center gap-1 text-[11px] text-ink/65"><MapPin size={12} />{submittedLocation ? `Near ${submittedLocation}` : "Showing available salons"}</span><span className="text-[11px] text-ink/55">Salons on higher plans appear first.</span></div>

    {view === "map" ? <MapPanel salons={salons} /> : <div className="mt-3 grid gap-4 lg:grid-cols-[1.18fr_0.92fr]">
      <div className="space-y-2">{salons.map((salon) => <SalonResultCard key={salon.id} salon={salon} />)}{!salons.length ? <div className="rounded-[12px] border border-dashed border-plum/20 bg-white/70 p-10 text-center text-sm"><h3 className="font-serif text-xl text-plum">No salons found</h3><p className="mt-2 text-ink/60">Try different filters, or check back as new salons are approved.</p></div> : null}</div>
      <div className="hidden lg:block"><MapPanel salons={salons} compact /></div>
    </div>}
  </>;
}

function SalonResultCard({ salon }: { salon: DiscoverySalon }) {
  return <article className="grid min-w-0 overflow-hidden rounded-[11px] border border-plum/10 bg-white/80 shadow-[0_5px_18px_rgba(26,18,32,0.05)] sm:grid-cols-[215px_1fr]">
    <div className="relative h-44 bg-blush sm:h-full"><SafeImage src={salon.image} fallbackSrc="/images/salon-warm.jpg" alt={salon.name} className="h-full w-full object-cover" />{salon.tier.toLowerCase() === "premium" || salon.verified ? <span className="absolute left-2 top-2 rounded-full bg-plum px-2.5 py-1 text-[8px] font-bold uppercase text-white">{salon.tier.toLowerCase() === "premium" ? "Premium" : "Verified"}</span> : null}<button aria-label={`Favorite ${salon.name}`} className="absolute right-2 top-2 rounded-full bg-white/85 p-2"><Heart size={16} /></button></div>
    <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-xl font-semibold text-ink">{salon.name}</h3>{salon.closedToday ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">Closed today</span> : null}</div><p className="mt-0.5 text-[10px] text-ink/60">{[salon.city, salon.state].filter(Boolean).join(", ") || "Location not provided"}</p><div className="mt-2 flex items-center gap-2 text-[10px]">{salon.reviewCount > 0 && salon.rating > 0 ? <><Star size={14} className="fill-amber text-amber" /><b>{salon.rating.toFixed(1)}</b><span className="text-ink/50">({salon.reviewCount})</span></> : <span className="rounded-full bg-blush px-2 py-1 font-bold text-plum">New</span>}{salon.styles.length ? <span className="truncate text-ink/50">· {salon.styles.slice(0, 3).join(" · ")}</span> : null}</div><p className="mt-2 text-xs">{salon.startingPrice == null ? <span className="text-ink/55">Pricing not posted</span> : <>From <b className="text-base">${salon.startingPrice}</b></>}</p><div className="mt-2 flex flex-wrap gap-2">{salon.verified ? <Badge icon={<ShieldCheck size={12} />} label="Verified" /> : null}{salon.startingPrice != null ? <Badge icon={<Tag size={12} />} label="Pricing available" /> : null}</div><p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-magenta"><CalendarDays size={12} />{salon.closedToday ? "Bookings resume with normal hours tomorrow" : salon.nextAvailability || "Availability not posted"}</p></div>
      <div className="flex min-w-[105px] items-end"><Link href={`/salon/${salon.slug}`} className="inline-flex min-h-10 w-full items-center justify-center rounded-[7px] bg-magenta px-4 text-[11px] font-bold text-white">View salon</Link></div>
    </div>
  </article>;
}

function MapPanel({ salons, compact = false }: { salons: DiscoverySalon[]; compact?: boolean }) {
  return <div className={`relative overflow-hidden rounded-[12px] border border-plum/10 bg-[linear-gradient(35deg,#e8f1ed_0%,#fff8ee_45%,#edf2ed_100%)] ${compact ? "sticky top-4 h-[560px]" : "mt-3 h-[540px]"}`}><div className="absolute inset-0 opacity-40 [background-image:linear-gradient(28deg,transparent_48%,#b8c9c1_49%,#b8c9c1_51%,transparent_52%),linear-gradient(112deg,transparent_48%,#cfbfae_49%,#cfbfae_51%,transparent_52%)] [background-size:90px_70px,120px_95px]" />{salons.filter(salon => salon.startingPrice != null).slice(0, 7).map((salon, index) => <Link href={`/salon/${salon.slug}`} key={salon.id} style={{ left: `${14 + (index * 23) % 72}%`, top: `${14 + (index * 31) % 70}%` }} className="absolute z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold shadow-lg"><MapPin size={14} className="fill-magenta text-magenta" />${salon.startingPrice}</Link>)}<div className="absolute bottom-4 left-4 right-4 rounded-[10px] bg-white/90 p-3 text-xs shadow-lg"><b>{salons[0]?.name || "No salons to map"}</b><p className="mt-1 text-ink/60">{salons.length ? "Map markers use available salon pricing." : "Approved salons will appear here when available."}</p></div></div>;
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) { return <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-1 text-[8px] text-ink/70">{icon}{label}</span>; }
function Filter({ icon, label }: { icon: React.ReactNode; label: string }) { return <button type="button" className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[8px] border border-plum/10 bg-white px-3 text-[10px] font-semibold">{icon}{label}</button>; }
function SelectFilter({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-9 shrink-0 rounded-[8px] border border-plum/10 bg-white px-3 text-[10px] font-semibold">{options.map((option) => <option key={option}>{option}</option>)}</select>; }
function Toggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 px-5 text-[11px] font-bold ${active ? "bg-magenta text-white" : "bg-white text-ink"}`}>{icon}{label}</button>; }
