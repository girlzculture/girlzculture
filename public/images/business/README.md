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

The hero shows braiding, manicure, facial and tattoo activity. The cards also
show a massage treatment, lash application, barber at work and cosmetic products.
Desktop displays four staggered bright panels; phone displays all four in a
two-by-two composition. The entrance animation ends after 3.5 seconds and is
disabled for reduced motion.

No real video is shipped. No local approved video was available, and attempts
to acquire the licensed source clips returned HTTP 403, including browser asset
export. The implementation uses the founder-authorized improved-image fallback.
Optional local video slots preserve muted/autoplay/loop/playsInline behavior,
reduced-motion handling and poster fallback for a later approved clip. There
are no runtime media hotlinks or added media dependencies.

`approved-business-reference.png` remains archived as the unchanged founder
reference for PR #55 (SHA-256
`2117890fb18dc3addcafcc7f70d6fee221fde5a5091818b9b873eb32012ba052`).
The current page does not render or request it.
