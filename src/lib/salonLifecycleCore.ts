export type SubscriptionCheckoutSalon = {
  status?: unknown;
  approved_at?: unknown;
};

const BLOCKED_SUBSCRIPTION_STATES = new Set([
  "new",
  "pending",
  "suspended",
  "offboarded",
  "closed",
  "rejected",
]);

export function salonCanStartSubscriptionCheckout(
  salon: SubscriptionCheckoutSalon,
  applicationStatus?: unknown,
) {
  const status = String(salon.status || "").trim().toLowerCase();
  const application = String(applicationStatus || "").trim().toLowerCase();
  const approved =
    Boolean(String(salon.approved_at || "").trim()) ||
    application === "approved" ||
    application === "active";
  return approved && !BLOCKED_SUBSCRIPTION_STATES.has(status);
}

export function subscriptionCheckoutBlockMessage(
  salon: SubscriptionCheckoutSalon,
  applicationStatus?: unknown,
) {
  const status = String(salon.status || "").trim().toLowerCase();
  if (status === "suspended") {
    return "This salon is currently suspended. Contact Girlz Culture support before changing billing.";
  }
  if (status === "offboarded" || status === "closed") {
    return "This salon is closed and cannot start a new subscription.";
  }
  if (!salonCanStartSubscriptionCheckout(salon, applicationStatus)) {
    return "Your salon application must be approved before you can choose and pay for a subscription.";
  }
  return "";
}
