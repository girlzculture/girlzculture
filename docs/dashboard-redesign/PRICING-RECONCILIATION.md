# New-sale prices and existing agreement preservation

The founder authorized Starter USD89, Growth USD109 and Premium USD129 monthly, with the same catalog for shops and independent professionals. Code now uses those values in the canonical catalog, application selection, checkout preflight and plan-change preflight. Existing entitlement limits are preserved; this slice does not claim the full software-first feature promise is implemented.

## Existing agreements

- Never update existing Stripe Prices, subscriptions, schedules or invoices to deploy this catalog.
- Before changing canonical environment mappings, retain previous Price IDs as legacy identity mappings. Starter now has an explicit read-only `STRIPE_STARTER_PRICE_ID` alongside existing Basic/Growth/Premium legacy mappings.
- A verified subscription can retain its stored tier only when both its provider subscription ID and exact Price ID match the trusted stored record. A new unknown Price cannot borrow a plan name from metadata.
- The new nullable database snapshot records a verified single licensed USD monthly price, quantity1, exact amount and observation time. No backfill from the new-sale catalog. Unsupported or missing prices remain unknown.
- Signed webhook updates and confirmed plan changes write the snapshot. A new pending checkout clears any old snapshot.
- Admin monthly base totals and assistant answers use recorded price facts. These are explicitly before discounts/tax and are not collected revenue. Provider IDs do not enter assistant answers.
- Owner copy distinguishes new-sale prices from existing billing terms.

## Evidence

AUTOMATED ONLY: 26 subscription/operational tests; 10 localization regressions; 170 fresh local migrations plus all assertions; plan catalog, full three-price validation, checkout idempotency, TypeScript, targeted lint and production build.

Browser checks: pricing/public navigation/reporting16 cases passed across Chromium and WebKit, including report mobile/tablet/landscape/desktop. Application consent final28/28 passed, including the three WebKit signup/application/refresh/submission journeys. No paid account or live provider was exercised.

The first WebKit run failed three signup journeys: the registered Auth mock did not receive the request, while the production service worker was registered and the local server returned400. Isolating service workers in this fixture-dependent test restored all three. Actual production service-worker code is unchanged; test assertions are retained and the mock-receipt assertion is additional. [Playwright network limitations](https://playwright.dev/docs/network#missing-network-events-and-service-workers).

CI commit559b29b: required verification35397134733 passed. All three release-candidate browser shards passed; its core job failed the established French Overview wording assertion after the finance dictionary introduced a competing value. That wording is corrected and the original regression passes locally.

## Remaining before production

Securely read actual Stripe products/prices and existing agreements, configure the new Price IDs while retaining all used legacy identities, reconcile the full entitlement promise, verify new-sales and unchanged-old-agreement behavior with approved test accounts, diagnose the existing portal400, and apply the reviewed snapshot migration through the protected process. No production Price, subscription, sales flag, data, configuration or deployment has changed in this slice.
