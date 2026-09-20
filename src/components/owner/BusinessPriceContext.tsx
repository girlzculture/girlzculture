"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import snapshot from "@/data/business-price-context.v1.json";
import { businessPriceContext } from "@/lib/businessPriceContext";
import { businessPriceContextCopy } from "@/i18n/business-price-context-copy";

/** No business input, network request, pricing control or automatic recommendation. */
export default function BusinessPriceContext() {
 const { locale, formatNumber, formatDate } = useI18n();
 const copy = (source: Parameters<typeof businessPriceContextCopy>[1], values: Record<string, string> = {}) => businessPriceContextCopy(locale, source, values);
 const [clock, setClock] = useState(() => Date.now());
 const data = businessPriceContext(snapshot, clock);
 useEffect(() => {
  if (data.status !== "available" || !data.valid_until) return;
  const wait = Math.max(0, Date.parse(data.valid_until) - Date.now());
  const timer = setTimeout(() => setClock(Date.now()), Math.min(wait + 1, 2_147_483_647));
  return () => clearTimeout(timer);
 }, [data.status, data.valid_until, clock]);
 const month = (value: string) => formatDate(`${value}-01T12:00:00Z`, { year: "numeric", month: "long", timeZone: "UTC" });
 return <details data-no-translate className="mt-4 min-w-0 rounded-lg border border-border p-3">
  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{copy("U.S. personal-care price context")}</summary>
  <section aria-label={copy("U.S. personal-care price context")} className="mt-2 space-y-2 text-sm">
   <p>{copy("National statistical reference only. This is not a local service price, a recommended price or a measure of your profit.")}</p>
   <p className="gc-text-secondary">{copy("U.S. city average · all urban consumers (CPI-U) · personal-care services")}</p>
   <p className="gc-text-secondary">{copy("Monthly index · not seasonally adjusted · 1982–1984 = 100")}</p>
   {data.status === "available" && data.current ? <>
    <p className="font-semibold">{copy("Official index for {month}: {value} index points", { month: month(data.current.month), value: formatNumber(data.current.index_value, { maximumFractionDigits: 3 }) })}</p>
    {data.change_percent !== null && data.comparison ? <p>{copy("Calculated change from {from} to {to}: {value}%", { from: month(data.comparison.month), to: month(data.current.month), value: formatNumber(data.change_percent, { maximumFractionDigits: 2 }) })}</p> : <p>{copy("The matching month one year earlier is missing. A 12-month change cannot be calculated.")}</p>}
   </> : <p role="status">{copy(data.status === "stale" ? "The saved reference is out of date. A current comparison is unavailable until the source is verified again." : "Verified reference data is unavailable. No benchmark or estimated service price is shown.")}</p>}
   {data.unavailable_observations.map(item => <p key={item.month}>{copy("Source data is unavailable for {month}; no value is estimated.", { month: month(item.month) })}</p>)}
   <p className="gc-text-secondary">{copy("These published months are separate from your selected finance period and your recorded dollar prices.")}</p>
   <p className="gc-text-secondary">{copy("The BLS uses a weighted sample of areas, outlets and items. The number of observations for this category is not published in this series.")}</p>
   {data.retrieved_at && <><p>{copy("Verified retrieval: {date}", { date: formatDate(data.retrieved_at, { dateStyle: "medium", timeZone: "UTC" }) })}</p><p className="gc-text-secondary">{copy("The source response does not provide a release timestamp. The retrieval date is not the publication date.")}</p></>}
   <p>{copy("Source: U.S. Bureau of Labor Statistics")}</p>
   <div className="flex flex-wrap gap-x-4 gap-y-1"><a href={data.metadata_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary underline">{copy("Official series details")}</a><a href={data.methodology_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-primary underline">{copy("Sampling methodology")}</a></div>
  </section>
 </details>;
}
