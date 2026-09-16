"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionForScope } from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import { US_STATES } from "@/lib/usStates";
import { DIRECTORY_STATE_SHORTCUTS } from "@/lib/businessDirectory";
import { useAdminQueryParam } from "@/components/admin/useAdminListContext";

export type MarketWorkspaceArea = { id: string; name: string; state_code: string; market_type: string; parent_market_id?: string; is_active: boolean; center_latitude: number; center_longitude: number };
type Market = MarketWorkspaceArea;
type Card = { id?: unknown; title?: unknown; market_id?: unknown; target_label?: unknown; radius_miles?: unknown; status?: unknown; starts_at?: unknown; ends_at?: unknown; association_type?: unknown; source_kind?: unknown };
type Page = { slug?: unknown; sections?: unknown };

export default function AdminMarketWorkspaces({ scope, pages = [], onSelectionChange }: { scope: "content" | "marketing"; pages?: Page[]; onSelectionChange?: (area: Market | null) => void }) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [state, setState] = useAdminQueryParam("state", "");
  const [market, setMarket] = useAdminQueryParam("market", "");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await getSessionForScope("admin");
      if (!session) throw new Error("Admin sign-in required.");
      const response = await fetch(`/api/admin/market-workspaces?scope=${scope}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const body = await readApiResponse(response, "Location workspaces could not be loaded.");
      if (!response.ok) throw new Error(body.error || "Location workspaces could not be loaded.");
      if (active) { setMarkets(Array.isArray(body.markets) ? body.markets : []); setTruncated(body.truncated === true); }
    })().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Location workspaces could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope]);
  const visibleMarkets = markets.filter(item => (!state || item.state_code === state) && (!query || item.name.toLowerCase().includes(query.toLowerCase())));
  const selected = markets.find(item => item.id === market);
  useEffect(() => { onSelectionChange?.(selected || null); }, [selected, onSelectionChange]);
  const cards = pages.filter(page => page.slug === "home").flatMap(page => (Array.isArray(page.sections) ? page.sections : []).flatMap((section: { type?: string; cards?: Card[] }) => (section.cards || []).map(card => ({ ...card, section: section.type || "" }))));
  const visibleCards = cards.filter(card => !market || String(card.market_id || "") === market || (!card.market_id && !["salon", "campaign"].includes(String(card.association_type || ""))));
  const params = new URLSearchParams({ ...(state ? { state } : {}), ...(market ? { market } : {}) });
  return <section className="gc-panel space-y-5" aria-label="Location workspaces">
    <header><h2 className="text-xl">State, city &amp; neighborhood workspaces</h2><p className="mt-2 max-w-3xl text-sm leading-6">The page structure is shared. Businesses and eligible promotions change with the customer’s location and each placement’s radius. Selecting a workspace here does not publish content or launch a market.</p></header>
    <div className="flex flex-wrap gap-2" aria-label="State shortcuts">{DIRECTORY_STATE_SHORTCUTS.map(code => <button type="button" key={code} aria-pressed={state === code} onClick={() => { setState(code); setMarket(""); }} className={`min-h-10 rounded-lg border px-3 text-sm font-bold ${state === code ? "bg-magenta text-white" : "bg-white text-ink"}`}>{code}</button>)}</div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-bold">State<select value={state} onChange={event => { setState(event.target.value); setMarket(""); }} className="mt-1 min-h-11 w-full border bg-white px-3"><option value="">All states</option>{US_STATES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label><label className="text-sm font-bold">Find city / neighborhood<input value={query} onChange={event => setQuery(event.target.value)} placeholder="e.g. Harlem or Dallas" className="mt-1 min-h-11 w-full border px-3"/></label><label className="text-sm font-bold">Audience market<select value={market} onChange={event => setMarket(event.target.value)} className="mt-1 min-h-11 w-full border bg-white px-3"><option value="">All matching markets</option>{visibleMarkets.map(item => <option value={item.id} key={item.id}>{item.name}, {item.state_code}</option>)}</select></label></div>
    {error ? <p role="alert" className="gc-text-danger">{error}</p> : loading ? <p role="status">Loading configured markets…</p> : <div className="gc-table-scroll" tabIndex={0} role="region" aria-label="Configured markets"><table><thead><tr>{["Market", "State", "Area type", "Parent area", "Configuration", "Workspace"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visibleMarkets.filter(item => !market || item.id === market).map(item => <tr key={item.id}><td><b>{item.name}</b></td><td>{item.state_code}</td><td>{item.market_type.replaceAll("_", " ")}</td><td>{markets.find(parent => parent.id === item.parent_market_id)?.name || "—"}</td><td>{item.is_active ? "Active search area" : "Inactive search area"}</td><td><button type="button" onClick={() => { setState(item.state_code); setMarket(item.id); }} className="min-h-10 font-bold text-magenta">Open this area →</button></td></tr>)}{!visibleMarkets.length ? <tr><td colSpan={6}>No configured areas match. This state is not being presented as a launched market.</td></tr> : null}</tbody></table></div>}
    {truncated ? <p className="text-sm gc-text-warning">Only the first 1,000 configured areas are loaded.</p> : null}
    {selected ? <div className="rounded-xl border border-teal/30 bg-white p-4"><h3 className="text-lg">{selected.name}, {selected.state_code}</h3><p className="mt-1 text-sm">Each campaign’s radius is controlled in its editor. A city filter does not override the authorized audience radius or business eligibility.</p><div className="mt-3 flex flex-wrap gap-4">{scope === "content" ? <Link href={`/admin/content/page-home--hero-promotion-carousel?${params}`} className="min-h-10 font-bold text-magenta">Edit area promotion cards →</Link> : <Link href={`/admin/marketing/featured?${params}`} className="min-h-10 font-bold text-magenta">Open featured business campaigns →</Link>}<Link href="/site-access" className="min-h-10 font-bold text-magenta">Open marketplace and select this area →</Link></div></div> : null}
    {scope === "content" ? <div><h3 className="mb-2 text-lg">Saved homepage promotion inventory</h3><p className="mb-3 text-sm">Draft configuration, not proof of public visibility. Global cards are included. Business-linked cards also follow the linked business’s location; validate them in the editor.</p><div className="gc-table-scroll" tabIndex={0} role="region" aria-label="Homepage promotion inventory"><table><thead><tr>{["Card", "Audience", "Radius", "Draft status", "Schedule", "Edit"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visibleCards.map((card, index) => <tr key={String(card.id || index)}><td>{String(card.title || "Untitled card")}</td><td>{String(card.target_label || markets.find(item => item.id === card.market_id)?.name || (["salon", "campaign"].includes(String(card.association_type)) ? "Linked business / campaign" : "All locations"))}</td><td>{card.market_id || card.association_type ? `${Number(card.radius_miles || 25)} miles` : "Global"}</td><td>{String(card.status || "Active")} · saved draft</td><td>{String(card.starts_at || "No start date")} → {String(card.ends_at || "No end date")}</td><td><Link href={`/admin/content/page-home--${card.section === "promo_rail" ? "hero-promotion-carousel" : "additional-content-sections"}?${params}`} className="font-bold text-magenta">Open editor →</Link></td></tr>)}{!visibleCards.length ? <tr><td colSpan={6}>No saved homepage cards match this area. No placements have been invented.</td></tr> : null}</tbody></table></div></div> : null}
  </section>;
}
