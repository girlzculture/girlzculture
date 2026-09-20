export type StripeIdentity = string | { id?: string } | null | undefined;
export const stripeIdentity = (value: StripeIdentity) => typeof value === "string" ? value : value?.id || null;
export type PaymentMethod = {
  id?: string; customer?: StripeIdentity; type?: string; livemode?: boolean;
  card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
};
export type SubscriptionBillingIdentity = {
  id?: string; customer?: StripeIdentity; livemode?: boolean; status?: string;
  schedule?: StripeIdentity; default_payment_method?: string | PaymentMethod | null;
  default_source?: string | { id?: string; object?: string; brand?: string; last4?: string; exp_month?: number; exp_year?: number } | null;
};

export function maskedPaymentMethod(method: PaymentMethod | null | undefined) {
  if (!method) return null;
  const card = method.card;
  if (method.type !== "card" || !card || !/^\d{4}$/.test(card.last4 || "")) return null;
  return {
    type: "card" as const,
    brand: /^[a-z_]{2,30}$/.test(card.brand || "") ? card.brand! : "card",
    last4: card.last4!,
    expMonth: Number.isInteger(card.exp_month) && card.exp_month! >= 1 && card.exp_month! <= 12 ? card.exp_month! : null,
    expYear: Number.isInteger(card.exp_year) && card.exp_year! >= 2000 && card.exp_year! <= 9999 ? card.exp_year! : null,
  };
}

export function assertPaymentMethodAssociation(subscription: SubscriptionBillingIdentity, customerId: string, subscriptionId: string) {
  if (subscription.id !== subscriptionId || stripeIdentity(subscription.customer) !== customerId || typeof subscription.livemode !== "boolean") {
    throw new Error("PAYMENT_METHOD_SUBSCRIPTION_IDENTITY_CONFLICT");
  }
}

export function assertPaymentMethodSetup(input: {
  session: { id?: string; mode?: string; status?: string; customer?: StripeIdentity; livemode?: boolean; metadata?: Record<string,string>; setup_intent?: StripeIdentity; subscription?: StripeIdentity; payment_intent?: StripeIdentity };
  setup: { id?: string; status?: string; customer?: StripeIdentity; livemode?: boolean; metadata?: Record<string,string>; payment_method?: StripeIdentity };
  method: PaymentMethod;
  attempt: { id: string; salon_id: string; stripe_customer_id: string; stripe_subscription_id: string; stripe_checkout_session_id: string | null; livemode: boolean };
}) {
  const { session, setup, method, attempt } = input;
  const identities = [session.metadata,setup.metadata];
  if (session.id !== attempt.stripe_checkout_session_id || session.mode !== "setup" || session.status !== "complete"
    || session.subscription || session.payment_intent || setup.status !== "succeeded"
    || stripeIdentity(session.setup_intent) !== setup.id || stripeIdentity(setup.payment_method) !== method.id
    || method.type !== "card" || !maskedPaymentMethod(method)
    || [session,setup,method].some((object) => stripeIdentity(object.customer) !== attempt.stripe_customer_id || object.livemode !== attempt.livemode)
    || identities.some((metadata) => metadata?.type !== "subscription_payment_method" || metadata.attempt_id !== attempt.id
      || metadata.salon_id !== attempt.salon_id || metadata.subscription_id !== attempt.stripe_subscription_id)) {
    throw new Error("PAYMENT_METHOD_SETUP_IDENTITY_CONFLICT");
  }
}
