import "server-only";

import {
  PLAN_ORDER,
  SUBSCRIPTION_PLANS,
  stripePriceEnv,
  type SubscriptionPlan,
} from "@/lib/plans";
import {
  assertSubscriptionSalesEnabled,
  resolveStripeSubscriptionCatalog,
  type StripePriceSnapshot,
} from "@/lib/subscriptionPriceCore";
import { stripeGet } from "@/lib/stripeServer";

/**
 * Canonical new-sale prices only. Legacy Price variables remain available to
 * webhook/history identity code, but are deliberately never consulted here.
 */
export function verifiedSubscriptionPrice(plan: SubscriptionPlan) {
  assertSubscriptionSalesEnabled(process.env.SUBSCRIPTION_SALES_ENABLED);
  return resolveStripeSubscriptionCatalog({
    entries: PLAN_ORDER.map((catalogPlan) => ({
      key: catalogPlan,
      configuredPriceId: process.env[stripePriceEnv(catalogPlan)],
      expectedAmountCents: SUBSCRIPTION_PLANS[catalogPlan].monthlyAmountCents,
    })),
    retrievePrice: (priceId) =>
      stripeGet<StripePriceSnapshot>(`/prices/${encodeURIComponent(priceId)}`),
  }).then((catalog) => catalog[plan]);
}
