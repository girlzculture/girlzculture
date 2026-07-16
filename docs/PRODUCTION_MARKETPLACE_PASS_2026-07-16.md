# Girlz Culture production marketplace pass

Date: July 16, 2026  
Branch: `codex/owner-linking-visual-foundation`

## Outcome

The requested eleven-section marketplace pass is implemented in the application and committed. The public discovery experience now uses one consent-based location source, organic proximity results, separately labeled paid placements, moderated short-form video, and customer-safe public data. Admin operations, failure handling, responsive behavior, accessibility, dependency security, and production compilation were verified.

The SQL files are ready but have **not** been applied to a Supabase database from this workstation. Local Supabase verification requires Docker, which is not running, and this environment does not contain a direct Postgres connection string/password. Apply the migrations below before deploying the matching application commits.

## Section-by-section completion

1. **Service worker and CSP**
   - Prevents private dashboard/auth/API responses from being cached.
   - Keeps offline fallback inside public navigation and scopes cached assets.
   - Uses explicit production CSP allowlists for Supabase, Stripe, Google Maps, Resend, images, and media.

2. **Location foundation and geocoding**
   - Adds canonical latitude/longitude, geocoding state, address review, and market data.
   - Geocoding is server-authorized and address changes invalidate stale coordinates.
   - Customer location is permission-based and shared across discovery surfaces.
   - Distance calculations use one canonical miles implementation.

3. **Organic nearby discovery**
   - Adds database-level nearby search with distance, rating, price, style, pagination, and stable ordering.
   - Only marketplace-visible salons with verified coordinates are eligible.
   - Public results contain only customer-safe fields.
   - Empty and missing-location states are honest; distant salons are not silently substituted.

4. **Admin salon operations**
   - Adds scalable search, state/market/status/plan/rating/address-review/radius filters, sorting, pagination, summaries, detail view, and status history.
   - Suspend and offboard actions preserve existing bookings and create audit records.
   - Detail dialogs have an accessible name, Escape handling, and a keyboard focus trap.

5. **Paid Featured Salons**
   - Uses paid/credited entitlement records, auditable campaign creation, local eligibility, weighted rotation, date windows, overlap protection, and expiry refresh.
   - Public placement is labeled `Sponsored` and never exposes subscription tiers.
   - Empty placements remain empty or show the configured partner CTA; unpaid/distant salons are not substituted.

6. **Paid moderated Trending Picks**
   - Adds short-video campaign records, moderation decisions/reasons, local radius, scheduling, overlap protection, rotation, audit history, and expiry refresh.
   - Validates video type, maximum 25 MB size, and maximum 30-second duration on the server.
   - Public videos lazy-load near the viewport, pause offscreen, use `preload="none"`, and show a readable failure fallback.

7. **Public tier privacy**
   - Basic/Growth/Premium labels and ranking internals are not shown on customer cards, public pages, or public discovery responses.
   - Verification remains a separate customer trust signal.

8. **Connected customer discovery**
   - Homepage, search, `/salons`, `/featured`, and `/trending` share the same customer location context.
   - Autocomplete resolves coordinates rather than treating free text as a location.
   - Filters, pagination, map/list results, and availability links preserve the resolved location.

9. **Reversible homepage depth preview**
   - Standard homepage remains the default.
   - `/?homepage3d=1` enables the isolated depth treatment for review without changing content or data wiring.
   - Recommendation: keep **standard** as production default. It is more restrained, faster, and closer to the premium editorial mockup. Retain depth as an optional future experiment.
   - Comparison captures:
     - `docs/screenshots/homepage-standard-desktop.png`
     - `docs/screenshots/homepage-standard-mobile.png`
     - `docs/screenshots/homepage-depth-desktop.png`
     - `docs/screenshots/homepage-depth-mobile.png`

10. **Security, performance, accessibility, and failure handling**
    - Removes demonstration/unclaimed-profile exceptions from marketplace visibility.
    - Restricts direct salon reads to an explicit safe-column grant and revokes anonymous access to campaign, entitlement, and audit tables.
    - Moves private salon profile loading behind authenticated server authorization.
    - Uses server-side allowlists and validation for salon profile and campaign updates.
    - Validates coordinates, radius, pagination, price ranges, dates, timezones, entitlements, media, and moderation inputs.
    - Public endpoints are rate-limited and do not echo database/provider errors.
    - Adds discovery, search, campaign-window, subscription, and review aggregation indexes.
    - Adds global and `/salons` error boundaries with customer-safe messages.
    - Adds autocomplete semantics and accessible campaign controls.
    - Overrides the vulnerable transitive PostCSS version; `npm audit` reports zero known vulnerabilities.

11. **Testing and handoff**
    - All project verification scripts pass.
    - TypeScript, ESLint, dependency audit, and the optimized production build pass.
    - Browser QA covers 320, 375, 390, 768, 1280, and 1920 pixel widths without document-level horizontal overflow.
    - Homepage, `/salons`, `/featured`, and `/trending` pass mobile accessibility smoke checks for headings, image alt text, named buttons, and visible form fields.
    - Invalid discovery coordinates, pagination, and price ranges return HTTP 400 before database work.

## Required migration order

Apply these files in this exact order in Supabase SQL Editor. Run one file at a time and confirm `Success. No rows returned` before continuing.

1. `supabase/migrations/20260716120000_location_foundation.sql`
2. `supabase/migrations/20260716130000_organic_salon_discovery.sql`
3. `supabase/migrations/20260716140000_admin_salon_operations.sql`
4. `supabase/migrations/20260716150000_featured_salon_campaigns.sql`
5. `supabase/migrations/20260716160000_trending_video_campaigns.sql`
6. `supabase/migrations/20260716170000_marketplace_security_hardening.sql`

Do not deploy the application commits between these migrations. Apply all six, then deploy the application so its RPC and schema expectations change atomically from the customer’s perspective.

### Post-migration database checks

Run this read-only block after all six migrations:

```sql
select
  to_regclass('public.location_markets') as location_markets,
  to_regclass('public.salon_status_audit') as salon_status_audit,
  to_regclass('public.marketing_entitlements') as marketing_entitlements,
  to_regclass('public.featured_salon_campaigns') as featured_salon_campaigns,
  to_regclass('public.featured_campaign_audit') as featured_campaign_audit,
  to_regclass('public.trending_video_campaigns') as trending_video_campaigns,
  to_regclass('public.trending_campaign_audit') as trending_campaign_audit;

select proname
from pg_proc
where proname in (
  'distance_miles',
  'discover_nearby_salons',
  'discover_featured_salons',
  'discover_trending_videos',
  'is_marketplace_visible'
)
order by proname;

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'salons'
  and grantee in ('anon', 'authenticated')
order by grantee, column_name;
```

Expected outcome:

- Every `to_regclass` value is non-null.
- All five functions are listed.
- Public salon grants list customer-safe fields only; they must not include `owner_email`, `owner_phone`, `subscription_tier`, `subscription_status`, suspension/offboarding reasons, or internal badges.

## Verification commands and results

Passed:

```text
npm run verify:production-foundation
npm run verify:location
npm run verify:discovery
npm run verify:admin-salons
npm run verify:featured
npm run verify:trending
npm run verify:public-tiers
npm run verify:connected-discovery
npm run verify:homepage-depth
npm run verify:hardening
npm run verify:billing
npx tsc --noEmit
npm run lint
npm audit --audit-level=moderate
npm run build
git diff --check
```

Production build result: Next.js 16.2.10 compiled successfully, TypeScript completed, and all 73 application routes were generated/registered.

Database execution status:

```text
npx supabase status
```

could not start/inspect a local database because the Windows Docker daemon is unavailable. This is an environment limitation, not a hidden passing result. The migration files received structural verification through the pass scripts; Supabase execution must be completed using the ordered procedure above.

## Production smoke test after migrations

1. Deploy the commits from this branch after the six migrations finish.
2. Open `/` and grant location permission or choose a city manually.
3. Confirm `Salons Near You` contains only eligible nearby salons and distance labels match `/salons`.
4. Open `/salons`, change style/rating/price/distance filters, switch list/map, and load another page.
5. Open `/featured`; confirm every paid result is local and the section is labeled `Sponsored`.
6. Open `/trending`; confirm every video is approved, local, labeled `Sponsored`, under 30 seconds, and pauses after scrolling away.
7. In Admin → Salons, test search, filters, pagination, details, address-review state, suspend, restore, and offboard on a non-production test salon.
8. In Admin → Marketing, create one paid Featured campaign and one Pending Trending campaign. Confirm Pending video is not public; approve it and confirm it appears only inside its configured radius/window.
9. Verify no public salon card or URL exposes Basic/Growth/Premium.
10. Check 320 px phone and 1920 px desktop layouts and repeat the booking entry from one organic salon card.

## Known external prerequisites

- Apply the six SQL migrations before deployment.
- Keep `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` restricted by production hostname and API type; see `docs/LOCATION_CONFIGURATION.md`.
- Real Featured/Trending rows require real paid or credited entitlement records. The implementation intentionally does not seed fabricated campaigns or salons.
- Keep the standard homepage variant as default unless the founder deliberately promotes the `homepage3d=1` experiment.

