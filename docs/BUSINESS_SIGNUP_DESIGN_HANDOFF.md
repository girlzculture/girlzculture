# Business Signup design and CMS handoff

The user-provided September 10, 2026 desktop and mobile designs are the approved
visual references. They supersede the earlier visual freeze. The implementation
keeps their cinematic full-bleed hero, clean white selector, rich image/title cards
and trust section while applying the user's corrected copy and removal list.
Visual approval of the final implementation still requires screenshot comparison
and the founder's review of the actual preview.

## Founder editing workflow

Open **Platform Admin → Content Management → Business Signup Landing Page**, at
`/admin/content/page-business-signup`. Use the existing authenticated admin account
with `content` permission.

1. Edit Header, Hero, Business Selector, Business Categories, Waitlist or Trust.
2. Use each image's crop preview and bounded fit/focal controls.
3. Use **Preview draft** for the complete shared landing layout inside the editor.
4. **Save Draft** retains the current published version. **Publish** or **Schedule**
   performs strict content and media validation before changing public content.
5. **Preview live** opens `/business/signup`. Existing unpublish/archive/restore,
   stale-revision protection and management history remain in use.

An unregistered future live application can be drafted but cannot be published.
Only Hair has a dedicated live destination today. Do not use the Hair application
as a shortcut for another category. Hidden categories are absent publicly and
cannot accept direct waitlist submissions.

The editor supports text/image logos, safe internal login destinations, hero
image/GIF/MP4/none, all default copy, media replacement/removal/alt/fit/focal values,
visibility, order, bounded hero height/overlay/alignment and safe trust icons.
It does not accept raw CSS, HTML, JavaScript, external redirects or arbitrary SVG.
See [the complete contract](BUSINESS_ONBOARDING.md) for all fields and limits.

## Approved public content

- Wordmark: **Girlz Culture**. No subtitle or replacement tagline.
- Login: **Already have an account?** and **Log In** → `/business/login`.
- Hero: **Grow Your Beauty Business**.
- Supporting copy: **Get discovered by more clients, manage your business all in
  one place, and be part of a supportive community built for beauty entrepreneurs.**
- Selector: **What’s Your Business?** and **Select the category that best fits your
  business.** No extra eyebrow.
- Cards: image and title only; full-card native links.
- Trust: **A Platform Built for You**, **Safe & Secure**, **More Than a Platform**,
  with their approved descriptions and configurable gem, lock and heart icons.

No hero benefit strip or icon column, decorative slogan, extra hero CTA, card
arrow/checkmark/status pill, radio or separate Continue control belongs here.

| Card | Default route |
| --- | --- |
| Hair Salon & Braiding | `/business/signup/hair` |
| Nail Studio | `/business/waitlist?category=nail-studio` |
| Massage & Wellness | `/business/waitlist?category=massage-wellness` |
| Aesthetics Clinic | `/business/waitlist?category=aesthetics-clinic` |
| Tattoo Studio | `/business/waitlist?category=tattoo-studio` |
| Lash & Brow Bar | `/business/waitlist?category=lash-brow-bar` |
| Barbershop | `/business/waitlist?category=barbershop` |
| Other | `/business/waitlist?category=other` |

Hair preserves only an explicitly valid incoming plan. Waitlist links omit sales
plans. `/partner` and legacy `/salon/signup`, `/salon/login`, `/salon/apply` keep
permanent 308 redirects with their original queries. Plain signup does not choose
Starter, and existing application plan/setup consent remains intact.

Waitlists collect Business Name, Address, Phone Number and Email, with a read-only
Business Type. They use **EARLY ACCESS**, **Join the {businessType} Waitlist**, and
**Join the Waitlist** by default. The global and per-category marketing copy is
editable. Submission reuses the existing monitored `/api/support` Partnerships
intake and requires verified published category availability; it does not create
a subscription or a new mail campaign. Failure retains the form for retry.

## Files and data model

| Responsibility | File |
| --- | --- |
| Typed schema, defaults, safe routing and JSON adapter | `src/lib/businessSignupContent.ts` |
| Published content loading and fail-closed intake read | `src/lib/businessSignupContentServer.ts` |
| Trusted hero MIME/poster publication validation | `src/lib/businessSignupMediaValidationServer.ts` |
| Public landing/header/trust renderer | `src/components/business/BusinessSignupLanding.tsx` |
| Direct category links | `src/components/business/BusinessTypeSelector.tsx` |
| Hero image/GIF/video lifecycle | `src/components/business/BusinessSignupMedia.tsx` |
| Existing SafeImage/responsive-rendition adapter | `src/components/business/BusinessPhoto.tsx` |
| Existing CMS integration and dedicated fields | `src/components/AdminContentManager.tsx`, `src/components/admin/BusinessSignupContentEditor.tsx` |
| Existing content API/publication workflow | `src/app/api/admin/content/route.ts` |
| Scoped MP4 validation/upload adapter | `src/lib/businessHeroVideoCore.ts`, `src/lib/businessHeroVideoUploadServer.ts` |
| Public styling | `src/app/business/business-onboarding.css` |

The existing `content_pages` row uses slug `business-signup` and stores the typed
version-1 config as JSON text in `labels.business_signup`. The existing anonymous
publication RPC serves only published or due scheduled snapshots. Draft preview
stays inside the authenticated editor; it does not add a public draft endpoint.
Admin writes use existing permission checks, atomic history and revision locks.

## Media provenance and replacement

Approved reference files are `girlz_culture_beauty_business_platform(1).png` and
`girlz_culture_beauty_platform_mobile_ui(1).png`. Their UI is not shipped as a page
background. The built-in imagegen editor produced a clean independent 2171×724
salon photograph, preserving the reference scene while removing text and controls;
Sharp converted it without crop/resize to
`public/images/business/business-signup-hero.avif`.

The eight service card files remain independently replaceable:
`hair-service.avif`, `nails-service.avif`, `massage-service.avif`,
`facial-service.avif`, `tattoo-service.avif`, `lashes-service.avif`,
`barber-service.avif`, and `other-service.avif`.

Use `public/images/business/media-sources.json` and the adjacent README as the
asset provenance records. CMS changes reference selected/uploaded assets instead
of overwriting the screenshots or baking editable UI into media. Images use
bounded `cover`/`contain` and focal X/Y controls, centered by default, with no
automatic zoom. `BusinessPhoto` also permits a code-level aspect-ratio override
for an independently sized frame.

## GIF and MP4 behavior

Select **GIF** for an animated image and provide a separate still poster. The
poster appears during server rendering and for reduced motion; live preference
changes swap the source. The public renderer falls back to its poster when the
configured image fails.

Select **Video** for completed H.264 MP4, at most **12 MiB** and **120 seconds**.
The editor uses the existing signed upload/session/finalize machinery with the
scoped `business_hero_video` preset. Video content is preserved; no transcoding,
auto-generated posters or claimed frame-by-frame video verification is added.
The optional local path remains `public/videos/business/business-signup-hero.mp4`.
The CMS upload option avoids a code change for later replacement.

The one hero video fills its media area with muted, looping, inline autoplay,
cover sizing and no controls/play button. A permanent still poster remains below
it; video becomes visible only after `playing` and hides on error or autoplay
rejection. Reduced motion prevents assigning a video source and stops an active
video. Video and poster focal positions are independently configurable.

Publish/schedule check the trusted media inventory rather than relying on suffixes:
a `.img` upload can be GIF. GIFs in Image mode receive an actionable validation
error; animated or video posters are rejected. Unknown/quarantined uploaded hero
media fails closed. Active logo, category and waitlist-override image fields also
reject video sources. Draft editing remains possible. No completed production
video is supplied, so real founder-footage playback is a separate preview acceptance item.

## Migration and deployment limits

`20260910133806_business_signup_content_management.sql` is the only new CMS/video
forward migration. It seeds one published page with the exact validated defaults,
adds one MP4 upload profile, and extends the two existing relevant bucket limits.
`ON CONFLICT DO NOTHING` preserves an existing page/profile; no new content table,
upload policy, broad admin permission, or production record rewrite is introduced.

The initial seed uses local media. Future saves continue the existing whole-row
media attachment scan, including labels and retained publication snapshots.
Attached media replacement preserves still-referenced published objects; cleanup
continues to target old staged uploads.

**No production migration has been applied in this task.** Migration ordering and
offline publication checks pass. A real disposable PostgreSQL validation remains
unavailable locally because Docker/PostgreSQL/psql are absent and no
isolated database URL is configured. Do not substitute an offline/static check
for clean-database execution or point preview writes at production.

## Review and verification

Required viewports are 390×844, 430×932, 768×1024, 834×1194, 1024×768,
1366×768, 1440×900 and 1920×1080. Compare actual screenshots at 390, 768, 1440
and 1920 pixels against the approved references. Inspect full-bleed media, readable
copy, white selector integration, two phone columns, efficient desktop cards,
trust spacing, image loading, focus/tap targets and absence of horizontal overflow.

Focused coverage lives in `business-onboarding.spec.ts`, `business-media.spec.ts`,
`business-waitlist.spec.ts` and the Business Signup CMS/core specs. The guarded
media harness tests actual missing-file failures and GIF source changes; simulated
video API tests explicitly do not establish successful real footage playback.
The seed test compares the forward JSON payload against validated runtime defaults.

Keep exact current test totals, Google Maps result, audit result, GitHub Actions,
Netlify App checks and immutable preview URL in the final PR evidence. PR #56 stays
Draft and unmerged. Do not deploy production, apply production migrations, change
Stripe/subscription sales, alter marketplace/discovery/location/maps or start
Workstream 2. Stop after the founder-reviewable verified preview.

Supabase CLI 2.116.0 generated the forward migration; no remote migration was
applied. Native video acceptance uses an unchanged local MDN CC0 H.264 clip
served only through Playwright interception. It is not the production hero or
founder footage. Exact executed test results are recorded in the PR report.
