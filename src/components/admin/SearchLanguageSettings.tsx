"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Search } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";

type Rule = {
  id?: string;
  target_type: "service" | "category";
  target_id: string;
  canonical_term: string;
  aliases: string[];
  keywords: string[];
  common_phrases: string[];
  misspellings: string[];
  ranking_boost: number;
  is_active: boolean;
};
type Target = { id: string; name: string; is_active: boolean };
type Settings = { stop_words: string[]; fuzzy_distance: number; zero_result_logging_enabled: boolean };

const splitTerms = (value: string) => [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];

export default function SearchLanguageSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [targets, setTargets] = useState<{services: Target[]; categories: Target[]}>({ services: [], categories: [] });
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function api(method: "GET" | "PATCH", body?: object) {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Your admin session has expired.");
    const response = await fetch("/api/admin/engine/search", { method, headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load search controls.");
    return result;
  }
  async function load() {
    const result = await api("GET");
    setSettings(result.settings);
    setRules(Array.isArray(result.rules) ? result.rules : []);
    setTargets({ services: Array.isArray(result.targets?.services) ? result.targets.services : [], categories: Array.isArray(result.targets?.categories) ? result.targets.categories : [] });
  }
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load search controls.")), 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allTargets = useMemo(() => [
    ...targets.services.map((target) => ({ ...target, target_type: "service" as const })),
    ...targets.categories.map((target) => ({ ...target, target_type: "category" as const })),
  ], [targets]);
  const visibleTargets = allTargets.filter((target) => !query || target.name.toLowerCase().includes(query.toLowerCase()));
  const [selectedType, selectedId] = selectedKey.split(":") as ["service" | "category", string];
  const selectedTarget = allTargets.find((target) => target.target_type === selectedType && target.id === selectedId);
  const existing = rules.find((rule) => rule.target_type === selectedType && rule.target_id === selectedId);
  const selectedRule: Rule | null = selectedTarget ? existing || { target_type: selectedType, target_id: selectedId, canonical_term: selectedTarget.name, aliases: [], keywords: [], common_phrases: [], misspellings: [], ranking_boost: 1, is_active: true } : null;

  function updateRule(changes: Partial<Rule>) {
    if (!selectedRule) return;
    const next = { ...selectedRule, ...changes };
    setRules((current) => [...current.filter((rule) => !(rule.target_type === next.target_type && rule.target_id === next.target_id)), next]);
  }
  async function saveSettings() {
    if (!settings) return;
    setSaving(true); setMessage("");
    try { const result = await api("PATCH", { settings }); setSettings(result.settings); setMessage("Search defaults saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save search defaults."); }
    finally { setSaving(false); }
  }
  async function saveRule() {
    if (!selectedRule) return;
    setSaving(true); setMessage("");
    try {
      const result = await api("PATCH", { rule: selectedRule });
      setRules((current) => [...current.filter((rule) => !(rule.target_type === result.rule.target_type && rule.target_id === result.rule.target_id)), result.rule]);
      setMessage(`Search language saved for ${selectedTarget?.name}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save search language."); }
    finally { setSaving(false); }
  }

  return <section className="rounded-[14px] border border-plum/10 bg-white/75 p-5 shadow-[0_8px_26px_rgba(26,18,32,.03)]">
    <div><h2 className="font-serif text-xl font-semibold text-plum">Search, keywords & synonyms</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">Teach deterministic search how customers describe real services. A rule improves matching only when an active salon actually offers its target.</p></div>
    {!settings ? <div className="mt-5 flex items-center gap-2 text-xs text-ink/60"><RefreshCw size={15} className="animate-spin"/>Loading search controls...</div> : <>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_120px_auto]">
        <label className="text-xs font-bold">Stop words<input value={settings.stop_words.join(", ")} onChange={(event) => setSettings({ ...settings, stop_words: splitTerms(event.target.value) })} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"/><span className="mt-1 block text-[10px] font-normal text-ink/50">Common words ignored during token matching. Separate with commas.</span></label>
        <label className="text-xs font-bold">Fuzzy tolerance<select value={settings.fuzzy_distance} onChange={(event) => setSettings({ ...settings, fuzzy_distance: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"><option value="0">Exact</option><option value="1">Low</option><option value="2">Standard</option><option value="3">Broad</option></select></label>
        <label className="flex items-center gap-2 self-center text-xs font-bold"><input type="checkbox" checked={settings.zero_result_logging_enabled} onChange={(event) => setSettings({ ...settings, zero_result_logging_enabled: event.target.checked })} className="accent-magenta"/>Privacy-safe zero-result counts</label>
      </div>
      <button type="button" disabled={saving} onClick={() => void saveSettings()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta disabled:opacity-50"><Save size={14}/>Save search defaults</button>
      <div className="mt-6 grid gap-4 xl:grid-cols-[280px_1fr]">
        <div><label className="flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 bg-white px-3"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a service or category" className="min-w-0 flex-1 bg-transparent text-xs outline-none"/></label><div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-plum/10 bg-white p-1">{visibleTargets.map((target) => { const key = `${target.target_type}:${target.id}`; return <button type="button" key={key} onClick={() => setSelectedKey(key)} className={`block min-h-10 w-full rounded-lg px-3 text-left text-xs ${selectedKey === key ? "bg-blush font-bold text-plum" : "hover:bg-cream"}`}>{target.name}<span className="ml-2 text-[9px] uppercase text-ink/40">{target.target_type}</span></button>; })}</div></div>
        {selectedRule ? <div className="rounded-xl border border-plum/10 bg-cream/35 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-serif text-lg text-plum">{selectedTarget?.name}</h3><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={selectedRule.is_active} onChange={(event) => updateRule({ is_active: event.target.checked })} className="accent-magenta"/>Rule active</label></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{([['aliases','Aliases'],['keywords','Keywords'],['common_phrases','Common phrases'],['misspellings','Misspellings']] as const).map(([field,label]) => <label key={field} className="text-xs font-bold">{label}<textarea value={selectedRule[field].join(", ")} onChange={(event) => updateRule({ [field]: splitTerms(event.target.value) })} rows={3} className="mt-1 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal"/><span className="mt-1 block text-[10px] font-normal text-ink/45">Separate entries with commas.</span></label>)}</div><label className="mt-3 block max-w-xs text-xs font-bold">Ranking boost<input type="number" min="0" max="100" step="0.25" value={selectedRule.ranking_boost} onChange={(event) => updateRule({ ranking_boost: Number(event.target.value) })} className="mt-1 min-h-10 w-full rounded-lg border border-plum/15 bg-white px-3 font-normal"/></label><button type="button" disabled={saving} onClick={() => void saveRule()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-50"><Save size={15}/>{saving ? "Saving..." : "Save search language"}</button></div> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-plum/20 bg-cream/40 p-8 text-center text-sm text-ink/55">Choose a real service or category to manage the phrases that find it.</div>}
      </div>
    </>}
    {message ? <p role="status" className="mt-4 rounded-lg bg-blush/45 p-3 text-xs text-plum">{message}</p> : null}
  </section>;
}
