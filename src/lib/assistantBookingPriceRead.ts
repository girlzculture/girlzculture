import "server-only";
import { AssistantError, stableJson } from "@/lib/gcAssistantCore";
import { operatingBooksFromData, type BusinessFinanceData } from "@/lib/businessFinanceData";
import { moneyCents, summarizeOperatingBooks } from "@/lib/businessFinanceCore";
import { priceReadScope, unchangedPriceScope, priceObject, priceUnavailable, priceDenied, type PriceReadContext } from "@/lib/assistantPriceReadScope";
const fields = "id,salon_id,stylist_id,public_reference,appointment_datetime,status,booking_origin,payment_mode,estimated_total,subtotal_before_promotion,deposit_amount,deposit_percentage,original_deposit_amount,deposit_rule_snapshot,discount_amount,promotion_discount_amount,promotion_snapshot,balance_due";
const stamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
/** Existing contract facts never consult today's catalog, offers or rule. */
export async function readAssistantBookingPrice(context: PriceReadContext, args: Record<string, unknown>) {
  const permissions = ["bookings", "client_history"];
  const before = await priceReadScope(context, permissions, true);
  const restricted = before.assigned || (before.kind === "own" ? before.financeStylist : null);
  async function booking() {
    let query = context.admin.from("bookings").select(fields).eq("id", args.booking_id).eq("salon_id", context.salon.id);
    if (restricted) query = query.eq("stylist_id", restricted);
    const read = await query.maybeSingle(), row = priceObject(read.data);
    if (read.error) throw priceUnavailable();
    if (!row) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
    if (row.id !== args.booking_id || row.salon_id !== context.salon.id || restricted && row.stylist_id !== restricted) throw priceDenied();
    return row;
  }
  const row = await booking();
  const response = await context.admin.rpc("read_business_finance", { p_salon: context.salon.id, p_user: context.user.id });
  if (response.error) throw priceUnavailable();
  const data = response.data as BusinessFinanceData;
  if (!data || data.scope?.kind !== before.kind || (data.scope.stylist_id ?? null) !== before.financeStylist) throw priceDenied();
  if (Object.values(data).filter(Array.isArray).reduce((sum, rows) => sum + rows.length, 0) > 20000) throw priceUnavailable();
  let all;
  try { all = operatingBooksFromData(context.salon.id, data); } catch { throw priceUnavailable(); }
  const matches = data.bookings.filter(value => value.id === row.id);
  if (matches.length !== 1 || matches[0].salon_id !== context.salon.id || restricted && matches[0].stylist_id !== restricted) throw priceDenied();
  const canonical = matches[0];
  for (const key of ["estimated_total", "subtotal_before_promotion", "deposit_amount", "status", "appointment_datetime", "payment_mode"]) if (String(row[key]) !== String(canonical[key])) throw priceUnavailable();
  if (stableJson(await booking()) !== stableJson(row)) throw priceUnavailable();
  unchangedPriceScope(before, await priceReadScope(context, permissions, true));
  const now = new Date(), parts = new Intl.DateTimeFormat("en-CA", { timeZone: before.time_zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const day = ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
  const base = { booking_id: row.id, public_reference: typeof row.public_reference === "string" ? row.public_reference.slice(0, 100) : null, status: row.status, appointment_datetime: row.appointment_datetime, currency: "USD", as_of: now.toISOString(), as_of_day: day, time_zone: before.time_zone,
    scope: restricted ? "own_stylist_only" : "authenticated_business_only", scope_stylist_id: restricted, href: `/salon/dashboard/earnings?${new URLSearchParams({ finance: "transactions", finance_record: `booking:${row.id}` })}`,
    definition: "Original saved booking terms, never recalculated from today's menu, promotion or deposit rule. Original remaining balance is not today's unpaid amount. Current recorded position uses verified payments through the business reporting day; refunds do not reopen discharged debt. Pending/future amounts are not claimed overdue. No collection, payment or notification was performed." };
  const unavailable = (reason: string) => ({ ...base, available: false, reason, original: null, current: null });
  if (row.payment_mode === "test") return unavailable("test_payment_excluded");
  let subtotal: number, agreed: number, deposit: number, discount: number, businessDiscount: number, balance: number;
  const terms = priceObject(row.deposit_rule_snapshot), offer = priceObject(row.promotion_snapshot);
  try {
    if (!terms || [terms.rate, row.deposit_percentage].some(rate => typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) return unavailable("original_terms_incomplete");
    subtotal = moneyCents(row.subtotal_before_promotion); agreed = moneyCents(row.estimated_total); deposit = moneyCents(row.deposit_amount);
    discount = moneyCents(row.discount_amount); businessDiscount = moneyCents(row.promotion_discount_amount); balance = moneyCents(row.balance_due);
    if (moneyCents(row.original_deposit_amount) !== deposit || !terms || moneyCents(terms.subtotal) !== subtotal || moneyCents(terms.deposit) !== deposit || terms.basis !== "eligible_service_subtotal_before_discounts" || Number(terms.rate) !== Number(row.deposit_percentage)) return unavailable("original_terms_incomplete");
    if (subtotal - discount - businessDiscount !== agreed || deposit > agreed || agreed - deposit !== balance || discount > 0 && businessDiscount > 0) return unavailable("original_terms_inconsistent");
    if (businessDiscount > 0 && (!offer || moneyCents(offer.subtotal_before_promotion) !== subtotal || moneyCents(offer.discount_amount) !== businessDiscount || moneyCents(offer.adjusted_total) !== agreed || moneyCents(offer.protected_deposit) !== deposit)) return unavailable("original_promotion_incomplete");
  } catch { return unavailable("original_terms_incomplete"); }
  const id = `booking:${row.id}`, sale = all.books.sales.find(value => value.id === id);
  if (!sale || sale.agreed_cents !== agreed || sale.list_cents !== subtotal) return unavailable("recorded_finance_changed");
  const books = { sales: [sale], payments: all.books.payments.filter(payment => payment.sale_id === id), expenses: [], obligations: [], compensation_payments: [] };
  // Scope was checked for the entire protected response before selecting this
  // booking. Verification uncertainty here is specific to its own evidence.
  const hasDeposit = deposit === 0 || books.payments.some(payment => payment.id === `deposit:${row.id}`);
  const refundClaim = Number(canonical.refund_amount || 0) > 0;
  const hasRefund = !refundClaim || books.payments.some(payment => payment.id === `refund:${row.id}`);
  const futurePayment = books.payments.some(payment => Date.parse(payment.occurred_at) > now.getTime());
  const summary = summarizeOperatingBooks(context.salon.id, books, { from: day, to: day, timeZone: before.time_zone });
  const current = summary.balances.find(value => value.sale_id === id);
  const original = { subtotal_cents: subtotal, discount_cents: discount + businessDiscount, business_discount_cents: businessDiscount, platform_code_discount_cents: discount, agreed_total_cents: agreed, protected_deposit_cents: deposit, remaining_balance_cents: balance, deposit_rate: Number(terms!.rate), deposit_rule_version: typeof terms!.version === "string" ? terms!.version : null, deposit_basis: terms!.basis };
  return { ...base, available: true, reason: null, original, current: { available: hasDeposit && hasRefund && !futurePayment && !!current, reason: !hasDeposit || !hasRefund || futurePayment ? "payment_verification_incomplete" : !current ? "outside_current_position" : null,
    received_cents: hasDeposit && hasRefund && !futurePayment ? current?.received_cents ?? null : null, unpaid_cents: hasDeposit && hasRefund && !futurePayment ? current?.unpaid_cents ?? null : null,
    sale_status: sale.status, refund_verified: refundClaim ? hasRefund && stamp(canonical.refund_completed_at) : null } };
}
