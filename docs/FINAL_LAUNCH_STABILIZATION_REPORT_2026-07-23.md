# Final launch stabilization report

Date: July 23, 2026  
Branch: `codex/final-launch-stabilization-branding`  
Base: `main` at `c9dc2d1`  
Scope: launch-stabilization Sections 1–15

## Release status

The repository implementation for Sections 1–14 is complete and committed.
The full application regression suite, TypeScript, lint, production build, and
read-only local desktop smoke tests pass.

This branch has **not** been merged, deployed, or applied to a production
database. No production provider, DNS record, user record, booking, payment, or
other production data was changed.

| Status boundary | Result |
|---|---|
| Code implemented | Complete for Sections 1–14 |
| Migration created | Complete where listed below |
| Automated application verification | Passed |
| Local desktop read-only smoke test | Passed |
| Clean empty-database execution | Passed in GitHub Actions: 85/85 migrations plus post-migration assertions and 148 public policies |
| Netlify deploy preview | Passed and available for read-only smoke testing |
| Preview migration applied | Not performed |
| Preview provider workflows | Not performed |
| Production migration applied | Not performed |
| Production verified | Not performed |
| Merge/deploy/DNS/provider changes | Not performed |

## Section results

### 1. Salon session and realtime resilience

- **Status:** Complete in code; automated verification passed; not production
  verified.
- **Root cause:** Realtime provider failures were coupled to generic auth/error
  handling, so a temporary channel failure could replace the dashboard or appear
  to invalidate the owner session. Retry, fallback polling, and cleanup behavior
  were not centralized.
- **Resolution:** Realtime listeners are registered before subscription, channels
  are cleaned up on unmount, retries use bounded exponential backoff, polling
  continues during outages, and the authenticated session remains intact. The UI
  shows a nonblocking live-update notice and clears it after recovery.
- **Key files:** `src/lib/ownerRealtime.ts`,
  `src/components/owner/OwnerDashboardApp.tsx`,
  `src/lib/supabaseFetchPolicy.ts`, `src/lib/supabase.ts`,
  `scripts/verify-owner-session-realtime.mjs`.
- **Migration:** None.
- **Commit:** `bea551a`.
- **Automated test:** `npm run verify:owner-realtime`.
- **Not tested:** A real Supabase Realtime 503 and cross-device token refresh in a
  deployed preview.

### 2. Automatic location-based discovery

- **Status:** Complete in code; automated verification and local query-based
  smoke tests passed; deployed IP-resolution not verified.
- **Root cause:** Discovery waited for manually entered location data. It had no
  server IP-location resolver, durable navigation synchronization, or provider
  fallback contract.
- **Resolution:** Added privacy-respecting server/Netlify Edge approximate
  location resolution, optional configured fallback provider, previously granted
  precise-location reuse, location persistence, URL/navigation synchronization,
  Engine radius support, distance-first filtering, truthful empty states, and
  list preservation when maps fail. Distant/unpaid salons are never inserted to
  fill rows.
- **Key files:** `netlify/edge-functions/approximate-location.ts`,
  `src/app/api/location/resolve/route.ts`,
  `src/components/location/CustomerLocationProvider.tsx`,
  `src/app/api/discovery/*`, `src/lib/location.ts`,
  `src/lib/approximateLocationCore.ts`.
- **Migration:** None.
- **Commit:** `c8bead8`.
- **Environment:** Optional `IP_GEOLOCATION_PROVIDER_URL` and
  `IP_GEOLOCATION_API_KEY`. Netlify `context.geo` works without these values.
- **Automated tests:** `npm run verify:auto-location`,
  `npm run verify:search-location`, `npm run verify:location`,
  `npm run verify:discovery`, `npm run verify:connected-discovery`,
  `npm run verify:featured`, `npm run verify:trending`.
- **Manual test:** At `/?location=Texas&lat=31&lng=-99`, nearby salons render
  first, and Featured/Trending use truthful local empty states instead of distant
  filler. Loopback IP does not provide approximate geolocation, as expected.
- **Not tested:** Netlify production/preview `context.geo`, a configured fallback
  provider, browser permission prompts, or real Maps outage behavior.

### 3. Booking confirmations, receipts, and cancellations

- **Status:** Complete in code; automated verification passed; email/SMS provider
  delivery not preview verified.
- **Root cause:** Booking communications did not use one normalized financial and
  appointment breakdown, and editable templates could omit required receipt
  fields.
- **Resolution:** Added configurable, localization-ready templates with immutable
  required financial sections for customer/salon confirmation, cancellation, and
  reschedule notices. Communications include IDs, salon/customer details,
  timezone, service/options, prices, discount, deposit, balance, receipt,
  directions, policy, and secure management link.
- **Key files:** `src/lib/bookingCommunications.ts`,
  `src/app/api/stripe/booking-checkout/route.ts`,
  `src/app/api/stripe/webhook/route.ts`.
- **Migration:** `20260723210000_booking_communications.sql`.
- **Commit:** `7a76392`.
- **Automated test:** `npm run verify:booking-comms`.
- **Not tested:** Actual Resend/Twilio sandbox inboxes or localized live messages.

### 4. Secure guest booking management

- **Status:** Complete in code; automated verification passed; database/RLS
  preview workflow not executed.
- **Root cause:** Guest booking management lacked a scoped, revocable credential
  independent of account creation.
- **Resolution:** Added signed expiring booking-specific links, token digest
  records, revocation/rotation after sensitive actions, rate limits, access
  audits, cancel/reschedule-response support, and verified email/phone recovery.
  Account creation remains optional.
- **Key files:** `src/lib/guestBookingAccess.ts`,
  `src/lib/guestBookingTokenCore.ts`, `src/app/api/guest/bookings/*`,
  `src/app/booking/manage/[token]/page.tsx`,
  `src/app/booking/recover/page.tsx`.
- **Migration:** `20260723220000_secure_guest_booking_management.sql`.
- **Commit:** `5fbc375`.
- **Environment:** `GUEST_BOOKING_LINK_SECRET` is required server-side.
- **Automated test:** `npm run verify:guest-bookings`.
- **Not tested:** End-to-end recovery delivery or real role/RLS execution in
  Supabase preview.

### 5. Customer-approved rescheduling

- **Status:** Complete in code; automated verification passed; transaction not
  executed against preview Postgres.
- **Root cause:** The prior flow could represent consent without a verifiable,
  atomic customer response.
- **Resolution:** Salons propose genuinely available times and a message;
  customers accept or decline through the secure booking link; booking time moves
  only through a database transaction that rechecks availability, releases the
  old slot, reserves the new one, and writes the audit trail. Authorized admin
  intervention is audited.
- **Key files:** `src/lib/bookingRescheduleCore.ts`,
  `src/lib/bookingRescheduleServer.ts`,
  `src/app/api/salon/bookings/[id]/reschedule/route.ts`,
  `src/app/api/guest/bookings/manage/route.ts`.
- **Migration:** `20260723230000_customer_approved_rescheduling.sql`.
- **Commit:** `e49c5dc`.
- **Automated tests:** `npm run verify:rescheduling`,
  `npm run verify:booking-integrity`.
- **Not tested:** A concurrent two-session acceptance race on preview Postgres.

### 6. Payments and finance reconciliation

- **Status:** Complete in code; automated verification passed; Stripe sandbox and
  preview ledger not exercised.
- **Root cause:** Finance totals and rows came from different summaries and lacked
  a complete, Stripe-verified transaction model and full filtering.
- **Resolution:** Added Booking Deposits, Product Orders, Subscription Payments,
  Refunds & Disputes, Salon Payouts, and Stripe Event Ledger views; consistent
  filters/totals; completed-booking explanations; test/live labels; privacy-safe
  CSV; and verified upgrade proration/activation handling.
- **Key files:** `src/app/api/admin/finance/route.ts`,
  `src/components/admin/AdminFinanceDashboard.tsx`,
  `src/lib/financeLedgerCore.ts`, Stripe checkout/change/webhook routes.
- **Migration:** `20260723240000_finance_reconciliation.sql`.
- **Commit:** `ac10420`.
- **Automated tests:** `npm run verify:finance-reconciliation`,
  `npm run verify:billing`.
- **Not tested:** Real Stripe test webhooks, refunds/disputes/payouts, or a
  populated preview reconciliation export.

### 7. Dashboard notifications

- **Status:** Complete in code; automated verification passed; multi-role preview
  persistence not executed.
- **Root cause:** Notification sources, read state, badges, and navigation were
  fragmented between dashboards.
- **Resolution:** Added persisted notifications and recipient read state,
  deduplication keys, admin/salon notification centers, unread/menu badges,
  mark-one/mark-all actions, Escape/click-outside behavior, mobile support, and
  record navigation.
- **Key files:** `src/components/notifications/DashboardNotificationCenter.tsx`,
  `src/app/api/notifications/route.ts`,
  `src/lib/dashboardNotificationsCore.ts`,
  admin/owner dashboard shells and event routes.
- **Migration:** `20260723250000_dashboard_notifications.sql`.
- **Commit:** `f7163ae`.
- **Automated test:** `npm run verify:dashboard-notifications`.
- **Not tested:** Two live browser sessions observing persisted read-state changes.

### 8. Operational monitoring usability

- **Status:** Complete in code; automated verification passed; populated preview
  monitoring UI not manually exercised.
- **Root cause:** Operational records surfaced technical language without enough
  business impact/context, and promotion audit deletion referenced removed
  promotions.
- **Resolution:** Added customer-friendly title/explanation, severity, impact,
  business/location context, grouping/counts, recommended action, assignment,
  notes, affected-business expansion, protected technical details, and severity
  badges. Promotion deletion now preserves an immutable snapshot without a
  failing foreign-key dependency.
- **Key files:** `src/lib/operationalErrorPresentation.ts`,
  `src/components/admin/ErrorMonitoringManager.tsx`,
  `src/app/api/admin/engine/errors/route.ts`.
- **Migration:** `20260723260000_monitoring_context_promotion_audit.sql`.
- **Commit:** `f00c16b`.
- **Automated tests:** `npm run verify:monitoring-usability`,
  `npm run verify:monitoring`.
- **Not tested:** Live provider failure grouping in a deployed preview.

### 9. Localization completion

- **Status:** Complete in code for the audited source catalog and Engine workflow;
  automated coverage passed; native-speaker/manual route review remains.
- **Root cause:** Only part of the dashboard source catalog was localized, and
  internal completeness state leaked into public language controls.
- **Resolution:** Removed the public completeness label; added English, Spanish,
  French, and Wolof dashboard source coverage with English fallback; durable
  locale preference; original user-generated content preservation; Engine
  translation states; assisted ordinary-text drafting; and required human review
  for legal/payment/safety/security copy.
- **Key files:** `src/i18n/dashboard-source-catalog.ts`,
  `src/i18n/generated-source-messages.ts`,
  `src/components/i18n/*`, `src/components/admin/TranslationManager.tsx`,
  `src/app/api/admin/engine/translations/route.ts`.
- **Migration:** `20260723270000_localization_completion.sql`.
- **Commit:** `5ff0811`.
- **Automated test:** `npm run verify:localization-completion`
  (24 controls, 552 messages).
- **Manual test:** The public selector shows only English, Spanish, French, and
  Wolof; no public “Incomplete” label is rendered.
- **Not tested:** Native-speaker review of all Wolof/French/Spanish copy or a
  complete role-authenticated screenshot pass of every dashboard panel.

### 10. Trending video upload and card size

- **Status:** Complete in code; automated verification passed; no real transcoder
  or device playback matrix was available.
- **Root cause:** Files were sent directly to playback without codec inspection
  or a governed conversion job, and campaign cards were too tall.
- **Resolution:** Added secure staged upload inspection, configurable limits,
  queued processing, controlled H.264/AAC conversion contract, poster outputs,
  progress/retry/cancel states, abandoned media cleanup metadata, sanitized
  monitoring, and shorter Trending cards.
- **Key files:** `src/lib/videoProcessingServer.ts`,
  `src/app/api/admin/media/video-jobs/route.ts`,
  `src/components/admin/AdminTrendingCampaigns.tsx`,
  `src/components/public/TrendingVideoPlacement.tsx`.
- **Migration:** `20260723280000_trending_video_processing.sql`.
- **Commit:** `6e3e831`.
- **Environment:** Optional `MEDIA_TRANSCODE_ENDPOINT` and server-only
  `MEDIA_TRANSCODE_TOKEN` are required for incompatible codec conversion.
- **Automated test:** `npm run verify:trending-video-processing`.
- **Not tested:** Real conversion, cleanup worker, poster extraction, or playback
  on Safari, iOS, Android, and Firefox.

### 11. Promotion targeting and booking price enforcement

- **Status:** Complete in code; automated verification passed; transactional
  preview checkout not executed.
- **Root cause:** Promotions were displayed globally but were not consistently
  attached to targeted items or enforced from authoritative server pricing.
- **Resolution:** Eligible style/product cards show original price, discount, and
  adjusted price; offer links target the exact item; eligibility, dates, usage,
  scope, and subscription plan are checked server-side; booking checkout and
  deposit use the enforced price; immutable evidence is preserved for receipts
  after expiry.
- **Key files:** `src/lib/salonPromotions.ts`,
  `src/components/SalonBookingWizard.tsx`,
  `src/components/owner/SalonPromotionsManager.tsx`,
  `src/app/api/stripe/booking-checkout/route.ts`,
  salon style/product pages.
- **Migration:** `20260723290000_promotion_targeting_enforcement.sql`.
- **Commit:** `6226cc4`.
- **Automated test:** `npm run verify:promotion-enforcement`.
- **Not tested:** Stripe test checkout using a usage-limited promotion under
  concurrent bookings.

### 12. Engine Brand & Appearance

- **Status:** Complete in code; automated verification passed; storage-backed
  preview publishing not executed.
- **Root cause:** Brand assets were bound to code/static files and had no
  founder-managed version, preview, publish, restore, or cache-busting workflow.
- **Resolution:** Added Engine Brand & Appearance for header/light/dark/mobile
  logos, favicon, app icons, email logo, social image, and alt text; file
  guidance; crop/position data; desktop/tablet/mobile preview; publish; versioned
  cache-busting; restore; and dynamic public/email/manifest consumption.
- **Key files:** `src/components/admin/BrandAppearanceManager.tsx`,
  `src/app/api/admin/engine/brand-assets/route.ts`,
  `src/lib/brandAssets.ts`, `src/lib/brandAssetCore.ts`,
  `src/components/site/PublicChrome.tsx`, root layout and manifest.
- **Migration:** `20260723300000_engine_brand_appearance.sql`.
- **Commit:** `09a693d`.
- **Automated test:** `npm run verify:brand-appearance`.
- **Not tested:** Actual Supabase Storage upload, publish, CDN refresh, and restore
  in preview.

### 13. Dashboard subdomains and security

- **Status:** Complete in code and documentation; automated verification passed;
  DNS/TLS intentionally not configured.
- **Root cause:** Role dashboards were path-separated on one public host and had
  no opt-in host-routing boundary or documented DNS/TLS activation sequence.
- **Resolution:** Added disabled-by-default host routing for
  `dashboard.girlzculture.com/salon` and
  `mothership.girlzculture.com/superadmin`; legacy authenticated redirects;
  role-specific login/session handling; company-domain/MFA/RBAC enforcement;
  admin idle/absolute session expiry; rate limiting/audit integration; and
  noindex metadata. Authorization remains server-side/RLS based, not secrecy of
  the URL.
- **Key files:** `src/proxy.ts`, `src/lib/hostRouting.ts`,
  role login APIs/components, `docs/DASHBOARD_SUBDOMAIN_SETUP.md`.
- **Migration:** None.
- **Commit:** `de79253`.
- **Environment:** `NEXT_PUBLIC_SITE_HOST`,
  `NEXT_PUBLIC_SALON_DASHBOARD_HOST`, `NEXT_PUBLIC_ADMIN_HOST`,
  `DASHBOARD_SUBDOMAINS_ENABLED`,
  `NEXT_PUBLIC_ADMIN_IDLE_TIMEOUT_MINUTES`,
  `NEXT_PUBLIC_ADMIN_ABSOLUTE_SESSION_HOURS`.
- **Automated test:** `npm run verify:dashboard-subdomains`.
- **Not tested:** Real Netlify aliases, certificates, redirects, isolated browser
  cookies, or deployed MFA sessions.

### 14. Salon vanity URLs

- **Status:** Complete in code; automated verification passed; database-backed
  approval/redirect workflow not preview verified.
- **Root cause:** Salon profiles had only canonical `/salon/{slug}` routes and no
  governed root namespace, approval process, collision protection, redirect
  history, QR/share controls, or social metadata.
- **Resolution:** Added owner requests, admin approve/reject/change controls,
  normalized unique slugs, reserved-word and public-route collision protection,
  advisory-lock-backed transactional approval, immutable audit history,
  permanent redirects for old vanity/canonical values, preserved
  `/salon/{slug}`, social metadata, copy/share actions, QR endpoint, and
  Instagram/TikTok/Google Business links.
- **Key files:** `src/lib/salonVanity.ts`,
  `src/app/[page]/page.tsx`, `src/app/api/salons/[slug]/qr/route.ts`,
  `src/components/owner/SalonVanityManager.tsx`,
  `src/components/site/SalonProfileActions.tsx`,
  admin/owner salon APIs and UIs.
- **Migration:** `20260723310000_salon_vanity_urls.sql`.
- **Commit:** `1239aa4`.
- **Automated test:** `npm run verify:vanity-urls`.
- **Not tested:** Real owner/admin role approval, concurrent collision requests,
  external social crawlers, or printed QR scanning against preview.

### 15. Required tests and release evidence

- **Status:** Automated application matrix and real clean-database execution
  complete; local and Netlify desktop read-only smoke complete; role/RLS preview,
  provider, mobile/tablet, and production verification remain not performed.
- **Clean-database result:** The first GitHub run correctly found that
  `notifications.booking_policy_summary` used unsupported Engine
  `value_type='textarea'`. Commit `6689ceb` changed it to the established
  `rich_text` type and added a focused regression assertion. The restarted
  GitHub Actions job then executed all 85 migrations against an empty PostgreSQL
  17 database and passed post-migration object/RLS assertions with 148 public
  policies.
- **Verification changes:** Refreshed the Engine/API inventory; updated stale
  location and Featured empty-state assertions to the implemented requirement;
  added location resynchronization after back/forward and page restoration; and
  documented the optional media transcoder environment.
- **Commits:** `3f38641` (release evidence) and `6689ceb` (clean-database CI fix).

## Migration order

Apply these only to an isolated Supabase preview first, through the normal
repository migration workflow:

1. `20260723210000_booking_communications.sql`
2. `20260723220000_secure_guest_booking_management.sql`
3. `20260723230000_customer_approved_rescheduling.sql`
4. `20260723240000_finance_reconciliation.sql`
5. `20260723250000_dashboard_notifications.sql`
6. `20260723260000_monitoring_context_promotion_audit.sql`
7. `20260723270000_localization_completion.sql`
8. `20260723280000_trending_video_processing.sql`
9. `20260723290000_promotion_targeting_enforcement.sql`
10. `20260723300000_engine_brand_appearance.sql`
11. `20260723310000_salon_vanity_urls.sql`

The normal migration runner will apply all repository migrations in timestamp
order; do not mark these as applied without executing them. Back up production
before a later founder-approved production migration.

## Automated regression evidence

The following completed successfully on this branch:

- `npx tsc --noEmit`
- `npm run lint` — zero errors; four existing raw-image optimization warnings
- `npm run build` — production build complete, 115 routes
- `npm run verify:billing`
- `npm run verify:production-foundation`
- `npm run verify:location`
- `npm run verify:discovery`
- `npm run verify:admin-salons`
- `npm run verify:featured`
- `npm run verify:trending`
- `npm run verify:public-tiers`
- `npm run verify:connected-discovery`
- `npm run verify:homepage-depth`
- `npm run verify:hardening`
- `npm run verify:identity`
- `npm run verify:admin-security`
- `npm run verify:lifecycle`
- `npm run verify:search-location`
- `npm run verify:media`
- `npm run verify:i18n`
- `npm run verify:numeric`
- `npm run verify:engine`
- `npm run verify:concierge`
- `npm run verify:monitoring` — 94 API routes, 2 functions, 18 provider-backed
  points, and 10 feature groups inventoried
- `npm run verify:records`
- `npm run verify:identity-deletion`
- `npm run verify:test-data`
- `npm run verify:engine-governance`
- `npm run verify:self-audit` — 100 evidence-backed matrix rows
- `npm run verify:migrations` — 85 migration files verified
- `npm run verify:engine-expansion`
- `npm run verify:catalog-management`
- all Section 1–14 focused verifiers listed above

The local `npm run verify:database-clean` command cannot run on this Windows
workspace because no disposable `CLEAN_DATABASE_URL`, `psql`, Docker, or local
Supabase runtime is installed. This is no longer an evidence gap: the protected
GitHub Actions `verify` job supplied a disposable PostgreSQL 17 service, ran the
same executable verifier, applied migrations 1–85 in order, and reported
`clean database assertions passed` with 148 public policies.

## Local and deploy-preview manual smoke evidence

Read-only desktop testing used the production build at
`http://127.0.0.1:3200`. No form was submitted and no database was written.

These routes rendered their expected main content without horizontal overflow
at 1280×720:

- `/`
- `/about`
- `/styles`
- `/salons?location=Texas&lat=31&lng=-99`
- `/how-it-works`
- `/help`
- `/contact`
- `/login`
- `/partner`
- `/admin/login`
- `/salon/login`

Authenticated, mutation, provider, tablet, and true mobile device workflows were
not manually tested in this local environment. Responsive source checks and the
production build passed, but that is not a substitute for the preview device
matrix.

Netlify created the non-production draft preview at
`https://deploy-preview-21--girlzculture.netlify.app`. The homepage, About,
Browse Styles, How It Works, customer login, admin login, and salon login return
HTTP 200. Browser inspection confirmed automatic approximate location
(`New York, NY`), the four public language choices, expected page headings, and
no horizontal overflow on the inspected desktop routes.

The Supabase Preview integration was skipped and the migration job stayed
skipped, as required for a pull request. Consequently, database-backed discovery
requests in the Netlify preview return the shared sanitized error with a matching
reference ID instead of results. This preview environment has not been treated
as a valid provider/RLS test environment, and no attempt was made to apply
migrations or write data to the configured remote database.

## Environment and provider checklist

Keep all secrets server-only. Configure these in an isolated preview before
testing:

- Existing Supabase URL/anon/service-role values.
- `GUEST_BOOKING_LINK_SECRET`: new long random server-only value.
- Existing Stripe **test-mode** publishable/secret/webhook and price values.
- Existing Resend values and verified preview sender/reply-to configuration.
- Existing Twilio sandbox/test values if SMS is being tested.
- Existing restricted Google Maps browser/server keys.
- Existing VAPID keys if push is being tested.
- `MEDIA_TRANSCODE_ENDPOINT` and `MEDIA_TRANSCODE_TOKEN` for incompatible video
  conversion; leave absent only if conversion is intentionally not being tested.
- Optional `IP_GEOLOCATION_PROVIDER_URL` and `IP_GEOLOCATION_API_KEY`; Netlify
  Edge location does not require them.
- Keep `DASHBOARD_SUBDOMAINS_ENABLED=false` until both dashboard aliases and TLS
  certificates are verified.

No provider configuration was changed by this branch.

## Founder-controlled preview, merge, migration, Netlify, and DNS steps

1. Review the draft PR file-by-file and confirm all required checks are green.
2. Create or reset an isolated, data-less Supabase preview branch. Do not point
   any local verifier at production.
3. Confirm the protected GitHub `verify` job remains green. It has already run
   all 85 migrations plus post-migration object/RLS checks in a disposable
   PostgreSQL 17 service. If independently repeating it, provide an empty
   preview connection in `CLEAN_DATABASE_URL` and point `PSQL_BIN` to `psql`.
4. Apply the branch migrations to the Supabase preview through the repository
   migration workflow. Do not repair history as applied without execution.
5. Add the preview environment/provider values above in Netlify. Use only Stripe
   test mode and provider sandboxes/test recipients.
6. Run the Section 15 matrix in preview with customer, salon owner, salon team,
   limited admin, and super-admin accounts. Include real RLS denials, concurrent
   booking/reschedule attempts, guest recovery, notification persistence,
   finance reconciliation, brand publish/restore, and vanity approval/redirect.
7. Test Chrome, Safari, Firefox, Android, and iOS at mobile, tablet, and desktop
   widths. Exercise a compatible MP4 and an incompatible-codec MP4 through the
   configured media worker.
8. Review Engine Operational Monitoring and confirm user-visible references
   match sanitized grouped events without secrets or unnecessary personal data.
9. Only after preview approval, merge the PR using the founder-approved GitHub
   process. This branch does not merge itself.
10. Back up production, review the migration plan, and apply migrations through
    the protected production workflow. Monitor each migration and stop on error.
11. Deploy the merged commit only after migrations and provider checks succeed.
    Perform a read-only smoke test first, followed by controlled test records
    that the founder explicitly authorizes.
12. For dashboard subdomains, follow
    `docs/DASHBOARD_SUBDOMAIN_SETUP.md`: add Netlify aliases for
    `dashboard.girlzculture.com` and `mothership.girlzculture.com`; copy the exact
    `<site>.netlify.app` hostname; then add GoDaddy CNAME records
    `dashboard → <site>.netlify.app` and
    `mothership → <site>.netlify.app`, TTL 1 hour. Do not change apex A records.
13. Wait for Netlify DNS verification and valid TLS certificates on both names.
    Then set the documented host variables and
    `DASHBOARD_SUBDOMAINS_ENABLED=true` in a founder-approved deployment.
14. Verify role isolation, MFA, idle/absolute expiry, legacy redirects, noindex,
    and logout independently on both subdomains.
15. Monitor Engine errors, Stripe webhooks, email/SMS delivery, Realtime, Maps,
    media jobs, and booking integrity during launch. Keep a rollback commit and
    database backup available.

## Known remaining verification gaps

- Preview application and RLS matrix for all five roles.
- Real Supabase Realtime 503/recovery and multi-tab token renewal.
- Resend/Twilio delivery and Stripe test webhooks/reconciliation.
- Maps provider outage and Netlify IP geolocation behavior.
- Media transcoding, cleanup, poster generation, and the device playback matrix.
- Full authenticated mobile/tablet visual and interaction pass.
- Native-speaker localization review.
- Storage-backed brand publish/restore and external social metadata caching.
- Netlify subdomain, TLS, redirect, cookie/session, and vanity redirect checks.

These gaps are release gates for preview/production verification, not hidden
claims of completion.
