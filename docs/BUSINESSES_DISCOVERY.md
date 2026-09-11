# Customer Businesses hub

`/businesses` introduces category discovery without changing `/salons`, the
authoritative salon search, location controls, reviews, pricing or booking flow.

| Category | Customer availability | Destination |
| --- | --- | --- |
| Hair Salon & Braiding | Live discovery | `/salons` |
| Nail Studio | Coming soon | None |
| Massage & Wellness | Coming soon | None |
| Aesthetics Clinic | Coming soon | None |
| Tattoo Studio | Coming soon | None |
| Lash & Brow Bar | Coming soon | None |
| Barbershop | Coming soon | None |
| Other | Coming soon | None |

Unsupported categories have explanatory content, not disabled links or invented
inventory. The existing business waitlist asks for business name, address, phone
and email. It is recruitment intake, so the customer hub does not send customers
to it or imply that customer launch notifications are available.

`src/lib/businessDiscovery.ts` reuses the stable `BUSINESS_CATEGORIES` identities
and the existing published Business Signup category names, media and order.
Only published content reaches this loader; editing a draft does not change the
hub. The shared defaults remain available if signup content is unavailable.
Recruitment visibility and application/waitlist modes are intentionally separate
from customer discovery availability. Hiding recruitment or preparing a future
application never disables an existing customer marketplace or makes an
unsupported customer category live.

`BUSINESS_DISCOVERY_DESTINATIONS` is the explicit customer route registry. A
future category must receive its own implemented discovery destination before
its state becomes live. The existing salon discovery model exposes salons and
services; it has no authoritative category selector for other beauty marketplaces.
The hub makes no production database query to infer unsupported supply.

The desktop header, mobile menu and mobile bottom bar continue to use the
existing configured navigation. A compatibility adapter maps the seeded salon
discovery slots to **Businesses** while preserving record identities, ordering,
configured empty surfaces and custom destinations. Footer and other direct
salon links remain valid. Browse Styles, How It Works and About Us remain in the
main navigation. The incomplete public language dropdown is removed; public
chrome and hub content explicitly allow browser-native translation.

Coverage: `businesses-core.spec.ts` verifies the independent destination registry
and navigation adapter; `businesses.spec.ts` covers category truthfulness, native
links, keyboard/menu behavior, Back/Forward, salon/style routing, accessibility,
image loading and screenshots at 390, 768, 1440 and 1920 pixels. No schema or
production configuration change is required.
