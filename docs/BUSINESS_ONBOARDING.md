# Business onboarding contract

This correction starts from main `dc3ef437da37fd270e9153fb5a48bc408c72fb62`
(PR #54). Production release and migration remain founder-controlled.

## Production Starter banner investigation

On September 9, 2026, fresh browser contexts reproduced the Starter banner at
`https://girlzculture.com/salon/signup` with no query and with an invalid query.
The served JavaScript still contained `normalizePlan(y.get("plan")||"Starter")`
and an unconditional banner. `/business/signup` returned 404.

Netlify's published production deploy was `6aa0551fc359c85c425b17b3`, locked,
from commit `8b57002cfcd78ed1de0307235afd95eae4946645`, before PRs #53 and #54.
Fresh responses had private/no-store headers, Durable cache bypass and Edge
cache miss. A fresh page without a controlling service worker also reproduced
the bug. The source/runtime discrepancy was a stale locked production release,
not evidence that current source or a cleared browser had deployed successfully.
This task does not unlock, promote, or deploy production.

## Canonical public flow

- `/business/signup`: category gateway; no plan or account form by default.
- `/business/signup/hair`: account creation; never shows a selected-plan banner.
- `/business/login`: stable public business login.
- `/business/apply`: detailed application and explicit plan/setup selection.
- `/salon/signup`, `/salon/login`, `/salon/apply`: permanent 308 redirects to
  their business equivalents, preserving the original query.

Plans CTAs intentionally carry `?plan=starter`, `growth`, or `premium`. An
explicit historical URL alias `basic` maps to Starter. Missing, empty, invalid,
or other legacy aliases never invent a plan. Selecting Hair is a category
choice, not a plan choice. Internal salon roles, tables, APIs, dashboards and
the existing application-received page retain their compatible names.

New account metadata records whether a valid plan was explicitly supplied.
After email confirmation/later login, only that marked choice may be restored
for a pending owner without a submitted application. Unmarked historical
metadata is ambiguous because older builds invented Starter; it cannot supply
a choice. The applicant can choose again on the application. Existing submitted
owners still go to Pending; existing subscriptions are not rewritten.

## Database and write boundaries

Forward migration
`20260909185351_business_onboarding_explicit_application_choices.sql` removes
the selected-plan default and keeps NOT NULL. Application rows are created at
final submission, not during account creation. Historical migrations and
existing application/subscription records remain unchanged.

New submissions require explicit Starter, Growth, or Premium and an explicit
`business_setup_type` from:

| Stored value | Applicant label |
| --- | --- |
| `solo_professional` | Solo professional — just me |
| `shared_suite_booth` | Shared suite / booth professional |
| `single_location_staffed` | Single-location business with staff |
| `multi_location` | Multi-location business |
| `mobile_on_location` | Mobile / on-location business |

Setup has no default. Historical null values remain valid and display “Not
provided.” The API validates both choices before persistence. The atomic RPC
validates before any salon mutation. A table trigger rejects omitted/invalid
choices on new inserts and invalid explicit changes, while leaving unchanged
historical values alone. A CHECK constrains setup values. Admin corrections
validate the same choices; existing revision triggers snapshot the new field.
Admin review, submission detail and Salon 360 display it.

Clean-database verification asserts final column defaults/nullability, all 15
plan/setup combinations through the real RPC, stored rows and revision JSON,
invalid/omitted writes, and preservation of the existing salon subscription.
The test rolls back its fixtures in an isolated PostgreSQL database. The new
migration is not applied to production by this task.

## Landing media, accessibility and caching

The landing composition follows the founder's September 9 Image A: four service
photo panels, a soft dark-to-teal media transition, compact centered benefits,
an elevated white selector with eight photo cards, a three-column trust row,
and the rounded Continue CTA below that row. Shading derives from the existing
`--gc-magenta` / semantic `brand.cta` teal and charcoal; it introduces no separate
green. The CTA keeps the existing accessible theme color.

Hair Salon & Braiding is visually emphasized as Available Now on entry, but
still requires explicit selection. The other seven native radios remain
disabled with readable Coming Soon pills. No category or plan is automatically
selected. Keyboard and WCAG A/AA checks cover 320, 390, 768, 844, 1440 and 1920
pixel widths; desktop has a four-column, two-row photo grid and mobile adapts
to two columns without dropping imagery.

`public/images/business/approved-business-reference.png` is the unmodified
founder-provided Image A. `src/lib/businessSignupMedia.ts` defines clean photo
windows for the four service scenes and eight category thumbnails.
`BusinessPhoto` clips those regions proportionally in CSS. All typography,
controls and layout are live HTML, not part of a screenshot. See the colocated
asset README for provenance, exact hash, subjects and source limitations. No
new AI artwork, stock downloads, remote hotlinks or dependencies are introduced.

No approved video clips were supplied. The existing optional video behavior
remains available for future approved standalone posters/clips, including
reduced-motion and failed-playback fallback. Current rendering uses twelve
static photo windows with a single cached local image request.

Business pages render dynamically with private/no-store HTML and an explicit
Netlify CDN no-store boundary. Worker v4 excludes `/business` and legacy
application routes; activation clears earlier application cache versions. The
browser regression seeds stale Starter HTML, verifies old-cache cleanup and
query isolation, and verifies that sensitive navigation cannot read cached
onboarding HTML offline. The public offline fallback remains operational.
Development deliberately unregisters service workers; the regression explicitly
registers the shipped worker after hydration and also runs on a production build.

## Founder preview acceptance

The full production browser validation also exposed an intermittent Browse
Styles Back-navigation race. Instrumented native history events showed the
correct catalog URL at `popstate`, then the shared customer-location provider's
synchronous React update committed a pending salon-search URL before Next's
history listener read the destination. The catalog consequently mounted with
the salon query and lost its visible filters. Location synchronization now waits
until the native listeners finish, checks that its captured URL is still current,
and cancels superseded/unmounted callbacks. The permanent pending-history browser
test holds real scheduler callbacks across Back to exercise this boundary; it
failed against the original production build. Existing catalog URL, input,
filter and scroll assertions remain intact.

The development release gate then exposed a separate mount-replay defect: Strict
Mode cleanup aborted the initial salon search while its one-shot intent flag
remained set. The replay never restarted that request, leaving “Searching…”
indefinitely. Cleanup now clears the initial/automatic search guards after
aborting, allowing replay to start the required replacement request. The same
pending-history regression remains unchanged and covers completed search before
Back in both development and production. The release workflow now retains browser
failure artifacts, matching the main verification workflow.

Open the new PR's actual Netlify Deploy Preview in a fresh browser. Verify the
plain QR route, all three explicit plan CTAs, legacy redirects, account step,
mobile/desktop composition and absence of hydration/media errors. Current photo composition uses the founder-provided reference; video clips
remain optional pending approved sources. Do not submit a
preview application to a production-connected database. Repository browser/API
fixtures and clean PostgreSQL verification cover writes without production data.

GitHub Actions and all Netlify App checks must be examined separately. A green
GitHub job does not establish a successful Netlify preview. Exact validation
results and any provider blockers belong in the PR's current evidence report.
Stripe configuration, subscription sales, production data and Workstream 2 are
outside this correction.
