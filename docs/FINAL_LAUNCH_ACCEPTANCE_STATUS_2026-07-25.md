# Final launch acceptance status

Date: 2026-07-25  
Branch: `codex/final-launch-acceptance-corrections`  
Draft pull request: `https://github.com/girlzculture/girlzculture/pull/23`

This report deliberately separates repository implementation, clean-database
execution, Supabase Preview application, provider verification, and production
state. No production deployment, migration, provider, DNS, or data action is
authorized or represented as complete by this pull request.

## Acceptance status

| Requirement | Code implemented | Migration tested | Migration applied to Preview | Provider configured | Provider tested | Production deployed | Live verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 unified design system | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P1 numeric editing | Complete | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |
| P2 verified guest reviews | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P3 compact booking references | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P4 availability hardening | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P5 cancellation attribution | Complete | Complete | Blocked | Blocked | Blocked | Not applicable | Not applicable |
| P6 refund and payout accounting | Complete | Complete | Blocked | Blocked | Blocked | Not applicable | Not applicable |
| P7 salon finance | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P8 branding upload | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P9 all-language localization | Not complete | Complete | Blocked | Blocked | Blocked | Not applicable | Not applicable |
| P10 mobile location onboarding | Complete | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |
| P11 mobile salon-card navigation | Complete | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable |
| P12 operational video processing | Complete | Complete | Blocked | Blocked | Blocked | Not applicable | Not applicable |
| P13 Engine search/usability | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P14 curated homepage products | Complete | Complete | Blocked | Not applicable | Not applicable | Not applicable | Not applicable |
| P15 Reserve for Pickup | Complete | Complete | Blocked | Blocked | Blocked | Not applicable | Not applicable |
| P16 authenticated Preview audit | Not applicable | Complete | Blocked | Blocked | Blocked | Not applicable | Not applicable |

`Blocked` means the connected Supabase Preview branch, Netlify Deploy Preview,
provider credentials, or Preview test identities are not available. It does not
mean that production should be used as a substitute.

## P0 design-system evidence

Semantic tokens:

| Role | Value |
| --- | --- |
| Charcoal / primary text | `#0D1114` |
| Teal / primary action | `#0083A6` |
| Coral / warning and destructive accent | `#FF6868` |
| Light Gray / subtle surface | `#F5F7F8` |
| Mist Gray / border and disabled surface | `#E6EAED` |
| White / page and card | `#FFFFFF` |

Compatibility utility names (`plum`, `magenta`, `cream`, `blush`, and `ink`)
resolve through semantic roles so old components cannot restore the old
palette. Runtime Engine branding now maps `--gc-plum` to the heading role and
`--gc-teal` to the primary role.

The executable color audit parses hexadecimal and RGB literals in `src`,
`public`, and `netlify`. It rejects unapproved colors and allows only the six
brand roles, accessible hover/muted/status roles, the existing star-rating
gold, and white shorthand. Uploaded binary user content is not scanned.

P0 file inventory:

- Tokens/runtime/audit: `src/app/globals.css`, `src/app/layout.tsx`,
  `scripts/verify-launch-design-system.mjs`.
- Public assets: `public/file.svg`, `public/globe.svg`, `public/next.svg`,
  `public/window.svg`, `public/pwa-icon.svg`, `public/pwa-maskable.svg`.
- Public shells/pages: `src/app/about/page.tsx`, `src/app/error.tsx`,
  `src/app/featured/page.tsx`, `src/app/help/page.tsx`,
  `src/app/how-it-works/page.tsx`, `src/app/not-found.tsx`,
  `src/app/page.tsx`, `src/app/pending/page.tsx`, `src/app/plans/page.tsx`,
  `src/app/salon/[slug]/book/page.tsx`,
  `src/app/salon/[slug]/not-found.tsx`, `src/app/salon/[slug]/page.tsx`,
  `src/app/salon/[slug]/product/[productId]/page.tsx`,
  `src/app/salon/[slug]/stylist/[stylistId]/page.tsx`,
  `src/app/salon/application-submitted/page.tsx`,
  `src/app/salon/signup/page.tsx`, `src/app/salons/error.tsx`,
  `src/app/styles/page.tsx`, `src/app/testimonials/page.tsx`,
  `src/app/trending/page.tsx`.
- Shared/customer/salon/admin shells: `src/components/AdminContentManager.tsx`,
  `src/components/AdminDashboard.tsx`, `src/components/CustomerAccount.tsx`,
  `src/components/ImageUpload.tsx`, `src/components/SalonApplication.tsx`,
  `src/components/SalonBookingWizard.tsx`, `src/components/SalonReviews.tsx`,
  `src/components/SalonStyles.tsx`, `src/components/SalonStylists.tsx`,
  `src/components/admin/AdminSalonsManager.tsx`,
  `src/components/admin/SalonLifecycleSettings.tsx`,
  `src/components/admin/SearchLanguageSettings.tsx`,
  `src/components/commerce/ProductCheckoutClient.tsx`,
  `src/components/owner/OwnerDashboardApp.tsx`,
  `src/components/owner/OwnerDashboardShell.tsx`,
  `src/components/owner/StructuredCatalogEditors.tsx`.
- Public components: `src/components/public/BeautyConcierge.tsx`,
  `src/components/public/ComplaintForm.tsx`,
  `src/components/public/ContactSupportForm.tsx`,
  `src/components/public/FeaturedProductPlacement.tsx`,
  `src/components/public/FeaturedSalonPlacement.tsx`,
  `src/components/public/HelpCenter.tsx`,
  `src/components/public/MarketplaceSalonCard.tsx`,
  `src/components/public/SalonDiscovery.tsx`,
  `src/components/public/StyleCatalog.tsx`,
  `src/components/public/TrendingVideoPlacement.tsx`,
  `src/components/site/MobilePublicMenu.tsx`,
  `src/components/site/PublicChrome.tsx`,
  `src/components/site/PublicContentSections.tsx`,
  `src/components/site/SalonProfileActions.tsx`,
  `src/components/site/SearchComposer.tsx`.

Route-by-route Preview screenshots are `Blocked`: no reachable Netlify Deploy
Preview exists for PR 23 and the browser session is not authenticated to create
or configure one.

## P1-P16 changed-file inventory

- P1: `src/components/forms/NumericInput.tsx`, `src/lib/numericInput.ts`,
  `src/app/internal/acceptance/numeric/page.tsx`,
  `src/components/internal/NumericAcceptanceHarness.tsx`,
  `scripts/verify-numeric-inputs.mjs`, `tests/browser/numeric-inputs.spec.ts`,
  `playwright.config.ts`.
- P2: `src/lib/reviewAccessServer.ts`, `src/app/api/reviews/[token]/route.ts`,
  `src/app/review/[bookingId]/page.tsx`, `src/components/ReviewForm.tsx`,
  `src/components/SalonReviews.tsx`,
  `supabase/migrations/20260725101000_verified_guest_review_links.sql`.
- P3: `src/lib/bookingReference.ts`, `src/lib/bookingCommunications.ts`,
  `scripts/verify-booking-public-references.mjs`,
  `supabase/migrations/20260725102000_compact_booking_references.sql`.
- P4: `src/lib/bookingAvailabilityServer.ts`,
  `src/app/api/booking-availability/route.ts`,
  `src/lib/apiResponseClient.ts`, `src/components/SalonBookingWizard.tsx`,
  `supabase/migrations/20260725103000_availability_performance_indexes.sql`.
- P5-P7: `src/lib/bookingCancellation.ts`,
  `src/lib/bookingCancellationCore.ts`, `src/lib/financeLedgerCore.ts`,
  `src/lib/bookingCommunications.ts`,
  `src/app/api/admin/bookings/[id]/route.ts`,
  `src/app/api/salon/bookings/[id]/cancel/route.ts`,
  `src/components/owner/OwnerDashboardApp.tsx`,
  `supabase/migrations/20260725104000_authoritative_booking_finance.sql`.
- P8: `src/components/admin/BrandAppearanceManager.tsx`,
  `src/components/ImageUpload.tsx`, `src/lib/operationalMonitoringCore.ts`,
  `scripts/verify-unified-media.mjs`.
- P9: no P9-specific implementation file was added in this PR. Existing
  infrastructure in `src/components/admin/SearchLanguageSettings.tsx`,
  `src/components/BookingInbox.tsx`, and `src/lib/aiAutomationServer.ts` was
  audited; `SearchLanguageSettings.tsx` has only the P0 semantic-palette
  correction. The existing workflow preserves English, creates a draft,
  requires review/publish, supports rollback, and caches translated message
  content. Human-reviewed content is not present for all locales.
- P10: `src/components/location/CustomerLocationProvider.tsx`,
  `src/components/location/MobileLocationOnboarding.tsx`,
  `src/components/public/SalonDiscovery.tsx`,
  `src/components/search/GoogleSalonMap.tsx`,
  `tests/browser/public-responsive.spec.ts`.
- P11: `src/components/public/MarketplaceSalonCard.tsx`,
  `src/components/public/StyleCatalog.tsx`,
  `src/components/site/SalonProfileActions.tsx`,
  `src/components/commerce/ProductPurchaseActions.tsx`,
  `tests/browser/public-responsive.spec.ts`.
- P12: `src/lib/videoProcessingServer.ts`,
  `src/app/api/admin/media/video-jobs/route.ts`,
  `src/app/api/admin/engine/system-status/route.ts`,
  `src/components/admin/MediaRulesSettings.tsx`,
  `src/components/public/SafeCampaignVideo.tsx`,
  `netlify/functions/pickup-reservation-cleanup.mjs`,
  `scripts/verify-trending-video-processing.mjs`,
  `docs/CLOUDINARY_VIDEO_SETUP.md`, `.env.example`.
- P13: `src/components/admin/EngineControlCenter.tsx`,
  `src/app/api/admin/engine/system-status/route.ts`,
  `scripts/verify-final-production-correction.mjs`.
- P14: `src/components/admin/AdminFeaturedProducts.tsx`,
  `src/components/admin/AdminHomepageMarketing.tsx`,
  `src/components/admin/AdminMarketingWorkspace.tsx`,
  `src/app/api/admin/homepage-products/route.ts`,
  `src/components/public/FeaturedProductPlacement.tsx`,
  `src/app/featured/page.tsx`,
  `supabase/migrations/20260725105000_pickup_reservations_and_featured_products.sql`,
  `supabase/migrations/20260725106000_pickup_reservation_operations.sql`,
  `supabase/migrations/20260725107000_featured_product_engine_controls.sql`.
- P15: `src/lib/pickupReservationsServer.ts`,
  `src/components/commerce/PickupReservationForm.tsx`,
  `src/components/commerce/PickupReservationManager.tsx`,
  `src/components/owner/SalonProductOrders.tsx`,
  `src/app/salon/[slug]/reserve/[productId]/page.tsx`,
  `src/app/pickup/[token]/page.tsx`,
  `src/app/api/pickup/[token]/route.ts`,
  `src/app/api/stripe/pickup-reservation/route.ts`,
  `src/app/api/stripe/webhook/route.ts`,
  `src/app/api/commerce/pickup-cleanup/route.ts`,
  `src/app/api/salon/product-orders/route.ts`,
  `netlify/functions/pickup-reservation-cleanup.mjs`,
  `netlify.toml`, the P14/P15 migrations listed above.
- P16: `tests/browser/public-responsive.spec.ts`,
  `tests/browser/numeric-inputs.spec.ts`, `playwright.config.ts`,
  `scripts/sql/verify-clean-database.sql`,
  `scripts/verify-clean-database.mjs`,
  `scripts/verify-operational-monitoring.mjs`,
  `docs/FINAL_LAUNCH_ACCEPTANCE_MIGRATIONS_2026-07-25.md`, this report.

The draft PR Files tab is the canonical line-by-line inventory for the complete
148-file diff from `origin/main`.

## Migration order and impact

All eight files are new and forward-only:

1. `20260725100000_unified_launch_brand_tokens.sql`
2. `20260725101000_verified_guest_review_links.sql`
3. `20260725102000_compact_booking_references.sql`
4. `20260725103000_availability_performance_indexes.sql`
5. `20260725104000_authoritative_booking_finance.sql`
6. `20260725105000_pickup_reservations_and_featured_products.sql`
7. `20260725106000_pickup_reservation_operations.sql`
8. `20260725107000_featured_product_engine_controls.sql`

The exact insert/update/backfill behavior, read-only affected-count query, and
post-apply assertions are in
`docs/FINAL_LAUNCH_ACCEPTANCE_MIGRATIONS_2026-07-25.md`.

Clean migration execution is `Complete`: GitHub Actions run
`30189209909` applied all 103 repository migrations to an empty PostgreSQL 17
database and passed schema, function, RLS, grant, index, and repository-head
assertions.

Supabase Preview migration application is `Blocked`: the PR check reports that
the Git branch is not associated with a Supabase branch. No migration was
marked applied manually.

## Localization coverage

Seeded locale records:

`en`, `es`, `fr`, `ht`, `pt`, `zh-CN`, `zh-TW`, `fil`, `vi`, `ko`, `ja`,
`ar`, `ru`, `uk`, `pl`, `de`, `it`, `el`, `he`, `fa`, `hi`, `ur`, `bn`,
`pa`, `gu`, `ta`, `te`, `ne`, `th`, `id`, `sw`, `am`, `so`, `yo`, `ig`,
`ak`, `wo`.

| Localization milestone | Status |
| --- | --- |
| Runtime/Engine workflow and 37 locale records | Complete |
| English source preserved | Complete |
| OpenAI draft adapter implemented | Complete |
| Provider configured in Preview | Blocked |
| Draft generated for all 37 locales | Not complete |
| Human reviewed for all 37 locales | Not complete |
| Published for all 37 locales | Not complete |
| Browser verified for all surfaces/locales | Blocked |

French, Spanish, and Wolof have executable dashboard-resolution fixtures.
English fallback remains safe, but the platform must not advertise every
locale as fully translated until provider generation and human review finish.

## Video provider status

Repository integration uses Cloudinary because it provides asynchronous,
Netlify-compatible server-side video transformation, H.264/AAC MP4 output,
poster generation, processing state, retries, and deletion APIs without running
FFmpeg inside request functions.

| Video milestone | Status |
| --- | --- |
| Cloudinary server integration | Complete |
| Missing-provider response is clear 503 | Complete |
| Engine Test Connection endpoint | Complete |
| Compatible/incompatible executable fixtures | Complete |
| Cloudinary account configured in Preview | Blocked |
| Real provider-backed fixture processed | Blocked |

Required server-only Preview variables:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CRON_SECRET`

Setup and verification are documented in `docs/CLOUDINARY_VIDEO_SETUP.md`.

## Verification results

| Verification | Result |
| --- | --- |
| TypeScript through production build | Complete |
| ESLint | Complete: zero errors, four existing `<img>` advisories |
| Production build | Complete: 123 routes |
| Dependency audit | Complete: zero vulnerabilities |
| Migration order | Complete: 103 unique migrations |
| Repository verification scripts | Complete: 51 locally runnable scripts |
| Local clean-database guard | Blocked: no disposable `CLEAN_DATABASE_URL` |
| CI clean PostgreSQL 17 execution | Complete |
| Numeric Playwright suite | Complete: 9 passed, 3 capability skips |
| iPhone location onboarding | Complete |
| Android location onboarding | Complete |
| Public responsive shell route checks | Blocked |
| Authenticated role/RLS matrix | Blocked |
| P16 five-workflow Preview audit | Blocked |
| Netlify Preview screenshots | Blocked |

The public shell tests reach their final console-safety assertion locally. They
then fail because local environment variables point at a database that does not
contain this PR's new `homepage_product_placements` table. The server records a
sanitized monitored `PGRST205` and the browser receives safe language. The test
is not weakened to conceal the missing Preview migration.

## P16 environment blockers

The following cannot be executed safely against production and therefore
remain `Blocked`:

- mobile salon dashboard navigation, writes, notifications, and overflow;
- mobile platform-admin Finance, Engine, monitoring, and Marketing;
- completed-booking guest review reuse/concurrency;
- Quality & Performance actor attribution and metrics;
- admin-curated product propagation and out-of-stock removal;
- guest/customer/salon owner/team member/limited admin/super admin RLS;
- Stripe refund/reversal/pickup deposit provider behavior;
- Cloudinary real transcode;
- all-route desktop/tablet/mobile screenshots and accessibility/console sweep.

## Founder actions for Preview acceptance

1. In Supabase, associate
   `codex/final-launch-acceptance-corrections` with a data-less Preview branch
   for PR 23 and allow the connected integration to execute the migrations.
2. In Netlify, enable Deploy Previews for PR 23 and provide the resulting URL.
   Do not deploy this branch to production.
3. Add Preview-only Supabase/Stripe/Resend/Cloudinary/OpenAI/Maps variables
   described in `.env.example`; never place server secrets in `NEXT_PUBLIC_*`.
4. Create or provide Preview-only identities for guest, customer, salon owner,
   team member, limited admin, and super admin. Do not reuse production users.
5. Complete human review and publication for each target locale after provider
   drafts are generated.

After those actions, rerun the P16 matrix and attach desktop, tablet, iPhone,
Android, keyboard, accessibility, overflow, broken-image, console, monitoring
reference-parity, and role/RLS evidence to PR 23.

## Rollback and recovery

- Before merge: close the draft PR or revert its commits. Production is
  unchanged.
- Preview: delete and recreate the disposable Supabase branch if test data or
  schema must be reset; never repair history by marking migrations applied.
- After a later authorized production migration: use new forward corrective
  migrations only. Do not edit or roll back an applied migration file.
- Brand settings retain Engine change history and can be restored through the
  governed restore workflow.
- Translation originals and prior published versions are retained.
- Media sources remain staged until a compatible derivative succeeds; cleanup
  is authenticated and bounded.
- Stripe webhook idempotency, finance events, and recovery balances preserve
  evidence; do not rewrite payment history to simulate rollback.

## Production safety

| Action | Status |
| --- | --- |
| Production merge | Not applicable |
| Production deploy | Not applicable |
| Production migration | Not applicable |
| Production provider change | Not applicable |
| Production DNS change | Not applicable |
| Production test-data write | Not applicable |
| Production verification | Not applicable |

No production action occurred during this pass.
