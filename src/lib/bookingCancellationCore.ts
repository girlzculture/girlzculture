export const CUSTOMER_SAFE_CANCELLATION_REASONS = [
  "Appointment availability changed",
  "Stylist is unavailable",
  "Salon closure or schedule change",
  "Service cannot be completed as scheduled",
  "Customer requested cancellation",
  "Payment could not be completed",
  "Other scheduling issue",
] as const;

export type CancellationActor = "customer" | "salon" | "admin" | "system";

export function safeCancellationReason(
  value: unknown,
  actor: CancellationActor,
) {
  const candidate = String(value || "").trim().slice(0, 120);
  if (
    CUSTOMER_SAFE_CANCELLATION_REASONS.includes(
      candidate as (typeof CUSTOMER_SAFE_CANCELLATION_REASONS)[number],
    )
  ) {
    return candidate;
  }
  return actor === "customer"
    ? "Customer requested cancellation"
    : "Appointment availability changed";
}

export function cancellationActorLabel(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "customer") return "Customer";
  if (normalized === "salon") return "Salon";
  if (normalized === "admin") return "Girlz Culture support";
  return "System";
}

export function refundCustomerSummary(
  status: unknown,
  amount: unknown,
  providerAcceptedAt?: unknown,
) {
  const money = `$${Math.max(0, Number(amount || 0)).toFixed(2)}`;
  switch (String(status || "")) {
    case "Succeeded":
      return `Your ${money} refund has been issued and should become available within five business days, depending on your bank.`;
    case "Partially refunded":
      return `${money} was partially refunded.`;
    case "Pending":
      return providerAcceptedAt
        ? `Stripe accepted a ${money} refund request. Its completion is pending.`
        : `A ${money} refund is pending provider acceptance.`;
    case "Failed":
      return "The refund needs support review. No completion has been promised.";
    case "Disputed":
      return "This payment is under dispute. Support will provide verified updates.";
    default:
      return "No refund was due for this cancellation.";
  }
}

export function providerRefundStatus(status: unknown) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "succeeded") return "Succeeded";
  if (normalized === "failed" || normalized === "canceled") return "Failed";
  return "Pending";
}
