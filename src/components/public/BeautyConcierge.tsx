"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Bot, CalendarDays, Check, Heart, LoaderCircle, MapPin, Scale, Sparkles, Star } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import SafeImage from "@/components/site/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { getSupabaseForScope } from "@/lib/supabase";
import type { ConciergeIntent, ConciergeSalonResult } from "@/lib/beautyConciergeServer";

type ResponseBody = { mode?: "openai" | "deterministic"; intent?: ConciergeIntent; clarification?: string | null; salons?: ConciergeSalonResult[]; error?: string; request_id?: string };

export default function BeautyConcierge() {
  const location = useCustomerLocation();
  const { locale } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<ConciergeSalonResult[]>([]);
  const [intent, setIntent] = useState<ConciergeIntent | null>(null);
  const [mode, setMode] = useState<"openai" | "deterministic" | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);

  async function search(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage(""); setCompare([]);
    try {
      const response = await fetch("/api/concierge/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, language: locale, latitude: location.location?.lat, longitude: location.location?.lng, website: "" }) });
      const body = await response.json() as ResponseBody;
      if (!response.ok) throw new Error(body.error || "Beauty search is temporarily unavailable.");
      setIntent(body.intent || null); setMode(body.mode || null); setResults(Array.isArray(body.salons) ? body.salons : []);
      setMessage(body.clarification || (!body.salons?.length ? "I couldn't find an eligible nearby match for those details. Try a wider distance or another date." : ""));
    } catch (error) { setResults([]); setMessage(error instanceof Error ? error.message : "Beauty search is temporarily unavailable."); }
    finally { setBusy(false); }
  }
  function toggleCompare(id: string) {
    setCompare((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }
  async function saveSalon(id: string) {
    try {
      const client = getSupabaseForScope("customer");
      const { data } = await client.auth.getSession();
      if (!data.session) { window.location.assign(`/login?next=${encodeURIComponent("/salons")}`); return; }
      const already = saved.includes(id);
      const response = await fetch("/api/customer/favorites", { method: already ? "DELETE" : "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ salon_id: id }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to update saved salons.");
      setSaved((current) => already ? current.filter((item) => item !== id) : [...current, id]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update saved salons."); }
  }
  const compared = results.filter((salon) => compare.includes(salon.id));

  return <section className="mb-5 rounded-[18px] border border-plum/10 bg-[linear-gradient(120deg,#35123b,#24102c)] p-4 text-white shadow-[0_16px_40px_rgba(26,18,32,.13)] sm:p-6" aria-labelledby="concierge-title">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-magenta"><Sparkles size={20}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber">AI Beauty Concierge</p><h2 id="concierge-title" className="font-serif text-2xl font-semibold sm:text-3xl">Tell us the look you want</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/70">Describe the style, area, date, budget, or rating. Every result comes from current Girlz Culture salon, price, location, and availability data.</p></div></div>{location.location ? <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-[10px]"><MapPin size={12}/>Searching near {location.location.label}</span> : null}</div>
    <form onSubmit={search} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]"><label><span className="sr-only">Describe your beauty appointment</span><input value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={600} placeholder="Try: Affordable knotless braids near Harlem this Saturday morning" className="min-h-12 w-full rounded-[10px] border border-white/15 bg-white px-4 text-sm text-ink outline-none placeholder:text-ink/45 focus:border-magenta" /></label><button disabled={busy || prompt.trim().length < 3} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-magenta px-6 text-sm font-bold disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={17}/> : <Bot size={17}/>}Find real matches</button></form>
    {message ? <p role="status" className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs leading-5">{message}</p> : null}
    {intent && (intent.style || intent.radius_miles || intent.maximum_price || intent.minimum_rating || intent.date) ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Interpreted search details">{intent.style ? <Chip>{intent.style}</Chip> : null}{intent.radius_miles ? <Chip>Within {intent.radius_miles} mi</Chip> : null}{intent.maximum_price !== null ? <Chip>Up to ${intent.maximum_price}</Chip> : null}{intent.minimum_rating !== null ? <Chip>{intent.minimum_rating}+ stars</Chip> : null}{intent.date ? <Chip>{intent.date} · {intent.time_period}</Chip> : null}{intent.promotion_only ? <Chip>Offers only</Chip> : null}<span className="self-center text-[9px] text-white/45">{mode === "openai" ? "AI interpreted; database verified" : "Standard search fallback"}</span></div> : null}
    {results.length ? <div className="mt-5 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">{results.map((salon) => <ConciergeCard key={salon.id} salon={salon} selected={compare.includes(salon.id)} saved={saved.includes(salon.id)} toggleCompare={() => toggleCompare(salon.id)} toggleSave={() => void saveSalon(salon.id)}/>)}</div> : null}
    {compared.length >= 2 ? <Comparison salons={compared}/> : null}
  </section>;
}

function Chip({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold">{children}</span>; }

function ConciergeCard({ salon, selected, saved, toggleCompare, toggleSave }: { salon: ConciergeSalonResult; selected: boolean; saved: boolean; toggleCompare: () => void; toggleSave: () => void }) {
  const query = new URLSearchParams(); if (salon.services[0]?.id) query.set("style", salon.services[0].id); if (salon.next_slot) { query.set("date", salon.next_slot.date); query.set("time", salon.next_slot.value); }
  const suffix = query.size ? `?${query}` : "";
  return <article className="w-[82vw] max-w-[310px] shrink-0 snap-start overflow-hidden rounded-[14px] bg-white text-ink shadow-lg">
    <div className="relative h-32"><SafeImage src={salon.cover_photo_url} fallbackSrc="/images/salon-warm.jpg" alt={`${salon.name} salon`} className="h-full w-full object-cover"/><button type="button" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? `Remove ${salon.name} from saved salons` : `Save ${salon.name}`} className="absolute right-2 top-2 grid min-h-10 min-w-10 place-items-center rounded-full bg-white/95 text-magenta"><Heart size={17} fill={saved ? "currentColor" : "none"}/></button>{salon.promotion ? <span className="absolute bottom-2 left-2 rounded-full bg-amber px-2 py-1 text-[9px] font-bold text-ink">Offer · {salon.promotion.label || salon.promotion.title}</span> : null}</div>
    <div className="p-3"><h3 className="font-serif text-lg font-semibold text-plum">{salon.name}</h3><p className="mt-1 flex items-center gap-1 text-[10px] text-ink/60"><MapPin size={11}/>{[salon.borough || salon.address_city, salon.address_state].filter(Boolean).join(", ")} · {salon.distance_miles.toFixed(1)} mi</p><p className="mt-2 flex flex-wrap items-center gap-2 text-[10px]"><span className="inline-flex items-center gap-1"><Star size={12} className="fill-amber text-amber"/>{salon.review_count ? `${salon.rating_overall.toFixed(1)} (${salon.review_count})` : "New"}</span>{salon.starting_price !== null ? <b>From ${Number(salon.starting_price).toFixed(0)}</b> : null}{salon.deposit_amount !== null ? <span>${salon.deposit_amount.toFixed(2)} deposit</span> : null}</p>{salon.next_slot ? <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-green-700"><CalendarDays size={12}/>{salon.next_slot.date} at {salon.next_slot.label}</p> : null}<p className="mt-2 truncate text-[10px] text-ink/55">Matches: {salon.services.map((service) => service.name).join(" · ")}</p>
      <button type="button" onClick={toggleCompare} aria-pressed={selected} className={`mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border text-[10px] font-bold ${selected ? "border-plum bg-plum text-white" : "border-plum/15 text-plum"}`}>{selected ? <Check size={13}/> : <Scale size={13}/>} {selected ? "Added to compare" : "Compare"}</button><div className="mt-2 grid grid-cols-2 gap-2"><Link href={`/salon/${salon.slug}${suffix}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-magenta text-[10px] font-bold text-magenta">View</Link><Link href={`/salon/${salon.slug}/book${suffix}`} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-magenta text-[10px] font-bold text-white">Book</Link></div></div>
  </article>;
}

function Comparison({ salons }: { salons: ConciergeSalonResult[] }) {
  return <div className="mt-5 overflow-x-auto rounded-[12px] bg-white p-3 text-ink"><div className="flex items-center gap-2"><Scale size={16} className="text-magenta"/><h3 className="font-serif text-lg text-plum">Compare selected salons</h3></div><table className="mt-2 w-full min-w-[560px] text-left text-[10px]"><thead><tr className="border-b border-plum/10"><th className="p-2">Salon</th><th className="p-2">Distance</th><th className="p-2">Rating</th><th className="p-2">Starting price</th><th className="p-2">Offer</th><th className="p-2">Next opening</th></tr></thead><tbody>{salons.map((salon) => <tr key={salon.id} className="border-b border-plum/5"><th className="p-2 font-bold">{salon.name}</th><td className="p-2">{salon.distance_miles.toFixed(1)} mi</td><td className="p-2">{salon.review_count ? salon.rating_overall.toFixed(1) : "New"}</td><td className="p-2">{salon.starting_price === null ? "See salon" : `$${Number(salon.starting_price).toFixed(0)}`}</td><td className="p-2">{salon.promotion?.label || "—"}</td><td className="p-2">{salon.next_slot ? `${salon.next_slot.date} ${salon.next_slot.label}` : "Check calendar"}</td></tr>)}</tbody></table></div>;
}
