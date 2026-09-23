"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Check, Heart, LoaderCircle, MapPin, Scale, Star } from "lucide-react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import { formatDistanceMiles } from "@/lib/location";
import SafeImage from "@/components/site/SafeImage";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { getSupabaseForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import type { ConciergeAiStatus, ConciergeConfiguration, ConciergeIntent, ConciergeSalonResult } from "@/lib/beautyConciergeServer";
import AssistantDictation from "@/components/owner/AssistantDictation";
import AssistantSpeech from "@/components/owner/AssistantSpeech";
import { gciaText } from "@/i18n/gcia-source-catalog";
import AssistantSupportHandoff from "@/components/public/AssistantSupportHandoff";

type SearchState = "idle" | "results" | "no_results" | "clarification" | "error";
type ResponseBody = { mode?: "openai" | "deterministic"; intent?: ConciergeIntent; clarification?: string | null; salons?: ConciergeSalonResult[]; configuration?: ConciergeConfiguration; error?: string; request_id?: string };
type CustomerTurn = { question: string; answer: string; language: string; pending?: boolean; failed?: boolean };
type CustomerRequest = { index: number; question: string; language: string; help: boolean; intent: ConciergeIntent | null; latitude?: number; longitude?: number };
const SEARCH_PLACEHOLDER = "Describe what you want";

export default function BeautyConcierge() {
  const location = useCustomerLocation();
  const router = useRouter();
  const { locale } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<ConciergeSalonResult[]>([]);
  const [intent, setIntent] = useState<ConciergeIntent | null>(null);
  const [mode, setMode] = useState<"openai" | "deterministic" | null>(null);
  const [configuration, setConfiguration] = useState<ConciergeConfiguration | null>(null);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [compare, setCompare] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [turns, setTurns] = useState<CustomerTurn[]>([]);
  const [helpMode, setHelpMode] = useState(false);
  const [dictationSession, setDictationSession] = useState(0);
  const [sources, setSources] = useState<{ href: string; title: string }[]>([]);
  const pendingRequest = useRef(new Map<number,CustomerRequest>());
  const inFlight = useRef(false);
  const actor = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const lifetime = generation;
    const subscription = getSupabaseForScope("customer").auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (actor.current === nextActor) return;
      actor.current = nextActor; lifetime.current++; pendingRequest.current.clear(); inFlight.current = false;
      setTurns([]); setPrompt(""); setIntent(null); setResults([]); setSources([]);
      setCompare([]); setSaved([]); setMessage(""); setMode(null); setConfiguration(null);
      setSearchState("idle"); setBusy(false); setDictationSession(value => value + 1);
    });
    return () => { lifetime.current++; subscription.data.subscription.unsubscribe(); };
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault(); if (inFlight.current || prompt.trim().length < 3) return;
    if(prompt.length > (helpMode ? 240 : 600)) {setMessage("Keep your question within the displayed character limit."); setSearchState("error"); return;}
    const captured: CustomerRequest = {index: turns.length, question: prompt.trim(), language: locale, help: helpMode, intent, latitude: location.location?.lat, longitude: location.location?.lng};
    setTurns(previous => [...previous, {question: captured.question, answer: "", language: captured.language, pending: true}]);
    setPrompt("");
    await send(captured);
  }
  async function send(captured: CustomerRequest) {
    if (inFlight.current) return;
    const started = generation.current;
    inFlight.current = true; pendingRequest.current.set(captured.index,captured);
    setBusy(true); setMessage(""); setCompare([]); setSearchState("idle");
    const updateTurn = (patch: Partial<CustomerTurn>) => setTurns(previous => previous.map((turn,index) => index === captured.index ? {...turn,...patch} : turn));
    updateTurn({pending:true,failed:false});
    try {
      if (captured.help) {
        const response = await fetch("/api/concierge/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: captured.question, language: captured.language }), signal: AbortSignal.timeout(15000) });
        const body = await readApiResponse(response, "Published help could not be searched.");
        if (started !== generation.current) return;
        if (!response.ok) throw new Error(body.error || "Published help could not be searched.");
        const matches = (Array.isArray(body.matches) ? body.matches : []) as { question: string; answer: string; href: string; title: string; language?: string }[];
        updateTurn({pending:false,language:matches.length ? matches[0].language||"en" : captured.language,answer:matches.length ? matches.slice(0,2).map(match => `${match.question}: ${match.answer}`).join("\n\n") : gciaText("I couldn't find that in the published Help center. Try a more specific question or contact support.",captured.language)});
        setSources(matches.slice(0,2)); pendingRequest.current.delete(captured.index); return;
      }
      const response = await fetch("/api/concierge/search", { method: "POST", credentials: "same-origin", redirect: "manual", headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Requested-With": "girlz-culture-public" }, body: JSON.stringify({ prompt: captured.question, previous_intent: captured.intent, language: captured.language, latitude: captured.latitude, longitude: captured.longitude, website: "" }), signal: AbortSignal.timeout(45000) });
      if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) throw new Error("Beauty search is temporarily unavailable.");
      const body = await readApiResponse(response,"Beauty search is temporarily unavailable.") as ResponseBody;
      if (started !== generation.current) return;
      if (!response.ok) throw new Error(body.error || "Beauty search is temporarily unavailable.");
      const salons = Array.isArray(body.salons) ? body.salons : [];
      setIntent(body.intent || null); setMode(body.mode || null); setConfiguration(body.configuration || null); setResults(salons);
      setMessage(body.clarification || (!salons.length ? "I couldn't find an eligible nearby match for those details. Try a wider distance or another date." : ""));
      setSearchState(body.clarification ? "clarification" : salons.length ? "results" : "no_results");
      updateTurn({pending:false,answer:body.clarification || (salons.length ? gciaText(body.intent?.location ? "I found {count} matching businesses near {location}. You can compare them below, or tell me what you would like to change." : "I found {count} matching businesses. You can compare them below, or tell me what you would like to change.",captured.language,{count:salons.length,location:body.intent?.location || ""}) : gciaText("I couldn't find a match for these details. Would you like to change the date, price or distance?",captured.language))});
      pendingRequest.current.delete(captured.index);
    } catch (error) {
      if (started !== generation.current) return;
      updateTurn({pending:false,failed:true}); setConfiguration(null);
      setMessage(error instanceof Error ? error.message : "Beauty search is temporarily unavailable."); setSearchState("error");
    } finally { if (started === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  function toggleCompare(id: string) {
    setCompare((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }
  async function saveSalon(id: string) {
    const started = generation.current;
    try {
      const client = getSupabaseForScope("customer");
      const { data } = await client.auth.getSession();
      if (started !== generation.current) return;
      if (!data.session) { router.push(`/login?next=${encodeURIComponent("/salons")}`); return; }
      const already = saved.includes(id);
      const response = await fetch("/api/customer/favorites", { method: already ? "DELETE" : "POST", redirect: "manual", headers: { Accept: "application/json", Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ salon_id: id }) });
      const body = await readApiResponse(
        response,
        "Unable to update saved businesses.",
      );
      if (started !== generation.current) return;
      if (!response.ok) throw new Error(body.error || "Unable to update saved businesses.");
      setSaved((current) => already ? current.filter((item) => item !== id) : [...current, id]);
    } catch (error) { if (started === generation.current) setMessage(error instanceof Error ? error.message : "Unable to update saved businesses."); }
  }
  const compared = results.filter((salon) => compare.includes(salon.id));

  return <section className="gc-dashboard mb-5 rounded-2xl border border-border bg-white p-4 text-text-primary shadow-sm sm:p-6" aria-labelledby="concierge-title">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="concierge-title" className="text-2xl font-bold">GC AI Assistant</h2><p className="mt-2 text-sm">Find a business or service, or ask about Girlz Culture.</p></div><button type="button" disabled={busy} onClick={() => { pendingRequest.current.clear(); setIntent(null); setTurns([]); setResults([]); setPrompt(""); setSources([]); setCompare([]); setMessage(""); setMode(null); setConfiguration(null); setSearchState("idle"); setDictationSession(value => value + 1); }} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold">New conversation</button></header>
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Assistant topic">{[[false, "Find a business"], [true, "Girlz Culture help"]].map(([value, label]) => <button key={String(label)} type="button" aria-pressed={helpMode === value} disabled={busy} onClick={() => { setHelpMode(Boolean(value)); setSources([]); setResults([]); setSearchState("idle"); setDictationSession(value => value + 1); }} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${helpMode === value ? "border-teal bg-primary-hover text-white" : "border-border bg-white"}`}>{String(label)}</button>)}</nav>
    {turns.length ? <div aria-label="Assistant conversation" aria-live="polite" className="my-5 max-h-96 space-y-4 overflow-y-auto rounded-xl bg-subtle p-3">{turns.map((turn, index) => <article key={index} className="space-y-3"><div className="flex justify-end"><p data-no-translate className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary-hover px-4 py-3 text-sm text-white">{turn.question}</p></div>{turn.answer ? <><p data-no-translate className="max-w-[95%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border bg-white px-4 py-3 text-sm leading-6">{turn.answer}</p><AssistantSpeech text={turn.answer} sessionKey={dictationSession} language={turn.language}/></> : null}{turn.pending ? <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle aria-hidden="true" size={16} className="animate-spin"/>Searching…</p> : null}{turn.failed ? <button type="button" disabled={busy} onClick={() => {const failed=pendingRequest.current.get(index);if(failed)return send(failed);}} className="min-h-11 rounded-lg border px-4 text-sm">Retry this question</button> : null}</article>)}</div> : null}
    {sources.length ? <div className="my-3 flex flex-wrap gap-3 text-sm">{sources.map((source,index) => <Link key={index} href={source.href} className="font-semibold text-text-link underline">Read {source.title}</Link>)}</div> : null}
    <form onSubmit={search} className="mt-4 rounded-2xl border border-border bg-white p-3">
      <label><span className="sr-only">Describe your beauty appointment</span><textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={helpMode ? 240 : 600} rows={2} placeholder={SEARCH_PLACEHOLDER} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="min-h-16 w-full resize-y border-0 bg-white px-2 py-2 text-base text-text-primary outline-none"/></label>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs">Only current Girlz Culture records and published help.</p><div className="flex items-center gap-2"><AssistantDictation key={dictationSession} disabled={busy} sessionKey={dictationSession} value={prompt} onChange={setPrompt} maxLength={helpMode ? 240 : 600}/><button disabled={busy || prompt.trim().length < 3} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary-hover px-4 text-sm font-bold text-white gc-disabled-control">{busy ? <LoaderCircle className="animate-spin" size={17}/> : null}{helpMode ? "Ask GC Assistant" : "Find real matches"}</button></div></div>
    </form>
    {searchState !== "idle" ? <ConciergeResultHeader state={searchState} configuration={configuration} message={message} count={results.length}/> : null}
    {intent && (intent.style || intent.radius_miles || intent.maximum_price || intent.minimum_rating || intent.date) ? <div role="group" className="mt-3 flex flex-wrap gap-2" aria-label="Interpreted search details">{intent.style ? <Chip>{intent.style}</Chip> : null}{intent.radius_miles ? <Chip>Within {intent.radius_miles} mi</Chip> : null}{intent.maximum_price !== null ? <Chip>Up to ${intent.maximum_price}</Chip> : null}{intent.minimum_rating !== null ? <Chip>{intent.minimum_rating}+ stars</Chip> : null}{intent.date ? <Chip>{intent.date} · {intent.time_period}</Chip> : null}{intent.promotion_only ? <Chip>Offers only</Chip> : null}<span className="self-center text-[11px] gc-text-secondary">{mode === "openai" ? "AI interpreted; database verified" : "Standard search fallback"}</span></div> : null}
    {results.length ? <div className="mt-5 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">{results.map((salon) => <ConciergeCard key={salon.id} salon={salon} selected={compare.includes(salon.id)} saved={saved.includes(salon.id)} toggleCompare={() => toggleCompare(salon.id)} toggleSave={() => void saveSalon(salon.id)}/>)}</div> : null}
    {compared.length >= 2 ? <Comparison salons={compared}/> : null}
    <AssistantSupportHandoff key={dictationSession} turns={turns} failure={searchState === "error" ? message : ""}/>
  </section>;
}

function aiStatusLabel(status: ConciergeAiStatus | undefined) {
  if (status === "configured") return "AI configured";
  if (status === "provider_failure") return "AI provider unavailable · standard search used";
  if (status === "budget_exhausted") return "AI budget reached · standard search used";
  if (status === "disabled") return "AI disabled · standard search used";
  return "AI not configured · standard search used";
}

function ConciergeResultHeader({ state, configuration, message, count }: { state: SearchState; configuration: ConciergeConfiguration | null; message: string; count: number }) {
  const heading = state === "results" ? "Here are the matches I found." : state === "clarification" ? "One detail will help me search." : state === "error" ? "The search could not be completed." : "No database matches yet.";
  return <section aria-live="polite" aria-label="Beauty Concierge results" className="mt-4 rounded-[12px] border border-white/15 bg-white p-4 text-ink shadow-lg">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-serif text-xl font-semibold text-plum">{heading}</h3>{state === "results" ? <p className="mt-1 text-xs text-ink/60">{count} real {count === 1 ? "business match" : "business matches"} from current Girlz Culture data.</p> : message ? <p role={state === "error" ? "alert" : "status"} className="mt-1 text-xs leading-5 text-ink/65">{message}</p> : null}</div>{configuration ? <span className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${configuration.ai_status === "configured" ? "bg-green-100 gc-text-success" : "bg-amber/15 gc-text-warning"}`}>{aiStatusLabel(configuration.ai_status)}</span> : null}</div>
  </section>;
}

function Chip({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold">{children}</span>; }

function ConciergeCard({ salon, selected, saved, toggleCompare, toggleSave }: { salon: ConciergeSalonResult; selected: boolean; saved: boolean; toggleCompare: () => void; toggleSave: () => void }) {
  const query = new URLSearchParams(); if (salon.services[0]?.id) query.set("style", salon.services[0].id); if (salon.next_slot) { query.set("date", salon.next_slot.date); query.set("time", salon.next_slot.value); }
  const suffix = query.size ? `?${query}` : "";
  return <article className="w-[82vw] max-w-[310px] shrink-0 snap-start overflow-hidden rounded-[14px] bg-white text-ink shadow-lg">
    <div className="relative h-32"><SafeImage src={salon.cover_photo_url} fallbackSrc="/images/salon-warm.jpg" alt={salon.name} rendition="thumbnail" className="h-full w-full object-cover"/>{<button type="button" onClick={toggleSave} aria-pressed={saved} aria-label={saved ? `Remove ${salon.name} from saved businesses` : `Save ${salon.name}`} className="absolute right-2 top-2 grid min-h-10 min-w-10 place-items-center rounded-full bg-white/95 text-magenta"><Heart size={17} fill={saved ? "currentColor" : "none"}/></button>}{salon.promotion ? <span data-no-translate className="absolute bottom-2 left-2 rounded-full bg-amber px-2 py-1 text-[9px] font-bold text-ink">Offer · {salon.promotion.label || salon.promotion.title}</span> : null}</div>
    <div className="p-3"><h3 data-no-translate className="font-serif text-lg font-semibold text-plum">{salon.name}</h3><p className="mt-1 flex items-center gap-1 text-[10px] text-ink/60"><MapPin size={11}/>{[salon.borough || salon.address_city, salon.address_state].filter(Boolean).join(", ")} — {formatDistanceMiles(salon.distance_miles)}</p><p className="mt-2 flex flex-wrap items-center gap-2 text-[10px]"><span className="inline-flex items-center gap-1"><Star size={12} className="fill-amber text-amber"/>{salon.review_count ? `${salon.rating_overall.toFixed(1)} (${salon.review_count})` : "New"}</span>{salon.starting_price !== null ? <b>From ${Number(salon.starting_price).toFixed(0)}</b> : null}{salon.deposit_amount !== null ? <span>${salon.deposit_amount.toFixed(2)} deposit</span> : null}</p>{salon.next_slot ? <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold gc-text-success"><CalendarDays size={12}/>{salon.next_slot.date} at {salon.next_slot.label}</p> : null}<p data-no-translate className="mt-2 truncate text-[10px] text-ink/55">Matches: {salon.services.map((service) => service.name).join(" · ")}</p>
      <button type="button" onClick={toggleCompare} aria-pressed={selected} className={`mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border text-[10px] font-bold ${selected ? "border-plum bg-plum text-white" : "border-plum/15 text-plum"}`}>{selected ? <Check size={13}/> : <Scale size={13}/>} {selected ? "Added to compare" : "Compare"}</button><div className="mt-2 grid grid-cols-2 gap-2"><Link href={`/salon/${salon.slug}${suffix}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-magenta text-[10px] font-bold text-magenta">View</Link>{<Link href={`/salon/${salon.slug}/book${suffix}`} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-magenta text-[10px] font-bold text-white">Book</Link>}</div></div>
  </article>;
}

function Comparison({ salons }: { salons: ConciergeSalonResult[] }) {
  return <div className="mt-5 overflow-x-auto rounded-[12px] bg-white p-3 text-ink"><div className="flex items-center gap-2"><Scale size={16} className="text-magenta"/><h3 className="font-serif text-lg text-plum">Compare selected businesses</h3></div><table className="mt-2 w-full min-w-[560px] text-left text-[10px]"><thead><tr className="border-b border-plum/10"><th className="p-2">Business</th><th className="p-2">Distance</th><th className="p-2">Rating</th><th className="p-2">Starting price</th><th className="p-2">Offer</th><th className="p-2">Next opening</th></tr></thead><tbody>{salons.map((salon) => <tr key={salon.id} className="border-b border-plum/5"><th className="p-2 font-bold">{salon.name}</th><td className="p-2">{formatDistanceMiles(salon.distance_miles)}</td><td className="p-2">{salon.review_count ? salon.rating_overall.toFixed(1) : "New"}</td><td className="p-2">{salon.starting_price === null ? "See business" : `$${Number(salon.starting_price).toFixed(0)}`}</td><td className="p-2">{salon.promotion?.label || "—"}</td><td className="p-2">{salon.next_slot ? `${salon.next_slot.date} ${salon.next_slot.label}` : "Check calendar"}</td></tr>)}</tbody></table></div>;
}
