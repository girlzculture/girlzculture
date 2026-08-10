# Salon Admin workflow audit - 2026-08-09

Branch: `agent/dashboard-content-search-workflows`  
Scope: repository implementation and guarded local acceptance only  
Production actions: none

This audit does not claim authenticated production acceptance. The guarded route at `/internal/acceptance/owner-workflows` is enabled only by `NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS=true`; it supplies synthetic booking records to the owner workflow components. It cannot bypass the real `/salon/dashboard` authorization, subscription, salon membership, or permission checks, and it does not prove Supabase or provider persistence.

## Evidence classifications

- `PASS`: directly observed in the required configured, authenticated, non-synthetic environment.
- `AUTOMATED ONLY`: source/type/lint/verifier evidence or a guarded synthetic browser workflow.
- `BLOCKED`: the required configured database, provider, authenticated role, or production-like second-browser environment was unavailable.
- `FAIL`: exercised evidence contradicted a requirement.

No Salon Admin persistence or provider-backed row is currently `PASS`.

## Root causes and repository corrections

| Defect | Root cause | Repository correction | Evidence |
| --- | --- | --- | --- |
| Operational sections stacked lists and large editors | Collection selection and editing state lived inside broad section components | Compact collection landings now route to `/salon/dashboard/[section]/[recordId]` or a focused task route; one record/task is rendered at a time | Source/type coverage; representative booking fixture `AUTOMATED ONLY` |
| Booking context disappeared after opening a record | Group, exact status, query, and return state were transient client state | URL-backed `group`, `status`, and `q`, together with a return URL, preserve the synthetic journey through detail, save feedback, and Back | Guarded browser workflow; `AUTOMATED ONLY` |
| Availability mixed unrelated scheduling tasks | Calendar, hours, slot rules, stylist availability, and blockouts shared one crowded surface | Availability is a compact five-card landing with focused `/calendar`, `/hours`, `/slots`, `/stylists`, and `/overrides` workspaces | Guarded browser route workflow; `AUTOMATED ONLY` |
| New and existing catalog records lacked a stable focused destination | Creation and editing were coupled to the collection render | Styles, stylists, products, and promotions use `/new` and stable `[recordId]` destinations | Source/type coverage; authenticated create/save/readback `BLOCKED` |
| Settings exposed several unrelated editors together | Account, marketplace, notification, security, and team controls were composed on one page | Settings is a compact category landing; `/salon/dashboard/settings/[area]` opens one workspace | Source/type coverage; authenticated permission readback `BLOCKED` |
| Team users could be treated as separate billing accounts | Subscription checks could be interpreted at the acting-user boundary rather than the parent salon boundary | Subscription remains a salon-level singleton; billing is owner-only while authorized team access derives from salon membership and granted permissions | Repository security/verifier evidence `AUTOMATED ONLY`; configured owner/team acceptance `BLOCKED` |
| Invited team users could be authorized too early or left partially provisioned after a downstream failure | Destination lookup previously risked treating an invited membership as active, while Auth invitation preceded every member, stylist-link, and audit operation | Only an active canonical salon identity plus an active membership can enter the workspace; invitation activation occurs after successful MFA. Preflights now precede Auth creation, and injected downstream failures revoke Auth, restore/delete the member row, restore the stylist link, retry cleanup, and audit compensation | Executable salon-authorization and team-invite atomicity verifiers `AUTOMATED ONLY`; configured invitation/email acceptance `BLOCKED` |
| Editing an existing team member could partially update membership, stylist links, or audit evidence | Salon team PATCH crossed the member row, newly selected stylist link, previous stylist link, and audit write without compensating every completed surface | PATCH snapshots every affected row, restores completed mutations in reverse, retries transient rollback and compensation-audit failures, and raises a sanitized visible failure if compensation remains incomplete | `verify:salon-team-update-atomicity` PASS: four injected rollback scenarios plus owner/link/audit integration contracts; configured owner/team readback `BLOCKED` |
| Media and public-page editing could not prove public projection | Upload, crop, attachment, and public rendering cross storage, salon data, and CDN delivery boundaries | Cover, logo, gallery, and My Page editors retain focused routes and existing media/public projection APIs | Source/type evidence `AUTOMATED ONLY`; storage and second-browser readback `BLOCKED` |
| Provider operations were visually mixed with ordinary data | Stripe payouts/subscription and communication delivery require external state not available to a local fixture | Provider status is kept in focused earnings, subscription, and message workflows and is not represented as locally accepted | Provider evidence explicitly `BLOCKED` |

The independent P1 integrity closure covers three separate boundaries: atomic Content Management catalog plus immutable audit persistence through `admin_save_content_catalog_record`; compensated Salon Admin team PATCH across membership, both stylist-link directions, and audit; and compensated Platform Admin team PATCH across authorization row, canonical identity, Supabase Auth, and security audit. Each has a focused executable verifier, and the PostgreSQL 17 clean replay passed the catalog RPC success and forced-audit-failure rollback contract. Configured authenticated save/readback remains `BLOCKED`.

## Required section-by-section workflow matrix

The breakpoint columns describe evidence actually exercised. They do not imply that every section was visually tested at every required viewport.

| Dashboard | Section | Current problem addressed | New landing workflow | New detail/editor workflow | Mobile evidence | Tablet evidence | Desktop evidence | Persistence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Salon Admin | Overview | Summary could become another long management page | Business summary, urgent actions, and links to real sections | Summary-only; no artificial record route | Source only | Source only | Source only | Configured metrics accuracy `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | My Page | Business, trust, social, policies, and media fields competed on one surface | Compact public-profile area cards | `/salon/dashboard/my-page/[area]` opens one editor | Not exercised | Not exercised | Source only | Save/reload and public projection `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Photos & Media | Upload, crop, and gallery work crowded the landing | Cover, logo, and gallery cards | `/salon/dashboard/photos/cover`, `/logo`, and `/gallery` | Not exercised | Not exercised | Source only | Storage/CDN/readback `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Styles & Pricing | Catalog list and full pricing editor were stacked | Search/import controls and compact service cards | `/salon/dashboard/styles/new` and `/salon/dashboard/styles/[styleId]` | Not exercised | Not exercised | Source only | Authenticated create/save/reload `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Stylists | Team list and portfolio editor were stacked | Compact stylist cards | `/salon/dashboard/stylists/new` and `/salon/dashboard/stylists/[stylistId]` | Not exercised | Not exercised | Source only | Authenticated create/save/reload `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Products | Product list, inventory, media, and fulfillment fields were stacked | Search/import controls and compact product cards | `/salon/dashboard/products/new` and `/salon/dashboard/products/[productId]` | Not exercised | Not exercised | Source only | Authenticated create/save/reload `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Availability & Calendar | Five scheduling responsibilities were combined | Five compact task cards | Focused `/calendar`, `/hours`, `/slots`, `/stylists`, and `/overrides`; booking/blockout details remain linked | Not exercised | Not exercised | Default Desktop Chrome route journey | Schedule/blockout save/reload `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Bookings | Filters and return context were lost when a record opened | URL-backed Upcoming, In Progress, Needs Resolution, All, exact status, and search | `/salon/dashboard/bookings/[bookingId]` owns one booking | Exact required phone/landscape synthetic fixtures | Exact required tablet synthetic fixtures | Exact required desktop synthetic fixtures | Fixture save feedback only; real mutation/reload `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Messages | Conversation detail competed with the inbox | Conversation list | Focused booking/conversation workspace | Not exercised | Not exercised | Source only | Delivery/readback `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Reviews | Reply and dispute controls crowded the review list | Rating summary and compact review list | `/salon/dashboard/reviews/[reviewId]` | Not exercised | Not exercised | Source only | Authenticated reply/dispute/readback `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Earnings & Payouts | Summary and ledger evidence were difficult to scan together | Summary, provider status, searchable/exportable ledger | `/salon/dashboard/earnings/[bookingId]` where evidence exists | Not exercised | Not exercised | Repository verifier only | Stripe/database reconciliation `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Promotions | Saved offers and full editor were combined | Compact promotion cards | `/salon/dashboard/promotions/new` and `/salon/dashboard/promotions/[promotionId]`; plan gate remains authoritative | Not exercised | Not exercised | Source only | Authenticated save/readback `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Subscription | Billing could appear as a per-user collection | One salon-level current plan and scheduled state | Provider portal/change flow; no artificial record list | Not exercised | Not exercised | Repository verifier only | Stripe/provider and owner/team role evidence `BLOCKED` | AUTOMATED ONLY |
| Salon Admin | Settings & Team | Multiple settings and team forms were shown together | Account, notification, marketplace, team, and security cards | `/salon/dashboard/settings/[area]`; team manager only in focused team workspace | Not exercised | Not exercised | Source only | Permission save/reload `BLOCKED` | AUTOMATED ONLY |

## Browser and screenshot evidence

`tests/browser/owner-dashboard-workflows.spec.ts` currently exercises only the guarded synthetic booking and availability fixture:

- booking landing, focused booking, and horizontal-overflow assertions at 360x800, 390x844, 412x915, 844x390, 768x1024, 1024x768, 1366x768, and 1440x1000;
- one `Confirmed` filter -> focused record -> fixture save feedback -> Back journey;
- one `Needs Resolution` plus `Monique` search -> focused record -> fixture save feedback -> Back journey;
- the five Availability destination links and return behavior.

The suite does **not** exercise all Salon Admin sections, real owner authentication, a delegated team role, subscription inheritance, RLS, Supabase persistence, provider calls, storage delivery, or public salon-page readback.

Stable committed screenshots under `docs/screenshots/dashboard-workflow/owner/` are limited to booking fixture landing/detail images at the eight viewports above (16 PNGs total). There are no committed before-state Salon Admin screenshots. Any screenshots written to Playwright's `testInfo.outputPath(...)` are ephemeral and are not acceptance evidence after test cleanup. Representative regenerated owner landing/detail screenshots, all eight homepage viewport captures, and all four responsive-header open-menu captures were independently inspected and passed for hierarchy, clipping, and overflow. This remains fixture evidence, not authenticated owner acceptance.

## Migration and runtime boundary

Migration ordering passed for **130** files with head `20260809180000_atomic_content_catalog_audit.sql`. The seven workstream migrations cover content publication, support assignment, authoritative Platform Admin Overview metrics, record-quality/content targets, application-document upload integrity, search authorization/runtime hardening, and atomic Content Management catalog/audit persistence. No migration was applied to production. The new head is service-role-only and allowlists master styles, service categories, service groups, and service add-ons; each save and immutable management event commits or rolls back together.

Migration `20260809160000_application_document_upload_integrity.sql` intentionally fails closed if a legacy application document path is malformed, outside its owning user folder, duplicated across applications, or otherwise ambiguous. Run `scripts/sql/preflight-application-document-upload-integrity.sql` before preview or production application. It contains two SELECT-only result sets, and both must be empty before applying migration `20260809160000`; any returned row requires reviewed, non-destructive reconciliation. Do not mark it applied or weaken the ownership validation. GitHub Actions run `31355202119` completed the PostgreSQL 17 clean replay of all 130 migrations and post-migration assertions; no production migration was applied, and the environment-specific preflight remains required.

## Verification commands and current result

The final local and GitHub automated production-build and clean-database acceptance results are recorded below. There is no dedicated package script for this acceptance file; the exact command is listed below.

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
| Late authorization/team/content/search hardening closure | PASS: `verify-salon-authorization.mjs`, `verify:team-invite-atomicity`, `verify:salon-team-update-atomicity`, `verify:admin-team-update-atomicity`, page/post/catalog atomicity in `verify:content-presentation`, and `verify:search-location` | AUTOMATED ONLY |
| `npm run verify:salon-team-update-atomicity` | PASS; four injected rollback scenarios and owner/link/audit integration contracts | AUTOMATED ONLY |
| `npm run verify:admin-team-update-atomicity` | PASS; four forward-boundary injections, success, retry, permanent-compensation, audit-outage, and six integration contracts | AUTOMATED ONLY |
| `npm run verify:content-presentation` atomic catalog closure | PASS; allowlisted service-only catalog RPC and clean-database success/forced-audit-failure rollback assertions verified | AUTOMATED ONLY |
| Configured owner/team save, reload, and public-projection tests | Required runtime and accounts not supplied locally | BLOCKED |

For production-style browser evidence, first run `node scripts/build-browser-acceptance.mjs`, then set `PLAYWRIGHT_USE_PRODUCTION_SERVER=true` for Playwright. Without that flag, Playwright starts `next dev`. After acceptance execution, run a normal `npm run build` without harness environment variables.

## Remaining blockers

1. A configured authenticated Supabase runtime is required for owner authorization, delegated-role permission boundaries, RLS, mutation, refresh, and readback.
2. Every-section mobile/tablet/desktop save, error, permission, and Back-context acceptance is not covered by the representative booking fixture.
3. Stripe, email/notification, storage/CDN, and other provider operations require configured providers.
4. Public salon-page projection after My Page, media, service, stylist, and product updates requires a second browser/incognito check.
5. The current correction branch is published in draft PR [#45](https://github.com/girlzculture/girlzculture/pull/45); GitHub PostgreSQL 17 verification, preview smoke, and Netlify deploy preview passed. Supabase Preview was skipped, and configured authenticated/provider acceptance remains blocked as described above.

## Launch assessment

The repository has materially cleaner collection-to-detail and scheduling workflows, but Salon Admin production acceptance remains blocked by configured authentication, persistence, delegated roles, providers, and incomplete every-section browser evidence.

NOT READY FOR FOUNDER PRODUCTION ACCEPTANCE
