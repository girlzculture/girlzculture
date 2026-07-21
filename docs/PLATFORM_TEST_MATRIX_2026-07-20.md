# Girlz Culture platform test matrix

Test date: 2026-07-21
Branch: `codex/owner-linking-visual-foundation`  
Companion inventory: `docs/PLATFORM_SELF_AUDIT_2026-07-20.md`

This matrix deliberately separates repository evidence from live Supabase, provider, deployment, and production evidence. The only status values used are `Complete`, `Not complete`, `Blocked`, and `Not applicable`.

## Test environment

| Check | Status | Evidence |
| --- | --- | --- |
| Local source, dependency, and build environment | Complete | Node dependencies are installed; `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npm audit --omit=dev` completed successfully on 2026-07-21. |
| Local public browser environment | Complete | Next dev server returned HTTP 200 at `http://127.0.0.1:3100`; desktop viewport was 1280x720 and mobile viewport was 390x844. |
| New Supabase migrations applied to the intended project | Blocked | The repository has no linked Supabase CLI project/database password. The build reached the configured Supabase API but reported `PGRST205` for missing `engine_settings`, proving the new migration range is not applied there. |
| Authenticated role fixtures | Blocked | No authorized anonymous/customer/salon-owner/salon-team/limited-admin/super-admin credential set was provided for destructive or permission-changing live tests. |
| External provider test configuration | Blocked | Stripe, Resend, Twilio, VAPID, Maps/Geocoding, Netlify scheduled execution, and production-domain credentials/actions require the deployment environment and provider dashboards. |

## Identity and admin security

| Test | Status | Evidence |
| --- | --- | --- |
| Canonical identity prevents separate customer, salon, and admin identities for one normalized email | Complete | `npm run verify:identity` passed 10/10 repository controls; migration `20260720100000_canonical_identity.sql` reserves normalized email in `platform_identities` and the three signup/invitation routes use the canonical server flow. |
| Case and surrounding whitespace normalize to the same email | Complete | `normalizeEmail` and the database normalized-email constraint are asserted by `scripts/verify-canonical-identity.mjs`; the verifier passed. |
| Concurrent duplicate attempts are rejected atomically | Blocked | The unique database constraint/RPC implementation is present and statically verified, but a two-client concurrency test requires the migration on a test Supabase project. |
| Existing duplicate remediation is dependency-aware and non-destructive | Complete | Admin conflict inventory/remediation UI and API are covered by the identity verifier; automatic merge/delete is intentionally absent. |
| Non-company admin email is rejected | Complete | `npm run verify:admin-security` passed 10/10 controls, including exact `ADMIN_EMAIL_DOMAIN` enforcement. |
| Company-domain email without an invitation is rejected | Complete | Admin start/verify routes require a pre-authorized active or invited admin; asserted by the admin-security verifier. |
| Invited active admin verifies email/MFA and reaches the correct destination | Blocked | The full server flow exists and passes source-contract checks, but mail delivery, MFA completion, and a real authenticated session require configured services and a migrated test project. |
| Expired/reused verification code and excessive-attempt protection | Complete | Expiry, one-time use, attempt limits, generic responses, and audit paths passed `verify:admin-security`. |
| Revoked admin and last-super-admin protections | Complete | Protected invitation/removal API and database guard are asserted by `verify:admin-security` and `verify:identity-deletion`; both passed. |
| Same email can sign up again after eligible protected identity deletion without inheriting access | Blocked | `npm run verify:identity-deletion` passed the code/migration contract; end-to-end auth deletion/re-registration requires service-role access to a migrated test project. |
| OAuth duplicate-role behavior | Not applicable | No OAuth provider is currently exposed. Enabling one requires routing provider identities through the canonical identity reservation flow first. |
| Self-service email-change duplicate handling | Not applicable | No self-service email-change surface is exposed; direct disconnected email edits are intentionally blocked. |

## Admin salons and activation

| Test | Status | Evidence |
| --- | --- | --- |
| Admin Salons loads without filters and normalizes missing arrays | Complete | `npm run verify:admin-salons` passed; API/UI paths normalize undefined collections and the shared admin section guard prevents `.map` crashes. |
| State, status, verification, tier, lifecycle, sorting, and combined filters preserve result integrity | Complete | Database query/RPC and UI filter contracts passed `verify:admin-salons`, `verify:lifecycle`, and `verify:connected-discovery`. |
| Known live sample salon appears | Blocked | No stable live fixture exists in the configured project; the public local environment returned honest empty states. |
| Error, retry, pagination, sorting, and mobile behavior | Complete | Source-contract verifiers passed; public discovery rendered at 1280px and 390px without overflow or console errors. Authenticated admin mobile interaction still belongs to the role-fixture test below. |
| Setup checklist reaches 100% only when all configured gates pass | Complete | `npm run verify:lifecycle` passed the governed setup-gate and lifecycle diagnostic contract. |
| Approved, complete salon activates according to Engine rule | Blocked | Auto/manual activation logic is implemented and statically verified; a real transition requires migrations and a test application record. |
| Admin activate, suspend, restore, and offboard preserve history and audit changes | Blocked | Lifecycle APIs/RPCs are implemented and verifier-covered, but mutating a live salon was not safe without a designated test batch and authorized admin session. |
| Pending route resolves after approval | Complete | Lifecycle destination logic and `/pending` routing passed `verify:lifecycle`. |
| Public visibility diagnostic explains every inclusion/exclusion gate | Complete | Admin salon detail API returns named diagnostic gates; asserted by `verify:lifecycle` and documented in the self-audit. |

## Search and location

| Test | Status | Evidence |
| --- | --- | --- |
| Synonyms, aliases, and natural phrases return governed real suggestions | Complete | `npm run verify:search-location`, `verify:discovery`, and `verify:connected-discovery` passed the Engine-backed search contract. |
| No-match state is honest | Complete | Local `/styles` showed “No styles match those filters” and `/salons` showed the empty salon state rather than fabricated cards. |
| Keyboard, touch, and screen-reader suggestion interactions | Complete | Combobox/listbox semantics, active descendant, keyboard controls, and touch-select behavior are asserted by `verify:search-location`; the verifier passed. |
| “Current location” is a placeholder and remains editable/clearable | Complete | Location input state contract passed `verify:location` and `verify:search-location`. |
| “Texas keeps returning” regression | Complete | URL/storage synchronization and stale-default removal passed `verify:location`; direct `/salons?location=Texas&lat=31&lng=-99` preserved the explicit selection without mutating it. |
| Manual place, Use my location, clear/change, refresh, denial, timeout, and stale autocomplete | Complete | Each state and request-cancellation path is asserted by `verify:location` and `verify:search-location`; both passed. Browser permission prompts were not accepted during read-only smoke testing. |
| Real geocoding, distance, and radius filtering against provider data | Blocked | Requires configured Google APIs, a migrated project with precise salon coordinates, and browser location permission. |

## Media

| Test | Status | Evidence |
| --- | --- | --- |
| Unified upload tool is used by salon logo/cover/gallery, stylist avatar/portfolio, service, product, review, and CMS surfaces | Complete | `npm run verify:media` passed the unified component/profile/API/storage contract for all listed surfaces. |
| Type, size, dimensions, crop, reposition, resize, preview, replace, cancel, upload failure, and save failure handling | Complete | Client optimizer, placement profiles, upload API validation, staged cleanup, retry/cancel, and save-finalization contracts passed `verify:media`. |
| Live storage upload and RLS regression test for every surface | Blocked | Requires applied storage/media migrations, live buckets, and role-specific authenticated fixtures. |
| Required desktop/mobile preview layout | Complete | Relevant public routes rendered at 1280px and 390px with no horizontal overflow; placement dimension/profile enforcement passed `verify:media`. |
| Orphan-media prevention | Complete | Staging/finalization/reference cleanup and ownership registry checks passed `verify:media`. |
| Trending MP4/WebM validation, duration limit, compression attempt, preview, moderation, and cleanup | Complete | Dedicated trending verifier passed; campaign video workflow enforces <=30 seconds and governed ownership/moderation. |
| Browser-side poster-frame selection and permitted video trimming | Complete | `createVideoPoster` captures an optimized JPEG at the selected frame; `optimizeTrendingVideo` applies an explicit trim range through `MediaRecorder` where supported; the admin editor shows source/final timing, poster/public preview, progress phases, retry-safe cleanup, and capability guidance. |
| Arbitrary-codec/server-grade video transcoding | Not applicable | The product deliberately accepts MP4/WebM and does not claim universal browser transcoding. Browsers without safe `MediaRecorder`/`captureStream` support receive a clear export-under-10-MB instruction. |

## Localization

| Test | Status | Evidence |
| --- | --- | --- |
| Locale infrastructure, 37 initial language records, later admin-added locales, persistence, safe fallback, formatting helpers, RTL, and translation publishing | Complete | `npm run verify:i18n` passed 24 controls; `verify:engine-expansion` confirmed all 37 required locale records; Engine translation CRUD/review/publish/import/export/rollback and English fallback are present. |
| Platform-wide interface source coverage | Complete | The generated registry contains 486 interface messages. `DocumentLocalizationBridge` applies published exact-source translations to registered interface/accessibility text while excluding user content. |
| Localized booking email, SMS, push, and reminder templates | Complete | Booking locale capture, account-locale fallback, published notification entries, locale-aware timestamps, high-impact review requirements, and English fallback passed `verify:i18n`/governance contracts. |
| Human-reviewed translations for all 486 messages in every enabled locale | Not complete | The architecture and draft/review/publish workflow are complete; reviewed translated content was not supplied for every locale. High-impact legal/payment/refund/cancellation/security/safety text cannot auto-publish. |
| Language selector standard change/input behavior | Complete | The selector handles both standard React `change` and native `input`, updates document language/direction, guest cookie/storage, and authenticated preference. |
| Language selector through the local browser automation native-select adapter | Blocked | The adapter changed the native selected DOM value but did not dispatch the application state event; this automation-specific interaction is not reported as a user-flow pass. |
| Long-string visual coverage for all 37 locales | Blocked | English fallback is code-complete; full visual testing requires reviewed published translations. |
| User-generated reviews, descriptions, and messages auto-translate | Not applicable | User-generated content is intentionally preserved in its authored language. |

## Numeric inputs

| Test | Status | Evidence |
| --- | --- | --- |
| Number spinners are removed platform-wide | Complete | Global CSS and audited numeric controls passed `npm run verify:numeric` (10 controls). |
| Optional fields start blank and remain blank after clearing | Complete | Shared `NumericInput` preserves `""`/`null`; verifier passed. |
| Intentional zero, decimals, min/max bounds, invalid characters, paste, and mobile input modes | Complete | Shared input and repeated server validation are covered by `verify:numeric`; audited controls use decimal/integer-aware input modes. |
| Phone, ZIP, IDs, codes, and card values preserve formatting/leading zeros | Complete | These fields use text/tel/payment-provider handling rather than numeric inputs; asserted by the numeric verifier. |

## Engine and record management

| Test | Status | Evidence |
| --- | --- | --- |
| All 21 Engine categories load with permission-aware navigation | Complete | `npm run verify:engine` passed all 21 category contracts; `verify:engine-expansion` passed expanded navigation/control contracts. |
| Draft, review, publish, history, affected surfaces, rollback, environment isolation, import preview/export, and emergency recovery | Complete | `npm run verify:engine-governance` passed the governance/recovery contract; high-impact import/revert requires recent MFA. |
| Secrets are never exposed through Engine or the public config endpoint | Complete | Static negative assertions passed; public config restricts reads to `is_public=true`. |
| Change label, dropdown, threshold, plan display/workflow, media rule, translation, and notification subject without code | Blocked | Each live consumer exists and is verifier-covered, but publish/reload proof requires the Engine migrations applied to a test project. |
| Roll back a published configuration version | Blocked | Transactional rollback/recovery function and UI passed source verification; execution requires migrated Engine tables and a super-admin session with recent MFA. |
| AI disabled and emergency kill-switch states preserve deterministic platform behavior | Complete | `verify:engine-expansion` passed approved-list, disabled/fail-closed, review, budget, usage, audit, sandbox, and deterministic-fallback contracts. No AI provider is required for core booking/search/support behavior. |
| AI provider failure, budget exhaustion, unsafe input, and reviewed-output runtime | Blocked | Provider-neutral server interfaces and tests are present, but a configured approved provider/model, disposable budget, and authenticated admin fixture are required for external runtime proof. |
| Integrations & System Status reports health without exposing secrets | Complete | Status API/panel and static negative assertions passed `verify:engine-expansion`; secret values are never returned. |
| Protected CI migration preflight and fail-stop behavior | Complete | `.github/workflows/database-migrations.yml` and all 61 ordered migration filenames passed `verify:migrations`. Actual dispatch is Blocked. |
| Create/edit/archive/delete/reassign eligible record types with dependency explanations | Complete | `npm run verify:records` passed 21 record-type contracts, generic API authorization, dependency inspection, confirmation, and event logging. |
| Delete a service group with dependents and offer safe reassignment | Complete | Transactional catalog RPC and plain-language dependency response passed `verify:records`. |
| Salon deletion with operational/financial dependents becomes archive/offboarding | Complete | Unsafe hard delete is denied; lifecycle/offboarding and retained-history contract passed `verify:lifecycle` and `verify:records`. |
| Execute record lifecycle operations against live data | Blocked | Requires designated test records, applied migrations, and authenticated admin/salon sessions. |
| Clear a labeled test batch without touching non-test data | Complete | `npm run verify:test-data` passed the typed-preview, protected-record, confirmation, and batch-only cleanup contract. |
| Execute a test-batch cleanup against live data | Blocked | Requires an explicitly labeled disposable batch in a migrated test project and a recent-MFA super-admin session. |

## Regression and permissions

| Test | Status | Evidence |
| --- | --- | --- |
| Public homepage desktop smoke | Complete | At 1280x720, `/` rendered `Book with Confidence.`, the expected main content, no horizontal overflow, zero broken images, and no console errors/warnings. |
| Public catalog/editorial/support/auth route smoke | Complete | `/styles`, `/salons`, `/how-it-works`, `/about`, `/testimonials`, `/help`, `/contact`, `/login`, `/plans`, and `/salon/apply` rendered expected H1/main/navigation state with zero broken images and no console errors/warnings. |
| Mobile responsive smoke | Complete | The same 11 routes passed at 390x844 without horizontal overflow or broken images and with expected mobile navigation. |
| Every customer, salon, and admin tab as its authorized role | Blocked | Requires separate authenticated customer, salon-owner, salon-team, limited-admin, and super-admin fixtures after migrations. |
| Admin permission guard and undefined-array normalization are present | Complete | `permissionForSection`/`AdminShell` gate sections and `rows(value)` converts non-arrays to `[]` in `src/components/AdminDashboard.tsx`; sensitive APIs use `requireAdminPermission` from `src/lib/supabaseAdmin.ts`; TypeScript/lint/build passed. |
| Limited-admin unauthorized section denial renders cleanly at runtime | Blocked | The denial/redirect UI is implemented, but an authenticated limited-admin fixture is required to prove the runtime permission matrix after migrations. |
| Booking overlap/database conflict prevention and calendar mapping | Complete | `npm run verify:hardening` passed 33 marketplace controls, including integrity migration/booking contract coverage. Live concurrent booking remains part of the Supabase test below. |
| Concurrent live booking conflict rejection | Blocked | Requires applied booking integrity migrations and two synchronized test sessions. |
| Booking deposit, Stripe subscription lifecycle, finance ledger, and refund contracts | Complete | `npm run verify:billing` passed subscription lifecycle, ledger, webhook-event coverage, and 43 qualified storage path checks. |
| Stripe test checkout/webhooks/refunds/Connect behavior | Blocked | Requires Stripe test keys, Price IDs, webhook endpoint, Connect account, and live test events. |
| Messaging and governed email/push/SMS contracts | Complete | Notification-channel, subject, booking-event, private-message, and reminder worker source contracts passed `verify:engine-governance` and `verify:hardening`. |
| Actual email, push, SMS, and scheduled reminder delivery | Blocked | Requires provider credentials, published Engine settings, Netlify deployment, scheduled invocation, and delivery-log inspection. |
| TypeScript | Complete | `npx tsc --noEmit` exited 0. |
| ESLint | Complete | `npm run lint` exited 0 after the Netlify scheduled-function export was named. |
| Optimized production build | Complete | `npm run build` exited 0, compiled TypeScript, and generated/collected 94 application routes. |
| Dependency/security audit | Complete | `npm audit --omit=dev` reported 0 vulnerabilities. |
| Feature source-contract suite | Complete | All 26 `verify:*` scripts passed, including 21 Engine areas, 37 locales, 486 interface messages, 21 managed record contracts, 61 migration order checks, and 92 self-audit controls. |
| SQL parser/schema verification against Supabase Postgres | Blocked | No authorized database connection or local Postgres/Docker test environment is available. Migration files are ordered but not claimed as executed. |
| RLS matrix as anonymous/customer/salon/team/limited-admin/super-admin/service role | Blocked | Requires the migration range applied to a disposable Supabase project plus the role fixtures above. |
| Full accessibility audit with keyboard and assistive technology | Not complete | Semantic combobox/labels and responsive smoke checks passed, but no full axe/manual screen-reader pass was executed across all authenticated surfaces. |
| Production deployment, custom-domain smoke, push, and PR merge | Blocked | Local commits exist only on the current branch. No push, PR, merge, deploy, or production-domain mutation was authorized/performed in this pass. |

## Final status summary

| Deliverable | Status | Evidence |
| --- | --- | --- |
| Sections 1–14 repository implementation and reporting | Complete | Continuation commits `9a5adce` through `9782ddd`, this matrix, the self-audit, generated inventory, and `docs/ENGINE_COMPLETION_TRACEABILITY_2026-07-21.md`; all local build/source-contract checks above pass. |
| Concrete platform inventory | Complete | `docs/ENGINE_PLATFORM_INVENTORY_2026-07-21.md` names 42 pages, 73 APIs, 77 components, 61 migrations, 74 tables/views, 82 functions, and 160 RLS policies. |
| Evidence-backed matrix | Complete | This document separates repository/local evidence from blocked live database, role, provider, deployment, and production evidence. |
| Localization architecture and source conversion | Complete | 37 initial locales, admin-added locale support, 486 registered interface messages, published translation bridge, transactional booking notifications, RTL and formatting/fallback paths are implemented. |
| Human-reviewed translated experience for all 37 locales | Not complete | Translation content must be reviewed and published by authorized editors; high-impact content cannot auto-publish. |
| Governed Trending video workflow | Complete | MP4/WebM validation, optional browser-supported trim, poster-frame selection, public preview, staged progress, cleanup, moderation, lazy public playback, and explicit capability limitations are implemented and source-verified. |
| Database migration applied | Blocked | No authorized deployment connection is available; deploy the 15-file continuation range through the protected GitHub migration workflow in the exact order in the self-audit/traceability report. |
| Pushed | Blocked | No remote push was performed. |
| PR merged | Blocked | No PR was opened or merged. |
| Deployed | Blocked | No Netlify deployment was performed. |
| Live verified | Blocked | Production was not changed or tested with authenticated roles/providers. |
