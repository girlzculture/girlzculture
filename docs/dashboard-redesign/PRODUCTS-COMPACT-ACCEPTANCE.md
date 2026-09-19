# Products compact layout and populated orders — 2026-09-19

Status: **AUTOMATED ONLY** for local fixture workflow acceptance, with a source-bound visual review. The responsive catalog correction passed production build193 and its focused browser checks. Populated order journeys retain their separate build192 evidence. Final required CI and hosted verification remain outstanding.

## Demonstrated responsive defect

Parent's actual build192 Spanish 320px screenshot (`combined-192-focused-results/dashboard-redesign-Dashboa-e7401-rds-and-calendar-navigation-webkit/spanish-phone-navigation-320.png`) shows Products heading/CTA overlap, metric labels crossing card boundaries and a clipped native stock selector. The new permanent regression reproduced the defects in `products-320-before.log`: one failed WebKit case. Original screenshot, trace and error context are retained under `products-320-before-results`.

The selector had 81px of usable text width while its default label measured 105.98px and another saved option 179.98px. Assertions measure actual heading glyph rectangles against the CTA, each metric label line within its card, and all six selected stock labels against native-control usable width. They retain 44px targets, all filter values and the real catalog reset. No threshold was relaxed.

`ProductsWorkspace.tsx` changes layout classes only: the header wraps, the CTA retains its minimum target and avoids shrinking, metrics use two columns below `sm`, labels may wrap, and the stock selector gets the full narrow-screen row. All data, calculations, handlers, catalog cards, navigation and order workflows are unchanged.

Eight cases in `tests/browser/business-products.spec.ts`, prefix `Business products compact controls`, cover 320/390px × English/French/Spanish/Simplified Chinese. Production build193 passed (`combined-193-build.log`) with the frozen 836-file source digest `007abb212afbd3bb58212a0283a7e201c8ccb90b60436d06e290bd1ac4155890` unchanged. `combined-193-products-browser.log` records **26/26 passed in 45.9 seconds** across Chromium and WebKit: 16 new geometry runs, eight existing stock-label runs and two existing required-fields/draft/save/persistence runs. Scoped ESLint and full TypeScript passed (`products-compact-after-lint.log`, `products-compact-after-types.log`); both independent source/evidence reviews passed.

Parent visually inspected the Spanish320 rendered AFTER screenshot, `combined-193-products-results/business-products-Business-804e8-abels-readable-in-es-at-320-webkit/products-compact-es-320.png`: the heading and CTA are separated, statistics text stays readable within its cards, and the complete All stock label is visible. This certifies the bounded rendered correction, not all fourteen dashboard sections or hosted behavior.

## Populated order workflow evidence

`combined-192-orders-browser.log`: **10/10 passed** on the existing production fixture build192, Chromium and WebKit. Five cases use prefix `Business products populated`:

- Four locale/viewport journeys, including products-permitted staff, assert exact inline own-order reference, customer/product snapshots, quantities, deposit, unpaid pickup balance and deadline. A gated 503 keeps Reserved status and shows the exact support reference; explicit retry receives the saved Ready status plus notification-warning reference. Refresh, collection and reload preserve the actual saved fixture state. Collection does not falsely assert that the remaining balance was paid.
- One shipping journey dismisses the carrier/tracking prompts and proves no POST, then explicitly confirms exact values and verifies saved tracking after reload.

Screenshots under `combined-192-orders-results` capture populated details, failed pickup status update, collection and saved shipping tracking. No real customer, provider, payment, email or database was contacted or modified. These browser fixtures establish UI behavior, not backend authorization, real notification delivery or hosted persistence. Their evidence is unaffected by the catalog-only CSS correction.
