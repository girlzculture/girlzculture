# Engine, configuration, localization, and automation traceability

Report date: 2026-07-21
Branch: `codex/owner-linking-visual-foundation`
Inventory: `docs/ENGINE_PLATFORM_INVENTORY_2026-07-21.md`
Test matrix: `docs/PLATFORM_TEST_MATRIX_2026-07-20.md`

This report uses only `Complete`, `Not complete`, `Blocked`, and `Not applicable`. “Complete” means the named repository behavior and its local evidence are present. It does not mean an unapplied migration is live. No production migration, remote push, pull request, merge, deployment, or provider mutation was performed.

## Completion boundary

| Checkpoint | Status | Evidence |
| --- | --- | --- |
| Repository implementation | Complete | Commits `9a5adce` through `9782ddd`, plus the final evidence commit recorded in this branch history. |
| Committed | Complete | The branch is clean after the final evidence commit. |
| Pushed | Blocked | The user did not authorize a remote push. |
| Migration applied | Blocked | The configured Supabase API returns `PGRST205` for new Engine tables. No linked disposable or production database was authorized. |
| Pull request merged | Blocked | No push or PR/merge was authorized. |
| Deployed | Blocked | No Netlify deployment was authorized. |
| Live verified | Blocked | Production was not changed and role/provider fixtures were unavailable. |
| Human-reviewed translations for every seeded locale | Not complete | The translation workflow and 37 locale records are ready; reviewed translated copy must be supplied and published by authorized editors. |
| Full assistive-technology audit | Not complete | Semantic and responsive checks passed; a complete axe/manual screen-reader audit of all authenticated surfaces was not run. |

## Exact database deployment order

The repository contains 61 ordered migrations; the complete order is generated in `docs/ENGINE_PLATFORM_INVENTORY_2026-07-21.md`. The unapplied continuation range must be deployed through `.github/workflows/database-migrations.yml`, in this order:

1. `20260720100000_canonical_identity.sql`
2. `20260720110000_admin_identity_security.sql`
3. `20260720120000_admin_salon_result_integrity.sql`
4. `20260720130000_salon_lifecycle_engine.sql`
5. `20260720140000_search_language_engine.sql`
6. `20260720150000_unified_media_engine.sql`
7. `20260720160000_localization_engine.sql`
8. `20260720170000_platform_engine_governance.sql`
9. `20260720180000_record_lifecycle_management.sql`
10. `20260720190000_identity_deletion_and_reuse.sql`
11. `20260720200000_safe_test_data_batches.sql`
12. `20260720210000_platform_engine_governance_recovery.sql`
13. `20260720220000_booking_reminder_delivery.sql`
14. `20260720230000_trending_video_posters.sql`
15. `20260721100000_engine_localization_ai_system.sql`

The workflow is manually dispatched, uses the protected `production-database` GitHub environment, runs migration-order and schema preflight checks, and then runs `supabase db push --linked`. It stops on failure. The Engine system-status page reports migration/provider health without displaying secrets. The founder is not expected to paste SQL into Supabase SQL Editor.

## Section 1 — Complete platform-wide Engine audit

Status: Complete

- Changed: generated a concrete source inventory instead of relying on broad completion claims.
- Routes/components/files: `scripts/generate-platform-inventory.mjs`, `docs/ENGINE_PLATFORM_INVENTORY_2026-07-21.md`, and `package.json` (`audit:inventory`).
- Evidence: 42 application pages, 73 API routes, 77 components, 61 migrations, 74 tables/views, 82 SQL functions, and 160 RLS policies are named in the generated inventory.
- Data/security: inventory includes routes, APIs, components, database objects, functions, policies, Engine management areas, migration order, provider-controlled values, and protected exceptions.
- Commit: `9782ddd`.
- Automated result: `npm run audit:inventory` and `npm run verify:self-audit` passed.
- Manual result: the generated inventory and this traceability report were reviewed against the prompt’s 14 sections.
- Blocked evidence: live database object introspection is Blocked until the migration workflow is authorized against the intended Supabase project.
- Protected exceptions: RLS, secrets, provider object identifiers, transaction history, database schema, and executable code remain engineering-controlled because casual edits could compromise security or financial integrity.

## Section 2 — Engine information architecture

Status: Complete

- Changed: Engine now presents 21 searchable, permission-aware areas: Branding & Design; Navigation & Menus; Pages & Page Sections; Homepage Composition; Service Catalog & Taxonomies; Salon Setup & Lifecycle; Booking & Availability Rules; Payments, Deposits & Subscription Presentation; Search, Discovery & Location; Markets & Service Areas; Media & Upload Rules; Languages & Translations; Notifications & Templates; Trust, Reviews & Quality Rules; Promotions & Campaigns; Customer Support Configuration; Users, Roles & Permissions; AI & Automation; Test Data & Maintenance; Integrations & System Status; Configuration History, Publishing & Recovery.
- Routes/components/files: `/admin/engine`; `src/components/admin/EngineControlCenter.tsx`; `src/components/admin/EngineExpansionPanels.tsx`; `/api/admin/engine`; `/api/admin/engine/expanded`; `/api/admin/engine/history`; `/api/admin/engine/backup`; `/api/admin/engine/recovery`.
- Data: `engine_settings`, `engine_setting_versions`, `engine_configuration_events`, `engine_configuration_backups`, `system_status_snapshots`, and related functions/policies in `20260720170000`, `20260720210000`, and `20260721100000`.
- Commit: `5cc9d01` plus governance commits already recorded in the self-audit.
- Automated result: `verify:engine` passed 21 categories; `verify:engine-expansion` passed 21 categories and 37 locale records; `verify:engine-governance` passed.
- Manual result: the unauthenticated route correctly denies access; authenticated role behavior is Blocked without limited-admin and super-admin fixtures.
- Protected exceptions: Engine exposes bounded controls and plain-language health only; it does not expose raw SQL, arbitrary code, or secrets.

## Section 3 — Universal content, label, list, and record management

Status: Complete

- Changed: unified ordinary record operations support create/edit/order/activate/archive/restore/delete where safe, with dependency previews and event logs. Customer-facing terminology uses “Styles & Services” while existing schema names remain unchanged.
- Routes/components/files: Engine panels, `src/components/admin/RecordLifecycleManager.tsx`, `src/app/api/admin/records/route.ts`, Content Management editors, Admin Salons/Customers/Support/Marketing/Users, and salon owner editors.
- Data: categories, groups, master styles, aliases, option lists, specialties, business types, languages, reasons/statuses, salons/applications/stylists/teams/services/products, customers/admin users, campaigns/promo codes, reviews/complaints/support, blog/CMS/FAQ/legal content, homepage/navigation records, markets/service areas, newsletter subscribers, and notification templates.
- Functions/policies: dependency inspection and catalog reassignment/deletion functions in `20260720180000`; record operations require server permissions and create `record_management_events`.
- Commit: `3c5e979` plus `98fed89`.
- Automated result: `verify:records` passed all 21 supported record contracts; `verify:admin-salons`, `verify:lifecycle`, `verify:test-data`, and `verify:identity-deletion` passed.
- Live create/edit/delete proof: Blocked until migrations and authenticated fixtures are available.
- Protected exceptions: bookings, payments, refunds, invoices, subscriptions, disputes, moderation/security/audit events are retained and use cancel/archive/anonymize/offboard paths.

## Section 4 — Page, section, menu, and layout management

Status: Complete

- Changed: page metadata/sections/cards support visibility, ordering, approved layout variants, links, CTA copy, desktop/mobile preview, draft/publish/versioning, archive and restore. Dynamic navigation registry controls desktop header, mobile menu, mobile tab bar, and footer.
- Routes/components/files: Engine Pages and Navigation panels; `src/components/admin/PageCompositionManager.tsx`; `src/components/admin/NavigationManager.tsx`; `src/components/site/PublicChrome.tsx`; `src/components/site/MobilePublicMenu.tsx`; `/api/admin/navigation`; `/api/public/navigation`; `/api/admin/records`.
- Data: `content_pages`, `content_page_sections`, homepage cards, `navigation_items`, page and navigation version/event records.
- Commit: `3c5e979`.
- Automated result: `verify:engine-expansion`, `verify:records`, and `verify:homepage-depth` passed.
- Manual result: public desktop/mobile routes rendered their governed chrome without overflow or console errors. Authenticated admin preview mutation is Blocked.
- Protected exceptions: only validated design-system components/layout variants are accepted; arbitrary HTML/script injection is not exposed.

## Section 5 — Safe business rules and function controls

Status: Complete

- Changed: bounded settings include setup gates, activation behavior, booking buffers/leads/advance limits, deposit presentation, cancellation reasons/windows, quality thresholds, campaign radius/count/rotation, search vocabulary/boosts/stop words, input/upload bounds, reminder timing/channels, safe session displays, rollout flags, and confirmed maintenance actions.
- Routes/components/files: Engine setting editors, `src/lib/engineConfig.ts`, public config API, booking/search/media/support/notification consumers.
- Data: typed `engine_settings` schemas and version/history records; published values are validated server-side and cached values are invalidated after publication.
- Commit: `5cc9d01`, `bebf01d`, `16bb585`.
- Automated result: `verify:engine`, `verify:engine-governance`, `verify:search-location`, `verify:media`, `verify:hardening`, and `verify:billing` passed.
- Live publish/rollback proof: Blocked until the migration and super-admin/MFA fixture are available.
- Protected exceptions: transaction history, RLS, secrets, password/auth trust roots, and hard booking-overlap invariants are read-only status or engineering responsibilities.

## Section 6 — Dependency-aware lifecycle

Status: Complete

- Changed: mutation previews explain dependent records and safe alternatives; reassign, archive/deactivate, restore, and eligible delete paths are consistent across admin/salon surfaces.
- Routes/components/files: `RecordLifecycleManager`, `/api/admin/records`, lifecycle APIs, admin salon detail, owner service/stylist/product managers.
- Data/functions: `inspect_record_dependencies`, catalog reassignment/deletion RPCs, record events, salon lifecycle events.
- Migration: `20260720180000_record_lifecycle_management.sql` plus lifecycle migration `20260720130000`.
- Commit: `98fed89`, extended by `3c5e979`.
- Automated result: `verify:records` passed 21 record types; `verify:lifecycle` passed.
- Live dependency mutation: Blocked pending disposable records and authenticated roles.
- Protected exceptions: retained operational/financial/legal records cannot be hard deleted.

## Section 7 — Identity deletion and email reuse

Status: Complete

- Changed: protected server workflow inventories dependencies, anonymizes retained history, removes eligible Auth identities with the service role, releases normalized email, prohibits self/last-super-admin deletion, requires typed confirmation, and audits the outcome.
- Routes/components/files: identity conflict/deletion admin panels; protected identity API; canonical identity server library.
- Data/functions/policies: `platform_identities`, identity deletion events/functions and service-role-only Auth deletion in `20260720100000` and `20260720190000`.
- Commit: `a6d7adb` plus canonical identity commit `1b6ee6e`.
- Automated result: `verify:identity` passed 10 controls and `verify:identity-deletion` passed.
- Case-insensitive live reuse: Blocked pending applied migrations and disposable authenticated user fixtures.
- Protected exceptions: retained booking/billing/dispute/audit records are anonymized, not destroyed.

## Section 8 — Safe test-data management

Status: Complete

- Changed: admin-only, explicitly labeled batches have preview, type selection, exact dependency counts, typed confirmation, ordered cleanup, audit report, and transaction-safe failure behavior.
- Routes/components/files: Engine Test Data & Maintenance panel; `/api/admin/test-data`.
- Data/functions/policies: test batch registry/event tables and `safe_execute_test_data_batch` in `20260720200000`.
- Commit: `2d50fa8`.
- Automated result: `verify:test-data` passed.
- Live cleanup: Blocked until a disposable labeled batch, migration, recent-MFA super-admin session, and database backup are available.
- Protected exceptions: the acting admin, unlabeled data, settings, published content, legitimate catalog data, and financial history cannot be included.

## Section 9 — Global localization

Status: Complete for architecture and source conversion. Human-reviewed locale content is Not complete.

- Changed: 37 initial locale records cover every language named in the prompt; admins can add/reorder/enable locales through Engine. A generated registry contains 486 interface source messages. A document localization bridge translates registered interface text and accessibility attributes while excluding user-generated content. Booking email/SMS/push templates resolve the booking/account locale, published translations, and English fallback. RTL direction, plural/date/number/currency helpers, guest persistence, and account persistence are included.
- Routes/components/files: global `LocaleProvider`, `LanguageSelector`, `DocumentLocalizationBridge`, `/api/i18n`, `/api/i18n/preference`, `TranslationManager`, `scripts/generate-interface-source-registry.mjs`, `src/i18n/generated-source-messages.ts`, booking notification/reminder routes.
- Data: `supported_locales`, `translation_entries`, translation versions/events, `bookings.preferred_locale`, localized notification template/version records.
- Migration: `20260720160000_localization_engine.sql` and `20260721100000_engine_localization_ai_system.sql`.
- Commits: `1631725`, `b720c86`, and `a7be309`.
- Automated result: `verify:i18n` passed 24 controls and confirmed 486 registered interface messages; `verify:engine-expansion` confirmed 37 seeded locales; TypeScript/lint/build passed.
- Manual result: 11 public routes were checked at 1280x720 and 390x844 with no overflow, broken images, or console errors. The browser’s native `selectOption` changed the DOM value but did not dispatch the React state event; therefore that automation-specific selector interaction is Blocked rather than claimed as passed. The standard React `change` and native `input` paths are both handled.
- Remaining content: reviewed translations for every source message and every locale are Not complete. Legal, payment, refund, cancellation, security, and safety translations must remain Draft/Reviewed until a human publisher approves them.
- Protected exceptions: proper names, addresses, reviews, messages, and salon-generated content are not silently machine-translated.

## Section 10 — AI & Automation

Status: Complete

- Changed: provider-neutral, server-only AI control plane has per-feature enablement, approved provider/model references, prompt versions, human-review rules, limits/timeouts/fallback, budgets/usage, PII policy, moderation status, sandbox preview, audit history, labels, and an emergency kill switch. It is disabled/fail-closed without provider configuration.
- Routes/components/files: Engine AI & Automation panel; `/api/admin/ai`; `src/lib/aiAutomationServer.ts`.
- Data: AI feature, provider status, prompt version, run/audit, budget/usage, and policy records in `20260721100000`.
- Commit: `5cc9d01`.
- Automated result: `verify:engine-expansion` and `verify:engine-governance` passed disabled, approved-list, review, audit, budget, fallback, and secret-isolation contracts.
- Provider execution: Blocked because no approved provider, model, credentials, or budget was configured.
- Deterministic fallback: Complete. Core search, booking, moderation workflow, translation workflow, and support remain usable without AI.
- Protected exceptions: AI cannot approve salons, issue refunds, mutate billing, delete identities, publish legal content, or make final safety/moderation decisions.

## Section 11 — Integrations, migrations, and system status

Status: Complete in repository. Migration execution is Blocked.

- Changed: controlled migration workflow, order/preflight verifier, fail-stop behavior, protected environment, and plain-language status for Supabase, migrations, Stripe, storage, maps, notifications, translations, and AI.
- Routes/components/files: `.github/workflows/database-migrations.yml`; Engine Integrations & System Status; `/api/admin/system-status`; `scripts/verify-migration-order.mjs`.
- Data: `system_status_snapshots` and provider-safe status metadata in `20260721100000`.
- Commit: `5cc9d01` plus `9782ddd` inventory evidence.
- Automated result: `verify:migrations` passed all 61 filenames/order; `verify:engine-expansion` passed status/secret controls.
- Live result: Blocked. No linked database or GitHub protected-environment approval was available.
- Protected exceptions: raw SQL, connection strings, provider payloads, keys, and secrets are never returned to the browser.

## Section 12 — Governance and recovery

Status: Complete

- Changed: typed validation/defaults, Draft/Published state, preview, edit/publish permission separation, high-impact confirmation, audit actor/timestamp, immutable versions, rollback, optimistic concurrency, cache invalidation, validated import/export, backup, and last-known-good emergency restore.
- Routes/components/files: Engine control center; history/backup/recovery/import/export endpoints.
- Data/functions: Engine versions/events/backups and atomic publish/rollback/recovery functions in `20260720170000` and `20260720210000`.
- Commit: `16bb585`.
- Automated result: `verify:engine-governance` passed.
- Live publish/rollback/recovery: Blocked pending migration and recent-MFA super-admin fixture.
- Protected exceptions: recovery never weakens RLS or rewrites immutable financial/identity history.

## Section 13 — Required testing

Status: Complete for available local/static/browser testing. Environment-dependent tests are Blocked. Full accessibility is Not complete.

- Automated results: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and all 26 `verify:*` scripts passed. The optimized build generated 94 routes. `npm audit --omit=dev` reported 0 vulnerabilities.
- Browser results: `/`, `/styles`, `/salons`, `/how-it-works`, `/about`, `/testimonials`, `/help`, `/contact`, `/login`, `/plans`, and `/salon/apply` passed desktop 1280x720 and mobile 390x844 H1/main/navigation checks, no horizontal overflow, zero broken images, and no console errors/warnings.
- Database/RLS/identity concurrency, live record mutations, role matrix, Stripe/provider delivery, scheduled execution, and migration health are Blocked pending the migration and designated credentials/configuration.
- Full keyboard/screen-reader/axe testing across authenticated surfaces is Not complete.
- Detailed per-requirement results and exact blockers are in `docs/PLATFORM_TEST_MATRIX_2026-07-20.md`.

## Section 14 — Report and completion standard

Status: Complete

- This document records changes, files/routes, database objects, migrations/order, commits, provider requirements, automated results, manual results, blockers, protected exceptions, and exact source/deployment statuses for every section.
- `docs/PLATFORM_SELF_AUDIT_2026-07-20.md` is the architectural/configuration inventory.
- `docs/PLATFORM_TEST_MATRIX_2026-07-20.md` separates repository evidence from live evidence.
- `docs/ENGINE_PLATFORM_INVENTORY_2026-07-21.md` is the concrete generated source/database inventory.

## Prompt-to-evidence traceability

| Requirement | Status | Primary evidence |
| --- | --- | --- |
| Safely integrate main and preserve both histories | Complete | Merge commit `9a5adce`; no reset/rebuild. |
| Inventory every route/component/API/database surface | Complete | Generated inventory commit `9782ddd`. |
| 21-area non-technical Engine | Complete | `EngineControlCenter`, expansion panels, `verify:engine` and `verify:engine-expansion`. |
| Universal ordinary records | Complete | Record API/manager; 21 contracts in `verify:records`. |
| Constrained page/menu/layout control and previews | Complete | Page/navigation managers and public navigation API; commit `3c5e979`. |
| Bounded business controls | Complete | Typed Engine schema/consumers; Engine governance verifiers. |
| Dependency-aware lifecycle | Complete | `20260720180000`, record manager/API, `verify:records`. |
| Identity deletion and email reuse | Complete | `20260720190000`, protected API, identity verifiers. |
| Safe labeled test data | Complete | `20260720200000`, test-data API/panel/verifier. |
| 37 initial locales and later admin-added locales | Complete | `20260721100000`, Translation Manager, locale verifier. |
| Convert interface strings and transactional notifications | Complete | 486-source registry, DOM bridge, localized booking notification runtime. |
| Human-reviewed copy for all 37 locales | Not complete | Translation lifecycle exists; reviewed translated content was not supplied. |
| Provider-neutral, disabled-safe AI | Complete | AI server/control center/data contract; Engine expansion verifier. |
| Controlled CI migration deployment | Complete | Protected migration workflow and order verifier. |
| Migrations applied | Blocked | No authorized linked database; PGRST205 confirms missing Engine tables. |
| Plain-language provider/migration status | Complete | System status API/panel; secret negative assertions. |
| Governance/version/rollback/recovery | Complete | `20260720210000`, governance APIs and verifier. |
| Local build/security/source-contract test suite | Complete | TypeScript, lint, build, audit, 26 verifiers. |
| Live authenticated/RLS/provider testing | Blocked | No migrated test project or designated role/provider fixtures. |
| Full accessibility audit | Not complete | Responsive/semantic checks passed; full manual/axe coverage remains. |
| Push/PR/merge/deploy/live verification | Blocked | Explicitly outside authorized actions for this pass. |

## Exact next human action

Authorize and run the GitHub Actions workflow **Database migrations** for the intended Supabase project using the protected `production-database` environment. Configure the environment’s Supabase project reference/access token/database password as repository secrets, require an approval reviewer, run the workflow once, and retain its preflight/push logs. After it succeeds, provide disposable customer, salon owner, salon team, limited-admin, and super-admin test accounts plus test-mode Stripe/notification provider configuration so the blocked live matrix can be executed without risking real records.
