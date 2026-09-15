# Girlz Culture launch corrections — 15 September 2026

Status: **PR #66 OPEN. VERIFICATION IN PROGRESS. Browser failures are under correction. NOT RELEASED. Live acceptance is BLOCKED.**
Branch: `fix/conversational-gc-assistant-dashboard`.
Base: `bb3b93b` (the existing #65 release).

This is an implementation and verification handoff, not a declaration that every launch-critical workflow works in production. The founder authorized pushing this batch and proceeding through the protected release workflow after its checks pass. The batch is pushed to [PR #66](https://github.com/girlzculture/girlzculture/pull/66); no PR was merged, no production deployment or migration was performed, and no real business/customer records, payments or messages were changed.

## Observed original assistant failure

The protected production event at 2026-09-15 12:09:06 UTC reported `ASSISTANT_COST_CONFIGURATION_REQUIRED`, reference `e29d2f5a-b786-4aec-9992-0237e082de4e`. The approved business feature was enabled for OpenAI `gpt-5.4-nano`, but the required pricing settings were unavailable in the function runtime. This is distinct from the earlier login problem and does not establish that every historical error had the same cause.

The code now supplies reviewed prices only for that exact approved pilot model. Unknown models and explicitly invalid overrides still fail closed. Existing provider configuration, access checks, monthly budget reservations and write-confirmation safeguards remain enforced. No additional chatbot vendor was introduced. The combined approved monthly feature caps remain $50: $25 business assistant plus $25 customer concierge.

## Implemented in this branch

| Correction | Implementation | Acceptance |
| --- | --- | --- |
| Conversational business assistant | Short natural-language answers; authorized reads followed by an answer to the actual question; bounded follow-up context; no raw recursive record dump for read actions | AUTOMATED ONLY |
| Business knowledge and tools | Published CMS help/FAQ retrieval; existing business tools remain permission-scoped; changes are prepared for explicit review/confirmation, never silently applied | AUTOMATED ONLY |
| Microphone | Icon start/stop; live transcript; editing aborts the old recognizer; late events cannot overwrite corrections; ten-minute timer; explicit stop/notice at the existing message-length limit; language/session cleanup | AUTOMATED ONLY |
| Real voice capture on devices | Browser speech service with a typing fallback and processing disclosure; actual microphone permission, transcription quality and ten-minute device run remain untested | BLOCKED |
| Shared dashboard design | Scoped readable sans-serif/dark text, white surfaces, teal navigation, larger small text, consistent cards/tables/focus states, breadcrumbs and page search | AUTOMATED ONLY |
| Admin submissions/customers/bookings | Structured tables, existing operational actions retained, current/original submission details, customer search/status filters, booking calendar | AUTOMATED ONLY |
| Business directory | Category workspaces, ten state shortcuts plus all-state selector, city and existing operational filters; SQL filters precede counts and pagination | AUTOMATED ONLY — real PostgreSQL RPC tests passed; signed-in acceptance pending |
| Location-specific content/marketing | State/city/neighborhood workspaces, saved homepage placement inventory, market-filtered content editing, featured-campaign state and radius inspection | AUTOMATED ONLY — not publication proof |
| Calendar | Day/week/month, date navigation, search and timezone-aware display using recorded appointments/overrides | AUTOMATED ONLY — visual/device acceptance pending |
| Customer workspace | Shared visual system, real loaded-record counts, appointment filtering/calendar, corrected navigation, assistant dialog | AUTOMATED ONLY |
| Customer assistant | Conversational discovery criteria, published-help lookup, microphone and account booking/message links; does not gain business-admin tools or execute private account changes | AUTOMATED ONLY |
| New York / Harlem | NYC aliases; explicit neighborhood overrides stale location/GPS; qualified geocoder fallback; unresolved places no longer use a random business location | AUTOMATED ONLY — real geocoder/device acceptance pending |
| Flexible service/product import | Own workbook/CSV headings; sheet/header selection; explicit column and duration-unit mapping; validation and paged review before save; original heading metadata retained | AUTOMATED ONLY |
| Imported service order after save | Transactional wrapper stores order; owner reload and public profile sort on persisted order | AUTOMATED ONLY — PostgreSQL import/reorder/audit/permission tests passed; browser persistence pending |
| Populated business demonstration | Isolated read-only **Girlz Culture Demo Studio**, with clearly fictional September 2026 figures, staff, services and appointments; not seeded into Isha Five Stars | AUTOMATED ONLY |
| Public/demo separation | Existing public onboarding and unlisted marketplace entry preserved; sample workspace at /site-access/business-demo; demo banner links to it; cookie-clearing exit uses deliberate navigation and ignores speculative prefetch; no indexing; no sample payments/bookings | AUTOMATED ONLY — first-visit failure reproduced live; correction not yet published |
| Existing route build errors | Removed unsupported constant exports from the two team API route modules, without changing their permission lists | AUTOMATED ONLY |

The ten state shortcuts are navigation aids, not declarations that those states have launched. Blank metrics are not filled with fabricated business results. Filtered loaded-record counts are labeled where the underlying endpoint is bounded.

## Local verification

- 216 Node regression tests passed, including the three new dictation lifecycle tests.
- A fourth dictation regression now passes: reaching the message-length limit stops capture, preserves the current text and explains how to continue; late speech cannot overwrite it.
- TypeScript passed.
- ESLint passed for all 63 changed code files.
- Next.js production build passed with webpack and the existing local acceptance-data fixture. This is not a Netlify production deployment or a production-data test.
- Launch design-system source audit passed.
- Owner source translation coverage passed for all 1,834 inventoried UI strings in English, French, Wolof, Spanish and Simplified Chinese. This is source coverage, not native-language review or customer-wide browser acceptance.
- Migration ordering passed: 149 unique migrations, head `20260915133423`.
- Spreadsheet parser/catalog/invalid-row/template/export/role checks passed.
- Admin directory, authoritative overview metrics, featured campaign, concierge, search/location, decision enrichment and automatic-location checks passed.
- Owner realtime regression passed after updating its stale fixture to check all five existing event registrations, including booking UPDATE and DELETE. The realtime implementation itself was not changed.
- `git diff --check` passed.

No test result above substitutes for authenticated live acceptance.

## GitHub and review-build verification

- The uploaded source tree was verified byte-for-byte against the local commit.
- GitHub executed all 149 migrations in PostgreSQL 17 and passed the database assertions after fixing the final Engine schema marker and an actual numeric/double-precision mismatch in the new directory RPC. Evidence: [CI run 34988317660](https://github.com/girlzculture/girlzculture/actions/runs/34988317660). That run subsequently stopped at an outdated submissions UI-label assertion; the assertion was corrected for the current table headings.
- The database tests now execute custom-heading service imports, nonalphabetical order, reordered imports without duplication, stored source-layout audit evidence, tenant/team denials, category/state/city filters, pagination totals and revoked admin permissions.
- GitHub owner localization and P0 core checks passed. The full latest-commit browser/release gates remain in progress.
- Browser run 34989037379 found a missing customer-name link, noncanonical customer return addresses, and incomplete test adapters for the newly shared submissions shell and CMS market query. Accessibility run 34989037055 also caught the changed deposit label. The source and adapters were corrected without removing the existing browser assertions; a new test checks that an unassigned admin cannot load an embedded submission record. The final browser rerun remains required.
- Netlify built the initial PR source successfully. Browser inspection confirmed the demo overview, service and team navigation, and month/week calendar switching. This does not establish production publication or authenticated workflow acceptance.
- The review deployment's marketplace shell loaded, but its business/trending data requests failed. The displayed reference `a42c1759-f48b-4956-8ec6-766ddfca917a` was not found in the connected production Engine events. The cause is unconfirmed, and review-deploy marketplace data is not marked as passing.
- Live `/site-access` reproduced an initial discovery launch-gate error twice, while returning from a demo business profile restored nearby/featured results. The exit control used Next Link, whose production prefetch could call the cookie-clearing exit before a click. The exit is now a full-navigation anchor, and speculative requests return 204 without changing cookies. A browser regression explicitly prefetches the exit, then checks discovery remains available, and tests the actual exit click. Existing transaction gates remain closed. Live post-release verification is still required.

## Exact remaining blockers

1. The automated Playwright Chromium executable is missing. The official browser download timed out. Tests could not launch; they did not prove success or failure of the application UI.
2. Starting the local web server for manual inspection failed with `uv_interface_addresses` / operating-system error 1 in this workspace. No networking restrictions were bypassed.
3. Local Postgres/Docker was unavailable; GitHub has now executed the complete migration chain and new RPC tests successfully. The full normal CI must still pass on the final PR commit and then the exact merged main commit before production migration.
4. No authenticated acceptance session is available for Isha Five Stars, a restricted business-team member, platform admin and customer. Real AI replies, denial paths, save/refresh, logout/login and cross-device persistence still need these sessions.
5. The founder authorized pushing this batch and proceeding through the protected production deployment workflow once the required checks pass. Publication has not yet been performed; required CI and production database gates remain in force.
6. The connected deployment controls do not expose Netlify production locking/specific-deploy publication or GitHub workflow dispatch/environment approval. Netlify CLI is not authenticated. Those controls must be available before completing the documented protected release; authorization alone does not provide the missing provider capability.

## Migration/release order — do not bypass the gate

Use the existing protected Git workflow. First review/commit the branch and run its normal CI, including browser and clean-database checks. Resolve any failures before proceeding with the authorized production release.

Migrations, in order:

1. `20260915132412_gc_assistant_conversation_and_knowledge.sql` — knowledge tool constraint and conversational daily capacity, preserving the $25 owner monthly cap.
2. `20260915132727_business_directory_category_filters.sql` — new service-role-only directory RPC.
3. `20260915133423_preserve_service_spreadsheet_order.sql` — ordering columns, original import layout and authorized transactional wrapper.

Do not publish the new application before the corresponding database capability is ready: the directory calls the new RPC, and public catalog reads select the new order columns. Keep the exact-main-commit production migration gate intact. The old directory RPC is retained for application rollback.

## Founder acceptance checklist after an authorized release

- Open a clean/incognito root page: onboarding copy and business login only; no accidental demo listing.
- Open /site-access: actual demo marketplace/home sections; follow a business profile; confirm checkout remains unavailable in demonstration mode.
- Open /site-access/business-demo: clear fictional-data notice, populated overview/calendar/services/team, no write/payment actions.
- Sign into Isha Five Stars and platform admin; verify MFA, reload and logout/login.
- Ask GC Assistant: “What are my services and prices?”, then a specific follow-up about one service; verify concise replies and unchanged source names/prices.
- Ask a platform how-to question; verify it uses published knowledge, not invented policy.
- Prepare a permitted change; review/cancel once, then confirm a separate approved test change; verify persistence and audit evidence. Do not use real customer messages/payments as test data.
- Test denied team permissions, a stale session, a provider failure and exhausted allowance; verify safe errors and matching protected incident references.
- Dictate, pause by editing, resume, stop; check microphone denial/unsupported-browser fallback and the ten-minute ceiling on a real device.
- Check admin overview/submissions/business categories/customers/bookings/content/marketing and every existing detail page. Verify back navigation, readable dark text, empty states and filters.
- Test Harlem, New York City and Dallas from the same device; verify that explicit location changes replace old GPS/search context.
- Import a reviewed test workbook with custom headings and nonalphabetical service order. Validate without saving, correct one invalid row, save only into an approved test business, refresh/sign in again, and inspect the business profile.
- Repeat key dashboard, assistant, table and calendar flows on mobile, tablet, desktop and landscape.
