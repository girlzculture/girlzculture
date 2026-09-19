"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import type { BusinessBookingMoney as Evidence } from "@/lib/businessBookingMoney";
import type { FinancePeriod } from "@/lib/businessFinanceCore";
import { bookingMoneyCopy } from "@/i18n/business-booking-money-copy";
export default function BusinessBookingMoney({ businessId, period }: { businessId: string; period: FinancePeriod }) {
 return <BookingMoneyPanel key={JSON.stringify([businessId, period])} period={period}/>;
}
function BookingMoneyPanel({ period }: { period: FinancePeriod }) {
 const { locale, formatCurrency, formatNumber } = useI18n();
 const t = (source: string, values: Record<string, string> = {}) => bookingMoneyCopy(locale, source, values);
 const [data, setData] = useState<Evidence | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true);
 const lifetime = useRef(0), pending = useRef(false);
 async function load() {
  if (pending.current) return; pending.current = true;
  const generation = lifetime.current; setBusy(true); setError(""); setData(null);
  try {
   const result = await (await createAuthenticatedApiClient("salon")).request<Evidence>(`/api/salon/booking-money?${new URLSearchParams({ from: period.from, to: period.to })}`);
   if (generation === lifetime.current) setData(result);
  } catch (failure) {
   if (generation !== lifetime.current) return;
   const code = (failure as { body?: { code?: string }; code?: string }).body?.code || (failure as { code?: string }).code;
   setError(code === "BOOKING_MONEY_ACCESS_DENIED" ? "Only the owner or a team member with full finance and booking access can view these figures." : code === "BOOKING_MONEY_CHANGED" ? "Records changed during verification. Refresh to read a consistent result." : code === "BOOKING_MONEY_RANGE_REQUIRED" ? "Choose a shorter period, up to one year, to verify this booking cohort." : scopedApiErrorMessage(failure, "Booking money evidence could not be verified. Reload to check the current records."));
  } finally { pending.current = false; if (generation === lifetime.current) setBusy(false); }
 }
 useEffect(() => {
  const version = lifetime;
  let active = true; void Promise.resolve().then(() => { if (active) void load(); });
  return () => { active = false; version.current++; };
  // This panel remounts for a different business or reporting period.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);
 const money = (amount: number) => formatCurrency(amount / 100, "USD");
 return <section aria-label={t("Booking outcomes and offers")} aria-busy={busy} className="space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5">
  <div className="flex flex-wrap justify-between gap-3"><h2 className="font-serif text-xl font-bold">{t("Booking outcomes and offers")}</h2><button className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold gc-disabled-control" disabled={busy} onClick={() => void load()}>{t("Refresh booking evidence")}</button></div>
  {busy && <p role="status">{t("Checking booking evidence…")}</p>}{error && <p role="alert" className="text-sm text-error">{t(error)}</p>}
  {data && <><p className="text-sm text-muted">{t("Appointments dated {from} to {to}, in {zone}. Statuses are the current recorded states, not a reconstruction of the past.", { from: period.from, to: period.to, zone: period.timeZone })}</p><div className="grid gap-3 lg:grid-cols-2">{([['cancelled','Cancelled appointments'],['no_show','No-shows']] as const).map(([key, title]) => {
   const value = data.categories[key];
   return <article key={key} className="space-y-2 rounded-xl bg-subtle p-3"><h3 className="font-semibold">{t(title)}</h3><p>{t("{count} bookings · agreed value {value}", { count: formatNumber(value.count), value: money(value.agreed_cents) })}</p><p className="text-sm">{t("Verified platform receipts: {received}; verified refunds: {refunded}.", { received: money(value.verified_platform_receipts_cents), refunded: money(value.verified_platform_refunds_cents) })}</p><p className="text-sm">{t("Business-recorded receipts: {received}; recorded refunds: {refunded}.", { received: money(value.business_recorded_receipts_cents), refunded: money(value.business_recorded_refunds_cents) })}</p><p className="text-sm font-semibold">{t("Net recorded receipts retained: {value}", { value: money(value.net_recorded_receipts_cents) })}</p></article>;
  })}</div><p className="text-xs text-muted">{t("Linked receipts include payments before the appointment period through its end date. Later receipts and refunds are excluded. Agreed value is not measured lost revenue; retained money is not a refund-policy decision.")}</p>
  <div className="space-y-3"><h3 className="font-semibold">{t("Recorded business-offer usage")}</h3>{data.promotion_attribution.status === "incomplete" ? <p role="status" className="text-sm">{t("{count} bookings have incomplete offer evidence. Attribution is unavailable until those records are reviewed.", { count: formatNumber(data.promotion_attribution.incomplete_booking_count) })}</p> : !data.promotion_attribution.groups.length ? <p className="text-sm">{t("No business-offer use is recorded for this appointment cohort.")}</p> : <ul className="grid gap-3 lg:grid-cols-2">{data.promotion_attribution.groups.map(group => <li className="space-y-2 rounded-xl border border-border p-3" key={JSON.stringify([group.id,group.title])}><b data-no-translate>{group.title}</b><p className="text-sm">{t("{completed} completed · {cancelled} cancelled · {noShow} no-show · {other} other current states", { completed: formatNumber(group.completed_count), cancelled: formatNumber(group.cancelled_count), noShow: formatNumber(group.no_show_count), other: formatNumber(group.other_count) })}</p><p className="text-sm">{t("Agreed discounts: {discount}; net recorded receipts: {receipts}.", { discount: money(group.discount_cents), receipts: money(group.totals.net_recorded_receipts_cents) })}</p></li>)}</ul>}<p className="text-xs text-muted">{t("Attribution uses the offer saved with each booking. It does not prove the offer caused the booking, incremental revenue, profitability, or marketing return.")}</p></div></>}
 </section>;
}
