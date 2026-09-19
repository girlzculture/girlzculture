# Explicit-phase payment-method review preparation

Status: **PURE PREPARATION / AUTOMATED ONLY**. This helper remains transport-free and always returns `application_ready:false`. A separate migration187/server integration now uses its bounded mapping with real authorization, durable intent and recovery checks; see [scheduled payment acceptance](PAYMENT-SCHEDULE-ACCEPTANCE.md). That integration has local automated evidence only. Neither this helper nor the integration completes real-provider BILL02–04 acceptance.

`src/lib/subscriptionPaymentPhaseReview.ts` prepares a review from a supplied schedule snapshot. Its contract is pinned to `2025-06-30.basil`, using the official [stripe-node v18.3.0 version](https://github.com/stripe/stripe-node/blob/v18.3.0/src/apiVersion.ts), [schedule response types](https://github.com/stripe/stripe-node/blob/v18.3.0/types/SubscriptionSchedules.d.ts), [update types](https://github.com/stripe/stripe-node/blob/v18.3.0/types/SubscriptionSchedulesResource.d.ts) and [tax-rate types](https://github.com/stripe/stripe-node/blob/v18.3.0/types/TaxRates.d.ts).

For recognized, representable inputs, it:

- Validates active status, supplied customer/subscription/mode consistency, sequential phase boundaries, the stated current time and the pinned schema. These are snapshot checks, not fresh authorization or provider verification.
- Serializes current and future phases, preserving recognized prices, quantities, discounts, manual/automatic tax, invoice settings/items, thresholds, trials, anchors, transfers, fees, metadata and transition proration. Other top-level settings stay outside the update payload. Past phases stay unchanged and are not submitted.
- Replaces only non-null explicit payment-method IDs. Inherited nulls remain inherited. Update-time proration is `none`; each phase retains its existing transition policy.
- Returns source, request and expected-state fingerprints, retained source intent, changed paths and inherited-phase indices. The expected normalized schedule differs only at the listed explicit method paths.

Every successful result has **`application_ready: false`** and **`effective_payment_methods_verified: false`**. In particular, an inherited future phase with a null schedule default may still resolve through the subscription/customer to another method. The helper does not claim that all subsequent payments use the target.

Empty phase/item discount arrays require an explicit inheritance/removal choice from retained original request intent, bound to the complete source fingerprint. The GET array alone is insufficient. The helper checks that binding; it does not authenticate the provenance. Unknown fields, incomplete snapshots and unrepresentable forms reject rather than disappear. Unsupported examples include unhandled expanded references, ambiguous discount references, a disabled-tax reason, null one-off item quantity and a trial ending exactly at the phase boundary. This is a bounded mapping, not universal schedule support.

Evidence: `tests/p0-payment-phase-review.test.mjs` passed **13 tests, 0 failures, 0 skips**. Coverage includes rich commercial preservation, inherited/empty/zero semantics, unknown and unsupported fields, mode/association/phase drift, canonical fingerprints and bounded JSON validation. Strict isolated TypeScript and focused ESLint passed. Logs are outside Git at `redesign-evidence/payment-phase-review-{before,after,types,lint}.log`. The original one-test ENOENT demonstrates the previously missing helper, not a deployed runtime regression. Independent source review required the explicit unresolved-inheritance output, now covered by the tests.

The separate integration must supply these controls; the pure helper supplies none of them:

1. Fresh owner authorization and exact target-method/customer/mode association; authoritative subscription and effective-default binding.
2. Durable original intent, frozen request/version/baselines and separate immutable apply/recovery stages integrated with the existing mutation guard.
3. Fresh preflight, a phase-transition margin and authoritative commercial readback under the existing app mutation guard. The former blanket external-single-writer requirement was stronger than the founder's requirement. A local hash/lease remains no provider revision precondition; concurrent external operators need normal coordination.
4. Authorized sandbox acceptance with authoritative schedule/subscription readback, uncertainty/replay recovery, unchanged commercial terms and invoice outcomes, including current-phase one-off items and subsequent phase transitions. Equal configuration alone does not prove no billing side effect.

Original13 tests remain in the broader128-test passing regression. An explicit `allowUnchanged` validation mode supports archival of inherited-only original requests; it never enables writes or changes the always-false readiness flags. No real Stripe acceptance, hosted acceptance, final combined build or required CI pass is claimed by this document.
