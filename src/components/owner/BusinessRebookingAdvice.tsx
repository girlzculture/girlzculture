"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { ScopedApiError } from "@/lib/scopedApiCore";
import { rebookingCopy } from "@/i18n/business-rebooking-copy";
// Keep this view's response contract independent of the server calculation.
type Advice = {
 available: boolean; as_of: string; from: string; through: string; time_zone: string;
 scope: "business" | "assigned_professional"; completed_visit_count: number | null;
 absent_count: number | null; is_excerpt: boolean; unlinked_guest_visits: number | null;
 candidates: { booking_id: string; client_name: string | null; completed_visits: number; last_visit: string; days_since_visit: number; href: string }[];
};
const button = "inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary gc-disabled-control";
export default function BusinessRebookingAdvice({ businessId, accessKey, canReviewUpdates }: { businessId: string; accessKey: string; canReviewUpdates: boolean }) {
 return <AdvicePanel key={businessId + ":" + accessKey} canReviewUpdates={canReviewUpdates}/>;
}
function AdvicePanel({ canReviewUpdates }: { canReviewUpdates: boolean }) {
 const { locale, formatNumber } = useI18n(); const copy = (key: Parameters<typeof rebookingCopy>[1], values?: Record<string, string>) => rebookingCopy(locale, key, values);
 const [data, setData] = useState<Advice | null>(null), [busy, setBusy] = useState(true), [failure, setFailure] = useState<{ denied: boolean; reference: string | null } | null>(null), [refresh, setRefresh] = useState(0);
 useEffect(() => {
  let active = true;
  void Promise.resolve().then(async () => {
   if (!active) return; setBusy(true); setFailure(null); setData(null);
   try { const api = await createAuthenticatedApiClient("salon"); if (!active) return; const result = await api.request<Advice>("/api/salon/rebooking-advice"); if (active) setData(result); }
   catch (error) { if (active) setFailure({ denied: error instanceof ScopedApiError && [401, 403].includes(error.status), reference: error instanceof ScopedApiError ? error.requestId : null }); }
   finally { if (active) setBusy(false); }
  });
  return () => { active = false; };
 }, [refresh]);
 const day = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
 return <section id="returning-clients" aria-labelledby="returning-clients-title" aria-busy={busy} className="mt-5 scroll-mt-24 space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5" data-no-translate>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="returning-clients-title" className="font-serif text-xl font-bold">{copy("title")}</h2><p className="mt-1 max-w-2xl text-sm text-muted">{copy("intro")}</p></div><button type="button" className={button} disabled={busy} onClick={() => setRefresh(value => value + 1)}>{copy("refresh")}</button></div>
  {busy && <p role="status" className="text-sm">{copy("loading")}</p>}
  {failure && <p role="alert" className="break-words text-sm text-error">{copy(failure.denied ? "denied" : "error")}{failure.reference ? <span className="mt-1 block">{copy("support")}: {failure.reference}</span> : null}</p>}
  {data && <>
   <p className="text-xs text-muted">{copy("period", { from: day(data.from), to: day(data.through), zone: data.time_zone, time: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: data.time_zone }).format(new Date(data.as_of)) })}</p>
   <p className="text-sm">{copy("definition")}</p><p className="text-xs text-muted">{copy("dateBasis")}</p>{data.scope === "assigned_professional" && <p className="text-sm font-medium">{copy("scope")}</p>}
   {!data.available ? <p role="status" className="rounded-lg bg-subtle p-3 text-sm">{copy("unavailable")}</p> : <>
    <p className="text-sm font-semibold">{data.completed_visit_count === 0 ? copy("noHistory") : data.absent_count ? copy("count", { count: formatNumber(data.absent_count) }) : copy("empty")}</p>
    {data.candidates.length > 0 && <ul className="grid gap-3 md:grid-cols-2">{data.candidates.map(client => <li key={client.booking_id} className="min-w-0 rounded-lg border border-border p-3 text-sm"><p className="break-words font-semibold">{client.client_name || copy("unnamed")}</p><p className="mt-1">{copy("evidence", { visits: formatNumber(client.completed_visits), date: day(client.last_visit), days: formatNumber(client.days_since_visit) })}</p><Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline" href={client.href}>{copy("review")}</Link></li>)}</ul>}
    {data.is_excerpt && <p className="text-xs text-muted">{copy("excerpt", { shown: formatNumber(data.candidates.length), total: formatNumber(data.absent_count || 0) })}</p>}
    {data.unlinked_guest_visits ? <p className="text-xs text-muted">{copy("unlinked", { count: formatNumber(data.unlinked_guest_visits) })}</p> : null}
   </>}
   <p className="text-xs text-muted">{copy("identity")}</p>
   {data.available && data.absent_count && canReviewUpdates ? <Link className={button} href="/salon/dashboard/messages/campaigns">{copy("updates")}</Link> : null}
   <p className="text-xs text-muted">{copy("consent")}</p>
  </>}
 </section>;
}
