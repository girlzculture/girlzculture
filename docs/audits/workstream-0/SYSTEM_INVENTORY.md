# Girlz Culture Workstream 0 — System Inventory

**Baseline:** `52af829ae8934a6607c32e1372c55d9f846d2d1b`  
**Repository:** `girlzculture/girlzculture`  
**Purpose:** Evidence inventory only. This document does not authorize product changes.

## 1. Repository structure

| Path | Purpose | Audit observation |
|---|---|---|
| `src/app/` | Next.js App Router pages and route handlers | Public, customer, salon, Admin and internal acceptance surfaces coexist in one application |
| `src/components/` | Public, customer, salon-owner and Admin components | Large component surface; historical inventory counted more than 100 components |
| `src/lib/` | Auth, business logic, integrations, monitoring and utilities | Contains canonical guards but also feature-specific alternatives |
| `src/i18n/` | Bundled messages and generated source registry | Four bundled interface locales; broader locale registry is database-driven |
| `supabase/migrations/` | Ordered schema and business-logic migrations | 136 migrations verified at baseline |
| `scripts/` | Static verifiers, generators and clean-database runner | Very broad verification surface; many tests validate source shape |
| `scripts/sql/` | PostgreSQL prerequisites and assertions | Used by clean-database verification |
| `tests/browser/` | Playwright browser acceptance | Multiple device/browser projects and gated internal harness |
| `netlify/functions/` | Scheduled operational functions and helpers | 3 scheduled functions, 2 helper modules |
| `.github/workflows/` | CI, migration and feature gates | 9 active workflow files |
| `docs/` | Architecture, acceptance and historical completion reports | Numerous historical reports; several are stale relative to 136 migrations |
| `.tools/git/` and `git.zip` | Bundled Git tooling | Repository bloat/non-product material; should be reviewed later, not deleted in this audit |

This is a single Next.js application rather than a multi-package workspace. `package.json` is private and npm is the package manager.

## 2. Runtime architecture

```text
Browser / mobile web
  → Netlify CDN and Next.js runtime
  → Next.js App Router pages and API route handlers
  → Supabase Auth + PostgreSQL + Storage/RLS
  → Stripe / Stripe Connect
  → Resend email
  → Twilio SMS
  → Web Push
  → Google Maps JavaScript / Places
  → Cloudinary or configured media storage
```

Operational paths also use:

```text
Netlify scheduled function
  → protected API/RPC or database operation
  → platform error monitoring
  → Platform Admin Incident Queue
```

## 3. Route and screen inventory

The repository/build inventory identifies 68 page files. GitHub code search found 125 API `route.ts` files under `src/app/api`; the operational-monitoring verifier reported 124 monitored API routes. The one-route discrepancy should be reconciled with a local generated inventory.

### Public and customer routes

| Route/pattern | Source family | Auth | Purpose | Status |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Public | Homepage, discovery, promotions | Real; production/provider acceptance still required |
| `/about` | `src/app/about/page.tsx` | Public | Published About hero and carousels | Real, realtime/content tests exist |
| `/salons` | `src/app/salons/page.tsx` | Public | Nearby/destination salon discovery and map/list | Real; Google provider unverified |
| `/search` | `src/app/search/page.tsx` | Public | Service/salon/location search | Real |
| `/styles` | `src/app/styles/page.tsx` | Public | Browse published services/styles | Real |
| `/salon/[slug]` | `src/app/salon/[slug]/page.tsx` | Public | Salon profile | Real |
| `/salon/[slug]/stylist/[stylistSlug]` | dynamic page family | Public | Stylist profile | Real where published |
| `/salon/[slug]/book` | dynamic page family | Public/guest | Select service/stylist/time | Real |
| `/salon/[slug]/checkout` | dynamic page family | Public/guest | Booking and optional commerce checkout | Real but payment architecture unresolved |
| `/booking/manage/[token]` | dynamic page family | Guest token | Secure booking management | Real |
| `/account` | `src/app/account/page.tsx` | Customer | Customer dashboard | Real |
| `/login` and auth flows | auth page family | Public | Customer authentication/recovery | Real |
| `/complaint` | public page family | Public | Complaint intake | Real |
| `/contact`, `/help` | public page family | Public | Support/help | Real |
| `/legal` and legal pages | public content family | Public | Policies and legal content | Content exists; versioned acceptance incomplete |
| `/partner` | partner page family | Public | Salon partnership/application entry | Real |
| `/plans` | public page family | Public | Subscription plan comparison | Unsafe until plan model reconciled |
| `/featured` | public page family | Public | Featured Salon placements | Real Admin-controlled campaign output |
| `/trending` | public page family | Public | Trending video campaigns | Real Admin-controlled campaign output |
| `/products`, `/product/[id]` | commerce page family | Public | Product listings and product detail | Real foundation; launch unsafe |
| `/reserve` | commerce page family | Public | Pickup reservation | Real foundation |
| `/blog`, `/careers`, `/social` | content page families | Public | Editorial/company/social content | Content-driven |

### Salon routes

| Route/pattern | Auth/tenant rule | Purpose | Status |
|---|---|---|---|
| `/salon/login` | Salon scope | Owner/team authentication | Real |
| `/salon/application` | Public/applicant | Submit application | Real |
| `/salon/onboarding` | Owner only | Readiness/checklist | Real but incomplete against full handoff |
| `/salon/dashboard` and section routes | Owner/team permission | Profile, catalog, availability, bookings, messages, earnings, subscription, promotions | Broad real implementation |
| Vanity route `/{vanity_slug}` | Public and collision-reviewed | Short salon profile URL | Real |
| `/api/salon/*` | `requireSalonOwner` / `requireSalonPermission` | Salon operations | Mostly canonical; route-by-route differences remain |

### Platform Admin routes

| Route/pattern | Auth/permission | Purpose | Status |
|---|---|---|---|
| `/admin/login` | Admin-domain + MFA | Platform Admin login | Real |
| `/admin` | Active Admin identity | Overview | Real |
| `/admin/[section]` | Permission-specific | Major Admin modules | Real |
| `/admin/[section]/[recordId]` | Permission + record access | Record workspaces | Real |
| `/admin/content` | Content permission | Content and Service Catalog | Real |
| `/admin/submissions` | Submissions permission | Application queue | Real |
| `/admin/engine` through section routing | Engine permission | Incidents/system status/config | Real |
| `/api/admin/*` | `requireAdminPermission` in most routes | Controlled Admin actions | Broad real implementation |

### Internal acceptance routes

| Pattern | Gate | Data | Classification |
|---|---|---|---|
| `/internal/acceptance/*` | `NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS=true`; otherwise 404 | Local acceptance fixture | Decorative or mocked for production; legitimate test harness |

Examples include content/promotion, decision search, discovery state, homepage order, map provider, media upload, mobile cards, owner workflows, salon profile, spreadsheet and style-catalog acceptance pages.

## 4. API and service inventory

### Authentication and identity

| Interface | Authentication/authorization | Main operations |
|---|---|---|
| Auth login/MFA/password-reset/signup routes | Supabase Auth, Admin domain checks, trusted-device/MFA | Session establishment and recovery |
| `requireAdmin` / `requireAdminPermission` | Active `platform_identities`, Admin row and permission | Canonical Admin guard |
| `requireSalonOwner` / `requireSalonPermission` | Active identity, owned salon or active team membership | Canonical salon tenant guard |
| Identity Admin APIs | Super Admin/settings permissions | Invite, update, disable, deletion preparation |

### Booking and availability

| Interface | Main operations | Evidence |
|---|---|---|
| `/api/discovery/salons` | Authorized server-side discovery projection | `discover_nearby_salons_ranked` |
| Booking availability routes | Date/time calculation and conflict checks | Availability migrations/verifiers |
| `/api/stripe/booking-checkout` | Server price/availability validation, atomic hold, Stripe session | Checkout route and RPCs |
| Stripe webhook | Booking completion, refunds, billing and commerce events | Signature and idempotency logic |
| Booking lifecycle APIs | Reschedule, cancellation, check-in, start, complete, no-show | Feature-specific routes/RPCs |
| Admin manual booking | Salon/service/stylist/availability, checkout link or override | PR #47 routes/components |

### Content and marketing

| Interface | Main operations | Status |
|---|---|---|
| Admin content APIs | Draft/publish/archive page and section content | Real |
| Service Catalog APIs | Categories, master services, add-ons, spreadsheet import | Real |
| Featured campaign API/RPC | Save, archive, restore, delete, expire | Real Admin-controlled system |
| Trending campaign API/RPC | Video campaign and moderation lifecycle | Real Admin-controlled system |
| Public featured/trending discovery | Eligible local placements | Real |
| Salon self-service advertising purchase | Inventory reservation, payment, review and reporting | Not found |

### Support, trust and reviews

| Interface | Main operations | Status |
|---|---|---|
| `/api/support` | Public ticket intake and moderation | Real |
| `/api/complaints` | Salon selection, booking verification, complaint + support ticket | Real |
| Admin support assignment/read/respond routes | Permissioned assignment, idempotent response, email outbox | Real |
| Reviews/disputes APIs | Verified review creation, salon reply, dispute/moderation | Partial against full policy system |
| Policy acceptance/appeal/strike APIs | Version acceptance, appeal, enforcement | Not found as complete system |

### Finance and commerce

| Interface | Main operations | Status |
|---|---|---|
| `/api/admin/finance` | Booking, subscription, billing and commerce summaries | Real |
| Booking payout route/RPC | Reserve/finalize connected-account transfer | Real but overlaps destination-transfer flow |
| Subscription checkout/change/portal | Signup, plan changes and portal | Real mechanics, unsafe plan model |
| Commerce checkout and completion | Product and combined checkout | Real foundation, unsafe launch architecture |
| Product/pickup/order/refund routes | Listing, inventory, order lifecycle and refunds | Partial/unsafe |

## 5. Database and schema inventory

The complete object inventory is too large for one table; the groups below identify the authoritative domains and major objects. Exact row-level requirement links are in the matrix.

| Domain | Major tables/views/functions/triggers |
|---|---|
| Identity and auth | `platform_identities`, `admin_users`, salon ownership/team tables, MFA/security events, identity deletion jobs |
| Salons/onboarding | `salons`, `salon_applications`, application documents, publication overrides/audits, readiness reconciliation functions |
| Catalog | `service_categories`, `master_styles`, `styles`, `style_materials`, stylist assignments, spreadsheet import objects |
| Availability/bookings | `availability`, `bookings`, slot/checkout intent objects, booking state and reference functions |
| Communications | `booking_messages`, notifications, push subscriptions, support tickets, email outbox |
| Reviews/complaints | `reviews`, complaint logs, dispute/moderation fields |
| Payments/finance | booking financial events, refund operation audit, Stripe webhook events, payout attempts, billing events |
| Subscriptions | subscriptions, change requests, invoices/billing-related state, plan-dependent application configuration |
| Marketing | marketing entitlements, Featured Salon campaigns/audit, trending campaigns/audit, homepage promotional content |
| Content | content pages, sections, published payloads, localization content |
| Localization | supported locales, translation entries/requests/review/version data |
| Media | upload sessions, attachments, renditions and cleanup state |
| Monitoring | platform error events, occurrences, affected businesses, alert rules, record-management events |
| Commerce | products, variants, inventory/reservations, checkout intents, orders/items, product refunds |
| Engine/config | engine settings, change/control metadata and feature configuration |

### Schema strengths

- Foreign keys, checks, exclusions and unique constraints are widely used.
- RLS is broad and tested.
- Critical mutations often use `security definer` RPCs with explicit grants.
- Booking and product references passed concurrent uniqueness tests.
- Migrations are ordered and production migration history is reconciled.

### Schema concerns

- Audit/event semantics are split across many domain-specific tables.
- Subscription entitlements remain hardcoded in TypeScript rather than authoritative records.
- Payment state does not implement the handoff’s required authorization/capture model.
- Product tax/MOR fields cannot substitute for approved business/legal architecture.
- Historical migrations and production hand-edits required reconciliation, increasing future migration-governance importance.

## 6. Jobs and schedules

| Job/function | Trigger/schedule | Retry/idempotency | Failure visibility |
|---|---|---|---|
| `booking-reminders` | `*/15 * * * *` | Worker-level claiming/dedup foundations | Monitoring helper/incidents |
| `media-cleanup` | `15 4 * * *` | Cleanup state and bounded processing | Monitoring helper/incidents |
| `pickup-reservation-cleanup` | `*/15 * * * *` | Reservation expiry | Monitoring helper/incidents |
| Stripe webhook | Provider event | Signature + event dedupe; provider retries on 500 | Stripe event status + incident |
| Support response email | Admin action and outbox claim | Idempotency key and claim/complete RPCs | Delivery status + incident |
| Campaign expiry/activation | Database/admin invocation foundations | Status predicates | Audit records; scheduling mechanism not fully evidenced |
| Video processing | Protected job APIs | Auth/lifecycle verifiers | Incident monitoring |
| Translation processing | Request/review foundations | Partial | Coverage and provider state incomplete |

No universal queue, dead-letter, replay and job-administration framework was found.

## 7. Third-party integrations

| Integration | Configuration names | Current status |
|---|---|---|
| Supabase Auth/DB/Storage | `NEXT_PUBLIC_SUPABASE_URL`, anon key, service role, project/access/password vars | Core integration real; production schema migrated |
| Stripe/Connect | secret/publishable/webhook and price IDs | Real code; architecture/provider acceptance unresolved |
| Resend | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Real sender; live delivery not verified |
| Twilio SMS | account SID, token, phone/from number | **Configuration drift:** runtime reads `TWILIO_PHONE_NUMBER`, example documents `TWILIO_FROM_NUMBER` |
| Web Push | VAPID keys | Code and subscriptions exist; provider/browser acceptance partial |
| Google Maps/Places | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, server key | Loader, autocomplete and map exist; real provider test skipped |
| Cloudinary/media storage | cloud name/API/notification secret | Media pipeline exists; live provider status not verified |
| Search | PostgreSQL normalization and RPCs | Real; no external index |
| Translation | database catalogs and optional generation/review | Partial; no complete provider/reviewer operation |
| WhatsApp | None found | Missing |
| Meta/TikTok/YouTube ads | None found for campaign execution | Missing |
| Google Business Profile | Stored URL/checklist fragments only | No claim/verification API integration |
| Netlify | linked production site, Next.js plugin, schedules | Production deploy ready/published |
| GitHub Actions | 9 workflows | Strong but fragmented; main does not require them |

No secret values are included.

## 8. Roles and permissions

### Roles found

- public/anonymous visitor;
- authenticated customer;
- salon owner;
- salon team member/employee;
- stylist linked to a user where applicable;
- Platform Admin;
- Super Admin;
- permission-specific Admin capabilities such as finance, marketing, content, support, submissions, settings and engine;
- service role for trusted server operations.

### Enforcement layers

| Layer | Mechanism | Observation |
|---|---|---|
| Page/runtime surface | subdomain/host/session scope | Public, Admin and salon hosts are separated in application behavior |
| API | canonical require-functions | Strong for most protected routes |
| Database | RLS, RPC grants and FKs | Strong broad coverage |
| Media | role/tenant folder and record checks | Strong |
| Admin identity | domain, status, identity and MFA | Strong |
| Messages | custom participant/admin logic | Overlaps canonical guard and needs consolidation |
| Background jobs | job-specific secrets/auth | Present but not one universal model |

### Known permission gaps/uncertainties

- No authenticated production role test was run during the audit.
- The booking-message Admin check is not identical to `requireAdminPermission`.
- Conversation support-access records are missing.
- High-risk action approvals are not represented by one approval engine.
- `main` release permissions are not protected by branch rules.

## 9. Domain events and audits

### Existing event/audit families

- `record_management_events`
- identity and Admin security events
- booking financial events
- billing/subscription events
- refund operation audit
- Featured Salon campaign audit
- Trending campaign audit
- publication/content audits
- platform error events and occurrences
- support response outbox/history
- lifecycle/status-specific audit records

### Status

These records provide valuable history but do not form one versioned domain-event system. No repository-wide `domain_events` envelope, event version, correlation ID requirement, publisher/outbox guarantee, consumer registry or complete event dictionary was found.

## 10. Notifications

| Channel | Current implementation | Gaps |
|---|---|---|
| In-app | Notification tables and dashboard displays | Preference/consent and universal delivery status incomplete |
| Email | Resend helper, booking/order/support messages | Provider acceptance and template/language coverage incomplete |
| SMS | Twilio helper | Env-name mismatch; silent skipped behavior; no preference center |
| Push | VAPID/web-push foundations | Live device acceptance incomplete |
| WhatsApp | None found | Missing |
| Chat | Booking messages plus cross-channel notifications | Delivery receipts/retry/export incomplete |

Quiet hours, channel preference center, comprehensive opt-out and full language-specific templates were not found.

## 11. Monitoring and error handling

### Existing

- monitored API wrappers;
- monitored scheduled functions;
- fingerprints and occurrences;
- safe public error references;
- environment/release context;
- affected salon/business records;
- assignment, notes, status and resolution fields;
- CSV and JSON export;
- recursive secret redaction;
- CSV injection protection;
- export audit;
- system-status route;
- CI monitoring verification.

### Missing or weak

- incident bundle;
- explicit category/environment/route/date/release filters;
- duplicate linking;
- bulk assignment;
- failed-job reprocessing;
- controlled webhook replay;
- domain-specific failed-payment/refund/chat/translation/ad/search dashboards;
- automated regression-release linkage.

## 12. Testing inventory

| Category | Current evidence |
|---|---|
| Static/source verifiers | Large number of Node scripts, many matching source and migration invariants |
| Database integration | Clean PostgreSQL 17 migration/application assertions |
| Browser/E2E | Playwright with Chromium/Firefox/WebKit/device projects |
| Accessibility | Some keyboard/focus/responsive assertions; no comprehensive axe-style gate |
| Security | RLS, auth, role, upload, CSP, dependency and permission verifiers |
| Provider tests | Google provider test exists but was skipped; Stripe provider acceptance not demonstrated |
| Coverage | No code coverage report or threshold found |
| Test data | Gated acceptance fixture, clean database prerequisites and sample records |
| CI | Feature workflows plus release-candidate and database workflow |

### Baseline validation result

- 136 migrations: passed.
- TypeScript: passed.
- ESLint: passed with 7 warnings.
- Next.js production build: passed.
- Playwright: 87 passed, 6 skipped.
- Dependency audit: 0 vulnerabilities.
- Netlify deploy preview and production deploy: successful.

## 13. Demonstration and hardcoded content

Identified categories:

- gated internal acceptance routes;
- local acceptance Supabase fixture and sample records;
- historical sample/AI-generated salons and content in fixtures/documents;
- hardcoded subscription plans, prices and entitlements in `src/lib/plans.ts`;
- fallback content and provider-safe placeholders;
- hardcoded interface messages despite localization infrastructure;
- default tax code and tax-disabled zero behavior;
- historical inventory/completion documents with stale counts.

The audit did not query production rows, so it cannot determine which sample salons remain publicly visible.

## 14. Incomplete/nonfunctional interface inventory

Evidence-backed incomplete areas:

- complete Super Admin policy/version/appeal/strike controls;
- salon self-service advertising marketplace;
- complete booking conversation export/support-access controls;
- full communication preference center/WhatsApp;
- cohort/waitlist/demand dashboard;
- provider-backed Google setup workflow;
- complete attribution reporting;
- payment authorization/grace/capture interface;
- authoritative configurable subscription plan/entitlement editor;
- incident bundle and replay controls;
- complete accessibility/contrast audit.

No claim is made that every button in the live UI was tested; authenticated production navigation was outside available access.

## 15. Dead-code and repository-hygiene inventory

Potentially obsolete or non-product material requiring later verification:

- `.tools/git/` bundled binaries and libraries;
- `git.zip`;
- numerous historical audit/completion reports;
- many stale feature/hotfix branches;
- feature-specific workflows whose triggers may no longer match the current development branch;
- internal acceptance routes gated off in production;
- historical one-time migration/repair code retained in migration history.

Nothing was deleted or labelled dead solely from one search. Each item requires import/runtime/branch-history verification before cleanup.

## 16. Duplicate-system inventory

| Domain | Overlap | Apparent authoritative direction |
|---|---|---|
| Payments | Destination transfers during checkout plus Admin booking payout transfer | Must be resolved by approved Stripe architecture |
| Events/audits | Many feature-specific audit/event tables | Preserve facts; add canonical versioned event/outbox layer |
| Admin auth | Canonical guards plus custom message-route logic | Canonical `requireAdminPermission` |
| Notifications | Direct sends plus outbox patterns | Durable outbox/delivery record should become standard |
| Verification | Many feature workflows and source verifiers plus release gate | Consolidate later around authoritative release gate |
| Completion docs | Multiple historical “final” documents | Current Workstream 0 audit supersedes status claims, not source history |
| Content/promotions | Homepage content, Featured campaigns, Trending campaigns | Separate purposes, but shared inventory/attribution model is missing |

## 17. Deployment architecture

- Netlify production branch: `main`.
- Build: `npm run build`.
- Publish: `.next`.
- Next.js plugin enabled.
- Node 22.
- Scheduled functions configured in `netlify.toml`.
- Current production deploy is ready/published from baseline.
- Deploy previews exist and passed for recent PRs.
- Supabase Preview check was skipped because the branch had no Supabase branch association.
- No verified dedicated staging environment was found.
- Netlify supports deploy rollback operationally, but no recent tested rollback evidence was found.
- Database migrations use a protected manual GitHub environment/workflow and an exact confirmation phrase.
- `main` has no branch protection or required checks.

## 18. Existing documentation

Useful current or historical documents include:

- database baseline and preview instructions;
- location configuration;
- founder go-live checklist;
- platform inventory;
- launch stabilization and acceptance reports;
- dashboard/content/search acceptance;
- production correction reports;
- operational monitoring route inventory;
- migration/release documentation.

Historical reports must be read with their commit/date because counts and completion claims have changed.

## Audit source snapshot and evidence index

The hardening pass indexed 780 tracked source, configuration and test files while excluding dependencies, build output, temporary audit workflows and the audit documents themselves.

Candidate search results were not treated as proof. Paths had to exist; positive evidence had to pass a two-term semantic gate; direct evidence includes line excerpts; routes and database objects come from real declarations; and missing capabilities use negative evidence.

The temporary export and hardening workflows are removed before the final audit commit.
