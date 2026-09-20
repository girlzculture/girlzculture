import { parseStoredPlan, type StoredSubscriptionPlan } from '@/lib/plans';

export type SubscriptionPriceItem = {
  quantity?: number;
  price?: { id?: string; unit_amount?: number | null; currency?: string; recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null };
};

/** A price mapping may change for new sales. An existing agreement can keep its
 * identity only when both the provider subscription and exact Price match its
 * trusted stored record. Metadata/plan names alone never authorize a new price. */
export function existingAgreementPlan(input: {
  subscriptionId?: string; priceId?: string; configuredPlan: StoredSubscriptionPlan | null;
  stored?: { stripe_subscription_id?: unknown; price_id?: unknown; tier?: unknown } | null;
}) {
  if (input.configuredPlan) return input.configuredPlan;
  if (!input.subscriptionId || !input.priceId || input.stored?.stripe_subscription_id !== input.subscriptionId || input.stored.price_id !== input.priceId) return null;
  return parseStoredPlan(input.stored.tier);
}

/** Persist only provider price facts, without payment details or today's catalog.
 * Unknown, metered, multi-item or non-monthly agreements remain unpriced here. */
export function subscriptionPriceSnapshot(items: SubscriptionPriceItem[] | undefined, observedAt: string) {
  if (items?.length !== 1) return null;
  const { price, quantity } = items[0];
  if (!price?.id || !Number.isSafeInteger(price.unit_amount) || price.unit_amount! < 0 || price.unit_amount! > 100_000_000 || quantity !== 1
    || price.currency !== 'usd' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed' || !Number.isFinite(Date.parse(observedAt))) return null;
  return { price_id: price.id, amount_cents: price.unit_amount!, currency: 'usd', interval: 'month', interval_count: 1, quantity: 1, observed_at: observedAt };
}

export function recordedSubscriptionMonthlyAmount(record: Record<string, unknown>): number | null {
  const snapshot = record.recurring_price_snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const value = snapshot as Record<string, unknown>;
  if (!record.price_id || value.price_id !== record.price_id || value.currency !== 'usd' || value.interval !== 'month' || value.interval_count !== 1 || value.quantity !== 1
    || !Number.isSafeInteger(value.amount_cents) || Number(value.amount_cents) < 0 || Number(value.amount_cents) > 100_000_000 || !Number.isFinite(Date.parse(String(value.observed_at || '')))) return null;
  return Number(value.amount_cents) / 100;
}
