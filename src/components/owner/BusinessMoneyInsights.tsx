"use client";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { businessMoneyInsights, type MoneyRecommendation } from "@/lib/businessMoneyInsights";
import type { FinancePeriod, OperatingBooks } from "@/lib/businessFinanceCore";
import BusinessPriceContext from "@/components/owner/BusinessPriceContext";

const actions: Record<MoneyRecommendation["kind"], [string, string]> = {
  balances: ["Review recorded unpaid balances", "transactions"],
  costs: ["Review missing cost information", "reports"],
  cancellations: ["Review cancelled records", "transactions"],
  trend: ["Compare recorded sales", "reports"],
};

export default function BusinessMoneyInsights({ salonId, books, period }: { salonId: string; books: OperatingBooks; period: FinancePeriod }) {
  const { translateSource: t, formatCurrency, formatNumber: number } = useI18n();
  const data = businessMoneyInsights(salonId, books, period);
  const money = (cents: number) => formatCurrency(cents / 100, "USD");
  const href = (tab: string) => `/salon/dashboard/earnings?${new URLSearchParams({ finance: tab, finance_from: period.from, finance_to: period.to })}`;
  return <section aria-label={t("Business money insights")} className="rounded-xl border border-border bg-white p-4 sm:p-5">
    <h2 className="font-serif text-xl font-bold">{t("Business money insights")}</h2>
    <p className="mt-2 text-sm text-muted">{t("Your recorded business figures for {value0} to {value1}.", { value0: period.from, value1: period.to })}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <article className="rounded-lg bg-subtle p-3"><h3 className="text-sm font-semibold">{t("Recorded sales trend")}</h3>
        <p className="mt-2 font-serif text-2xl">{data.sales_change_percent === null ? t("No positive comparison baseline") : `${number(data.sales_change_percent)}%`}</p>
        <p className="mt-2 text-sm">{t("Completed sales: {value0}; previous period: {value1}.", { value0: money(data.completed_sales_cents), value1: money(data.previous_sales_cents) })}</p>
        <p className="mt-1 text-xs text-muted">{t("Compared with {value0} to {value1}, using equal calendar days in your business time zone. Sales are before refunds; this is not bank settlement.", { value0: data.previous_period.from, value1: data.previous_period.to })}</p>
      </article>
      <article className="rounded-lg bg-subtle p-3"><h3 className="text-sm font-semibold">{t("Scheduled value and recorded receipts")}</h3>
        <p className="mt-2 text-sm">{t("Pending service and product value: {value0} across {value1} records.", { value0: money(data.pending_value_cents), value1: number(data.pending_count) })}</p>
        <p className="mt-2 text-sm">{t("Net receipts recorded in this period: {value0}.", { value0: money(data.received_cents) })}</p>
        <p className="mt-2 text-xs text-muted">{t("Pending value is an estimate, not payment received. Receipts may relate to earlier or future appointments; these figures are not added together.")}</p>
      </article>
    </div>
    {data.recommendations.length ? <ul className="mt-4 grid gap-3 sm:grid-cols-2">{data.recommendations.map(item => <li key={item.kind} className="rounded-lg border border-border p-3">
      <p className="text-sm">{item.kind === "balances" ? t("{value0} remains unpaid across {value1} recorded sales as of the period end, including records outside this period.", { value0: money(item.value_cents), value1: number(item.count) })
        : item.kind === "costs" ? t("{value0} completed sales lack cost information. Review your records before treating recorded profit as a complete margin.", { value0: number(item.count) })
        : item.kind === "cancellations" ? t("{value0} records were cancelled or marked no-show, with {value1} agreed value. This is not measured lost revenue.", { value0: number(item.count), value1: money(item.value_cents) })
        : t("Recorded completed sales are {value0} below the preceding period. Compare service records before choosing a promotion.", { value0: money(item.value_cents) })}</p>
      <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href={href(actions[item.kind][1])}>{t(actions[item.kind][0])}</Link>
    </li>)}</ul> : null}
    <details className="mt-4 rounded-lg border border-border p-3">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">{t("Your recorded service price samples")}</summary>
      <p className="mt-1 text-xs text-muted">{t("This business only, in the selected period. Each sample is a completed service record, not a unique client. Prices include recorded discounts; unit medians are per record. These are not local-market benchmarks or recommended new prices.")}</p>
      {data.service_samples.length ? <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto">{data.service_samples.map(sample => <li key={sample.name} className="border-t border-border pt-3 text-sm">
        <b data-no-translate>{sample.name}</b>
        <p>{t("{value0} records · {value1} service units · median {value2} per unit", { value0: number(sample.visits), value1: number(sample.units), value2: money(sample.median_unit_cents) })}</p>
        <p className="mt-1 text-xs text-muted">{t("Recorded range: {value0}–{value1}. Total recorded discounts: {value2}.", { value0: money(sample.min_unit_cents), value1: money(sample.max_unit_cents), value2: money(sample.discount_cents) })}</p>
      </li>)}</ul> : <p className="mt-2 text-sm">{t("No completed service samples in this period.")}</p>}
      <p className="mt-3 text-xs text-muted">{t("Discounts do not prove a promotion caused a booking. Promotion attribution is not available in these records.")}</p>
    </details>
    <BusinessPriceContext/>
  </section>;
}
