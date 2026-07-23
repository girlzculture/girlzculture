# Girlz Culture live corrections and AI concierge handoff

Date: 2026-07-22  
Branch: `codex/live-corrections-ai-concierge`  
Safety boundary: this pass did **not** merge, deploy, apply database migrations, change production data, or alter live Stripe/OpenAI configuration.

## Executive result

The requested implementation is present on the branch and passes the local build, type, lint, security-audit, migration-order, and 28 focused verification suites. It is not yet production-complete because six migrations still need to be applied in a protected test/preview environment and several flows require authenticated Supabase, Stripe test-mode, OpenAI, and real media-provider verification. Those release gates are called out explicitly below.

## Root causes and corrections

- **P0 owner persistence:** owner screens mixed direct browser Supabase writes with RLS-sensitive child writes, then displayed success before an authoritative readback. Styles were especially vulnerable because the style and its material rows were separate operations. Protected saves now authenticate the server session, resolve the canonical salon/team membership, enforce the required permission, whitelist fields, write through a server client, and read the saved record back before success. Style and material persistence is atomic through `save_salon_style_with_materials`.
- **P1 discovery:** visibility decisions were split across stale `salons.subscription_status`, subscription records, approval state, publication state, and several ranking paths. Discovery now uses one authoritative eligibility predicate, exact coordinates, deterministic tier/relevance/distance ordering, and diagnostics that expose the evidence behind inclusion or exclusion.
- **P2 subscription upgrades:** the previous path could let the requested plan lead the UI before Stripe proved that the effective price and invoice were paid. The new flow creates a tracked request, asks Stripe to update with invoicing behavior, verifies the provider subscription/price/invoice, and only then grants the effective entitlement. Webhooks reconcile idempotently and Admin Finance receives the evidence.
- **P3 catalog and promotions:** style child rows, staged stylist photos, and promotion lifecycle actions were fragmented. Atomic style saves, staged-media attach/cleanup, a full promotion manager, audit history, public promotion rendering, and checkout discount validation now use the same salon and permission source of truth.
- **P4 numeric/catalog UX:** numeric fields were normalized while the founder was still typing and ordering language exposed implementation concepts. Numeric inputs now retain editable strings until validation/blur, and catalog ordering uses founder-facing alphabetical/custom controls.
- **P5 media:** a crop preview was not a guarantee that the persisted output or every responsive surface used the crop. Media now stores crop metadata and desktop/tablet/mobile rendition paths, validates ownership and transforms on the server, cleans all staged renditions together, and displays product imagery in the intended square aspect.
- **P6 marketing/video:** campaign funding/reference evidence and delivery validation were too generic, while browser/provider video failures surfaced as raw upload errors. Campaign administration now records readable funding/evidence context and validates delivery entitlements. Video handling classifies container, codec, size, and provider failures for actionable feedback.
- **P7 localization/Engine:** the translation catalog and live UI were only partially connected. Locale state now persists across navigation/refresh, the runtime translation bridge applies published values, Engine changes trigger revalidation, and coverage reports distinguish translated from incomplete locales. The extractor currently registers 537 source messages.
- **P8 monitoring:** important new protected paths now emit sanitized monitored failures and support references instead of raw provider/database errors. A complete audit of every older API route is still outstanding.
- **P9 AI concierge:** there was no governed customer beauty assistant. The new concierge has a narrow beauty-discovery scope, strict structured output, locale-aware clarification, deterministic fallback, verified salon/style actions only, rate limits, daily cost controls, approved-provider/model controls, prompt versioning, and a database feature flag that defaults off.
- **P10-P13:** existing identity/lifecycle behavior was preserved; shared public eligibility/ranking is reused by homepage/search; compact campaign controls and evidence validation were added; stable Engine keys were added for founder-manageable labels and AI configuration.

## Priority status

The status below is deliberately release-oriented. “Not complete” means the branch implementation exists but the required migrated/authenticated/provider verification has not happened yet; it does not mean the code is absent.

| Priority | Status | What remains before production sign-off |
|---|---|---|
| P0 owner persistence/authorization | Not complete | Apply migration, then save/reload profile, style+materials, stylist+photo, and product using owner and permitted team accounts. |
| P1 organic/paid discovery | Not complete | Run migrated coordinate fixtures and validate an eligible/ineligible salon and paid campaign delivery in preview. |
| P2 Stripe upgrades/Admin Finance | Not complete | Exercise success, failed payment, incomplete/3DS, webhook retry, and cancellation with Stripe test-mode credentials. |
| P3 styles/stylists/promotions | Not complete | Authenticated migrated save/reload/delete tests are required. |
| P4 numeric editing/order UX | Complete | Local verifier, typecheck, lint, responsive render, and build pass. |
| P5 media crop/renditions | Not complete | Upload/crop real images in an authenticated migrated preview and inspect desktop/tablet/mobile output plus cleanup. |
| P6 marketing/video | Not complete | Upload known-good MP4 and WebM fixtures to the configured provider and verify campaign evidence/delivery in preview. |
| P7 localization/Engine | Not complete | Runtime is wired; non-English locales still require reviewed, published human translations. Portuguese correctly reports incomplete coverage. |
| P8 monitoring | Not complete | New/key changed paths are covered; every legacy protected route still needs a route-by-route monitoring audit. |
| P9 AI beauty concierge | Not complete | Apply migration, configure approved OpenAI model/key and budget in preview, enable the DB flag, then run provider and cost-limit tests. |
| P10 account security/lifecycle | Not complete | Existing checks pass, but disposable-identity deletion was not executed against a real isolated auth project in this pass. |
| P11 salon lifecycle/public status | Complete | Existing lifecycle/public-tier regression suites pass and no production state was changed. |
| P12 homepage/paid/fair local rotation | Not complete | Shared ranking and responsive UI pass locally; migrated paid-delivery and rotation-distribution evidence is still required. |
| P13 founder-manageable Engine | Not complete | Code and stable keys are present; migrated Engine save/reload/live revalidation must be verified in preview. |

## Main implementation files

- Owner persistence and workspace: `src/app/api/salon/workspace/`, `src/app/api/salon/profile/route.ts`, `src/app/api/salon/records/`, `src/components/owner/OwnerDashboardApp.tsx`, `src/components/owner/StructuredCatalogEditors.tsx`
- Discovery: `src/app/api/salon/discovery-diagnostics/`, `src/app/api/location/geocode-salon/route.ts`, `src/app/salons/page.tsx`, discovery migration and verifiers
- Billing: `src/app/api/stripe/subscription/change/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/marketingEntitlements.ts`
- Promotions: `src/components/owner/SalonPromotionsManager.tsx`, `src/app/api/promotions/`, `src/lib/salonPromotions.ts`, booking checkout and salon public/booking pages
- Media: `src/components/ImageUpload.tsx`, `src/lib/imageUpload.ts`, `src/app/api/media/`, `netlify/functions/media-cleanup.mjs`, responsive media migration
- Localization/Engine: `src/components/i18n/`, `src/app/api/i18n/route.ts`, Engine admin routes/components, `src/i18n/generated-source-messages.ts`
- AI concierge: `src/components/public/BeautyConcierge.tsx`, `src/app/api/concierge/`, `src/lib/beautyConciergeServer.ts`, `scripts/verify-ai-beauty-concierge.mjs`
- Campaign administration: `src/components/admin/AdminFeaturedCampaigns.tsx`, `src/components/admin/AdminTrendingCampaigns.tsx`, campaign API routes

## Database migrations — exact order

Apply these only after the branch is reviewed and merged, first in an isolated preview/staging Supabase project:

1. `supabase/migrations/20260722100000_atomic_owner_catalog_persistence.sql`
2. `supabase/migrations/20260722110000_discovery_authoritative_eligibility.sql`
3. `supabase/migrations/20260722120000_responsive_media_renditions.sql`
4. `supabase/migrations/20260722130000_beauty_concierge_engine.sql`
5. `supabase/migrations/20260722140000_salon_promotion_management.sql`
6. `supabase/migrations/20260722150000_subscription_change_tracking.sql`

Impact and recovery notes:

- `100000` adds a security-definer atomic catalog RPC with authenticated/service-role execute grants; it does not backfill data.
- `110000` replaces the authoritative nearby discovery function. Validate query plans and expected sample results immediately after applying.
- `120000` adds crop/rendition JSON columns with safe defaults; existing media remains valid and can be lazily enriched.
- `130000` seeds disabled AI/Engine controls and stable translation keys. The concierge remains off until explicitly enabled.
- `140000` adds promotion lifecycle fields and normalizes existing promotion status/type values, creates an immutable audit table/trigger, and adds booking/checkout discount evidence columns. Snapshot promotion counts/statuses before applying and compare afterward.
- `150000` creates server-managed subscription-change requests with owner/admin read policies; authenticated direct writes are not granted.
- Each migration is transactional. On failure, stop and capture the exact SQL error; do not skip ahead. Prefer a corrected roll-forward migration over destructive manual rollback once new data is in use.

Recommended release order: **review/merge code → apply migrations in preview → run preview tests → configure test providers → deploy preview → approve production migration window → apply migrations → deploy production code → run read-only smoke checks**.

## Environment and provider configuration

Keep all secret values in Netlify/Supabase environment configuration, never in the repository:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`
- Stripe test mode: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, server-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASIC_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`
- AI governance: `AI_APPROVED_PROVIDERS=test,openai`, `AI_APPROVED_MODELS={"openai":["gpt-5.4-nano"]}`, server-only `OPENAI_API_KEY`, input/output USD-per-million cost settings
- Scheduled cleanup: server-only `CRON_SECRET`

Do not enable the concierge feature flag until the model allowlist, daily request/token/cost limits, prompt version, privacy notice, and preview tests are approved in Engine.

## Verification performed

- `npm run i18n:extract` — pass, 537 interface source messages from 251 TypeScript files
- `npx tsc --noEmit` — pass
- `npm run lint` — pass
- All 28 `verify:*` suites — pass
- `npm audit --omit=dev --audit-level=moderate` — 0 vulnerabilities
- `npm run build` — pass, 105 application routes
- Responsive browser smoke checks at desktop and 390px mobile — no horizontal overflow on homepage/search/styles; locale persists; truthful incomplete-translation badge; “Salons Near You” remains first; hidden footer links remain hidden; unauthenticated `/admin` denies cleanly without corrupting the salon session.
- Native keyboard activation should still be repeated manually because the automation driver did not reliably move/activate native controls.

## Required manual tests after preview migration

1. **Owner:** sign in as an owner and a permitted team member. Save each protected record, reload, open the public salon page, and confirm the same values. Confirm an unpermitted team member receives a clean 403 and no data changes.
2. **Discovery:** geocode a salon with known coordinates; query inside/outside the radius; confirm active subscription + approved + published is visible and every excluded salon has a diagnostic reason.
3. **Stripe:** use test clocks/cards for paid upgrade, insufficient funds, incomplete/3DS, webhook duplicate/retry, past-due, canceled, and restored states. Confirm entitlement changes only after provider evidence and that Admin Finance shows the request/invoice/price evidence.
4. **Current test salon reconciliation:** compare the salon’s effective app tier with its Stripe subscription item price and most recent paid invoice. If Growth was granted without a paid Growth invoice, do not edit the database directly; create a finance reconciliation record, either collect/confirm a valid Growth invoice or use the audited change flow to restore Basic at the agreed effective date, then replay/reconcile the Stripe webhook and verify the ledger.
5. **Media:** upload one portrait, salon landscape, and square product photo; set device crops; save/reload; inspect desktop/tablet/mobile; replace/delete and confirm every rendition path is removed.
6. **Video:** upload known-good H.264/AAC MP4 and VP9/Opus WebM fixtures; verify progress, playback, thumbnail/error state, deletion, size rejection, codec rejection, and provider failure wording.
7. **Localization:** publish one reviewed translation in Engine, switch locale, navigate and refresh, then edit/publish again and confirm revalidation without deploy. Confirm fallback strings are labeled incomplete, not translated.
8. **Concierge:** while disabled confirm fallback/disabled behavior; enable only in preview; test vague, out-of-scope, malicious, multilingual, location-denied, no-result, rate-limit, daily-cost-limit, provider-timeout, and verified-card-action cases. Confirm no raw provider response or invented salon is shown.
9. **Identity deletion:** use disposable owner/team/customer identities in an isolated auth project; delete each and confirm cascade/anonymization rules, storage cleanup, audit evidence, and inability to sign in again.

## Known remaining work

- Apply and validate the six migrations in a protected Supabase preview project.
- Complete provider-backed Stripe, OpenAI, image, and video tests.
- Populate reviewed translations; the runtime must continue to report incomplete coverage until then.
- Audit monitoring/error sanitization on every legacy protected API route.
- Complete real isolated identity-deletion coverage.
- Repeat keyboard-only and assistive-technology checks manually.

No production write, migration, merge, or deployment was performed during this pass.
