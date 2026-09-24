import { assertOperatingBooksScope, moneyCents, validateFinancePeriod, type FinancePeriod, type OperatingBooks } from "@/lib/businessFinanceCore";
import type { BusinessFinanceData } from "@/lib/businessFinanceData";

type Row = Record<string, unknown>;
const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[ _-]/g, "");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
export function bookingMoneyDay(value: unknown, timeZone: string) {
 const stamp = String(value ?? "");
 if (!Number.isFinite(Date.parse(stamp))) throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
 const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(stamp));
 return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
}
export function bookingMoneyCohort(salonId: string, data: BusinessFinanceData, period: FinancePeriod) {
 validateFinancePeriod(period);
 if (data.scope.kind !== "business") throw Error("BOOKING_MONEY_ACCESS_DENIED");
 const seen = new Set<string>();
 for (const row of data.bookings) {
  if (row.salon_id !== salonId) throw Error("BOOKING_MONEY_ACCESS_DENIED");
  if (!uuid.test(String(row.id)) || seen.has(String(row.id))) throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
  seen.add(String(row.id));
 }
 const rows = data.bookings.filter(row => (row.payment_mode !== "test" || data.is_demo === true && row.is_demo === true) && (() => {
  const day = bookingMoneyDay(row.appointment_datetime, period.timeZone);
  return day >= period.from && day <= period.to;
 })());
 if (rows.length > 2000) throw Error("BOOKING_MONEY_RANGE_TOO_LARGE");
 return rows;
}
const metrics = () => ({ count: 0, agreed_cents: 0, verified_platform_receipts_cents: 0, verified_platform_refunds_cents: 0, business_recorded_receipts_cents: 0, business_recorded_refunds_cents: 0, net_recorded_receipts_cents: 0 });
type Metrics = ReturnType<typeof metrics>;
function add(target: Metrics, source: Metrics) {
 for (const key of Object.keys(target) as (keyof Metrics)[]) {
  const value = target[key] + source[key];
  if (!Number.isSafeInteger(value)) throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
  target[key] = value;
 }
}
const snapshotFields = ["status", "appointment_datetime", "estimated_total", "subtotal_before_promotion", "deposit_amount", "deposit_status", "payment_mode", "payment_verified_at", "refund_status", "refund_amount", "refund_completed_at"] as const;

/** One appointment-date cohort, today's recorded booking states, and linked
 * canonical receipts through the selected end date. This is not a historical
 * reconstruction of state, estimated lost revenue, or causal promotion lift. */
export function businessBookingMoney(salonId: string, books: OperatingBooks, data: BusinessFinanceData, metadata: Row[], period: FinancePeriod) {
 assertOperatingBooksScope(salonId, books);
 const cohort = bookingMoneyCohort(salonId, data, period);
 const wanted = new Map(cohort.map(row => [String(row.id), row]));
 const supplied = new Map<string, Row>();
 for (const row of metadata) {
  if (row.salon_id !== salonId) throw Error("BOOKING_MONEY_ACCESS_DENIED");
  const prior = wanted.get(String(row.id));
  if (!prior || supplied.has(String(row.id))) throw Error("BOOKING_MONEY_CHANGED");
  for (const key of snapshotFields) if (String(row[key] ?? "") !== String(prior[key] ?? "")) throw Error("BOOKING_MONEY_CHANGED");
  supplied.set(String(row.id), row);
 }
 if (supplied.size !== wanted.size) throw Error("BOOKING_MONEY_CHANGED");
 const categories = { completed: metrics(), cancelled: metrics(), no_show: metrics(), other: metrics() };
 const sales = new Map(books.sales.map(sale => [sale.id, sale]));
 const receipts = new Map<string, typeof books.payments>();
 for (const payment of books.payments) {
  if (!payment.sale_id.startsWith("booking:") || bookingMoneyDay(payment.occurred_at, period.timeZone) > period.to) continue;
  const rows = receipts.get(payment.sale_id) || []; rows.push(payment); receipts.set(payment.sale_id, rows);
 }
 const promotions = new Map<string, { id: string; title: string; discount_cents: number; completed_count: number; cancelled_count: number; no_show_count: number; other_count: number; totals: Metrics }>();
 let incompletePromotions = 0, noPromotion = 0;
 for (const [id, row] of supplied) {
  const sale = sales.get(`booking:${id}`);
  if (!sale || sale.kind !== "service" || sale.agreed_cents !== moneyCents(row.estimated_total)) throw Error("BOOKING_MONEY_CHANGED");
  const canonicalPayments = books.payments.filter(payment => payment.sale_id === sale.id);
  const original = wanted.get(id)!;
  if (original.booking_origin !== "business_added" && moneyCents(row.deposit_amount ?? 0) > 0 && ["paid", "succeeded", "refunded", "partiallyrefunded", "refundpending"].includes(normalized(row.deposit_status)) && !canonicalPayments.some(payment => payment.id === `deposit:${id}`)) throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
  if (normalized(row.refund_status) === "succeeded" && moneyCents(row.refund_amount ?? 0) > 0 && !canonicalPayments.some(payment => payment.id === `refund:${id}`)) throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
  const status = normalized(row.status);
  if (!status) throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
  const category = status === "completed" ? "completed" : status === "noshow" ? "no_show" : ["cancelled", "canceled"].includes(status) ? "cancelled" : "other";
  const value = metrics(); value.count = 1; value.agreed_cents = sale.agreed_cents;
  for (const payment of receipts.get(sale.id) || []) {
   if (payment.id === `deposit:${id}` && payment.stage === "deposit") value.verified_platform_receipts_cents += payment.amount_cents;
   else if (payment.id === `refund:${id}` && payment.stage === "refund" && payment.original_payment_id === `deposit:${id}`) value.verified_platform_refunds_cents += payment.amount_cents;
   else if (payment.id.startsWith("receipt:")) {
    if (payment.stage === "refund") value.business_recorded_refunds_cents += payment.amount_cents;
    else value.business_recorded_receipts_cents += payment.amount_cents;
   } else throw Error("BOOKING_MONEY_INVALID_EVIDENCE");
  }
  value.net_recorded_receipts_cents = value.verified_platform_receipts_cents + value.business_recorded_receipts_cents - value.verified_platform_refunds_cents - value.business_recorded_refunds_cents;
  add(categories[category], value);
  const snapshot = object(row.promotion_snapshot), snapshotId = String(snapshot.promotion_id || ""), linkedId = String(row.salon_promotion_id || "");
  const amount = moneyCents(row.promotion_discount_amount ?? 0);
  if (!linkedId && !snapshotId && !amount && !Object.keys(snapshot).length) { noPromotion++; continue; }
  // A saved offer may have been deleted. Its immutable booked snapshot remains
  // usable; a surviving FK must agree. Incomplete evidence never means zero use.
  let valid = uuid.test(snapshotId) && (!linkedId || linkedId === snapshotId) && typeof snapshot.title === "string" && snapshot.title.trim().length > 0 && snapshot.title.length <= 300 && ["discount_amount", "adjusted_total", "subtotal_before_promotion"].every(key => Object.hasOwn(snapshot, key) && snapshot[key] !== null);
  try {
   valid = valid && amount === moneyCents(snapshot.discount_amount) && moneyCents(snapshot.adjusted_total) === sale.agreed_cents && moneyCents(snapshot.subtotal_before_promotion) - amount === sale.agreed_cents && amount <= sale.discount_cents;
  } catch { valid = false; }
  if (!valid) { incompletePromotions++; continue; }
  const key = JSON.stringify([snapshotId, snapshot.title]);
  const group = promotions.get(key) || { id: snapshotId, title: String(snapshot.title), discount_cents: 0, completed_count: 0, cancelled_count: 0, no_show_count: 0, other_count: 0, totals: metrics() };
  group.discount_cents += amount; group[`${category}_count`]++; add(group.totals, value); promotions.set(key, group);
 }
 return {
  period, currency: "USD", cohort_count: cohort.length, categories,
  status_basis: "current_recorded_status" as const, receipt_basis: "linked_receipts_through_period_end" as const,
  promotion_attribution: { status: incompletePromotions ? "incomplete" as const : "measured" as const, incomplete_booking_count: incompletePromotions, without_business_offer_count: noPromotion, groups: incompletePromotions ? [] : [...promotions.values()].sort((a, b) => b.totals.count - a.totals.count || a.title.localeCompare(b.title)) },
  measured_incremental_lift: false, measured_lost_revenue: false,
 };
}
export type BusinessBookingMoney = ReturnType<typeof businessBookingMoney>;
