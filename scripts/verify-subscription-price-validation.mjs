import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertSubscriptionSalesEnabled,
  SubscriptionPriceValidationError,
  resolveStripeSubscriptionCatalog,
  resolveStripeSubscriptionPrice,
  validateStripeSubscriptionPrice,
} from "../src/lib/subscriptionPriceCore.ts";

for (const value of [undefined, null, false, "false", "TRUE", "1"]) {
  assert.throws(
    () => assertSubscriptionSalesEnabled(value),
    (error) => {
      assert.ok(error instanceof SubscriptionPriceValidationError);
      assert.equal(error.reason, "SALES_NOT_ENABLED");
      assert.equal(error.status, 503);
      return true;
    },
  );
}
assert.doesNotThrow(() => assertSubscriptionSalesEnabled("true"));

const configuredPriceId = "price_test_starter";
const validPrice = {
  id: configuredPriceId,
  active: true,
  currency: "usd",
  unit_amount: 5900,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1 },
};

function expectValidationFailure(overrides, reason) {
  assert.throws(
    () => validateStripeSubscriptionPrice({
      configuredPriceId,
      expectedAmountCents: 5900,
      price: { ...validPrice, ...overrides },
    }),
    (error) => {
      assert.ok(error instanceof SubscriptionPriceValidationError);
      assert.equal(error.reason, reason);
      assert.equal(error.code, "SUBSCRIPTION_PRICE_CONFIGURATION_INVALID");
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /price_test|5900|secret|token/i);
      return true;
    },
  );
}

let retrievalCount = 0;
await assert.rejects(
  resolveStripeSubscriptionPrice({
    configuredPriceId: "",
    expectedAmountCents: 5900,
    retrievePrice: async () => {
      retrievalCount += 1;
      return validPrice;
    },
  }),
  (error) => {
    assert.ok(error instanceof SubscriptionPriceValidationError);
    assert.equal(error.reason, "MISSING_CONFIGURATION");
    return true;
  },
);
assert.equal(retrievalCount, 0, "A missing Price variable must fail before a provider request");

expectValidationFailure({ active: false }, "INACTIVE_PRICE");
expectValidationFailure({ currency: "cad" }, "WRONG_CURRENCY");
expectValidationFailure({ unit_amount: 5999 }, "WRONG_AMOUNT");
expectValidationFailure({ type: "one_time", recurring: null }, "NON_RECURRING_PRICE");
expectValidationFailure(
  { recurring: { interval: "year", interval_count: 1 } },
  "WRONG_INTERVAL",
);
expectValidationFailure(
  { recurring: { interval: "month", interval_count: 12 } },
  "WRONG_INTERVAL",
);
expectValidationFailure({ id: "price_different" }, "PRICE_ID_MISMATCH");

await assert.rejects(
  resolveStripeSubscriptionPrice({
    configuredPriceId,
    expectedAmountCents: 5900,
    retrievePrice: async () => { throw new Error("raw provider credential response"); },
  }),
  (error) => {
    assert.ok(error instanceof SubscriptionPriceValidationError);
    assert.equal(error.reason, "PROVIDER_LOOKUP_FAILED");
    assert.doesNotMatch(error.message, /credential|raw provider/i);
    return true;
  },
);

const resolved = await resolveStripeSubscriptionPrice({
  configuredPriceId,
  expectedAmountCents: 5900,
  retrievePrice: async (priceId) => {
    retrievalCount += 1;
    assert.equal(priceId, configuredPriceId);
    return validPrice;
  },
});
assert.deepEqual(resolved, {
  priceId: configuredPriceId,
  amountCents: 5900,
  currency: "usd",
  interval: "month",
});

const catalogEntries = [
  { key: "Starter", configuredPriceId: "price_test_starter", expectedAmountCents: 5900 },
  { key: "Growth", configuredPriceId: "price_test_growth", expectedAmountCents: 6900 },
  { key: "Premium", configuredPriceId: "price_test_premium", expectedAmountCents: 8900 },
];
let catalogRetrievals = 0;
await assert.rejects(
  resolveStripeSubscriptionCatalog({
    entries: catalogEntries.map((entry) =>
      entry.key === "Growth" ? { ...entry, configuredPriceId: "" } : entry,
    ),
    retrievePrice: async () => {
      catalogRetrievals += 1;
      return validPrice;
    },
  }),
  (error) => {
    assert.ok(error instanceof SubscriptionPriceValidationError);
    assert.equal(error.reason, "MISSING_CONFIGURATION");
    return true;
  },
);
assert.equal(
  catalogRetrievals,
  0,
  "All three canonical Price variables must be present before any provider read",
);

await assert.rejects(
  resolveStripeSubscriptionCatalog({
    entries: catalogEntries,
    retrievePrice: async (priceId) => {
      const entry = catalogEntries.find((candidate) => candidate.configuredPriceId === priceId);
      assert.ok(entry);
      catalogRetrievals += 1;
      return {
        ...validPrice,
        id: priceId,
        unit_amount:
          entry.key === "Growth"
            ? entry.expectedAmountCents + 1
            : entry.expectedAmountCents,
      };
    },
  }),
  (error) => {
    assert.ok(error instanceof SubscriptionPriceValidationError);
    assert.equal(error.reason, "WRONG_AMOUNT");
    return true;
  },
);

const verifiedCatalog = await resolveStripeSubscriptionCatalog({
  entries: catalogEntries,
  retrievePrice: async (priceId) => {
    const entry = catalogEntries.find((candidate) => candidate.configuredPriceId === priceId);
    assert.ok(entry);
    return { ...validPrice, id: priceId, unit_amount: entry.expectedAmountCents };
  },
});
assert.deepEqual(Object.keys(verifiedCatalog), ["Starter", "Growth", "Premium"]);

const checkout = readFileSync(
  new URL("../src/app/api/stripe/subscription/checkout/route.ts", import.meta.url),
  "utf8",
);
const change = readFileSync(
  new URL("../src/app/api/stripe/subscription/change/route.ts", import.meta.url),
  "utf8",
);
const portal = readFileSync(
  new URL("../src/app/api/stripe/portal/route.ts", import.meta.url),
  "utf8",
);
const serverHelper = readFileSync(
  new URL("../src/lib/subscriptionPriceServer.ts", import.meta.url),
  "utf8",
);
const webhook = readFileSync(
  new URL("../src/app/api/stripe/webhook/route.ts", import.meta.url),
  "utf8",
);
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const setupGuide = readFileSync(
  new URL(
    "../docs/founder-corrections/search-filter-plans/STRIPE_SETUP.md",
    import.meta.url,
  ),
  "utf8",
);

for (const source of [checkout, change]) {
  assert.match(source, /parseOfficialPlan\(cleanText\(body\.plan/);
  assert.match(source, /verifiedSubscriptionPrice\(plan\)/);
  assert.match(source, /capturePlatformError/);
  assert.match(source, /subscription_price_validation_reason/);
  assert.match(source, /safeFailure\(/);
  assert.match(source, /503/);
  assert.doesNotMatch(source, /process\.env\[stripePriceEnv\(plan\)\]/);
  assert.doesNotMatch(source, /normalizePlan\(cleanText\(body\.plan/);
}
assert.doesNotMatch(
  change,
  /parseStoredPlan\(stored\.tier \|\| salon\.subscription_tier\)\s*\|\|\s*["']Starter["']/,
  "An unrecognized current subscription identity must fail closed",
);
assert.match(change, /CURRENT_SUBSCRIPTION_IDENTITY_UNRECOGNIZED/);
assert.match(checkout, /if \(currentError\) throw currentError/);
assert.match(checkout, /SUBSCRIPTION_CHECKOUT_LOCAL_RECONCILIATION_REQUIRED/);
assert.match(checkout, /recordType: "stripe_checkout_session"/);
assert.match(checkout, /reconciliation_required: true/);
assert.match(checkout, /request_id: reference/);
assert.match(checkout, /reserve_subscription_checkout_attempt/);
assert.match(checkout, /subscriptionCustomerIdempotencyKey\(salon\.id\)/);
assert.match(checkout, /subscriptionSessionIdempotencyKey\(attempt\.attempt_id\)/);
assert.match(checkout, /classifySubscriptionCheckoutSession\(/);
assert.match(checkout, /hasStripeCheckoutCreationWindow\(attempt\.expires_at\)/);
assert.match(checkout, /release_completed_subscription_checkout_attempt/);
assert.doesNotMatch(checkout, /reservePromoCode\(/);
for (const responseSource of [checkout, portal]) {
  assert.doesNotMatch(
    responseSource,
    /testMode\s*:\s*true/,
    "Subscription and billing-portal APIs must not claim test mode in a live-key runtime",
  );
}
assert.match(webhook, /eq\("stripe_subscription_id", object\.id\)/);
assert.match(webhook, /if \(byStripeId\.error\) throw byStripeId\.error/);
assert.match(webhook, /STRIPE_SUBSCRIPTION_SALON_IDENTITY_CONFLICT/);
assert.match(webhook, /STRIPE_SUBSCRIPTION_SALON_UNLINKED/);
assert.ok(
  checkout.indexOf("verifiedSubscriptionPrice(plan)") < checkout.indexOf('"/customers"'),
  "Checkout must validate its Price before creating a Stripe customer",
);
assert.ok(
  checkout.indexOf("verifiedSubscriptionPrice(plan)") < checkout.indexOf('"/checkout/sessions"'),
  "Checkout must validate its Price before creating a Stripe session",
);
assert.ok(
  change.indexOf("verifiedSubscriptionPrice(plan)") < change.indexOf('stripeGet<StripeSubscription>(`/subscriptions/'),
  "Plan changes must validate the requested Price before provider plan operations",
);
assert.match(change, /SUBSCRIPTION_PLANS\[plan\]\.monthlyAmountCents/);

assert.match(serverHelper, /process\.env\[stripePriceEnv\(catalogPlan\)\]/);
assert.match(serverHelper, /PLAN_ORDER\.map/);
assert.match(serverHelper, /resolveStripeSubscriptionCatalog/);
assert.match(serverHelper, /assertSubscriptionSalesEnabled\(process\.env\.SUBSCRIPTION_SALES_ENABLED\)/);
assert.match(serverHelper, /stripeGet<StripePriceSnapshot>/);
assert.doesNotMatch(serverHelper, /STRIPE_BASIC_PRICE_ID|STRIPE_GROWTH_PRICE_ID|STRIPE_PREMIUM_PRICE_ID/);

for (const variable of [
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_GROWTH",
  "STRIPE_PRICE_PREMIUM",
]) {
  assert.match(envExample, new RegExp(`^${variable}=price_$`, "m"));
  assert.ok(setupGuide.includes("`" + variable + "`"));
}
assert.match(envExample, /^SUBSCRIPTION_SALES_ENABLED=false$/m);
assert.match(envExample, /Legacy identity only/);
assert.match(setupGuide, /new Starter sales use only `STRIPE_PRICE_STARTER`/);
assert.match(setupGuide, /Price is active and recurring monthly/i);

console.log(
  "Subscription Price validation passed: complete three-Price preflight, sibling missing/mismatch failures, selected-price integrity, route reconciliation guards, and legacy isolation.",
);
