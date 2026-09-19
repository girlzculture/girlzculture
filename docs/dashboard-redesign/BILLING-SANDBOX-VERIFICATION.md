# Billing sandbox verification

The reviewed workflow and scripts are integrated in the working branch. They have not been dispatched or used with a provider credential. No Stripe, production database, Netlify, or production configuration operation was performed. Provider writes remain disabled unless the protected environment explicitly authorizes setup cancellation and confirms review of event routing. These local checks are not live acceptance evidence.

## Files and scope

- `.github/workflows/final-launch-release-candidate-validation.yml`: the existing workflow now accepts an optional protected sandbox mode. Normal PR/push jobs remain unchanged. Explicit sandbox dispatch skips all three normal jobs; empty or `off` manual mode keeps normal behavior. Sandbox runs queue instead of cancelling another sandbox run during cleanup.
- `scripts/billing-sandbox-guards.mjs`: exact commit/repository/manual-event, test credential, account/customer/subscription, fanout and request-body gates.
- `scripts/verify-billing-sandbox.mjs`: real read-only association inspection; optional real setup creation/cancellation using unchanged application billing server/core and actual local PostgreSQL attempt RPCs. The credential is held only in a provider-transport closure. It is never exported as the application's general `STRIPE_SECRET_KEY` or passed to PostgreSQL.
- `scripts/billing-sandbox-local.mjs`: loopback-only adapter. It strips inherited libpq settings and provider credentials before launching `psql`, checks the actual database/address, and calls the real restricted RPCs as `service_role`.
- `scripts/billing-sandbox-guards.test.mjs`: 7 local synthetic guard checks pass. `scripts/billing-sandbox-database.test.mjs`: 5 integration checks pass against a disposable clone of the full 173-migration schema, using a simulated provider. The exact app server/core and real database adapter/RPCs exercise resume, cancellation, response-loss recovery, terminal expiry, ownership transfer and cross-business denial. Another check rejects unapproved databases and proves inherited libpq routing/service settings cannot override loopback. External fetch is disabled throughout these database tests. Missing integration database configuration fails; these tests never silently skip.

The integration check exposed and corrected two adapter defects before any provider use: an empty inherited service name still requested a libpq service definition, and PostgreSQL's address text included a network mask. The adapter now removes inherited `PG*` settings and compares the normalized server host. Logs: sibling `redesign-evidence/billing-sandbox-database-adapter.log` and `billing-sandbox-review/local-guards.log`. Syntax and scoped lint pass. YAML parsing and seven event/mode combinations confirm automatic CI remains enabled, sandbox dispatch skips unrelated jobs, empty/off mode retains normal behavior, and only sandbox runs disable automatic cancellation. The missing-key probe records zero provider calls and zero POSTs. The protected GitHub service and real provider remain unverified.

Modes are `off` at the workflow level, `read-only`, or `setup-cancel`. Every other script mode fails closed. The workflow defaults to `off`.

## Event-routing inspection and current protection

Read-only inspection of the identified sandbox's Workbench on 2026-09-19 found one active webhook endpoint pointing to the production application at `https://girlzculture.com/api/stripe/webhook`. It subscribes to exactly `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.deleted`, and `customer.subscription.updated`. Its nine recent deliveries were marked failed. Delivery response bodies were not inspected, and neither endpoint settings nor delivery state were changed.

A completed payment-method flow can emit subscribed events to this production destination, so full acceptance remains blocked until isolated routing is reviewed. Creating and expiring an uncompleted setup Session does not itself emit those four subscribed event types; the verifier nevertheless retains its conservative relevant-endpoint guard. Failed prior deliveries are not evidence that future events cannot reach production.

The protected `billing-sandbox` environment now requires the repository owner's review and is restricted to the reviewed PR branch. The reviewed non-secret association variables are configured. Both mutation authorization and event-routing review flags remain `false`. The existing sandbox key must be entered directly in the protected environment's secret field. No workflow has been dispatched and no provider operation has been executed by this verifier.

## What the optional setup test would do

1. Check exact reviewed SHA, original repository and manual dispatch; reject missing/live keys. Query the account, existing customer and subscription and require the reviewed identities plus `livemode:false` on the billing objects.
2. Inspect the account's legacy webhook inventory. Reject incomplete inventory and enabled relevant endpoints. The operator must separately attest that account/organization event destinations, EventBridge and CLI forwarding do not send these events to production or other unreviewed consumers. The legacy endpoint API alone does not prove that broader condition.
3. Reject unsupported scheduled/ended subscriptions and existing draft/open invoices. Capture a digest of the entire subscription, customer invoice defaults and invoice/PaymentIntent snapshots. Record this digest in the sanitized artifact before the first provider POST.
4. Use the complete repository schema in a disposable runner-local PostgreSQL service. Insert only a synthetic local owner/business and the reviewed provider IDs. Auth identity triggers stay enabled. No Supabase project or production database is connected.
5. Call the actual `beginSubscriptionPaymentMethod` implementation, creating one setup-mode Checkout Session for the existing customer. Call begin again to prove the same durable attempt resumes. Never visit or export the returned hosted Checkout URL.
6. Call the actual cancellation implementation, expire that exact session, then replay cancellation and verify its terminal response. The transport only allows one session creation and one expiry, with fixed app-generated idempotency keys. Subscription, customer, payment-method, invoice, charge and price mutations are not in its allowlist.
7. Re-read and hash the same billing snapshots; require exact equality. Report only SHA, verdicts, counts, hashes and a synthetic attempt correlation. Upload no raw provider objects, private customer data, URL, card information, trace, screenshot, secret or connection string.

On an uncertain creation response, the run stops; it does not blindly create another session. The synthetic correlation permits protected provider-log/metadata review. On other failures it attempts only expiry of a session created by this run. If expiry cannot be verified, the artifact marks recovery required. Do not rerun blindly. The local database persists during the job only; cross-run provider recovery requires review. The natural one-hour setup expiry remains in effect.

This establishes real setup creation, local durable attempt behavior, cancellation and unchanged provider agreements. It **does not establish successful hosted card entry, saved default selection, signed webhook delivery, authenticated browser return, or full user workflow acceptance**.

## Minimum secure configuration to request once

After code review and integration, create/configure the GitHub environment `billing-sandbox` with required reviewer protection and a branch restriction for the reviewed PR branch. Approve only the exact intended commit. If equivalent review protection is unavailable, do not enable provider mutations.

Add one environment secret, `STRIPE_SANDBOX_SECRET_KEY`, containing an existing usable secret/restricted test key from the already identified sandbox. Reuse that key; no new Stripe account, sandbox, key, subscription or customer is required. Paste it directly into GitHub's secret field, never into chat, source, a command line, artifact, or repository variable. A restricted key must permit the reads and Checkout setup/expiry operations listed above; do not silently broaden a restricted key if access is denied.

Add these reviewed, non-secret environment variables:

| Variable | Value source |
|---|---|
| `BILLING_SANDBOX_ACCOUNT_ID` | The sandbox account already verified read-only |
| `BILLING_SANDBOX_CUSTOMER_ID` | The exact existing stored customer already located in that sandbox |
| `BILLING_SANDBOX_SUBSCRIPTION_ID` | The exact existing stored subscription already located in that sandbox |
| `BILLING_SANDBOX_APPROVED_SHA` | Full reviewed PR commit SHA |
| `BILLING_SANDBOX_AUTHORIZE_SETUP_CANCEL` | `true` only when the bounded setup-and-cancel run above is approved |
| `BILLING_SANDBOX_EVENT_ROUTING_REVIEWED` | `true` only after reviewing all sandbox event destinations/forwarders |

The script checks both GitHub's dispatched SHA and the checked-out commit. The secret exists only on the protected provider step, after dependency installation and local tests. Automatic CI never receives it. A future dispatch starts with `read-only`; `setup-cancel` is a separate explicit mode covered by the reviewed mutation authorization. No dispatch has been performed.

## Full success acceptance: remaining review scope

The exact existing default currently may be a non-card method. The application must retain an honest unavailable masked-card state before replacement rather than invent card details. Completing a setup Session requires actual hosted Checkout interaction; fabricating a completed session/webhook or confirming an unrelated SetupIntent would not exercise this app's flow.

Before adding a full update-and-restore mode, review a real hosted Checkout browser driver (public Stripe test data only), the app completion/readback path, and exact restoration of the original existing default including a null or non-card default. Preserve every other provider agreement field. Persist a recovery record beyond a disposable CI service before authorizing a default mutation; process cancellation after the provider write must not lose the restoration target. Reject changes made by another actor and never restore an old snapshot over a newer external method. Review event delivery against an isolated handler and verify no new invoice, payment or commercial change. Successful card collection can attach a new test method; any cleanup must target only the newly created method after restoration is verified.

Those operations are intentionally unavailable in this bundle. Full billing acceptance and scheduled-subscription support remain incomplete. The existing sandbox key can be reused for the later reviewed phase; a second credential request is unnecessary.

Primary references: [Stripe test environments and test data](https://docs.stripe.com/testing), [setup-mode subscription payment updates](https://docs.stripe.com/payments/checkout/subscriptions/update-payment-details), [Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create), [webhook endpoint inventory](https://docs.stripe.com/api/webhook_endpoints/list).
