export const SUBSCRIPTION_CHECKOUT_EXPIRY_MINUTES = 65;
export const STRIPE_CHECKOUT_MINIMUM_CREATION_WINDOW_SECONDS = 30 * 60;

export function hasStripeCheckoutCreationWindow(
  expiresAt: string | number | Date,
  nowMs = Date.now(),
) {
  const expiryMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiryMs) &&
    expiryMs - nowMs >= STRIPE_CHECKOUT_MINIMUM_CREATION_WINDOW_SECONDS * 1_000;
}

export function subscriptionCustomerIdempotencyKey(salonId: string) {
  return `gc-subscription-customer:${salonId}`;
}

export function subscriptionSessionIdempotencyKey(attemptId: string) {
  return `gc-subscription-checkout:${attemptId}`;
}

export type SubscriptionCheckoutSessionSnapshot = {
  status?: string | null;
  url?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SubscriptionCheckoutSessionState =
  | "open"
  | "complete"
  | "expired"
  | "identity_mismatch"
  | "invalid";

export function classifySubscriptionCheckoutSession(
  session: SubscriptionCheckoutSessionSnapshot,
  expectedSalonId: string,
  expectedPlan: string,
): SubscriptionCheckoutSessionState {
  const metadataSalonId = String(session.metadata?.salon_id || "").trim();
  const metadataPlan = String(session.metadata?.plan || "").trim();
  if (
    String(session.client_reference_id || "").trim() !== expectedSalonId ||
    metadataSalonId !== expectedSalonId ||
    metadataPlan !== expectedPlan
  ) {
    return "identity_mismatch";
  }
  const status = String(session.status || "").trim().toLowerCase();
  if (status === "open" && String(session.url || "").trim()) return "open";
  if (status === "complete") return "complete";
  if (status === "expired") return "expired";
  return "invalid";
}
