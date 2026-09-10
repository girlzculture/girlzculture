# Business onboarding service photography

Eight real service photographs are hosted locally as AVIF files, totaling
346,092 bytes. Each file is the unchanged image exported
from its source page; layout uses proportional CSS cover crops. No tiny mockup
thumbnail is enlarged. `media-sources.json` records source URLs, authors,
licenses, byte sizes and SHA-256 hashes.

| Local asset | Photographer | Original page |
| --- | --- | --- |
| `hair-service.avif` | Vurzie Kim | [Source](https://www.pexels.com/photo/a-young-woman-having-her-hair-braided-15576674/) |
| `nails-service.avif` | Artem Podrez | [Source](https://www.pexels.com/video/person-getting-her-nails-done-4783398/) |
| `massage-service.avif` | KoolShooters | [Source](https://www.pexels.com/photo/a-woman-having-a-massage-6628599/) |
| `facial-service.avif` | Anna Shvets | [Source](https://www.pexels.com/photo/focused-cosmetologist-applying-mask-on-female-client-5069463/) |
| `tattoo-service.avif` | Antoni Shkraba | [Source](https://www.pexels.com/photo/a-tattoo-artist-working-on-a-client-7005729/) |
| `lashes-service.avif` | José Antonio Otegui Auzmendi | [Source](https://www.pexels.com/photo/close-up-of-eyelash-extension-application-in-salon-34930118/) |
| `barber-service.avif` | RDNE Stock project | [Source](https://www.pexels.com/photo/a-barber-at-work-7697445/) |
| `other-service.avif` | MART PRODUCTION | [Source](https://www.pexels.com/photo/assorted-cosmetic-products-on-white-surface-7290178/) |

The [Pexels license](https://www.pexels.com/license/) permits website use and
modification. These stock subjects illustrate service activity and are not
presented as platform members or endorsers. The nails image is the source
video's standalone poster; the remaining files are photographs.

The current visual design and final asset choices are not approved. A human
designer will provide replacements. `src/lib/businessSignupMedia.ts` maps these
independent files to the cards and existing hero fallback. `BusinessPhoto` permits
source, alt, object-fit, object-position and aspect-ratio overrides, with centered
cover as the default. No image transforms or screenshot crops are used.

No video is shipped or requested. When supplied, the single completed hero video
belongs at `public/videos/business/business-signup-hero.mp4`. Enable it in
`BUSINESS_SIGNUP_HERO_VIDEO` with a poster. The renderer supports muted inline
looping autoplay, poster/error fallback and reduced motion without player UI.
See `docs/BUSINESS_SIGNUP_DESIGN_HANDOFF.md` for the practical handoff.

`approved-business-reference.png` remains archived as the unchanged founder
reference for PR #55 (SHA-256
`2117890fb18dc3addcafcc7f70d6fee221fde5a5091818b9b873eb32012ba052`).
The current page does not render or request it.
