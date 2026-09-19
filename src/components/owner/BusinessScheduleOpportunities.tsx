"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import { scheduleCopy } from "@/i18n/business-schedule-copy";
import type { BusinessScheduleOpportunities as Evidence } from "@/lib/businessScheduleOpportunities";
export default function BusinessScheduleOpportunities() {
  const { locale, formatDate, formatNumber } = useI18n();
  const copy = (key: Parameters<typeof scheduleCopy>[1], values: Record<string, string> = {}) => scheduleCopy(locale, key, values);
  const [data, setData] = useState<Evidence | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true);
  const generation = useRef(0), pending = useRef(false);
  async function load() {
    if (pending.current) return; pending.current = true;
    const token = generation.current; setBusy(true); setError(""); setData(null);
    try {
      const result = await (await createAuthenticatedApiClient("salon")).request<Evidence>("/api/salon/schedule-opportunities");
      if (generation.current === token) setData(result);
    } catch (failure) {
      if (generation.current !== token) return;
      const code = (failure as { body?: { code?: string }; code?: string }).body?.code || (failure as { code?: string }).code;
      setError(code === "SCHEDULE_HOURS_UNAVAILABLE" ? copy("hours") : code === "SCHEDULE_CHANGED" ? copy("changed") : code === "SCHEDULE_ACCESS_DENIED" ? copy("denied") : scopedApiErrorMessage(failure, copy("error")));
    } finally { pending.current = false; if (generation.current === token) setBusy(false); }
  }
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void load(); }); const current = generation; return () => { active = false; current.current++; };
    // Authorized workspace bindings remount this component; display locale does not refetch business facts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const date = (value: string) => formatDate(`${value}T12:00:00Z`, { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" });
  const time = (value: string) => formatDate(value, { timeZone: data?.time_zone, hour: "numeric", minute: "2-digit" });
  return <section aria-label={copy("title")} aria-busy={busy} className="space-y-3 rounded-xl border border-border bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">{copy("title")}</h2><button type="button" disabled={busy} onClick={() => void load()} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:bg-subtle disabled:text-muted">{copy("refresh")}</button></div>
    <p className="text-sm text-muted">{copy("explanation")}</p>
    {busy && <p role="status">{copy("loading")}</p>}{error && <p role="alert" className="break-words text-sm text-error">{copy("unavailable")} {error}</p>}
    {data && <><p className="text-sm">{copy("period", { from: date(data.from), to: date(data.to), zone: data.time_zone, time: time(data.generated_at) })}</p>
      {data.scope === "assigned_professional" && <p className="text-sm font-semibold">{copy("own")}</p>}
      <p className="text-sm font-semibold">{copy("totals", { free: formatNumber(data.free_minutes), booked: formatNumber(data.booked_minutes), held: formatNumber(data.held_minutes), capacity: formatNumber(data.capacity_minutes) })}</p>
      <p className="text-sm">{data.booked_percent === null ? copy("noCapacity") : copy("share", { percent: formatNumber(data.booked_percent) })}</p><p className="text-xs text-muted">{copy("denominator")}</p>
      {data.opportunities.length ? <ul className="grid gap-3 lg:grid-cols-2">{data.opportunities.map(row => <li key={`${row.date}:${row.professional_id}`} className="space-y-2 rounded-lg bg-subtle p-3">
        <h3 className="font-semibold">{date(row.date)} · <span data-no-translate>{row.professional_name || copy("business")}</span></h3>
        <p className="text-sm">{copy("detail", { free: formatNumber(row.free_minutes), capacity: formatNumber(row.capacity_minutes), booked: formatNumber(row.booked_minutes), held: formatNumber(row.held_minutes) })}</p>
        <ul className="flex flex-wrap gap-x-3 text-xs text-muted">{row.gaps.map(gap => <li key={gap.start}>{copy("interval", { start: time(gap.start), end: time(gap.end) })}</li>)}</ul>
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" href={row.href}>{copy("review")}</Link>
      </li>)}</ul> : <p>{copy("empty")}</p>}<p className="text-xs text-muted">{copy("limited")}</p>
    </>}
  </section>;
}
