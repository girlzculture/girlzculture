# Assistant service detail read — DATA-01 bounded correction

Status: **AUTOMATED ONLY**. This corrects the existing `get_services_and_prices` read; it adds no tool, route, migration, provider call or write capability. It does not establish complete DATA-01 or hosted assistant acceptance.

## Reproduced failure

`../redesign-evidence/assistant-service-details-before.log` records six actual `readAssistantData` cases: two existing alias/fresh-read behaviors passed and four detail cases failed. The old SELECT omitted generic required `option_groups`, display-price bounds and group/category identities, included items, and assigned material choices. It also supplied no explicit incomplete/selection-required price qualification.

The fixture honors SELECT columns, so unselected values cannot accidentally appear in the result. Canonical checkout reads generic options, enforces required selections, adds their price/duration adjustments, and can add an explicitly selected material assigned to the service. A base price alone cannot establish that booking's final subtotal.

## Implemented contract

- The existing original-name/alias matcher and inventory/search counts remain. Reads are limited to the authenticated business and exclude archived services. Draft status stays explicit; the reader does not claim that a draft is bookable.
- Fresh `styles` permission is required before any source read and again before disclosure. Returned parent rows must match the business. Material rows must reference only the selected own services, and an additional parent read rejects a moved or archived service. A source/count failure remains unavailable, never a synthetic empty inventory.
- Explicit saved fields include description, base/display values, duration/buffer, size/length/add-on choices, required generic groups and adjustments, included items, and category/group/master identities. `category` remains the saved legacy group label; the reader does not invent a top-level category name or fetch another business's catalog.
- Materials use the existing `style_materials.style_id` authority used by the protected service-record route. The allowlist includes name, recorded optional price, bring-your-own flag, quality and longevity fields. Internal metadata, product inventory/cost and customer information are not selected. Having a material choice does not mean that it is required or included.
- `price_completeness` is `selection_required`, `catalog_only` or `incomplete`. `monetary_quote_available` is always false. Display bounds are saved values, not an independently calculated attainable range. No final subtotal, deposit, discount, tax or balance is calculated.
- `choice_evidence` distinguishes complete, unsupported and excerpted configuration. Counts remain explicit or unknown. The reader does not pretend that an unsupported legacy option form, an omitted option or an incomplete material page proves no choices exist.
- Inventory reads are capped at 1,000 candidate services plus 100 direct matches, 100 returned services, 30 choices/groups/materials per returned service, and a bounded material query. Before the model, detailed services are capped at 12 (inventory answers at four). Generic option values are flattened into a separate bounded list so their required flag and price/duration adjustments survive the shared depth limit. Counts and excerpt flags survive that projection.
- Service history refreshes for previous-request-only follow-ups as well as anchored answer transcripts. Changed or revoked facts cannot reuse old private prose as current evidence.

## Verification and remaining gates

The first integration run preserved the four original failure reproductions as fixed, then exposed five older fixture-shape failures (`in`, missing material table and two absent service IDs) and one exact old payload-shape expectation. Those fixtures now model the real queried schema; the original alias, literal search, current price/duration, locale and no-hidden-provider assertions remain. The payload expectation includes the new metadata while retaining the exact named facts.

Final focused verification is recorded in `../redesign-evidence/assistant-service-details-final.log`: **88 passed, 0 failed, 0 skipped** in 94.25 seconds across the new service-detail file and the existing execution/planning files. All **15 new service cases** passed, including actual planner/answer depth preservation, 15 choices exposed as 12 plus an explicit full count/excerpt, permission loss, changed ownership and unavailable material evidence. Full TypeScript and focused ESLint passed in `assistant-service-details-types.log` and `assistant-service-details-lint.log`. Independent source review by the product-read agent found no concrete blocker; this is code-review evidence, not hosted/provider acceptance.

Required CI, the parent-owned production build and hosted authorized assistant behavior remain separate acceptance gates. No real model request, production record read, schema change, payment or message was performed by this slice. Canonical checkout itself was not changed; unsupported legacy choice representations remain explicitly incomplete rather than being silently reinterpreted.
