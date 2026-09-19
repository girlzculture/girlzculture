# Subscription payment method: frozen implementation and acceptance

Snapshot: 2026-09-19 UTC. This records the current PR #80 implementation; it is not a declaration of live Stripe acceptance. No production migration or provider write was performed for these checks.

## Current behavior

An authenticated business owner can start setup-mode Stripe Checkout for the customer and subscription already linked to that business. Staff cannot start, complete, or cancel the update. The setup session and SetupIntent carry the same attempt, business, and subscription association; completion independently verifies their status, customer, mode, and environment before using the resulting attached card.

The application requests only `subscription.default_payment_method` when applying the card. It does not create a replacement customer/subscription, change prices or agreements, edit schedules, issue an invoice, or request a payment. Fresh provider readback must confirm the effective card before success is returned. The owner sees only brand, last four digits, and expiry. Existing customer-level defaults and unrelated subscriptions are not modified. This follows Stripe's documented [setup-mode Checkout flow for updating subscription payment details](https://docs.stripe.com/payments/checkout/subscriptions/update-payment-details).

`GET /api/stripe/portal` returns the authoritative masked card, actual test/live mode, pending state, and update availability. `POST` supports begin, complete by setup-session ID, and cancel by attempt ID. Cancellation expires an open setup session and rechecks its status; a session already completed is reconciled rather than falsely reported as cancelled. Terminal responses distinguish `updated`, `cancelled`, and `expired`, so an expiry webhook arriving before either browser return cannot be mistaken for pending work. Replaying a terminal outcome performs no provider write.

The current flow rejects ended subscriptions and **all subscriptions with attached schedules**. Scheduled-subscription support remains incomplete; the reason and required work are below.

## Historical failure and provider acceptance

The earlier generic portal failure was an HTTP 400 `resource_missing` / `invalid_request_error` for the `customer` parameter. The founder confirmed that the records were created in a sandbox. Read-only inspection then found the exact stored customer and active subscription in the separate Girlz Culture sandbox account, including matching business metadata. The failed request used the live account, where those sandbox objects do not exist. This is a demonstrated provider-account/environment mismatch, not a missing subscription to recreate. This document deliberately excludes account, customer, subscription, business, and request identifiers.

The new setup flow does not change production credentials or convert sandbox objects into live billing identities. **Real Stripe setup, cancellation, masked readback, and agreement-preservation acceptance remain blocked/unverified until an isolated runtime is securely configured for that sandbox.** The repository currently has no Stripe test secret; production's live key must not be replaced for this check. A protected, explicitly sandbox-only verification path is being prepared using the confirmed existing identities. Local mocked-provider tests do not establish provider behavior. No customer was recreated or relinked as a workaround.

## Recovery and access controls

- One active durable attempt is allowed per business and per subscription; completed/cancelled generations cannot be reset or reused.
- Reservation, claim, and first-apply checks validate the current owner and stored customer/subscription association. The private attempt table is RLS-protected; RPCs use `SECURITY INVOKER` and service-only execution, with narrowly scoped identity-column grants.
- A two-minute database lease coordinates return-page and webhook handlers. A shared 45-second provider deadline bounds the entire operation, including readback.
- Setup creation and application use stable per-attempt idempotency keys. Uncertain delivery preserves the attempt for reconciliation. Stripe documents that keys can be pruned after 24 hours, so application retries fail closed after 23 hours from the durable first-apply timestamp unless read-only inspection already confirms the intended method. See [Stripe idempotency behavior](https://docs.stripe.com/api/idempotent_requests).
- Before the first application, a fresh effective-method comparison rejects a stale setup session if the method changed externally. The bound SetupIntent and target method are immutable.
- Unbound setup creation stops after 29 minutes: the original one-hour expiry must retain Stripe's minimum 30-minute creation window. The application never silently changes an uncertain creation request or starts another generation.
- A payment-method-only subscription webhook does not rewrite commercial plan or publication state from a potentially stale event snapshot. Other existing booking and subscription webhook paths remain separate.

## Verified local evidence

Evidence logs are in the sibling `redesign-evidence` workspace, outside Git. Provider payloads in automated tests are synthetic.

| Check | Result | Evidence |
|---|---|---|
| Billing server/core, Stripe diagnostics, existing paid-waitlist webhook regressions | 40 passed, 0 failed, 0 skipped | `payment-method-node.log` |
| Webhook-first expiry and cancelled return regressions | Both failed before correction; both pass in the 40-test run | `payment-method-terminal-before.log`, `payment-method-node.log` |
| Latest billing migration and rollback assertions under actual `service_role` | PASS in a disposable local PostgreSQL database with minimal identity-table dependencies; not a complete application migration-chain claim | `payment-method-security-database.log` |
| Latest TypeScript and scoped lint | PASS | Local verification at this snapshot |
| Owner browser workflow | 24 passed across Chromium/WebKit; four locales and phone/tablet/desktop/landscape | `payment-terminal-browser-final.log`; 6 unchanged public-policy cases passed separately in `operational-browser-final.log` |
| Fresh checkpoint migration chain and SQL assertions | 173 migrations applied to an empty local database; all assertions passed, with the final two resumed after correcting the disposable database name | `operational-database-173-final.log` and `operational-database-173-tail.log`; later feature migrations were excluded from this frozen checkpoint |
| Real Stripe workflow and unchanged provider agreements | BLOCKED / UNVERIFIED | Requires isolated sandbox runtime configuration and bounded provider acceptance |

The Node suite covers exact method-only request fields, customer/subscription isolation, mode and metadata checks, masking, owner/staff boundaries, cancellation races, concurrent handlers, delivered and undelivered response loss, stale generations, external method changes, expired idempotency windows, setup-creation expiry, shared deadlines, and existing webhook regressions. SQL assertions cover privileges, ownership transfer, association, leases, target immutability, preserved first-apply time, replay/cancellation, and an unchanged synthetic subscription row. SQL assertions roll back their data.

The billing migration is `20260919015517_subscription_payment_method_update_attempts.sql`. Later onboarding migrations are separate work and are not covered by this focused SQL result.

The first browser run exposed a real translation-hydration race: changing the translation callback restarted the return handler, producing duplicate completion requests or clearing the verified notice. A gated catalog/completion regression reproduced the duplicate against the old build. The corrected handler is stable across catalog updates and translates result text at render. Locally generated invalid-return/link errors use an explicit safe error type; arbitrary exceptions remain masked. All24 final cases pass, including delayed catalog hydration before and after completion, cancellation, failed readback/recovery, no duplicate completion, scheduled-plan rejection and untrusted-link rejection. The build and focused UI lint pass; EN/FR/ES/zh-CN each cover2517/2517 inventoried strings. Wolof remains deferred with its gaps visible.

Rendered WebKit English phone and Chromium Spanish desktop payment panels were inspected: masked details and controls are readable, wrap within the card and remain usable. This is component visual evidence, not acceptance of all14 dashboard sections.

The full-schema SQL run initially rejected the synthetic owner fixture because it omitted the canonical email, and later identified a missing Engine migration marker. The fixture now uses valid owners and matching emails, without disabling identity triggers; migration173 advances the existing expected-version setting. The last concurrency guard rejected digits in the disposable database name after the migrations and earlier assertions had passed. The local database was renamed to the approved format and only the two remaining assertions were run. No test assertion was removed or relaxed.

## Attached schedules: concrete remaining limitation

Stripe exposes an optional `default_settings.default_payment_method` update. However, a phase's own payment method overrides that default. Changing explicit phase settings requires supplying every current/future phase and every setting to retain; omitted phase settings can be cleared. Updating an active phase also updates the underlying subscription. See [schedule inheritance and update semantics](https://docs.stripe.com/billing/subscriptions/subscription-schedules) and the [schedule update endpoint](https://docs.stripe.com/api/subscription_schedules/update).

A subscription-only method update therefore cannot guarantee the chosen card remains effective after a scheduled transition. Updating only the schedule default also cannot cover explicit phase overrides. The current rejection prevents a false success claim but does not fulfill the scheduled-subscription requirement.

A bounded future implementation can investigate schedules with no current/future phase override using a default-only schedule update, followed by authoritative schedule and subscription readback. It still needs a durable schedule target and baseline, stable recovery keys, protection against external schedule changes, and a check that all commercial fields remain unchanged. No such schedule update is currently implemented or provider-tested.

For arbitrary schedules with explicit overrides, the documented API requires a complete phase update, not a payment-method-only phase patch. Safely supporting this requires a reviewed lossless mapping of the pinned Stripe API's phase fields, protection against concurrent external edits, durable multi-step recovery, unchanged commercial-field assertions, and real sandbox phase-transition/invoice verification. A local lease or successful readback cannot by itself prevent an external Stripe edit between read and write. Do not bypass this gap by releasing/cancelling the schedule or recreating the subscription.

## Remaining acceptance

Establish the correct account association without creating replacement billing identities. Then, on an explicitly authorized isolated Stripe fixture, verify setup completion, user cancellation, browser return and webhook races, masked fresh readback, unchanged agreement fields, and absence of an application-requested charge/invoice. Scheduled subscriptions additionally need the design and provider checks above. Neither local fixtures nor the blocked real-account lookup establishes these results.

The final review also reproduced webhook-first expiry/cancellation returning a misleading pending state. Server outcomes now explicitly distinguish completed, cancelled and expired. The browser clears each terminal return parameter, reads the unchanged/default method freshly and does not replay the action after reload. All three new browser cases failed before the correction and pass afterward in both engines. The corrected build passed after removing only a malformed generated `.next/dev` validator left by overlapping dev/build checks; no source assertion or TypeScript gate was bypassed.
