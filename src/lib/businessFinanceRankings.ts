/** Rank already-authorized canonical aggregates before any display/model cap.
 * Earned compensation is commission (including recorded reversals) plus wages
 * due in this period; service sales, receipts and payouts are separate. */
type Professional = { visits: number; service_sales_cents: number; commission_earned_cents: number; wage_due_cents: number; paid_cents: number; booth_rent_due_cents: number; booth_rent_paid_cents: number };
type Summary = { period: { from: string; to: string; timeZone: string }; currency: string; by_stylist: Record<string, Professional>; expense_categories: Record<string, number> };
const cents = (value: number) => { if (!Number.isSafeInteger(value)) throw Error("FINANCE_INVALID_AMOUNT"); return value; };
const sum = (values: number[]) => values.reduce((total, value) => cents(total + cents(value)), 0);
const keyOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function ranked<T extends { amount_cents: number }>(rows: T[], key: (row: T) => string) {
  const ordered = [...rows].sort((a, b) => b.amount_cents - a.amount_cents || keyOrder(key(a), key(b)));
  const highest = ordered[0]?.amount_cents ?? null;
  const leaders = highest === null ? [] : ordered.filter(row => row.amount_cents === highest);
  return { total: ordered.length, total_amount_cents: sum(ordered.map(row => row.amount_cents)), shown_count: Math.min(12, ordered.length), is_excerpt: ordered.length > 12,
    highest_amount_cents: highest, tied_leader_count: leaders.length, leaders_shown_count: Math.min(12, leaders.length), leaders_are_excerpt: leaders.length > 12,
    leaders: leaders.slice(0, 12), rows: ordered.slice(0, 12) };
}
export function businessFinanceRankings(summary: Summary, names: ReadonlyMap<string, string>, scope: "business" | "own") {
  if (summary.currency !== "USD" || !["business", "own"].includes(scope)) throw Error("FINANCE_INVALID_RECORD");
  const professionals = Object.entries(summary.by_stylist).map(([id, row]) => {
    for (const value of Object.values(row)) cents(value);
    return { id, name: names.get(id) || null, amount_cents: sum([row.commission_earned_cents, row.wage_due_cents]), ...row };
  });
  const expenses = Object.entries(summary.expense_categories).map(([category, amount]) => { if (cents(amount) < 0) throw Error("FINANCE_INVALID_AMOUNT"); return { category, amount_cents: amount }; });
  const unassigned = professionals.find(row => row.id === "unassigned");
  return { scope: scope === "business" ? "authenticated_business_only" : "own_stylist_only", period: summary.period, currency: "USD",
    professionals: { basis: "period_commission_earned_plus_wages_due", ...ranked(professionals.filter(row => row.id !== "unassigned"), row => row.id), unassigned_earned_compensation_cents: unassigned?.amount_cents ?? 0, unassigned_excluded: Boolean(unassigned) },
    expenses: scope === "business" ? { basis: "recorded_operating_expenses_only_inventory_purchases_separate", ...ranked(expenses, row => row.category) } : null };
}

/** Preserve all scalar totals and explicit excerpts within the global 32-key,
 * 12-row and five-depth model limits, without widening those safety bounds. */
export function assistantFinanceFacts(value: Record<string, unknown>) {
  const excluded = new Set(["scope", "scope_stylist_id", "period", "currency", "definitions", "position_as_of", "product_refund_allocation"]);
  const totals = Object.fromEntries(Object.entries(value).filter(([key, item]) => !excluded.has(key) && (typeof item === "number" || typeof item === "boolean")));
  const entries = (input: unknown) => {
    const rows = input && typeof input === "object" ? Object.entries(input) : [];
    return { total: rows.length, shown_count: Math.min(12, rows.length), is_excerpt: rows.length > 12, rows: rows.slice(0, 12).map(([name, amount]) => ({ name, value: amount })) };
  };
  const positions = Array.isArray(value.compensation_position) ? value.compensation_position : [];
  return { scope: value.scope, scope_stylist_id: value.scope_stylist_id, period: value.period, currency: value.currency, definitions: value.definitions,
    rankings: value.rankings, totals, receipt_breakdowns: { by_method: value.by_method, by_stage: value.by_stage, by_source: value.by_source },
    service_sales: entries(value.by_service), daily_activity: entries(value.by_day), product_refund_allocation: value.product_refund_allocation,
    compensation_position: { as_of: value.position_as_of, total: positions.length, shown_count: Math.min(12, positions.length), is_excerpt: positions.length > 12, rows: positions.slice(0, 12) },
    evidence: value.evidence, insights: value.insights, service_contribution: value.service_contribution };
}
