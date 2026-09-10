# Business onboarding contract

PR #56 is an engineering-only correction based on main `1b3e5ba` (merged
PR #55). The current visual design is not approved and remains for the human
designer. See [the developer handoff](BUSINESS_SIGNUP_DESIGN_HANDOFF.md) for asset
replacement and route details. Earlier investigation below is historical context.
Production release and migration remain founder-controlled.

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
- `/business/waitlist?category=<slug>`: category-specific interest capture.
- `/partner`: permanent 308 redirect to `/business/signup`, preserving queries.
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

## Landing media and direct card navigation

The founder's focused correction removes the entire four-item hero benefit strip,
status badges, radio/checkmark selection, inner arrows and separate Continue step.
All eight cards are native links with their entire image/title surface tappable.
Hair Salon & Braiding opens `/business/signup/hair` immediately, preserving only
an explicitly valid plan supplied to the gateway. The other seven links open
their category-specific waitlist without carrying a sales plan.

Eight independent local service photos replace composite mockup crops. Asset
source/author/license/hash records are in `public/images/business/media-sources.json`.
The archived founder reference is not a production media dependency.
`BusinessPhoto` accepts source, alt text, object-fit, object-position and aspect
ratio, defaulting to centered cover without zoom or transforms. Existing layout
is frozen; final images and visual design are intentionally left to the human.

No completed video is supplied. The existing static fallback remains active.
The optional single hero video uses `/videos/business/business-signup-hero.mp4`
with muted inline autoplay, looping, cover sizing and no controls. Its image
poster remains until playback and on errors or denied autoplay. Reduced motion
prevents attaching the video source and stops playback when the preference changes.
The previous image entrance animation and custom crop offsets were removed.

Responsive and WCAG A/AA regression checks cover narrow phones through wide
desktop, with pointer/keyboard navigation, image loading, no overflow and explicit
plan consent. Chromium, Firefox and WebKit exercise direct card navigation and
return/reload. The guarded media harness tests configurable image props and
simulated video events; it does not claim real playback of a final video asset.

## Category waitlist capture

The seven exact route slugs are `nail-studio`, `massage-wellness`,
`aesthetics-clinic`, `tattoo-studio`, `lash-brow-bar`, `barbershop` and `other`.
Missing, invalid, duplicate or live-hair categories redirect to the gateway.
Each page names its category, explains the expansion positively and collects
only business name and email, with consent to a category-opening notification.

Capture reuses the existing monitored `POST /api/support` endpoint and
`support_tickets` Partnerships inbox. Subject and message record the selected
business category and slug; the business name/email use existing fields.
Existing validation, honeypot, moderation, rate limit and protected admin intake
remain in force. No API, schema, subscription or automatic-email subsystem is
added. No plan is selected or sold by joining the waitlist.

Success requires an OK response, `ok: true` and a returned record ID. Failure
retains the contact details for retry, hides raw provider diagnostics and shows
only a validated canonical incident reference if one is supplied. Browser tests
cover the request contract, retry, rate limiting, edge HTML and unconfirmed
success. Mocked browser capture is automated evidence only; actual persistence
must also be verified against an isolated non-production preview backend.

## Preserved hydration and caching safeguards

Firefox also exposes React's successful `console.timeStamp("Hydrated")` event
to Playwright. Trace evidence and the installed React development source
identify it as a performance marker. The hydration audit excludes only that
exact `timeStamp` event; its warning/error matcher, page-error listener and
empty-error-list assertion remain unchanged. The same category regression
continues to exercise real reload state and hydration in all three engines.

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
mobile/desktop usability and absence of hydration/media errors. Current media
uses local service photographs; final visual design and video are pending the human
designer. Do not submit a
preview application to a production-connected database. Repository browser/API
fixtures and clean PostgreSQL verification cover writes without production data.

GitHub Actions and all Netlify App checks must be examined separately. A green
GitHub job does not establish a successful Netlify preview. Exact validation
results and any provider blockers belong in the PR's current evidence report.
Stripe configuration, subscription sales, production data and Workstream 2 are
outside this correction.
