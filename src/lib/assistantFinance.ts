import { isBusinessAdded } from "@/lib/ownerBusinessMetrics";
type Row = Record<string, unknown>;
const normalized = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[ _-]/g, "");
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const reference = (value: unknown, prefix: string) => typeof value === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value);
function sum(rows: Row[], field: string) {
  const values = rows.map(row => typeof row[field] === "number" || (typeof row[field] === "string" && row[field].trim()) ? Number(row[field]) : NaN);
  return values.every(value => Number.isFinite(value) && value >= 0) ? Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100 : null;
}

/** These are current ledger facts for an appointment cohort, not cash flow by
 * payment date. Only aggregates leave this boundary; provider/customer IDs do
 * not. A Connect transfer is not proof of a later bank payout. */
export function assistantFinanceEvidence(bookings: Row[]) {
  const marketplace = bookings.filter(row => !isBusinessAdded(row));
  function group(mode: "live" | "test" | "unknown") {
    const rows = marketplace.filter(row => (row.payment_mode === "live" || row.payment_mode === "test" ? row.payment_mode : "unknown") === mode);
    const verified = rows.filter(row => timestamp(row.payment_verified_at) && reference(row.stripe_charge_id, "ch") && ["paid", "succeeded", "refunded", "refundpending", "partiallyrefunded"].includes(normalized(row.deposit_status)));
    const refunded = rows.filter(row => normalized(row.refund_status) === "succeeded" && timestamp(row.refund_completed_at) && reference(row.stripe_refund_id, "re"));
    const pending = rows.filter(row => ["pending", "requested", "processing"].includes(normalized(row.refund_status)));
    const knownRefunds = new Set([...refunded, ...pending]);
    const unverifiedRefunds = rows.filter(row => !knownRefunds.has(row) && !["", "none", "notapplicable", "notrequired", "failed", "cancelled", "canceled"].includes(normalized(row.refund_status)));
    return {
      appointments: rows.length,
      verified_deposit_records: verified.length,
      unverified_deposit_records: rows.length - verified.length,
      recorded_verified_deposits: sum(verified, "deposit_amount"),
      processing_fees: sum(verified, "stripe_processing_fee"),
      platform_fees: sum(verified, "platform_fee"),
      recorded_net_owed: sum(verified, "net_amount_owed_salon"),
      completed_refunds: sum(refunded, "refund_amount"),
      pending_refund_records: pending.length,
      unverified_refund_records: unverifiedRefunds.length,
      confirmed_connect_transfers: rows.filter(row => reference(row.stripe_transfer_id, "tr") && ["transferred", "transferredtosalon"].includes(normalized(row.transfer_status))).length,
      bank_settled_amount: null,
      net_revenue: null,
    };
  }
  return { scope: "current_ledger_for_appointments_in_range", currency: "USD", live: group("live"), test: group("test"), unknown: group("unknown"), payment_date_cash_flow: null, bank_settlement_verified: false };
}
