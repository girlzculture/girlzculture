# Assistant product operations — 19 September 2026

Status: **AUTOMATED ONLY**. This is a bounded DATA-01 read improvement in the existing `get_products` tool. It has not been accepted in a hosted authenticated assistant session or deployed by this work. No new API, migration, tool, provider request, product/order mutation or spending-cap change was introduced.

The original reader returned catalog and stock facts but omitted saved fulfillment settings and all order/pickup records. The permanent regression calls the actual `readAssistantData`, using two businesses and a products-only staff member. Its first run was **1 pass / 7 failures**, retained in `../redesign-evidence/assistant-products-before.log`. A separate actual planner/answer test initially failed because a follow-up did not refresh saved order facts (`assistant-products-planner-before.log`).

## Implemented boundary

- Catalog rows include saved pickup availability/preparation time, shipping availability and in-person-only settings. These are recorded configuration, not a promise of checkout eligibility or available stock.
- The order read uses the existing product-order API's `products` permission, checked freshly before source access and again before returning the result. It selects only this business's order IDs, public references, fulfillment/reservation/payment statuses, recorded payment mode and lifecycle dates. Customer identities, contacts, addresses, tracking, internal notes, payment amounts and provider identifiers are not selected.
- Item queries use only the selected own-order IDs. Returned parent IDs are checked. A non-null product reference must resolve in this business's catalog, including archived products; a deleted product may retain its own saved item name/quantity.
- Order total is the exact **all-time** own-business count, independent of the catalog name query. Reads expose at most the newest 100 orders, with exact shown count and excerpt flags. The 1,000-item cap and 12-item-per-order projection preserve an unknown item total if the complete item collection was not read. Failed/missing counts are unavailable, never a verified zero.
- The model sees at most 12 order rows and explicit matching shown/excerpt metadata. Item name/quantity strings survive the existing depth bound. Test orders remain labelled by mode; recorded payment status is not asserted as settled money. The link opens the real Products order section; no fulfillment action is performed.
- Planning and answer phases re-read product history, discarding stale facts and derived transcript before model access. No customer-contact or finance grant is silently added to the products permission.

Source: `src/lib/assistantProductOperations.ts`, the product branch of `ownerReadServer.ts`, and the product purpose/projection/history handling in `gcAssistantPlannerProtocol.ts` / `gcAssistantPlanningServer.ts`.

## Verification

| Check | Result and evidence |
| --- | --- |
| Actual read, two-business isolation, forbidden source fields, products-only staff, revoked grants before/after retrieval, foreign product references, deleted-product snapshot, exact zero/counts, caps and malformed dates | **PASS**, 13 new cases in `tests/p0-assistant-products.test.mjs` |
| Existing operational assistant checks plus all 13 new cases | **PASS**, 34/34, `assistant-products-operational-final.log` |
| Actual planning and answer follow-up refresh; 103 total / 12 shown; item facts retained; stale private prose excluded | **PASS**, 1 case exercising both phases, `assistant-products-planner-final.log` |
| Scoped ESLint / full TypeScript | **PASS**, `assistant-products-final-lint.log` / `assistant-products-final-types.log` |
| Independent source review | **PASS**, reconciliation reviewer checked permissions, source allowlists, parent scoping, bounds and freshness; no concrete blocker found |
| Hosted role/assistant acceptance and deployment | **Not established by this slice**; remains release work |

The initial combined operational run was 32/34 because two older strict fixtures had no `product_orders` table. Its original evidence remains in `assistant-products-operational-node.log`. The correction adds an explicit empty-order fixture; it does not remove the unexpected-table assertion or weaken existing checks. No unchanged suite rerun or real provider call was used as a substitute for this evidence.

Remaining scope: this tool does not calculate order revenue, customer balances, shipment tracking, checkout eligibility or financial quotes, and does not send messages or mark orders fulfilled. Existing specialized financial and order workflows retain those responsibilities.
