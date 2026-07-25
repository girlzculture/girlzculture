# Girlz Culture final production-correction handoff

Date: 2026-07-25

Branch: `codex/final-production-correction-commerce`

Base reviewed: `origin/main` at `50134fc`

## Truthful completion boundary

The repository implementation for P0-P15 is complete on this branch. TypeScript,
lint, production build, focused executable checks, route inventory, platform
inventory, and static migration-order verification pass.

This does **not** mean the release is deployed or production-verified:

- The two newest migrations have not been applied to preview or production.
- A real empty-database migration run is not verified on this workstation because
  no disposable `CLEAN_DATABASE_URL`, local PostgreSQL, Docker, or Supabase CLI is
  available. The harness intentionally fails rather than silently substituting a
  source-string check.
- Stripe Tax, Stripe Connect, Google Maps, OpenAI, email, SMS, video transcoding,
  cleanup, push, Netlify aliases, DNS, and TLS require founder-controlled preview
  configuration and real provider tests.
- The required six-role and device/browser acceptance matrix remains a preview
  release gate.
- No production migration, production data write, deployment, DNS change, or
  provider change was performed.

## P0-P15 traceability

| Section | Repository | Preview/provider verification | Root cause and delivered correction | Primary implementation evidence |
|---|---|---|---|---|
| P0 Location persistence | Complete | Pending real-browser matrix and Maps credentials | Discovery surfaces owned separate transient location state. One privacy-bounded session record now carries coordinates, label, provenance, consent state, and expiry across public journeys; list discovery survives map failure. | `072ded8`; `src/components/location/CustomerLocationProvider.tsx`; `src/lib/location.ts`; `20260724100000_location_persistence_controls.sql` |
| P1 Homepage/search/discovery | Complete | Pending responsive browser/touch acceptance | Location query parameters and competing UI layers made navigation noisy and autocomplete fragile. Clean salon URLs, internal location state, profile distance, compact offers, working pointer/keyboard/touch gallery controls, and safe configured social links are wired. | `072ded8`; `src/components/search/AutocompleteInputs.tsx`; `src/components/public/SalonPhotoGallery.tsx`; `src/components/site/SalonProfileActions.tsx` |
| P2 AI Beauty Concierge | Complete | Pending configured OpenAI preview call | The UI could appear enabled without provider readiness or a persistent result state. It now has governed provider status, strict intent interpretation, verified database-only matches, deterministic fallback, distinct no-result/disabled/failure states, and an explicit result panel. | `0cb7e7a`; `src/components/public/BeautyConcierge.tsx`; `src/lib/beautyConciergeServer.ts`; `src/components/admin/AiAutomationManager.tsx` |
| P3 Numeric inputs | Complete | Pending physical keyboard/device acceptance | Immediate numeric coercion prevented an editable blank state. Shared parsing preserves blank/decimal editing and validates bounded values on blur/save; audited controls no longer expose browser spinners. | `59fcb75`; `src/lib/numericInput.ts`; `scripts/verify-numeric-inputs.mjs` |
| P4 Localization | Complete engine/coverage inventory | Pending human review and provider-backed machine drafts for non-English locales | Translation was fragmented and public coverage could be overstated. The source registry now inventories 638 messages, resolution falls back truthfully, Engine exposes state/coverage, and draft/review/publish/restore workflows preserve original text. | `1631725`, `5ff0811`; `src/i18n/generated-source-messages.ts`; `src/components/admin/TranslationManager.tsx`; `scripts/verify-localization-completion.mjs` |
| P5 Rescheduling/service lifecycle | Complete | Pending preview email/SMS and two-party browser journey | Rescheduling did not model proposal acceptance atomically and service work stopped at Start. Proposal alternatives, customer accept/decline, slot revalidation, audited atomic move, communications, and Confirmed → Ready → In progress → Completed are implemented. | `95c739d`; `src/lib/bookingRescheduleServer.ts`; `src/app/api/salon/bookings/[id]/service/route.ts`; `20260724110000_booking_reschedule_and_service_lifecycle.sql` |
| P6 Booking references | Complete | Pending clean-database concurrency run | UUIDs were exposed as the primary human identifier. A sequence-backed base-26 reference allocator, safe backfill, unique index, search, and public display use `GC-A-01` style references while UUID authorization remains unchanged. | `2df2a14`; `src/lib/bookingReference.ts`; `20260724120000_booking_public_references.sql` |
| P7 Cancellations/refunds/comms | Complete | Pending Stripe test-mode transfer/reversal matrix | One reason field mixed internal and public text, actor origin was unclear, and refund states lacked Connect reconciliation. Separate reason/message/origin fields, Engine grace rules, performance attribution, compact communications, and Stripe refund/transfer evidence are implemented. | `7c171b9`; `src/lib/bookingCancellationCore.ts`; `src/lib/financeLedgerCore.ts`; `20260724130000_cancellation_refund_controls.sql` |
| P8 Timezone | Complete | Pending visual acceptance around a live DST transition | UTC timestamps were rendered without the viewer/salon timezone. Storage remains UTC; salon events use salon timezone and admin views/exports use an MFA-protected preference defaulting to `America/New_York`. | `4a35f7c`; `src/lib/dateTime.ts`; `src/components/admin/AdminTimeZonePreference.tsx`; `20260724140000_timezone_preferences.sql` |
| P9 Video/media cleanup | Complete provider-neutral lifecycle | Blocked until transcoder and cleanup credentials exist in preview | Uploads had no governed compatibility/transcode or orphan cleanup path. Inspection, direct-use formats, transcoding job lifecycle, posters, progress, retry/cancel, retained originals, and scheduled cleanup are wired. | `46a98a5`; `src/lib/videoProcessingServer.ts`; `docs/MEDIA_PROCESSING_SETUP.md`; `20260724150000_video_processing_lifecycle.sql` |
| P10 Branding/Design Engine | Complete | Pending real asset propagation matrix | Storage received `SharedArrayBuffer`-backed bytes and branding controls lacked governed propagation. Bytes are copied to ordinary memory, signatures and safe SVG are validated, asset roles/theme tokens are versioned, and previews/publish/restore cover all shells. | `b28583e`; `src/lib/brandAssetCore.ts`; `src/components/admin/BrandAppearanceManager.tsx`; `20260724160000_brand_engine_binary_and_theme.sql` |
| P11 Product commerce | Complete | Pending migrations plus Stripe/Tax/Connect preview journey | Products were catalog-only. One-salon cart, Buy Now, pickup/shipping, inventory, SKU, sale price, media, tax category, promotion enforcement, combined appointment checkout, atomic inventory/slot holds, expiry release, fulfillment, order events, and governed refunds are implemented. | `64da7cb`; `src/lib/commerceCheckoutServer.ts`; `src/components/commerce/*`; `src/app/api/stripe/commerce-checkout/route.ts`; `20260724170000_product_commerce_and_combined_checkout.sql` |
| P12 Finance redesign | Complete | Pending populated preview visual/CSV reconciliation | Booking finance rows concatenated unrelated evidence. The default unified ledger now groups received/returned/owed/platform accounting, supports filters and filter-respecting CSV, uses mobile cards, and expands to Stripe, payout, refund, product, and audit evidence. | `64da7cb`; `src/components/admin/AdminFinanceDashboard.tsx`; `src/app/api/admin/finance/route.ts`; `src/app/api/admin/finance/product-refund/route.ts` |
| P13 Engine redesign | Complete | Pending founder usability walkthrough and provider Test Connection checks | Configuration was technically deep but founder-hostile. It is organized into the exact 18 requested sections with global search, breadcrumbs, health badges, draft/review/publish/restore, prominent errors, integration cards, and a searchable founder handbook. | `4d592c1`; `src/lib/engineManifest.ts`; `src/components/admin/EngineControlCenter.tsx`; `src/components/admin/SystemStatusManager.tsx` |
| P14 Monitoring/public reads | Complete | Pending authenticated preview failure injection | Public styles directly touched private salon data and notification reads were misclassified as outbound failures. A security-definer, customer-safe style projection applies marketplace eligibility; 100 APIs, two functions, and 19 provider entry points are inventoried with corrected classifications and reference parity. | `4d592c1`; `20260724180000_authorized_public_style_catalog.sql`; `src/app/styles/page.tsx`; `src/lib/operationalMonitoringCore.ts`; `docs/OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md` |
| P15 Dashboard subdomains | Complete repository/config documentation | Blocked until Netlify aliases, DNS, and TLS are founder-configured | Host routing and role boundaries were prepared without treating obscure URLs as authorization. Feature-flagged redirects/rewrites preserve scoped sessions, MFA, RBAC, rate limits, and noindex. | `de79253`; `src/lib/hostRouting.ts`; `src/proxy.ts`; `docs/DASHBOARD_SUBDOMAIN_SETUP.md`; `scripts/verify-dashboard-subdomains.mjs` |

## New migrations and exact order

Run the branch migrations in chronological order in a disposable preview first:

1. `20260724100000_location_persistence_controls.sql`
2. `20260724110000_booking_reschedule_and_service_lifecycle.sql`
3. `20260724120000_booking_public_references.sql`
4. `20260724130000_cancellation_refund_controls.sql`
5. `20260724140000_timezone_preferences.sql`
6. `20260724150000_video_processing_lifecycle.sql`
7. `20260724160000_brand_engine_binary_and_theme.sql`
8. `20260724170000_product_commerce_and_combined_checkout.sql`
9. `20260724180000_authorized_public_style_catalog.sql`

Supabase should execute the complete repository chain in timestamp order. Do not
mark migrations as applied manually. `npm run verify:migrations` confirms 95
unique ordered filenames, but `npm run verify:database-clean` is the release gate
that must execute them against an actually empty database.

### Impact of the two newest migrations

`20260724170000_product_commerce_and_combined_checkout.sql` is additive:

- Adds commerce fields to `salon_products`.
- Preserves existing catalog rows, marking existing visible/non-archived products
  Active while leaving inventory tracking and online fulfillment disabled.
- Adds checkout intents, inventory reservations, orders/items, promotion
  redemptions, refund evidence, order events, indexes, constrained statuses, RLS,
  grants, and service-role-only reservation/completion functions.
- Does not truncate, delete, reset, or replace existing rows.

`20260724180000_authorized_public_style_catalog.sql` is additive:

- Adds `list_public_style_catalog`, which returns only published style fields for
  salons satisfying the existing authoritative marketplace visibility function.
- Adds admin-readable/service-role-written integration health snapshots.
- Does not grant direct public access to private salon-table data.

The earlier seven migrations are also forward/additive and preserve their audit
records. The booking-reference migration performs a safe, uniqueness-protected
backfill.

## Environment and provider configuration

Copy the documented names from `.env.example`; do not copy secrets into source
control.

### Required platform values

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `GUEST_BOOKING_LINK_SECRET`
- `INTERNAL_API_SECRET`
- `PASSWORD_RESET_SECRET`
- `MFA_CODE_SECRET`
- `ADMIN_EMAIL_DOMAIN`
- `NEXT_PUBLIC_SITE_URL`

### Stripe test mode

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_SECRET_KEY=sk_test_...` (server only)
- `STRIPE_WEBHOOK_SECRET=whsec_...` (server only)
- `STRIPE_BASIC_PRICE_ID`
- `STRIPE_GROWTH_PRICE_ID`
- `STRIPE_PREMIUM_PRICE_ID`
- `STRIPE_TAX_ENABLED=false`

Keep Stripe Tax disabled until test-mode tax registrations, origin addresses,
product tax behavior, and required customer addresses are configured. Then enable
it in preview and verify the Stripe tax calculation ID appears on the order and
Admin Finance. Configure salon Connect accounts in test mode and verify destination
payment, charge, transfer, reversal/refund, and payout references.

### Maps and location

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
- `GOOGLE_MAPS_SERVER_API_KEY` (server only)

Follow `docs/LOCATION_CONFIGURATION.md`. Browser and server keys must be separate
and API/referrer restricted.

### Communications and automation

- `RESEND_API_KEY` and four `EMAIL_FROM_*` identities
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- `OPENAI_API_KEY`, approved provider/model JSON, and budget rates

Core concierge search works deterministically without OpenAI; System Status must
say Not configured when a provider is absent.

### Media lifecycle

- `MEDIA_TRANSCODE_ENDPOINT`
- `MEDIA_TRANSCODE_TOKEN`
- `CRON_SECRET`

Follow `docs/MEDIA_PROCESSING_SETUP.md` and validate real MP4, WebM, and incompatible
MOV fixtures plus one disposable cleanup record.

### Dashboard hosts

- `NEXT_PUBLIC_SITE_HOST=girlzculture.com`
- `NEXT_PUBLIC_SALON_DASHBOARD_HOST=dashboard.girlzculture.com`
- `NEXT_PUBLIC_ADMIN_HOST=mothership.girlzculture.com`
- `DASHBOARD_SUBDOMAINS_ENABLED=false` until aliases and TLS are ready

Follow `docs/DASHBOARD_SUBDOMAIN_SETUP.md`. No DNS action was taken here.

## Automated verification

Passed on 2026-07-25:

- `npx tsc --noEmit`
- `npm run lint` — zero errors; four existing Next.js `<img>` optimization
  warnings remain in governed branding/public-shell preview components.
- `npm run build` — production build succeeds.
- `npm run verify:migrations` — 95 unique, ordered migrations.
- Discovery: location, automatic location, persistence, search, organic
  discovery, connected discovery, homepage depth, public tiers, hardening.
- Identity/security: canonical identity, admin security, identity deletion,
  guest booking, owner realtime, test-data controls, production foundation.
- Booking/finance: billing, communications, rescheduling, booking workflow,
  public references, cancellations/refunds, timezone, finance reconciliation,
  promotions, product commerce.
- Governance/media: Engine, Engine governance, Engine expansion, media,
  video processing, brand appearance, catalog/record lifecycle, featured,
  trending.
- Localization: source registry generation, localization engine, localization
  completion.
- Monitoring: 100 API routes, two Netlify functions, 19 provider operations,
  ten representative protected feature groups, monitoring usability, dashboard
  notifications.
- Routing: dashboard subdomains and salon vanity URLs.
- `npm run verify:final-correction`
- `git diff --check`

Not passed because a required external target is absent:

```text
npm run verify:database-clean
CLEAN_DATABASE_URL must point to a disposable, empty PostgreSQL database.
```

This is an environment blocker, not an assertion failure. A disposable empty
database must execute all 95 migrations before merge.

## Founder-controlled preview acceptance order

1. Create or identify a disposable empty Supabase preview database.
2. Set `CLEAN_DATABASE_URL` locally/CI for that disposable database and run
   `npm run verify:database-clean`. Never point this variable at production.
3. Deploy this branch to a private Netlify preview with indexing disabled.
4. Apply all pending migrations in the order above to preview only.
5. Configure test-mode provider values. Keep Stripe Tax and dashboard subdomains
   disabled until their prerequisites are complete.
6. Run the six-role matrix in separate sessions: guest, customer, salon owner,
   salon team member, limited admin, super admin.
7. Run the location journey through homepage → salons → styles → concierge →
   salon profile → booking; refresh each surface and confirm the same active
   coordinates/label. Deny Maps once and confirm list results remain.
8. Complete a product-only pickup order, product-only shipping order, and a
   combined product plus appointment checkout. Attempt two concurrent last-item
   purchases and two concurrent bookings. Confirm exactly one succeeds in each
   conflict case and failed/expired checkout releases both holds.
9. Verify tax/shipping/discount/deposit/balance math against Stripe test evidence.
10. Verify the customer confirmation, account order, salon order queue, Admin
    Finance details/CSV, fulfillment transitions, and one allowed product refund.
11. Run proposal → customer acceptance → salon confirmation → service completion,
    then verify review eligibility and all communication channels.
12. Test cancellation before and after a simulated Connect transfer; reconcile
    refund/reversal evidence and customer-safe copy.
13. Upload real logo formats and real video fixtures; publish/restore branding and
    retry/cancel/cleanup media.
14. Review every Engine section with the founder handbook and run each configured
    integration's Test Connection action.
15. Only after preview acceptance, configure Netlify aliases, GoDaddy CNAMEs, TLS,
    and cross-subdomain session checks. Enabling production remains a separate
    founder-approved release.

## Rollback and recovery

- Do not use destructive down migrations after commerce or booking data exists.
- If preview reveals an application regression, disable the affected feature
  flag/provider, revert the application commit, and preserve additive schema and
  audit evidence.
- Commerce checkout is isolated behind its routes and can be removed from public
  entry points without deleting orders.
- Set `STRIPE_TAX_ENABLED=false` to stop new tax calculations while preserving
  calculation IDs already recorded.
- Set `DASHBOARD_SUBDOMAINS_ENABLED=false` to retain existing routes.
- Disable media provider credentials to return System Status to Not configured;
  originals and job history remain.
- Engine Restore republishes a known-good version and retains history.
- Database corrections should be new forward migrations reviewed against a
  read-only preview of affected counts; never edit an applied migration.

## Updated inventories

- `docs/ENGINE_PLATFORM_INVENTORY_2026-07-21.md`: 45 pages, 100 API routes,
  92 components, 95 migrations.
- `docs/OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md`: all 100 API
  routes, both Netlify functions, and 19 provider entry points classified.
- `src/i18n/generated-source-messages.ts`: 638 extracted platform messages from
  310 TypeScript files; coverage state remains visible in Engine.
- The searchable founder handbook is embedded in
  `src/components/admin/EngineControlCenter.tsx`.
