export type FinanceRow = Record<string, unknown>;

export type FinancePageResult<T> = {
  data: T[] | null;
  error: unknown;
};

/**
 * A selected salon's ledger is an audit surface, so silently truncating it at
 * the PostgREST row limit is not acceptable. Load deterministic ranges until
 * the provider returns the final partial page.
 */
export async function collectEveryFinancePage<T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<FinancePageResult<T>>,
  pageSize = 1_000,
): Promise<FinancePageResult<T>> {
  const safePageSize = Math.max(1, Math.min(1_000, Math.floor(pageSize)));
  const rows: T[] = [];
  for (let from = 0; ; from += safePageSize) {
    const result = await loadPage(from, from + safePageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data || [];
    rows.push(...page);
    if (page.length < safePageSize) {
      return { data: rows, error: null };
    }
  }
}

export type UnifiedFinanceTransactionType =
  | "Booking deposit"
  | "Product order"
  | "Product refund"
  | "Subscription payment"
  | "Subscription refund"
  | "Plan adjustment"
  | "Billing event";

export type UnifiedFinanceRow = FinanceRow & {
  transaction_key: string;
  transaction_type: UnifiedFinanceTransactionType;
  gross_amount: number;
  refund_amount: number;
};

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
    public_reference: booking.public_reference || booking.confirmation_code,
    confirmation_code: booking.confirmation_code,
    customer: booking.guest_name || "Registered customer",
    transaction_type:
      booking.financial_status ||
      (String(booking.status || "").toLowerCase() === "completed"
        ? "Deposit received"
        : "Booking deposit"),
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
    refund_funding_state:
      booking.refund_funding_state || "Platform-held funds",
    refund_eligibility_status: booking.refund_eligibility_status || "",
    refund_policy_outcome: booking.refund_policy_outcome || "",
    refund_initiated_by: booking.refund_initiated_by || "",
    refund_provider_accepted_at: booking.refund_provider_accepted_at || "",
    refund_completed_at: booking.refund_completed_at || "",
    cancelled_by:
      booking.cancelled_by || booking.cancellation_initiated_by || "",
    cancellation_customer_reason:
      booking.cancellation_customer_reason || booking.cancellation_reason || "",
    stripe_refund_id: booking.stripe_refund_id || "",
    stripe_transfer_id: booking.stripe_transfer_id || "",
    stripe_transfer_reversal_id:
      booking.stripe_transfer_reversal_id || "",
    transfer_status: booking.transfer_status || "Not transferred",
    payout_status: booking.payout_status || "Not configured",
    financial_status: booking.financial_status || "Not recorded",
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

export function classifyBillingTransaction(
  eventType: unknown,
): UnifiedFinanceTransactionType {
  const value = String(eventType || "");
  if (/refund|credit|dispute/i.test(value)) return "Subscription refund";
  if (/subscription|upgrade|renewal|downgrade|invoice/i.test(value)) {
    return "Subscription payment";
  }
  return "Billing event";
}

export function summarizeUnifiedFinanceTransactions(
  rows: UnifiedFinanceRow[],
) {
  return rows.reduce(
    (summary, row) => {
      summary.received += number(row.gross_amount);
      summary.returned += number(row.refund_amount);
      summary.owed += number(row.net_amount_owed_salon);
      summary.processing += number(row.stripe_processing_fee);
      summary.platform += number(row.platform_fee);
      return summary;
    },
    { received: 0, returned: 0, owed: 0, processing: 0, platform: 0 },
  );
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvDate(value: unknown, timeZone: string) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function unifiedFinanceCsv(
  rows: UnifiedFinanceRow[],
  timeZone = "America/New_York",
) {
  const columns: Array<[string, string]> = [
    ["date_local", `Date (${timeZone})`],
    ["date", "Date (UTC)"],
    ["public_reference", "Transaction reference"],
    ["transaction_type", "Transaction type"],
    ["salon", "Salon"],
    ["customer", "Customer"],
    ["service", "Service"],
    ["gross_amount", "Money received"],
    ["refund_amount", "Money returned"],
    ["net_amount_owed_salon", "Net owed salon"],
    ["stripe_processing_fee", "Stripe processing fee"],
    ["platform_fee", "Platform fee"],
    ["payment_status", "Payment status"],
    ["payout_status", "Payout status"],
    ["payment_mode", "Provider mode"],
    ["stripe_reference", "Provider reference"],
    ["stripe_refund_id", "Provider refund reference"],
    ["stripe_transfer_id", "Provider transfer reference"],
  ];
  return [
    columns.map(([, label]) => csvCell(label)).join(","),
    ...rows.map((row) =>
      columns
        .map(([key]) =>
          csvCell(key === "date_local" ? csvDate(row.date, timeZone) : row[key]),
        )
        .join(","),
    ),
  ].join("\r\n");
}

export function financeCsv(
  rows: FinanceRow[],
  timeZone = "America/New_York",
) {
  const columns: Array<[string, string]> = [
    ["date_local", `Date (${timeZone})`],
    ["date", "Date (UTC)"],
    ["public_reference", "Booking reference"],
    ["booking_id", "Internal booking UUID"],
    ["customer", "Customer"],
    ["transaction_type", "Transaction type"],
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
    ["refund_funding_state", "Refund funding state"],
    ["refund_eligibility_status", "Refund eligibility"],
    ["refund_policy_outcome", "Refund policy outcome"],
    ["refund_initiated_by", "Refund issued by"],
    ["cancelled_by", "Cancelled by"],
    ["payout_status", "Payout status"],
    ["transfer_status", "Transfer / reversal"],
    ["financial_status", "Financial status"],
    ["payment_mode", "Stripe mode"],
    ["stripe_reference", "Stripe reference"],
    ["stripe_refund_id", "Stripe refund"],
    ["stripe_transfer_id", "Stripe transfer"],
    ["stripe_transfer_reversal_id", "Stripe transfer reversal"],
  ];
  return [
    columns.map(([, label]) => csvCell(label)).join(","),
    ...rows.map((row) =>
      columns
        .map(([key]) =>
          csvCell(
            key === "date_local"
              ? csvDate(row.date, timeZone)
              : row[key],
          ),
        )
        .join(","),
    ),
  ].join("\r\n");
}
