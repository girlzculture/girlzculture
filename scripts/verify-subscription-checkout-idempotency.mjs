import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifySubscriptionCheckoutSession,
  hasStripeCheckoutCreationWindow,
  STRIPE_CHECKOUT_MINIMUM_CREATION_WINDOW_SECONDS,
  SUBSCRIPTION_CHECKOUT_EXPIRY_MINUTES,
  subscriptionCustomerIdempotencyKey,
  subscriptionSessionIdempotencyKey,
} from "../src/lib/subscriptionCheckoutCore.ts";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const salonId = "3a7a92f8-d6e6-47e0-9fcb-b76102d67362";
const otherSalonId = "f141ab19-35bb-448c-b4f9-c5ea628e125a";
const attemptId = "8a580410-f9ae-449d-a323-5d1ad7bb301f";
const otherAttemptId = "c26bc340-595c-4539-bc86-81208c622703";

assert.equal(
  subscriptionCustomerIdempotencyKey(salonId),
  subscriptionCustomerIdempotencyKey(salonId),
);
assert.notEqual(
  subscriptionCustomerIdempotencyKey(salonId),
  subscriptionCustomerIdempotencyKey(otherSalonId),
);
const fixedNow = Date.parse("2026-09-01T12:00:00.000Z");
assert.equal(
  hasStripeCheckoutCreationWindow(
    fixedNow + STRIPE_CHECKOUT_MINIMUM_CREATION_WINDOW_SECONDS * 1_000,
    fixedNow,
  ),
  true,
  "Stripe's exact 30-minute minimum creation window remains valid",
);
assert.equal(
  hasStripeCheckoutCreationWindow(
    fixedNow + STRIPE_CHECKOUT_MINIMUM_CREATION_WINDOW_SECONDS * 1_000 - 1,
    fixedNow,
  ),
  false,
  "A sub-30-minute creation window must fail before a provider call",
);
assert.equal(hasStripeCheckoutCreationWindow("invalid", fixedNow), false);
assert.equal(
  subscriptionSessionIdempotencyKey(attemptId),
  subscriptionSessionIdempotencyKey(attemptId),
);
assert.notEqual(
  subscriptionSessionIdempotencyKey(attemptId),
  subscriptionSessionIdempotencyKey(otherAttemptId),
);

const identity = {
  client_reference_id: salonId,
  metadata: { salon_id: salonId, plan: "Growth" },
};
assert.equal(
  classifySubscriptionCheckoutSession(
    { ...identity, status: "open", url: "https://checkout.example/session" },
    salonId,
    "Growth",
  ),
  "open",
);
assert.equal(
  classifySubscriptionCheckoutSession(
    { ...identity, status: "complete" },
    salonId,
    "Growth",
  ),
  "complete",
);
assert.equal(
  classifySubscriptionCheckoutSession(
    { ...identity, status: "expired" },
    salonId,
    "Growth",
  ),
  "expired",
);
assert.equal(
  classifySubscriptionCheckoutSession(
    { ...identity, status: "open", url: null },
    salonId,
    "Growth",
  ),
  "invalid",
);
assert.equal(
  classifySubscriptionCheckoutSession(
    {
      ...identity,
      status: "open",
      url: "https://checkout.example/session",
      metadata: { salon_id: otherSalonId, plan: "Growth" },
    },
    salonId,
    "Growth",
  ),
  "identity_mismatch",
);

// This in-memory provider double models Stripe's idempotency contract. The
// concurrency assertion protects the stable-key derivation independent of a
// live provider account and makes duplicate creation regressions visible.
const providerObjects = new Map();
let providerCreates = 0;
async function idempotentProviderCreate(kind, key) {
  await Promise.resolve();
  const storageKey = `${kind}:${key}`;
  if (!providerObjects.has(storageKey)) {
    providerCreates += 1;
    providerObjects.set(storageKey, `${kind}_${providerCreates}`);
  }
  return providerObjects.get(storageKey);
}
const results = await Promise.all(
  Array.from({ length: 100 }, async () => {
    const customer = await idempotentProviderCreate(
      "customer",
      subscriptionCustomerIdempotencyKey(salonId),
    );
    const session = await idempotentProviderCreate(
      "session",
      subscriptionSessionIdempotencyKey(attemptId),
    );
    return { customer, session };
  }),
);
assert.equal(new Set(results.map((result) => result.customer)).size, 1);
assert.equal(new Set(results.map((result) => result.session)).size, 1);
assert.equal(providerCreates, 2, "100 same-salon calls create one customer and one session");

const route = read("src/app/api/stripe/subscription/checkout/route.ts");
const migration = read(
  "supabase/migrations/20260901120000_subscription_checkout_idempotency.sql",
);
const webhook = read("src/app/api/stripe/webhook/route.ts");
const cleanDatabaseRunner = read("scripts/verify-clean-database.mjs");
const cleanDatabaseAssertions = read("scripts/sql/verify-clean-database.sql");

for (const rpc of [
  "reserve_subscription_checkout_attempt",
  "link_subscription_checkout_attempt",
  "expire_subscription_checkout_attempt",
  "release_completed_subscription_checkout_attempt",
]) {
  assert.ok(route.includes(`"${rpc}"`), `Checkout route must call ${rpc}`);
}
for (const rpc of [
  "reserve_subscription_checkout_attempt",
  "link_subscription_checkout_attempt",
  "expire_subscription_checkout_attempt",
  "complete_subscription_checkout_attempt",
  "release_completed_subscription_checkout_attempt",
]) {
  assert.ok(migration.includes(`function public.${rpc}`), `Migration must define ${rpc}`);
}
assert.match(
  route,
  /idempotencyKey:\s*subscriptionCustomerIdempotencyKey\(salon\.id\)/,
  "Customer creation must carry its stable per-salon Stripe idempotency key",
);
assert.match(
  route,
  /subscriptionSessionIdempotencyKey\(attempt\.attempt_id\)/,
  "Session creation must carry its stable durable-attempt Stripe idempotency key",
);
assert.match(route, /classifySubscriptionCheckoutSession\(/);
assert.match(route, /SUBSCRIPTION_CHECKOUT_SESSION_IDENTITY_MISMATCH/);
assert.match(route, /SUBSCRIPTION_CHECKOUT_REQUEST_CONFLICT/);
assert.match(route, /SUBSCRIPTION_CHECKOUT_ATTEMPT_EXPIRING/);
assert.match(route, /hasStripeCheckoutCreationWindow\(attempt\.expires_at\)/);
assert.match(route, /release_completed_subscription_checkout_attempt/);
assert.match(route, /expires_at: expiresAt/);
assert.match(route, /metadata\[checkout_attempt_id\]/);
assert.match(route, /reconciliation_required: true/);
assert.doesNotMatch(route, /reservePromoCode\(/);
assert.doesNotMatch(route, /crypto\.randomUUID\(\)/);

assert.match(migration, /unique \(salon_id\)/i);
assert.match(migration, /stripe_checkout_session_id text unique/i);
assert.ok(
  migration.includes(`interval '${SUBSCRIPTION_CHECKOUT_EXPIRY_MINUTES} minutes'`),
  "Database attempt expiry must match the route's audited checkout window",
);
assert.match(migration, /pg_advisory_xact_lock\(/i);
assert.match(migration, /for update;/i);
assert.match(migration, /provider_reconciliation_required', true/i);
assert.match(migration, /status in \('session_created','completed'\)/i);
assert.match(
  migration,
  /pg_advisory_xact_lock\([\s\S]*?reserve_promo_code\(/i,
  "Promotion inventory must be reserved only after the per-salon lock",
);
assert.match(migration, /status = 'pending'[\s\S]*stripe_checkout_session_id is null/i);
assert.match(migration, /revoke all on public\.subscription_checkout_attempts[\s\S]*authenticated/i);
assert.match(migration, /grant execute on function public\.reserve_subscription_checkout_attempt[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /to authenticated\s*;/i);
assert.match(webhook, /complete_subscription_checkout_attempt/);
assert.match(webhook, /expire_subscription_checkout_attempt/);
assert.ok(
  webhook.indexOf("await syncSubscription(subscription)") <
    webhook.indexOf('"complete_subscription_checkout_attempt"'),
  "Webhook must persist the subscription before finalizing its checkout attempt",
);
assert.match(cleanDatabaseRunner, /runConcurrentSubscriptionCheckoutWorkers/);
assert.match(cleanDatabaseRunner, /one durable subscription attempt and one promotion reservation/i);
assert.match(cleanDatabaseAssertions, /Completed checkout was replaced before subscription reconciliation/);
assert.match(cleanDatabaseAssertions, /Canceled subscription did not release its completed checkout/);

console.log(
  "Subscription checkout idempotency verification passed: stable provider keys, 100-call concurrency model, serialized attempt/promo reservation, provider-state reconciliation, service-role boundary, and durable local linking.",
);
