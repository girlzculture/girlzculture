# Assistant promotion read — 19 September 2026

Status: **IMPLEMENTED / AUTOMATED ONLY / NOT RELEASED**. This bounded DATA-01/DATA-02 slice completes the saved-offer read and its model projection. It does not introduce a monetary quote, provider call, schema change, new tool or new activation action.

`assistantPromotionRead.ts` now reads current non-archived promotion conditions, dates and activation flags from the authenticated business. `active_now` reuses `isPromotionActive`; it describes the saved record/date window, not customer eligibility or guaranteed checkout availability. Known conditions retain their saved values; unknown restriction keys and long public-term excerpts are explicitly identified. No saving/deposit/balance is inferred.

Selected service, service-group, master-style, add-on and product names resolve only from this business's permitted catalog. Group/style labels derive from linked own services, matching the existing owner editor. Matching uses the same trimmed lowercase keys as canonical promotion targeting. A foreign or dangling saved target never causes an external lookup or returns its raw identifier. Exact selected counts, unresolved counts, denied/incomplete status and target excerpts are distinct. Catalogs are capped at1000 and the offer list at100, with exact database counts; missing count or failed reads are unavailable, not empty.

The helper checks current promotion/service/product permissions before and after retrieval. Catalog queries occur only with their own current permission. Revocation discards the result. Every queried relation is constrained to the session business, and returned rows are checked again before projection. Planner and answer phases refresh promotion history; changed facts invalidate dependent transcript. Model excerpts explicitly show12 offers rather than retaining the100-row reader count after clipping. Terms/target excerpt metadata survives serialization. Existing USD25 budgets, tool registry and financial behavior are unchanged.

## Evidence

- **Original read failure:** `../redesign-evidence/assistant-promotions-before-assertions.log`:7 failures and1 existing permission-denial pass through actual `readAssistantData`. The strict fixture projects only selected database columns, exposing the lost restrictions/targets/activation fields. The preceding log is retained; only the test's handling of an undefined value was clarified so failures are direct assertions.
- **Original model failure:** `assistant-promotions-planner-before.log`:2 failures through actual planner/answer code, proving missing current promotion refresh and incorrect shown-count metadata after bounded serialization.
- **Independent-review corrections:** `assistant-promotions-normalization-before.log` and `assistant-promotions-terms-before.log` preserve one failing case each before canonical case/whitespace matching and explicit long-terms excerpt disclosure were corrected.
- **Final focused checks:85/85 PASS, zero failed/skipped,91.4seconds**, recorded in `assistant-promotions-final-node.log`. These comprise13 new read/security cases,2 new planner cases and70 existing planning/execution regressions. They cover two businesses, foreign targets, staff catalog denial, mid-read revocation, actual database column projection, time windows, all target kinds, exact/excerpt counts, failed/missing evidence and no fabricated quote. The initial11 read passes remain in `assistant-promotions-after.log`.
- **Static checks:** full TypeScript and scoped ESLint passed (`assistant-promotions-final-types.log`, `assistant-promotions-final-lint.log`); diff whitespace checks pass.
- **Independent source review:** `reconciliation_review` found no remaining concrete blocker after the two corrections. This is source/test review, not hosted/provider acceptance.

No browser/build server, customer message, production write, provider request, commit or deployment was performed for this slice. Browser chat rendering is unchanged. Parent coordinates the final shared build, required automatic CI and hosted assistant acceptance.

## Remaining DATA-01 monetary scope

An exact monetary answer still needs a full canonical context: required service variants/materials, selected add-ons, customer-specific eligibility and the verified applicable own-business deposit rule. Existing booking answers must use the original saved promotion/deposit terms. The current list explicitly reports `monetary_quote_available:false`; it must not manufacture a quote from a headline percentage or catalog base price. That remaining calculation contract is tracked separately from this completed read/projection correction.
