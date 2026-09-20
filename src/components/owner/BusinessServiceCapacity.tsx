"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { ScopedApiError } from "@/lib/scopedApiCore";
import { dateKeyInTimeZone } from "@/lib/dateTime";
import type { FinancePeriod } from "@/lib/businessFinanceCore";
import type { ServiceCapacity } from "@/lib/businessServiceCapacity";
import { serviceCapacityCopy } from "@/i18n/business-service-capacity-copy";
const button = "inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold gc-disabled-control";
export default function BusinessServiceCapacity({ serviceId, period }: { serviceId: string; period: FinancePeriod }) {
 const { locale } = useI18n(), [open, setOpen] = useState(false);
 return <div data-no-translate>{open ? <CapacityPanel serviceId={serviceId} period={period} close={() => setOpen(false)}/> : <button type="button" className={button} onClick={() => setOpen(true)}>{serviceCapacityCopy(locale, "Check openings for this service")}</button>}</div>;
}
function CapacityPanel({ serviceId, period, close }: { serviceId: string; period: FinancePeriod; close: () => void }) {
 const { locale, formatNumber, formatDate } = useI18n(), copy = (source: string, values: Record<string, string> = {}) => serviceCapacityCopy(locale, source, values);
 const [date, setDate] = useState(() => dateKeyInTimeZone(new Date(), period.timeZone)), [selection, setSelection] = useState<Record<string, string[]>>({});
 const [data, setData] = useState<ServiceCapacity | null>(null), [current, setCurrent] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [reference, setReference] = useState("");
 const epoch = useRef(0), pending = useRef(false);
 async function load() {
  if (pending.current) return; pending.current = true; const token = epoch.current; setBusy(true); setCurrent(false); setFailure(""); setReference("");
  try {
   const params = new URLSearchParams({ from: period.from, to: period.to, style_id: serviceId, stylist_id: "", date, days: "7", selected_options: JSON.stringify(Object.entries(selection).map(([group_id, values]) => ({ group_id, values }))) });
   const response = await (await createAuthenticatedApiClient("salon")).request<ServiceCapacity>(`/api/salon/service-capacity?${params}`);
   if (token === epoch.current) { setData(response); setCurrent(true); }
  } catch (error) { if (token === epoch.current) { setFailure(error instanceof ScopedApiError && error.code === "SERVICE_CAPACITY_REVIEW_CHANGED" ? "Cost evidence changed. Refresh the contribution review first." : "Service openings could not be verified. Refresh the current records and try again."); setReference(error instanceof ScopedApiError ? error.requestId || "" : ""); } }
  finally { pending.current = false; if (token === epoch.current) setBusy(false); }
 }
 useEffect(() => { let mounted = true; void Promise.resolve().then(() => { if (mounted) void load(); }); const generation = epoch; return () => { mounted = false; generation.current++; };
  // The containing contribution workspace remounts for business/role/period changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);
 const day = (value: string) => formatDate(`${value}T12:00:00Z`, { timeZone: "UTC", dateStyle: "medium" });
 return <section aria-label={copy("Service openings")} aria-busy={busy} className="space-y-3 rounded-xl border border-border p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{copy("Service openings")}</h4><button type="button" className={button} onClick={close}>{copy("Close openings")}</button></div>
  <p className="text-xs text-muted">{copy("This future calendar check is separate from the historical contribution period. Positive recorded contribution does not prove demand or net profit.")}</p>
  <form onSubmit={event => { event.preventDefault(); void load(); }} className="space-y-3">
   <label className="block space-y-1 text-sm"><span>{copy("First date")}</span><input className="min-h-11 max-w-full rounded-lg border border-border bg-surface px-3" type="date" required disabled={busy} value={date} onChange={event => { setDate(event.target.value); setCurrent(false); }}/></label>
   {data?.option_groups.map(group => <fieldset key={group.id} disabled={busy} className="space-y-1 rounded-lg border border-border p-2"><legend className="px-1 text-sm font-semibold">{group.label}{group.required && <> · {copy("Required")}</>}</legend>{group.multiple ? group.options.map(option => <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={(selection[group.id] || []).includes(option.value)} onChange={event => { const checked = event.target.checked; setSelection(current => ({ ...current, [group.id]: checked ? [...current[group.id] || [], option.value] : (current[group.id] || []).filter(value => value !== option.value) })); setCurrent(false); }}/>{option.label}</label>) : <select className="min-h-11 w-full rounded-lg border border-border bg-surface px-2 text-sm" aria-label={group.label} required={group.required} value={selection[group.id]?.[0] || ""} onChange={event => { const value = event.target.value; setSelection(current => ({ ...current, [group.id]: value ? [value] : [] })); setCurrent(false); }}><option value="">{copy("Choose an option")}</option>{group.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</fieldset>)}
   <button type="submit" className={button} disabled={busy}>{copy("Check next seven days")}</button>
  </form>
  {busy && <p role="status" className="text-sm">{copy("Checking openings…")}</p>}
  {failure && <p role="alert" className="break-words text-sm text-error">{copy(failure)}{reference && <> {copy("Support reference")}: {reference}</>}</p>}
  {current && data && <>
   {data.reason && <p role="status" className="text-sm">{copy(data.reason === "selection_required" ? "Choose the required service options, then check again." : "Service choices changed. Review the saved service before continuing.")}</p>}
   {data.available && <><p className="text-sm">{copy("{from} to {to} · {zone}", { from: day(data.date), to: day(data.through), zone: data.time_zone })}</p><p className="text-sm">{copy("{duration} minutes plus {buffer} minutes of buffer.", { duration: formatNumber(data.duration_minutes!), buffer: formatNumber(data.buffer_minutes!) })} {data.duration_basis === "maximum_saved_duration" && copy("Uses the longest saved duration for this service range.")}</p>
    <p role="status" className="text-sm font-semibold">{copy("{total} start-time alternatives; showing {shown}.", { total: formatNumber(data.total!), shown: formatNumber(data.shown_count) })}</p>
    <p className="text-xs text-muted">{copy("Start times overlap; this is not a count of extra appointments. No time is reserved. Booking checks customer eligibility and availability again.")}</p>
    {!data.slots.length && <p className="text-sm">{copy("No current bookable starts were found for this selection.")}</p>}
    <ul className="max-h-80 space-y-2 overflow-y-auto">{data.slots.map(slot => <li key={`${slot.date}:${slot.time}:${slot.stylist_id}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 text-sm"><span>{day(slot.date)} · {slot.time} · {slot.professional_name || copy("Any available professional")}</span><Link className={button} href={slot.href}>{copy("Review calendar")}</Link></li>)}</ul>
   </>}
  </>}
 </section>;
}
