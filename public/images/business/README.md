# Business onboarding media

`business-signup-hero.avif` is the clean 2171 x 724 hero photograph derived from
the user-provided approved desktop and mobile designs on September 10, 2026.
The built-in imagegen editor removed the reference's text, icons, interface, and
white lower section while preserving its salon scene, stylist/client identities,
and broad composition. It is an AI-assisted edit of those references. The image contains no website text
or controls, so the landing page can render and edit those separately.

The exported AVIF is 105,373 bytes. Sharp converted the generated PNG using AVIF
quality 68 and effort 6 without cropping or resizing. The AVIF was decoded and
visually inspected after conversion. The stylist is near 43% of the image width,
the seated client near 63%, with plant/salon space at the left. CSS can control
the presentation and overlay without modifying the underlying photo.

The original references are `girlz_culture_beauty_business_platform(1).png`
(desktop) and `girlz_culture_beauty_platform_mobile_ui(1).png` (mobile), supplied
by the user from Downloads. `media-sources.json` records their SHA-256 hashes,
the complete edit prompt, generated PNG identity, conversion, and final asset
hash. The original generated PNG remains in the local Codex generated-images
directory as `exec-730f187b-e216-40ec-a6cc-f53d9a80dcf0.png`.

The eight category AVIFs are separate AI-assisted photographic reconstructions
of the category images in those same approved desktop and mobile references.
They replace the earlier stock-photo selections to follow the approved subjects
and composition. Together they total 811,602 bytes. Each was generated
independently at 1536 x 1024; the page does
not enlarge a screenshot crop. The assets contain photography only, with no
titles, buttons, card borders or other interface graphics. They illustrate the
service categories and are not presented as real platform members or endorsers.

| Local asset | Reference subject |
| --- | --- |
| `hair-service.avif` | Black woman in left profile with long cornrow braids and a black salon cape |
| `nails-service.avif` | Glossy pink manicure with polish applied to the nail plate |
| `massage-service.avif` | Relaxed brunette on a white spa bed receiving a fully draped shoulder massage |
| `facial-service.avif` | Reclined woman in a white towel receiving a facial-mask treatment |
| `tattoo-service.avif` | Floral forearm tattoo and a professional artist's gloved hands |
| `lashes-service.avif` | Closed eye, shaped eyebrow and lash tweezers |
| `barber-service.avif` | Man in left profile receiving a fade haircut |
| `other-service.avif` | Unbranded makeup brushes and cosmetic bottles on a warm vanity |

The massage composition intentionally uses complete opaque towel coverage. The
initial ordinary spa-treatment generation was declined by output moderation;
the accepted retry preserved the category, face placement and calm setting
with a fully draped service. The manicure received one targeted imagegen edit
to place the polish brush on the nail plate. No alternate generation tool or
model was used. These reconstruction details are recorded with the full
prompts in `media-sources.json` rather than claiming identical source pixels.

Sharp converted every final category PNG to AVIF at quality 68 and effort 6,
without cropping, resizing, retouching or compositing. Each exported AVIF was
decoded and visually inspected. `media-sources.json` records every original
PNG filename, source-reference hash, complete prompt, refinement, dimensions,
byte size and final SHA-256 hash. The original generated PNGs remain in the
local Codex generated-images directory. The previous Pexels attributions do
not apply to these replacements.

`src/lib/businessSignupMedia.ts` maps the eight independent service files to
their categories. The Business Signup CMS configuration controls editable media
sources, alt text, fit, and focal point; `BusinessPhoto` also supports aspect-ratio
overrides. The approved reference screenshots are not live page dependencies.

No video footage is shipped. A future hero MP4 requires a still poster and uses
the configurable hero media source. The renderer supports muted inline looping
autoplay, poster/error fallback and reduced motion without player UI. See
`docs/BUSINESS_SIGNUP_DESIGN_HANDOFF.md` for the practical handoff.

`approved-business-reference.png` remains archived as the unchanged founder
reference for PR #55 (SHA-256
`2117890fb18dc3addcafcc7f70d6fee221fde5a5091818b9b873eb32012ba052`).
The current page does not render or request it.

The default hero also has an independent `business-signup-hero-mobile.avif` source
for viewports below 768px, reconstructed from the approved mobile reference.
The picture element preserves both faces without extreme zoom. Uploaded CMS
images continue to use the platform's canonical mobile/tablet/desktop renditions;
replacing the default hero does not keep the default mobile photo.
