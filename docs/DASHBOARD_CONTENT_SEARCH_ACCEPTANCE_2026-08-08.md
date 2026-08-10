# Dashboard, content publication, search, and responsive acceptance

Audit date: 2026-08-09  
Branch: `agent/dashboard-content-search-workflows`  
Production actions: none  
Publication checkpoint: commit `8be9fd3a841943c8165eadd796d87491a650ce76`, draft PR [#45](https://github.com/girlzculture/girlzculture/pull/45)

This is an evidence audit, not a launch approval. It separates guarded fixture behavior, repository verifiers, configured authenticated persistence, provider behavior, and production publication. It does not turn a mocked API response, a source-string assertion, or a synthetic browser page into production evidence.

## Evidence rules

Every launch-critical row is classified as exactly `PASS`, `FAIL`, `BLOCKED`, or `AUTOMATED ONLY`.

- `PASS`: directly observed in the required configured, authenticated, non-synthetic environment.
- `AUTOMATED ONLY`: source/type/lint/verifier evidence or a guarded synthetic browser workflow.
- `BLOCKED`: the required configured Supabase/provider environment, real authorized account, second browser/incognito context, or production publication evidence was unavailable.
- `FAIL`: exercised evidence contradicted a requirement.

No authenticated dashboard persistence, provider-backed operation, or real production-publication row in this report is currently `PASS`.

## Executive acceptance matrix

| Area | Repository correction | Best current evidence | Required evidence still missing | Status |
| --- | --- | --- | --- | --- |
| Platform Admin | Compact collection landings, exact focused hydration, authoritative overview/quality projections, bounded-data disclosure | Representative guarded customer and selected detail fixtures plus repository verifiers | Configured Super Admin and limited-role save/reload/error paths across every section | AUTOMATED ONLY |
| Salon Admin | Compact collection/task landings, focused records, URL-backed booking context | Guarded booking and availability fixtures | Configured owner/team permissions, RLS, subscription inheritance, save/reload, and providers across every section | AUTOMATED ONLY |
| Content publication | Saved/draft/scheduled/published snapshots and bounded eligible destinations | Mocked Content API browser fixture and repository verifier | Real admin PNG/GIF upload, Supabase save, hard refresh, second-browser public readback, and production publication | BLOCKED |
| Homepage promotions | Saved cards keep priority; fallbacks fill only vacancies; shared carousel behavior | Synthetic 6+2, 8+0, timing, pause/resume, and reduced-motion fixtures | Configured stored media and production-device acceptance | AUTOMATED ONLY |
| About | Compact mobile intro, independent carousel state, separate content snapshots | Synthetic 390x1200 carousel interaction and 390x844 compact intro/read-more source coverage | Real Content admin save isolation, publication, hard refresh, and second-browser readback | BLOCKED |
| Search | Shared deterministic intent parser and bounded decision enrichment | Ten parser assertions plus one discounted service/opening fixture | Ten live catalog retrieval/ranking/result/explanation examples and configured OpenAI acceptance | BLOCKED |
| Responsive public UI | Mid-width header uses the responsive navigation mode; focused layout checks exist | Production-build header workflow passed for eight routes at four closure viewports; all eight homepage viewports and the required focused public screenshots passed visual inspection | Deployed production-device confirmation remains outside this local audit | AUTOMATED ONLY |
| Database | Seven workstream migrations; current chain has 130 files, head `20260809180000` | Migration-order verification PASS | A disposable `CLEAN_DATABASE_URL` and actual 130-migration execution; local database tools are unavailable | BLOCKED |

## Confirmed defect root causes and corrections

| Defect | Root cause | Repository correction | Evidence boundary | Status |
| --- | --- | --- | --- | --- |
| Mobile homepage cards disclosed city/state | Compact cards reused desktop locality copy instead of a proximity-only mobile contract | Mobile presentation uses distance/proximity while desktop may retain locality | Synthetic card assertions; production device `BLOCKED` | AUTOMATED ONLY |
| Search could return incomplete or weakly explained results | Free-text parsing, service matching, promotion pricing, availability checks, and ordering were split across divergent paths and could stop at an early style | Public search and concierge share deterministic intent and bounded enrichment across matching services; provider text cannot replace authoritative results | Parser/enrichment fixtures only; live ten-query evidence `BLOCKED` | AUTOMATED ONLY |
| Saved homepage content was replaced by fallback media | The fallback composer treated a partially filled rail as permission to rebuild the rail instead of preserving each eligible saved slot | Eligible saved cards remain first and in order; editorial fallback fills genuine vacancies only | Synthetic 6+2 and 8+0 composition | AUTOMATED ONLY |
| Homepage carousel paused or advanced unreliably | Timers and interaction state were duplicated and focus/hover could leave a rail permanently paused | Shared carousel owns deterministic advance, temporary interaction pause/resume, visibility handling, controls, and reduced motion | Synthetic timing and interaction browser checks | AUTOMATED ONLY |
| Animated GIFs could be flattened or treated as still images | The responsive still-image transform path did not distinguish animated source media | GIF URLs bypass incompatible still-image transformations | Data-GIF fixture and source contract only; real upload/delivery `BLOCKED` | AUTOMATED ONLY |
| About Admin edits and public output could bleed across fields or legacy fallbacks | Saved state, public snapshot, and legacy fallback were not resolved as independent publication data | Publication records resolve saved, scheduled, and published snapshots by page/section | Repository verifier and fixture only; real save isolation `BLOCKED` | AUTOMATED ONLY |
| About carousels moved together | Carousel state and direction were shared rather than instance-owned | Each carousel owns index, direction, pause state, and controls | Synthetic 390x1200 fixture | AUTOMATED ONLY |
| Content Management was one long technical page | Page, post, catalog, media, and publication controls were composed in one editor surface | Overview routes to one focused page/section/post/catalog editor | Guarded fixture/source only | AUTOMATED ONLY |
| Catalog save and immutable audit could diverge | Master-style/category/group/add-on writes committed before a separate audit insert whose failure was only logged | All four catalog saves now use the allowlisted, service-role-only `admin_save_content_catalog_record` RPC; catalog data and `record_management_events` commit or roll back in one database transaction | `verify:content-presentation` PASS; clean-database SQL contains real success and forced-audit-failure rollback execution, but configured clean-database execution remains `BLOCKED` | AUTOMATED ONLY |
| Salon team PATCH could leave membership and stylist links inconsistent | Member, selected-stylist, previous-stylist, and audit writes crossed multiple operations without compensating every completed surface | PATCH snapshots all affected rows and compensates member/link mutations in reverse, retries transient rollback/audit failures, and reports incomplete compensation safely | `verify:salon-team-update-atomicity` PASS: four injected rollback scenarios plus owner/link/audit integration contracts; configured owner/team readback `BLOCKED` | AUTOMATED ONLY |
| Platform Admin team PATCH could leave identity, Auth, authorization, and audit state inconsistent | The update spanned `admin_users`, platform identity, Supabase Auth, and security audit without one recoverable forward/rollback workflow | PATCH preflights state and runs ordered fail-closed steps with reverse compensation, retry, durable compensation outcome, and sanitized monitoring | `verify:admin-team-update-atomicity` PASS: four forward-boundary injections, success, retry, permanent-compensation, audit-outage, and six integration contracts; configured admin/Auth readback `BLOCKED` | AUTOMATED ONLY |
| Public header overlapped at desktop/tablet widths | Logo, navigation, search, language, and account zones competed for fixed horizontal space before the mobile breakpoint | Available-width rules and the existing responsive menu mode are used below the full desktop width; controls remain available in the menu | Production-build public-header workflow passed across the eight required routes at 1366x768, 1440x1000, 1024x768, and 844x390 | AUTOMATED ONLY |
| Platform Admin overlapped its content at 1024x768 | The fixed desktop sidebar and content offset crossed at the tablet-landscape breakpoint | Responsive shell geometry was corrected and an explicit 1024x768 overlap assertion added | Initial visual inspection found the defect; the corrected view passed geometry re-verification and representative visual inspection | AUTOMATED ONLY |
| Platform Admin stacked editors and could lose records/context | Collection and editor state shared monolithic components; bounded landing data was reused for focused hydration | Compact landings, focused record URLs, explicit return state, exact record hydration, and bounded-data disclosure | See Platform Admin audit | AUTOMATED ONLY |
| Salon Admin stacked scheduling/editing workflows | Scheduling and collection editors rendered together and filters were transient | Compact landings, focused task/record routes, and URL-backed booking context | See Salon Admin audit | AUTOMATED ONLY |

## Dashboard workflow inventories

The complete required matrices, with the columns `Dashboard`, `Section`, `Current problem addressed`, `New landing workflow`, `New detail/editor workflow`, `Mobile evidence`, `Tablet evidence`, `Desktop evidence`, `Persistence`, and `Status`, are maintained in:

- `docs/PLATFORM_ADMIN_WORKFLOW_AUDIT_2026-08-08.md`
- `docs/SALON_ADMIN_WORKFLOW_AUDIT_2026-08-08.md`

| Dashboard | Sections inventoried | Browser evidence actually present | Configured persistence | Status |
| --- | --- | --- | --- | --- |
| Platform Admin | Overview, Submissions, Salons, Customers, Bookings, Quality & Performance, Reviews, Payments & Finance, Marketing & Promotions, Content Management, Customer Support, Complaints, Subscriptions, The Engine, Settings & Team | Customer landing/detail at all eight required viewports; selected landing/detail fixture checks elsewhere | BLOCKED | AUTOMATED ONLY |
| Salon Admin | Overview, My Page, Photos & Media, Styles & Pricing, Stylists, Products, Availability & Calendar, Bookings, Messages, Reviews, Earnings & Payouts, Promotions, Subscription, Settings & Team | Booking landing/detail at all eight required viewports; five Availability route checks | BLOCKED | AUTOMATED ONLY |

## Public, content, and search workflow matrix

| Surface | Requirement | Automated evidence | What it does not prove | Status |
| --- | --- | --- | --- | --- |
| Homepage promo rail | Eight cards, saved-first composition, fallback vacancies only | Carousel and 6+2 / 8+0 synthetic fixtures | Real saved rows, storage delivery, or production rendering | AUTOMATED ONLY |
| Homepage schedule | Boundary changes without refresh; future snapshot preserved | Guarded fixture with mocked content state | Server scheduler and real database clock behavior | AUTOMATED ONLY |
| Homepage section order | Preview, publish, reload | Guarded fixture | Real Supabase persistence or public second-browser state | AUTOMATED ONLY |
| Content page/post lifecycle | Draft, scheduled, published, hidden states | Publication core, route source, and guarded fixture | Authenticated role/RLS and configured persistence | BLOCKED |
| Content media | PNG/JPEG/GIF upload and public delivery | Upload/source contracts; a 1x1 data GIF fixture | A real PNG/GIF upload, animation preservation, CDN response, or public second browser | BLOCKED |
| About compact mobile | Short intro and Read more dialog | 390x844 source test | Final regenerated screenshot after current changes | AUTOMATED ONLY |
| About carousels | Opposite directions, independent pause/resume, controls | 390x1200 guarded fixture | Production device behavior or published content | AUTOMATED ONLY |
| Search intent | Parse ten specified customer phrases | Deterministic fixture assertions | Live database retrieval/ranking and result explanation | AUTOMATED ONLY |
| Search service selection | Apply promotions, budget, and opening | One Box-service fixture selects `$75` with `2026-08-08` opening | All ten live query outcomes | AUTOMATED ONLY |
| Public location | One request, remembered allow/deny state, explicit URL priority | Guarded Chromium geolocation and source/verifier checks | Production browser permission/provider behavior | AUTOMATED ONLY |
| Map/list state | Shared selected salon details and navigation | Internal fixture and repository verifiers | Configured Google Maps provider | BLOCKED |

## Content Management evidence gap audit

The browser route in `tests/browser/public-responsive.spec.ts` intercepts `GET` and `PUT /api/admin/content`. A same-context reload receives the in-memory mocked response. Its status copy says "verified in Supabase," but the test itself does not contact Supabase and must not be cited as database evidence.

| Required acceptance | Current exact evidence | Gap | Status |
| --- | --- | --- | --- |
| Authenticate as Content administrator | Guarded internal route | No real role/session/RLS exercise | BLOCKED |
| Upload a real PNG | No browser upload in the content fixture | Need real file -> storage -> attachment -> public URL | BLOCKED |
| Upload an animated GIF | 1x1 data GIF already embedded in fixture; `naturalWidth === 1` | Does not prove upload or animation survives processing/delivery | BLOCKED |
| Save draft to Supabase | Mocked `PUT` captures a payload in memory | Need row write and server readback | BLOCKED |
| Publish to Supabase | Mocked `PUT` changes in-memory publication state | Need database publication snapshot and audit record | BLOCKED |
| Hard refresh | `page.reload()` while route mock remains installed | Need a new server read from configured Supabase | BLOCKED |
| Incognito / second browser | Not exercised | Need independent public context with no shared browser memory | BLOCKED |
| 6 saved + 2 fallback | Fixture composition attributes | Does not prove configured stored rows | AUTOMATED ONLY |
| 8 saved + 0 fallback | Fixture composition attributes | Does not prove configured stored rows | AUTOMATED ONLY |
| About save isolation | Independent carousel rendering only | Need edit one About section, save, reload, and prove unrelated fields unchanged | BLOCKED |
| Public page reflects publication | Internal acceptance component | Need actual public route in second browser | BLOCKED |

## Ten required search examples

All ten rows below have deterministic parser evidence only. The separate executable fixture proves one discounted Box-style candidate at `$75` with an opening on `2026-08-08`; it is not a live result for every query.

| # | Query | Parser expectation exercised | Live retrieval/ranking/result explanation | Status |
| --- | --- | --- | --- | --- |
| 1 | `salons near me` | Distance sort; no invented semantic service | Not executed against configured catalog/location data | BLOCKED |
| 2 | `Boho braids` | Canonical Boho service ID | Not executed against configured catalog | BLOCKED |
| 3 | `Box braids` | Canonical Box service ID | Not executed against configured catalog | BLOCKED |
| 4 | `affordable salons near me` | Affordable intent and price-low sort | No live eligible-salon ranking | BLOCKED |
| 5 | `affordable knotless braids near me` | Knotless service plus affordable/price-low intent | No live multi-service price selection | BLOCKED |
| 6 | `best rated braiding salon near me` | Braiding category, minimum rating, rating sort | No live reliability/rating ranking | BLOCKED |
| 7 | `Dominican blowout in the Bronx` | Dominican service and Bronx market | No live market retrieval | BLOCKED |
| 8 | `salon open Saturday under $80` | Price cap and Saturday date | Separate synthetic opening fixture only | BLOCKED |
| 9 | `highly rated natural hair salon within five miles` | Natural category, five-mile radius, minimum rating | No live radius/reliability result | BLOCKED |
| 10 | `knotless braids under $150 with a Saturday opening` | Knotless service, price cap, Saturday date | Separate synthetic opening fixture is not a Knotless live result | BLOCKED |

## Required viewport evidence - exact scope

The table distinguishes what test source covers from what is currently committed and independently inspected. It does not claim every public/search/admin/owner surface at every viewport.

| Viewport | Homepage source coverage | Platform Admin stable evidence | Salon Admin stable evidence | Other public/search evidence | Final inspection | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 360x800 | Homepage loop in `final-correction-viewports` | Customer landing/detail PNGs | Booking landing/detail PNGs | Search uses project default, not this matrix | Homepage visual PASS | AUTOMATED ONLY |
| 390x844 | Homepage loop | Customer landing/detail PNGs | Booking landing/detail PNGs | About compact/read-more, legal, footer, discovery fixture | Homepage and focused public visuals PASS | AUTOMATED ONLY |
| 412x915 | Homepage loop | Customer landing/detail PNGs | Booking landing/detail PNGs | Search uses project default | Homepage visual PASS | AUTOMATED ONLY |
| 844x390 | Homepage loop; header closure workflow | Customer landing/detail PNGs | Booking landing/detail PNGs | Eight-route responsive-header workflow | Homepage visual and header geometry PASS | AUTOMATED ONLY |
| 768x1024 | Homepage loop | Customer landing/detail PNGs | Booking landing/detail PNGs | Search uses project default | Homepage visual PASS | AUTOMATED ONLY |
| 1024x768 | Homepage loop; header closure workflow | Customer landing/detail PNGs | Booking landing/detail PNGs | Eight-route responsive-header workflow | Homepage visual, header geometry, and corrected admin geometry PASS | AUTOMATED ONLY |
| 1366x768 | Homepage loop; header closure workflow | Customer landing/detail PNGs | Booking landing/detail PNGs | Eight-route responsive-header workflow | Homepage visual and header geometry PASS | AUTOMATED ONLY |
| 1440x1000 | Homepage loop; header closure workflow | Customer landing/detail PNGs | Booking landing/detail PNGs | Eight-route responsive-header workflow | Homepage visual and header geometry PASS | AUTOMATED ONLY |

`final-correction-viewports.spec.ts` checks only the homepage at all eight viewports. Its other route screenshots are 390x844 only. `admin-workflows.spec.ts` checks the customer fixture at all eight. `owner-dashboard-workflows.spec.ts` checks the booking fixture at all eight. The decision-search fixture runs in the configured Playwright project viewport rather than this eight-viewport matrix. The About carousel interaction uses 390x1200, while the 390x844 About screenshot covers only the compact introduction and Read more dialog.

Fresh visual inspection passed for all eight homepage viewport screenshots, all four responsive-header open-menu screenshots, and the About, Read more, footer, Legal, discovery, and map-summary screenshots. Representative Platform Admin and Salon Admin landing/detail screenshots also passed. The first 1024x768 Platform Admin review found a sidebar/content overlap; it was fixed and reverified with an explicit geometry assertion. The 32 dashboard PNGs remain fixture evidence only. There are no committed before-state dashboard screenshots and no committed content-save, GIF-upload, search-transition, or authenticated-role screenshots.

### Public header closure matrix

`PASS` in this matrix means the local production-build browser workflow verified one visible header, no zone collision, no wrapped header labels, no viewport escape, correct responsive-menu behavior, and a non-5xx route response. It is still classified as `AUTOMATED ONLY`, not deployed production acceptance.

| Route | 1366x768 | 1440x1000 | 1024x768 | 844x390 |
| --- | --- | --- | --- | --- |
| Homepage `/` | PASS | PASS | PASS | PASS |
| Browse Styles `/styles` | PASS | PASS | PASS | PASS |
| Find Salons `/salons` | PASS | PASS | PASS | PASS |
| How It Works `/how-it-works` | PASS | PASS | PASS | PASS |
| About `/about` | PASS | PASS | PASS | PASS |
| Blog `/blog` | PASS | PASS | PASS | PASS |
| Salon profile `/salon/acceptance-salon` | PASS | PASS | PASS | PASS |
| Legal & Policies `/legal` | PASS | PASS | PASS | PASS |

## Automated regression evidence preserved

The final local run completed the original focused verifier batch at 17/17, then separately passed the late salon-authorization, team-invite atomicity, content/catalog atomicity, compensated Salon Admin team PATCH, compensated Platform Admin team PATCH, and search hardening verifiers. The combined clean production-build admin/owner/public browser run completed with 74 passed / 5 skipped: 13 Platform Admin, 11 Salon Admin, and 50 runnable public cases across the configured projects. The exact final viewport/header/content closure run passed 6/6. These remain automated safeguards, not configured provider or production-deployment acceptance.

| Regression | Evidence source | Prior automated outcome | Final/runtime boundary | Status |
| --- | --- | --- | --- | --- |
| Admin login and Overview safety | `public-responsive.spec.ts`, admin security, and overview verifier coverage | PASS in final automated workflows | Authenticated configured admin run remains blocked | AUTOMATED ONLY |
| Continuous salon list | Discovery verifier asserts no `Load more salons` control | PASS in final focused verifier batch | Live high-volume result set remains blocked | AUTOMATED ONLY |
| Nearest-first discovery | Organic and authoritative discovery verifiers | PASS in final focused verifier batch | Configured location/catalog run remains blocked | AUTOMATED ONLY |
| Browse Styles exact Box identity | Public browser fixture and decision-search verifier | PASS in final automated workflows | Live catalog run remains blocked | AUTOMATED ONLY |
| Browse Styles exact Boho identity | Decision-search enrichment verifier | PASS in final focused verifier batch | Live catalog run remains blocked | AUTOMATED ONLY |
| Map/list decision synchronization | Public internal map summary and authoritative-discovery verifier | PASS in final automated workflows | Google Maps provider runtime remains blocked | AUTOMATED ONLY |
| Marker navigation | Internal map-summary link and launch-owner-controls verifier | PASS in final automated workflows | Configured provider click journey remains blocked | AUTOMATED ONLY |
| Location persistence and explicit URL priority | Public browser fixture plus location/search verifiers | PASS in final automated workflows | Production permission/provider behavior remains blocked | AUTOMATED ONLY |

## Database migration inventory

The repository currently contains **130** SQL migrations. The current head is `20260809180000_atomic_content_catalog_audit.sql`. The seven migrations added by this workstream are:

1. `supabase/migrations/20260808120000_content_publication_workflow.sql`
2. `supabase/migrations/20260809120000_support_assignment_workflow.sql`
3. `supabase/migrations/20260809130000_platform_admin_overview_metrics.sql`
4. `supabase/migrations/20260809150000_admin_record_quality_and_content_targets.sql`
5. `supabase/migrations/20260809160000_application_document_upload_integrity.sql`
6. `supabase/migrations/20260809170000_search_authorization_and_runtime_hardening.sql`
7. `supabase/migrations/20260809180000_atomic_content_catalog_audit.sql`

These are additive repository migrations. No production migration was applied. Migration `20260809160000_application_document_upload_integrity.sql` intentionally fails closed when a legacy application document path is duplicated, malformed, outside its owning user's folder, or otherwise cannot be assigned unambiguously. Before any preview or production application, run `scripts/sql/preflight-application-document-upload-integrity.sql`. It contains two SELECT-only result sets, and both must be empty before applying migration `20260809160000`. Any returned row requires reviewed, non-destructive reconciliation; do not mark the migration applied or weaken its ownership checks. Migration `20260809170000_search_authorization_and_runtime_hardening.sql` adds the service-only marketplace-visible salon resolver, grants service-role search alias resolution, and advances the Engine migration marker without rewriting salon or catalog data. Migration `20260809180000_atomic_content_catalog_audit.sql` adds the allowlisted, service-role-only `admin_save_content_catalog_record` RPC so master styles, service categories, service groups, and service add-ons commit together with their immutable management event or roll back together.

Real clean-database execution remains `BLOCKED`: `CLEAN_DATABASE_URL` was not supplied, and `psql`, Docker, and the Supabase CLI are unavailable in this workspace. Migration ordering passed, but it is not a substitute for SQL execution. Older reports of 123 or 129 migrations, or 173 policies, do not describe this 130-migration head and must not be reused as current clean-database evidence.

## Tests and acceptance harnesses added or changed

Added:

- `tests/browser/admin-workflows.spec.ts`
- `tests/browser/owner-dashboard-workflows.spec.ts`
- `src/app/internal/acceptance/admin-workflows/[section]/[[...record]]/page.tsx`
- `src/app/internal/acceptance/decision-search/page.tsx`
- `src/app/internal/acceptance/owner-workflows/page.tsx`
- `src/components/internal/OwnerWorkflowAcceptanceHarness.tsx`
- `src/components/owner/OwnerWorkflowUi.tsx`

Modified:

- `tests/browser/public-responsive.spec.ts`

The repository has only the generic `test:browser` package script for these suites. Targeted execution therefore uses explicit `npx playwright test ...` commands.

## Exact file inventory for this workstream

The audit-time changed-path inventory is listed below. Root closure must refresh it if later edits add or remove paths before commit.

```text
docs/DASHBOARD_CONTENT_SEARCH_ACCEPTANCE_2026-08-08.md
docs/OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md
docs/PLATFORM_ADMIN_WORKFLOW_AUDIT_2026-08-08.md
docs/SALON_ADMIN_WORKFLOW_AUDIT_2026-08-08.md
package.json
scripts/build-browser-acceptance.mjs
scripts/sql/preflight-application-document-upload-integrity.sql
scripts/sql/verify-clean-database.sql
scripts/verify-admin-identity-security.mjs
scripts/verify-admin-overview-metrics.mjs
scripts/verify-admin-safety-closure.mjs
scripts/verify-admin-team-update-atomicity.mjs
scripts/verify-ai-beauty-concierge.mjs
scripts/verify-application-document-upload.mjs
scripts/verify-authoritative-discovery-search.mjs
scripts/verify-clean-database.mjs
scripts/verify-content-presentation-corrections.mjs
scripts/verify-decision-search-enrichment.mjs
scripts/verify-engine-governance.mjs
scripts/verify-final-production-correction.mjs
scripts/verify-homepage-promotion-pool-and-trending-media.mjs
scripts/verify-launch-owner-controls-and-ux.mjs
scripts/verify-operational-monitoring.mjs
scripts/verify-pilot-owner-search-and-mobile.mjs
scripts/verify-pilot-stabilization.mjs
scripts/verify-salon-authorization.mjs
scripts/verify-salon-team-update-atomicity.mjs
scripts/verify-search-location.mjs
scripts/verify-team-invite-atomicity.mjs
src/app/about/page.tsx
src/app/admin/[section]/[recordId]/page.tsx
src/app/admin/submissions/[id]/page.tsx
src/app/api/admin/bookings/[id]/route.ts
src/app/api/admin/content/route.ts
src/app/api/admin/data/route.ts
src/app/api/admin/engine/ai/route.ts
src/app/api/admin/engine/brand-assets/route.ts
src/app/api/admin/engine/config/route.ts
src/app/api/admin/engine/errors/route.ts
src/app/api/admin/engine/lifecycle/route.ts
src/app/api/admin/engine/media/route.ts
src/app/api/admin/engine/search/route.ts
src/app/api/admin/engine/system-status/route.ts
src/app/api/admin/inbox-counts/route.ts
src/app/api/admin/overview-metrics/route.ts
src/app/api/admin/quality/thresholds/route.ts
src/app/api/admin/records/route.ts
src/app/api/admin/support/[id]/assignment/route.ts
src/app/api/admin/support/[id]/read/route.ts
src/app/api/admin/support/[id]/respond/route.ts
src/app/api/admin/team/route.ts
src/app/api/auth/destination/route.ts
src/app/api/auth/login/verify/route.ts
src/app/api/discovery/decision-search/route.ts
src/app/api/media/cleanup/route.ts
src/app/api/salon/application/documents/abandon/route.ts
src/app/api/salon/application/documents/finalize/route.ts
src/app/api/salon/application/documents/prepare/route.ts
src/app/api/salon/application/route.ts
src/app/api/salon/team/route.ts
src/app/api/salon/workspace/route.ts
src/app/api/search/suggestions/route.ts
src/app/careers/page.tsx
src/app/help/page.tsx
src/app/how-it-works/page.tsx
src/app/internal/acceptance/admin-workflows/[section]/[[...record]]/page.tsx
src/app/internal/acceptance/decision-search/page.tsx
src/app/internal/acceptance/owner-workflows/page.tsx
src/app/page.tsx
src/app/partner/page.tsx
src/app/press/page.tsx
src/app/salon/[slug]/page.tsx
src/app/salon/dashboard/[section]/[recordId]/page.tsx
src/app/salon/dashboard/[section]/page.tsx
src/app/testimonials/page.tsx
src/components/admin/AdminBookingEditor.tsx
src/components/admin/AdminEngineLanding.tsx
src/components/admin/AdminFinanceDashboard.tsx
src/components/admin/AdminMarketingWorkspace.tsx
src/components/admin/AdminRecordWorkspace.tsx
src/components/admin/AdminSalonsManager.tsx
src/components/admin/AdminSubmissionDetail.tsx
src/components/admin/AdminSubmissionsWorkspace.tsx
src/components/admin/AdminSubscriptionsDashboard.tsx
src/components/admin/EngineControlCenter.tsx
src/components/admin/ErrorMonitoringManager.tsx
src/components/admin/useAdminListContext.ts
src/components/AdminContentManager.tsx
src/components/AdminDashboard.tsx
src/components/AdminSupportInbox.tsx
src/components/auth/TeamUserManager.tsx
src/components/BookingInbox.tsx
src/components/internal/HomepagePromotionAcceptanceHarness.tsx
src/components/internal/OwnerWorkflowAcceptanceHarness.tsx
src/components/owner/MobileRecordEditor.tsx
src/components/owner/OwnerDashboardApp.tsx
src/components/owner/OwnerWorkflowUi.tsx
src/components/owner/SalonProductOrders.tsx
src/components/owner/SalonPromotionsManager.tsx
src/components/owner/StructuredCatalogEditors.tsx
src/components/public/FeaturedProductPlacement.tsx
src/components/public/FeaturedSalonPlacement.tsx
src/components/public/HomepagePromoRail.tsx
src/components/public/MarketplaceSalonCard.tsx
src/components/public/NearbySalonPlacement.tsx
src/components/public/SalonDiscovery.tsx
src/components/public/SalonDistance.tsx
src/components/SalonApplication.tsx
src/components/site/AutoContentCarousel.tsx
src/components/site/PublicContentCard.tsx
src/components/site/PublicContentSections.tsx
src/components/site/SearchComposer.tsx
src/generated/repositoryMetadata.ts
src/lib/adminDataProjectionCore.ts
src/lib/adminSupportAccess.ts
src/lib/adminTeamUpdateAtomicity.ts
src/lib/applicationDocumentUploadCore.ts
src/lib/beautyConciergeServer.ts
src/lib/content.ts
src/lib/contentPublicationCore.ts
src/lib/decisionSearchEnrichmentCore.ts
src/lib/decisionSearchIntentCore.ts
src/lib/decisionSearchServer.ts
src/lib/discoveryServer.ts
src/lib/homePromotionCore.ts
src/lib/promotionScheduleCore.ts
src/lib/responsiveMedia.ts
src/lib/salonAuthorizationCore.ts
src/lib/secureLoginServer.ts
src/lib/supabaseAdmin.ts
src/lib/supportTicketClassification.ts
src/lib/teamInvite.ts
src/lib/teamInviteAtomicity.ts
src/lib/teamMutationAtomicity.ts
supabase/migrations/20260808120000_content_publication_workflow.sql
supabase/migrations/20260809120000_support_assignment_workflow.sql
supabase/migrations/20260809130000_platform_admin_overview_metrics.sql
supabase/migrations/20260809150000_admin_record_quality_and_content_targets.sql
supabase/migrations/20260809160000_application_document_upload_integrity.sql
supabase/migrations/20260809170000_search_authorization_and_runtime_hardening.sql
supabase/migrations/20260809180000_atomic_content_catalog_audit.sql
tests/browser/admin-workflows.spec.ts
tests/browser/owner-dashboard-workflows.spec.ts
tests/browser/public-responsive.spec.ts
```

The screenshot inventory includes exactly 32 fixture PNGs under `docs/screenshots/dashboard-workflow/`: for each viewport in `{360x800, 390x844, 412x915, 844x390, 768x1024, 1024x768, 1366x768, 1440x1000}`, the Platform Admin directory contains `admin-customers-{viewport}.png` and `admin-customer-detail-{viewport}.png`, and the owner directory contains `owner-landing-{viewport}.png` and `owner-detail-{viewport}.png`.

The final run also changed these public acceptance screenshots:

```text
docs/screenshots/final-correction/about-read-more-mobile-390x844.png
docs/screenshots/final-correction/discovery-mobile-390x844.png
docs/screenshots/final-correction/footer-mobile-390x844.png
docs/screenshots/final-correction/header-closure/menu-open-1024x768.png
docs/screenshots/final-correction/header-closure/menu-open-1366x768.png
docs/screenshots/final-correction/header-closure/menu-open-1440x1000.png
docs/screenshots/final-correction/header-closure/menu-open-844x390.png
docs/screenshots/final-correction/homepage-1024x768.png
docs/screenshots/final-correction/homepage-1366x768.png
docs/screenshots/final-correction/homepage-1440x1000.png
docs/screenshots/final-correction/homepage-360x800.png
docs/screenshots/final-correction/homepage-390x844.png
docs/screenshots/final-correction/homepage-412x915.png
docs/screenshots/final-correction/homepage-768x1024.png
docs/screenshots/final-correction/homepage-844x390.png
docs/screenshots/final-correction/legal-mobile-390x844.png
docs/screenshots/final-correction/map-summary-mobile-390x844.png
```

## Verification commands and results

The results below are the recorded final local outcomes. They do not elevate fixture, repository, or local production-build evidence into deployed production acceptance.

| Command | Current result | Classification |
| --- | --- | --- |
| `npx tsc --noEmit --pretty false` | PASS | AUTOMATED ONLY |
| `npm run lint` | PASS with 5 existing `@next/next/no-img-element` warnings and no errors | AUTOMATED ONLY |
| `node scripts/build-browser-acceptance.mjs` | PASS; recorded acceptance build generated 141 routes; current migration head is separately verified as `20260809180000` | AUTOMATED ONLY |
| Normal `npm run build` after acceptance execution | PASS; 141 routes, without acceptance-harness environment variables | AUTOMATED ONLY |
| `npm run verify:migrations` | PASS; 130 migration files in chronological order, head `20260809180000` | AUTOMATED ONLY |
| `npm run verify:database-clean` | BLOCKED: `CLEAN_DATABASE_URL`, `psql`, Docker, and the Supabase CLI are unavailable; no database mutated | BLOCKED |
| Final focused verifier batch | PASS; 17/17 | AUTOMATED ONLY |
| `node scripts/verify-salon-authorization.mjs` | PASS; active canonical owner/team boundaries and post-MFA invitation activation | AUTOMATED ONLY |
| `npm run verify:team-invite-atomicity` | PASS; 4 injected compensation scenarios and 8 route integration checks | AUTOMATED ONLY |
| `npm run verify:content-presentation` late atomicity coverage | PASS; page/post and allowlisted catalog saves keep immutable audit persistence inside service-only atomic RPCs | AUTOMATED ONLY |
| `npm run verify:salon-team-update-atomicity` | PASS; four injected rollback scenarios and owner/link/audit integration contracts | AUTOMATED ONLY |
| `npm run verify:admin-team-update-atomicity` | PASS; four forward-boundary injections, success, retry, permanent-compensation, audit-outage, and six integration contracts | AUTOMATED ONLY |
| `npm run verify:search-location` late hardening coverage | PASS; service-only visible-salon resolver, alias grant, bounded suggestions, and query hashing | AUTOMATED ONLY |
| `npm run verify:admin-overview-metrics` | PASS within the final focused verifier batch | AUTOMATED ONLY |
| `npm run verify:admin-safety-closure` | PASS within the final focused verifier batch | AUTOMATED ONLY |
| `npm run verify:content-presentation` | PASS within the final focused verifier batch | AUTOMATED ONLY |
| `npm run verify:promotion-media-pool` | PASS within the final focused verifier batch | AUTOMATED ONLY |
| `npm run verify:authoritative-discovery` | PASS within the final focused verifier batch | AUTOMATED ONLY |
| `npm run verify:decision-search-enrichment` | PASS within the final focused verifier batch | AUTOMATED ONLY |
| `npm run verify:concierge` | PASS as a repository verifier; configured OpenAI provider acceptance remains `BLOCKED` | AUTOMATED ONLY |
| Combined clean production-build browser workflow: admin + owner + public | PASS; 74 passed / 5 skipped (13 admin, 11 owner, 50 runnable public cases across projects) | AUTOMATED ONLY |
| Exact final viewport/header/content closure workflow | PASS; 6/6 | AUTOMATED ONLY |
| `final-correction-viewports.spec.ts` production-build workflow | PASS; all eight homepage screenshots regenerated and independently inspected | AUTOMATED ONLY |
| `public-header-responsive.spec.ts` production-build workflow | PASS across all 8 routes x 4 required viewports | AUTOMATED ONLY |

The retained `test-results/.last-run.json` records a passed last workflow but does not contain suite names, counts, execution mode, or duration. Exact counts therefore come from the recorded command output above, not from that artifact alone.

For production-style browser execution, run `node scripts/build-browser-acceptance.mjs`, then Playwright with `PLAYWRIGHT_USE_PRODUCTION_SERVER=true`. Without that flag, the Playwright configuration starts `next dev`. After acceptance execution, run a normal `npm run build` without acceptance-harness environment variables.

## Authentication, providers, screenshots, and review boundaries

| Required evidence | Current state | Status |
| --- | --- | --- |
| Super Admin in configured runtime | No final authenticated browser acceptance | BLOCKED |
| Limited Platform Admin allowed/denied sections | No final configured role browser acceptance | BLOCKED |
| Salon owner and delegated team member | No final configured owner/team browser acceptance | BLOCKED |
| Content Admin save -> refresh -> second browser | Mocked fixture only | BLOCKED |
| OpenAI explanation | Repository verifier only; provider runtime unavailable | BLOCKED |
| Stripe subscription/payout | Provider runtime unavailable | BLOCKED |
| Cloudinary/storage media delivery | Provider/storage runtime unavailable | BLOCKED |
| Notification/email delivery | Provider runtime unavailable | BLOCKED |
| Google Maps markers | API/referrer/provider runtime not configured for this audit | BLOCKED |
| Before/after dashboard screenshots | No committed before-state images | BLOCKED |
| Fresh public/header screenshots | Regenerated in the final production-build workflows | PASS |
| Independent final screenshot/diff review | PASS for all 8 homepage sizes, all four open-menu closure views, About/Read more/footer/Legal/discovery/map, and representative admin/owner. The 1024 admin overlap was fixed and reverified | PASS |
| Checkpoint commit and draft PR | Commit `8be9fd3a841943c8165eadd796d87491a650ce76`; draft PR [#45](https://github.com/girlzculture/girlzculture/pull/45) | PASS |
| CI and deploy-preview evidence | Draft PR opened; final check/preview results are not yet available | BLOCKED |

No merge, production migration, production deployment, provider configuration, production-data mutation, real payment, or customer communication was performed.

## Remaining blockers

1. Supply a disposable `CLEAN_DATABASE_URL` and execute all 130 migrations plus postconditions against an empty database. Local execution is blocked because `CLEAN_DATABASE_URL`, `psql`, Docker, and the Supabase CLI are unavailable. Before applying migration `20260809160000`, run the two SELECT-only result sets in `scripts/sql/preflight-application-document-upload-integrity.sql`; both must be empty. Any returned row requires reviewed, non-destructive reconciliation because the migration intentionally fails closed.
2. Exercise Super Admin, limited Platform Admin, salon owner, and delegated team roles against a configured preview database.
3. Perform real Content Management PNG and animated-GIF uploads, save/publish, hard refresh, and independent-browser public readback.
4. Capture ten real search result/ranking/explanation examples against configured catalog, location, availability, promotion, and OpenAI runtime data.
5. Exercise Stripe, storage/Cloudinary, notification/email, and Google Maps provider flows.
6. Review draft PR #45 checks when they complete; configured preview/provider acceptance remains blocked until the required runtime exists.

NOT READY FOR FOUNDER PRODUCTION ACCEPTANCE
