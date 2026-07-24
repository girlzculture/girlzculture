export type FinanceRow = Record<string, unknown>;

export type FinanceFilters = {
  from: string;
  to: string;
  state: string;
  city: string;
  salon: string;
  paymentStatus: string;
  payoutStatus: string;
  mode: string;
};

export type FinanceSummary = {
  adjustedTotal: number;
  deposits: number;
  refunds: number;
  processingFees: number;
  platformFees: number;
  netOwed: number;
  balanceDue: number;
  completedBookingValue: number;
};

const number = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function bookingTransaction(
  booking: FinanceRow,
  salon?: FinanceRow,
  style?: FinanceRow,
  stylist?: FinanceRow,
) {
  const paid = /paid|succeeded|complete/i.test(
    String(booking.deposit_status || booking.payment_status || ""),
  );
  const deposit = paid ? number(booking.deposit_amount) : 0;
  const processingFee = number(booking.stripe_processing_fee);
  const platformFee = number(booking.platform_fee);
  const subtotal =
    booking.subtotal_before_promotion === null ||
    booking.subtotal_before_promotion === undefined
      ? number(booking.estimated_total) + number(booking.promotion_discount_amount)
      : number(booking.subtotal_before_promotion);
  return {
    date: booking.payment_verified_at || booking.created_at,
    appointment_date: booking.appointment_datetime,
    booking_id: booking.id,
    confirmation_code: booking.confirmation_code,
    customer: booking.guest_name || "Registered customer",
    salon_id: booking.salon_id,
    salon: salon?.name || "Salon unavailable",
    city: salon?.address_city || "",
    state: salon?.address_state || "",
    service: style?.name || "Service unavailable",
    stylist: stylist?.name || "Salon assigned",
    original_service_value: subtotal,
    discount:
      number(booking.promotion_discount_amount) +
      number(booking.discount_amount),
    adjusted_total: number(booking.estimated_total),
    deposit_collected: deposit,
    deposit_percentage: number(booking.deposit_percentage),
    stripe_processing_fee: processingFee,
    platform_fee: platformFee,
    net_amount_owed_salon:
      booking.net_amount_owed_salon === null ||
      booking.net_amount_owed_salon === undefined
        ? Math.max(0, deposit - processingFee - platformFee)
        : number(booking.net_amount_owed_salon),
    balance_due: number(booking.balance_due),
    payment_status: booking.deposit_status || "Not recorded",
    refund_status: booking.refund_status || "Not applicable",
    refund_amount: number(booking.refund_amount),
    payout_status: booking.payout_status || "Not configured",
    booking_status: booking.status || "Unknown",
    stripe_reference:
      booking.stripe_charge_id ||
      booking.stripe_payment_id ||
      booking.stripe_checkout_session_id ||
      "",
    stripe_receipt_url: booking.stripe_receipt_url || "",
    stripe_payout_id: booking.stripe_payout_id || "",
    payment_mode: booking.payment_mode || "test",
  };
}

function dateBoundary(value: string, end = false) {
  if (!value) return end ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}`).getTime();
}

export function filterBookingTransactions(
  rows: FinanceRow[],
  filters: FinanceFilters,
) {
  const start = dateBoundary(filters.from);
  const end = dateBoundary(filters.to, true);
  return rows.filter((row) => {
    const at = new Date(String(row.date || "")).getTime();
    return (
      Number.isFinite(at) &&
      at >= start &&
      at <= end &&
      (filters.state === "all" || row.state === filters.state) &&
      (filters.city === "all" || row.city === filters.city) &&
      (filters.salon === "all" || row.salon_id === filters.salon) &&
      (filters.paymentStatus === "all" ||
        row.payment_status === filters.paymentStatus) &&
      (filters.payoutStatus === "all" ||
        row.payout_status === filters.payoutStatus) &&
      (filters.mode === "all" || row.payment_mode === filters.mode)
    );
  });
}

export function summarizeBookingTransactions(rows: FinanceRow[]) {
  return rows.reduce<FinanceSummary>(
    (summary, row) => {
      summary.adjustedTotal += number(row.adjusted_total);
      summary.deposits += number(row.deposit_collected);
      summary.refunds += number(row.refund_amount);
      summary.processingFees += number(row.stripe_processing_fee);
      summary.platformFees += number(row.platform_fee);
      summary.netOwed += number(row.net_amount_owed_salon);
      summary.balanceDue += number(row.balance_due);
      if (String(row.booking_status).toLowerCase() === "completed") {
        summary.completedBookingValue += number(row.adjusted_total);
      }
      return summary;
    },
    {
      adjustedTotal: 0,
      deposits: 0,
      refunds: 0,
      processingFees: 0,
      platformFees: 0,
      netOwed: 0,
      balanceDue: 0,
      completedBookingValue: 0,
    },
  );
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function financeCsv(rows: FinanceRow[]) {
  const columns: Array<[string, string]> = [
    ["date", "Date"],
    ["booking_id", "Booking ID"],
    ["confirmation_code", "Confirmation"],
    ["customer", "Customer"],
    ["salon", "Salon"],
    ["city", "City"],
    ["state", "State"],
    ["service", "Service"],
    ["stylist", "Stylist"],
    ["original_service_value", "Original value"],
    ["discount", "Discount"],
    ["adjusted_total", "Adjusted total"],
    ["deposit_collected", "Deposit"],
    ["stripe_processing_fee", "Stripe fee"],
    ["platform_fee", "Platform fee"],
    ["net_amount_owed_salon", "Net owed salon"],
    ["balance_due", "Balance due at salon"],
    ["payment_status", "Payment status"],
    ["refund_status", "Refund status"],
    ["payout_status", "Payout status"],
    ["payment_mode", "Stripe mode"],
    ["stripe_reference", "Stripe reference"],
  ];
  return [
    columns.map(([, label]) => csvCell(label)).join(","),
    ...rows.map((row) =>
      columns.map(([key]) => csvCell(row[key])).join(","),
    ),
  ].join("\r\n");
}
