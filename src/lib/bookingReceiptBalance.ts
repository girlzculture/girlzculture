type Row = Record<string, unknown>;

/** Keep the immutable agreed balance intact; display a separate receipt readback. */
export function bookingBalanceAmount(row: Row): unknown {
  return typeof row.recorded_balance_cents === "number" ? row.recorded_balance_cents / 100 : row.balance_due;
}
export function bookingBalanceStatus(row: Row): string {
  if (typeof row.recorded_balance_cents === "number") {
    if (/cancelled|canceled/i.test(String(row.status))) return "Cancelled";
    if (/no[ -]?show/i.test(String(row.status))) return "No Show";
    return row.recorded_balance_cents === 0 ? "Paid" : "Due after service";
  }
  return String(row.balance_status || "Not recorded");
}

/** Only summaries for rows already authorized by the workspace can be attached.
 * Amounts are integer cents read from the tenant's canonical receipt ledger. */
export function attachBookingReceiptBalances(salonId: string, bookings: Row[], summaries: Row[]) {
  const allowed = new Map(bookings.map(row => [row.id, row]));
  const seen = new Set<unknown>();
  for (const summary of summaries) {
    const booking = allowed.get(summary.id);
    if (!booking || booking.salon_id !== salonId || booking.is_demo !== true || summary.salon_id !== salonId || seen.has(summary.id)) throw Error("BOOKING_RECEIPT_SCOPE_INVALID");
    const amount = summary.remaining_cents;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw Error("BOOKING_RECEIPT_AMOUNT_INVALID");
    seen.add(summary.id);
    booking.recorded_balance_cents = amount;
  }
  // Never silently substitute the original balance when a required readback is missing.
  if (bookings.some(row => row.is_demo === true && row.payment_mode === "test" && row.booking_origin !== "business_added" && !seen.has(row.id))) throw Error("BOOKING_RECEIPT_READBACK_INCOMPLETE");
}
