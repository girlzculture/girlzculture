/** Operating books use integer cents. A sale, its payment method and its
 * payment stage are different dimensions, never amounts to add together. */
export type FinanceMethod = "cash" | "card" | "transfer" | "other";
export type FinanceSource = "platform" | "walk_in" | "phone" | "social" | "other";
export type FinanceStage = "deposit" | "balance" | "full" | "refund";
export type CompensationSnapshot =
  | { kind: "commission"; version: string; basis: "before_discount" | "after_discount"; percent: number }
  | { kind: "booth"; version: string }
  | { kind: "employee"; version: string }
  | { kind: "none"; version: null };
export type OperatingSale = {
  id: string; salon_id: string; source: FinanceSource; kind: "service" | "product";
  occurred_at: string; recorded_at: string; status: "pending" | "completed" | "cancelled";
  name: string; stylist_id: string | null; client_id: string | null; client_name: string | null;
  list_cents: number; discount_cents: number; agreed_cents: number;
  cost_cents: number | null; quantity: number; compensation: CompensationSnapshot;
  /** Product tax and shipping are collected money, separate from merchandise. */
  tax_cents?: number; shipping_cents?: number; product_id?: string | null;
};
export type OperatingPayment = {
  id: string; salon_id: string; sale_id: string; occurred_at: string;
  stage: FinanceStage; method: FinanceMethod; amount_cents: number;
  /** Refunds and corrections point to the original receipt. They never overwrite it. */
  original_payment_id: string | null;
};
export type OperatingExpense = {
  id: string; salon_id: string; occurred_at: string; category: string;
  amount_cents: number; treatment: "operating" | "inventory_asset";
};
export type CompensationObligation = {
  id: string; salon_id: string; stylist_id: string; due_at: string;
  kind: "wage" | "booth_rent"; amount_cents: number; arrangement_version: string;
};
export type CompensationPayment = {
  id: string; salon_id: string; stylist_id: string; occurred_at: string;
  obligation_id: string | null; kind: "commission" | "wage" | "booth_rent";
  amount_cents: number; method: FinanceMethod;
};
export type OperatingBooks = {
  sales: OperatingSale[]; payments: OperatingPayment[]; expenses: OperatingExpense[];
  obligations: CompensationObligation[]; compensation_payments: CompensationPayment[];
};
export type FinancePeriod = { from: string; to: string; timeZone: string };
export function financePeriodToDate(today: string, preset: "day" | "week" | "month" | "quarter" | "year") {
  validateFinancePeriod({from:today,to:today,timeZone:"UTC"});
  const date=new Date(`${today}T12:00:00Z`);
  if(preset==="week") date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  if(preset==="month") date.setUTCDate(1);
  if(preset==="quarter") date.setUTCMonth(Math.floor(date.getUTCMonth()/3)*3,1);
  if(preset==="year") date.setUTCMonth(0,1);
  return {from:date.toISOString().slice(0,10),to:today};
}

export function moneyCents(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) throw Error("FINANCE_INVALID_AMOUNT");
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw Error("FINANCE_INVALID_AMOUNT");
  return result;
}
const validCents = (value: number) => Number.isSafeInteger(value) && value >= 0;
export const financeSalePayable = (sale: OperatingSale) => sale.agreed_cents + (sale.tax_cents || 0) + (sale.shipping_cents || 0);
const dateKey = (value: string, timeZone: string) => {
  if (!Number.isFinite(Date.parse(value))) throw Error("FINANCE_INVALID_DATE");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
};
export function validateFinancePeriod(period: FinancePeriod) {
  for (const value of [period.from, period.to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw Error("FINANCE_INVALID_PERIOD");
  if (period.to < period.from) throw Error("FINANCE_INVALID_PERIOD");
  new Intl.DateTimeFormat("en", { timeZone: period.timeZone });
}

/** Defense in depth after scoped database queries. A mixed-business result is
 * rejected in full before a model, screen or export can receive it. */
export function assertOperatingBooksScope(salonId: string, books: OperatingBooks) {
  if (!salonId) throw Error("FINANCE_ACCESS_DENIED");
  for (const rows of Object.values(books)) {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.salon_id !== salonId) throw Error("FINANCE_ACCESS_DENIED");
      if (!row.id || ids.has(row.id)) throw Error("FINANCE_DUPLICATE_RECORD");
      ids.add(row.id);
      if ("amount_cents" in row && !validCents(row.amount_cents)) throw Error("FINANCE_INVALID_AMOUNT");
    }
  }
  const sales = new Set(books.sales.map(sale => sale.id));
  const payments = new Map(books.payments.map(payment => [payment.id, payment]));
  for (const payment of books.payments) {
    if (!sales.has(payment.sale_id) || !validCents(payment.amount_cents)) throw Error("FINANCE_INVALID_RECORD");
    if (payment.stage === "refund") {
      const original = payments.get(payment.original_payment_id || "");
      if (!original || original.sale_id !== payment.sale_id || original.stage === "refund" || original.method !== payment.method) throw Error("FINANCE_INVALID_REFUND");
    }
  }
  for (const original of books.payments.filter(payment => payment.stage !== "refund")) {
    if (books.payments.filter(payment => payment.original_payment_id === original.id).reduce((sum, payment) => sum + payment.amount_cents, 0) > original.amount_cents) throw Error("FINANCE_REFUND_EXCEEDS_RECEIPT");
  }
  for (const sale of books.sales) {
    if (![sale.tax_cents ?? 0, sale.shipping_cents ?? 0].every(validCents)) throw Error("FINANCE_INVALID_RECORD");
    if (![sale.list_cents, sale.discount_cents, sale.agreed_cents].every(validCents) || sale.discount_cents > sale.list_cents || sale.agreed_cents !== sale.list_cents - sale.discount_cents || sale.cost_cents !== null && !validCents(sale.cost_cents)) throw Error("FINANCE_INVALID_RECORD");
    if (sale.compensation.kind === "commission" && (!Number.isFinite(sale.compensation.percent) || sale.compensation.percent < 0 || sale.compensation.percent > 100)) throw Error("FINANCE_INVALID_ARRANGEMENT");
    if (books.payments.filter(payment => payment.sale_id === sale.id && payment.stage !== "refund").reduce((sum, payment) => sum + payment.amount_cents, 0) > financeSalePayable(sale)) throw Error("FINANCE_RECEIPTS_EXCEED_SALE");
  }
}

export function summarizeOperatingBooks(salonId: string, books: OperatingBooks, period: FinancePeriod) {
  validateFinancePeriod(period);
  assertOperatingBooksScope(salonId, books);
  const within = (at: string) => { const day = dateKey(at, period.timeZone); return day >= period.from && day <= period.to; };
  const salesById = new Map(books.sales.map(sale => [sale.id, sale]));
  const completed = books.sales.filter(sale => sale.status === "completed" && within(sale.occurred_at));
  const receipts = books.payments.filter(payment => within(payment.occurred_at));
  const expenses = books.expenses.filter(expense => within(expense.occurred_at));
  const obligations = books.obligations.filter(row => within(row.due_at));
  const compensationPayments = books.compensation_payments.filter(row => within(row.occurred_at));
  // Cumulative rounding makes several partial reversals equal one full
  // reversal, including when partial refunds straddle reporting periods.
  const commissionRefunds = new Map<string, number>();
  const merchandiseRefunds = new Map<string, number>();
  const refundedBySale = new Map<string, number>();
  for (const payment of [...books.payments].filter(row => row.stage === "refund").sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.id.localeCompare(b.id))) {
    const sale = salesById.get(payment.sale_id)!;
    const before = refundedBySale.get(sale.id) || 0;
    const after = before + payment.amount_cents;
    const payable = financeSalePayable(sale);
    // A provider refund has no merchandise/tax allocation. Report the defined
    // proportional allocation, not an invented line-item or tax determination.
    merchandiseRefunds.set(payment.id, payable ? Math.round(sale.agreed_cents * after / payable) - Math.round(sale.agreed_cents * before / payable) : 0);
    if (sale.kind === "service" && sale.compensation.kind === "commission") {
      const basis = sale.compensation.basis === "before_discount" ? sale.list_cents : sale.agreed_cents;
      const earned = Math.round(basis * sale.compensation.percent / 100);
      commissionRefunds.set(payment.id, sale.agreed_cents ? Math.round(earned * after / sale.agreed_cents) - Math.round(earned * before / sale.agreed_cents) : 0);
    }
    refundedBySale.set(sale.id, after);
  }
  const byMethod: Record<FinanceMethod, number> = { cash: 0, card: 0, transfer: 0, other: 0 };
  const byStage: Record<FinanceStage, number> = { deposit: 0, balance: 0, full: 0, refund: 0 };
  const bySource: Record<FinanceSource, number> = { platform: 0, walk_in: 0, phone: 0, social: 0, other: 0 };
  const byService: Record<string, number> = {};
  const byDay: Record<string, { visits: number; sales_cents: number }> = {};
  const byStylist: Record<string, { visits: number; service_sales_cents: number; commission_earned_cents: number; wage_due_cents: number; paid_cents: number; booth_rent_due_cents: number; booth_rent_paid_cents: number }> = {};
  const stylist = (id: string | null) => byStylist[id || "unassigned"] ||= { visits: 0, service_sales_cents: 0, commission_earned_cents: 0, wage_due_cents: 0, paid_cents: 0, booth_rent_due_cents: 0, booth_rent_paid_cents: 0 };
  let completedServiceSales = 0, completedProductSales = 0, recognizedRefunds = 0, businessSales = 0, costOfSales = 0, unknownCosts = 0, commissionEarned = 0;
  for (const sale of completed) {
    if (sale.kind === "service") completedServiceSales += sale.agreed_cents; else completedProductSales += sale.agreed_cents;
    const businessOwned = sale.kind === "product" || sale.compensation.kind !== "booth";
    if (businessOwned) {
      businessSales += sale.agreed_cents;
      if (sale.cost_cents === null) unknownCosts++; else costOfSales += sale.cost_cents;
    }
    bySource[sale.source] += sale.agreed_cents;
    byService[sale.name] = (byService[sale.name] || 0) + sale.agreed_cents;
    const day = dateKey(sale.occurred_at, period.timeZone);
    const daily = byDay[day] ||= { visits: 0, sales_cents: 0 };
    if (sale.kind === "service") daily.visits++;
    daily.sales_cents += sale.agreed_cents;
    if (sale.kind === "service") {
      const person = stylist(sale.stylist_id); person.visits++; person.service_sales_cents += sale.agreed_cents;
      if (sale.compensation.kind === "commission") {
        const basis = sale.compensation.basis === "before_discount" ? sale.list_cents : sale.agreed_cents;
        const earned = Math.round(basis * sale.compensation.percent / 100);
        person.commission_earned_cents += earned; commissionEarned += earned;
      }
    }
  }
  for (const payment of receipts) {
    const sale = salesById.get(payment.sale_id)!;
    const signed = payment.stage === "refund" ? -payment.amount_cents : payment.amount_cents;
    byMethod[payment.method] += signed;
    byStage[payment.stage] += payment.amount_cents;
    if (payment.stage === "refund" && sale.status === "completed") {
      const salesRefund = merchandiseRefunds.get(payment.id) || 0;
      recognizedRefunds += salesRefund;
      if (sale.kind === "product" || sale.compensation.kind !== "booth") businessSales -= salesRefund;
      if (sale.kind === "service" && sale.compensation.kind === "commission") {
        // Refunds reverse a proportional share of that sale's snapshotted
        // commission; an edited arrangement cannot rewrite earlier earnings.
        const reversal = commissionRefunds.get(payment.id) || 0;
        stylist(sale.stylist_id).commission_earned_cents -= reversal; commissionEarned -= reversal;
      }
    }
  }
  for (const row of obligations) {
    if (row.kind === "booth_rent") stylist(row.stylist_id).booth_rent_due_cents += row.amount_cents;
    else stylist(row.stylist_id).wage_due_cents += row.amount_cents;
  }
  for (const row of compensationPayments) {
    if (row.kind === "booth_rent") stylist(row.stylist_id).booth_rent_paid_cents += row.amount_cents;
    else stylist(row.stylist_id).paid_cents += row.amount_cents;
  }
  const wageDue = obligations.filter(row => row.kind === "wage").reduce((sum, row) => sum + row.amount_cents, 0);
  const rentDue = obligations.filter(row => row.kind === "booth_rent").reduce((sum, row) => sum + row.amount_cents, 0);
  const expenseCategories: Record<string, number> = {};
  for (const expense of expenses.filter(row => row.treatment === "operating")) expenseCategories[expense.category] = (expenseCategories[expense.category] || 0) + expense.amount_cents;
  const operatingExpenses = Object.values(expenseCategories).reduce((sum, amount) => sum + amount, 0);
  const position = books.sales.filter(sale => dateKey(sale.recorded_at, period.timeZone) <= period.to).map(sale => {
    const received = books.payments.filter(payment => payment.sale_id === sale.id && dateKey(payment.occurred_at, period.timeZone) <= period.to).reduce((sum, payment) => sum + (payment.stage === "refund" ? -payment.amount_cents : payment.amount_cents), 0);
    // A recorded refund does not reopen a discharged price as customer debt.
    const refunded = books.payments.filter(payment => payment.sale_id === sale.id && payment.stage === "refund" && dateKey(payment.occurred_at, period.timeZone) <= period.to).reduce((sum, payment) => sum + payment.amount_cents, 0);
    return { sale_id: sale.id, received_cents: received, unpaid_cents: sale.status === "cancelled" ? 0 : Math.max(0, financeSalePayable(sale) - received - refunded) };
  });
  const compensationPosition: Record<string, { commission_earned_cents: number; commission_paid_cents: number; wage_due_cents: number; wage_paid_cents: number; booth_rent_due_cents: number; booth_rent_paid_cents: number; compensation_outstanding_cents: number; advance_cents: number; rent_outstanding_cents: number }> = {};
  const account = (id: string) => compensationPosition[id] ||= { commission_earned_cents:0,commission_paid_cents:0,wage_due_cents:0,wage_paid_cents:0,booth_rent_due_cents:0,booth_rent_paid_cents:0,compensation_outstanding_cents:0,advance_cents:0,rent_outstanding_cents:0 };
  const asOf = (at: string) => dateKey(at, period.timeZone) <= period.to;
  for (const sale of books.sales) if (sale.stylist_id && sale.status === "completed" && sale.kind === "service" && sale.compensation.kind === "commission" && asOf(sale.occurred_at)) {
    const earned = Math.round((sale.compensation.basis === "before_discount" ? sale.list_cents : sale.agreed_cents) * sale.compensation.percent / 100);
    account(sale.stylist_id).commission_earned_cents += earned;
  }
  for (const payment of books.payments) if (payment.stage === "refund" && asOf(payment.occurred_at)) {
    const sale = salesById.get(payment.sale_id)!;
    if (sale.stylist_id && sale.status === "completed" && asOf(sale.occurred_at)) account(sale.stylist_id).commission_earned_cents -= commissionRefunds.get(payment.id) || 0;
  }
  for (const obligation of books.obligations) if (asOf(obligation.due_at)) account(obligation.stylist_id)[obligation.kind === "wage" ? "wage_due_cents" : "booth_rent_due_cents"] += obligation.amount_cents;
  for (const payment of books.compensation_payments) if (asOf(payment.occurred_at)) account(payment.stylist_id)[payment.kind === "commission" ? "commission_paid_cents" : payment.kind === "wage" ? "wage_paid_cents" : "booth_rent_paid_cents"] += payment.amount_cents;
  for (const row of Object.values(compensationPosition)) {
    const outstanding = row.commission_earned_cents + row.wage_due_cents - row.commission_paid_cents - row.wage_paid_cents;
    row.compensation_outstanding_cents = Math.max(0,outstanding); row.advance_cents = Math.max(0,-outstanding);
    row.rent_outstanding_cents = Math.max(0,row.booth_rent_due_cents-row.booth_rent_paid_cents);
  }
  return {
    period, currency: "USD", completed_service_sales_cents: completedServiceSales, completed_product_sales_cents: completedProductSales,
    completed_sales_cents: completedServiceSales + completedProductSales, recognized_refunds_cents: recognizedRefunds,
    net_completed_sales_cents: completedServiceSales + completedProductSales - recognizedRefunds,
    completed_tax_cents: completed.reduce((sum,sale) => sum + (sale.tax_cents || 0), 0),
    completed_shipping_cents: completed.reduce((sum,sale) => sum + (sale.shipping_cents || 0), 0),
    product_refund_allocation: "proportional_merchandise_share_of_order_total" as const,
    cash_received_cents: Object.values(byMethod).reduce((sum, amount) => sum + amount, 0), by_method: byMethod, by_stage: byStage,
    by_source: bySource, by_service: byService, by_day: byDay, by_stylist: byStylist,
    business_sales_cents: businessSales, rent_earned_cents: rentDue, wage_due_cents: wageDue, commission_earned_cents: commissionEarned,
    operating_expenses_cents: operatingExpenses, expense_categories: expenseCategories, cost_of_sales_cents: costOfSales,
    inventory_purchases_cents: expenses.filter(row => row.treatment === "inventory_asset").reduce((sum, row) => sum + row.amount_cents, 0),
    recorded_profit_cents: businessSales + rentDue - operatingExpenses - costOfSales - commissionEarned - wageDue,
    costs_missing_for_sales: unknownCosts, expenses_completeness_verified: false as const,
    visits: completed.filter(sale => sale.kind === "service").length,
    identified_clients: new Set(completed.map(sale => sale.client_id).filter(Boolean)).size,
    unnamed_visits: completed.filter(sale => sale.kind === "service" && !sale.client_id && !sale.client_name).length,
    position_as_of: period.to, balances: position, compensation_position: compensationPosition,
  };
}
