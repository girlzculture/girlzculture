# Product pickup status wording — 19 September2026

Status: **AUTOMATED ONLY;8/8 affected pickup cases pass on local production build194.** The correction distinguishes goods collection from payment receipt. It adds no payment, notification, API, database or production action.

## Demonstrated defect and correction

The saved build192 French/Spanish/Chinese `product-pickup-collected.png` images under sibling `redesign-evidence/combined-192-orders-results` displayed `Encaissé`, `Cobrado` and `已收款` (money received) while the same order retained a $70 unpaid balance. Reserved also remained English. The original images and10/10 prior two-engine order results are retained; those passes did not establish correct pickup-specific wording.

`SalonProductOrders.tsx` now maps the existing pickup status enums to explicit goods labels for Reserved for pickup / Ready for pickup / Picked up / Not picked up. The four languages use the already-registered `business-products-source-catalog.ts`. Successful pickup acknowledgement uses the same contextual label and original public reference, translated at render time; already-localized content is protected from the generic second translation pass. Provider warnings and error/reference strings remain untouched. Raw API enums, action order, shipping, amounts, payment status and handlers are unchanged.

The four existing `Business products populated pickup preserves details through failure recovery and collection` cases now assert independent exact locale labels and success sentences, absence of the incorrect finance wording, original failed-save/reference and explicit retry/refresh/reload behavior, and the unchanged raw `Collected` request. They explicitly retain $70 remaining and `Deposit paid`: collecting goods does not record the remaining payment.

## Recorded checks

- `pickup-status-localization-types-final.log`: full TypeScript exit0; `pickup-status-localization-lint-final.log`: focused ESLint exit0. Independent source/test review passes, including the structured pickup success notice. No locale helper/allowlist or assertion was weakened.
- `combined-194-browser.log`: **8/8 pickup cases pass**, four locale/viewport cases in each of Chromium and WebKit, including the products-permitted staff fixture. The full mixed-feature run is42 passed /8 promotion failures in3.3 minutes; it is not a passing whole-run or release result.
- Build194 passes with identical837-file source digest `3b2e71fc92faceea8a6ce4ba39f51424d029581b627f89daff25855afca3e7ab`, in `combined-194-build.log` and `combined-194-source-{before,after}.json`. The subsequent compiled change is limited to three promotion option-value attributes; pickup source is unchanged. Shipping was not rerun because its behavior/source is unchanged; its retained two-engine build192 evidence is documented in `PRODUCTS-COMPACT-ACCEPTANCE.md`.

## Actual AFTER screenshot review

The following three saved WebKit collected-state viewports were directly inspected:

| View | Evidence | Visible result |
| --- | --- | --- |
| French768×1000 | [Collected](../../../redesign-evidence/combined-194-browser-results/business-products-Business-fd835-covery-and-collection-in-fr-webkit/product-pickup-collected.png) | `Retiré par le client`; $80 total, $10 deposit, $70 balance and24 September2026 at14:30 retained. |
| Spanish1440×1000 | [Collected](../../../redesign-evidence/combined-194-browser-results/business-products-Business-907c8-covery-and-collection-in-es-webkit/product-pickup-collected.png) | `Recogido por el cliente`; same money/reference/deadline with translated labels; docked assistant does not overlap the order. |
| Chinese844×390, permitted staff | [Collected](../../../redesign-evidence/combined-194-browser-results/business-products-Business-8ee3d-n-zh-CN-for-permitted-staff-webkit/product-pickup-collected.png) | `客户已取货`; same $80/$10/$70, reference and deadline readable within the short scrolled order view. |

All three preserve `GC-PICKUP-OWN-1042` and original fixture customer/product names. No new changed-area clipping or incorrect payment-status claim was established. These screenshots follow reload and therefore do not show the transient success sentence; exact success wording is covered by the passing assertions before reload. They are bounded scrolled viewports, not all catalog states or the entire dashboard. No native-speaker or OS keyboard acceptance is inferred.

Requests are intercepted local fixtures. These tests do not prove backend role enforcement, hosted/database persistence, actual notification delivery or receipt of money. No real customer, provider, charge, message or production configuration was touched.
