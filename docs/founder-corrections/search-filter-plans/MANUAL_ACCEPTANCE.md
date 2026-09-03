# Founder manual acceptance: search, filters, profiles, and plans

## How to use this script

Run public read-only checks against the intended preview first. Use only test
identities and synthetic records for authenticated/write checks. Do not run a
real subscription charge. Do not enable subscription sales merely to review
the UI.

Record every item as `PASS`, `FAIL`, `BLOCKED`, or `AUTOMATED ONLY`. Attach a
screenshot or short screen recording for visual checks and record the final URL
for state/history checks.

| Environment | Base URL | Release SHA | Tester | Date |
| --- | --- | --- | --- | --- |
| Preview / production-shaped | `[enter]` | `[enter]` | `[enter]` | `[enter]` |

## Test data prerequisites

- One published salon offering **Dominican Blowout**, with known salon-style ID
  and current price.
- The active Dominican Blowout master-style ID plus one missing UUID, one
  inactive master-style ID, and one archived master-style ID. None of the last
  three may resolve through a same-name free-text fallback.
- An approved alias/common phrase that maps to exactly one active service, and
  an intentionally ambiguous phrase shared by two active services (for
  example, a generic `protective style` rule) so ambiguity can be verified.
- One salon whose description mentions Blowout but has no Blowout style.
- One active stylist whose bio mentions Blowout at a salon with no Blowout
  style.
- One salon offering Trim but not Blowout.
- One verified salon and one unverified salon. Give the unverified fixture the
  CMS labels `Verified`, `Identity checked`, `License confirmed`, `Girlz Culture
  Approved`, `Vetted Professional`, `Certified Salon`, `Background Checked`,
  `Trusted Professional`, `Transparent Pricing · Verified`, `Transparent
  Pricing`, `Time Respected`, and `Real Availability` so allowlisting and
  suppression are exercised rather than inferred.
- One salon with genuine public reviews/replies and one with zero reviews.
- Catalog entries that exercise every category/length and prices of $149,
  exactly $150, exactly $250, above $250, and unknown.
- At least 49 salons that qualify for one exact service query so discovery
  pagination, `Load more salons`, and stable-ID deduplication can be tested.
- More than 500 eligible managed master styles, with a known eligible style
  after the first 500-row RPC page, plus draft and archived offerings that
  must never enter the public style catalog.
- Test salons on Starter, Growth, and Premium in a disposable database for
  plan-limit checks, including Premium salons both within and above the target
  Starter/Growth product and active-promotion caps for scheduled-downgrade
  checks.
- A disposable PostgreSQL 17 database able to run the full migration chain and
  the four eight-worker product/promotion concurrency groups, two paired
  scheduled-downgrade/write races, and the eight-session subscription-checkout
  reservation race. These are required for the real 32-transaction cap check,
  four-transaction downgrade check, and eight-session Checkout check; a mocked
  or source-only test is not a substitute.

Do not create these fixtures in production unless the founder has separately
approved that specific write and cleanup plan.

## A. Find Salons and matched-service truthfulness

### A1. Homepage Blowout search

- **Route:** `/` then resulting `/salons?...`
- **Account:** signed out/customer
- **Viewport:** 1440×1000 and 390×844
- **Input:** service `Blowout`; select a location that contains the fixture
  salon; submit.
- **Expected:** URL contains the query and location state. Each exact result
  offers the canonical Blowout service (for the fixture, `Dominican Blowout`).
  The displayed name, displayed current price, and Book URL's `style` value
  describe the same salon-style row.
- **Failure:** Trim, another unrelated style, a generic starting price, or a
  salon with no qualifying published style appears.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [URL/screenshot]`

### A2. Canonical, alias, typo, and ambiguity

- **Route:** `/salons`
- **Account:** signed out/customer
- **Viewport:** 390×844
- **Inputs (one at a time):** `Dominican blowout`, `Boho / Goddess Braids`,
  `Box braids`, `Trim`, approved typo `boho godess brads`, the active stable
  master-style ID, a malformed ID, the missing UUID, the inactive ID, the
  archived ID, and the deliberately ambiguous shared phrase.
- **Expected:** canonical/alias/approved typo resolves to its real catalog
  service and only salons with a qualifying published style appear. The active
  stable ID resolves only to that exact service. A malformed UUID receives a
  safe validation response; a missing, inactive, or archived ID produces an
  honest unavailable/zero outcome without borrowing the text query. The
  ambiguous phrase produces an honest empty/disambiguation outcome, not an
  alphabetical or cheapest-service guess.
- **Failure:** description/bio-only salon, unrelated service, or arbitrary cheap
  style appears.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [URLs/screenshots]`

### A3. Description-only and stylist-bio-only exclusion

- **Route:** `/salons?q=Blowout...`
- **Account:** signed out/customer
- **Viewport:** 1440×1000
- **Input:** `Blowout` using the fixture market.
- **Expected:** both negative fixture salons are absent; the Trim-only salon is
  absent.
- **Failure:** any negative fixture appears because prose contains Blowout.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screenshot]`

### A4. Result-card public copy

- **Route:** `/salons` with results including zero-review and reviewed salons
- **Account:** signed out/customer
- **Viewport:** 390×844 and 1440×1000
- **Input:** any exact service query.
- **Expected:** zero-review cards omit rating content and contain neither a
  `New` pill nor `New booking history`. Reviewed salons retain genuine rating
  and count. Verified and Sponsored labels remain only where backed by data.
  No visible AI badge/claim or count/lowest-price prose appears. A concise
  screen-reader live status may exist.
- **Failure:** any removed phrase/label is visible or real labels/ratings vanish.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screenshots]`

### A5. Homepage/header submission, current location, and keyboard parity

- **Route:** `/` and the public header search on `/styles`, `/how-it-works`,
  `/about`, `/blog`, and `/salon/[slug]`, then resulting `/salons?...`
- **Account:** signed out/customer
- **Viewport:** 1440×1000, 1024×768, 390×844, and 844×390
- **Input:** submit the same service/location once with the Search button and
  once with keyboard Enter. Repeat by explicitly selecting `Use my location`.
  Finally type an intentionally unresolvable place while previously granted
  device coordinates remain available.
- **Expected:** every entry point serializes the same canonical service,
  location, and origin state into `/salons`. Button and Enter are equivalent.
  Device coordinates are used only after the explicit current-location choice.
  The unresolved typed place returns a safe unresolved/zero state and never
  silently borrows cached device coordinates.
- **Failure:** a dead submit control, different button/Enter results, a hidden
  stale origin, an HTML/JSON error, or any control overlap at a tested width.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [URLs/screenshots]`

## B. Find Salons filters, map, URL, and history

Run each row individually from a cleared state as a signed-out customer. The
route is `/salons`, every row is a public read-only check, and every row has no
safe production write unless explicitly stated. Then run B8 as a combined
test.

| Test | Route / viewport | Exact input | Expected | Failure | Safe production write | Status/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| B1 Distance | `/salons`, 1440×1000 | Radius 25 miles | Every result is within 25 miles of the selected origin. | An outside salon appears. | None | `[enter]` |
| B2 Rating | `/salons`, 1440×1000 | 4.5+ | Every result has a genuine rating ≥4.5; no-rating salons are excluded. | Lower/missing score appears. | None | `[enter]` |
| B3 Maximum price | `/salons`, 1440×1000 | Max $150 | Every matched service current price is ≤$150. | Generic/other-service price qualifies it. | None | `[enter]` |
| B4 Availability | `/salons`, 1440×1000 | Fixture date | Every result has a verified opening for its matched service/date. | Unavailable salon appears. | None | `[enter]` |
| B5 Offers | `/salons`, 1440×1000 | Active offers only | Every matched style has a current eligible promotion. | Salon-level/unrelated offer qualifies it. | None | `[enter]` |
| B6 Sort | `/salons`, 1440×1000 | price low, price high, rating, distance | Low-to-high and high-to-low use the qualifying matched-service current price; the highest displayed matched price leads `price high`; rating is genuine score-first; distance is nearest-first; every tie has a stable identity tie-break. | Another service's price, a null price, hidden tier, or reliability score changes order. | None | `[enter]` |
| B7 List/Map | `/salons`, 1024×768 | Toggle Map then List | Same salon/style/price identity; URL `view` state follows selection. | Map substitutes a different style/price. | None | `[enter]` |
| B8 AND intersection | `/salons`, 1440×1000 | 25 mi + 4.5 + max $150 + fixture date + offers | Every result satisfies every condition. | Any OR-like leakage. | None | `[enter]` |

### B9. Typed location versus explicit current location

- **Route:** `/salons`
- **Account:** signed out/customer
- **Viewport:** 390×844 and 1440×1000
- **Input:** search a resolvable typed city/ZIP, then explicitly choose current
  location, then type an intentionally unresolvable place while cached device
  coordinates remain available.
- **Expected:** the typed and explicitly selected origins are represented
  distinctly in URL/request state. Only the explicit current-location action
  may use device coordinates. The unresolved typed place does not reuse them.
- **Failure:** cached coordinates silently replace typed location, the origin
  changes after refresh, or an unresolved place returns local-device results.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [request/URL recording]`

### B10. Clear filters

- **Route:** `/salons?ref=founder`
- **Account:** signed out/customer
- **Viewport:** 1024×768 and 390×844
- **Input:** set service, location, radius, rating, price, date, offers, sort,
  and Map view; then activate `Clear filters`.
- **Expected:** every controlled discovery filter and stale result page resets,
  the result set returns to page one, and unrelated `ref=founder` URL state is
  preserved. List/Map behavior matches the product's documented clear action.
- **Failure:** any hidden filter/page survives, unrelated parameters disappear,
  or old filtered cards remain.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [before/after URLs]`

### B11. Complete filtered pagination and deduplication

- **Route:** `/salons` with the 49+ exact-match fixture
- **Account:** signed out/customer
- **Viewport:** 1440×1000 and 390×844
- **Input:** apply one exact service and any fixture-supported filters; record
  the first 48 stable salon IDs; activate `Load more salons` repeatedly.
- **Expected:** the first page contains no more than 48 cards. Each later
  request retains the identical canonical/filter/sort state, appends the next
  strict matches, contains no duplicate salon ID, and removes/disables Load
  More only when `has_more_results` is false. No qualifying salon is lost
  because it was outside an initial nearest-50 prefilter.
- **Failure:** duplicate/missing IDs, relaxed filters, reset sort, a stuck Load
  More button, or a qualifying later-page salon never appears.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [request log/screen recording]`

### B12. Refresh and Back/Forward

- **Route:** `/salons`
- **Account:** signed out/customer
- **Viewport:** 1024×768 and 390×844
- **Input:** apply B8; select Map; refresh; switch to List; press Back twice and
  Forward twice.
- **Expected:** controls and results always match URL state at every step; no
  stale Map/List or filter state and no HTML/JSON error.
- **Failure:** URL and controls diverge, filters reset unexpectedly on refresh,
  or rapid history actions restore the wrong state.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screen recording]`

## C. Sticky search viewport matrix

Use `/salons` as a signed-out customer with a result set long enough to scroll.
These are public read-only checks with no safe production write. For each
viewport below, inspect at scroll Y positions approximately 0, 180, 900, and
2,400.

| Viewport | Expected | Status / screenshot |
| --- | --- | --- |
| 320×568 | Search occupies one stable top slot; no header, card, filter, or bottom-nav overlap; no horizontal scrollbar. | `[enter]` |
| 360×800 | Same. | `[enter]` |
| 390×844 | Same. | `[enter]` |
| 412×915 | Same. | `[enter]` |
| 844×390 | Same in mobile landscape; controls remain keyboard usable. | `[enter]` |
| 768×1024 | Same at tablet portrait transition. | `[enter]` |
| 1024×768 | Same at tablet landscape transition. | `[enter]` |

At a stuck position, no salon-card content may appear in an unintended gap
above the search form. The sticky top must not jump between scroll samples.
**Safe production write:** none.

## D. Public salon profile and reviews

### D1. Verified/unverified badge

- **Route:** `/salon/[verified-slug]`, then `/salon/[unverified-slug]`
- **Account:** signed out/customer
- **Viewport:** 1440×1000 and 390×844
- **Input:** none.
- **Expected:** verified page shows `Verified Salon`; unverified page shows no
  badge in that slot and never shows `Salon Profile`. For the unverified salon,
  only `Pricing shown upfront`, `Appointment timing`, and
  `Current availability` render from the CMS inputs, using neutral Tag, Clock,
  and Calendar semantics. It renders no verification icon and suppresses every
  verification-equivalent or mixed label listed in the prerequisites.
  Open/booking status remains. The verified fixture retains its data-backed
  `Verified Salon` presentation.
- **Failure:** fallback badge, verification icon, dangerous CMS claim, or mixed
  verification label is present for the unverified salon; a neutral allowlisted
  fact is missing; or the verified salon loses its real badge.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screenshots]`

### D2. Empty and real reviews

- **Route:** zero-review salon, then reviewed salon
- **Account:** signed out/customer
- **Viewport:** 390×844
- **Input:** none.
- **Expected:** zero-review visible empty state is exactly `No reviews yet` with
  no explanatory sentence or `New` badge. Reviewed salon retains rating,
  review cards, moderation-safe content, and salon replies.
- **Failure:** old explanatory copy appears or real reviews/replies regress.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screenshots]`

## E. Browse Styles

Run individual tests from `/styles` after `View all`/clearing state as a
signed-out customer. Every row is public/read-only and has no safe production
write.

| Test | Viewport / input | Expected | Failure | Safe production write | Status/evidence |
| --- | --- | --- | --- | --- | --- |
| E1 Cards | 390×844 and 1440×1000 | Cards show image/name/salon count; no category eyebrow. | Category is visibly prefixed. | None | `[enter]` |
| E2 Text | `bohemian braids`, then `boho godess brads` | Both find canonical `Boho / Goddess Braids`; unrelated styles absent. | Valid alias/typo misses or unrelated result. | None | `[enter]` |
| E3 Category | select each available category once | Only exact category styles appear. | Cross-category result. | None | `[enter]` |
| E4 Length | select every available length once | A style appears if any complete `length_options` entry matches. | Only first length is considered. | None | `[enter]` |
| E5 Maintenance | inspect controls | No Maintenance control is present because no authoritative field exists. | Decorative/undefined control appears. | None | `[enter]` |
| E6 Price under | Under $150 | Known $149 appears; $150 and unknown do not. | Boundary/unknown wrong. | None | `[enter]` |
| E7 Price middle | $150–$250 | Exact $150 and $250 appear. | Either boundary missing. | None | `[enter]` |
| E8 Price upper | $250+ | Above-$250 appears; exact $250 does not. | Option is dead or boundary wrong. | None | `[enter]` |
| E9 Popularity | Sort: Popularity | Distinct current salon count desc; stable name tie-break. | Hardcoded order/tier boost. | None | `[enter]` |
| E10 A–Z | Sort: A–Z | Deterministic accent/case-insensitive name order. | Unstable/incorrect order. | None | `[enter]` |
| E11 Chip | select available-style chip | Same query/filter engine narrows to that style; `aria-pressed=true`. | Separate/dead behavior. | None | `[enter]` |
| E12 View all | after multiple filters | Query/category/length/price/sort reset; unrelated URL parameters remain. | Only visible controls clear or unrelated params disappear. | None | `[enter]` |
| E13 Combined AND | `Boho / Goddess Braids` + matching category + Waist + $150–$250 | Only styles satisfying every filter appear. | OR leakage/false empty. | None | `[enter]` |
| E14 More Filters | inspect page | Control is absent (there is no unfinished panel). | Dead More Filters button exists. | None | `[enter]` |

### E15. URL, refresh, and Back/Forward

- **Route:** `/styles?ref=founder`
- **Account:** signed out/customer
- **Viewport:** 1024×768 and 390×844
- **Input:** apply category, length, price and A–Z; refresh; change price; Back;
  Forward.
- **Expected:** URL encodes controlled state, preserves `ref=founder`, and
  controls/cards restore on every navigation.
- **Failure:** state diverges or filtering is applied to only an initial slice.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screen recording]`

### E16. Style-to-salon link

- **Route:** `/styles`
- **Account:** signed out/customer
- **Viewport:** any
- **Input:** open a style card.
- **Expected:** destination is `/salons` with canonical name, stable style ID,
  and category parameters; results only include salons currently offering it.
- **Failure:** dead link, generic search, or unrelated salons.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [URL]`

### E17. Complete catalog pagination and public eligibility

- **Route:** `/styles`
- **Account:** signed out/customer
- **Viewport:** 1440×1000 and 390×844
- **Input:** use the 500+ style fixture; search/filter for the known eligible
  style placed after the first 500-row RPC page. Separately search for the
  draft and archived fixture offerings.
- **Expected:** the later-page eligible style is present and behaves exactly
  like an early-page style. The client requests successive 500-row catalog
  pages until an empty page. Draft, archived, inactive, unmanaged, or otherwise
  ineligible offerings never appear or contribute to salon counts/prices.
- **Failure:** the later-page style is missing, filtering applies only to the
  first popularity slice, a fixed total-row cap truncates the catalog, or an
  ineligible offering appears.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [request log/screenshots]`

## F. Plans and application selection

### F1. Public summary and complete comparison

- **Route:** `/plans`
- **Account:** signed out
- **Viewports:** 1440×1000, 390×844, 320×568
- **Input:** none; keyboard-focus the comparison scroll container on mobile.
- **Expected:** only Starter $59, Growth $69, Premium $89; Growth is Most
  Popular; buttons read `Choose Starter/Growth/Premium`; all 18 comparison rows
  exactly match the approved table; all plans say Standard marketplace
  visibility. The public copy is exactly `Choose a plan during your
  application. You will not be charged until your salon is approved and you
  subscribe` and `Apply first. After approval, activate your selected plan
  securely through subscriptions`. No test-mode or priority-placement copy is
  visible. Mobile cells are reachable without clipping.
- **Failure:** old Basic/$99.50 catalog, missing row/cell, tier visibility boost,
  old public Stripe/test-mode wording, or inaccessible table.
- **Safe production write:** none.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screenshots]`

The 18 comparison rows must match this literal acceptance matrix:

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

### F2. Application query

- **Route:** click each `/plans` selection button
- **Account:** signed out/test salon applicant
- **Viewport:** 390×844 and 1440×1000
- **Input:** Starter, Growth, Premium; separately open `/salon/signup?plan=basic`.
- **Expected:** application selects the matching new plan; legacy `basic`
  safely normalizes to Starter. Compare plans opens the full page as designed.
- **Failure:** wrong name/price, Basic offered, or selected plan lost.
- **Safe production write:** none if the form is not submitted.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [URLs/screenshots]`

### F3. Safe subscription setup before activation

- **Route:** salon owner Subscription section / checkout API
- **Account:** approved synthetic salon owner in **non-production only**
- **Viewport:** 1440×1000
- **Input:** keep `SUBSCRIPTION_SALES_ENABLED=false`; attempt a new checkout.
- **Expected:** no Stripe customer/session/charge is created; UI/API returns a
  safe temporarily-unavailable message and searchable reference.
- **Failure:** old Price fallback, provider mutation, secret/raw error, or charge.
- **Safe production write:** **do not run in production**; non-production
  operational incident record may be written.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [safe reference only]`

### F4. Price mismatch matrix

- **Route:** focused automated test / non-production API only
- **Account:** synthetic salon owner
- **Viewport:** not applicable; API/automated contract test.
- **Input:** missing ID, inactive Price, wrong currency, wrong amount,
  one-time Price, yearly/multi-month Price.
- **Expected:** every case stops before provider mutation with sanitized 503;
  exact valid test Prices are active recurring USD/month×1 at 5900, 6900, 8900.
- **Failure:** Checkout/plan change proceeds or legacy Basic is substituted.
- **Safe production write:** automated only; never point fixtures at live Stripe.
- **Status/evidence:** `[ ] [AUTOMATED ONLY/BLOCKED] [test output]`

### F5. Legacy Basic preservation and operational-readiness truthfulness

- **Route:** `/plans`, `/salon/signup?plan=basic`, salon owner Subscription,
  and Admin subscription/history screens in an approved non-production fixture
- **Account:** signed out for public routes; synthetic owner/Admin for protected
  history screens
- **Viewport:** 1440×1000 and 390×844 where each surface supports mobile
- **Input:** inspect new-selection choices; open the legacy query; inspect one
  historical Basic record without editing it; review all benefit claims.
- **Expected:** Basic is never offered to a new user; the legacy query
  normalizes to Starter; historical data remains intact and may display as
  `Basic (legacy)` in owner/Admin history. New Starter sales use only
  `STRIPE_PRICE_STARTER`; legacy price variables remain identity-only for
  existing webhook/history reconciliation. There is no tier-based organic
  search boost. Missing differentiated reminder/reporting/source-tracking,
  waitlist/rebooking, Google Business Profile assistance, Premium fair-use,
  advertising credit/inventory, and early-access delivery systems are not
  represented as operational merely because their approved comparison values
  are cataloged. New sales remain fail-closed while
  `SUBSCRIPTION_SALES_ENABLED=false`.
- **Failure:** Basic can be newly purchased; history is rewritten; a legacy
  Price is used for Starter; subscription tier affects organic order; or a
  catalog-only benefit is presented as a working control/workflow.
- **Safe production write:** none. Do not query production identities or mutate
  historical subscriptions for this review.
- **Status/evidence:** `[ ] [PASS/FAIL/BLOCKED] [screenshots/test output]`

### F6. Subscription Checkout retry and idempotency

- **Route:** salon owner Subscription section and
  `POST /api/stripe/subscription/checkout`
- **Account:** approved disposable salon owner in a reviewed **non-production
  Stripe test-mode** runtime
- **Viewport:** 1440×1000 for UI initiation; not applicable for concurrent API
  workers.
- **Input:** with the correct canonical test Prices and sales gate enabled only
  in that reviewed runtime, release repeated/concurrent requests for the same
  salon and plan. Retry before linking, after an open linked Session, after
  completion, after expiry, and with an intentionally mismatched linked
  provider identity.
- **Expected:** one durable local attempt and at most one pending promotion
  reservation exist for the active attempt. Customer creation uses one stable
  per-salon idempotency identity; Session creation uses one stable
  per-durable-attempt identity. An open linked Session is inspected and reused;
  completed/expired/identity-mismatched states are reconciled safely. The
  webhook updates the same attempt, and no retry creates a duplicate Customer,
  Checkout Session, subscription, or charge.
- **Failure:** independent attempts/reservations for concurrent requests,
  duplicate provider objects or charge, trusting a browser-supplied provider
  identity, raw provider output, or an unrelated Engine reference.
- **Safe production write:** **do not run in production**. Use one disposable
  test salon and Stripe test mode; remove the fixture through the approved
  non-production cleanup path.
- **Status/evidence:** `[ ] [BLOCKED until configured provider runtime] [safe
  attempt/reference IDs and provider-dashboard screenshots with secrets
  redacted]`

The 100-call in-memory provider verifier is contract evidence only. It cannot
satisfy this provider-backed item. The disposable clean-database eight-session
race separately proves one local attempt and one promotion reservation; it also
does not prove authenticated Stripe connectivity.

## G. Server/database plan limits (non-production only)

These are destructive fixture tests and must run only in the disposable clean
PostgreSQL 17 workflow. UI/API prechecks and source-string assertions are not
database enforcement. The runner must execute four independent cap groups —
Starter products, Growth products, Starter active promotions, and Growth active
promotions — with eight real concurrent `psql` transactions in each group: 32
real concurrent database transactions total.

- **Route/action:** the repository clean-database migration/assertion workflow;
  no public or production route.
- **Account:** isolated disposable PostgreSQL test role against a verified
  non-production empty database.
- **Viewport:** not applicable.
- **Input:** all 140 migrations through expected head `20260901130000`, the
  clean-database assertions, the capped-plan and scheduled-downgrade fixtures
  below, four concurrent cap groups, two paired downgrade/write groups, and the
  eight-session Checkout-reservation group.
- **Failure:** any migration/assertion error, a worker bypassing its cap, a
  wrong/sanitized-error mismatch, an unexpected final count, or any attempt to
  point the runner at production.

| Plan | Product acceptance | Promotion acceptance | Expected database rejection |
| --- | --- | --- | --- |
| Starter | 10 non-archived listings succeed; 11th fails | 1 active promotion succeeds; 2nd fails | `PLAN_PRODUCT_LIMIT_REACHED` / `PLAN_PROMOTION_LIMIT_REACHED` mapped to safe 409 |
| Growth | 30 succeed; 31st fails | 5 succeed; 6th fails | same safe boundary |
| Premium | No numeric cap; fair-use policy/control is not operational in this correction (sales remain gated) | No numeric cap; fair-use policy/control is not operational in this correction (sales remain gated) | no numeric-limit rejection; do not claim fair-use monitoring passed |

For the four capped races, seed each salon exactly one row below its limit
(Starter products 9, Growth products 29, Starter active promotions 0, Growth
active promotions 4), release that group's eight workers together, and retain
every transaction result. Exactly one additional row may persist per group;
all excess workers must fail with `PLAN_PRODUCT_LIMIT_REACHED` or
`PLAN_PROMOTION_LIMIT_REACHED`, as applicable. The final counts must be exactly
`10`, `30`, `1`, and `5`. A sequential loop, mocked repository, UI rejection,
or SQL-source inspection does not satisfy this acceptance item.

Also verify a Scheduled/Active homepage product placement without a separate
marketing entitlement is rejected even for Growth/Premium, and that plan tier
does not alter organic search ordering.

For scheduled downgrades, verify all of the following against the authoritative
database boundary and the server route:

- a Premium salon above a Starter/Growth target product cap receives a safe
  `409` and `PLAN_DOWNGRADE_PRODUCT_LIMIT_EXCEEDED` without retaining a provider
  schedule;
- a Premium salon above a target active-promotion cap receives a safe `409` and
  `PLAN_DOWNGRADE_PROMOTION_LIMIT_EXCEEDED` without retaining a provider
  schedule;
- a within-cap downgrade persists, keeps the already-paid current plan's
  feature access through renewal, and immediately applies the stricter target
  product/promotion limits;
- a product or active-promotion write after scheduling cannot bypass those
  target limits;
- in the product schedule-versus-writer race and promotion
  schedule-versus-writer race, release the two transactions together. The only
  accepted outcomes are: schedule wins and writer receives the relevant
  `PLAN_*_LIMIT_REACHED`, or writer wins and schedule receives the relevant
  `PLAN_DOWNGRADE_*_LIMIT_EXCEEDED`. Persisted state must match the winner.

Separately release eight real database sessions against
`reserve_subscription_checkout_attempt` for the same salon/plan/promotion. All
must return the same attempt/redemption pair, and persisted counts must be
exactly one checkout attempt and one pending promotion reservation (`1,1`).

- **Safe production write:** **none permitted; disposable database only**.
- **Current status:** `BLOCKED LOCALLY / PENDING CI`. The current migration
  inventory is 140 with expected head `20260901130000`; migration ordering has
  passed, while disposable PostgreSQL execution remains pending. Do not mark this PASS
  until CI contains all migration/assertion output, the 32 cap transactions,
  four downgrade/write transactions, eight Checkout sessions, and their exact
  final-state assertions.
- **Status/evidence:** `[ ] [AUTOMATED ONLY/BLOCKED] [clean-DB workflow URL]`

## H. Final acceptance summary

### Automated evidence already recorded

These results do not replace the founder's provider-backed/manual preview
acceptance. They make the distinction between verified source/fixture behavior
and an unavailable external runtime explicit.

| Automated group | Status | Evidence boundary |
| --- | --- | --- |
| Clean dependency install | PASS | `npm ci` completed with 0 reported vulnerabilities. |
| Focused search, public-copy, catalog, plan, and limit verifiers | PASS | All focused verifier commands listed in the implementation report passed. |
| Founder correction browser workflow | PASS (16/16 focused; 159/159 executed full-matrix cases) | The expanded Chromium specs passed plan-selection handoff and actual shared salon-header/review components. The complete repository run passed 159 cases with 6 intentional project-gated skips and no failures. |
| Accessibility workflow | PASS (56/56) | All 56 targeted accessibility cases passed. |
| Migration ordering | PASS (140 current) | Current repository inventory is 140 migrations through `20260901130000`; chronological ordering and expected-head checks passed. |
| TypeScript | PASS | `npx tsc --noEmit` completed without errors on the integrated source. |
| ESLint | PASS | Final integrated `npm run lint` completed with 0 errors and 9 documented warnings. |
| Production build | PASS | Final integrated build completed with sanitized placeholder configuration; no provider acceptance is inferred. |
| Design-system verification | PASS | Source, fixture, theme, and contrast checks passed. |
| Clean-database source/order checks | PASS | Runner structure, migrations referenced, assertion SQL, and concurrency wiring passed source/order validation. |
| Actual empty PostgreSQL 17 migration/assertion run | BLOCKED LOCALLY / PENDING CI | No disposable local PostgreSQL runtime was available. No SQL-execution PASS is claimed. |
| Four eight-worker cap races (32 real database transactions) | BLOCKED LOCALLY / PENDING CI | Source wiring passed; real concurrent `psql` outcomes and final counts `10/30/1/5` still require the disposable clean-DB CI log. |
| Two paired scheduled-downgrade/write races (4 real database transactions) | BLOCKED LOCALLY / PENDING CI | Product and promotion races must each persist only one safe winner and reject the conflicting action. |
| Eight-session subscription Checkout reservation race | BLOCKED LOCALLY / PENDING CI | All sessions must resolve to one durable attempt and one pending promotion reservation (`1,1`). |
| Stripe price-contract fixture tests | PASS | Missing/inactive/wrong-currency/wrong-amount/non-monthly configurations fail closed in mocked contract tests. |
| Checkout idempotency contract fixture | PASS (local contract only) | The 100-call provider double proves stable keys and reconciliation contracts; it is not Stripe connectivity. |
| Authenticated Stripe connectivity | BLOCKED | Requires reviewed non-production Stripe Prices, credentials, deploy context, and sales-gate approval. No provider call or charge was made. |
| Google Maps/geocoding fixture checks | PASS | Local/source location semantics passed; this is not Google provider connectivity. |
| Google Maps provider-backed acceptance | BLOCKED | Requires approved API/referrer configuration in a reviewed runtime. |

### Founder preview/manual ledger

| Manual group | Status | Evidence |
| --- | --- | --- |
| Search resolution, stable IDs, ambiguity, and exact eligibility | `[enter]` | `[enter]` |
| Homepage/header button, Enter, typed location, and current location | `[enter]` | `[enter]` |
| Result-card/public copy | `[enter]` | `[enter]` |
| Sticky search all seven viewports | `[enter]` | `[enter]` |
| Salon profile/reviews | `[enter]` | `[enter]` |
| Browse Styles filters, complete catalog, links, and history | `[enter]` | `[enter]` |
| Find Salons filters, sorts, pagination, map, clear, and history | `[enter]` | `[enter]` |
| Plans/comparison/application and exact public copy | `[enter]` | `[enter]` |
| Subscription sales gate and Stripe provider acceptance | `BLOCKED` | Await reviewed non-production provider configuration; do not create a live charge. |
| Subscription Checkout retry/idempotency provider acceptance | `BLOCKED` | Await the same reviewed non-production Stripe runtime; local contract/database checks are not substituted for provider evidence. |
| Clean PostgreSQL 17, cap, downgrade, and Checkout concurrency | `BLOCKED LOCALLY / PENDING CI` | Attach the clean-database CI URL only after real SQL execution succeeds. |
| Google Maps provider-backed location acceptance | `BLOCKED` | Await approved runtime/API/referrer configuration. |

Any `FAIL` or unapproved `BLOCKED` launch-critical item keeps the Draft PR from
founder acceptance. Do not merge, deploy production, configure live providers,
or create a real charge from this script.

**Current acceptance state: READY FOR FOUNDER UI ACCEPTANCE IN A REVIEWED
NON-PRODUCTION PREVIEW; NOT READY TO MERGE OR LAUNCH.** Local implementation,
migration-ordering, TypeScript, ESLint, build, accessibility, focused browser,
and the complete 165-case browser matrix passed. Merge and launch remain
blocked until the founder records the manual preview results, disposable
PostgreSQL 17 executes all 140 migrations plus the required concurrency
assertions, the protected GitHub `verify` check succeeds, and approved
non-production Stripe and Google Maps provider acceptance is complete.
