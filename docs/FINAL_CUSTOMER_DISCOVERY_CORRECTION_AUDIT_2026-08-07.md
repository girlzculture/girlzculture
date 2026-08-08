# Girlz Culture final customer-discovery correction audit

Date: 2026-08-07
Branch: `agent/final-customer-discovery-content-corrections`
Base: `origin/main` at `c3f7669`
Scope: the founder's August 7 customer discovery, content, reviews, media, reminders, and mobile corrections. Production migration, deployment, provider, payment, and business-data mutation were not authorized.

## Outcome

The repository implementation, focused verifiers, production build, isolated browser acceptance suites, and genuine clean-database migration replay pass. Multiple independent read-only reviews found reminder, enrichment, authorization, publication, and data-projection edge cases; every identified branch P1 was corrected and re-verified. The final independent audit found no remaining P0/P1 defect in the requested repository scope. The release is **not ready to launch** because the connected Supabase Preview check is skipped and therefore the Netlify preview does not have the branch database contract, Google Maps is still rejected in the real production site, and launch-critical provider/authenticated workflows could not be exercised against a deployed preview with real test accounts and providers.

## Root causes and corrections

1. **Distance was presented through multiple component-specific location strings.** All customer surfaces now use the one returned `distance_miles` value and the shared formatter. Mobile homepage cards suppress city/state only at the requested mobile breakpoint. The discovery RPC computes one canonical great-circle value from the current customer origin and current canonical salon coordinates.
2. **Nearby discovery used different queries, caps, and optional filters across entry points.** The server-only discovery contract now defaults to 50 miles, returns the complete eligible set for trusted server calls, deduplicates, and applies stable nearest-first ordering. Client JWT access remains capped; unrestricted execution is service-role only. Decision-search enrichment now paginates every style, promotion, and booking row in bounded salon-ID chunks, rather than silently truncating at the former 5,000/1,000/10,000 limits. Typed Box/Boho requests are promoted to the same canonical `master_style_id` as a catalog selection, and budget eligibility is applied only after the best active applicable promotion produces the real customer price.
3. **Browse Styles could lose stable service identity.** Style links and assisted search now carry the master style ID/canonical identity into `/salons`, while location, radius, filters, and scroll state are persisted and restored.
4. **Map/list behavior was not based on one collection and provider failures obscured list results.** The map consumes the exact list collection, supports focus/selection, exposes a compact summary with rating, price, distance, and navigation, and provides a retryable provider error without discarding the list.
5. **Homepage fallback cards could outrank or mask administrator cards.** Eligible saved cards are evaluated first; editorial fallbacks fill only unused slots up to the configured limit. Invalid associations receive explicit admin diagnostics rather than silently replacing unrelated saved cards.
6. **The owner overview used the old product heading.** The visible heading is now `Your Dashboard`; internal roles, types, and routes are unchanged.
7. **Review text and replies had bypass paths around the moderated API.** Direct authenticated review inserts and the legacy unmoderated reply RPC are revoked. Legacy direct UPDATE/DELETE/SELECT policies and browser table grants are removed; review bodies are published only through explicit server-side projections, and a salon dispute alone cannot suppress customer feedback. Internal moderation remains server/service-role mediated. Deterministic normalization handles punctuation, spacing, repeated letters, Unicode/zero-width obfuscation, and common substitutions. High-confidence abuse is blocked inline, contextual results can enter audited queues, rating-only submissions remain valid, and removal/restoration deterministically recalculates salon summaries while excluding archived reviews. Owner dashboards receive realtime salon-summary changes and perform a private server refresh, with a full-workspace polling fallback; the private reviews table is not exposed through Realtime.
8. **About Us used fixed badge content and forced long mobile reading.** The badge block is replaced by an admin-managed carousel. Mobile now uses a compact preview and accessible bottom-sheet dialog with close and focus restoration. The two carousels use opposite automatic directions and respect interaction/reduced motion.
9. **Admin repeated-card layouts inherited equal-height grid stretching.** Form and media panels now self-size at the start of the grid. Source-specific fields, local save confirmation, upload state, effective fallback positions, and readback are shown near the working area.
10. **The mobile footer rendered every policy inline.** Mobile now uses compact Company, Support, For Professionals, and Legal & Policies navigation plus newsletter/social content. `/legal` is an index of individually shareable published legal pages; desktop/tablet footer behavior remains intact.
11. **Anonymous/public cards could touch protected favorites data.** Anonymous state no longer queries customer favorites. Mutations go through the customer-scoped API, require a customer session, and preserve role boundaries.
12. **Image finalization compared unreliable browser names/MIME values instead of normalized bytes.** Client and server now normalize supported JPEG/PNG/GIF identity from actual format information, preserve animated GIFs, correct generic/misleading metadata, and reject corrupt or unsupported input as ordinary validation.
13. **Reminder dispatch lacked bounded retry and durable reclaim semantics.** The Netlify worker now retries only retryable failures with timeouts and forwards the upstream correlation ID instead of creating a second incident. A second audit found that a resolved provider failure was incorrectly completed and that the old 30-minute reclaim occurred after the reminder could leave its due-query window. Resolved failed deliveries are now classified before completion; the due window is 50 minutes, outer claims use a five-minute lease and one-minute retry readiness, attempts are bounded at three, and the terminal failure retains the canonical sanitized Engine reference. Delivered/skipped rows remain terminal.
14. **Netlify incidents could report an unidentified production release.** Monitoring now resolves a sanitized release identity from the explicit release, commit, deploy, build, or deploy URL metadata and records the source.
15. **Public navigation fallback could re-enable deliberately disabled links.** The new server-only navigation surface RPC distinguishes unavailable configuration from a valid empty/disabled configuration and never exposes archived/disabled links.
16. **A local production build was allowed to persist build-time content failures.** Static generation read the configured public Supabase project before the branch navigation RPC existed. The sanitized monitoring helper then deduplicated those expected schema-mismatch logs into one Engine incident. Operational persistence is now centrally suppressed whenever Next or npm reports a static production build; the sanitized console record and local reference remain available, while runtime requests continue to persist incidents normally. Focused behavioral tests cover both build indicators and runtime counterexamples.

## Migrations

- `20260807200000_authoritative_discovery_search.sql`
  - Recreates the ranked nearby RPC with the 50-mile/full-server-result contract, canonical distance, stable style filtering, eligibility checks, and service-role-only execution.
- `20260807210000_content_presentation_and_mobile_legal.sql`
  - Converges editorial fallback metadata without overwriting founder-edited cards, seeds the About presentation model, converges the Legal & Policies navigation entry, and adds the safe public-navigation surface RPC.
- `20260807220000_review_moderation_and_rating_sync.sql`
  - Adds review/reply moderation queues and audit actions, guarded publication/removal/restoration paths, deterministic rating-summary synchronization excluding archived rows, browser RLS/grant hardening, service-only review access, salon-summary Realtime publication, and notification-delivery retry lease fields.
- `20260807230000_booking_reminder_retry_semantics.sql`
  - Replaces the outer reminder claim with a bounded three-attempt lease/retry state machine aligned to the scheduled worker's due window; adds service-only failure recording and terminal correlation state.

These files were **not** applied to production or any Supabase project. GitHub Actions applied all 123 repository migrations in chronological order to a genuinely empty disposable PostgreSQL 17 database, generated 1,000 unique booking references and 1,000 unique product references across concurrent sessions, and passed the final schema/function/RLS/grant assertions with 173 policies. The database was ephemeral and contained no production data. The production build completed against the existing schema when the unapplied navigation RPC was absent. Build-phase monitoring persistence is now disabled centrally so future static generation cannot write an Engine incident to an attached database.

The Netlify draft preview itself deployed successfully, but its external `Supabase Preview` check is `skipping`. Consequently, the connected runtime has not received these migrations and the public discovery RPC contract is unavailable there. The smoke test retains this as a failure rather than substituting invented or empty success data.

## Verification evidence

### PASS

- `npx tsc --noEmit --pretty false`
- `npm run lint` — zero errors; five pre-existing `no-img-element` warnings
- `npm run build` — production build completed, 135 application routes after the provider harness was added
- `npm run verify:database-clean` — all 123 migrations executed against empty PostgreSQL 17; concurrent reference and final RLS/policy assertions passed
- `git diff --check`
- Focused/source-behavior suites:
  - `verify:authoritative-discovery`
  - `verify:decision-search-enrichment`
  - `verify:content-presentation`
  - `verify:review-media-reminders`
  - `verify:pilot-owner-search-and-mobile`
  - `verify:media`
  - `verify:video-job-auth`
  - `verify:migrations` (123 unique migrations; head `20260807230000`)
  - `verify:monitoring`
  - `verify:discovery`
  - `verify:connected-discovery`
  - `verify:homepage-depth`
  - `verify:promotion-media-pool`
  - `verify:media-contract`
  - `verify:salon-profile-safety`
  - `verify:launch-owner-controls`
  - `verify:localization-completion`
  - `verify:repository-metadata`
  - `verify:hardening`
  - `verify:admin-security`
  - `verify:owner-realtime`
  - `verify:public-tiers`
  - `verify:featured`
  - `verify:auto-location`
  - `verify:engine`
  - `verify:trending`
  - `verify:consolidated-corrections`
- Production-style isolated browser acceptance:
  - `final-correction-viewports.spec.ts`: 2/2 passed, including all eight required viewports. Its timeout is explicitly 120 seconds because one test deliberately visits all eight layouts.
  - Combined Chromium run: 21 executed tests passed after the timeout correction; four device-project-only tests were intentionally skipped under the Chromium desktop project.

### FAIL

- **Real Google Maps provider:** `google-maps-provider.spec.ts` failed. The configured key was present, but Google rejected it with `GOOGLE_MAPS_AUTH_REJECTED`.
- **Live production map:** read-only inspection of `https://girlzculture.com/salons?lat=40.8116&lng=-73.9465&location=Harlem%2C%20NY&radius=50` showed 25 nearby salons but the real map returned: `Google Maps loaded an invalid response. Verify that Maps JavaScript API is enabled for this key.` Live user-visible reference: `75c92d3c-d435-4448-bc87-afdfc28044cd`.
- **Netlify deploy-preview smoke:** the preview rendered the homepage, How It Works, Salons, and `/api/config` with HTTP 200, but `/api/discovery/salons` and `/api/discovery/trending` returned sanitized JSON HTTP 500 responses because the associated Supabase Preview database deployment was skipped. Read-only follow-up references: `d559ef5f-2767-46df-8b57-e33ea5e9492f` and `16adb88a-9e91-482b-abd7-6071cef293f7`.
- **Pre-existing desktop header density:** at 1366×768 and 1440×1000 the logo overlaps the first desktop navigation item. The branch does not modify the header, so Prompt 2 requires documenting it instead of silently expanding scope.

### BLOCKED

- Connected Supabase deploy-preview execution: the repository's external `Supabase Preview` status is skipped, so no migrated preview database was available for the Netlify smoke test.
- Real review-moderation provider: `OPENAI_API_KEY` is not available in this environment.
- Real Cloudinary/video provider: Cloudinary credentials are not available in this environment.
- Real booking-reminder scheduled function: the branch was not deployed and local `INTERNAL_API_SECRET`/Netlify deployment metadata are unavailable.
- Production migration and provider changes: explicitly prohibited by the founder's instructions.

### AUTOMATED ONLY

- Full Supabase-backed nearby discovery, style search, state restoration, and rating synchronization after the new migrations.
- Authenticated customer favorites/review flows, salon-owner reply/dispute flows, and platform-admin removal/restoration across real accounts.
- PNG/JPEG/GIF upload, database readback, publication, and hard-refresh against a real storage project.
- Admin About/homepage/legal persistence against a real Supabase preview.
- Due/no-op/duplicate/transient/permanent reminder deliveries against the deployed Netlify function and notification provider.

## Provider and external configuration required

1. In Google Cloud, enable **Maps JavaScript API** for the key used by `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
2. In that key's Website restrictions, allow at minimum:
   - `https://girlzculture.com/*`
   - `https://www.girlzculture.com/*`
   - the exact Netlify deploy-preview host pattern used for acceptance
3. If local provider acceptance is desired, temporarily allow `http://127.0.0.1:3104/*` on a non-production test key; do not weaken the production key.
4. Ensure the Netlify scheduled-function environment provides `INTERNAL_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), and Netlify's deploy URL/release metadata.
5. Enable or repair the repository's connected Supabase Preview integration for PR #43, then allow the full migration chain to execute against that disposable preview branch. Do not point the preview at production as a workaround.
6. Configure the review-moderation and Cloudinary test providers in the preview environment if those launch-critical paths are to be promoted from BLOCKED/AUTOMATED ONLY.

## Independent diff review

Independent reviews identified and then rechecked the following branch P1 classes: resolved reminder failures could be marked complete; reminder reclaim timing exceeded its due window; decision-search enrichment had hidden global caps and did not always preserve canonical style identity or effective promoted price; legacy review policies permitted moderation/read bypasses; archived ratings could re-enter salon summaries; owner review state could remain stale; public salon queries and the Admin Overview over-fetched protected columns; and the Engine migration-head marker was stale. The implementation was corrected after each pass. The final independent auditor reran the focused discovery, decision, content, review, reminder, realtime, migration, hardening, Admin-security, TypeScript, and diff checks and reported no remaining P0/P1 defect in scope. No source-string check is treated as proof of a live provider or database workflow.

## Screenshot evidence

All paths are under `docs/screenshots/final-correction/`:

- Homepage: `homepage-360x800.png`, `homepage-390x844.png`, `homepage-412x915.png`, `homepage-844x390.png`, `homepage-768x1024.png`, `homepage-1024x768.png`, `homepage-1366x768.png`, `homepage-1440x1000.png`
- About: `about-mobile-390x844.png`, `about-read-more-mobile-390x844.png`
- Footer/legal: `footer-mobile-390x844.png`, `legal-mobile-390x844.png`
- Discovery/map: `discovery-mobile-390x844.png`, `map-summary-mobile-390x844.png`, `google-maps-live-production-blocked.jpg`

## Launch blockers in priority order

1. **Database/migration issue:** the external Supabase Preview check is skipped, so the deployed PR preview lacks the branch schema and its discovery endpoints return HTTP 500.
2. **Provider integration:** production Google Maps key/API/referrer configuration is rejected.
3. **Environment/provider integration:** real authenticated review, media, reminder, and role workflows have not been exercised on a deployed preview with test providers and test accounts.
4. **Repository defect (pre-existing/out of branch scope):** desktop header logo/navigation overlap at 1366 and 1440 widths.

## Production-safety statement

No pull request was merged. No production migration was applied. No production deployment or provider configuration was changed. No payment was made. No customer, salon, booking, review, content, subscription, provider asset, or other business record was created, edited, archived, restored, or deleted.

One operational exception was detected during verification: the local build inherited a production-linked `.env.local`; because the new navigation RPC was intentionally not migrated, static generation called the existing monitoring helper and created/updated one deduplicated Engine event (`e5766e31-9444-4b22-8347-2e954c629eb4`, fingerprint `gc-056b9584`, 109 occurrences at the time of read-only inspection). The event contains sanitized `public-content / load-navigation-items` metadata only. It was not deleted or altered after discovery. The central build-phase guard described above prevents future static builds from persisting Engine events while preserving runtime monitoring. The other production action was read-only browser inspection of the public `/salons` route; final verification also made read-only requests to the isolated Netlify deploy preview.
