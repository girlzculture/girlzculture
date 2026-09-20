import { assertOperatingBooksScope, moneyCents, type OperatingBooks, type OperatingSale } from "@/lib/businessFinanceCore";

type Row = Record<string, unknown>;
export type BusinessFinanceData = {
  scope: { kind: "business" | "own"; stylist_id: string | null };
  sales: Row[]; bookings: Row[]; receipts: Row[]; expenses: Row[];
  arrangements: Row[]; obligations: Row[]; compensation_payments: Row[]; stylists: Row[];
  product_orders?: Row[]; product_refunds?: Row[];
};
const stamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const numberCents = (value: unknown) => moneyCents(String(value ?? "0"));
const normalized = (value: unknown) => String(value ?? "").toLowerCase().replace(/[ _-]/g, "");
const source = (value: unknown): OperatingSale["source"] => ({ walkin: "walk_in", phone: "phone", social: "social", instagram: "social", whatsapp: "social" } as const)[normalized(value) as "walkin"] || "other";

/** Accepts only the protected RPC projection, never public search data. Validate
 * every returned row before transforming, including tables omitted from totals. */
export function operatingBooksFromData(salonId: string, data: BusinessFinanceData) {
  for (const [key, rows] of Object.entries(data)) {
    if (key === "scope") continue;
    if (!Array.isArray(rows)) throw Error("FINANCE_INVALID_RECORD");
    for (const row of rows) {
      if (!row || row.salon_id !== salonId) throw Error("FINANCE_ACCESS_DENIED");
      if (data.scope.kind === "own" && ["sales", "bookings", "arrangements", "obligations", "compensation_payments"].includes(key) && row.stylist_id !== data.scope.stylist_id) throw Error("FINANCE_ACCESS_DENIED");
      if (data.scope.kind === "own" && key === "stylists" && row.id !== data.scope.stylist_id) throw Error("FINANCE_ACCESS_DENIED");
      if (data.scope.kind === "own" && key === "expenses") throw Error("FINANCE_ACCESS_DENIED");
      if (data.scope.kind === "own" && ["product_orders", "product_refunds"].includes(key)) throw Error("FINANCE_ACCESS_DENIED");
    }
  }
  if (!["business", "own"].includes(data.scope.kind) || data.scope.kind === "own" && !data.scope.stylist_id) throw Error("FINANCE_ACCESS_DENIED");
  const books: OperatingBooks = {
    sales: data.sales.map(row => ({ ...row, id: `sale:${row.id}`, client_id: null })) as OperatingSale[],
    payments: [], expenses: data.expenses as OperatingBooks["expenses"],
    obligations: data.obligations as OperatingBooks["obligations"], compensation_payments: data.compensation_payments as OperatingBooks["compensation_payments"],
  };
  const excludedTestBookings = new Set<string>();
  let unverifiedDeposits = 0, unverifiedRefunds = 0;
  for (const booking of data.bookings) {
    if (booking.payment_mode === "test") { excludedTestBookings.add(String(booking.id)); continue; }
    const manual = booking.booking_origin === "business_added";
    if (booking.estimated_total === null || booking.estimated_total === undefined || booking.estimated_total === "") throw Error("FINANCE_INCOMPLETE_RECORDS");
    const agreed = numberCents(booking.estimated_total);
    const original = Math.max(agreed, numberCents(booking.subtotal_before_promotion ?? booking.estimated_total));
    const id = `booking:${booking.id}`;
    books.sales.push({
      id, salon_id: salonId, source: manual ? source(booking.source) : "platform", kind: "service",
      occurred_at: String(booking.service_completed_at || booking.appointment_datetime), recorded_at: String(booking.created_at),
      status: normalized(booking.status) === "completed" ? "completed" : ["cancelled", "canceled", "noshow"].includes(normalized(booking.status)) ? "cancelled" : "pending",
      name: String(booking.name || "Service"), stylist_id: booking.stylist_id ? String(booking.stylist_id) : null,
      client_id: booking.customer_id ? String(booking.customer_id) : null, client_name: booking.guest_name ? String(booking.guest_name) : null,
      list_cents: original, discount_cents: original - agreed, agreed_cents: agreed, cost_cents: null, quantity: 1,
      compensation: booking.operating_compensation as OperatingSale["compensation"],
    });
    const verified = !manual && booking.payment_mode === "live" && stamp(booking.payment_verified_at) && booking.verified_charge === true && ["paid", "succeeded", "refunded", "partiallyrefunded", "refundpending"].includes(normalized(booking.deposit_status));
    if (verified && numberCents(booking.deposit_amount) > 0) {
      books.payments.push({ id: `deposit:${booking.id}`, salon_id: salonId, sale_id: id, occurred_at: String(booking.payment_verified_at), stage: "deposit", method: "card", amount_cents: numberCents(booking.deposit_amount), original_payment_id: null });
      if (normalized(booking.refund_status) === "succeeded" && stamp(booking.refund_completed_at) && booking.verified_refund === true && numberCents(booking.refund_amount) > 0) {
        books.payments.push({ id: `refund:${booking.id}`, salon_id: salonId, sale_id: id, occurred_at: String(booking.refund_completed_at), stage: "refund", method: "card", amount_cents: numberCents(booking.refund_amount), original_payment_id: `deposit:${booking.id}` });
      } else if (numberCents(booking.refund_amount) > 0) unverifiedRefunds++;
    } else if (numberCents(booking.deposit_amount) > 0) unverifiedDeposits++;
  }
  const excludedTestOrders = new Set<string>();
  let unverifiedOrders = 0;
  for (const order of data.product_orders || []) {
    if (order.payment_mode === "test") { excludedTestOrders.add(String(order.id)); continue; }
    if (String(order.currency).toLowerCase() !== "usd") throw Error("FINANCE_UNSUPPORTED_CURRENCY");
    const id = `order:${order.id}`;
    const total = numberCents(order.total_amount), tax = numberCents(order.tax_amount), shipping = numberCents(order.shipping_amount);
    const list = numberCents(order.subtotal), discount = numberCents(order.discount_amount);
    if (list - discount + tax + shipping !== total) throw Error("FINANCE_INVALID_RECORD");
    const status = normalized(order.reservation_status || order.fulfillment_status);
    // A refund after delivery retains the completed sale and reverses receipts.
    const completed = stamp(order.fulfilled_at) || ["collected", "delivered"].includes(status);
    const items = Array.isArray(order.items) ? order.items as Row[] : [];
    books.sales.push({ id, salon_id: salonId, source: "platform", kind: "product", occurred_at: String(order.fulfilled_at || order.created_at), recorded_at: String(order.created_at),
      status: completed ? "completed" : ["cancelled","canceled","expired","notcollected","refunded"].includes(status) ? "cancelled" : "pending",
      name: items.map(item => `${String(item.product_name)} × ${Number(item.quantity)}`).join(", ") || String(order.public_reference),
      stylist_id: null, client_id: order.customer_id ? String(order.customer_id) : null, client_name: order.guest_name ? String(order.guest_name) : null,
      list_cents: list, discount_cents: discount, agreed_cents: list-discount, tax_cents: tax, shipping_cents: shipping, cost_cents: null,
      quantity: items.reduce((sum,item) => sum + Number(item.quantity), 0) || 1, compensation: { kind:"none",version:null } });
    const verified = order.payment_mode === "live" && order.verified_charge === true && stamp(order.paid_at) && ["paid","depositpaid","partiallyrefunded","refunded","refundpending","disputed"].includes(normalized(order.payment_status));
    const paid = order.reservation_status ? numberCents(order.deposit_amount) : total;
    if (verified && paid > 0) {
      books.payments.push({id:`order-payment:${order.id}`,salon_id:salonId,sale_id:id,occurred_at:String(order.paid_at),stage:order.reservation_status?"deposit":"full",method:"card",amount_cents:paid,original_payment_id:null});
    } else if (paid > 0) unverifiedOrders++;
  }
  for (const refund of data.product_refunds || []) {
    if (excludedTestOrders.has(String(refund.order_id))) continue;
    const original = books.payments.find(payment => payment.id === `order-payment:${refund.order_id}`);
    if (!original || normalized(refund.status) !== "succeeded" || refund.verified_refund !== true || !stamp(refund.completed_at)) { unverifiedRefunds++; continue; }
    books.payments.push({id:`order-refund:${refund.id}`,salon_id:salonId,sale_id:original.sale_id,occurred_at:String(refund.completed_at),stage:"refund",method:"card",amount_cents:numberCents(refund.amount),original_payment_id:original.id});
  }
  for (const receipt of data.receipts) {
    if (receipt.product_order_id && excludedTestOrders.has(String(receipt.product_order_id))) continue;
    if (receipt.booking_id && excludedTestBookings.has(String(receipt.booking_id))) continue;
    books.payments.push({
      id: `receipt:${receipt.id}`, salon_id: salonId,
      sale_id: receipt.sale_id ? `sale:${receipt.sale_id}` : receipt.product_order_id ? `order:${receipt.product_order_id}` : `booking:${receipt.booking_id}`,
      occurred_at: String(receipt.occurred_at), stage: receipt.stage as OperatingBooks["payments"][number]["stage"], method: receipt.method as OperatingBooks["payments"][number]["method"],
      amount_cents: Number(receipt.amount_cents), original_payment_id: receipt.original_payment_id ? `receipt:${receipt.original_payment_id}` : null,
    });
  }
  assertOperatingBooksScope(salonId, books);
  return { books, evidence: { excluded_test_bookings: excludedTestBookings.size, excluded_test_orders: excludedTestOrders.size, unverified_deposit_records: unverifiedDeposits, unverified_product_payments: unverifiedOrders, unverified_refund_records: unverifiedRefunds, online_product_orders_included: true, provider_bank_settlement_verified: false } };
}
