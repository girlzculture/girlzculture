# Stripe setup for Starter, Growth, and Premium

This is the founder/operator runbook for the new-subscription catalog. It never
requires a secret or Price ID to be pasted into source control, chat, a ticket,
or a public log.

## Code-side contract

| Plan | Required recurring monthly Price | Canonical server variable |
| --- | ---: | --- |
| Starter | $59 USD (`5900` cents) | `STRIPE_PRICE_STARTER` |
| Growth | $69 USD (`6900` cents) | `STRIPE_PRICE_GROWTH` |
| Premium | $89 USD (`8900` cents) | `STRIPE_PRICE_PREMIUM` |

Each configured Stripe Price must satisfy all of these conditions:

- its returned ID exactly equals the configured ID;
- `active` is true;
- currency is USD;
- amount is exactly 5900, 6900, or 8900 cents for the matching plan;
- type is recurring;
- recurring interval is `month`;
- interval count is `1`.

`SUBSCRIPTION_SALES_ENABLED` is a server-only fail-closed gate and defaults to
`false`. Unless it is exactly `true`, the app refuses every new subscription
Checkout and plan change.

Before any Checkout acceptance, the reviewed non-production database must have
executed all repository migrations through
`20260901130000_complete_search_suggestion_coverage.sql`, and the Engine
`integrations.expected_migration` value must equal `20260901130000`. Verify this
through the protected migration workflow; do not mark a migration as applied,
repair history, or apply it to production from this runbook.

## 1. Create test-mode products and Prices

1. Open the Stripe Dashboard and turn on **Test mode**.
2. Create a product named **Girlz Culture Starter**. Add one recurring Price:
   USD $59.00 every month.
3. Create **Girlz Culture Growth** with USD $69.00 every month.
4. Create **Girlz Culture Premium** with USD $89.00 every month.
5. Ensure each Price is active and recurring monthly with interval count 1.
6. Copy each non-secret `price_...` identifier directly from Stripe into the
   matching environment-variable field described below. Do not send the
   identifiers through chat and do not put them in a `NEXT_PUBLIC_*` variable.

Do not archive, edit, or reuse an existing Price that can belong to a current
subscription. Stripe Price amounts are immutable; create the separate approved
Prices instead.

## 2. Configure a non-production runtime

Configure these as server-side variables in the intended Netlify Deploy Preview
or branch context and Functions scope:

```text
STRIPE_PRICE_STARTER=<Starter test Price ID>
STRIPE_PRICE_GROWTH=<Growth test Price ID>
STRIPE_PRICE_PREMIUM=<Premium test Price ID>
SUBSCRIPTION_SALES_ENABLED=false
```

The runtime also needs its existing test-mode Stripe secret and webhook
configuration, entered directly through the provider's secure environment UI.
Never expose those secrets here. Redeploy only the reviewed non-production
context after changing its variables.

For local development, use `.env.local` (gitignored), never `.env.example` or a
committed file. Keep the variables server-only.

## 3. Verify the fail-closed boundary first

With `SUBSCRIPTION_SALES_ENABLED=false`:

1. Sign in as an approved synthetic salon owner in non-production.
2. Attempt a new subscription checkout.
3. Confirm the UI says subscription billing is temporarily unavailable.
4. Confirm no Stripe Customer, Checkout Session, subscription, or charge was
   created.
5. Confirm the user-visible reference matches the protected Engine event and
   that no credential/Price value appears in the response or event.

This proves the public plans/application can be reviewed without selling an
incomplete plan.

## 4. Verify test mode before enabling a test sale

After the three test Prices and all materially promised paid benefits are
approved in the non-production readiness review:

1. Temporarily set `SUBSCRIPTION_SALES_ENABLED=true` in that non-production
   context only and redeploy it.
2. Run the focused validation tests. They must prove rejection for:
   - missing Price variable;
   - provider lookup failure;
   - inactive Price;
   - wrong ID;
   - wrong currency;
   - wrong amount;
   - one-time Price;
   - yearly, multi-month, or otherwise wrong interval.
3. For each valid plan, start Checkout and inspect the Stripe-hosted page. It
   must show the matching name, USD amount, and monthly cadence.
4. Cancel the first session and confirm no subscription is active.
5. Complete a test-card Checkout for a disposable test salon. Confirm webhook
   processing records the same plan and Price identity and unlocks only the
   appropriate entitlements.
6. Test a plan-change preview and verify the renewal amount is derived from the
   validated canonical Price, not browser input.
7. Return the gate to `false` when testing ends unless that non-production
   context is intentionally retained for continued acceptance.

The code retrieves and validates all three canonical Stripe Prices **before**
reserving a subscription promotion, creating a Stripe customer, creating
Checkout, or previewing/applying a plan change. A missing or mismatched sibling
plan therefore blocks every new sale/change with sanitized HTTP 503 output and
a protected Engine reference. It never falls back to an older or differently
priced Price.

## 5. Verify Checkout retry and idempotency in test mode

This item is **BLOCKED** until the reviewed non-production Stripe test-mode
runtime, canonical Prices, webhook, and sales gate are configured. Local source
checks, the 100-call in-memory provider double, and the disposable database race
are necessary evidence but are not authenticated Stripe connectivity.

Using one disposable approved salon owner in that runtime:

1. Start repeated and concurrent Checkout requests for the same salon, plan,
   and optional promotion. Do not send provider identifiers from the browser.
2. Confirm the database retains one active durable Checkout attempt and at most
   one pending promotion reservation for it.
3. Confirm Customer creation uses the stable per-salon idempotency identity and
   Session creation uses the stable per-durable-attempt identity. Inspect only
   provider object counts/statuses; never print either key or any secret.
4. Retry while the linked Session remains open. The server must inspect and
   reuse that Session rather than create another.
5. Repeat against completed, expired, and intentionally identity-mismatched
   linked test Sessions. Each state must reconcile safely to the durable attempt
   without creating an unrelated active attempt or duplicate charge.
6. Complete one test-card Session and confirm the webhook updates the same
   attempt before releasing/finalizing its promotion reservation.
7. Confirm there is no duplicate Customer, Checkout Session, subscription, or
   charge and that every safe user-visible reference correlates to the same
   protected Engine/attempt record.

The clean PostgreSQL workflow separately releases eight database sessions
against the same salon/plan/promotion reservation and requires all eight to
return the same attempt/redemption pair with final counts `1,1`. Do not replace
that database check with the provider test or the in-memory model.

## 6. Confirm mismatched amounts are refused

Use a non-production Stripe test Price with an intentionally wrong amount, or
the injected provider snapshot in the focused automated verifier. Put its ID in
only the matching non-production variable, keep all secrets out of output, and
attempt the selected plan.

Expected result:

- no Checkout Session or plan mutation;
- safe temporarily-unavailable response;
- protected reason `WRONG_AMOUNT` associated with the Engine event;
- no raw provider payload, Price ID, token, cookie, or personal data in logs.

Restore the correct test Price through the provider environment UI and redeploy
the non-production context. Never perform this negative test against live mode.

## 7. Legacy Basic continuity

These old variables can remain temporarily for identification of historical
subscriptions and webhook records:

```text
STRIPE_BASIC_PRICE_ID
STRIPE_GROWTH_PRICE_ID
STRIPE_PREMIUM_PRICE_ID
```

They are not authoritative for new sales. In particular:

- new Starter sales use only `STRIPE_PRICE_STARTER`;
- new Starter checkout reads only `STRIPE_PRICE_STARTER`;
- an existing active/trialing Basic subscription is not moved to $59
  automatically;
- existing customer/subscription IDs, quantities, Price IDs, billing periods,
  invoices, and audit records remain unchanged;
- webhook reconciliation can retain/display `Basic (legacy)` while that Price
  is still referenced.

Before removing a legacy variable, run an approved aggregate-only audit to
confirm no existing subscription or webhook history still needs it. The
founder must decide whether active Basic subscriptions are grandfathered or
offered an explicit migration; this code does not silently decide for them.

## 8. Live-mode readiness (do not perform from this PR)

The founder/operator remains responsible for all production provider actions:

1. Complete legal/pricing approval and the paid-benefit readiness review.
2. Create three separate live-mode products/Prices with the exact same active,
   recurring USD/month×1 contract and amounts.
3. Confirm the production webhook signing configuration and production Stripe
   secret already follow the platform security runbook.
4. Enter the live Price IDs directly into the matching production Netlify
   variables and Functions scope. Do not copy test IDs into production.
5. Redeploy through the protected production release process.
6. Run a read-only price validation/connectivity check first.
7. Perform an explicitly authorized, documented low-risk live acceptance only
   after the returned Price attributes are independently verified.
8. Set `SUBSCRIPTION_SALES_ENABLED=true` only after every readiness gate passes.

This correction does not create Stripe products/Prices, change Netlify
variables, issue a charge, move an active subscription, deploy production, or
change booking deposits/Connect/payout behavior.

## Materially unavailable benefits

The approved catalog includes advanced reminder/reporting, waitlist,
rebooking, Google Business Profile assistance, and advertising benefits. Where
the operational system is not yet complete, the entitlement remains catalogued
but must not be marketed as active or exposed through decorative controls.
Advertising discount/credit/early access requires separate advertising
inventory and entitlement records; subscription tier alone never boosts
organic search or homepage placement.

Keep subscription sales disabled until the readiness owner confirms each paid
promise can be fulfilled.

## Rollback and emergency stop

- Immediate safe stop: set `SUBSCRIPTION_SALES_ENABLED=false` in the affected
  deploy context and redeploy through the approved release process.
- Do not delete legacy variables or modify existing subscriptions as an
  emergency response.
- Correct a bad new Price by creating/configuring the proper Price; do not edit
  active subscription history.
- Application rollback is a normal commit revert. Database changes must be
  rolled forward with a reviewed forward-only, data-preserving migration, not
  destructive SQL.
- Provider/configuration incidents must use sanitized Engine references; never
  include secrets, Price IDs, full provider payloads, or customer billing data.
