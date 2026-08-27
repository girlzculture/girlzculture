# Girlz Culture Workstream 0 — Current-State Audit

**Audit date:** 2026-08-27  
**Repository:** `girlzculture/girlzculture`  
**Baseline branch:** `main`  
**Baseline commit:** `52af829ae8934a6607c32e1372c55d9f846d2d1b`  
**Audit branch:** `audit/workstream-0-current-state`  
**Audit scope:** Product, frontend, backend, data, payments, operations, integrations, security, tests, deployment and the full requirements handoff.

## Executive summary

Girlz Culture is not a decorative prototype. The audited repository contains a substantial Next.js/Supabase product with public discovery, salon and customer workflows, a large Platform Admin surface, 136 ordered database migrations, 176 public-schema RLS policies, payment and refund code, product-commerce foundations, operational monitoring, scheduled jobs, responsive browser acceptance and a published Netlify production deploy.

The same evidence does **not** support the earlier blanket conclusion that the whole product is complete. The strongest launch-ready foundations are authentication and tenant boundaries, migration safety, media authorization, booking availability/slot protection, core discovery, incident capture/export, support intake/assignment, and the Admin-controlled Featured Salon workflow. The largest unresolved areas are:

1. the booking-deposit architecture does not match the required delayed-capture model;
2. subscription names, prices, entitlement logic and environment-variable names are inconsistent;
3. product commerce has unresolved merchant-of-record, tax, shipping, returns and chargeback decisions;
4. the domain-event system is fragmented across many audit/event tables rather than one versioned contract;
5. legally reviewed policy acceptance, appeals and salon enforcement are incomplete;
6. provider-backed staging acceptance is absent or incomplete for Stripe Connect, Google Maps, email and SMS;
7. `main` is unprotected even though it is the production branch;
8. advertising self-service, attribution and launch-cohort systems are substantially missing;
9. full multilingual coverage is partial;
10. recovery controls such as DLQs, webhook replay, tested backup/restore and tested rollback are incomplete.

The feature-gap matrix contains **620** independently testable rows. A large number are classified as partially implemented because useful layers exist but the handoff requires more than a page, route, table or source-pattern test.

## Scope

The audit traced, where applicable:

- public, customer, salon, stylist/employee and Platform Admin interfaces;
- route reachability and route families;
- authentication, role enforcement and tenant separation;
- API handlers, RPCs, services and scheduled functions;
- database tables, functions, triggers, constraints, indexes and RLS;
- Stripe, Stripe Connect, Resend, Twilio, Google Maps, Supabase, Cloudinary/storage, push and Netlify;
- notifications, audit records, monitoring, exports and failure handling;
- migrations, TypeScript, lint, build, Playwright, dependency audits and feature-specific verification scripts;
- prior coding work from PR #46, PR #47 and the production migration hotfix PR #48;
- current requirements from Workstreams 1–18 and cross-cutting requirements.

No application behavior, migration, production data, provider configuration or Netlify setting was changed.

## Repository baseline

| Item | Verified state |
|---|---|
| Owner/repository | `girlzculture/girlzculture` |
| Default branch | `main` |
| Baseline SHA | `52af829ae8934a6607c32e1372c55d9f846d2d1b` |
| Baseline commit | `Fix production Featured Salon audit backfill migration` |
| Audit branch | `audit/workstream-0-current-state` created from the exact baseline |
| Open PRs at baseline | None |
| `main` protection | **Disabled** |
| Required status checks on `main` | None |
| Production database | Migration workflow #391: `verify` and `migrate` succeeded |
| Production Netlify site | `superlative-dragon-809054` |
| Netlify site ID | `e7da549f-eb32-48e2-9d78-ca06fe2fb91a` |
| Current production deploy | `6a8ed95f5b80840008102a73`, ready/published from the baseline SHA |
| Production branch | `main` |
| Build | `npm run build` |
| Publish output | `.next` through `@netlify/plugin-nextjs` |
| Runtime | Node 22 |
| Migrations | 136 ordered migrations; latest `20260825150000` |
| Public RLS policies | 176, according to the clean-database verification |
| Page files | 68 `page.tsx` files identified by repository/build inventory |
| API route files | GitHub code search found 125 `route.ts` files under `src/app/api`; monitoring verification reported 124 monitored routes |
| Scheduled Netlify functions | 3 operational schedules plus 2 helper modules |
| Current GitHub workflows | 9 workflow files |
| Conventional unit-test framework | None found; project relies on Node verification scripts and Playwright |
| Browser acceptance | 93 discovered, 87 passed, 6 skipped |
| Dependency audit | 0 reported vulnerabilities; several deprecated transitive packages remain |
| Lint | Passed with 7 warnings |

### Working-tree and local-only state

The connected GitHub and Netlify APIs exposed the committed remote state but did not provide a mounted local clone. The container could not clone the public repository because outbound DNS was unavailable. Consequently:

- remote branch and commit state are verified;
- the audit branch was known to equal the baseline before audit documents were added;
- staged files, uncommitted files, ignored files and local-only commits on a developer machine cannot be independently verified;
- this limitation is not treated as an empty or clean local worktree.

## Documents and instructions read

- `AGENTS.md`
- `README.md`
- `CLAUDE.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `playwright.config.ts`
- `next.config.ts`
- `.env.example`
- `netlify.toml`
- current `.github/workflows/*`
- database migration and clean-database verification code
- current and historical architecture, launch, production-correction, inventory and acceptance documents under `docs/`

Only the root `AGENTS.md` was found. No applicable nested `AGENTS.md` was identified.

## Audit methodology

1. Established the exact remote and deployment baseline.
2. Read repository instructions and configuration before classifying features.
3. Used current code, migrations, tests, CI logs and Netlify metadata as evidence.
4. Treated historical completion reports as leads, not proof.
5. Traced critical capabilities across interface, route, authorization, server logic, schema, provider, audit, notification, test and recovery layers.
6. Classified cautiously when live-provider or authenticated-production evidence was unavailable.
7. Recorded exact paths, objects, routes, tests and dependencies in `FEATURE_GAP_MATRIX.csv`.
8. Did not fix findings during Workstream 0.

## Prior coding-chat changes identified

### PR #46 content/search pass

Repository history and prior conversation identify work for:

- Service Catalog access and management;
- persistent homepage Hero layout/content;
- Admin media taking priority over presets;
- About carousel separation and opposite-direction movement;
- typo-tolerant search;
- keyboard Search/Enter handling.

### PR #47 final-launch pass

The final-launch branch introduced or hardened:

- About-page composition, carousels and responsive media;
- public content realtime refresh;
- salon realtime booking alerts and actionable badge;
- Salon 360;
- Admin activity history;
- early/late check-in exceptions;
- Platform Admin manual booking and checkout-link handling;
- Stripe Connect transfer/payout workflow;
- Featured Salon owner controls;
- Incident Queue CSV/JSON exports;
- final browser, migration and release-candidate validation.

### PR #48 migration hotfix

PR #48 corrected the populated `featured_campaign_audit` backfill by transactionally suspending and restoring the named immutable trigger. Its production-shaped PostgreSQL regression passed, it was merged, and production migrations subsequently completed.

## Classification totals

| Classification | Requirements |
|---|---:|
| Complete and correct | 19 |
| Complete but weak | 147 |
| Partially implemented | 255 |
| Decorative or mocked | 1 |
| Duplicated | 5 |
| Missing | 136 |
| Unsafe | 57 |

These totals are not a percentage-complete score. The matrix intentionally splits compound requirements into separately testable rows, so large workstreams such as advertising, events and policy enforcement contribute many rows.

## Strong existing capabilities

### Authentication, roles and tenant boundaries

- Canonical Admin and salon-owner guards validate Supabase identities and active platform identities.
- Admin permission checks and salon/team permission checks exist.
- The clean database contains broad RLS coverage.
- Admin email-domain restrictions, MFA and trusted-device handling exist.
- Media operations are role- and tenant-scoped.

### Database and release verification

- 136 migrations apply to an empty PostgreSQL 17 database.
- The clean chain asserts RLS, references and critical workflows.
- Booking and product public-reference generators passed concurrent uniqueness tests.
- Production migration #391 completed.
- The final baseline passed TypeScript, lint, build and responsive browser acceptance.

### Booking integrity foundation

- Public and Admin booking paths use server-side availability and pricing checks.
- Slot holds and checkout completion have idempotency protections.
- Booking and product references are unique.
- Webhook signatures and event deduplication exist.
- Cancellation/refund code records audit evidence and handles transfer reversal/recovery states.

### Operational monitoring

- Monitored API wrappers and scheduled-function monitoring exist.
- Incidents include fingerprints, occurrences, environment/release/route context and affected businesses.
- Authorized CSV/JSON export is real, audited, capped and secret-redacted.
- CSV formula injection is mitigated.

### Content, discovery and media

- Structured salon/service catalog foundations exist.
- Organic discovery uses a server-only authoritative RPC with exact distance ordering.
- Device, explicit, stored and approximate locations exist.
- Direct media uploads, tenant authorization, dimensions/types and media processing are validated.
- Featured Salon campaigns support paid, platform-credit and complimentary Admin placement with archive/restore/delete evidence.

## Complete-but-weak capabilities

- Core booking checkout is real but has not been accepted against the required delayed-capture business model.
- Location supports a single stored destination and a 1–100 mile radius, but not a saved destination library or no-limit mode.
- Responsive browser tests are strong but use an acceptance fixture; provider-backed Google Maps was skipped.
- Support intake, assignment and response are real, but a complete policy/evidence/appeal/enforcement system is absent.
- Localization has strong schema and four bundled interface locales, but not full-platform French or Fulfulde.
- Incident export is strong, but filters, bundles and replay controls are incomplete.
- Subscription lifecycle mechanics are sophisticated, but the plan model is not authoritative.
- Product commerce performs real operations, but legal/tax/fulfillment architecture is unresolved.

## Partial capabilities

The largest partial areas are:

- complete textured-hair service attributes and customer comparison;
- destination libraries, map-area search and cross-zone acceptance;
- booking conversation attachments, delivery state, formal actions and export;
- policy acceptance, automatic case evidence, appeal and strikes;
- Google Business Profile setup operations;
- communication preference/consent/quiet-hours;
- campaign inventory and salon self-service advertising;
- first-touch/last-non-direct attribution;
- cohort and demand-gap operations;
- full backup/restore/rollback and provider staging.

## Decorative or mocked systems

- The `/internal/acceptance/*` routes and acceptance Supabase fixture deliberately simulate product state for browser validation. They are useful and gated by acceptance environment flags, but they are not provider- or production-data acceptance.
- Historical seed/sample salons, metrics and records remain in fixtures and previous demonstration materials; the audit does not treat them as production proof.

## Duplicate systems

The most important duplicate or overlapping implementations are:

- domain actions distributed across `record_management_events`, identity events, booking finance events, billing events, campaign audits, error events and feature-specific histories;
- booking money flow using destination transfers while a separate manual salon-transfer/payout workflow also exists;
- current Admin access patterns, with most routes using canonical guards while booking messages include separate email/status logic;
- many feature-specific verification workflows and scripts with overlapping release checks;
- multiple historical completion reports that use different counts and status language.

No consolidation was performed.

## Missing systems

Materially missing systems include:

- versioned canonical domain-event/outbox architecture;
- payment authorization/capture grace-period state machine;
- full policy acceptance, appeal and strike enforcement;
- WhatsApp consent/delivery/preferences;
- full salon self-service advertising inventory marketplace;
- complete acquisition attribution;
- founding cohort/waitlist/demand-gap dashboard;
- proven Google Business Profile claim/verification workflow;
- tested staging, backup/restore and provider-level recovery;
- conventional test coverage reporting.

## Unsafe systems

### Booking deposits and salon money movement

The current booking checkout uses immediate Stripe Checkout payment with connected-account destination transfer. The handoff requires authorization without capture, a 30-minute grace period and later capture. A separate Admin payout workflow also exists. This must be resolved before describing the payment model as final.

### Subscriptions

`src/lib/plans.ts` hardcodes Basic/Growth/Premium at $99.50/$129.50/$159.50. The handoff proposes Starter/Growth/Premium at $59/$69/$89. Runtime Stripe price variable names also differ from `.env.example`. Subscription sales should not be treated as final until one approved, database-backed model exists.

### Product commerce

The repository can create product orders and optionally calculate Stripe Tax, but merchant-of-record, tax collection, shipping, returns, product restrictions, chargebacks and commission are unresolved. Product commerce should remain disabled for launch.

### Release control

`main` has no branch protection or required status checks, despite being the production branch.

## Launch blockers

For a controlled appointment-booking pilot, the following block a responsible launch:

1. Founder/payment/legal approval of the booking-deposit and Stripe Connect architecture.
2. One real Stripe test-mode connected-salon transaction covering booking, webhook, cancellation and refund.
3. Verification that no duplicate salon transfer can occur between destination-transfer and manual payout paths.
4. Legally reviewed customer and partner cancellation/refund terms with versioned acceptance.
5. Protected `main` with required release checks.
6. A provider-backed staging or controlled test environment for Stripe, Google Maps and notifications.
7. Correct and verified notification configuration, including the Twilio variable-name mismatch.
8. A tested rollback and database recovery procedure.
9. Real role-isolation and tenant tests using customer, salon owner/team and Admin accounts.
10. A live-site mobile acceptance pass for the founder’s required booking, content and onboarding journeys.

Product commerce, broad subscription billing and self-service advertising have additional blockers and should not be bundled into the first booking pilot.

## Ten highest-priority findings

| Priority | Finding | Why it matters |
|---:|---|---|
| 1 | Booking payments do not implement the required authorization/capture grace model | Financial behavior and customer promise differ from the handoff |
| 2 | Destination transfer and manual payout mechanisms overlap | Potential duplicate or misunderstood salon funding |
| 3 | Subscription pricing, naming, entitlements and env names conflict | Wrong plan or amount could be sold |
| 4 | Product commerce lacks approved MOR/tax/returns architecture | Legal, tax and refund exposure |
| 5 | `main` is unprotected | Production can change without required checks |
| 6 | No canonical versioned event foundation | Support, analytics, audit and future AI cannot reconstruct all timelines reliably |
| 7 | Policy acceptance, appeals and strikes are incomplete | Trust decisions lack a consistent legal/operational basis |
| 8 | Provider-backed staging acceptance is incomplete | Fixture tests cannot prove Stripe, Google, email or SMS production behavior |
| 9 | Rate limiting is process-local memory | Serverless scaling can bypass intended abuse controls |
| 10 | Attribution and launch-cohort systems are missing | Growth claims and supply decisions cannot be made reliably |

## Audit limitations

- No authenticated customer, salon or Admin production session was available.
- No secret values were read.
- Actual presence and correctness of production provider credentials were not exposed.
- A local repository clone could not be created because outbound DNS was unavailable.
- No real payment, refund, transfer, message, push, SMS, map request, booking or production mutation was performed.
- Google Maps provider acceptance was skipped in current Playwright evidence.
- CI browser acceptance used a local acceptance Supabase fixture.
- Historical docs were not treated as current runtime proof.
- GitHub code-search counts and monitoring inventory disagree by one API route; this requires local generated inventory reconciliation.
- The feature matrix is evidence-backed but must be reviewed by the founder and domain specialists before implementation decisions.

## Deliverables

- [Feature gap matrix](FEATURE_GAP_MATRIX.csv)
- [System inventory](SYSTEM_INVENTORY.md)
- [Known risks](KNOWN_RISKS.md)
- [Implementation dependencies](IMPLEMENTATION_DEPENDENCIES.md)
- [Test environment setup](TEST_ENVIRONMENT_SETUP.md)

Workstream 0 stops here. Findings are not remediated in this branch.
