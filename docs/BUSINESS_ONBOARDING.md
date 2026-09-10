# Business onboarding contract

PR #56 implements the founder-approved desktop and mobile Business Signup design
and integrates its content into the existing Platform Admin CMS. The September 10,
2026 approved references supersede the earlier engineering-only visual freeze.
The PR remains Draft; production deployment, merging, and production migrations
are not authorized in this task.

## Public design and defaults

`/business/signup` renders one full-bleed salon hero, the white business selector,
eight image/title link cards, and three trust blocks. The hero photograph is
`/images/business/business-signup-hero.avif`; the eight service photos remain
independent assets. Their sources, reference hashes, edit prompt and output hashes
are recorded in `public/images/business/media-sources.json`.

The default wordmark is **Girlz Culture**, without a subtitle. The login area is
**Already have an account? / Log In**, pointing to `/business/login`.

The hero heading is **Grow Your Beauty Business**, with the approved teal accent
and left alignment. Its supporting copy is:

> Get discovered by more clients, manage your business all in one place, and be part of a supportive community built for beauty entrepreneurs.

The selector contains only **What’s Your Business?** and **Select the category that
best fits your business.** Cards contain an image and title. There are no hero
benefit lists, decorative slogans, extra hero CTA, card arrows, status badges,
checkmarks, radios, or separate Continue action. The layout uses two columns on
phones, responsive wrapping on tablets, and one eight-card row where desktop
width permits it. The three trust blocks retain the approved headings and copy,
with gem, lock and heart icons.

## Content Management location and storage

Open **Platform Admin → Content Management → Business Signup Landing Page**:
`/admin/content/page-business-signup`.

This is the existing `content_pages` record with slug `business-signup`, not a
second admin application or page builder. Its version-1 typed configuration is
serialized once into `labels.business_signup`. Other page labels and the shared
`ContentPage.labels` contract remain intact.

| Editor group | Editable fields |
| --- | --- |
| Header | Text/image logo mode, text, image, alt text, fit, focal X/Y, visibility, bounded size/alignment; login helper, label, visibility, safe internal destination |
| Hero | Heading, supporting text, visibility, teal/no accent, overlay intensity, bounded height/alignment, image/GIF/MP4/none, media source, alt, fit, focal X/Y, still poster |
| Business Selector | Heading and supporting text |
| Business Categories | Eight stable identities; display name, image/alt/fit/focal point, visibility, order, waitlist/live mode, optional waitlist heading/description/image override |
| Waitlist | Eyebrow, heading template, description, submit label, success heading/description, privacy text, optional support text |
| Trust Section | Three stable identities; safe icon, heading, description, visibility, order |

Validation accepts bounded text, explicit booleans, finite focal values from 0 to
100, fixed category/trust identities, and enumerated presentation options. It
rejects arbitrary HTML, SVG, JavaScript, CSS, external redirects, and unsupported
media origins. Media URLs use local `/images/` or `/videos/` paths or the configured
project's public `content-media` storage. Empty optional copy/media and `false`
visibility remain editable; publication validates required visible content.

## Draft, preview, publication and audit

The editor reuses existing **Save Draft**, **Publish**, **Schedule**, **Unpublish**,
**Archive** and restore behavior. **Preview draft** renders the shared landing
component inside the authenticated editor; **Preview live** opens the public page.
The public route never reads a draft preview query parameter.

`PUT /api/admin/content` first requires the existing `content` permission and
validates this page's typed configuration. Publish/schedule also verify active
hero upload MIME metadata and live application destinations. Existing
`admin_save_content_record` persists the row and management history atomically,
checks the active administrator's permission, and rejects stale revisions. A
draft save retains the prior public snapshot. Anonymous reads use the existing
`get_public_content_page` published/due-scheduled snapshot projection.

The public loader honors an authoritative hidden/missing record. Display fallback
on a provider/configuration failure is separate from lead intake: waitlist
submission requires a valid published snapshot and fails closed when it cannot
verify current content, visibility, or category mode.

## Canonical routes and plan consent

| Card | Current destination |
| --- | --- |
| Hair Salon & Braiding | `/business/signup/hair` |
| Nail Studio | `/business/waitlist?category=nail-studio` |
| Massage & Wellness | `/business/waitlist?category=massage-wellness` |
| Aesthetics Clinic | `/business/waitlist?category=aesthetics-clinic` |
| Tattoo Studio | `/business/waitlist?category=tattoo-studio` |
| Lash & Brow Bar | `/business/waitlist?category=lash-brow-bar` |
| Barbershop | `/business/waitlist?category=barbershop` |
| Other | `/business/waitlist?category=other` |

Cards navigate immediately by pointer or keyboard. Only Hair has a registered
live application today. A different live mode can be prepared in a draft, but
cannot be published until a dedicated application destination is registered; it
never falls back to the Hair application. Visibility and mode also govern direct
waitlist URLs and submission validation.

`/partner` returns permanent 308 to `/business/signup`, preserving queries.
`/salon/signup`, `/salon/login` and `/salon/apply` return permanent 308 to their
business equivalents with queries intact. `/business/login` and `/business/apply`
retain their existing behavior.

A plain gateway never invents a Starter plan. Hair preserves an explicitly valid
incoming Starter/Growth/Premium choice; the historical explicit `basic` URL alias
maps to Starter. Missing, empty, duplicate and invalid choices do not select a
plan. Waitlists never carry sales plans. Account creation does not show a selected
plan banner; the detailed application requires an explicit plan and setup type.
Existing marked explicit account metadata may restore that choice for a pending
owner; ambiguous historical defaults and submitted subscriptions are unchanged.

The preserved application setup values are `solo_professional`,
`shared_suite_booth`, `single_location_staffed`, `multi_location` and
`mobile_on_location`. Neither plan nor setup is defaulted by this landing page.

Existing dynamic/private HTML, CDN no-store boundaries, service-worker exclusions
for business/application routes and old-cache cleanup remain in place. Their
regressions continue to check query isolation and rejection of stale onboarding
HTML during offline navigation.

## Waitlist capture

Each waitlist displays a locked **Business Type** and requires **Business Name**,
**Business Address**, **Business Phone Number**, and **Business Email**. The CTA is
**Join the Waitlist**. Defaults use **EARLY ACCESS**, **Join the {businessType}
Waitlist**, and:

> We’re opening access to more beauty and wellness businesses in stages. Join the waitlist and we’ll reach out when onboarding opens for {businessType} businesses in your area.

Capture reuses `POST /api/support` and the existing `support_tickets` Partnerships
inbox. The stable category, name, address, phone and email are validated and
recorded through the existing moderation, honeypot, rate-limit and monitored
intake boundary. It creates no new lead table, payment, subscription, or automatic
email campaign. Success requires an OK JSON response with `ok: true` and a confirmed
record ID. Failures preserve the form for retry and expose only safe messages and
validated incident references.

## Media contract

The editor reuses the signed prepare/upload/finalize media pipeline and the
`content-media` inventory. Images use existing image validation and canonical
renditions. Hero MP4 uses only the `business_hero_video` preset, with a maximum of
12 MiB, 120 seconds, and a validated H.264 picture track. Server finalization
checks the prepared path, MIME, size, MP4 container metadata and stored checksum.
The completed source is preserved; this feature does not transcode, manufacture
posters, or claim frame-by-frame decoding validation.

Hero video is muted, looping, inline autoplay with no controls or play button.
Its still poster remains until `playing` and after errors or autoplay denial.
Reduced motion prevents attaching the video source, stops an active video, and
uses a still poster for GIFs. Hero fit defaults to cover with centered focal
coordinates; bounded CMS focal/fit controls adjust cropping without zoom.

Publish/schedule inspect trusted `media_assets.mime_type`, `source_mime_type`,
and matching rendition metadata. Generic `.img` filenames cannot disguise GIFs.
Active logo, category and waitlist-override image fields also reject video sources.
Image mode rejects a GIF with an instruction to choose GIF; GIF/video fallback
posters must be verified still images. Unknown or quarantined uploaded hero media
cannot be published. Draft mode permits incomplete editing without weakening the
publication gate.

No production footage is shipped. The optional local path remains
`/videos/business/business-signup-hero.mp4`; the founder can instead upload and
replace an MP4 through the CMS without changing code. Real playback of founder
footage still requires that footage and a non-production review environment.

## Database boundary and current verification limits

The new forward migration is
`20260910133806_business_signup_content_management.sql`. It adds one upload profile,
extends the existing `media-originals` and `content-media` bucket ceilings to
support MP4, and seeds the published `business-signup` content page. It creates no
new tables or upload policies. Both seed inserts use `ON CONFLICT DO NOTHING`, so
existing founder content/profile configuration is retained. Existing image routes
continue to enforce their own validation limits.

The row's `published_payload` is the same validated default payload stored in its
labels. Future admin saves keep existing publication history and attachment
triggers. Whole-row media reference scanning includes labels and retained
published/scheduled snapshots; replacing an attached image does not immediately
remove a still-referenced public object. The initial local-asset seed has no
administrator actor and does not manufacture an admin history event.

This task has **not applied the migration to production**. Offline migration order
verification passed for 142 unique migrations, and the publication activation
verifier passed. The clean-database script reached its explicit missing
`CLEAN_DATABASE_URL` guard after its offline prerequisite checks. Docker,
PostgreSQL/psql were unavailable locally, so actual clean-database
execution remains blocked here; offline checks are not database execution proof.

Focused browser tests exercise the eight required viewports: 390×844, 430×932,
768×1024, 834×1194, 1024×768, 1366×768, 1440×900 and 1920×1080. The guarded media
harness includes real missing-file failures and a small GIF fixture; video
lifecycle stubs are identified as simulated. Current browser/full regression,
Google Maps, audit, GitHub Actions and Netlify results belong in the PR's latest
evidence report, not an assumed completion claim in this contract.

The founder must review actual 390/768/1440/1920 screenshots and an immutable
non-production preview. No preview application may write to production. Stripe,
subscription sales, production data, marketplace/discovery/location/maps, preserved
Workstream 1 and unstarted Workstream 2 remain outside this task.

Supabase CLI 2.116.0 generated the forward migration; no remote migration was
applied. Native video acceptance uses an unchanged local MDN CC0 H.264 clip
served only through Playwright interception. It is not the production hero or
founder footage. Exact executed test results are recorded in the PR report.
