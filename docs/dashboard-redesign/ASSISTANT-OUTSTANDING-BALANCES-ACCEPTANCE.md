# Assistant recorded unpaid balances

Status: **implemented and locally automated; not deployed or live-provider verified.** This bounded SF-VOICE read answers “Who owes me money?” from the existing own-business operating books. It does not infer overdue debt, send collection messages or initiate payment.

## Implementation and boundaries

`get_outstanding_balances` calls the existing canonical `readBusinessFinances` transform. Current bookings, client_history and finance access are required together. Owner identity, active membership, professional assignment and finance scope are freshly checked before and after the read. Foreign or malformed business records fail closed. Assigned staff receive only their currently assigned professional’s records, even if their broader finance grant can read the whole business. Old requests and previousRequestIds-only follow-ups run this read again before any facts reach planning or answer generation.

The result projects only a bounded record identifier, optional client display name, service, recorded amounts, status and exact own-business Finances link. It separates completed recorded balances from pending/future agreed amounts; gives the business-time as-of day; includes older unpaid sales; and caps each list at12 while preserving full authorized counts/totals. Refunds do not reopen discharged debt. Unverified deposit, product-payment or refund evidence makes the answer unavailable with null totals and empty lists, rather than claiming an unpaid amount or zero.

The assistant card uses explicit English, French, Spanish and Simplified Chinese dictionaries and preserves names/numbers. Exact-record links open the existing Sales and balances view and retain the requested cumulative balance through refresh. There is no new ledger, provider request, permission, background action or AI-cap change.

Migration179 only appends this read tool to the existing assistant audit CHECK constraint and advances the expected migration marker. Every177 tool remains registered; there are no new tables, routines or grants.

## Evidence

- `assistant-unpaid-scope-before.log`:missing-tool baseline2 pass/9 fail. Independent `tests/p0-assistant-unpaid-scope.test.mjs` exercises the real dispatcher, helper, canonical finance transform and planner; only database/model transport is simulated.
- `assistant-balances-final.log`:20/20 passed,0 skipped.13 independent security cases cover two businesses/actors, direct requests and follow-ups, each permission loss, mid-read revocation, reassignment and current-scope replacement.7 core cases cover cumulative older records, exact totals/links/list caps, anonymous and future sales, refund semantics, each of the3 unverified-evidence counters, complete registration-set preservation and four-locale key/placeholder parity.
- `assistant-balances-types.log`:TypeScript passed after explicit nullable-row guards. Root independently confirmed full lint and TypeScript passed before the final build.
- Root reported local179 applied to a disposable clone of the verified178 baseline and `scripts/sql/verify-assistant-outstanding-balances.sql` passed. The verifier checks tool registration and preservation of service-only audit execution/writes. This is incremental local SQL proof, not production migration evidence.
- `tests/browser/p0-assistant-balances.spec.ts`:the final shared production-build run in `combined-179-focused-browser.log` passed10 of12 Chromium/WebKit cases. Both Spanish cases reached the correct older record and amount, then failed because the test reused the assistant currency formatter for the existing FinanceRecords formatter ($75.00 versus75,00 US$). Only that expected display format was corrected; both cases then passed in `combined-179-fixture-corrections.log`, giving12/12 composite passes without rerunning the10 unchanged successes. The10 passes cover EN/FR/Simplified Chinese facts and exact-record navigation/refresh plus unavailable-evidence and list-cap cases. Four viewport captures were inspected: phone/tablet cards and docked desktop are readable; the landscape dialog scrolls and its record link is reachable. This is scripted API-contract evidence, not live-provider evidence.

## Remaining acceptance

Complete final required CI and clean-chain migration verification. Apply genuinely pending reviewed migrations through the protected release process. On the final held candidate, perform one bounded approved test-business read and follow-up, compare the answer with its canonical finance records, and keep real-provider interpretation evidence separate from deterministic security and math tests. No customer notifications or charges are needed. Wolof remains deferred.
