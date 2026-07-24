# Girlz Culture Engine platform inventory

Generated from the repository on 2026-07-21 by `scripts/generate-platform-inventory.mjs`.

This is a source inventory, not proof that migrations are applied or authenticated/provider behavior is live. Security-critical values remain code/deployment controlled; ordinary content and bounded business settings are routed through Engine or a dedicated permission-controlled admin workspace. The chosen customer-facing term is **Styles & Services**: public/editorial copy may shorten it to **Styles**, while database identifiers retain their existing names to avoid corrupting schema meaning.

## Inventory totals

- Application pages: **44**
- API routes: **92**
- Components/modules under `src/components`: **85**
- Ordered SQL migrations: **82**
- Tables/views discovered in migrations: **102**
- Functions discovered in migrations: **108**
- RLS policies discovered in migrations: **172**

## Application page inventory

| Route | Entry point | Surface | Source/control classification | Engine/admin management | Required access | Draft/publish | Validation/dependencies | Test evidence | Deliberate code exception |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/[page]` | `src/app/[page]/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/` | `src/app/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/about` | `src/app/about/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/account` | `src/app/account/page.tsx` | Customer account | Database-backed customer-owned records | Trust/quality and notification rules in Engine | Customer session and booking ownership | Operational record state; reviews enter moderation lifecycle | Server ownership and completed-booking validation | verify:hardening, verify:media | Booking/payment history is retained |
| `/admin/[section]` | `src/app/admin/[section]/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/login` | `src/app/admin/login/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/submissions/[id]` | `src/app/admin/submissions/[id]/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin` | `src/app/admin/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/blog/[slug]` | `src/app/blog/[slug]/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/blog` | `src/app/blog/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/booking/manage/[token]` | `src/app/booking/manage/[token]/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/booking/recover` | `src/app/booking/recover/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/careers` | `src/app/careers/page.tsx` | Hidden editorial page | Code retained; no public navigation | Not exposed until founder approval | Not applicable | Not applicable | Route remains directly reachable for development | Manual route smoke | Hidden by product decision |
| `/complaint` | `src/app/complaint/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/contact` | `src/app/contact/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/featured` | `src/app/featured/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | Authentication | Supabase Auth plus canonical server identity | Users, Roles & Permissions status only | Guest/auth challenge | Not applicable | Rate limiting, generic errors, signed/expiring challenges | verify:identity, verify:admin-security | Secrets and security wording remain reviewed code |
| `/help` | `src/app/help/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/how-it-works` | `src/app/how-it-works/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/login` | `src/app/login/page.tsx` | Authentication | Supabase Auth plus canonical server identity | Users, Roles & Permissions status only | Guest/auth challenge | Not applicable | Rate limiting, generic errors, signed/expiring challenges | verify:identity, verify:admin-security | Secrets and security wording remain reviewed code |
| `/offline` | `src/app/offline/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Offline fallback is a code/PWA integrity surface |
| `/partner` | `src/app/partner/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/pending` | `src/app/pending/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/plans` | `src/app/plans/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/press` | `src/app/press/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/reset-password` | `src/app/reset-password/page.tsx` | Authentication | Supabase Auth plus canonical server identity | Users, Roles & Permissions status only | Guest/auth challenge | Not applicable | Rate limiting, generic errors, signed/expiring challenges | verify:identity, verify:admin-security | Secrets and security wording remain reviewed code |
| `/review/[bookingId]` | `src/app/review/[bookingId]/page.tsx` | Customer account | Database-backed customer-owned records | Trust/quality and notification rules in Engine | Customer session and booking ownership | Operational record state; reviews enter moderation lifecycle | Server ownership and completed-booking validation | verify:hardening, verify:media | Booking/payment history is retained |
| `/salon/[slug]/book` | `src/app/salon/[slug]/book/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]/product/[productId]` | `src/app/salon/[slug]/product/[productId]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]/stylist/[stylistId]` | `src/app/salon/[slug]/stylist/[stylistId]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]` | `src/app/salon/[slug]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/application-submitted` | `src/app/salon/application-submitted/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/apply` | `src/app/salon/apply/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/dashboard/[section]` | `src/app/salon/dashboard/[section]/page.tsx` | Salon workspace | Database-backed salon/team records | Platform rules in Engine; salon owns its records | Salon owner/team permission | Immediate audited salon-record updates | Server salon membership, feature gate and ownership validation | verify:lifecycle, verify:hardening, verify:records | Billing and retained history use dedicated workflows |
| `/salon/dashboard` | `src/app/salon/dashboard/page.tsx` | Salon workspace | Database-backed salon/team records | Platform rules in Engine; salon owns its records | Salon owner/team permission | Immediate audited salon-record updates | Server salon membership, feature gate and ownership validation | verify:lifecycle, verify:hardening, verify:records | Billing and retained history use dedicated workflows |
| `/salon/login` | `src/app/salon/login/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/onboarding` | `src/app/salon/onboarding/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/signup` | `src/app/salon/signup/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salons` | `src/app/salons/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/search` | `src/app/search/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/social` | `src/app/social/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/styles` | `src/app/styles/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/testimonials` | `src/app/testimonials/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/trending` | `src/app/trending/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |

## API inventory

| Route | Methods | Entry point | Data/provider classification | Engine/dedicated control | Required access | Validation/dependency behavior | Test evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/bookings/[id]` | GET, PATCH | `src/app/api/admin/bookings/[id]/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:hardening |
| `/api/admin/bookings` | POST | `src/app/api/admin/bookings/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:hardening |
| `/api/admin/content` | GET, PUT, DELETE | `src/app/api/admin/content/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/data` | GET | `src/app/api/admin/data/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/engine/ai` | GET, POST, PATCH | `src/app/api/admin/engine/ai/route.ts` | Provider-neutral AI, disabled fail-closed | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/config` | GET, POST, PATCH | `src/app/api/admin/engine/config/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/errors` | GET, PATCH | `src/app/api/admin/engine/errors/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/lifecycle` | GET, PATCH | `src/app/api/admin/engine/lifecycle/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/media` | GET, PATCH | `src/app/api/admin/engine/media/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion, verify:media |
| `/api/admin/engine/navigation` | GET, POST, PATCH | `src/app/api/admin/engine/navigation/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/notifications` | GET, PATCH | `src/app/api/admin/engine/notifications/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/search` | GET, PATCH | `src/app/api/admin/engine/search/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/system-status` | GET | `src/app/api/admin/engine/system-status/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | server authorization | verify:engine-expansion |
| `/api/admin/engine/translations` | GET, PATCH | `src/app/api/admin/engine/translations/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:i18n, verify:engine-expansion |
| `/api/admin/featured-campaigns` | GET, POST | `src/app/api/admin/featured-campaigns/route.ts` | Provider-neutral AI, disabled fail-closed | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:media |
| `/api/admin/finance` | GET | `src/app/api/admin/finance/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/identity-conflicts` | GET, PATCH | `src/app/api/admin/identity-conflicts/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:identity |
| `/api/admin/identity-deletion` | GET, POST | `src/app/api/admin/identity-deletion/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling | verify:identity |
| `/api/admin/inbox-counts` | GET | `src/app/api/admin/inbox-counts/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/admin/marketing` | GET, POST, DELETE | `src/app/api/admin/marketing/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/media/video-jobs` | GET, POST | `src/app/api/admin/media/video-jobs/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:media |
| `/api/admin/promo-codes` | GET, POST, PATCH | `src/app/api/admin/promo-codes/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/records` | GET, POST | `src/app/api/admin/records/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:records |
| `/api/admin/salons/[id]` | GET, POST | `src/app/api/admin/salons/[id]/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/salons/reconcile` | GET, POST | `src/app/api/admin/salons/reconcile/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/salons` | GET | `src/app/api/admin/salons/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/submissions/[id]/decision` | POST | `src/app/api/admin/submissions/[id]/decision/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/submissions/[id]` | GET | `src/app/api/admin/submissions/[id]/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/support/[id]/read` | PATCH | `src/app/api/admin/support/[id]/read/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/support/[id]/respond` | POST | `src/app/api/admin/support/[id]/respond/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/team` | GET, POST, PATCH, DELETE | `src/app/api/admin/team/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/test-data` | GET, POST | `src/app/api/admin/test-data/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling | verify:records |
| `/api/admin/trending-campaigns` | GET, POST | `src/app/api/admin/trending-campaigns/route.ts` | Provider-neutral AI, disabled fail-closed | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:media |
| `/api/admin/verify` | POST | `src/app/api/admin/verify/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/auth/destination` | POST | `src/app/api/auth/destination/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | server authorization | verify:identity |
| `/api/auth/login/start` | POST | `src/app/api/auth/login/start/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | typed/sanitized input, abuse protection | verify:identity |
| `/api/auth/login/verify` | POST | `src/app/api/auth/login/verify/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | typed/sanitized input, abuse protection | verify:identity |
| `/api/auth/mfa/settings` | GET, POST | `src/app/api/auth/mfa/settings/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | typed/sanitized input, server authorization | verify:identity |
| `/api/auth/password-reset/complete` | POST | `src/app/api/auth/password-reset/complete/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | typed/sanitized input, abuse protection | verify:identity |
| `/api/auth/password-reset/request` | POST | `src/app/api/auth/password-reset/request/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | abuse protection | verify:identity |
| `/api/auth/password-reset/verify` | POST | `src/app/api/auth/password-reset/verify/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | typed/sanitized input, abuse protection | verify:identity |
| `/api/auth/signup` | POST | `src/app/api/auth/signup/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Guest challenge or authenticated identity | typed/sanitized input, dependency/confirmation handling, abuse protection | verify:identity |
| `/api/booking-availability` | GET | `src/app/api/booking-availability/route.ts` | Provider-neutral AI, disabled fail-closed | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | verify:hardening |
| `/api/bookings/notify` | POST | `src/app/api/bookings/notify/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | verify:hardening |
| `/api/bookings/reminders` | POST | `src/app/api/bookings/reminders/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Verified provider signature or server secret | route-specific bounds and safe errors | verify:hardening |
| `/api/complaints` | GET, POST | `src/app/api/complaints/route.ts` | Provider-neutral AI, disabled fail-closed | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/concierge/search` | POST | `src/app/api/concierge/search/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/config` | GET | `src/app/api/config/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input | TypeScript/lint/build and route smoke where public |
| `/api/customer/favorites` | POST, DELETE | `src/app/api/customer/favorites/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/discovery/availability` | POST | `src/app/api/discovery/availability/route.ts` | Provider-neutral AI, disabled fail-closed | Public/customer/salon workflow | Public/owner scope validated per operation | abuse protection | verify:hardening |
| `/api/discovery/featured` | GET | `src/app/api/discovery/featured/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | verify:media |
| `/api/discovery/salons` | GET | `src/app/api/discovery/salons/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/discovery/trending` | GET | `src/app/api/discovery/trending/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | verify:media |
| `/api/guest/bookings/manage` | GET, POST | `src/app/api/guest/bookings/manage/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | verify:hardening |
| `/api/guest/bookings/recovery/request` | POST | `src/app/api/guest/bookings/recovery/request/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | verify:hardening |
| `/api/guest/bookings/recovery/verify` | POST | `src/app/api/guest/bookings/recovery/verify/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | verify:hardening |
| `/api/i18n/preference` | POST | `src/app/api/i18n/preference/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:i18n |
| `/api/i18n` | GET | `src/app/api/i18n/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | dependency/confirmation handling | verify:i18n |
| `/api/location/geocode-salon` | POST | `src/app/api/location/geocode-salon/route.ts` | Maps/geocoding provider-backed | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/location/resolve` | GET | `src/app/api/location/resolve/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/media/cleanup` | POST | `src/app/api/media/cleanup/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | dependency/confirmation handling, server authorization | verify:media |
| `/api/media/upload` | GET, POST, DELETE | `src/app/api/media/upload/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization | verify:media |
| `/api/messages` | GET, POST | `src/app/api/messages/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/monitor/client-provider` | POST | `src/app/api/monitor/client-provider/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/newsletter` | POST | `src/app/api/newsletter/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/notifications` | GET, POST | `src/app/api/notifications/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/promo/validate` | POST | `src/app/api/promo/validate/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/promotions/salon` | GET | `src/app/api/promotions/salon/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/push/subscription` | GET, POST, DELETE | `src/app/api/push/subscription/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/application` | POST | `src/app/api/salon/application/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/availability/block` | POST, DELETE | `src/app/api/salon/availability/block/route.ts` | Provider-neutral AI, disabled fail-closed | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/cancel` | POST | `src/app/api/salon/bookings/[id]/cancel/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/reschedule` | GET, POST | `src/app/api/salon/bookings/[id]/reschedule/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | verify:hardening |
| `/api/salon/bootstrap` | POST | `src/app/api/salon/bootstrap/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/discovery-diagnostics` | GET | `src/app/api/salon/discovery-diagnostics/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/lifecycle` | GET, POST | `src/app/api/salon/lifecycle/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding` | GET, POST | `src/app/api/salon/onboarding/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/open-status` | POST | `src/app/api/salon/open-status/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/profile` | GET, PATCH | `src/app/api/salon/profile/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/records/save` | POST | `src/app/api/salon/records/save/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:records |
| `/api/salon/records` | GET, POST | `src/app/api/salon/records/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:records |
| `/api/salon/team` | GET, POST, PATCH, DELETE | `src/app/api/salon/team/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/workspace` | GET | `src/app/api/salon/workspace/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/search/suggestions` | GET | `src/app/api/search/suggestions/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/stripe/booking-checkout` | POST | `src/app/api/stripe/booking-checkout/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:billing, verify:hardening |
| `/api/stripe/booking-status` | GET | `src/app/api/stripe/booking-status/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | dependency/confirmation handling | verify:billing, verify:hardening |
| `/api/stripe/portal` | POST | `src/app/api/stripe/portal/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | server authorization, abuse protection | verify:billing |
| `/api/stripe/subscription/change` | POST | `src/app/api/stripe/subscription/change/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:billing |
| `/api/stripe/subscription/checkout` | POST | `src/app/api/stripe/subscription/checkout/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:billing |
| `/api/stripe/subscription/lifecycle` | POST | `src/app/api/stripe/subscription/lifecycle/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:billing |
| `/api/stripe/webhook` | POST | `src/app/api/stripe/webhook/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Verified provider signature or server secret | dependency/confirmation handling | verify:billing |
| `/api/support` | POST | `src/app/api/support/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |

## Component inventory

| Component/module | Primary owner/surface |
| --- | --- |
| `src/components/AdminContentManager.tsx` | Shared/public/customer surface |
| `src/components/AdminDashboard.tsx` | Shared/public/customer surface |
| `src/components/AdminLogin.tsx` | Shared/public/customer surface |
| `src/components/AdminSupportInbox.tsx` | Shared/public/customer surface |
| `src/components/BookingInbox.tsx` | Shared/public/customer surface |
| `src/components/CustomerAccount.tsx` | Shared/public/customer surface |
| `src/components/CustomerAuth.tsx` | Shared/public/customer surface |
| `src/components/ImageUpload.tsx` | Shared/public/customer surface |
| `src/components/InlineFormValidation.tsx` | Shared/public/customer surface |
| `src/components/PasswordRecovery.tsx` | Shared/public/customer surface |
| `src/components/PwaRegistration.tsx` | Shared/public/customer surface |
| `src/components/ReviewForm.tsx` | Shared/public/customer surface |
| `src/components/SalonApplication.tsx` | Shared/public/customer surface |
| `src/components/SalonBookingWizard.tsx` | Shared/public/customer surface |
| `src/components/SalonDashboard.tsx` | Shared/public/customer surface |
| `src/components/SalonLogin.tsx` | Shared/public/customer surface |
| `src/components/SalonOnboarding.tsx` | Shared/public/customer surface |
| `src/components/SalonReviews.tsx` | Shared/public/customer surface |
| `src/components/SalonSignup.tsx` | Shared/public/customer surface |
| `src/components/SalonStyles.tsx` | Shared/public/customer surface |
| `src/components/SalonStylists.tsx` | Shared/public/customer surface |
| `src/components/SearchClient.tsx` | Shared/public/customer surface |
| `src/components/admin/AdminApplicationReview.tsx` | Platform admin / Engine |
| `src/components/admin/AdminBookingEditor.tsx` | Platform admin / Engine |
| `src/components/admin/AdminFeaturedCampaigns.tsx` | Platform admin / Engine |
| `src/components/admin/AdminFinanceDashboard.tsx` | Platform admin / Engine |
| `src/components/admin/AdminHomepageMarketing.tsx` | Platform admin / Engine |
| `src/components/admin/AdminMarketingWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminPromoCodes.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSalonsManager.tsx` | Platform admin / Engine |
| `src/components/admin/AdminTrendingCampaigns.tsx` | Platform admin / Engine |
| `src/components/admin/AiAutomationManager.tsx` | Platform admin / Engine |
| `src/components/admin/EngineControlCenter.tsx` | Platform admin / Engine |
| `src/components/admin/ErrorMonitoringManager.tsx` | Platform admin / Engine |
| `src/components/admin/HeroImageFraming.tsx` | Platform admin / Engine |
| `src/components/admin/IdentityDeletionManager.tsx` | Platform admin / Engine |
| `src/components/admin/MediaRulesSettings.tsx` | Platform admin / Engine |
| `src/components/admin/NavigationMenuManager.tsx` | Platform admin / Engine |
| `src/components/admin/NotificationTemplateManager.tsx` | Platform admin / Engine |
| `src/components/admin/RecordLifecycleManager.tsx` | Platform admin / Engine |
| `src/components/admin/SalonLifecycleSettings.tsx` | Platform admin / Engine |
| `src/components/admin/SearchLanguageSettings.tsx` | Platform admin / Engine |
| `src/components/admin/SystemStatusManager.tsx` | Platform admin / Engine |
| `src/components/admin/TestDataManager.tsx` | Platform admin / Engine |
| `src/components/admin/TranslationManager.tsx` | Platform admin / Engine |
| `src/components/auth/MfaCodeField.tsx` | Shared/public/customer surface |
| `src/components/auth/RoleLogoutButton.tsx` | Shared/public/customer surface |
| `src/components/auth/SalonPendingGate.tsx` | Shared/public/customer surface |
| `src/components/auth/TeamUserManager.tsx` | Shared/public/customer surface |
| `src/components/booking/GuestBookingManager.tsx` | Shared/public/customer surface |
| `src/components/booking/GuestBookingRecovery.tsx` | Shared/public/customer surface |
| `src/components/i18n/DocumentLocalizationBridge.tsx` | Localization runtime |
| `src/components/i18n/LanguageSelector.tsx` | Localization runtime |
| `src/components/i18n/LocaleProvider.tsx` | Localization runtime |
| `src/components/location/CustomerLocationProvider.tsx` | Shared/public/customer surface |
| `src/components/notifications/DashboardNotificationCenter.tsx` | Shared/public/customer surface |
| `src/components/notifications/PushSetup.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerDashboardApp.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerDashboardShell.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonOpenStatusControl.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonPromotionsManager.tsx` | Shared/public/customer surface |
| `src/components/owner/StructuredCatalogEditors.tsx` | Shared/public/customer surface |
| `src/components/public/BeautyConcierge.tsx` | Shared/public/customer surface |
| `src/components/public/ComplaintForm.tsx` | Shared/public/customer surface |
| `src/components/public/ContactSupportForm.tsx` | Shared/public/customer surface |
| `src/components/public/FeaturedSalonPlacement.tsx` | Shared/public/customer surface |
| `src/components/public/HelpCenter.tsx` | Shared/public/customer surface |
| `src/components/public/MarketplaceSalonCard.tsx` | Shared/public/customer surface |
| `src/components/public/NearbySalonPlacement.tsx` | Shared/public/customer surface |
| `src/components/public/SafeCampaignVideo.tsx` | Shared/public/customer surface |
| `src/components/public/SalonDiscovery.tsx` | Shared/public/customer surface |
| `src/components/public/SalonPhotoGallery.tsx` | Shared/public/customer surface |
| `src/components/public/StyleCatalog.tsx` | Shared/public/customer surface |
| `src/components/public/TrendingVideoPlacement.tsx` | Shared/public/customer surface |
| `src/components/search/AutocompleteInputs.tsx` | Shared/public/customer surface |
| `src/components/search/GoogleSalonMap.tsx` | Shared/public/customer surface |
| `src/components/search/HeaderStyleSearch.tsx` | Shared/public/customer surface |
| `src/components/site/MobilePublicMenu.tsx` | Shared/public/customer surface |
| `src/components/site/NewsletterForm.tsx` | Shared/public/customer surface |
| `src/components/site/PublicChrome.tsx` | Shared/public/customer surface |
| `src/components/site/PublicContentSections.tsx` | Shared/public/customer surface |
| `src/components/site/RichTextBody.tsx` | Shared/public/customer surface |
| `src/components/site/SafeImage.tsx` | Shared/public/customer surface |
| `src/components/site/SalonProfileActions.tsx` | Shared/public/customer surface |
| `src/components/site/SearchComposer.tsx` | Shared/public/customer surface |

## Database object inventory

### Tables and views

- `account_security_settings`
- `admin_security_events`
- `admin_settings`
- `admin_users`
- `ai_automation_features`
- `ai_generation_drafts`
- `ai_prompt_versions`
- `ai_usage_events`
- `auth_login_attempts`
- `auth_mfa_challenges`
- `availability`
- `billing_events`
- `blog_posts`
- `booking_audit_log`
- `booking_checkout_intents`
- `booking_guest_access_audit`
- `booking_guest_access_tokens`
- `booking_guest_recovery_challenges`
- `booking_integrity_conflicts`
- `booking_messages`
- `booking_reminder_claims`
- `booking_reschedule_options`
- `booking_reschedule_proposals`
- `bookings`
- `complaints_log`
- `content_pages`
- `customer_favorites`
- `customers`
- `engine_publication_state`
- `engine_setting_versions`
- `engine_settings`
- `engine_system_components`
- `featured_campaign_audit`
- `featured_salon_campaigns`
- `homepage_sections`
- `identity_conflict_queue`
- `identity_conflict_resolutions`
- `identity_deletion_jobs`
- `identity_security_events`
- `localized_content`
- `location_markets`
- `marketing_entitlements`
- `master_styles`
- `media_assets`
- `media_upload_profiles`
- `media_video_profiles`
- `navigation_items`
- `newsletter_subscribers`
- `notification_delivery_log`
- `notification_template_versions`
- `notification_templates`
- `notifications`
- `password_reset_codes`
- `platform_content`
- `platform_error_affected_businesses`
- `platform_error_alert_rules`
- `platform_error_events`
- `platform_error_occurrences`
- `platform_identities`
- `platform_promotions`
- `promo_code_redemptions`
- `promo_codes`
- `push_subscriptions`
- `record_management_events`
- `reviews`
- `salon_applications`
- `salon_blockouts`
- `salon_booking_cancellations`
- `salon_closure_requests`
- `salon_products`
- `salon_promotion_audit`
- `salon_promotions`
- `salon_quality_metrics`
- `salon_reconciliation_items`
- `salon_reconciliation_runs`
- `salon_slug_redirects`
- `salon_status_audit`
- `salon_team_members`
- `salons`
- `search_engine_settings`
- `search_language_rules`
- `search_zero_result_aggregates`
- `service_addons`
- `service_categories`
- `service_groups`
- `stripe_webhook_events`
- `style_materials`
- `styles`
- `stylists`
- `subscription_change_requests`
- `subscriptions`
- `support_tickets`
- `supported_locales`
- `test_data_batches`
- `test_data_cleanup_runs`
- `test_data_registry`
- `translation_entries`
- `translation_entry_versions`
- `trending_campaign_audit`
- `trending_video_campaigns`
- `trending_videos`
- `video_processing_jobs`

### Functions and RPCs

- `admin_apply_notification_template`
- `admin_change_salon_status`
- `admin_has_permission`
- `admin_list_salons`
- `admin_manage_catalog_record`
- `admin_moderate_trending_campaign`
- `admin_reassign_service_group`
- `admin_reconcile_salon_publication`
- `admin_save_featured_campaign`
- `admin_save_trending_campaign`
- `assert_primary_identity`
- `attach_registered_media`
- `audit_declined_reschedule_proposal`
- `audit_salon_promotion_change`
- `begin_stripe_webhook_event`
- `capture_platform_error`
- `claim_booking_reminder`
- `create_booking_notification`
- `create_booking_reschedule_proposal`
- `create_stylist_draft`
- `dashboard_notify_application`
- `dashboard_notify_billing_event`
- `dashboard_notify_platform_error`
- `dashboard_notify_support_ticket`
- `discover_featured_salons`
- `discover_nearby_salons`
- `discover_nearby_salons_ranked`
- `discover_trending_videos`
- `dispute_review`
- `distance_miles`
- `enforce_admin_identity`
- `enforce_complaint_verification`
- `enforce_customer_identity`
- `enforce_salon_owner_identity`
- `enforce_salon_team_identity`
- `enforce_salon_wide_booking_overlap`
- `enforce_salon_wide_intent_overlap`
- `engine_apply_setting`
- `engine_emergency_revert_setting`
- `engine_import_drafts`
- `engine_number_setting`
- `execute_test_batch_cleanup`
- `expire_featured_campaigns`
- `generate_unique_salon_slug`
- `has_active_subscription`
- `is_admin`
- `is_marketplace_visible`
- `is_platform_admin`
- `normalize_identity_email`
- `normalize_marketplace_search`
- `normalized_salon_address_fingerprint`
- `notify_active_admins`
- `owns_salon`
- `owns_style`
- `owns_stylist`
- `plan_rank`
- `prepare_identity_deletion`
- `prepare_salon_geocoding`
- `preserve_salon_slug_redirect`
- `prevent_featured_audit_mutation`
- `prevent_salon_promotion_audit_mutation`
- `prevent_salon_status_audit_mutation`
- `prevent_trending_audit_mutation`
- `propagate_master_style_name`
- `protect_last_active_super_admin`
- `protect_salon_platform_fields`
- `purge_platform_error_events`
- `reconcile_salon_lifecycle`
- `reconcile_salon_publication`
- `record_stripe_promo_redemption`
- `redeem_promo_code`
- `refresh_salon_lifecycle_from_child`
- `refresh_salon_lifecycle_from_salon`
- `refresh_salon_lifecycle_trigger`
- `refresh_salon_review_summary`
- `refresh_trending_campaign_states`
- `remove_expired_auth_security_rows`
- `replace_style_materials`
- `reply_to_review`
- `reserve_booking_checkout`
- `reserve_promo_code`
- `resolve_search_service_query`
- `respond_booking_reschedule`
- `safe_uuid`
- `salon_has_feature`
- `salon_has_permission`
- `salon_lifecycle_diagnostic`
- `salon_publication_diagnostic`
- `salon_setup_complete`
- `salon_slugify`
- `salon_team_stylist_id`
- `save_salon_style_with_materials`
- `set_booking_checkout_integrity_fields`
- `set_booking_integrity_fields`
- `sync_platform_identity_from_auth`
- `sync_search_language_target`
- `sync_service_group_name`
- `track_platform_error_affected_business`
- `translation_version_guard`
- `upsert_dashboard_notification`
- `validate_application_structured_us_address`
- `validate_master_service_catalog`
- `validate_salon_store_hours`
- `validate_salon_structured_us_address`
- `validate_structured_material`
- `validate_structured_style`
- `validate_style_numeric_bounds`
- `validate_stylist_specialties`

### Row-level security policies

- `Booking participants read messages` on `booking_messages`
- `account_security_settings_self_insert` on `account_security_settings`
- `account_security_settings_self_read` on `account_security_settings`
- `account_security_settings_self_update` on `account_security_settings`
- `admin_settings_admin_only` on `admin_settings`
- `admin_users_admin_write` on `admin_users`
- `admin_users_self_read` on `admin_users`
- `ai_drafts_admin_manage` on `ai_generation_drafts`
- `ai_features_admin_manage` on `ai_automation_features`
- `ai_prompts_admin_manage` on `ai_prompt_versions`
- `ai_usage_admin_read` on `ai_usage_events`
- `application_documents_owner_delete` on `storage`
- `application_documents_owner_insert` on `storage`
- `application_documents_owner_read` on `storage`
- `application_media_owner_delete` on `storage`
- `application_media_owner_insert` on `storage`
- `application_media_owner_update` on `storage`
- `availability_owner_delete` on `availability`
- `availability_owner_insert` on `availability`
- `availability_owner_update` on `availability`
- `availability_public_read` on `availability`
- `billing_events_admin_read` on `billing_events`
- `blog_posts_admin_write` on `blog_posts`
- `blog_posts_public_read` on `blog_posts`
- `booking_audit_log_admin_read` on `booking_audit_log`
- `bookings_admin_update` on `bookings`
- `bookings_customer_insert` on `bookings`
- `bookings_owner_update` on `bookings`
- `bookings_participant_read` on `bookings`
- `bookings_public_insert` on `bookings`
- `complaints_admin_update` on `complaints_log`
- `complaints_customer_insert` on `complaints_log`
- `complaints_participant_read` on `complaints_log`
- `content_media_admin_delete` on `storage`
- `content_media_admin_insert` on `storage`
- `content_media_admin_update` on `storage`
- `content_media_authenticated_upload` on `storage`
- `content_media_owner_delete` on `storage`
- `content_media_owner_update` on `storage`
- `content_media_public_read` on `storage`
- `content_pages_admin_write` on `content_pages`
- `content_pages_public_read` on `content_pages`
- `customer_favorites_self` on `customer_favorites`
- `customers_self_insert` on `customers`
- `customers_self_read` on `customers`
- `customers_self_update` on `customers`
- `engine_components_admin_read` on `engine_system_components`
- `engine_publication_state_admin_write` on `engine_publication_state`
- `engine_publication_state_read` on `engine_publication_state`
- `engine_settings_admin_manage` on `engine_settings`
- `engine_settings_published_public_read` on `engine_settings`
- `engine_versions_admin_read` on `engine_setting_versions`
- `engine_versions_admin_write` on `engine_setting_versions`
- `featured_campaign_audit_admin` on `featured_campaign_audit`
- `featured_campaigns_admin` on `featured_salon_campaigns`
- `girlz_media_public_read` on `storage`
- `homepage_sections_admin_write` on `homepage_sections`
- `homepage_sections_public_read` on `homepage_sections`
- `identity_deletion_jobs_admin_read` on `identity_deletion_jobs`
- `localized_content_admin_write` on `localized_content`
- `localized_content_published_read` on `localized_content`
- `location_markets_admin_write` on `location_markets`
- `location_markets_public_read` on `location_markets`
- `marketing_entitlements_admin` on `marketing_entitlements`
- `master_styles_admin_write` on `master_styles`
- `master_styles_public_read` on `master_styles`
- `media_assets_admin_write` on `media_assets`
- `media_assets_owner_read` on `media_assets`
- `media_profiles_admin_write` on `media_upload_profiles`
- `media_profiles_public_read` on `media_upload_profiles`
- `media_video_profiles_admin_manage` on `media_video_profiles`
- `media_video_profiles_read` on `media_video_profiles`
- `navigation_items_admin_manage` on `navigation_items`
- `navigation_items_public_read` on `navigation_items`
- `newsletter_subscribers_admin_read` on `newsletter_subscribers`
- `newsletter_subscribers_admin_update` on `newsletter_subscribers`
- `notification_delivery_owner_read` on `notification_delivery_log`
- `notification_template_versions_admin_read` on `notification_template_versions`
- `notification_templates_admin_manage` on `notification_templates`
- `notifications_recipient_read` on `notifications`
- `notifications_recipient_update` on `notifications`
- `platform_content_admin_write` on `platform_content`
- `platform_content_public_read` on `platform_content`
- `platform_error_affected_businesses_admin_read` on `platform_error_affected_businesses`
- `platform_error_alert_rules_admin_read` on `platform_error_alert_rules`
- `platform_error_alert_rules_admin_write` on `platform_error_alert_rules`
- `platform_error_events_admin_read` on `platform_error_events`
- `platform_error_events_admin_update` on `platform_error_events`
- `platform_error_occurrences_admin_read` on `platform_error_occurrences`
- `platform_promotions_admin_write` on `platform_promotions`
- `platform_promotions_public_read` on `platform_promotions`
- `promo_codes_admin_all` on `promo_codes`
- `promo_redemptions_admin_read` on `promo_code_redemptions`
- `push_subscriptions_owner_read` on `push_subscriptions`
- `push_subscriptions_self_delete` on `push_subscriptions`
- `push_subscriptions_self_insert` on `push_subscriptions`
- `push_subscriptions_self_update` on `push_subscriptions`
- `record_management_events_admin_read` on `record_management_events`
- `review_media_customer_write` on `storage`
- `reviews_admin_delete` on `reviews`
- `reviews_admin_update` on `reviews`
- `reviews_customer_insert` on `reviews`
- `reviews_public_read` on `reviews`
- `salon_applications_admin_write` on `salon_applications`
- `salon_applications_owner_insert` on `salon_applications`
- `salon_applications_owner_read` on `salon_applications`
- `salon_applications_owner_update` on `salon_applications`
- `salon_blockouts_owner_access` on `salon_blockouts`
- `salon_cancellations_owner_read` on `salon_booking_cancellations`
- `salon_media_owner_delete` on `storage`
- `salon_media_owner_insert` on `storage`
- `salon_media_owner_update` on `storage`
- `salon_products_owner_write` on `salon_products`
- `salon_products_public_read` on `salon_products`
- `salon_promotion_audit_owner_read` on `salon_promotion_audit`
- `salon_promotions_owner_write` on `salon_promotions`
- `salon_promotions_public_read` on `salon_promotions`
- `salon_slug_redirects_public_read` on `salon_slug_redirects`
- `salon_status_audit_admin_read` on `salon_status_audit`
- `salon_team_members_owner_write` on `salon_team_members`
- `salon_team_members_read` on `salon_team_members`
- `salons_admin_delete` on `salons`
- `salons_owner_insert` on `salons`
- `salons_owner_update` on `salons`
- `salons_public_read` on `salons`
- `search_engine_settings_admin_all` on `search_engine_settings`
- `search_language_rules_admin_all` on `search_language_rules`
- `search_zero_result_aggregates_admin_read` on `search_zero_result_aggregates`
- `service_addons_admin_write` on `service_addons`
- `service_addons_public_read` on `service_addons`
- `service_categories_admin_write` on `service_categories`
- `service_categories_public_read` on `service_categories`
- `service_groups_admin_write` on `service_groups`
- `service_groups_public_read` on `service_groups`
- `style_materials_owner_delete` on `style_materials`
- `style_materials_owner_insert` on `style_materials`
- `style_materials_owner_update` on `style_materials`
- `style_materials_public_read` on `style_materials`
- `style_media_owner_write` on `storage`
- `styles_owner_delete` on `styles`
- `styles_owner_insert` on `styles`
- `styles_owner_update` on `styles`
- `styles_public_read` on `styles`
- `stylist_media_owner_write` on `storage`
- `stylists_owner_delete` on `stylists`
- `stylists_owner_insert` on `stylists`
- `stylists_owner_update` on `stylists`
- `stylists_public_read` on `stylists`
- `subscription_change_requests_owner_read` on `subscription_change_requests`
- `subscriptions_admin_write` on `subscriptions`
- `subscriptions_owner_read` on `subscriptions`
- `support_ticket_admin_update` on `support_tickets`
- `support_ticket_create` on `support_tickets`
- `support_ticket_parties` on `support_tickets`
- `supported_locales_admin_write` on `supported_locales`
- `supported_locales_public_read` on `supported_locales`
- `test_data_batches_admin_read` on `test_data_batches`
- `test_data_registry_admin_read` on `test_data_registry`
- `test_data_runs_admin_read` on `test_data_cleanup_runs`
- `translation_admin_write` on `translation_entries`
- `translation_published_read` on `translation_entries`
- `translation_versions_admin_read` on `translation_entry_versions`
- `translation_versions_admin_write` on `translation_entry_versions`
- `trending_campaign_audit_admin_read` on `trending_campaign_audit`
- `trending_campaigns_admin_read` on `trending_video_campaigns`
- `trending_video_admin_delete` on `storage`
- `trending_video_admin_insert` on `storage`
- `trending_video_admin_update` on `storage`
- `trending_video_public_read` on `storage`
- `trending_videos_admin_write` on `trending_videos`
- `trending_videos_public_read` on `trending_videos`
- `video_processing_jobs_admin_manage` on `video_processing_jobs`

## Exact migration order

| Order | Migration | Repository path |
| --- | --- | --- |
| 1 | `20260708120000_canonical_application_schema.sql` | `supabase/migrations/20260708120000_canonical_application_schema.sql` |
| 2 | `20260710143000_owner_user_id_and_rls.sql` | `supabase/migrations/20260710143000_owner_user_id_and_rls.sql` |
| 3 | `20260710190000_owner_dashboard_suite.sql` | `supabase/migrations/20260710190000_owner_dashboard_suite.sql` |
| 4 | `20260710213000_platform_admin_customer_notifications.sql` | `supabase/migrations/20260710213000_platform_admin_customer_notifications.sql` |
| 5 | `20260711110000_editorial_content_admin_login.sql` | `supabase/migrations/20260711110000_editorial_content_admin_login.sql` |
| 6 | `20260711150000_platform_wiring_fixes.sql` | `supabase/migrations/20260711150000_platform_wiring_fixes.sql` |
| 7 | `20260711190000_subscription_security_scale.sql` | `supabase/migrations/20260711190000_subscription_security_scale.sql` |
| 8 | `20260713110000_critical_blockers.sql` | `supabase/migrations/20260713110000_critical_blockers.sql` |
| 9 | `20260713130000_truthfulness_content_slots.sql` | `supabase/migrations/20260713130000_truthfulness_content_slots.sql` |
| 10 | `20260713180000_booking_integrity.sql` | `supabase/migrations/20260713180000_booking_integrity.sql` |
| 11 | `20260713190000_availability_controls.sql` | `supabase/migrations/20260713190000_availability_controls.sql` |
| 12 | `20260713200000_auto_confirm_cancellation_quality.sql` | `supabase/migrations/20260713200000_auto_confirm_cancellation_quality.sql` |
| 13 | `20260713210000_structured_salon_catalog.sql` | `supabase/migrations/20260713210000_structured_salon_catalog.sql` |
| 14 | `20260713220000_stylist_upload_salon_logo.sql` | `supabase/migrations/20260713220000_stylist_upload_salon_logo.sql` |
| 15 | `20260714100000_auth_mfa_security.sql` | `supabase/migrations/20260714100000_auth_mfa_security.sql` |
| 16 | `20260714110000_team_permissions.sql` | `supabase/migrations/20260714110000_team_permissions.sql` |
| 17 | `20260714120000_admin_booking_operations.sql` | `supabase/migrations/20260714120000_admin_booking_operations.sql` |
| 18 | `20260714130000_salon_open_status.sql` | `supabase/migrations/20260714130000_salon_open_status.sql` |
| 19 | `20260714140000_structured_salon_addresses.sql` | `supabase/migrations/20260714140000_structured_salon_addresses.sql` |
| 20 | `20260714150000_team_permission_hardening.sql` | `supabase/migrations/20260714150000_team_permission_hardening.sql` |
| 21 | `20260714160000_team_subscription_inheritance.sql` | `supabase/migrations/20260714160000_team_subscription_inheritance.sql` |
| 22 | `20260714170000_web_push.sql` | `supabase/migrations/20260714170000_web_push.sql` |
| 23 | `20260714180000_verified_complaints.sql` | `supabase/migrations/20260714180000_verified_complaints.sql` |
| 24 | `20260714190000_booking_messages.sql` | `supabase/migrations/20260714190000_booking_messages.sql` |
| 25 | `20260714200000_homepage_trending_video.sql` | `supabase/migrations/20260714200000_homepage_trending_video.sql` |
| 26 | `20260714210000_promo_codes.sql` | `supabase/migrations/20260714210000_promo_codes.sql` |
| 27 | `20260714220000_application_onboarding.sql` | `supabase/migrations/20260714220000_application_onboarding.sql` |
| 28 | `20260714230000_guided_onboarding.sql` | `supabase/migrations/20260714230000_guided_onboarding.sql` |
| 29 | `20260714240000_mobile_content.sql` | `supabase/migrations/20260714240000_mobile_content.sql` |
| 30 | `20260714250000_generic_service_catalog.sql` | `supabase/migrations/20260714250000_generic_service_catalog.sql` |
| 31 | `20260715100000_content_management_sections.sql` | `supabase/migrations/20260715100000_content_management_sections.sql` |
| 32 | `20260715110000_legal_content_pages.sql` | `supabase/migrations/20260715110000_legal_content_pages.sql` |
| 33 | `20260715120000_admin_inbox_unread.sql` | `supabase/migrations/20260715120000_admin_inbox_unread.sql` |
| 34 | `20260715130000_subscription_stylist_booking_fixes.sql` | `supabase/migrations/20260715130000_subscription_stylist_booking_fixes.sql` |
| 35 | `20260715140000_admin_service_catalog.sql` | `supabase/migrations/20260715140000_admin_service_catalog.sql` |
| 36 | `20260715150000_numeric_input_bounds.sql` | `supabase/migrations/20260715150000_numeric_input_bounds.sql` |
| 37 | `20260715160000_discoverability_setup_gate.sql` | `supabase/migrations/20260715160000_discoverability_setup_gate.sql` |
| 38 | `20260715170000_legal_page_visibility.sql` | `supabase/migrations/20260715170000_legal_page_visibility.sql` |
| 39 | `20260715180000_subscription_lifecycle.sql` | `supabase/migrations/20260715180000_subscription_lifecycle.sql` |
| 40 | `20260715190000_billing_event_ledger.sql` | `supabase/migrations/20260715190000_billing_event_ledger.sql` |
| 41 | `20260715200000_storage_policy_qualification.sql` | `supabase/migrations/20260715200000_storage_policy_qualification.sql` |
| 42 | `20260716120000_location_foundation.sql` | `supabase/migrations/20260716120000_location_foundation.sql` |
| 43 | `20260716130000_organic_salon_discovery.sql` | `supabase/migrations/20260716130000_organic_salon_discovery.sql` |
| 44 | `20260716140000_admin_salon_operations.sql` | `supabase/migrations/20260716140000_admin_salon_operations.sql` |
| 45 | `20260716150000_featured_salon_campaigns.sql` | `supabase/migrations/20260716150000_featured_salon_campaigns.sql` |
| 46 | `20260716160000_trending_video_campaigns.sql` | `supabase/migrations/20260716160000_trending_video_campaigns.sql` |
| 47 | `20260716170000_marketplace_security_hardening.sql` | `supabase/migrations/20260716170000_marketplace_security_hardening.sql` |
| 48 | `20260720100000_canonical_identity.sql` | `supabase/migrations/20260720100000_canonical_identity.sql` |
| 49 | `20260720110000_admin_identity_security.sql` | `supabase/migrations/20260720110000_admin_identity_security.sql` |
| 50 | `20260720120000_admin_salon_result_integrity.sql` | `supabase/migrations/20260720120000_admin_salon_result_integrity.sql` |
| 51 | `20260720130000_salon_lifecycle_engine.sql` | `supabase/migrations/20260720130000_salon_lifecycle_engine.sql` |
| 52 | `20260720140000_search_language_engine.sql` | `supabase/migrations/20260720140000_search_language_engine.sql` |
| 53 | `20260720150000_unified_media_engine.sql` | `supabase/migrations/20260720150000_unified_media_engine.sql` |
| 54 | `20260720160000_localization_engine.sql` | `supabase/migrations/20260720160000_localization_engine.sql` |
| 55 | `20260720170000_platform_engine_governance.sql` | `supabase/migrations/20260720170000_platform_engine_governance.sql` |
| 56 | `20260720180000_record_lifecycle_management.sql` | `supabase/migrations/20260720180000_record_lifecycle_management.sql` |
| 57 | `20260720190000_identity_deletion_and_reuse.sql` | `supabase/migrations/20260720190000_identity_deletion_and_reuse.sql` |
| 58 | `20260720200000_safe_test_data_batches.sql` | `supabase/migrations/20260720200000_safe_test_data_batches.sql` |
| 59 | `20260720210000_platform_engine_governance_recovery.sql` | `supabase/migrations/20260720210000_platform_engine_governance_recovery.sql` |
| 60 | `20260720220000_booking_reminder_delivery.sql` | `supabase/migrations/20260720220000_booking_reminder_delivery.sql` |
| 61 | `20260720230000_trending_video_posters.sql` | `supabase/migrations/20260720230000_trending_video_posters.sql` |
| 62 | `20260721100000_engine_localization_ai_system.sql` | `supabase/migrations/20260721100000_engine_localization_ai_system.sql` |
| 63 | `20260721110000_launch_blocker_core_stabilization.sql` | `supabase/migrations/20260721110000_launch_blocker_core_stabilization.sql` |
| 64 | `20260721120000_salon_publication_controls.sql` | `supabase/migrations/20260721120000_salon_publication_controls.sql` |
| 65 | `20260721130000_local_discovery_launch_defaults.sql` | `supabase/migrations/20260721130000_local_discovery_launch_defaults.sql` |
| 66 | `20260721140000_flexible_service_catalog.sql` | `supabase/migrations/20260721140000_flexible_service_catalog.sql` |
| 67 | `20260721150000_platform_error_monitoring.sql` | `supabase/migrations/20260721150000_platform_error_monitoring.sql` |
| 68 | `20260722100000_atomic_owner_catalog_persistence.sql` | `supabase/migrations/20260722100000_atomic_owner_catalog_persistence.sql` |
| 69 | `20260722110000_discovery_authoritative_eligibility.sql` | `supabase/migrations/20260722110000_discovery_authoritative_eligibility.sql` |
| 70 | `20260722120000_responsive_media_renditions.sql` | `supabase/migrations/20260722120000_responsive_media_renditions.sql` |
| 71 | `20260722130000_beauty_concierge_engine.sql` | `supabase/migrations/20260722130000_beauty_concierge_engine.sql` |
| 72 | `20260722140000_salon_promotion_management.sql` | `supabase/migrations/20260722140000_salon_promotion_management.sql` |
| 73 | `20260722150000_subscription_change_tracking.sql` | `supabase/migrations/20260722150000_subscription_change_tracking.sql` |
| 74 | `20260723190000_style_photo_jsonb_persistence_fix.sql` | `supabase/migrations/20260723190000_style_photo_jsonb_persistence_fix.sql` |
| 75 | `20260723210000_booking_communications.sql` | `supabase/migrations/20260723210000_booking_communications.sql` |
| 76 | `20260723220000_secure_guest_booking_management.sql` | `supabase/migrations/20260723220000_secure_guest_booking_management.sql` |
| 77 | `20260723230000_customer_approved_rescheduling.sql` | `supabase/migrations/20260723230000_customer_approved_rescheduling.sql` |
| 78 | `20260723240000_finance_reconciliation.sql` | `supabase/migrations/20260723240000_finance_reconciliation.sql` |
| 79 | `20260723250000_dashboard_notifications.sql` | `supabase/migrations/20260723250000_dashboard_notifications.sql` |
| 80 | `20260723260000_monitoring_context_promotion_audit.sql` | `supabase/migrations/20260723260000_monitoring_context_promotion_audit.sql` |
| 81 | `20260723270000_localization_completion.sql` | `supabase/migrations/20260723270000_localization_completion.sql` |
| 82 | `20260723280000_trending_video_processing.sql` | `supabase/migrations/20260723280000_trending_video_processing.sql` |

## Protected values deliberately left outside Engine

- Supabase, Stripe, notification, Maps, AI-provider, signing and service-role credentials: deployment secrets; never sent to the browser or stored in public configuration.
- RLS policies, permission keys, database functions, booking overlap constraints and financial ledger invariants: reviewed engineering migrations; Engine shows status but cannot alter them.
- Stripe transaction history, invoices, refunds, completed bookings, disputes and audit/security events: immutable or retention-protected records; dedicated workflows change status or redact/anonymize eligible identity data.
- Arbitrary HTML, JavaScript, SQL and executable AI tools/prompts: intentionally unsupported. Engine uses bounded schemas, approved component variants, provider/model allowlists, human review and deterministic fallback.
- US-only legal/address/currency boundaries: changing country or currency requires reviewed payments, tax, identity, address and legal work rather than a casual setting.
