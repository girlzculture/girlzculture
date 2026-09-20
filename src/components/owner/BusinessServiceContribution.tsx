"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { ScopedApiError } from "@/lib/scopedApiCore";
import { moneyCents, type FinancePeriod } from "@/lib/businessFinanceCore";
import { contributionCopy } from "@/i18n/business-service-contribution-copy";
import { dateKeyInTimeZone } from "@/lib/dateTime";
import { updateFinanceLocation } from "@/lib/financeWorkspace";
import BusinessServiceCapacity from "./BusinessServiceCapacity";
// The view consumes the public response shape without importing server evidence
// calculation or its private diagnostic vocabulary into the client graph.
type Allocation = { kind: "expense" | "wage"; id: string; cents: number };
type ContributionRow = {
 service_id: string; name: string; completed_count: number; previous_count: number;
 net_recorded_value_cents: number; commission_cents: number; recorded_cost_cents: number;
 allocated_cost_cents: number | null; contribution_cents: number | null;
 review_status: "payment_unverified" | "booth" | "missing" | "stale" | "owner_reviewed";
 review: { revision: number; fingerprint: string; allocations: Allocation[]; note: string } | null;
 href: string;
};
type Data = {
 period: FinancePeriod; previous_period: FinancePeriod; fingerprint: string;
 rows: ContributionRow[]; recommendations: ContributionRow[];
 cost_sources: { kind: "expense" | "wage"; id: string; amount_cents: number; allocated_cents: number; label: string; at: string }[];
 excluded_unattributed_service_records: number; can_review: boolean; verified?: boolean;
};
const button = "inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold gc-disabled-control";
const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const endpoint = "/api/salon/service-contribution";
export default function BusinessServiceContribution({ businessId, period, canCheckCapacity = false }: { businessId: string; period: FinancePeriod; canCheckCapacity?: boolean }) {
 const { locale } = useI18n();
 const today = dateKeyInTimeZone(new Date(), period.timeZone);
 if (period.to >= today) {
  const shifted = (days: number) => { const date = new Date(today + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  return <section aria-label={contributionCopy(locale, "Service contribution")} data-no-translate className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5"><h2 className="font-serif text-xl font-bold">{contributionCopy(locale, "Service contribution")}</h2><p className="text-sm">{contributionCopy(locale, "Use a completed reporting period ending before today.")}</p><button className={button} onClick={() => updateFinanceLocation({ finance_from: shifted(-28), finance_to: shifted(-1) })}>{contributionCopy(locale, "Use previous 28 completed days")}</button></section>;
 }
 return <ContributionPanel key={`${businessId}:${period.from}:${period.to}:${period.timeZone}:${canCheckCapacity}`} period={period} canCheckCapacity={canCheckCapacity}/>;
}
function ContributionPanel({ period, canCheckCapacity }: { period: FinancePeriod; canCheckCapacity: boolean }) {
 const { locale, formatCurrency, formatDate, formatNumber } = useI18n();
 const copy = (source: string, values: Record<string, string> = {}) => contributionCopy(locale, source, values);
 const money = (cents: number) => formatCurrency(cents / 100);
 const day = (value: string) => formatDate(value + "T12:00:00Z", { timeZone: "UTC", dateStyle: "medium" });
 const [data, setData] = useState<Data | null>(null), [busy, setBusy] = useState(true), [failure, setFailure] = useState(""), [reference, setReference] = useState("");
 const [selected, setSelected] = useState(""), [amounts, setAmounts] = useState<Record<string, string>>({}), [note, setNote] = useState("");
 const [complete, setComplete] = useState(false), [zero, setZero] = useState(false), [saved, setSaved] = useState(false);
 const generation = useRef(0), pending = useRef(false), request = useRef<string | null>(null);
 const active = data?.rows.find(row => row.service_id === selected);
 const missingAmounts = data ? Object.entries(amounts).filter(([key, value]) => value.trim() && !data.cost_sources.some(source => `${source.kind}:${source.id}` === key)) : [];
 const reset = () => { request.current = null; setSaved(false); };
 function errorMessage(error: unknown) {
  setFailure(error instanceof ScopedApiError && error.code === "CONTRIBUTION_INVALID_PERIOD" ? "Use a completed reporting period ending before today." : "Service cost evidence could not be verified. Refresh saved records before continuing.");
  setReference(error instanceof ScopedApiError ? error.requestId || "" : "");
 }
 async function load() {
  if (pending.current) return; pending.current = true; setBusy(true); setFailure(""); setReference(""); setData(null); setSaved(false); const token = generation.current;
  try {
   const result = await (await createAuthenticatedApiClient("salon")).request<Data>(`${endpoint}?${new URLSearchParams({ from: period.from, to: period.to })}`);
   if (generation.current === token) { setData(result); setComplete(false); setZero(false); reset(); }
  } catch (error) { if (generation.current === token) { setData(null); errorMessage(error); } }
  finally { pending.current = false; if (generation.current === token) setBusy(false); }
 }
 useEffect(() => { let mounted = true; void Promise.resolve().then(() => { if (mounted) void load(); }); const epoch = generation; return () => { mounted = false; epoch.current++; };
  // The outer component binds each period and business to a fresh workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);
 function choose(id: string) {
  const row = data?.rows.find(item => item.service_id === id); setSelected(id); setAmounts(Object.fromEntries((row?.review?.allocations || []).map(a => [`${a.kind}:${a.id}`, String(a.cents / 100)])));
  setNote(row?.review?.note || ""); setComplete(false); setZero(false); reset();
 }
 async function save(event: React.FormEvent) {
  event.preventDefault(); if (!data || !active || !data.can_review || !complete || missingAmounts.length || pending.current) return;
  pending.current = true; setBusy(true); setFailure(""); setReference(""); setSaved(false); const token = generation.current;
  try {
   const allocations = data.cost_sources.flatMap(source => { const text = amounts[`${source.kind}:${source.id}`]?.trim(); if (!text) return []; const cents = moneyCents(text); return cents ? [{ kind: source.kind, id: source.id, cents }] : []; });
   request.current ||= crypto.randomUUID();
   const result = await (await createAuthenticatedApiClient("salon")).request<Data>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: request.current, payload: { from: period.from, to: period.to, service_id: active.service_id, revision: active.review?.revision || 0, fingerprint: data.fingerprint, allocations, note, complete: true, zero_confirmed: zero } }) });
   if (generation.current !== token) return;
   if (result.verified !== true) throw Error("CONTRIBUTION_READBACK_FAILED");
   setData(result); setSelected(""); setSaved(true); request.current = null;
  } catch (error) { if (generation.current === token) errorMessage(error); }
  finally { pending.current = false; if (generation.current === token) setBusy(false); }
 }
 const financeHref = (tab: string) => `/salon/dashboard/earnings?${new URLSearchParams({ finance: tab, finance_from: period.from, finance_to: period.to })}`;
 return <section aria-label={copy("Service contribution")} aria-busy={busy} data-no-translate className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">{copy("Service contribution")}</h2><button className={button} disabled={busy} onClick={() => void load()}>{copy("Refresh evidence")}</button></div>
  <p className="text-sm text-muted">{copy("Contribution uses owner-reviewed costs; it is not verified net profit or cash received.")}</p>
  {busy && <p role="status">{copy("Checking recorded costs…")}</p>}{failure && <p role="alert" className="break-words text-sm text-error">{copy(failure)}{reference && <> {copy("Support reference")}: {reference}</>}</p>}{saved && <p role="status">{copy("Saved allocation verified against current records.")}</p>}
  {data && <>
   <p className="text-xs text-muted">{copy("Current period: {from} to {to}. Comparison: {previousFrom} to {previousTo}.", { from: day(data.period.from), to: day(data.period.to), previousFrom: day(data.previous_period.from), previousTo: day(data.previous_period.to) })}</p>
   {!data.rows.length && <p>{copy("No completed service appointments in either period.")}</p>}
   <ul className="space-y-3">{data.rows.map(row => <li key={row.service_id} className="space-y-3 rounded-lg border border-border p-3">
    <h3 className="font-semibold">{row.name}</h3>
    <dl className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><dt>{copy("Owner-reviewed contribution")}</dt><dd className="text-lg font-semibold">{row.contribution_cents === null ? copy("Cost review required") : money(row.contribution_cents)}</dd></dl>
    <p className="text-sm">{copy("Completed appointments: {current}; previous period: {previous}.", { current: formatNumber(row.completed_count), previous: formatNumber(row.previous_count) })}</p>
    <div className="flex flex-wrap gap-2"><Link className={button} href={row.href}>{copy("Review service")}</Link><Link className={button} href="/salon/dashboard/availability">{copy("Review calendar")}</Link>{data.can_review && row.completed_count > 0 && !["booth", "payment_unverified"].includes(row.review_status) && <button disabled={busy} className={button} onClick={() => choose(row.service_id)}>{copy("Review costs")}</button>}</div>
    {row.review_status !== "owner_reviewed" && <p className="text-sm text-muted">{copy(row.review_status === "stale" ? "Recorded evidence changed. Review costs again." : row.review_status === "payment_unverified" ? "Payment verification is incomplete; no contribution recommendation is available." : row.review_status === "booth" ? "Booth-rental service turnover is excluded from business contribution advice." : "Cost review required")}</p>}
    {data.recommendations.some(item => item.service_id === row.service_id) && <p className="text-sm font-semibold">{copy("Positive contribution, fewer appointments. Review your calendar before promoting.")}</p>}
    {canCheckCapacity && data.recommendations.some(item => item.service_id === row.service_id) && <BusinessServiceCapacity serviceId={row.service_id} period={period}/>}
    <details className="border-t border-border">
     <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-primary">{copy("View cost breakdown")}</summary>
     <div className="space-y-3 pb-1"><dl className="space-y-1 text-sm">{[["Recorded value after refunds", row.net_recorded_value_cents], ["Saved commission", row.commission_cents], ["Recorded direct costs", row.recorded_cost_cents], ["Allocated expenses and wages", row.allocated_cost_cents]].map(([label, value]) => <div key={String(label)} className="flex flex-wrap justify-between gap-2"><dt>{copy(String(label))}</dt><dd className="font-semibold">{value === null ? copy("Cost review required") : money(Number(value))}</dd></div>)}</dl>
      {data.recommendations.some(item => item.service_id === row.service_id) && <p className="text-sm">{copy("Positive recorded contribution with fewer appointments. Review this service and your current calendar before planning promotion.")}</p>}
     </div>
    </details>
   </li>)}</ul>
   {active && data.can_review && <form onSubmit={event => void save(event)} aria-label={copy("Review costs")} className="space-y-4 rounded-xl border border-border p-4">
    <h3 className="font-semibold">{copy("Review costs")} · {active.name}</h3><p className="text-sm">{copy("Allocate existing recorded expenses and wages. This records an analysis, not a new payment or expense.")}</p>
    <div className="flex flex-wrap gap-2"><Link className={button} href={financeHref("expenses")}>{copy("Record missing expenses")}</Link><Link className={button} href={financeHref("team")}>{copy("Review wage obligations")}</Link></div>
    {!data.cost_sources.length && <p className="text-sm">{copy("No eligible expense or wage records in this period. Record missing costs in Finances first.")}</p>}
    {missingAmounts.length > 0 && <div className="space-y-2 rounded-lg border border-border p-3"><p className="text-sm">{copy("A draft allocation refers to a cost record that is no longer available. Remove it and review the current records before saving.")}</p>{missingAmounts.map(([key, value]) => <div key={key} className="flex flex-wrap items-center gap-2"><span className="text-sm">{copy("Unavailable cost allocation: {amount}", { amount: value })}</span><button type="button" disabled={busy} className={button} onClick={() => { setAmounts(current => { const next = { ...current }; delete next[key]; return next; }); setComplete(false); setZero(false); reset(); }}>{copy("Remove unavailable allocation")}</button></div>)}</div>}
    <div className="max-h-80 space-y-3 overflow-y-auto">{data.cost_sources.map(source => { const key = `${source.kind}:${source.id}`, prior = active.review?.fingerprint === data.fingerprint ? active.review.allocations.find(a => a.kind === source.kind && a.id === source.id)?.cents || 0 : 0; return <label key={key} className="block space-y-1 rounded-lg border border-border p-3 text-sm"><span className="font-semibold">{source.kind === "wage" ? copy("Recorded wage obligation") : source.label} · {formatDate(source.at, { timeZone: period.timeZone, dateStyle: "medium" })}</span><span className="block">{copy("Source amount: {amount}; available for this review: {available}.", { amount: money(source.amount_cents), available: money(source.amount_cents - source.allocated_cents + prior) })}</span><span className="block">{copy("Allocated amount")}</span><input disabled={busy} className={input} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={amounts[key] || ""} onChange={event => { const value = event.target.value; setAmounts(current => ({ ...current, [key]: value })); reset(); }}/></label>; })}</div>
    <label className="block space-y-1 text-sm"><span>{copy("Allocation explanation")}</span><textarea className={input} disabled={busy} required maxLength={1000} value={note} onChange={event => { setNote(event.target.value); reset(); }}/></label>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" disabled={busy} checked={complete} onChange={event => { setComplete(event.target.checked); reset(); }}/>{copy("I reviewed all applicable materials, labor and allocated overhead for these completed appointments, without counting a cost twice.")}</label>
    <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" disabled={busy} checked={zero} onChange={event => { setZero(event.target.checked); reset(); }}/>{copy("I explicitly record zero additional allocated costs for this service period.")}</label>
    <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !complete || missingAmounts.length > 0}>{copy("Save reviewed allocation")}</button><button className={button} type="button" disabled={busy} onClick={() => setSelected("")}>{copy("Close cost review")}</button></div>
   </form>}
   <details className="rounded-lg border border-border px-3">
    <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-primary">{copy("How this is calculated")}</summary>
    <div className="space-y-3 pb-3 text-sm text-muted">
     <p>{copy("Business time zone: {zone}.", { zone: data.period.timeZone })}</p>
     <p>{copy("Completed appointments with a saved service identity only. Fewer appointments do not prove spare capacity or lower demand.")}</p>
     <p>{copy("Recorded contribution is not net profit or cash received. Cost completeness is declared by the owner, not verified by the platform.")}</p>
     {data.excluded_unattributed_service_records > 0 && <p>{copy("Excluded service records without a stable service identity: {count}.", { count: formatNumber(data.excluded_unattributed_service_records) })}</p>}
    </div>
   </details>
  </>}
 </section>;
}
