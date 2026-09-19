# Authoritative assistant money reads — DATA-02

Status: **AUTOMATED ONLY**. This slice implements two bounded reads; it does not establish hosted assistant, real checkout, provider, migration-to-production or deployment acceptance. Both $25 caps remain unchanged. No customer charges, promotion reservations, notifications or production data changes were performed.

## Implemented behavior

- `calculate_service_selection` accepts one own-business service and explicit saved choice/material/offer identifiers. It accepts no price, subtotal, customer identity, incident history or business identifier. Current Services + My Page permissions are required, plus Promotions for a selected offer.
- `bookingServiceSelection.ts` is shared with canonical checkout. Valid price fallback, final-subtotal rounding, generic-option duration adjustments and optional assigned-material behavior remain shared. Unknown size/length/add-on values and duplicate add-ons (including value/label aliases) now reject before reservation/payment. Missing required groups remain explicit clarification facts.
- Deposit and promotion arithmetic reuse `bookingDepositTerms`, `calculateSalonPromotion` and `protectedBookingDiscount`. $100 eligible price / $10 protected deposit / 20% offer yields $20 saving, $80 agreed total and $70 original remaining balance. Savings cannot consume the protected deposit. Required/optional choices are included before deposit calculation.
- Customer-dependent deposit protection or offer eligibility returns the authoritative selected subtotal and unavailable dependent amounts. The business operator is never substituted for a booking customer; no customer history lookup is made. Usage-limited offers remain explicitly unreserved arithmetic subject to checkout validation.
- `get_booking_price_details` accepts only an exact own-business booking identifier. Fresh bookings + client-history grants and canonical finance scope are required. Original saved subtotal, discounts, agreed total, deposit and remaining balance never consult current menu/offer/rule values.
- Current recorded payment position is separate from original terms. It uses the canonical finance transform and balance calculation. Unverified deposit/refund evidence yields unavailable current payment amounts; refunds do not reopen discharged debt. Missing/inconsistent immutable snapshots and test-payment records are not presented as verified terms. A missing deposit rate is never coerced to zero; explicit valid zero remains supported.
- Business ownership/membership and assigned-professional scope are checked before/after source reads. Foreign returned records and changed readback fail closed. Both tools freshly reauthorize previous-request facts before planning and answering. Only their exact server-generated `as_of` field is excluded from semantic comparison; meaningful changed prices still invalidate old prose.
- Model projections contain bounded line excerpts and exact counts, integer-cent final amounts, calculation basis and limitations. Customer contacts, provider identifiers and raw finance books are excluded. Deterministic fallback summaries cover EN/FR/ES/zh-CN and distinguish original terms from unavailable current payments.
- Migration186 only appends these two risk-1 tools to the existing audit CHECK and advances the expected migration marker. No permission grants, finance schema, payment behavior or new authorization privileges are added.

## Evidence

All logs are retained in `../redesign-evidence/` outside Git:

| Check | Evidence | Result |
| --- | --- | --- |
| Actual checkout unknown/duplicate choice failure before correction | `assistant-price-selection-before.log` | Two regression tests failed: both inputs reached successful simulated checkout instead of rejection. |
| Existing/new checkout behavior after shared extraction | `assistant-price-checkout-after.log` | 8/8 passed, including existing protected-deposit, code, zero-deposit and waitlist behaviors. |
| New direct reads, planner/answer, presentation, schema and canonical promotion/deposit regressions | `assistant-money-focused.log` | 36/36 passed, zero skipped. DB/model/provider transport is simulated; actual repository calculations/dispatcher/projection execute. |
| Null original-rate review finding before/after | `assistant-money-null-rate-before.log`, `assistant-money-null-rate-after.log` | Failure reproduced, then null/invalid/out-of-range evidence rejected. No historical monetary terms are rewritten. |
| Full selected checkout snapshot, valid saved zero rate, changed-price prose invalidation | `assistant-money-final-edges.log` | 3/3 passed. |
| Append-only audit registration with actual PostgreSQL service role | `assistant-money-sql.log` | PASS: both tools persist risk-1 audit reads; fresh read replay works; foreign-business/revoked-primary-grant audit attempts reject; anonymous/authenticated write privileges remain absent. |
| Integrated new reads + existing planning/execution/balances/profile/settings/reschedule regressions | `assistant-money-integrated.log` | 122/122 passed, zero failed/skipped, 192.77s. The three later final-edge checks have separate passing evidence above. |
| Scoped lint | `assistant-money-lint-final.log` | PASS. |

SQL was applied on the existing local database `girlzculture_onboarding_instagram_184`, whose verified sequence is183→184→185→186 despite its historical name. This is incremental local-chain evidence, not a clean-from-zero or production migration claim. Secondary read permissions and staff assignment are enforced by the tested backend readers, not claimed to be independently validated by the generic SQL audit-registration function.

The compilation boundary before the shared targeted build passed full TypeScript (`assistant-money-types-boundary.log`). The later final TypeScript attempt reported only concurrent billing-module errors, with no money-read errors; root must capture the final combined-source pass after those fixes. No full-source pass is inferred from the boundary build.

Independent source review found the missing-rate coercion; it was reproduced and corrected. The final guard and remaining tenancy, selected-price, immutable-term and fresh-history paths were reviewed with no remaining identified blocker. This review is not a real-model or provider acceptance test.

## Remaining acceptance

The root release process must complete the final combined-source TypeScript/build/required gates, full clean-database chain, controlled hosted owner/authorized-staff/two-business assistant questions and follow-ups, and checkout acceptance through the existing protected workflow. No real payment is authorized by this document. The two read tools do not promise customer-specific eligibility without authoritative context, reserve an offer/slot, calculate product/tax/provider charges, or become a general quoting system. Existing booking terms remain immutable.
