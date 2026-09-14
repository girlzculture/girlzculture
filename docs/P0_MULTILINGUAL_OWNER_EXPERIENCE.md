# P0 multilingual owner experience

Status: **AUTOMATED ONLY — source coverage passes; the expanded production-browser matrix is running.** This document is not a release approval.

The source of authority is the founder's `Girlz_Culture_P0_Single_Authoritative_Codex_Brief.docx`. This branch starts at `b7dbc88ad31ab22f55018e0603ead8483fd33924`; PRs 59 and 60 are independent and parked.

## Existing localization system

P0 extends `LocaleProvider`, the published Engine source/key translations, `LanguageSelector`, and the existing document localization bridge. Published Engine records take precedence; existing reviewed French, Wolof and Spanish dashboard wording takes precedence over newly authored bundled wording. Simplified Chinese uses `zh-CN` and `中文（简体）`; locale parsing remains extensible to `zh-TW`.

The authenticated account's preference takes precedence over the per-account local cache and the anonymous preference. Saves are serialized and bound to the requesting account/scope. Aborted translation fetches and responses for a different locale cannot overwrite the selected language. `lang`, `dir`, and the existing Intl formatters follow the selection. Language is a user preference, not a tenant permission or a business-wide setting.

## Route inventory and acceptance

Owner routes reachable from `/salon/dashboard` include overview, my-page, photos, styles, stylists, products, availability, bookings, messages, reviews, earnings, promotions, subscription and settings. Detail/editor routes share `[section]/[recordId]`. The business-policy editor is `/salon/dashboard/my-page/business-policies`; shared Assistant access comes from the dashboard layout. Setup/onboarding and help links remain reachable.

The machine-readable candidate inventory is `owner-translation-inventory.json`; regenerate it with `node scripts/inventory-owner-translations.mjs`. It follows 67 reachable files from the owner shell, dashboard, Assistant and policy editor. All 1,660 inventoried interface sources, including dynamic/error templates, have entries in en/fr/wo/es/zh-CN. The 1,863 candidates also contain 134 reviewed non-copy values and 69 intentional proper-name exceptions. Non-copy exemptions bind the exact source context and cannot silently exempt a new UI use. `owner-translation-coverage.json` is generated and checked in CI; source coverage does not establish linguistic approval.

`tests/browser/p0-owner-inventory.spec.ts` lists 38 concrete routes, while `p0-owner-populated.spec.ts` adds real service/professional/product/booking/review/message details and save/validation/error/original-message journeys. Both cover five locales at 390/768/1440 in Chromium and WebKit. The policy/Assistant suite covers publication and confirmation; Firefox covers the core locale/reload flow. The 390px empty/editor inventory and focused populated French journeys have passed; the full compiled-server run is still in progress. Browser-only API fixtures are separate from actual PostgreSQL mutation assertions and do not prove cross-device hosted persistence.

## Original content and review

Names, references, addresses, URLs and user-authored prose are authoritative in their original stored form. Mark rendered prose boundaries `data-no-translate`; do not add customer/business prose to the source catalog. Input/textarea values are already excluded from text translation: do not exempt their interface placeholders. A reproduced service-name collision (`Save` becoming `Enregistrer`) now has a permanent browser regression. Explicit template interpolation uses one pass, preserving literal placeholders, names and references. Message display translation is separately authorized and cached, with a visible translation notice and Show original. Reviews and catalog prose retain the source; this PR does not claim a separate general-purpose review/prose translation service.

New policy/payment/legal wording in Wolof and Simplified Chinese is **not native/founder reviewed**. It requires that review before sensitive wording is treated as final. The policy publication UI requires review of the original and acknowledgment that platform rules prevail. Unreviewed translated text is not legal advice.

Remaining: complete the expanded runtime/role/account-lifecycle matrix, review the resulting gallery and sensitive wording, and validate hosted account preference persistence when an isolated backend is assigned. See `P0_IMPLEMENTATION_STATUS.md` for exact evidence and blockers; do not infer acceptance from a translated navigation bar or source totals alone.
