import { financeDayReader, summarizeOperatingBooks, validateFinancePeriod, type FinancePeriod, type OperatingBooks } from "@/lib/businessFinanceCore";

export type MoneyRecommendation = { kind: "balances" | "costs" | "cancellations" | "trend"; count: number; value_cents: number };
const shiftDay = (day: string, amount: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

/** Deterministic explanations of the existing authorized books. No discovery,
 * competitor data, model estimates, provider request or financial write. */
export function businessMoneyInsights(salonId: string, books: OperatingBooks, period: FinancePeriod) {
  validateFinancePeriod(period);
  // UTC arithmetic counts calendar days; it does not turn a DST day into 24h.
  const days = Math.round((Date.parse(`${period.to}T12:00:00Z`) - Date.parse(`${period.from}T12:00:00Z`)) / 86400000) + 1;
  const previousPeriod = { from: shiftDay(period.from, -days), to: shiftDay(period.from, -1), timeZone: period.timeZone };
  // Both summaries validate the entire business scope before any derived output.
  const current = summarizeOperatingBooks(salonId, books, period);
  const previous = summarizeOperatingBooks(salonId, books, previousPeriod);
  const localDay = financeDayReader(period.timeZone);
  const sales = books.sales.filter(sale => { const day = localDay(sale.occurred_at); return day >= period.from && day <= period.to; });
  const completed = sales.filter(sale => sale.status === "completed");
  const cancelled = sales.filter(sale => sale.status === "cancelled");
  const pending = sales.filter(sale => sale.status === "pending");
  const unpaid = current.balances.reduce((sum, balance) => sum + balance.unpaid_cents, 0);
  const samples = new Map<string, { name: string; visits: number; units: number; prices: number[]; discount_cents: number }>();
  for (const sale of completed.filter(sale => sale.kind === "service")) {
    if (!Number.isSafeInteger(sale.quantity) || sale.quantity <= 0) throw Error("FINANCE_INVALID_RECORD");
    // Keep distinct recorded service labels; do not guess that two services are equivalent.
    const sample = samples.get(sale.name) || { name: sale.name, visits: 0, units: 0, prices: [], discount_cents: 0 };
    sample.visits++; sample.units += sale.quantity;
    sample.prices.push(sale.agreed_cents / sale.quantity);
    sample.discount_cents += sale.discount_cents;
    samples.set(sale.name, sample);
  }
  const serviceSamples = [...samples.values()].map(({ prices, ...sample }) => {
    prices.sort((a, b) => a - b);
    const middle = Math.floor(prices.length / 2);
    return { ...sample, min_unit_cents: Math.round(prices[0]), max_unit_cents: Math.round(prices.at(-1)!), median_unit_cents: Math.round(prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2) };
  }).sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  const recommendations: MoneyRecommendation[] = [];
  if (unpaid > 0) recommendations.push({ kind: "balances", count: current.balances.filter(row => row.unpaid_cents > 0).length, value_cents: unpaid });
  if (current.costs_missing_for_sales > 0) recommendations.push({ kind: "costs", count: current.costs_missing_for_sales, value_cents: 0 });
  if (cancelled.length) recommendations.push({ kind: "cancellations", count: cancelled.length, value_cents: cancelled.reduce((sum, sale) => sum + sale.agreed_cents, 0) });
  if (previous.completed_sales_cents > current.completed_sales_cents) recommendations.push({ kind: "trend", count: completed.length, value_cents: previous.completed_sales_cents - current.completed_sales_cents });
  return {
    period, previous_period: previousPeriod, currency: "USD", sample_scope: "own_business_completed_service_records" as const,
    completed_sales_cents: current.completed_sales_cents, completed_count: completed.length,
    previous_sales_cents: previous.completed_sales_cents,
    sales_change_percent: previous.completed_sales_cents > 0 ? Math.round((current.completed_sales_cents - previous.completed_sales_cents) / previous.completed_sales_cents * 1000) / 10 : null,
    received_cents: current.cash_received_cents, deposit_cents: current.by_stage.deposit, unpaid_cents: unpaid,
    pending_value_cents: pending.reduce((sum, sale) => sum + sale.agreed_cents, 0), pending_count: pending.length,
    cancelled_count: cancelled.length, cancelled_value_cents: cancelled.reduce((sum, sale) => sum + sale.agreed_cents, 0),
    missing_cost_count: current.costs_missing_for_sales,
    service_samples: serviceSamples, recommendations: recommendations.slice(0, 2),
    // Discount records do not prove a promotion drove a booking or incremental revenue.
    promotion_attribution_available: false as const,
  };
}
export type BusinessMoneyInsights = ReturnType<typeof businessMoneyInsights>;
