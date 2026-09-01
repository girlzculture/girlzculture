# Founder corrections: search, filters, public labels, and subscription plans

## Document status

This report covers the focused founder-correction branch only. Local
implementation and validation are complete at the recorded branch state.
Disposable-database, protected-PR, provider-backed, and founder-manual checks
remain explicitly pending or blocked; no unavailable check is reported as
passed.

| Continuity item | Value |
| --- | --- |
| Repository | `girlzculture/girlzculture` |
| Expected starting `main` | `f84681c5b89fa19b83c9370fa0d2da2c88834eaf` |
| Verified starting `origin/main` | `f84681c5b89fa19b83c9370fa0d2da2c88834eaf` |
| Branch | `codex/founder-search-filter-plan-corrections` |
| Validated implementation/report head | `358a02c85c42e3a4922318e9e20000e435bef1f5` |
| Final published branch SHA | Recorded in the Draft PR description and final handoff after this document-only publication commit; a commit cannot embed its own SHA without changing that SHA. |
| Pull request | [Draft PR #52](https://github.com/girlzculture/girlzculture/pull/52) |

No commit is being made directly to `main`. Workstream 1 remains the base of
this work and Workstreams 2–18 are not being broadly started.

## Founder evidence and reproduction

The five supplied screenshots and the pre-change source/runtime trace establish
the following failures:

| Evidence | Before correction | Root cause |
| --- | --- | --- |
| Find Salons search for Blowout | Result cards could show `Trim (Dusting / Shape-Up)` and a cheap unrelated price. | When no stable style/category/group identity was available, the server retained every salon style, sorted the candidates by displayed price, and selected the first/cheapest row. |
| Salon discovery cards | No-review salons showed `New` and `New booking history`; a generated count/lowest-price sentence and AI presentation were visible. | Presentation logic converted missing review/reliability data into customer-facing marketing labels and exposed internal/generated discovery prose. |
| Mobile discovery | The search form appeared over result cards rather than in one stable top slot. | Sticky placement used an offset/layout boundary that did not consistently track the public header and content container at mobile and landscape widths. |
| Browse Styles cards | Category eyebrow text such as `AFRICAN & AFRO-TEXTURED` repeated on every card. | Catalog taxonomy was rendered as card decoration rather than kept as structured filter metadata. |
| Browse Styles filters | Valid query/category/length combinations could return no results. | The page truncated to an initial popularity slice before filtering, inspected incomplete length data, had a non-authoritative maintenance control, and treated some missing-price values as numeric. |
| Plans | Public cards offered Basic $99.50, Growth $129.50, and Premium $159.50 and mentioned Stripe test mode. | Plan names, amounts, benefits, environment variables, and UI copy were duplicated across public, owner, Admin, and Stripe boundaries. |

The supplied screenshots are the visual production evidence. The exact
pre-change execution path was also reproduced from `origin/main`: homepage and
header search serialize the service and location into `/salons`, which submits
`POST /api/discovery/decision-search`; without a stable catalog identity, the
old server path could retain every published salon style, price-sort that set,
and promote its first row to `matched_service`. That is the path that allowed a
Blowout request to present `Trim (Dusting / Shape-Up)` and an unrelated cheap
price. The focused fixture now records each request and proves that a
Dominican-Blowout result returns the same qualifying salon-style ID, name, and
price on the card, map, and Book URL.

| Reproduction input | Public route/API evidence | Corrected outcome |
| --- | --- | --- |
| `Blowout` / `Dominican blowout` | `/salons?q=...` → `POST /api/discovery/decision-search` with service, coordinates, and structured filters | Resolves to the active canonical `Dominican Blowout` fixture and excludes Trim, prose-only mentions, and stylist-bio-only mentions. |
| `Boho / Goddess Braids` / `Box braids` | Same route and API; approved alias/common-phrase rules participate | Resolves only to its active managed master style; ambiguous shared aliases do not pick an alphabetical row. |
| `Trim` | Same route and API | Returns only salons with the actual published Trim service. |
| `boho godess brads` | Same route and API | The approved misspelling resolves above the controlled threshold; unrelated styles remain absent. |
| Missing/inactive/archived explicit service ID | Structured `serviceId` filter | Produces an honest unavailable/zero result and never borrows free text or a cheap fallback. |
| Combined filters | Focused browser request records radius, rating, price, date, offers, sort, page, and page size | Every returned salon satisfies every selected condition and retains one matched-service identity. |

The exact final screenshot URLs, release SHA, and Draft PR link must be added to
the PR after publication. No salon/customer identifiers from production are
recorded in this document.

## Search-matching architecture

### Deterministic canonical resolution

The customer query is normalized for case, accents, punctuation, ampersands,
and spacing, then resolved in this order:

1. explicit stable master-style ID;
2. exact canonical service name;
3. exact approved alias/common phrase from catalog language rules;
4. approved misspelling;
5. controlled fuzzy correction above the catalog threshold;
6. service group or category only when the phrase is genuinely broad.

Canonical-name tokens are added only when unique. A shorthand such as
`Blowout` may therefore resolve to `Dominican Blowout` only when it uniquely
identifies that catalog service. Equally specific aliases that identify more
than one service are treated as ambiguous rather than broken alphabetically.
An explicit stable ID is accepted only when it identifies a currently active,
non-archived managed master style. A malformed UUID receives a safe validation
response; a syntactically valid but missing, inactive, or archived ID is
rejected as unavailable and cannot borrow free-text resolution. No external
language model is used or advertised.

### Strict salon eligibility

After resolution, eligibility is strict:

- a stable service requires a published salon style whose
  `master_style_id` equals that service ID;
- a broad approved group/category requires a published salon style in that
  exact group/category;
- an unresolved service-like phrase qualifies no salon;
- salon descriptions, salon names, stylist bios, and stylist specialties do
  not qualify a salon for a service query;
- the cheapest unrelated style is never used as a fallback;
- style-match quality is evaluated before price inside an approved broad
  group/category.

The returned `matched_service` is the qualifying published salon-style row.
Its name, current price (including an eligible promotion), and stable salon
style ID are reused by both the card/map presentation and Book URL. Related
services are not mixed into exact results. An exact zero result remains an
honest zero state; any future related section must be separately labelled and
taxonomy-backed.

### Ordering and bounds

Decision search reads active, non-archived master styles and active service
language rules through stable PostgREST pages until an empty page is returned.
Nearby discovery requests the complete eligible radius set, and style,
promotion, and booking enrichment is chunked and paged. Canonical eligibility,
all selected filters, and ordering are applied before customer-result
pagination; the nearest 50 are never truncated before those checks.

- `rating` means genuine rating first, then review count, distance, and stable
  ID;
- `price_low` and `price_high` use the qualifying matched-service current
  price, never another style or the salon-wide minimum;
- `distance` uses the selected origin/radius and a stable identity tie-break;
- subscription tier does not add an organic placement score;
- each API response page is capped at 50 rows; the UI requests 48, exposes
  `Load more salons`, requests the next filtered page, and deduplicates appended
  salons by stable salon ID;
- `has_more_results` is calculated from the complete evaluated match set.

### Find Salons filter semantics

All structured filters intersect with `AND` semantics:

| Filter | Semantics |
| --- | --- |
| Homepage/header submission | Service text, location text or explicit current location, the Search button, and keyboard Enter all serialize into the same canonical `/salons` URL state. |
| Service / stable service ID | Tolerant canonical resolution is followed by strict published-style eligibility. Explicit IDs must identify an active, non-archived master style. |
| Location/current location | A typed city, neighborhood, or ZIP must resolve honestly. Device coordinates are used only after the customer explicitly chooses current location; an unresolved typed place never borrows cached coordinates. |
| Radius | Salon coordinates must fall within the selected radius of the resolved explicit/customer origin. |
| Minimum rating | A salon must have a genuine score at or above the selected threshold. Missing ratings do not become `New`. |
| Maximum price | The qualifying matched-service current eligible post-promotion price must be known and at or below the selected amount. A null price is not zero and cannot pass the filter. |
| Date/availability | The qualifying service must have a verified opening on the selected date. A timeout/provider failure is not guessed as available. |
| Active offers only | The qualifying style must have a current active promotion that targets it and passes validity and minimum-subtotal rules. |
| Sort | `distance`, `rating`, `price_low`, and `price_high` use the exact semantics and stable tie-breaks above. |
| List/Map | Presentation state only; both views consume the same result identity and filters. |
| Clear filters | Resets controlled discovery filters without retaining stale results or corrupting unrelated URL state. |
| Pagination | Load More requests the next page of the same strict result set and appends without duplicate salon identities. |

Every simultaneous structured filter intersects with logical `AND`; selected
dropdowns are never relaxed to fill a page. Query, filters, location, and
list/map mode are serialized into the URL. Refresh and `Back`/`Forward` restore
controls and re-run the same request rather than silently retaining stale state.

## Public presentation corrections

- No-review result cards omit the rating area; they do not show a `New` pill.
- `New booking history` and equivalent public reliability prose are removed.
- Verified and Sponsored labels remain when supported by real data.
- The visible generated result-count/lowest-price paragraph is removed. A
  concise screen-reader status such as `Search updated: 24 matching salons.`
  remains permitted.
- Visible AI/AI-assisted discovery branding is removed.
- The mobile search form occupies one sticky slot, respects safe-area/header
  and bottom-navigation boundaries, and does not create horizontal overflow.
- Verified salons retain `Verified Salon`; unverified salons render no
  replacement `Salon Profile` badge.
- Unverified salon trust presentation is a positive allowlist, not a denylist.
  Only the exact normalized CMS inputs `Transparent Pricing`, `Time Respected`,
  and `Real Availability` may render, and they render as the neutral public
  labels `Pricing shown upfront`, `Appointment timing`, and
  `Current availability` with Tag, Clock, and Calendar semantics respectively.
- Every other CMS trust label is suppressed for an unverified salon. Regression
  fixtures explicitly cover `Verified`, `Identity checked`, `License
  confirmed`, `Girlz Culture Approved`, `Vetted Professional`, `Certified
  Salon`, `Background Checked`, `Trusted Professional`, and the mixed claim
  `Transparent Pricing · Verified`. No verification icon is rendered for an
  unverified salon.
- The visible zero-review copy is exactly `No reviews yet`.
- Published reviews, verified-client presentation, and a real salon reply remain
  visible when those records exist; the empty state does not replace genuine
  review content.
- Browse Styles cards show image, style name, and salon count without a visible
  category eyebrow.

## Authoritative Browse Styles catalog

Migration `20260831100000_authoritative_public_style_catalog.sql` adds
`public.list_public_style_catalog(p_limit, p_offset)`. It aggregates all
eligible, published, non-archived salon offerings by active, non-archived
managed master style before applying page bounds. It returns stable
master-style identity, category/group identity, distinct salon count, minimum
positive starting price, representative media, every published
`length_options` label, and approved language-rule terms.

The page requests the RPC in 500-row pages, advances `p_offset` by the number
of rows returned, and stops only when a page is empty. It then applies the
following customer filters to the assembled eligible catalog rather than an
initial popularity slice or arbitrary total-row cap:

- text: canonical name plus approved terms, normalized for punctuation/case
  with conservative typo tolerance;
- category: exact normalized category;
- length: an exact normalized match against every supported length, not just
  the first option;
- price: `Under $150` is `< 150`; `$150–$250` is inclusive at both 150 and
  250; `$250+` is `> 250`; a missing/unknown price is excluded from every
  numeric band rather than treated as zero;
- popularity: distinct currently eligible salon count descending, then stable
  alphabetical tie-breaks;
- A–Z: accent-insensitive English collation with deterministic exact/name
  tie-breaks.

Available-style chips use the same query state. `View all` resets controlled
catalog filters. All active filters combine with `AND`. URL state preserves
unrelated query parameters and supports refresh and browser history.

Each style card links to `/salons` with canonical style name, stable
master-style ID, style slug, and category. The destination still applies strict
currently published salon-service eligibility; the card cannot degrade to a
generic text-only salon search.

There is no authoritative maintenance field in the current managed catalog,
so the decorative Maintenance control is removed. The nonfunctional More
Filters control is also absent. No synthetic maintenance classification was
invented.

## Official subscription catalog

`src/lib/plans.ts` is the typed catalog used by new public/application
selections and TypeScript owner, Admin, checkout, change, and webhook paths. It
contains stable key/name, amount in cents, display price, canonical Stripe
variable, upgrade/entitlement rank, every comparison entitlement, numeric
limits, fair-use flags, reminder/reporting/source-tracking/waitlist/rebooking
levels, and the advertising discount, credit, cadence, and early-access data.
The database migration mirrors only the values needed for authoritative
database enforcement and verifies them in the clean-database workflow.

| Plan | Key | Monthly USD | Canonical Price variable | Entitlement/upgrade rank (never organic rank) |
| --- | --- | ---: | --- | ---: |
| Starter | `starter` | $59 | `STRIPE_PRICE_STARTER` | 1 |
| Growth | `growth` | $69 | `STRIPE_PRICE_GROWTH` | 2 |
| Premium | `premium` | $89 | `STRIPE_PRICE_PREMIUM` | 3 |

Growth remains `Most Popular`. New application links use `?plan=starter`,
`?plan=growth`, and `?plan=premium`. A historical `?plan=basic` normalizes to
Starter for a new selection.

### Exact approved public copy

The plans page uses these sentences exactly:

> Choose a plan during your application. You will not be charged until your
> salon is approved and you subscribe

> Apply first. After approval, activate your selected plan securely through
> subscriptions

The public page contains no `test-mode billing`, `Stripe test mode`, or
`activate through test mode` wording. Technical founder setup documentation may
still say Stripe test mode where that is operationally accurate.

### Founder-approved comparison

| Feature | Starter $59 | Growth $69 | Premium $89 |
| --- | --- | --- | --- |
| Professional salon profile | ✓ | ✓ | ✓ |
| Unlimited stylist profiles | ✓ | ✓ | ✓ |
| Unlimited appointment bookings | ✓ | ✓ | ✓ |
| 0% Girlz Culture appointment commission | ✓ | ✓ | ✓ |
| Customer deposits | ✓ | ✓ | ✓ |
| Booking-specific customer chat | ✓ | ✓ | ✓ |
| Appointment reminders | Standard | Customizable | Advanced |
| Marketplace visibility | Standard | Standard | Standard |
| Monthly reporting | Basic | Detailed | Advanced |
| Booking-source tracking | Summary | Full | Full + comparisons |
| Waitlist | Manual | Automated | Automated + targeted |
| Rebooking reminders | Manual | Automatic | Automatic + segmented |
| Customer promotions | 1 active | Up to 5 | Unlimited, fair use |
| Product listings | 10 | 30 | Unlimited, fair use |
| Google Business Profile help | Guide | Assisted setup | Assisted setup + review |
| Advertising discount | — | 5% | 15% |
| Advertising credit | — | $10 quarterly | $10 monthly |
| Early access to advertising spaces | — | — | 48 hours early |

The plans page renders this complete table with semantic column/row headings
and a focusable horizontal-scroll container on narrow screens. Removed tier
claims include priority/top organic placement, featured rotation, premium
tier badges, and priority support. Marketplace visibility is Standard for all
plans; paid advertising remains separate and clearly sponsored.

### Implemented plan enforcement

Migration `20260831110000_official_subscription_plans_and_limits.sql` is
forward-only and data-preserving. It replaces the necessary constraints,
functions, and triggers without rewriting business/billing history. It:

- changes only the default for new `salon_applications.selected_plan` rows to
  `Starter`;
- permits `Starter`, `Growth`, `Premium`, and historical `Basic` in the
  scheduled-tier constraint;
- establishes `salon_effective_plan_key` as the authority for feature access:
  a current unexpired active/trialing subscription row wins, and a scheduled
  downgrade does not remove already-paid features before renewal; the salon
  mirror is consulted only for an active historical salon that has never had
  any subscription row; inactive, expired, unknown, and drifted identities fail
  closed or follow the subscription row;
- updates plan/feature helpers without granting tier-based organic placement;
  the internal `advanced_analytics` compatibility feature means non-Basic
  monthly-reporting capability and is not an additional public plan claim;
- exposes plan limits to authenticated/server callers;
- establishes `salon_limit_plan_key` as the separate inventory-limit authority.
  It uses the stricter of the current paid tier and a valid scheduled downgrade
  immediately, so a salon cannot schedule Starter/Growth and then add inventory
  above the target cap before renewal. Only an active historical salon with no
  subscription row may use the documented legacy salon-mirror fallback;
- enforces product limits of 10/30/unlimited and active-promotion limits of
  1/5/unlimited with per-salon transaction advisory locks, so concurrent writes
  cannot race past the limit;
- requires a separate paid/credited Featured Product entitlement belonging to
  the product's salon and covering the full placement window before a homepage
  product placement can be Scheduled or Active;
- updates only the Engine expected-migration marker, not salon, application,
  subscription, product, promotion, billing, or audit history rows.

The salon save route also performs a friendly server precheck and maps database
trigger failures to safe `409` responses. Before scheduling a Starter/Growth
downgrade, the plan-change route counts authoritative non-archived products and
active promotions, rejects an over-cap target safely, and persists the schedule
through the same database authority. The subscription trigger takes the same
per-salon product and promotion advisory locks as the inventory triggers, so a
concurrent writer and downgrade cannot both win. If Stripe created/updated a
schedule but database persistence loses that race, the route releases the
provider schedule rather than leaving an untracked downgrade. Database locks,
functions, and triggers remain the authoritative bypass-resistant boundary.

The clean-database runner defines four race groups: Starter products, Growth
products, Starter active promotions, and Growth active promotions. Each group
starts eight real `psql` transactions concurrently, for 32 database
transactions total. Fixtures start one row below each cap, excess workers must
receive the exact plan-limit error, and final persisted counts must equal
`10,30,1,5`. Source wiring has passed locally. Actual PostgreSQL execution is
still blocked locally and remains pending in disposable PostgreSQL CI; this
report does not call the race test PASS before that execution occurs.

The same disposable runner also defines two scheduled-downgrade/write races:
one downgrade versus a product insert and one versus an active-promotion insert.
Each uses two concurrently released transactions (four transactions total) and
accepts only one of two safe outcomes: the downgrade persists and the writer is
limited, or the writer persists and the downgrade is rejected. It additionally
starts eight concurrent subscription-checkout reservation sessions. All eight
must return one durable attempt/promotion-reservation pair, and persisted counts
must be exactly `1,1`. These are real PostgreSQL checks and remain
`BLOCKED locally / PENDING CI` until the disposable workflow executes them.

### Paid benefits that are not operational in this correction

The catalog truthfully records the founder-approved benefits, while operational
readiness is reported separately:

| Benefit group | Current correction status |
| --- | --- |
| Professional salon profile, stylist profiles, appointment bookings, deposits, and booking-specific chat | Existing platform capabilities remain included for every official plan; this correction does not redesign them. |
| Marketplace visibility | Standard for every plan. No hidden subscription-tier organic boost exists. Paid/credited placement remains a separate Sponsored system. |
| Customer promotions | Starter 1 / Growth 5 / Premium unlimited values are cataloged; Starter/Growth limits are enforced by server precheck and database trigger. Premium fair-use operations are not implemented. |
| Product listings | Starter 10 / Growth 30 / Premium unlimited values are cataloged; Starter/Growth limits are enforced by server precheck and database trigger. Premium fair-use operations are not implemented. |
| Appointment reminders, monthly reporting, and booking-source tracking | Approved differentiated levels are cataloged. This correction does not claim a missing differentiated runtime is operational merely because the comparison row exists. |
| Waitlist and rebooking reminders | Approved levels are cataloged; missing automation/targeting/segmentation is not built by this focused correction. |
| Google Business Profile help | Guide/assisted values are cataloged; no Google setup workflow is created here. |
| Advertising discount, credit, and early access | Approved values are cataloged; no advertising inventory, credit ledger, or early-access delivery system is invented. |

No decorative operational controls were added for missing systems.

Because materially promised benefits still require an operational-readiness
review, new subscription sales fail closed by default through
`SUBSCRIPTION_SALES_ENABLED=false`. The public comparison and application plan
selection can be reviewed without charging a salon.

## Legacy Basic treatment

- New users are never offered Basic.
- A legacy public `basic` selection normalizes to Starter.
- Stored `Basic` billing/history is preserved and may display as
  `Basic (legacy)`.
- `src/lib/plans.ts` retains the historical plan type, new-selection
  normalization, `Basic (legacy)` display label, and legacy Stripe identity
  reconciliation. Its `Basic` monthly-reporting value is a reporting level, not
  a public subscription plan.
- Owner/Admin subscription screens may display or filter `Basic (legacy)` so
  historical records remain reviewable; the public plans/application flow does
  not offer it.
- The database constraint and plan helpers continue recognizing historical
  `Basic`, and legacy `Essentials`, `Pro`, and `Platinum` aliases only where
  required to interpret existing records. No migration rewrites those records.
- `STRIPE_BASIC_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, and
  `STRIPE_PREMIUM_PRICE_ID` are identity-only for existing webhook/history
  reconciliation. The three `STRIPE_PRICE_*` variables are authoritative for
  new sales.
- New Starter checkout never reads `STRIPE_BASIC_PRICE_ID`.
- No migration rewrites existing subscriptions, Price IDs, billing periods,
  quantities, salon tiers, or audit records.
- Unrelated HTTP `Authorization: Basic` code is transport authentication, not a
  subscription-plan reference.
- The active/trialing Basic count was **not queried from production** because
  production data access/change was outside this assignment. It must be
  obtained with an approved aggregate-only production audit before a
  grandfathering decision; no salon/customer identity should be returned.

## Stripe validation contract

Before creating Checkout, reserving a subscription promo, creating a Stripe
customer, or previewing/applying a plan change, the server:

1. requires `SUBSCRIPTION_SALES_ENABLED=true`;
2. requires all three canonical server-side Price variables to be present;
3. retrieves all three Prices from Stripe using read-only requests;
4. verifies every Price for exact ID equality, `active=true`, USD currency,
   recurring type, monthly interval with interval count 1, and the matching
   exact amount 5900/6900/8900 before selecting the requested one;
5. stops with sanitized HTTP 503 output and a protected Engine reference when
   configuration/provider validation fails.

There is no fallback to an old Basic Price, a retired plan alias, an unknown
current subscription identity, or a differently priced variable.
Provider credentials and Price IDs are never accepted from the browser or
written into logs. See `STRIPE_SETUP.md` for the founder procedure.

Local source and contract tests cover missing, inactive, non-recurring,
wrong-currency, wrong-amount, yearly, and multi-month Price responses.
Authenticated Stripe test/live retrieval remains **BLOCKED** pending
founder-created Prices, credentials, deploy-context variables, and an approved
non-production runtime. A blocked provider check is not reported as PASS.

### Subscription Checkout idempotency and reconciliation

Migration `20260901120000_subscription_checkout_idempotency.sql` adds the
service-role-only `subscription_checkout_attempts` authority and serializes one
active attempt and promotion reservation per salon. The server uses a stable
per-salon Stripe Customer idempotency key and a stable per-durable-attempt
Checkout Session key, links provider identifiers back to the attempt, and
reconciles open, completed, expired, and identity-mismatched provider states.
Webhook completion/expiry updates the same durable record before promotion
release. Browser retries and concurrent requests therefore cannot reserve the
same promotion repeatedly or create independent local attempts.

The focused verifier exercises a 100-call in-memory provider double and source
contracts; it is not authenticated Stripe connectivity. The clean-database
runner supplies the separate eight-session PostgreSQL concurrency proof. A real
non-production Stripe retry/concurrency acceptance remains **BLOCKED** until the
reviewed provider runtime is configured.

## Files in this correction

The reviewed correction contains the following 88 paths. This literal list was
captured from `git status --porcelain=v1 --untracked-files=all` after the final
source, documentation, generator, and browser-artifact cleanup. Generated
browser screenshots are intentionally excluded because they are test outputs,
not product changes.

- `.env.example`
- `.github/workflows/database-migrations.yml`
- `docs/FOUNDER_GO_LIVE_CHECKLIST.md`
- `docs/founder-corrections/search-filter-plans/IMPLEMENTATION_REPORT.md`
- `docs/founder-corrections/search-filter-plans/MANUAL_ACCEPTANCE.md`
- `docs/founder-corrections/search-filter-plans/STRIPE_SETUP.md`
- `docs/workstreams/workstream-1/intentional-visual-exceptions.json`
- `package.json`
- `scripts/sql/verify-clean-database.sql`
- `scripts/verify-authoritative-discovery-search.mjs`
- `scripts/verify-clean-database.mjs`
- `scripts/verify-decision-search-enrichment.mjs`
- `scripts/verify-founder-discovery-presentation.mjs`
- `scripts/verify-founder-plan-enforcement.mjs`
- `scripts/verify-founder-style-catalog.mjs`
- `scripts/verify-organic-discovery.mjs`
- `scripts/verify-plan-catalog.mjs`
- `scripts/verify-salon-profile-assistance-and-safety.mjs`
- `scripts/verify-search-location.mjs`
- `scripts/verify-subscription-checkout-idempotency.mjs`
- `scripts/verify-subscription-finance.mjs`
- `scripts/verify-subscription-price-validation.mjs`
- `src/app/api/admin/homepage-products/route.ts`
- `src/app/api/admin/salons/route.ts`
- `src/app/api/discovery/decision-search/route.ts`
- `src/app/api/promotions/salon/route.ts`
- `src/app/api/salon/profile/route.ts`
- `src/app/api/salon/records/save/route.ts`
- `src/app/api/search/suggestions/route.ts`
- `src/app/api/stripe/booking-checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`
- `src/app/api/stripe/subscription/change/route.ts`
- `src/app/api/stripe/subscription/checkout/route.ts`
- `src/app/api/stripe/webhook/route.ts`
- `src/app/globals.css`
- `src/app/internal/acceptance/decision-search/page.tsx`
- `src/app/internal/acceptance/discovery-state/page.tsx`
- `src/app/internal/acceptance/salon-profile/page.tsx`
- `src/app/internal/acceptance/style-catalog/page.tsx`
- `src/app/plans/page.tsx`
- `src/app/salon/[slug]/page.tsx`
- `src/app/salons/page.tsx`
- `src/app/styles/page.tsx`
- `src/components/AdminDashboard.tsx`
- `src/components/SalonApplication.tsx`
- `src/components/SalonReviews.tsx`
- `src/components/SalonSignup.tsx`
- `src/components/admin/AdminApplicationReview.tsx`
- `src/components/admin/AdminFeaturedProducts.tsx`
- `src/components/admin/AdminFinanceDashboard.tsx`
- `src/components/admin/AdminRecordWorkspace.tsx`
- `src/components/admin/AdminSalon360Sections.tsx`
- `src/components/admin/AdminSalonsManager.tsx`
- `src/components/admin/AdminSubscriptionsDashboard.tsx`
- `src/components/commerce/ProductCheckoutClient.tsx`
- `src/components/owner/OwnerDashboardApp.tsx`
- `src/components/owner/StylistSectionFallbackEditor.tsx`
- `src/components/public/FeaturedProductPlacement.tsx`
- `src/components/public/MarketplaceSalonCard.tsx`
- `src/components/public/SalonDiscovery.tsx`
- `src/components/public/SalonTrustLabels.tsx`
- `src/components/public/StyleCatalog.tsx`
- `src/components/search/AutocompleteInputs.tsx`
- `src/components/search/GoogleSalonMap.tsx`
- `src/components/site/PublicChrome.tsx`
- `src/components/site/SearchComposer.tsx`
- `src/generated/repositoryMetadata.ts`
- `src/i18n/generated-source-messages.ts`
- `src/lib/catalogFuzzySearchCore.ts`
- `src/lib/decisionSearchEnrichmentCore.ts`
- `src/lib/decisionSearchIntentCore.ts`
- `src/lib/decisionSearchServer.ts`
- `src/lib/plans.ts`
- `src/lib/salonTrustPresentation.ts`
- `src/lib/styleCatalogCore.ts`
- `src/lib/subscriptionCheckoutCore.ts`
- `src/lib/subscriptionPriceCore.ts`
- `src/lib/subscriptionPriceServer.ts`
- `supabase/migrations/20260831100000_authoritative_public_style_catalog.sql`
- `supabase/migrations/20260831110000_official_subscription_plans_and_limits.sql`
- `supabase/migrations/20260901120000_subscription_checkout_idempotency.sql`
- `supabase/migrations/20260901130000_complete_search_suggestion_coverage.sql`
- `tests/browser/admin-workflows.spec.ts`
- `tests/browser/final-correction-viewports.spec.ts`
- `tests/browser/founder-discovery-corrections.spec.ts`
- `tests/browser/founder-plan-catalog.spec.ts`
- `tests/browser/founder-style-catalog.spec.ts`
- `tests/browser/public-responsive.spec.ts`

No unrelated product-commerce checkout, booking-payment architecture, AI
provider, Admin workflow, or production configuration is added.

### Focused tests added or extended

- `scripts/verify-founder-discovery-presentation.mjs`;
- `scripts/verify-founder-style-catalog.mjs`;
- `scripts/verify-plan-catalog.mjs`;
- `scripts/verify-subscription-price-validation.mjs`;
- `scripts/verify-subscription-checkout-idempotency.mjs`;
- `scripts/verify-founder-plan-enforcement.mjs`;
- the existing decision-search, authoritative-discovery, catalog,
  subscription-finance, promotion, salon-profile, migration-ordering, and
  clean-database verifiers;
- `tests/browser/founder-discovery-corrections.spec.ts`;
- `tests/browser/founder-style-catalog.spec.ts`;
- `tests/browser/founder-plan-catalog.spec.ts`;
- the deterministic salon-profile fixture and browser assertions for the actual
  shared verification badge, exact empty-review copy, and published
  review/reply presentation;
- real Starter/Growth/Premium plan-CTA navigation into the normalized salon
  signup selection, including legacy `?plan=basic` normalization to Starter;
- existing Workstream 1 responsive/accessibility workflows, including the
  corrected keyboard-navigation assertion.

## Validation ledger

This table is intentionally conservative. The final implementer must replace
`PENDING` only with captured command output; a skipped provider or missing
disposable database remains `BLOCKED`, never PASS.

| Check | Verified status | Evidence / next action |
| --- | --- | --- |
| `npm ci` | PASS | Clean lockfile install completed; npm reported `0 vulnerabilities`. |
| Decision-search enrichment | PASS | Canonical/alias/misspelling resolution, inactive explicit-ID rejection, matched-service identity/price, paging/chunking, strict eligibility, promotion scope, and availability bounds passed. |
| Authoritative and connected discovery | PASS | Complete-radius filtering, exact service identity, location handling, and organic no-tier-boost assertions passed. |
| Founder discovery presentation | PASS | Removed customer-facing labels/summary/AI copy and exact matched-service presentation passed. |
| Founder Browse Styles, catalog management, and spreadsheet verifiers | PASS | Complete paged catalog, filter boundaries, canonical links, and managed-catalog assertions passed. |
| Plan catalog and public comparison | PASS | Starter/Growth/Premium, 59/69/89 amounts, all 18 rows, exact public copy, and legacy URL normalization passed. |
| Stripe Price and Checkout-idempotency contract verifiers | PASS (local contract only) | Price mismatch cases fail closed; the 100-call provider double proves stable local idempotency/reconciliation contracts. Neither is provider connectivity. |
| Founder plan-enforcement, promotion, billing, and salon-profile verifiers | PASS | Shared authoritative plan resolution, server/database limit wiring, separate placement entitlement, 0% appointment commission, and public profile/review copy passed. |
| Founder-focused Playwright suite | PASS — 16/16 | The focused Chromium specs passed discovery truthfulness/history/pagination/sticky behavior, Browse Styles, plan comparison, plan-selection handoff, and salon-profile trust/review states. |
| `npm run test:accessibility` | PASS — 56/56 | Full configured Workstream 1 accessibility suite passed. |
| Migration ordering | PASS — 140 migrations | The chronological inventory and expected head `20260901130000` passed `npm run verify:migrations`. |
| Clean-database source/order preflight | PASS | Migration and assertion sources, including the concurrent worker wiring, passed static/focused verification. |
| Clean PostgreSQL execution | BLOCKED locally / PENDING CI | No disposable `CLEAN_DATABASE_URL`, local `psql`, or Docker runtime is available. CI must execute every migration and SQL assertion against disposable PostgreSQL; production is forbidden. |
| 32-transaction plan-limit race | BLOCKED locally / PENDING CI | Four eight-worker database races are wired, but actual transaction execution requires the same disposable PostgreSQL workflow. Source-string verification is not called runtime PASS. |
| Four-transaction scheduled-downgrade/write races | BLOCKED locally / PENDING CI | Product and promotion schedule-versus-writer races require disposable PostgreSQL; only mutually safe winner/loser outcomes are accepted. |
| Eight-session Checkout reservation race | BLOCKED locally / PENDING CI | All sessions must resolve to one durable attempt and one pending promotion reservation (`1,1`). The local 100-call provider double is not substituted for this database run. |
| `npx tsc --noEmit` | PASS | Latest integrated TypeScript run passed. |
| `npm run lint` | PASS | Final integrated run completed with 0 errors and 9 documented warnings. |
| `npm run verify:design-system` | PASS | Source, fixture, theme, and contrast checks passed. |
| Complete repository `npm run test:browser` | PASS — 159 passed, 6 skipped | The clean 165-case matrix passed every executed Chromium, Firefox, WebKit, iPhone, Android, narrow-phone, phone-landscape, tablet, and tablet-landscape case in 11.4 minutes. The six project-gated skips are intentional. |
| `npm run build` | PASS | Final integrated production build completed with the sanitized placeholder environment; expected Supabase fallback logs reflect the deliberately unreachable placeholder host, not provider connectivity. |
| `git diff --check` | PASS | Final stable source/documentation diff contains no whitespace errors. |
| Protected GitHub `verify` | PENDING publication | Record the Draft PR check URL/result after push. |
| Stripe test/live connectivity | BLOCKED | Requires founder-created Prices, deploy-context variables, credentials, reviewed non-production runtime, and sales-gate approval. |
| Google Maps provider-backed acceptance | BLOCKED | Requires an approved configured runtime/API-referrer setup. Fixture/source location tests are not substituted for provider connectivity. |

### Literal command/evidence register

This register prevents grouped prose from being mistaken for execution
evidence. `PENDING` entries must be replaced only with the exact final command
output or protected-workflow URL; blocked provider checks remain blocked.

| Required command | Current evidence state | Publication evidence |
| --- | --- | --- |
| `npm ci` | PASS (490 packages; 0 vulnerabilities) | Local clean-install log recorded; protected-check URL pending publication. |
| `npm run verify:design-system` | PASS (495 source assets; 18/18 fixtures; 14/14 contrast) | Local final log recorded; protected-check URL pending publication. |
| `npm run verify:migrations` | PASS for the current 140-migration inventory/head `20260901130000` | **PENDING protected-check URL** |
| `npm run verify:decision-search-enrichment` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:authoritative-discovery` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:connected-discovery` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:discovery` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:search-location` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:founder-discovery-presentation` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:founder-style-catalog` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:catalog-management` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:catalog-spreadsheet` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:plan-catalog` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:subscription-price-validation` | Recorded local-contract PASS | **PENDING protected-check URL** |
| `npm run verify:subscription-checkout-idempotency` | Recorded local-contract PASS; provider acceptance blocked | **PENDING protected-check URL** |
| `npm run verify:founder-plan-enforcement` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:billing` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:promotion-enforcement` | Recorded focused PASS | **PENDING protected-check URL** |
| `npm run verify:database-clean` | BLOCKED locally / PENDING disposable PostgreSQL CI | **PENDING protected-check URL** |
| `npx tsc --noEmit` | PASS | Final integrated command exited 0; protected-check URL pending publication. |
| `npm run lint` | PASS (0 errors; 9 warnings) | Final integrated local log recorded; protected-check URL pending publication. |
| `npm run build` | PASS | Final integrated production build exited 0; protected-check URL pending publication. |
| `npm run test:accessibility` | PASS (56/56) | Full configured accessibility group passed locally; protected-check URL pending publication. |
| focused founder Playwright specs | PASS (16/16) | `npx playwright test tests/browser/founder-discovery-corrections.spec.ts tests/browser/founder-style-catalog.spec.ts tests/browser/founder-plan-catalog.spec.ts --project=chromium --workers=1 --reporter=line` |
| `npm run test:browser` | PASS (159 passed; 6 intentional skips; 0 failed) | Final clean matrix completed in 11.4 minutes; protected-check URL pending publication. |
| `git diff --check` | PASS | Final local command returned no whitespace errors. |

**Current release status: READY TO PUBLISH AS A DRAFT PR FOR FOUNDER AND CI
REVIEW; NOT READY TO MERGE OR LAUNCH.** All local source, TypeScript, ESLint,
migration-ordering, production-build, design-system, accessibility, focused
browser, and complete 165-case browser checks passed. Launch remains blocked on
the disposable PostgreSQL 17 migration/assertion run and its 32 cap, four
downgrade/write, and eight Checkout concurrency transactions; the protected
GitHub `verify` result; founder manual acceptance; and approved provider-backed
Stripe and Google Maps acceptance. No production action is authorized.

## Known limitations and founder actions

1. Create/configure the three correct Stripe Prices using `STRIPE_SETUP.md`.
2. Keep `SUBSCRIPTION_SALES_ENABLED=false` until price validation and the
   paid-benefit readiness review pass.
3. Decide grandfathering for any active/trialing Basic subscriptions after an
   aggregate-only approved audit; do not auto-migrate them.
4. Complete missing operational systems before representing waitlist,
   automated rebooking, advertising credits/inventory, or Google Business
   Profile assistance as available.
5. Attach the successful disposable PostgreSQL clean-database workflow and
   complete the founder preview/manual checklist before changing the Draft
   status. The final local browser matrix already passed 159 executed cases
   with 6 intentional project-gated skips.
6. Decision-search intent/catalog reads and the authoritative `/styles` catalog
   are exhaustively paged until an empty page. Filtering and eligibility are
   applied to the complete assembled result universe; there is no arbitrary
   2,000-row total cap and no initial popularity slice.

## Rollback

Application rollback is a normal revert of this branch's reviewable commits.
Do not force-push or reset `main`. The four focused migrations —
`20260831100000_authoritative_public_style_catalog.sql`,
`20260831110000_official_subscription_plans_and_limits.sql`, and
`20260901120000_subscription_checkout_idempotency.sql`, plus
`20260901130000_complete_search_suggestion_coverage.sql` — are forward-only and
data-preserving; they do not rewrite business/billing history. If the branch
had been migrated in a disposable preview, discard
that preview. For an eventual deployed database, roll forward with a reviewed
follow-up migration rather than deleting functions/triggers ad hoc. Keep
`SUBSCRIPTION_SALES_ENABLED=false` to immediately prevent new-sale provider
mutations while preserving existing subscription/webhook continuity.

## Boundaries confirmed

- No production data was changed.
- No production provider configuration was changed.
- No real subscription charge was created.
- No Stripe product or Price was created, archived, or modified.
- Booking deposits, refunds, Stripe Connect transfers, and salon payouts were
  not redesigned.
- Product-commerce checkout was not expanded.
- No external AI model was introduced or advertised.
- Workstream 1 was preserved; Workstreams 2–18 were not broadly started.
- The branch must remain Draft and unmerged until all required evidence is
  recorded.
