# Business signup: developer handoff

The current visual design is **not approved**. Layout, typography, spacing,
colors and final media selection are intentionally left to the human designer.
This engineering correction preserves the existing arrangement and business flow.

## Routes and behavior

- `/business/signup`: category gateway, with no preselected plan.
- `/business/signup/hair`: Hair account creation, followed by `/business/apply`
  for the detailed application, explicit plan choice and business setup.
- `/business/login`: business login.
- `/partner`: permanent 308 redirect to `/business/signup`, retaining queries.
- `/salon/signup`, `/salon/login`, `/salon/apply`: permanent redirects to their
  corresponding business routes, retaining queries.

`BusinessTypeSelector.tsx` renders full-card links using `businessCategories.ts`.
Hair preserves an explicitly valid incoming plan; waitlists do not carry plans.
There is no radio selection, status badge, arrow or separate Continue button.

| Card | Destination |
| --- | --- |
| Hair Salon & Braiding | `/business/signup/hair` |
| Nail Studio | `/business/waitlist?category=nail-studio` |
| Massage & Wellness | `/business/waitlist?category=massage-wellness` |
| Aesthetics Clinic | `/business/waitlist?category=aesthetics-clinic` |
| Tattoo Studio | `/business/waitlist?category=tattoo-studio` |
| Lash & Brow Bar | `/business/waitlist?category=lash-brow-bar` |
| Barbershop | `/business/waitlist?category=barbershop` |
| Other | `/business/waitlist?category=other` |

## Media and styling

- Page: `src/app/business/signup/page.tsx`.
- Hero: `src/components/business/BusinessSignupMedia.tsx`.
- Images: `src/components/business/BusinessPhoto.tsx`; its `photo` prop accepts
  `src`, `alt`, optional `objectFit`, `objectPosition` and `aspectRatio`.
  Defaults are `cover` and centered `50% 50%`, without transforms. Omit the ratio
  to use the containing layout; set it (for example `"4 / 3"`) to size the frame.
- Asset configuration: `src/lib/businessSignupMedia.ts`.
- Independent images: `public/images/business/{hair,nails,massage,facial,tattoo,
  lashes,barber,other}-service.avif`. Replace each file or change its `src`.
  Keep provenance in the adjacent `media-sources.json` and README.
- Page/card/waitlist CSS: `src/app/business/business-onboarding.css`.
  Decorative styling stays here, outside the reusable image component.

No completed video is supplied. The existing image fallback remains active.
When the final video arrives, place it at
`public/videos/business/business-signup-hero.mp4` and set
`BUSINESS_SIGNUP_HERO_VIDEO` in the media configuration to:

```ts
{
  src: "/videos/business/business-signup-hero.mp4",
  poster: BUSINESS_CATEGORY_PHOTOS.hair, // replace with the supplied final poster
}
```

The single video fills the existing hero media area: muted autoplay, loop,
inline playback, cover sizing and no player controls. Its poster remains below
it until playback starts, and on failure. Reduced motion keeps the poster and
does not attach a video source. No page restructuring or routing changes are needed.
The archived `approved-business-reference.png` is never rendered by this flow.

## Waitlist

`src/app/business/waitlist/page.tsx` validates the exact category slug; missing,
duplicate, invalid and live-Hair values return to the gateway.
`BusinessWaitlistForm.tsx` retains category, business name, email, privacy link,
success and retry/error states. It uses the existing `/api/support` Partnerships
intake; no new API, schema or payment integration is introduced. Browser fixtures
verify the submission contract; live persistence requires an isolated working
preview backend. Do not connect preview writes to production for design review.
