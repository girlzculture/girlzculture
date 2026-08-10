# Platform Admin workflow audit — 2026-08-09

Branch: `agent/dashboard-content-search-workflows`  
Scope: repository implementation and guarded local acceptance only  
Production actions: none

This document does not claim authenticated production acceptance. The guarded route under `/internal/acceptance/admin-workflows/...` is available only when `NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS=true`; it supplies synthetic records to the real Platform Admin components and cannot bypass `/admin` authorization or prove database persistence.

## Evidence classifications

- `PASS`: directly observed in the required configured, authenticated, non-synthetic environment.
- `AUTOMATED ONLY`: source/type/lint/verifier evidence or a guarded synthetic browser workflow.
- `BLOCKED`: the required configured database, provider, authenticated role, or production-like second-browser environment was unavailable.
- `FAIL`: exercised evidence contradicted a requirement.

No Platform Admin persistence or provider-backed row is currently `PASS`.

## Root causes and repository corrections

| Defect | Root cause | Repository correction | Evidence |
| --- | --- | --- | --- |
| Collection pages stacked lists and full editors | Selection and editing state lived inside oversized section components | Collection landings now link to `/admin/[section]/[recordId]`; `AdminRecordWorkspace` owns one focused record | Representative guarded browser workflows; `AUTOMATED ONLY` |
| Search/filter/scroll context disappeared | Context was transient client state | URL-backed filters, encoded `return` URLs, and session-backed scroll restoration preserve collection context | Customer and subscription fixtures; `AUTOMATED ONLY` |
| Missing response arrays crashed `.map()` consumers | API projections omitted optional datasets and UI consumers assumed arrays existed | API and acceptance payloads normalize arrays; focused workspaces render explicit empty states | Source/type and fixture coverage; `AUTOMATED ONLY` |
| Focused records could disappear behind the 500-row landing boundary | The shared route reused the bounded landing dataset for detail relationships | Focused customer, booking, review, complaint, quality, and subscription workspaces now hydrate their exact record and linked evidence separately | Repository verifier/source contract; configured database readback `BLOCKED` |
| Overview counts inherited bounded client collections | Overview calculated totals from a capped data response | A service-only overview metrics function returns authoritative totals while the landing datasets remain visibly bounded | `verify:admin-overview-metrics`; configured database accuracy `BLOCKED` |
| Customer and complaint details lacked source evidence | Only the primary row, or the wrong complaint source, was loaded | Customers include bookings, reviews, support, complaints, favorites, salons, and activity. Complaints originate from `complaints_log` and include linked support, booking, salon, and customer data | Representative fixture detail; `AUTOMATED ONLY` |
| Quality metrics used an inconsistent client-side denominator | Quality calculations were reconstructed from capped client arrays | The service-only `salon_quality_metrics` view uses exact 365-day terminal outcomes, completed-service punctuality, verified unresolved complaints, and explicit definitions | PostgreSQL 17 clean replay assertions PASS; configured production-data accuracy remains `BLOCKED` |
| Subscription detail omitted governed history | Only the current subscription row was shown | Focused records include change requests and provider-confirmed billing events | Fixture detail `AUTOMATED ONLY`; Stripe state `BLOCKED` |
| Settings lacked accountable administrator evidence | Team records and security events were not joined into a focused record | Settings lists authorized admins; member detail shows identity, role, status, permissions, and security events | Fixture detail `AUTOMATED ONLY`; authenticated mutation `BLOCKED` |
| A downstream failure could leave a newly invited administrator partially provisioned | Auth invitation occurred before all record, audit, and authorization work had completed | Database preflights run before invitation; route audit and identity finalization are required; injected failures revoke the Auth identity, restore/delete the admin authorization row, retry cleanup, and record compensation | Executable team-invite atomicity verifier `AUTOMATED ONLY`; configured email/Auth readback `BLOCKED` |
| Editing an existing administrator could partially update authorization surfaces | `admin_users`, canonical platform identity, Supabase Auth access, and security audit were separate forward operations without a complete reverse workflow | PATCH preflights provider/identity state, executes ordered fail-closed steps, compensates completed steps in reverse, retries transient compensation/audit failures, and records a sanitized durable compensation outcome | `verify:admin-team-update-atomicity` PASS: four forward-boundary injections, success, retry, permanent-compensation, audit-outage, and six route contracts; configured admin/Auth readback `BLOCKED` |
| Content destination loading caused full-table and per-salon work | Content Management loaded broad tables and checked salon eligibility one record at a time | A service-only, set-based, bounded `admin_content_link_targets` function resolves eligible destinations | Source/verifier and PostgreSQL 17 clean replay PASS; configured authenticated readback remains `BLOCKED` |
| Content save and audit could diverge | Record persistence and management-event insertion could complete independently; catalog writes still used a direct write followed by a best-effort event insert | The service-only `admin_save_content_record` RPC owns page/post revision validation, save, and immutable audit; the allowlisted service-only `admin_save_content_catalog_record` RPC now owns master-style/category/group/add-on save plus immutable audit in one transaction | `verify:content-presentation` and PostgreSQL 17 clean-replay success/forced-audit-failure rollback assertions PASS; configured authenticated save/reload remains `BLOCKED` |
| Support ownership was ambiguous | Ticket assignment was not a durable, permission-checked workflow | Support assignment is persisted with authorized assignee lookup, response/audit context, and safe failure monitoring | Source/verifier `AUTOMATED ONLY`; email and authenticated persistence `BLOCKED` |
| Header exposed a dead global search field | No platform-wide query contract backed the field | The field was removed; each collection owns a functional section-specific search/filter control | Mobile fixture `AUTOMATED ONLY` |
| The 1024x768 admin landing allowed the desktop sidebar to overlap content | The fixed sidebar and content offset crossed at the tablet-landscape breakpoint | Responsive shell geometry was corrected and a 1024x768 overlap assertion was added; the regenerated view was reverified | Production-build geometry assertion and visual inspection `AUTOMATED ONLY` |
| Quality/support failures could expose or misclassify errors | Client/server field mismatches and raw catch strings bypassed the shared monitoring path | Expected validation remains ordinary 4xx; unexpected database/RLS/provider failures use sanitized monitored responses and correlated references | Verifier/source coverage `AUTOMATED ONLY` |

The independent P1 integrity closure covers three separate boundaries: atomic Content Management catalog plus immutable audit persistence through `admin_save_content_catalog_record`; compensated Salon Admin team PATCH across membership, both stylist-link directions, and audit; and compensated Platform Admin team PATCH across authorization row, canonical identity, Supabase Auth, and security audit. Each has a focused executable verifier, and the PostgreSQL 17 clean replay passed the catalog RPC success and forced-audit-failure rollback contract. Configured authenticated save/readback remains `BLOCKED`.

## Required section-by-section workflow matrix

The breakpoint columns describe the evidence actually exercised, not an assumption that every row was visually tested at every required viewport.

| Dashboard | Section | Current problem addressed | New landing workflow | New detail/editor workflow | Mobile evidence | Tablet evidence | Desktop evidence | Persistence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform Admin | Overview | Totals could be bounded and resolved work remained actionable | Compact authoritative metrics, recent activity, alerts, quick links | Summary-only; no artificial detail route | Source only | Source only | Source only | Configured metrics readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Submissions | Queue and full application actions were mixed | State/status/search/archive queue | `/admin/submissions/[id]` separates original snapshot, current salon state, actions, and audit | Landing fixture only | Source only | Source only | Approval/save/reload `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Salons | Management controls were crowded | Search, market, status, verification, plan, visibility filters | `/admin/salons/[id]` progressively discloses lifecycle and linked operations | Not exercised | Not exercised | Repository verifier only | Authenticated lifecycle write/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Customers | List exposed too much and lost context | URL-backed search/status collection | `/admin/customers/[id]` groups account, bookings, reviews, support, complaints, favorites, and activity | Exact required phone/landscape fixtures | Exact required tablet fixtures | Exact required desktop fixtures | Authenticated account mutation/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Bookings | Full creation/editing occupied collection space | Searchable status/date/salon/customer/payment queue | `/admin/bookings/[id]`; `/admin/bookings/new` | Landing fixture only | Not exercised | Link contract only | Authenticated mutation/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Quality & Performance | Per-salon calculations and thresholds were mixed | Exact platform summary and attention queues | `/admin/quality/[salonId]` shows server snapshot and linked evidence | Landing fixture only | Not exercised | Link contract only | Threshold save/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Reviews | Moderation forms were stacked under records | Published/pending/removed/disputed filters | `/admin/reviews/[id]` separates evidence, reply/dispute, reason, decision, and audit | Landing fixture only | Focused evidence fixture at 834×1112 | Link contract only | Authenticated moderation/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Payments & Finance | Wide ledger and summary were difficult to scan | Summary, date/state/market/plan filters, bounded ledger | Focused transaction evidence where applicable | Not exercised | Not exercised | Repository finance verifier only | Stripe/database reconciliation `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Marketing & Promotions | Campaign types and editors were combined | Compact campaign workspace cards | `/admin/marketing/[workspace]` opens one editor | Landing fixture only | Not exercised | Link contract only | Campaign save/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Content Management | One long technical editor mixed pages, catalog, media, and publication | Page/post/catalog overview | `/admin/content/[recordId]` opens one page, section, post, or catalog editor | Manually set 390px content/About fixtures; not authenticated admin | Not exercised | Default Desktop Chrome content fixture; not authenticated admin | Real Supabase/public readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Customer Support | Full threads crowded the inbox | Searchable open/assigned/waiting/resolved/priority queue | `/admin/support/[id]` owns conversation, assignment, response, and status | Landing fixture only | Not exercised | Not exercised | Save/email/reload `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Complaints | Evidence and response controls were mixed into the list | Open/review/waiting/resolved/severity queue | `/admin/complaints/[id]` shows evidence, links, assignment, response, and decision | Landing fixture only | Focused fixture at 834×1112 | Not exercised | Response/status/email/readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Subscriptions | Plan counts lacked operational history | URL-backed state/plan/status cards and totals | `/admin/subscriptions/[id]` shows current state, changes, provider events, and governed links | Landing and return-context fixture | Focused fixture at 834×1112 | Link contract only | Stripe/authenticated readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | The Engine | Categories and incidents were expanded together | Compact governed categories and incident links | `/admin/engine/[recordId]` opens one category/incident workspace | Landing fixture only | Not exercised | Not exercised | Configured provider/runtime state `BLOCKED` | AUTOMATED ONLY |
| Platform Admin | Settings & Team | Categories lacked a focused accountable user record | Settings categories plus authorized admins | `/admin/settings/[workspace]`; `/admin/settings/member-[id]` | Landing fixture only | Focused member fixture at 834×1112 | Link contract only | Authenticated permission save/readback `BLOCKED` | AUTOMATED ONLY |

## Data boundary contract

Collection sources return at most 500 rows after fetching a 501st sentinel row. `admin_data_meta.source_limits` discloses `returned`, `limit`, and `has_more`; the UI labels incomplete bounded views. Focused records are hydrated independently by exact IDs and relationship keys so a selected record is not lost because it sits outside the landing window. Overview totals and quality metrics use dedicated server-side database projections.

This is safer than the prior silent cap, but it is not complete cursor pagination. High-volume production acceptance remains `BLOCKED` until authoritative pagination/aggregate behavior is exercised in a configured runtime.

## Browser and screenshot evidence

`tests/browser/admin-workflows.spec.ts` currently provides:

- customer landing → focused record → Back with `q` and `status` at all eight required viewports;
- committed landing/detail screenshots under `docs/screenshots/dashboard-workflow/platform-admin/` for those customer journeys;
- compact link contracts for selected bookings, reviews, quality, subscriptions, marketing, and settings landings;
- mobile landing fixtures for submissions, bookings, reviews, quality, support, complaints, subscriptions, marketing, Engine, and settings;
- focused tablet fixtures for review, complaint, subscription, and administrator-member evidence;
- subscription return parameters and customer scroll restoration;
- horizontal-overflow assertions on exercised views.

It does **not** prove every section's save/error/permission workflow, authenticated persistence, or production rendering. Screenshots created with `testInfo.outputPath(...)` are ephemeral Playwright artifacts unless explicitly copied into `docs/screenshots`; they must not be cited as committed evidence after cleanup.

Stable screenshots currently cover only the admin customer fixture at:

- 360×800
- 390×844
- 412×915
- 844×390
- 768×1024
- 1024×768
- 1366×768
- 1440×1000

Independent visual inspection passed for representative regenerated Platform Admin landing/detail screenshots, all eight homepage viewport captures, and the four responsive-header open-menu captures used by the closure run. The first 1024x768 inspection exposed a sidebar/content overlap; that geometry was corrected and reverified with an explicit browser assertion. No before-state dashboard screenshots are currently committed, and this visual evidence remains fixture-backed.

## Migration and runtime boundary

Migration ordering passed for **130** files with head `20260809180000_atomic_content_catalog_audit.sql`. The seven workstream migrations include content publication, support assignment, authoritative Overview metrics, record-quality/content destinations, application-document upload integrity, search authorization/runtime hardening, and atomic Content Management catalog/audit persistence. No migration was applied to production.

Migration `20260809160000_application_document_upload_integrity.sql` intentionally fails closed if a legacy application document path is malformed, outside its owning user folder, duplicated across applications, or otherwise ambiguous. Run `scripts/sql/preflight-application-document-upload-integrity.sql` before preview or production application. It contains two SELECT-only result sets, and both must be empty before applying migration `20260809160000`; any returned row requires reviewed, non-destructive reconciliation. Do not mark it applied or relax the ownership rules. GitHub Actions PostgreSQL 17 completed a genuine clean-database replay of all 130 migrations and the complete post-migration assertion suite; this does not replace the required environment-specific production preflight.

## Verification commands and current result

Do not infer production acceptance from these commands. They are local and GitHub automated production-build, repository, and clean-database evidence.

| Command | Current observed result | Classification |
| --- | --- | --- |
| `npx tsc --noEmit --pretty false` | PASS | AUTOMATED ONLY |
| `npm run lint` | PASS with 5 existing `@next/next/no-img-element` warnings and no errors | AUTOMATED ONLY |
| Acceptance production build | PASS; recorded build generated 141 routes; current migration head is separately verified as `20260809180000` | AUTOMATED ONLY |
| Normal production build after acceptance execution | PASS; 141 routes | AUTOMATED ONLY |
| `npm run verify:migrations` | PASS; 130 ordered migrations, head `20260809180000` | AUTOMATED ONLY |
| `npm run verify:database-clean` | PASS in GitHub Actions PostgreSQL 17: all 130 migrations and complete post-migration assertions executed; 1,000 concurrent booking and 1,000 concurrent product reference checks passed | AUTOMATED ONLY |
| Combined clean production-build admin/owner/public browser run | PASS; 74 passed / 5 skipped: 13 admin, 11 owner, and 50 runnable public cases across projects | AUTOMATED ONLY |
| Exact final viewport/header/content closure run | PASS; 6/6 | AUTOMATED ONLY |
| Focused verifier batch | PASS; 17/17 final focused verifiers | AUTOMATED ONLY |
| Late authorization/team/content/search hardening closure | PASS: `verify-salon-authorization.mjs`, `verify:team-invite-atomicity`, `verify:admin-team-update-atomicity`, `verify:salon-team-update-atomicity`, page/post/catalog atomicity in `verify:content-presentation`, and `verify:search-location` | AUTOMATED ONLY |
| `npm run verify:admin-team-update-atomicity` | PASS; four forward-boundary injections, success, retry, permanent-compensation, audit-outage, and six integration contracts | AUTOMATED ONLY |
| `npm run verify:salon-team-update-atomicity` | PASS; four injected rollback scenarios and owner/link/audit integration contracts | AUTOMATED ONLY |
| `npm run verify:content-presentation` atomic catalog closure | PASS; allowlisted catalog RPC, service-only grants, audit insert, and clean-database rollback assertions verified | AUTOMATED ONLY |
| Configured authenticated admin save/reload tests | Environment not supplied locally | BLOCKED |

For production-style browser evidence, build the guarded acceptance bundle with `node scripts/build-browser-acceptance.mjs`, then run Playwright with `PLAYWRIGHT_USE_PRODUCTION_SERVER=true`. Without that flag, Playwright starts `next dev`; documentation must identify which mode produced each result.

## Remaining blockers

1. A configured authenticated Supabase preview/runtime is required for admin authorization, mutation, readback, refresh, and delegated-role evidence.
2. Super Admin and limited-permission behavior has repository coverage but no final configured browser acceptance in this pass.
3. Stripe, email, media, OpenAI, and external health evidence require configured providers.
4. Every-section mobile/tablet/desktop save, error, and Back-context acceptance is not covered by the representative fixture suite.
5. True high-volume cursor pagination remains outstanding beyond the explicit landing boundary.
6. The current correction branch is published in draft PR [#45](https://github.com/girlzculture/girlzculture/pull/45); GitHub PostgreSQL 17 verification, preview smoke, and Netlify deploy preview passed. Supabase Preview was skipped, and configured authenticated/provider acceptance remains blocked as described above.

## Launch assessment

The repository now has materially cleaner collection-to-detail workflows and more accurate server projections. Platform Admin production acceptance remains blocked by configured persistence, roles/providers, and incomplete every-section browser evidence.

NOT READY FOR FOUNDER PRODUCTION ACCEPTANCE
