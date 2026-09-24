# Girlz Culture Engine platform inventory

Generated from the repository on 2026-07-21 by `scripts/generate-platform-inventory.mjs`.

This is a source inventory, not proof that migrations are applied or authenticated/provider behavior is live. Security-critical values remain code/deployment controlled; ordinary content and bounded business settings are routed through Engine or a dedicated permission-controlled admin workspace. The chosen customer-facing term is **Styles & Services**: public/editorial copy may shorten it to **Styles**, while database identifiers retain their existing names to avoid corrupting schema meaning.

## Inventory totals

- Application pages: **86**
- API routes: **184**
- Components/modules under `src/components`: **244**
- Ordered SQL migrations: **219**
- Tables/views discovered in migrations: **207**
- Functions discovered in migrations: **436**
- RLS policies discovered in migrations: **218**

## Application page inventory

| Route | Entry point | Surface | Source/control classification | Engine/admin management | Required access | Draft/publish | Validation/dependencies | Test evidence | Deliberate code exception |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/[page]` | `src/app/[page]/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/` | `src/app/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/about` | `src/app/about/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/account/waitlist` | `src/app/account/waitlist/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/account` | `src/app/account/page.tsx` | Customer account | Database-backed customer-owned records | Trust/quality and notification rules in Engine | Customer session and booking ownership | Operational record state; reviews enter moderation lifecycle | Server ownership and completed-booking validation | verify:hardening, verify:media | Booking/payment history is retained |
| `/admin/[section]/[recordId]` | `src/app/admin/[section]/[recordId]/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/[section]` | `src/app/admin/[section]/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/content/[recordId]` | `src/app/admin/content/[recordId]/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/content` | `src/app/admin/content/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/login` | `src/app/admin/login/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/submissions/[id]` | `src/app/admin/submissions/[id]/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin/submissions` | `src/app/admin/submissions/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/admin` | `src/app/admin/page.tsx` | Platform administration | Database-backed and security-protected | Engine or dedicated admin workspace | Admin session plus section permission | Engine settings/content use draft-review-publish; operational records use audited actions | Server authorization, typed input, dependency preview where destructive | verify:engine, verify:records, verify:admin-security | Secrets/RLS remain protected engineering controls |
| `/blog/[slug]` | `src/app/blog/[slug]/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/blog` | `src/app/blog/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/booking/manage/[token]` | `src/app/booking/manage/[token]/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/booking/recover` | `src/app/booking/recover/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/business/apply` | `src/app/business/apply/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/business/login` | `src/app/business/login/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/business/signup/hair` | `src/app/business/signup/hair/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/business/signup` | `src/app/business/signup/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/business/waitlist` | `src/app/business/waitlist/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/business` | `src/app/business/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/careers` | `src/app/careers/page.tsx` | Hidden editorial page | Code retained; no public navigation | Not exposed until founder approval | Not applicable | Not applicable | Route remains directly reachable for development | Manual route smoke | Hidden by product decision |
| `/categories/[category]` | `src/app/categories/[category]/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/communications/unsubscribe` | `src/app/communications/unsubscribe/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/complaint` | `src/app/complaint/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/contact` | `src/app/contact/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/featured` | `src/app/featured/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/forgot-password` | `src/app/forgot-password/page.tsx` | Authentication | Supabase Auth plus canonical server identity | Users, Roles & Permissions status only | Guest/auth challenge | Not applicable | Rate limiting, generic errors, signed/expiring challenges | verify:identity, verify:admin-security | Secrets and security wording remain reviewed code |
| `/help` | `src/app/help/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/how-it-works` | `src/app/how-it-works/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/accessibility-states` | `src/app/internal/acceptance/accessibility-states/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/admin-workflows/[section]/[[...record]]` | `src/app/internal/acceptance/admin-workflows/[section]/[[...record]]/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/business-cms` | `src/app/internal/acceptance/business-cms/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/business-media` | `src/app/internal/acceptance/business-media/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/content-promotion` | `src/app/internal/acceptance/content-promotion/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/decision-search` | `src/app/internal/acceptance/decision-search/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/discovery-state` | `src/app/internal/acceptance/discovery-state/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/homepage-order` | `src/app/internal/acceptance/homepage-order/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/map-provider` | `src/app/internal/acceptance/map-provider/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/map-summary` | `src/app/internal/acceptance/map-summary/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/media-upload` | `src/app/internal/acceptance/media-upload/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/mobile-cards` | `src/app/internal/acceptance/mobile-cards/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/numeric` | `src/app/internal/acceptance/numeric/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/owner-workflows` | `src/app/internal/acceptance/owner-workflows/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/salon-profile` | `src/app/internal/acceptance/salon-profile/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/salon-spreadsheet` | `src/app/internal/acceptance/salon-spreadsheet/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/style-catalog` | `src/app/internal/acceptance/style-catalog/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/internal/acceptance/stylist-profile` | `src/app/internal/acceptance/stylist-profile/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/legal` | `src/app/legal/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/login` | `src/app/login/page.tsx` | Authentication | Supabase Auth plus canonical server identity | Users, Roles & Permissions status only | Guest/auth challenge | Not applicable | Rate limiting, generic errors, signed/expiring challenges | verify:identity, verify:admin-security | Secrets and security wording remain reviewed code |
| `/offline` | `src/app/offline/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Offline fallback is a code/PWA integrity surface |
| `/partner` | `src/app/partner/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/pending` | `src/app/pending/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/pickup/[token]` | `src/app/pickup/[token]/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/plans` | `src/app/plans/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/prelaunch` | `src/app/prelaunch/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/press` | `src/app/press/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/reset-password` | `src/app/reset-password/page.tsx` | Authentication | Supabase Auth plus canonical server identity | Users, Roles & Permissions status only | Guest/auth challenge | Not applicable | Rate limiting, generic errors, signed/expiring challenges | verify:identity, verify:admin-security | Secrets and security wording remain reviewed code |
| `/review/[bookingId]` | `src/app/review/[bookingId]/page.tsx` | Customer account | Database-backed customer-owned records | Trust/quality and notification rules in Engine | Customer session and booking ownership | Operational record state; reviews enter moderation lifecycle | Server ownership and completed-booking validation | verify:hardening, verify:media | Booking/payment history is retained |
| `/salon/[slug]/book` | `src/app/salon/[slug]/book/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]/checkout` | `src/app/salon/[slug]/checkout/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]/product/[productId]` | `src/app/salon/[slug]/product/[productId]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]/reserve/[productId]` | `src/app/salon/[slug]/reserve/[productId]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]/stylist/[stylistId]` | `src/app/salon/[slug]/stylist/[stylistId]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/[slug]` | `src/app/salon/[slug]/page.tsx` | Public salon/booking | Database-backed eligible salon records | Catalog, booking, trust, media and discovery Engine areas | Public; checkout requires validated customer details | Salon data updates after ownership validation; Engine settings publish | Lifecycle eligibility, RLS/server checks, booking conflicts | verify:connected-discovery, verify:hardening, verify:billing | Financial and overlap invariants remain protected |
| `/salon/application-submitted` | `src/app/salon/application-submitted/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/apply` | `src/app/salon/apply/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/dashboard/[section]/[recordId]` | `src/app/salon/dashboard/[section]/[recordId]/page.tsx` | Salon workspace | Database-backed salon/team records | Platform rules in Engine; salon owns its records | Salon owner/team permission | Immediate audited salon-record updates | Server salon membership, feature gate and ownership validation | verify:lifecycle, verify:hardening, verify:records | Billing and retained history use dedicated workflows |
| `/salon/dashboard/[section]` | `src/app/salon/dashboard/[section]/page.tsx` | Salon workspace | Database-backed salon/team records | Platform rules in Engine; salon owns its records | Salon owner/team permission | Immediate audited salon-record updates | Server salon membership, feature gate and ownership validation | verify:lifecycle, verify:hardening, verify:records | Billing and retained history use dedicated workflows |
| `/salon/dashboard/demo-page` | `src/app/salon/dashboard/demo-page/page.tsx` | Salon workspace | Database-backed salon/team records | Platform rules in Engine; salon owns its records | Salon owner/team permission | Immediate audited salon-record updates | Server salon membership, feature gate and ownership validation | verify:lifecycle, verify:hardening, verify:records | Billing and retained history use dedicated workflows |
| `/salon/dashboard` | `src/app/salon/dashboard/page.tsx` | Salon workspace | Database-backed salon/team records | Platform rules in Engine; salon owns its records | Salon owner/team permission | Immediate audited salon-record updates | Server salon membership, feature gate and ownership validation | verify:lifecycle, verify:hardening, verify:records | Billing and retained history use dedicated workflows |
| `/salon/login` | `src/app/salon/login/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/onboarding/import` | `src/app/salon/onboarding/import/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/onboarding` | `src/app/salon/onboarding/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salon/setup-guide` | `src/app/salon/setup-guide/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/salon/signup` | `src/app/salon/signup/page.tsx` | Salon identity/onboarding | Canonical identity plus lifecycle data | Salon Setup & Lifecycle; Service Catalog & Taxonomies | Guest or canonical salon-owner session | Application decision and activation are audited lifecycle states | Normalized identity, US address, setup gates, admin approval | verify:identity, verify:lifecycle | Auth and activation invariants are not casual settings |
| `/salons` | `src/app/salons/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/search` | `src/app/search/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/site-access/business-demo` | `src/app/site-access/business-demo/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/site-access` | `src/app/site-access/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/social` | `src/app/social/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/styles` | `src/app/styles/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/testimonials` | `src/app/testimonials/page.tsx` | Public editorial/content | Database-backed CMS with safe fallback | Pages & Page Sections / Navigation / Content Management | Public | Draft, preview, publish, archive and restore | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |
| `/trending` | `src/app/trending/page.tsx` | Public discovery/support | Database-backed records plus bounded Engine settings | Relevant Engine category and dedicated admin workspace | Public | Published settings/eligible records | Sanitized links/content; public reads limited to published/eligible data | verify:engine-governance, verify:connected-discovery, browser smoke | Security/provider invariants remain protected |

## API inventory

| Route | Methods | Entry point | Data/provider classification | Engine/dedicated control | Required access | Validation/dependency behavior | Test evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/admin/ad-spaces` | GET, POST | `src/app/api/admin/ad-spaces/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/bookings/[id]` | GET, PATCH | `src/app/api/admin/bookings/[id]/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:hardening |
| `/api/admin/bookings` | GET, POST | `src/app/api/admin/bookings/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:hardening |
| `/api/admin/business-waitlist` | GET | `src/app/api/admin/business-waitlist/route.ts` | Provider-neutral AI, disabled fail-closed | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/catalog-spreadsheet` | GET, POST | `src/app/api/admin/catalog-spreadsheet/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/content` | GET, PUT, DELETE | `src/app/api/admin/content/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/data` | GET | `src/app/api/admin/data/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/engine/ai` | GET, POST, PATCH | `src/app/api/admin/engine/ai/route.ts` | Provider-neutral AI, disabled fail-closed | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/brand-assets` | GET, POST, PATCH | `src/app/api/admin/engine/brand-assets/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/config` | GET, POST, PATCH | `src/app/api/admin/engine/config/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/errors` | GET, PATCH | `src/app/api/admin/engine/errors/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/lifecycle` | GET, PATCH | `src/app/api/admin/engine/lifecycle/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/media` | GET, PATCH | `src/app/api/admin/engine/media/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion, verify:media |
| `/api/admin/engine/navigation` | GET, POST, PATCH | `src/app/api/admin/engine/navigation/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/notifications` | GET, PATCH | `src/app/api/admin/engine/notifications/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/search` | GET, PATCH | `src/app/api/admin/engine/search/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:engine-expansion |
| `/api/admin/engine/system-status` | GET, POST | `src/app/api/admin/engine/system-status/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:engine-expansion |
| `/api/admin/engine/translations` | GET, PATCH | `src/app/api/admin/engine/translations/route.ts` | Supabase/database-backed operation | Engine control center | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:i18n, verify:engine-expansion |
| `/api/admin/featured-campaigns` | GET, POST | `src/app/api/admin/featured-campaigns/route.ts` | Provider-neutral AI, disabled fail-closed | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:media |
| `/api/admin/finance/payout` | GET, POST | `src/app/api/admin/finance/payout/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/finance/product-refund` | POST | `src/app/api/admin/finance/product-refund/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/finance` | GET | `src/app/api/admin/finance/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/homepage-products` | GET, POST | `src/app/api/admin/homepage-products/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/identity-conflicts` | GET, PATCH | `src/app/api/admin/identity-conflicts/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:identity |
| `/api/admin/identity-deletion` | GET, POST | `src/app/api/admin/identity-deletion/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling | verify:identity |
| `/api/admin/inbox-counts` | GET | `src/app/api/admin/inbox-counts/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/admin/market-workspaces` | GET | `src/app/api/admin/market-workspaces/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/marketing` | GET, POST | `src/app/api/admin/marketing/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/media/video-jobs` | GET, POST | `src/app/api/admin/media/video-jobs/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | verify:media |
| `/api/admin/overview-metrics` | GET | `src/app/api/admin/overview-metrics/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/preferences/time-zone` | GET, PATCH | `src/app/api/admin/preferences/time-zone/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/promo-codes` | GET, POST, PATCH | `src/app/api/admin/promo-codes/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/quality/thresholds` | PATCH | `src/app/api/admin/quality/thresholds/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/records` | GET, POST | `src/app/api/admin/records/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:records |
| `/api/admin/referral-campaigns` | GET, POST | `src/app/api/admin/referral-campaigns/route.ts` | Provider-neutral AI, disabled fail-closed | Dedicated admin workspace | Admin bearer session plus explicit permission | abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/reviews/[id]/moderate` | POST | `src/app/api/admin/reviews/[id]/moderate/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/salons/[id]` | GET, POST | `src/app/api/admin/salons/[id]/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/salons/reconcile` | GET, POST | `src/app/api/admin/salons/reconcile/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/salons` | GET | `src/app/api/admin/salons/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/admin/submissions/[id]/decision` | POST | `src/app/api/admin/submissions/[id]/decision/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/submissions/[id]/location-visit` | GET, POST | `src/app/api/admin/submissions/[id]/location-visit/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/submissions/[id]` | GET, POST | `src/app/api/admin/submissions/[id]/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/submissions` | GET | `src/app/api/admin/submissions/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/admin/support/[id]/assignment` | PATCH | `src/app/api/admin/support/[id]/assignment/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input | TypeScript/lint/build and route smoke where public |
| `/api/admin/support/[id]/read` | PATCH | `src/app/api/admin/support/[id]/read/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/admin/support/[id]/respond` | POST | `src/app/api/admin/support/[id]/respond/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | typed/sanitized input | TypeScript/lint/build and route smoke where public |
| `/api/admin/team/[id]/activity` | GET | `src/app/api/admin/team/[id]/activity/route.ts` | Supabase/database-backed operation | Dedicated admin workspace | Admin bearer session plus explicit permission | server authorization | TypeScript/lint/build and route smoke where public |
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
| `/api/booking/travel-quote` | POST | `src/app/api/booking/travel-quote/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/bookings/notify` | POST | `src/app/api/bookings/notify/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | verify:hardening |
| `/api/bookings/reminders` | POST | `src/app/api/bookings/reminders/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Verified provider signature or server secret | route-specific bounds and safe errors | verify:hardening |
| `/api/business/application/assistant` | POST | `src/app/api/business/application/assistant/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/business/application/progress` | GET, POST | `src/app/api/business/application/progress/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/commerce/pickup-cleanup` | POST | `src/app/api/commerce/pickup-cleanup/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/communications/unsubscribe` | POST | `src/app/api/communications/unsubscribe/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/complaints` | GET, POST | `src/app/api/complaints/route.ts` | Provider-neutral AI, disabled fail-closed | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/concierge/knowledge` | POST | `src/app/api/concierge/knowledge/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/concierge/search` | POST | `src/app/api/concierge/search/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/config` | GET | `src/app/api/config/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input | TypeScript/lint/build and route smoke where public |
| `/api/customer/bookings/[id]/attendance` | GET, POST | `src/app/api/customer/bookings/[id]/attendance/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization, abuse protection | verify:hardening |
| `/api/customer/bookings/[id]/communications` | GET, PUT | `src/app/api/customer/bookings/[id]/communications/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization, abuse protection | verify:hardening |
| `/api/customer/bookings/[id]/location` | GET | `src/app/api/customer/bookings/[id]/location/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization, abuse protection | verify:hardening |
| `/api/customer/favorites` | GET, POST, DELETE | `src/app/api/customer/favorites/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/customer/waitlist` | GET, POST | `src/app/api/customer/waitlist/route.ts` | Provider-neutral AI, disabled fail-closed | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/discovery/availability` | POST | `src/app/api/discovery/availability/route.ts` | Provider-neutral AI, disabled fail-closed | Public/customer/salon workflow | Public/owner scope validated per operation | abuse protection | verify:hardening |
| `/api/discovery/decision-search` | POST | `src/app/api/discovery/decision-search/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
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
| `/api/media/upload/finalize` | POST | `src/app/api/media/upload/finalize/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | route-specific bounds and safe errors | verify:media |
| `/api/media/upload/prepare` | POST | `src/app/api/media/upload/prepare/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | route-specific bounds and safe errors | verify:media |
| `/api/media/upload` | GET, POST, PATCH, DELETE | `src/app/api/media/upload/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization | verify:media |
| `/api/media/video/cloudinary-callback` | POST | `src/app/api/media/video/cloudinary-callback/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input | verify:media |
| `/api/messages` | GET, POST | `src/app/api/messages/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/monitor/client-provider` | POST | `src/app/api/monitor/client-provider/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/newsletter` | POST | `src/app/api/newsletter/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/notifications` | GET, POST | `src/app/api/notifications/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/pickup/[token]` | GET, POST | `src/app/api/pickup/[token]/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/promo/validate` | POST | `src/app/api/promo/validate/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/promotions/salon` | GET | `src/app/api/promotions/salon/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/push/subscription` | GET, POST, DELETE | `src/app/api/push/subscription/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/reviews/[token]` | GET, POST | `src/app/api/reviews/[token]/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/actionable-booking-count` | GET | `src/app/api/salon/actionable-booking-count/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | verify:hardening |
| `/api/salon/advertising` | GET, POST | `src/app/api/salon/advertising/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/application/documents/abandon` | POST | `src/app/api/salon/application/documents/abandon/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/application/documents/finalize` | POST | `src/app/api/salon/application/documents/finalize/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/application/documents/prepare` | POST | `src/app/api/salon/application/documents/prepare/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/application` | POST | `src/app/api/salon/application/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/assistant/appearance` | PATCH | `src/app/api/salon/assistant/appearance/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/assistant/memory` | GET, POST, DELETE | `src/app/api/salon/assistant/memory/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/assistant/task` | GET, DELETE | `src/app/api/salon/assistant/task/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/assistant` | POST | `src/app/api/salon/assistant/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/availability/block` | POST, DELETE | `src/app/api/salon/availability/block/route.ts` | Provider-neutral AI, disabled fail-closed | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/booking-money` | GET | `src/app/api/salon/booking-money/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/booking-report` | GET | `src/app/api/salon/booking-report/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/attendance` | GET, POST | `src/app/api/salon/bookings/[id]/attendance/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/cancel` | POST | `src/app/api/salon/bookings/[id]/cancel/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/client-record/links` | GET, POST | `src/app/api/salon/bookings/[id]/client-record/links/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/client-record/photos/[photoId]` | GET, DELETE | `src/app/api/salon/bookings/[id]/client-record/photos/[photoId]/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/client-record/photos` | POST | `src/app/api/salon/bookings/[id]/client-record/photos/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/client-record` | GET, POST | `src/app/api/salon/bookings/[id]/client-record/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/notes` | GET | `src/app/api/salon/bookings/[id]/notes/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | verify:hardening |
| `/api/salon/bookings/[id]/reschedule` | GET, POST | `src/app/api/salon/bookings/[id]/reschedule/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization, abuse protection | verify:hardening |
| `/api/salon/bookings/[id]/service` | POST | `src/app/api/salon/bookings/[id]/service/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:hardening |
| `/api/salon/bootstrap` | POST | `src/app/api/salon/bootstrap/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/catalog-spreadsheet` | GET, POST | `src/app/api/salon/catalog-spreadsheet/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/customer-campaigns` | GET, POST | `src/app/api/salon/customer-campaigns/route.ts` | Provider-neutral AI, disabled fail-closed | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/demo-page` | GET | `src/app/api/salon/demo-page/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/deposit-rules` | GET, POST | `src/app/api/salon/deposit-rules/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/discovery-diagnostics` | GET | `src/app/api/salon/discovery-diagnostics/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/finances/export` | GET | `src/app/api/salon/finances/export/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/finances` | GET, POST | `src/app/api/salon/finances/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/google-help` | GET, POST | `src/app/api/salon/google-help/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/growth-settings` | GET, POST | `src/app/api/salon/growth-settings/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/integrations/google/callback` | GET | `src/app/api/salon/integrations/google/callback/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/integrations/google/sync` | POST | `src/app/api/salon/integrations/google/sync/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/integrations/google` | GET, POST | `src/app/api/salon/integrations/google/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/inventory` | GET, POST | `src/app/api/salon/inventory/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/lifecycle` | GET, POST | `src/app/api/salon/lifecycle/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/location` | GET, POST | `src/app/api/salon/location/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/marketing/publish-due` | POST | `src/app/api/salon/marketing/publish-due/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/marketing` | GET, POST | `src/app/api/salon/marketing/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/morning-brief` | GET | `src/app/api/salon/morning-brief/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding-draft` | GET, POST | `src/app/api/salon/onboarding-draft/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding-instagram/callback` | GET | `src/app/api/salon/onboarding-instagram/callback/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding-instagram/data-deletion` | POST | `src/app/api/salon/onboarding-instagram/data-deletion/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding-instagram/deauthorization` | POST | `src/app/api/salon/onboarding-instagram/deauthorization/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | verify:identity |
| `/api/salon/onboarding-instagram/deletion-status` | GET | `src/app/api/salon/onboarding-instagram/deletion-status/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding-instagram` | GET, POST | `src/app/api/salon/onboarding-instagram/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | TypeScript/lint/build and route smoke where public |
| `/api/salon/onboarding` | GET, POST | `src/app/api/salon/onboarding/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/open-status` | POST | `src/app/api/salon/open-status/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/photos` | PATCH | `src/app/api/salon/photos/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/policies` | GET, POST | `src/app/api/salon/policies/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/product-orders` | GET, POST | `src/app/api/salon/product-orders/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/profile/description-draft` | POST | `src/app/api/salon/profile/description-draft/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/profile` | GET, POST, PATCH | `src/app/api/salon/profile/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/rebooking-advice` | GET | `src/app/api/salon/rebooking-advice/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | verify:hardening |
| `/api/salon/rebooking-settings` | GET, POST | `src/app/api/salon/rebooking-settings/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | verify:hardening |
| `/api/salon/rebooking/process` | POST | `src/app/api/salon/rebooking/process/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | route-specific bounds and safe errors | verify:hardening |
| `/api/salon/records/save` | POST | `src/app/api/salon/records/save/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:records |
| `/api/salon/records` | GET, POST | `src/app/api/salon/records/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | verify:records |
| `/api/salon/referrals` | GET, POST | `src/app/api/salon/referrals/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/reusable-replies` | GET, POST | `src/app/api/salon/reusable-replies/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/reviews/[id]/reply` | POST | `src/app/api/salon/reviews/[id]/reply/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/schedule-opportunities` | GET | `src/app/api/salon/schedule-opportunities/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/service-capacity` | GET | `src/app/api/salon/service-capacity/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/service-contribution` | GET, POST | `src/app/api/salon/service-contribution/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/team` | GET, POST, PATCH, DELETE | `src/app/api/salon/team/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/waitlist/openings` | POST | `src/app/api/salon/waitlist/openings/route.ts` | Provider-neutral AI, disabled fail-closed | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input, server authorization, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/salon/waitlist` | GET | `src/app/api/salon/waitlist/route.ts` | Provider-neutral AI, disabled fail-closed | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salon/workspace` | GET | `src/app/api/salon/workspace/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | dependency/confirmation handling, server authorization | TypeScript/lint/build and route smoke where public |
| `/api/salons/[slug]/qr` | GET | `src/app/api/salons/[slug]/qr/route.ts` | Supabase/database-backed operation | Salon dashboard under Engine policy | Salon bearer session plus salon membership/team permission | typed/sanitized input | TypeScript/lint/build and route smoke where public |
| `/api/search/suggestions` | GET | `src/app/api/search/suggestions/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, abuse protection | TypeScript/lint/build and route smoke where public |
| `/api/stripe/booking-checkout` | POST | `src/app/api/stripe/booking-checkout/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:billing, verify:hardening |
| `/api/stripe/booking-status` | GET | `src/app/api/stripe/booking-status/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | dependency/confirmation handling | verify:billing, verify:hardening |
| `/api/stripe/commerce-checkout` | POST | `src/app/api/stripe/commerce-checkout/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:billing |
| `/api/stripe/commerce-status` | GET | `src/app/api/stripe/commerce-status/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | dependency/confirmation handling | verify:billing |
| `/api/stripe/pickup-reservation` | POST | `src/app/api/stripe/pickup-reservation/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:billing |
| `/api/stripe/portal` | GET, POST | `src/app/api/stripe/portal/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:billing |
| `/api/stripe/subscription/change` | POST | `src/app/api/stripe/subscription/change/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, dependency/confirmation handling, server authorization, abuse protection | verify:billing |
| `/api/stripe/subscription/checkout` | POST | `src/app/api/stripe/subscription/checkout/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:billing |
| `/api/stripe/subscription/lifecycle` | POST | `src/app/api/stripe/subscription/lifecycle/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Public/owner scope validated per operation | typed/sanitized input, server authorization, abuse protection | verify:billing |
| `/api/stripe/webhook` | POST | `src/app/api/stripe/webhook/route.ts` | Stripe/provider-backed financial operation | Stripe provider plus Engine presentation | Verified provider signature or server secret | typed/sanitized input, dependency/confirmation handling | verify:billing |
| `/api/support` | GET, POST | `src/app/api/support/route.ts` | Supabase/database-backed operation | Public/customer/salon workflow | Public/owner scope validated per operation | typed/sanitized input, abuse protection | TypeScript/lint/build and route smoke where public |

## Component inventory

| Component/module | Primary owner/surface |
| --- | --- |
| `src/components/ActionToast.tsx` | Shared/public/customer surface |
| `src/components/AdminContentManager.tsx` | Shared/public/customer surface |
| `src/components/AdminDashboard.tsx` | Shared/public/customer surface |
| `src/components/AdminLogin.tsx` | Shared/public/customer surface |
| `src/components/AdminSupportInbox.tsx` | Shared/public/customer surface |
| `src/components/BookingInbox.tsx` | Shared/public/customer surface |
| `src/components/CustomerAccount.tsx` | Shared/public/customer surface |
| `src/components/CustomerAuth.tsx` | Shared/public/customer surface |
| `src/components/ImageUpload.tsx` | Shared/public/customer surface |
| `src/components/InlineFormValidation.tsx` | Shared/public/customer surface |
| `src/components/NativeSearchKeyboardBridge.tsx` | Shared/public/customer surface |
| `src/components/PasswordRecovery.tsx` | Shared/public/customer surface |
| `src/components/PublicContentLiveRefresh.tsx` | Shared/public/customer surface |
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
| `src/components/admin/AdminAdSpaces.tsx` | Platform admin / Engine |
| `src/components/admin/AdminApplicationReview.tsx` | Platform admin / Engine |
| `src/components/admin/AdminBookingEditor.tsx` | Platform admin / Engine |
| `src/components/admin/AdminEngineLanding.tsx` | Platform admin / Engine |
| `src/components/admin/AdminFeaturedCampaigns.tsx` | Platform admin / Engine |
| `src/components/admin/AdminFeaturedProducts.tsx` | Platform admin / Engine |
| `src/components/admin/AdminFinanceDashboard.tsx` | Platform admin / Engine |
| `src/components/admin/AdminHomepageMarketing.tsx` | Platform admin / Engine |
| `src/components/admin/AdminManualBookingWizard.tsx` | Platform admin / Engine |
| `src/components/admin/AdminMarketWorkspaces.tsx` | Platform admin / Engine |
| `src/components/admin/AdminMarketingWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminPromoCodes.tsx` | Platform admin / Engine |
| `src/components/admin/AdminPromotionSectionWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminRecordWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSalon360Sections.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSalonPayoutAction.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSalonPayoutWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSalonsManager.tsx` | Platform admin / Engine |
| `src/components/admin/AdminServiceCatalogWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSubmissionDetail.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSubmissionsWorkspace.tsx` | Platform admin / Engine |
| `src/components/admin/AdminSubscriptionsDashboard.tsx` | Platform admin / Engine |
| `src/components/admin/AdminTimeZonePreference.tsx` | Platform admin / Engine |
| `src/components/admin/AdminTrendingCampaigns.tsx` | Platform admin / Engine |
| `src/components/admin/AdminUserActivityTimeline.tsx` | Platform admin / Engine |
| `src/components/admin/AiAutomationManager.tsx` | Platform admin / Engine |
| `src/components/admin/BrandAppearanceManager.tsx` | Platform admin / Engine |
| `src/components/admin/BusinessLocationVisit.tsx` | Platform admin / Engine |
| `src/components/admin/BusinessSignupContentEditor.tsx` | Platform admin / Engine |
| `src/components/admin/BusinessWaitlistDemand.tsx` | Platform admin / Engine |
| `src/components/admin/EngineControlCenter.tsx` | Platform admin / Engine |
| `src/components/admin/ErrorMonitoringManager.tsx` | Platform admin / Engine |
| `src/components/admin/HeroImageFraming.tsx` | Platform admin / Engine |
| `src/components/admin/IdentityDeletionManager.tsx` | Platform admin / Engine |
| `src/components/admin/MediaRulesSettings.tsx` | Platform admin / Engine |
| `src/components/admin/NavigationMenuManager.tsx` | Platform admin / Engine |
| `src/components/admin/NotificationTemplateManager.tsx` | Platform admin / Engine |
| `src/components/admin/RecordLifecycleManager.tsx` | Platform admin / Engine |
| `src/components/admin/ReferralCampaigns.tsx` | Platform admin / Engine |
| `src/components/admin/SalonLifecycleSettings.tsx` | Platform admin / Engine |
| `src/components/admin/SearchLanguageSettings.tsx` | Platform admin / Engine |
| `src/components/admin/SystemStatusManager.tsx` | Platform admin / Engine |
| `src/components/admin/TestDataManager.tsx` | Platform admin / Engine |
| `src/components/admin/TranslationManager.tsx` | Platform admin / Engine |
| `src/components/admin/useAdminListContext.ts` | Platform admin / Engine |
| `src/components/auth/MfaCodeField.tsx` | Shared/public/customer surface |
| `src/components/auth/PasswordInput.tsx` | Shared/public/customer surface |
| `src/components/auth/RoleLogoutButton.tsx` | Shared/public/customer surface |
| `src/components/auth/SalonPendingGate.tsx` | Shared/public/customer surface |
| `src/components/auth/TeamUserManager.tsx` | Shared/public/customer surface |
| `src/components/booking/AppointmentWaitlist.tsx` | Shared/public/customer surface |
| `src/components/booking/BookedMobileLocation.tsx` | Shared/public/customer surface |
| `src/components/booking/BookingAttendance.tsx` | Shared/public/customer surface |
| `src/components/booking/BookingLocation.tsx` | Shared/public/customer surface |
| `src/components/booking/BookingPolicyEvidence.tsx` | Shared/public/customer surface |
| `src/components/booking/BookingPriceEvidence.tsx` | Shared/public/customer surface |
| `src/components/booking/BookingWelcome.tsx` | Shared/public/customer surface |
| `src/components/booking/BusinessPolicyDisclosure.tsx` | Shared/public/customer surface |
| `src/components/booking/BusinessWaitlistOpenings.tsx` | Shared/public/customer surface |
| `src/components/booking/CommunicationPreferences.tsx` | Shared/public/customer surface |
| `src/components/booking/CommunicationUnsubscribe.tsx` | Shared/public/customer surface |
| `src/components/booking/GuestBookingManager.tsx` | Shared/public/customer surface |
| `src/components/booking/GuestBookingRecovery.tsx` | Shared/public/customer surface |
| `src/components/booking/MessageDisplay.tsx` | Shared/public/customer surface |
| `src/components/booking/MobileBookingLocation.tsx` | Shared/public/customer surface |
| `src/components/business/ApplicationAgent.tsx` | Shared/public/customer surface |
| `src/components/business/BusinessPhoto.tsx` | Shared/public/customer surface |
| `src/components/business/BusinessSignupLanding.tsx` | Shared/public/customer surface |
| `src/components/business/BusinessSignupMedia.tsx` | Shared/public/customer surface |
| `src/components/business/BusinessTypeSelector.tsx` | Shared/public/customer surface |
| `src/components/business/BusinessWaitlistForm.tsx` | Shared/public/customer surface |
| `src/components/business/CategoryComingSoonContent.tsx` | Shared/public/customer surface |
| `src/components/business/useApplicationProgress.ts` | Shared/public/customer surface |
| `src/components/commerce/PickupReservationForm.tsx` | Shared/public/customer surface |
| `src/components/commerce/PickupReservationManager.tsx` | Shared/public/customer surface |
| `src/components/commerce/ProductCheckoutClient.tsx` | Shared/public/customer surface |
| `src/components/commerce/ProductPurchaseActions.tsx` | Shared/public/customer surface |
| `src/components/dashboard/CustomerAssistant.tsx` | Shared/public/customer surface |
| `src/components/dashboard/DashboardMobileMenu.tsx` | Shared/public/customer surface |
| `src/components/dashboard/DemoBusinessWorkspace.tsx` | Shared/public/customer surface |
| `src/components/dashboard/WorkspaceCalendar.tsx` | Shared/public/customer surface |
| `src/components/dashboard/WorkspaceTabs.tsx` | Shared/public/customer surface |
| `src/components/dashboard/WorkspaceToolbar.tsx` | Shared/public/customer surface |
| `src/components/dashboard/demo/businessDemoScenarios.ts` | Shared/public/customer surface |
| `src/components/forms/NumericInput.tsx` | Shared validated form control |
| `src/components/i18n/DocumentLocalizationBridge.tsx` | Localization runtime |
| `src/components/i18n/LanguageSelector.tsx` | Localization runtime |
| `src/components/i18n/LocaleProvider.tsx` | Localization runtime |
| `src/components/internal/AccessibilityStatesAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/internal/HomepageOrderAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/internal/HomepagePromotionAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/internal/MediaUploadAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/internal/NumericAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/internal/OwnerWorkflowAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/internal/SalonSpreadsheetAcceptanceHarness.tsx` | Shared/public/customer surface |
| `src/components/location/CustomerLocationProvider.tsx` | Shared/public/customer surface |
| `src/components/location/FirstRelevantLocationRequest.tsx` | Shared/public/customer surface |
| `src/components/location/MobileLocationOnboarding.tsx` | Shared/public/customer surface |
| `src/components/notifications/DashboardNotificationCenter.tsx` | Shared/public/customer surface |
| `src/components/notifications/PushSetup.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantBalances.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantCatalogPreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantControlsPreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantDictation.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantFinancePreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantFinanceReport.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantMarketingPreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantOperationPreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantPhotoUpload.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantReschedulePreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantSpeech.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantTeamPreview.tsx` | Shared/public/customer surface |
| `src/components/owner/AssistantWaitlistPreview.tsx` | Shared/public/customer surface |
| `src/components/owner/BookingChangeProposal.tsx` | Shared/public/customer surface |
| `src/components/owner/BookingCheckInExceptionForm.tsx` | Shared/public/customer surface |
| `src/components/owner/BookingNotes.tsx` | Shared/public/customer surface |
| `src/components/owner/BookingsWorkspace.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessAdvertising.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessBookingMoney.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessBookingReport.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessClientCard.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessClientLinks.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessCustomerCampaigns.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessDepositSettings.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessFinances.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessGoogleHelp.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessGrowthControls.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessInventory.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessLocationControls.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessMarketing.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessMoneyInsights.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessMorningBrief.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessOnboardingDraft.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessOverview.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessPhotoLibrary.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessPolicies.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessPolicyEditor.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessPriceContext.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessRebookingAdvice.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessRebookingControls.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessReferrals.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessReusableReplies.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessScheduleOpportunities.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessServiceCapacity.tsx` | Shared/public/customer surface |
| `src/components/owner/BusinessServiceContribution.tsx` | Shared/public/customer surface |
| `src/components/owner/FinanceCompensation.tsx` | Shared/public/customer surface |
| `src/components/owner/FinanceEarningsLeaders.tsx` | Shared/public/customer surface |
| `src/components/owner/FinancePeriodControls.tsx` | Shared/public/customer surface |
| `src/components/owner/FinancePeriodRecords.tsx` | Shared/public/customer surface |
| `src/components/owner/FinanceRecords.tsx` | Shared/public/customer surface |
| `src/components/owner/FinanceReportControls.tsx` | Shared/public/customer surface |
| `src/components/owner/FinanceUI.tsx` | Shared/public/customer surface |
| `src/components/owner/GcAssistant.tsx` | Shared/public/customer surface |
| `src/components/owner/GoogleBusinessProfileSettings.tsx` | Shared/public/customer surface |
| `src/components/owner/InstagramOnboardingSource.tsx` | Shared/public/customer surface |
| `src/components/owner/ManualAppointmentEditor.tsx` | Shared/public/customer surface |
| `src/components/owner/MobileRecordEditor.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerDashboardApp.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerDashboardResponsiveBridge.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerDashboardShell.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerRealtimeAlertBridge.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerSetupGuideLink.tsx` | Shared/public/customer surface |
| `src/components/owner/OwnerWorkflowUi.tsx` | Shared/public/customer surface |
| `src/components/owner/PrivateDemoPage.tsx` | Shared/public/customer surface |
| `src/components/owner/ProductsWorkspace.tsx` | Shared/public/customer surface |
| `src/components/owner/ProfessionalServiceAssignments.tsx` | Shared/public/customer surface |
| `src/components/owner/ReviewsWorkspace.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonDescriptionEditor.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonOpenStatusControl.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonProductOrders.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonPromotionsManager.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonSpreadsheetPanel.tsx` | Shared/public/customer surface |
| `src/components/owner/SalonVanityManager.tsx` | Shared/public/customer surface |
| `src/components/owner/ServicesWorkspace.tsx` | Shared/public/customer surface |
| `src/components/owner/StructuredCatalogEditors.tsx` | Shared/public/customer surface |
| `src/components/owner/StylistSectionFallbackEditor.tsx` | Shared/public/customer surface |
| `src/components/owner/SubscriptionPaymentMethod.tsx` | Shared/public/customer surface |
| `src/components/owner/TeamWorkspace.tsx` | Shared/public/customer surface |
| `src/components/owner/subscriptionPaymentMessages.ts` | Shared/public/customer surface |
| `src/components/public/AboutIntro.tsx` | Shared/public/customer surface |
| `src/components/public/AboutStoryDialog.tsx` | Shared/public/customer surface |
| `src/components/public/AssistantSupportHandoff.tsx` | Shared/public/customer surface |
| `src/components/public/BeautyConcierge.tsx` | Shared/public/customer surface |
| `src/components/public/BusinessLocationDetails.tsx` | Shared/public/customer surface |
| `src/components/public/BusinessMarketingUpdates.tsx` | Shared/public/customer surface |
| `src/components/public/ComplaintForm.tsx` | Shared/public/customer surface |
| `src/components/public/ContactSupportForm.tsx` | Shared/public/customer surface |
| `src/components/public/ExpandableSalonDescription.tsx` | Shared/public/customer surface |
| `src/components/public/FeaturedProductPlacement.tsx` | Shared/public/customer surface |
| `src/components/public/FeaturedSalonPlacement.tsx` | Shared/public/customer surface |
| `src/components/public/HelpCenter.tsx` | Shared/public/customer surface |
| `src/components/public/HomepagePromoRail.tsx` | Shared/public/customer surface |
| `src/components/public/MarketplaceSalonCard.tsx` | Shared/public/customer surface |
| `src/components/public/NearbySalonPlacement.tsx` | Shared/public/customer surface |
| `src/components/public/PublicCustomerAssistant.tsx` | Shared/public/customer surface |
| `src/components/public/SafeCampaignVideo.tsx` | Shared/public/customer surface |
| `src/components/public/SalonCardSkeletons.tsx` | Shared/public/customer surface |
| `src/components/public/SalonDiscovery.tsx` | Shared/public/customer surface |
| `src/components/public/SalonDistance.tsx` | Shared/public/customer surface |
| `src/components/public/SalonPhotoGallery.tsx` | Shared/public/customer surface |
| `src/components/public/SalonRatingSummary.tsx` | Shared/public/customer surface |
| `src/components/public/SalonStylistFallback.tsx` | Shared/public/customer surface |
| `src/components/public/SalonTrustLabels.tsx` | Shared/public/customer surface |
| `src/components/public/StyleCatalog.tsx` | Shared/public/customer surface |
| `src/components/public/TrendingVideoPlacement.tsx` | Shared/public/customer surface |
| `src/components/search/AutocompleteInputs.tsx` | Shared/public/customer surface |
| `src/components/search/GoogleSalonMap.tsx` | Shared/public/customer surface |
| `src/components/search/HeaderStyleSearch.tsx` | Shared/public/customer surface |
| `src/components/site/AutoContentCarousel.tsx` | Shared/public/customer surface |
| `src/components/site/MobilePublicMenu.tsx` | Shared/public/customer surface |
| `src/components/site/NewsletterForm.tsx` | Shared/public/customer surface |
| `src/components/site/PublicChrome.tsx` | Shared/public/customer surface |
| `src/components/site/PublicContentCard.tsx` | Shared/public/customer surface |
| `src/components/site/PublicContentSections.tsx` | Shared/public/customer surface |
| `src/components/site/PublicNavigationMenu.tsx` | Shared/public/customer surface |
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
- `application_document_uploads`
- `appointment_waitlist`
- `appointment_waitlist_offers`
- `auth_login_attempts`
- `auth_mfa_challenges`
- `availability`
- `billing_events`
- `blog_posts`
- `booking_audit_log`
- `booking_checkout_intents`
- `booking_conversation_events`
- `booking_financial_events`
- `booking_followup_queue`
- `booking_guest_access_audit`
- `booking_guest_access_tokens`
- `booking_guest_recovery_challenges`
- `booking_integrity_conflicts`
- `booking_message_translation_jobs`
- `booking_message_translations`
- `booking_messages`
- `booking_refund_operations`
- `booking_reminder_claims`
- `booking_reschedule_options`
- `booking_reschedule_proposals`
- `booking_review_links`
- `bookings`
- `business_application_progress`
- `business_booking_incident_events`
- `business_booking_incidents`
- `business_client_cards`
- `business_client_events`
- `business_client_formulas`
- `business_client_link_events`
- `business_client_link_state`
- `business_client_photos`
- `business_client_visit_links`
- `business_communication_preference_history`
- `business_communication_preferences`
- `business_compensation_arrangements`
- `business_compensation_obligations`
- `business_compensation_payments`
- `business_customer_campaign_recipients`
- `business_customer_campaigns`
- `business_deposit_rules`
- `business_finance_expenses`
- `business_finance_operations`
- `business_finance_receipts`
- `business_finance_sales`
- `business_google_audit`
- `business_google_connections`
- `business_google_oauth_flows`
- `business_google_sync_operations`
- `business_growth_settings`
- `business_instagram_connections`
- `business_instagram_deletions`
- `business_instagram_import_assets`
- `business_instagram_imports`
- `business_instagram_oauth_flows`
- `business_location_settings_events`
- `business_location_verification_events`
- `business_marketing_events`
- `business_marketing_posts`
- `business_onboarding_drafts`
- `business_operator_transitions`
- `business_policy_revisions`
- `business_referral_campaigns`
- `business_referral_claims`
- `business_referral_codes`
- `business_referral_events`
- `business_referral_payment_checks`
- `business_referral_rewards`
- `business_reusable_replies`
- `business_review_reply_versions`
- `business_service_cost_reviews`
- `business_stock_movements`
- `business_stock_operations`
- `business_supplies`
- `business_travel_quotes`
- `business_verification_locations`
- `commerce_checkout_intents`
- `complaints_log`
- `content_pages`
- `current_business_deposit_rules`
- `customer_favorites`
- `customers`
- `engine_publication_state`
- `engine_setting_versions`
- `engine_settings`
- `engine_system_components`
- `featured_campaign_audit`
- `featured_salon_campaigns`
- `gc_assistant_active_tasks`
- `gc_assistant_audit`
- `gc_assistant_memory`
- `gc_assistant_requests`
- `gc_private`
- `homepage_product_placement_audit`
- `homepage_product_placements`
- `homepage_sections`
- `identity_conflict_queue`
- `identity_conflict_resolutions`
- `identity_deletion_jobs`
- `identity_security_events`
- `integration_health_checks`
- `localized_content`
- `location_markets`
- `marketing_entitlements`
- `master_styles`
- `media_assets`
- `media_upload_profiles`
- `media_upload_sessions`
- `media_video_profiles`
- `navigation_items`
- `newsletter_subscribers`
- `notification_delivery_log`
- `notification_template_versions`
- `notification_templates`
- `notifications`
- `owner_booking_notes`
- `password_reset_codes`
- `platform_brand_asset_versions`
- `platform_brand_assets`
- `platform_content`
- `platform_error_affected_businesses`
- `platform_error_alert_rules`
- `platform_error_events`
- `platform_error_occurrences`
- `platform_identities`
- `platform_promotions`
- `product_inventory_reservations`
- `product_order_events`
- `product_order_items`
- `product_order_refunds`
- `product_orders`
- `product_promotion_redemptions`
- `promo_code_redemptions`
- `promo_codes`
- `public_change_events`
- `push_subscriptions`
- `record_management_events`
- `review_content_moderation_queue`
- `review_dispute_events`
- `review_moderation_events`
- `review_reply_moderation_queue`
- `reviews`
- `salon_application_revisions`
- `salon_applications`
- `salon_availability_override_audit`
- `salon_blockouts`
- `salon_booking_cancellations`
- `salon_closure_requests`
- `salon_payout_attempts`
- `salon_products`
- `salon_promotion_audit`
- `salon_promotion_redemptions`
- `salon_promotions`
- `salon_publication_override_audit`
- `salon_publication_overrides`
- `salon_quality_metrics`
- `salon_reconciliation_items`
- `salon_reconciliation_runs`
- `salon_recovery_balances`
- `salon_slug_redirects`
- `salon_slug_reserved_words`
- `salon_spreadsheet_imports`
- `salon_status_audit`
- `salon_team_members`
- `salon_test_deletion_audit`
- `salon_vanity_audit`
- `salon_vanity_requests`
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
- `subscription_checkout_attempts`
- `subscription_mutation_leases`
- `subscription_payment_method_attempts`
- `subscription_payment_schedule_intents`
- `subscriptions`
- `support_response_email_outbox`
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

- `abandon_application_document_upload`
- `abandon_deleted_application_documents`
- `about_additional_sections`
- `acquire_subscription_mutation`
- `active_admin_can_manage_submissions`
- `active_super_admin`
- `admin_activate_salon_application`
- `admin_ad_spaces`
- `admin_apply_notification_template`
- `admin_archive_salon_application`
- `admin_assign_support_ticket`
- `admin_change_salon_status`
- `admin_claim_support_response_email`
- `admin_complete_support_response_email`
- `admin_content_link_targets`
- `admin_delete_offboarded_test_salon`
- `admin_delete_salon_application`
- `admin_finalize_booking_payout`
- `admin_has_permission`
- `admin_import_service_catalog`
- `admin_list_businesses`
- `admin_list_salons`
- `admin_manage_catalog_record`
- `admin_manage_featured_campaign`
- `admin_moderate_review`
- `admin_moderate_review_content`
- `admin_moderate_review_reply`
- `admin_moderate_trending_campaign`
- `admin_operationally_delete_salon`
- `admin_publish_homepage_section_order`
- `admin_reassign_service_group`
- `admin_reconcile_salon_publication`
- `admin_reject_salon_application_atomic`
- `admin_reserve_booking_payout`
- `admin_respond_support_ticket`
- `admin_restore_salon_application`
- `admin_review_salon_vanity_request`
- `admin_save_content_catalog_record`
- `admin_save_content_record`
- `admin_save_featured_campaign`
- `admin_save_featured_campaign_v2`
- `admin_save_homepage_product_placement`
- `admin_save_trending_campaign`
- `admin_set_salon_publication_override`
- `admin_update_salon_application_snapshot`
- `admin_update_submission_current_salon`
- `advance_gc_assistant_task`
- `advance_product_pickup_reservation`
- `apply_business_onboarding_draft`
- `apply_commerce_checkout_tax`
- `approve_business_marketing_post`
- `approve_salon_application`
- `archive_payment_phase_intent`
- `assert_customer_campaign_owner`
- `assert_gc_team_target`
- `assert_primary_identity`
- `assert_subscription_mutation`
- `assign_stable_stylist_slug`
- `attach_business_travel_quote`
- `attach_registered_media`
- `audit_business_stock`
- `audit_declined_reschedule_proposal`
- `audit_salon_promotion_change`
- `authorize_business_referral_campaign`
- `begin_stripe_webhook_event`
- `bind_subscription_payment_method_attempt`
- `booking_conversation_open`
- `booking_message_business_recipient`
- `booking_public_reference_from_number`
- `booking_reminder_hours_in_use`
- `bump_business_review_reply_revision`
- `bump_public_change_event`
- `business_automated_waitlist_allowed`
- `business_client_linked_subjects`
- `business_client_scope`
- `business_compensation_snapshot`
- `business_finance_entry_options`
- `business_finance_scope`
- `business_location_settings`
- `business_marketing_snapshot`
- `business_marketing_sources_current`
- `business_onboarding_baseline`
- `business_referral_check_inputs`
- `business_referral_terms_valid`
- `business_referral_workspace`
- `business_reminder_hours`
- `business_reusable_replies_workspace`
- `business_reusable_reply_json`
- `business_waitlist_openings`
- `cancel_business_ad_reservation`
- `cancel_business_marketing_post`
- `cancel_customer_campaign`
- `cancel_product_pickup_reservation`
- `cancel_salon_promotion_reservation`
- `capture_booking_p0_evidence`
- `capture_platform_error`
- `capture_salon_application_revision`
- `change_business_client_link`
- `check_private_demo`
- `check_product_promotion_scope`
- `claim_appointment_waitlist_offer`
- `claim_booking_communication_token`
- `claim_booking_message_translation`
- `claim_booking_reminder`
- `claim_business_rebooking_reminder`
- `claim_business_referral`
- `claim_customer_campaign_email`
- `claim_due_booking_followups`
- `claim_followup_notification_delivery`
- `claim_notification_delivery`
- `claim_scheduled_notification_delivery`
- `claim_subscription_payment_method_attempt`
- `commit_business_location_geocode`
- `complete_appointment_waitlist_offer`
- `complete_booking_reminder`
- `complete_combined_checkout`
- `complete_product_pickup_reservation`
- `complete_subscription_checkout_attempt`
- `confirm_customer_campaign`
- `confirm_gc_assistant_request`
- `confirmed_business_booking_location`
- `consume_business_google_flow`
- `consume_business_instagram_flow`
- `create_booking_notification`
- `create_booking_reschedule_proposal`
- `create_business_referral_code`
- `create_business_travel_quote`
- `create_salon_availability_override`
- `create_stylist_draft`
- `customer_campaign_eligible`
- `customer_campaign_source_current`
- `customer_campaign_workspace`
- `dashboard_notify_application`
- `dashboard_notify_billing_event`
- `dashboard_notify_platform_error`
- `dashboard_notify_support_ticket`
- `deduct_offline_product_stock`
- `delete_business_instagram_data`
- `demo_delivery_actor_ids`
- `demo_row_visible`
- `discover_featured_salons`
- `discover_nearby_salons`
- `discover_nearby_salons_ranked`
- `discover_nearby_salons_ranked_for_businesses`
- `discover_trending_videos`
- `dispute_review`
- `distance_miles`
- `due_appointment_waitlist`
- `due_booking_reminders`
- `due_business_google`
- `due_business_rebooking_reminders`
- `emit_public_change_event`
- `end_gc_assistant_task`
- `enforce_admin_identity`
- `enforce_application_document_attachments`
- `enforce_blog_post_archive_publication`
- `enforce_complaint_verification`
- `enforce_content_page_archive_publication`
- `enforce_customer_identity`
- `enforce_explicit_application_choices`
- `enforce_salon_owner_identity`
- `enforce_salon_product_plan_limit`
- `enforce_salon_profile_assistance_controls`
- `enforce_salon_promotion_plan_limit`
- `enforce_salon_slug_namespaces`
- `enforce_salon_team_identity`
- `enforce_salon_wide_booking_overlap`
- `enforce_salon_wide_intent_overlap`
- `enforce_subscription_scheduled_plan_limits`
- `engine_apply_setting`
- `engine_emergency_revert_setting`
- `engine_import_drafts`
- `engine_number_setting`
- `execute_test_batch_cleanup`
- `expire_business_travel_quotes`
- `expire_featured_campaigns`
- `expire_product_pickup_reservations`
- `expire_stale_commerce_checkouts`
- `expire_subscription_checkout_attempt`
- `fail_booking_reminder_claim`
- `finalize_application_document_upload`
- `finalize_booking_salon_promotion`
- `finalize_media_upload_session`
- `finish_booking_followup`
- `finish_business_instagram_expiry`
- `finish_business_rebooking_reminder`
- `finish_customer_campaign_email`
- `finish_subscription_payment_method_attempt`
- `first_about_carousel`
- `gc_private`
- `generate_unique_salon_slug`
- `generate_unique_stylist_slug`
- `get_public_blog_post`
- `get_public_blog_posts`
- `get_public_content_page`
- `get_public_content_pages`
- `get_public_navigation_surface`
- `google_business_owner`
- `guard_booking_conversation_send`
- `guard_business_added_booking`
- `guard_business_stock_revision`
- `guard_checkout_professional_service`
- `guard_independent_team_membership`
- `guard_marketplace_review_origin`
- `guard_payment_method_reservation`
- `guard_revisioned_reminder_completion`
- `has_active_subscription`
- `import_salon_catalog_ordered`
- `import_salon_products_spreadsheet`
- `import_salon_services_spreadsheet`
- `instagram_onboarding_account_available`
- `instagram_onboarding_owner`
- `is_admin`
- `is_marketplace_visible`
- `is_platform_admin`
- `is_salon_profile_public`
- `keep_booking_event`
- `keep_booking_message_source`
- `keep_message_language_provenance`
- `keep_published_business_policy_immutable`
- `link_subscription_checkout_attempt`
- `list_public_style_catalog`
- `manage_appointment_waitlist`
- `manage_business_communication_preferences`
- `manage_business_google`
- `manage_business_instagram`
- `mark_payment_schedule_apply`
- `mark_subscription_payment_method_apply`
- `marketplace_visible_salon_ids`
- `marketplace_visible_salon_ids_page`
- `master_application_visit_guard`
- `master_business_location_projection`
- `master_sync_team_operator`
- `next_booking_public_reference`
- `next_product_order_reference`
- `normalize_home_hero_sections`
- `normalize_identity_email`
- `normalize_marketplace_search`
- `normalized_salon_address_fingerprint`
- `normalized_salon_vanity_slug`
- `notify_active_admins`
- `notify_booking_message_in_app`
- `offer_appointment_waitlist`
- `offer_business_waitlist`
- `open_booking_conversation_event`
- `own_business_incident_count`
- `owns_salon`
- `owns_style`
- `owns_stylist`
- `p0_actor_can_manage_professional`
- `p0_actor_has_permission`
- `p0_booking_message_access`
- `p0_business_plan_active`
- `p0_calendar_occupancy_guard`
- `p0_can_read_booking_notes`
- `p0_hours_window`
- `p0_salon_has_permission`
- `plan_rank`
- `platform_admin_overview_metrics`
- `prepare_application_document_upload`
- `prepare_identity_deletion`
- `prepare_payment_phase_apply`
- `prepare_salon_geocoding`
- `preserve_booking_service_location`
- `preserve_business_deposit_snapshot`
- `preserve_salon_slug_redirect`
- `prevent_availability_override_audit_mutation`
- `prevent_brand_asset_version_mutation`
- `prevent_featured_audit_mutation`
- `prevent_homepage_product_audit_mutation`
- `prevent_publication_override_audit_mutation`
- `prevent_salon_application_revision_mutation`
- `prevent_salon_promotion_audit_mutation`
- `prevent_salon_status_audit_mutation`
- `prevent_salon_test_deletion_audit_mutation`
- `prevent_salon_vanity_audit_mutation`
- `prevent_trending_audit_mutation`
- `preview_gc_assistant_marketing`
- `preview_gc_assistant_photo_upload`
- `preview_gc_assistant_waitlist`
- `preview_gc_booking_progress`
- `preview_gc_business_controls`
- `preview_gc_business_operation`
- `preview_gc_catalog_change`
- `preview_gc_finance_record`
- `preview_gc_product_fulfillment`
- `preview_gc_professional_archive`
- `preview_gc_team_change`
- `product_order_reference_from_number`
- `product_reservation_reference_from_number`
- `propagate_master_style_name`
- `protect_customer_review_content`
- `protect_last_active_super_admin`
- `protect_salon_platform_fields`
- `public_business_marketing_posts`
- `publish_business_policy`
- `publish_due_business_marketing_posts`
- `purge_platform_error_events`
- `queue_business_instagram_expiry`
- `read_business_ad_spaces`
- `read_business_booking_report`
- `read_business_client_card`
- `read_business_client_links`
- `read_business_client_photo`
- `read_business_finance`
- `read_business_google_help`
- `read_business_growth_settings`
- `read_business_rebooking_evidence`
- `read_business_rebooking_settings`
- `read_business_stock`
- `read_business_waitlist`
- `read_gc_business_controls`
- `read_gc_business_marketing`
- `read_gc_business_stock`
- `read_gc_finance_records`
- `read_gc_team_controls`
- `read_private_booking_balances`
- `read_service_contribution_evidence`
- `reconcile_about_child_sections`
- `reconcile_booking_financial_state`
- `reconcile_business_referrals`
- `reconcile_salon_lifecycle`
- `reconcile_salon_publication`
- `record_booking_financial_event`
- `record_business_booking_incident`
- `record_business_client_photo`
- `record_business_finance`
- `record_business_location_visit`
- `record_business_stock`
- `record_offline_product_stock`
- `record_stripe_promo_redemption`
- `record_subscription_mutation_request`
- `record_subscription_mutation_response`
- `redact_business_instagram_import`
- `redeem_promo_code`
- `redeem_salon_promotion`
- `refresh_salon_lifecycle_from_child`
- `refresh_salon_lifecycle_from_salon`
- `refresh_salon_lifecycle_trigger`
- `refresh_salon_review_summary`
- `refresh_trending_campaign_states`
- `release_combined_checkout`
- `release_completed_subscription_checkout_attempt`
- `release_salon_availability_override`
- `release_subscription_mutation`
- `remove_expired_auth_security_rows`
- `replace_style_materials`
- `reply_to_review`
- `request_booking_incident_review`
- `request_business_google_help`
- `request_salon_vanity_url`
- `require_homepage_product_entitlement`
- `reserve_booking_checkout`
- `reserve_business_ad_space`
- `reserve_combined_checkout`
- `reserve_deepl_translation_usage`
- `reserve_gc_assistant_usage`
- `reserve_governed_ai_usage`
- `reserve_product_pickup_checkout`
- `reserve_promo_code`
- `reserve_salon_promotion`
- `reserve_scheduled_payment_method_attempt`
- `reserve_subscription_checkout_attempt`
- `reserve_subscription_payment_method_attempt`
- `reset_private_demo`
- `resolve_homepage_promotion_target`
- `resolve_homepage_promotion_targets`
- `resolve_search_service_query`
- `resolve_terminal_booking_notifications`
- `respond_booking_reschedule`
- `safe_uuid`
- `salon_actionable_booking_count`
- `salon_effective_plan_key`
- `salon_has_feature`
- `salon_has_permission`
- `salon_is_solo`
- `salon_lifecycle_diagnostic`
- `salon_limit_plan_key`
- `salon_plan_limit`
- `salon_publication_diagnostic`
- `salon_setup_complete`
- `salon_slugify`
- `salon_team_stylist_id`
- `salon_vanity_slug_available`
- `save_business_added_appointment`
- `save_business_application_progress`
- `save_business_client_card`
- `save_business_deposit_rule`
- `save_business_growth_settings`
- `save_business_marketing_post`
- `save_business_onboarding_draft`
- `save_business_rebooking_settings`
- `save_business_referral_campaign`
- `save_business_reusable_reply`
- `save_business_review_reply`
- `save_customer_campaign`
- `save_gc_assistant_request`
- `save_owner_catalog_draft`
- `save_salon_style_with_materials`
- `save_service_contribution_review`
- `section_card_count`
- `seed_private_demo`
- `set_booking_checkout_integrity_fields`
- `set_booking_integrity_fields`
- `set_booking_public_reference`
- `snapshot_booking_compensation`
- `stylist_slugify`
- `submit_master_business_application`
- `submit_salon_application_atomic`
- `submit_salon_review_reply`
- `submit_verified_guest_review`
- `sync_booking_cancellation_actor`
- `sync_platform_identity_from_auth`
- `sync_search_language_target`
- `sync_service_group_name`
- `track_booking_schedule_revision`
- `track_platform_error_affected_business`
- `transition_booking_service`
- `transition_booking_service_v2`
- `translation_version_guard`
- `unsubscribe_business_communications`
- `update_business_assistant_avatar`
- `update_business_location_settings`
- `update_business_photo_details`
- `upsert_dashboard_notification`
- `valid_braiding_material_quality`
- `validate_application_structured_us_address`
- `validate_master_service_catalog`
- `validate_professional_service_assignments`
- `validate_salon_store_hours`
- `validate_salon_structured_us_address`
- `validate_structured_material`
- `validate_structured_style`
- `validate_style_numeric_bounds`
- `validate_stylist_specialties`
- `validate_time_zone_preference`

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
- `application_progress_owner_read` on `business_application_progress`
- `assistant_actor_read` on `gc_assistant_requests`
- `assistant_audit_read` on `gc_assistant_audit`
- `availability_owner_delete` on `availability`
- `availability_owner_insert` on `availability`
- `availability_owner_update` on `availability`
- `availability_public_read` on `availability`
- `billing_events_admin_read` on `billing_events`
- `blog_posts_admin_write` on `blog_posts`
- `blog_posts_public_read` on `blog_posts`
- `booking_audit_log_admin_read` on `booking_audit_log`
- `booking_event_participant_read` on `booking_conversation_events`
- `booking_financial_events_admin_read` on `booking_financial_events`
- `booking_financial_events_salon_read` on `booking_financial_events`
- `booking_refund_operations_admin_read` on `booking_refund_operations`
- `booking_refund_operations_salon_read` on `booking_refund_operations`
- `booking_review_links_service_only` on `booking_review_links`
- `bookings_admin_update` on `bookings`
- `bookings_customer_insert` on `bookings`
- `bookings_owner_update` on `bookings`
- `bookings_participant_read` on `bookings`
- `bookings_public_insert` on `bookings`
- `business_policy_owner_read` on `business_policy_revisions`
- `business_policy_public_read` on `business_policy_revisions`
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
- `demo_private_customers` on `customers`
- `demo_private_records` on `public`
- `demo_private_tenant` on `salons`
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
- `homepage_product_audit_admin_read` on `homepage_product_placement_audit`
- `homepage_product_placements_admin_read` on `homepage_product_placements`
- `homepage_sections_admin_write` on `homepage_sections`
- `homepage_sections_public_read` on `homepage_sections`
- `identity_deletion_jobs_admin_read` on `identity_deletion_jobs`
- `integration_health_checks_admin_read` on `integration_health_checks`
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
- `media_upload_sessions_owner_read` on `media_upload_sessions`
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
- `owner_booking_notes_read` on `owner_booking_notes`
- `platform_brand_assets_admin_read` on `platform_brand_assets`
- `platform_brand_versions_admin_read` on `platform_brand_asset_versions`
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
- `product_order_events_authorized_read` on `product_order_events`
- `product_order_items_authorized_read` on `product_order_items`
- `product_orders_customer_read` on `product_orders`
- `product_promotion_redemptions_authorized_read` on `product_promotion_redemptions`
- `product_refunds_authorized_read` on `product_order_refunds`
- `promo_codes_admin_all` on `promo_codes`
- `promo_redemptions_admin_read` on `promo_code_redemptions`
- `public_change_events_read` on `public_change_events`
- `push_subscriptions_owner_read` on `push_subscriptions`
- `push_subscriptions_self_delete` on `push_subscriptions`
- `push_subscriptions_self_insert` on `push_subscriptions`
- `push_subscriptions_self_update` on `push_subscriptions`
- `record_management_events_admin_read` on `record_management_events`
- `review_content_moderation_queue_admin_read` on `review_content_moderation_queue`
- `review_content_moderation_queue_service_all` on `review_content_moderation_queue`
- `review_dispute_events_admin_read` on `review_dispute_events`
- `review_dispute_events_salon_read` on `review_dispute_events`
- `review_dispute_events_service_write` on `review_dispute_events`
- `review_media_customer_write` on `storage`
- `review_moderation_events_admin_read` on `review_moderation_events`
- `review_moderation_events_service_write` on `review_moderation_events`
- `review_reply_moderation_queue_admin_read` on `review_reply_moderation_queue`
- `review_reply_moderation_queue_service_all` on `review_reply_moderation_queue`
- `reviews_admin_delete` on `reviews`
- `reviews_admin_update` on `reviews`
- `reviews_customer_insert` on `reviews`
- `reviews_public_read` on `reviews`
- `salon_application_revisions_admin_read` on `salon_application_revisions`
- `salon_applications_admin_write` on `salon_applications`
- `salon_applications_owner_insert` on `salon_applications`
- `salon_applications_owner_read` on `salon_applications`
- `salon_applications_owner_update` on `salon_applications`
- `salon_availability_override_audit_service_access` on `salon_availability_override_audit`
- `salon_blockouts_owner_access` on `salon_blockouts`
- `salon_cancellations_owner_read` on `salon_booking_cancellations`
- `salon_media_owner_delete` on `storage`
- `salon_media_owner_insert` on `storage`
- `salon_media_owner_update` on `storage`
- `salon_payout_attempts_admin_read` on `salon_payout_attempts`
- `salon_payout_attempts_salon_read` on `salon_payout_attempts`
- `salon_products_owner_write` on `salon_products`
- `salon_products_public_read` on `salon_products`
- `salon_promotion_audit_owner_read` on `salon_promotion_audit`
- `salon_promotion_redemptions_authorized_read` on `salon_promotion_redemptions`
- `salon_promotions_owner_write` on `salon_promotions`
- `salon_promotions_public_read` on `salon_promotions`
- `salon_recovery_balances_admin_read` on `salon_recovery_balances`
- `salon_recovery_balances_salon_read` on `salon_recovery_balances`
- `salon_slug_redirects_public_read` on `salon_slug_redirects`
- `salon_spreadsheet_imports_owner_read` on `salon_spreadsheet_imports`
- `salon_status_audit_admin_read` on `salon_status_audit`
- `salon_team_members_owner_write` on `salon_team_members`
- `salon_team_members_read` on `salon_team_members`
- `salon_test_deletion_audit_admin_read` on `salon_test_deletion_audit`
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
- `translated_message_participant_read` on `booking_message_translations`
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
| 83 | `20260723290000_promotion_targeting_enforcement.sql` | `supabase/migrations/20260723290000_promotion_targeting_enforcement.sql` |
| 84 | `20260723300000_engine_brand_appearance.sql` | `supabase/migrations/20260723300000_engine_brand_appearance.sql` |
| 85 | `20260723310000_salon_vanity_urls.sql` | `supabase/migrations/20260723310000_salon_vanity_urls.sql` |
| 86 | `20260723320000_booking_integrity_conflicts_rls.sql` | `supabase/migrations/20260723320000_booking_integrity_conflicts_rls.sql` |
| 87 | `20260724100000_location_persistence_controls.sql` | `supabase/migrations/20260724100000_location_persistence_controls.sql` |
| 88 | `20260724110000_booking_reschedule_and_service_lifecycle.sql` | `supabase/migrations/20260724110000_booking_reschedule_and_service_lifecycle.sql` |
| 89 | `20260724120000_booking_public_references.sql` | `supabase/migrations/20260724120000_booking_public_references.sql` |
| 90 | `20260724130000_cancellation_refund_controls.sql` | `supabase/migrations/20260724130000_cancellation_refund_controls.sql` |
| 91 | `20260724140000_timezone_preferences.sql` | `supabase/migrations/20260724140000_timezone_preferences.sql` |
| 92 | `20260724150000_video_processing_lifecycle.sql` | `supabase/migrations/20260724150000_video_processing_lifecycle.sql` |
| 93 | `20260724160000_brand_engine_binary_and_theme.sql` | `supabase/migrations/20260724160000_brand_engine_binary_and_theme.sql` |
| 94 | `20260724170000_product_commerce_and_combined_checkout.sql` | `supabase/migrations/20260724170000_product_commerce_and_combined_checkout.sql` |
| 95 | `20260724180000_authorized_public_style_catalog.sql` | `supabase/migrations/20260724180000_authorized_public_style_catalog.sql` |
| 96 | `20260725100000_unified_launch_brand_tokens.sql` | `supabase/migrations/20260725100000_unified_launch_brand_tokens.sql` |
| 97 | `20260725101000_verified_guest_review_links.sql` | `supabase/migrations/20260725101000_verified_guest_review_links.sql` |
| 98 | `20260725102000_compact_booking_references.sql` | `supabase/migrations/20260725102000_compact_booking_references.sql` |
| 99 | `20260725103000_availability_performance_indexes.sql` | `supabase/migrations/20260725103000_availability_performance_indexes.sql` |
| 100 | `20260725104000_authoritative_booking_finance.sql` | `supabase/migrations/20260725104000_authoritative_booking_finance.sql` |
| 101 | `20260725105000_pickup_reservations_and_featured_products.sql` | `supabase/migrations/20260725105000_pickup_reservations_and_featured_products.sql` |
| 102 | `20260725106000_pickup_reservation_operations.sql` | `supabase/migrations/20260725106000_pickup_reservation_operations.sql` |
| 103 | `20260725107000_featured_product_engine_controls.sql` | `supabase/migrations/20260725107000_featured_product_engine_controls.sql` |
| 104 | `20260726180000_pilot_lifecycle_and_availability_controls.sql` | `supabase/migrations/20260726180000_pilot_lifecycle_and_availability_controls.sql` |
| 105 | `20260726190000_pilot_verified_review_disputes.sql` | `supabase/migrations/20260726190000_pilot_verified_review_disputes.sql` |
| 106 | `20260726200000_pilot_homepage_promotion_rail.sql` | `supabase/migrations/20260726200000_pilot_homepage_promotion_rail.sql` |
| 107 | `20260727210000_mobile_homepage_order_and_promotion_media.sql` | `supabase/migrations/20260727210000_mobile_homepage_order_and_promotion_media.sql` |
| 108 | `20260727220000_direct_image_upload_pipeline.sql` | `supabase/migrations/20260727220000_direct_image_upload_pipeline.sql` |
| 109 | `20260727230000_publication_activation_and_stylist_slugs.sql` | `supabase/migrations/20260727230000_publication_activation_and_stylist_slugs.sql` |
| 110 | `20260728100000_media_attachment_scope_hardening.sql` | `supabase/migrations/20260728100000_media_attachment_scope_hardening.sql` |
| 111 | `20260728210000_platform_catalog_spreadsheet_import.sql` | `supabase/migrations/20260728210000_platform_catalog_spreadsheet_import.sql` |
| 112 | `20260729140000_salon_catalog_spreadsheet_imports.sql` | `supabase/migrations/20260729140000_salon_catalog_spreadsheet_imports.sql` |
| 113 | `20260731160000_admin_complimentary_marketing_placements.sql` | `supabase/migrations/20260731160000_admin_complimentary_marketing_placements.sql` |
| 114 | `20260803160000_launch_owner_controls_and_ux.sql` | `supabase/migrations/20260803160000_launch_owner_controls_and_ux.sql` |
| 115 | `20260804190000_homepage_promotion_pool_and_trending_media.sql` | `supabase/migrations/20260804190000_homepage_promotion_pool_and_trending_media.sql` |
| 116 | `20260804200000_salon_profile_assistance_and_review_safety.sql` | `supabase/migrations/20260804200000_salon_profile_assistance_and_review_safety.sql` |
| 117 | `20260804210000_offboarded_test_salon_protected_deletion.sql` | `supabase/migrations/20260804210000_offboarded_test_salon_protected_deletion.sql` |
| 118 | `20260807020000_authoritative_submission_lifecycle.sql` | `supabase/migrations/20260807020000_authoritative_submission_lifecycle.sql` |
| 119 | `20260807190000_reconcile_homepage_promotion_editor.sql` | `supabase/migrations/20260807190000_reconcile_homepage_promotion_editor.sql` |
| 120 | `20260807200000_authoritative_discovery_search.sql` | `supabase/migrations/20260807200000_authoritative_discovery_search.sql` |
| 121 | `20260807210000_content_presentation_and_mobile_legal.sql` | `supabase/migrations/20260807210000_content_presentation_and_mobile_legal.sql` |
| 122 | `20260807220000_review_moderation_and_rating_sync.sql` | `supabase/migrations/20260807220000_review_moderation_and_rating_sync.sql` |
| 123 | `20260807230000_booking_reminder_retry_semantics.sql` | `supabase/migrations/20260807230000_booking_reminder_retry_semantics.sql` |
| 124 | `20260808120000_content_publication_workflow.sql` | `supabase/migrations/20260808120000_content_publication_workflow.sql` |
| 125 | `20260809120000_support_assignment_workflow.sql` | `supabase/migrations/20260809120000_support_assignment_workflow.sql` |
| 126 | `20260809130000_platform_admin_overview_metrics.sql` | `supabase/migrations/20260809130000_platform_admin_overview_metrics.sql` |
| 127 | `20260809150000_admin_record_quality_and_content_targets.sql` | `supabase/migrations/20260809150000_admin_record_quality_and_content_targets.sql` |
| 128 | `20260809160000_application_document_upload_integrity.sql` | `supabase/migrations/20260809160000_application_document_upload_integrity.sql` |
| 129 | `20260809170000_search_authorization_and_runtime_hardening.sql` | `supabase/migrations/20260809170000_search_authorization_and_runtime_hardening.sql` |
| 130 | `20260809180000_atomic_content_catalog_audit.sql` | `supabase/migrations/20260809180000_atomic_content_catalog_audit.sql` |
| 131 | `20260811120000_content_slot_reconciliation.sql` | `supabase/migrations/20260811120000_content_slot_reconciliation.sql` |
| 132 | `20260825120000_public_content_realtime_and_booking_badges.sql` | `supabase/migrations/20260825120000_public_content_realtime_and_booking_badges.sql` |
| 133 | `20260825130000_booking_check_in_exception_workflow.sql` | `supabase/migrations/20260825130000_booking_check_in_exception_workflow.sql` |
| 134 | `20260825140000_featured_campaign_owner_controls.sql` | `supabase/migrations/20260825140000_featured_campaign_owner_controls.sql` |
| 135 | `20260825141000_fix_featured_campaign_owner_controls.sql` | `supabase/migrations/20260825141000_fix_featured_campaign_owner_controls.sql` |
| 136 | `20260825150000_stripe_connect_booking_payouts.sql` | `supabase/migrations/20260825150000_stripe_connect_booking_payouts.sql` |
| 137 | `20260831100000_authoritative_public_style_catalog.sql` | `supabase/migrations/20260831100000_authoritative_public_style_catalog.sql` |
| 138 | `20260831110000_official_subscription_plans_and_limits.sql` | `supabase/migrations/20260831110000_official_subscription_plans_and_limits.sql` |
| 139 | `20260901120000_subscription_checkout_idempotency.sql` | `supabase/migrations/20260901120000_subscription_checkout_idempotency.sql` |
| 140 | `20260901130000_complete_search_suggestion_coverage.sql` | `supabase/migrations/20260901130000_complete_search_suggestion_coverage.sql` |
| 141 | `20260909185351_business_onboarding_explicit_application_choices.sql` | `supabase/migrations/20260909185351_business_onboarding_explicit_application_choices.sql` |
| 142 | `20260910133806_business_signup_content_management.sql` | `supabase/migrations/20260910133806_business_signup_content_management.sql` |
| 143 | `20260913225436_p0_policies_assistant_and_booking_evidence.sql` | `supabase/migrations/20260913225436_p0_policies_assistant_and_booking_evidence.sql` |
| 144 | `20260914113932_p0_operational_calendar_and_policy_acceptance.sql` | `supabase/migrations/20260914113932_p0_operational_calendar_and_policy_acceptance.sql` |
| 145 | `20260914225409_ai_assistant_pilot_budget.sql` | `supabase/migrations/20260914225409_ai_assistant_pilot_budget.sql` |
| 146 | `20260914234000_prelaunch_business_copy.sql` | `supabase/migrations/20260914234000_prelaunch_business_copy.sql` |
| 147 | `20260915132412_gc_assistant_conversation_and_knowledge.sql` | `supabase/migrations/20260915132412_gc_assistant_conversation_and_knowledge.sql` |
| 148 | `20260915132727_business_directory_category_filters.sql` | `supabase/migrations/20260915132727_business_directory_category_filters.sql` |
| 149 | `20260915133423_preserve_service_spreadsheet_order.sql` | `supabase/migrations/20260915133423_preserve_service_spreadsheet_order.sql` |
| 150 | `20260916204952_gcia_deepl_translation_governance.sql` | `supabase/migrations/20260916204952_gcia_deepl_translation_governance.sql` |
| 151 | `20260917185913_gcia_opt_in_memory.sql` | `supabase/migrations/20260917185913_gcia_opt_in_memory.sql` |
| 152 | `20260918024000_business_policy_editor_capacity.sql` | `supabase/migrations/20260918024000_business_policy_editor_capacity.sql` |
| 153 | `20260918031000_assistant_business_media_read.sql` | `supabase/migrations/20260918031000_assistant_business_media_read.sql` |
| 154 | `20260918033000_business_photo_details.sql` | `supabase/migrations/20260918033000_business_photo_details.sql` |
| 155 | `20260918040000_business_assistant_appearance.sql` | `supabase/migrations/20260918040000_business_assistant_appearance.sql` |
| 156 | `20260918050000_business_operating_books.sql` | `supabase/migrations/20260918050000_business_operating_books.sql` |
| 157 | `20260918060000_assistant_scoped_history.sql` | `supabase/migrations/20260918060000_assistant_scoped_history.sql` |
| 158 | `20260918072308_business_deposit_rules_and_protected_offers.sql` | `supabase/migrations/20260918072308_business_deposit_rules_and_protected_offers.sql` |
| 159 | `20260918091453_business_private_client_cards.sql` | `supabase/migrations/20260918091453_business_private_client_cards.sql` |
| 160 | `20260918101950_business_featured_services.sql` | `supabase/migrations/20260918101950_business_featured_services.sql` |
| 161 | `20260918112223_business_professional_service_assignments.sql` | `supabase/migrations/20260918112223_business_professional_service_assignments.sql` |
| 162 | `20260918122816_business_inventory_reconciliation.sql` | `supabase/migrations/20260918122816_business_inventory_reconciliation.sql` |
| 163 | `20260918131641_business_client_visit_links.sql` | `supabase/migrations/20260918131641_business_client_visit_links.sql` |
| 164 | `20260918142356_business_review_reply_revisions.sql` | `supabase/migrations/20260918142356_business_review_reply_revisions.sql` |
| 165 | `20260918150923_booking_conversation_window.sql` | `supabase/migrations/20260918150923_booking_conversation_window.sql` |
| 166 | `20260918160921_booking_professional_substitution.sql` | `supabase/migrations/20260918160921_booking_professional_substitution.sql` |
| 167 | `20260918165227_booking_reminder_schedule_revisions.sql` | `supabase/migrations/20260918165227_booking_reminder_schedule_revisions.sql` |
| 168 | `20260918173101_business_customer_communication_preferences.sql` | `supabase/migrations/20260918173101_business_customer_communication_preferences.sql` |
| 169 | `20260918193727_business_post_visit_followups.sql` | `supabase/migrations/20260918193727_business_post_visit_followups.sql` |
| 170 | `20260918213511_subscription_recorded_price_terms.sql` | `supabase/migrations/20260918213511_subscription_recorded_price_terms.sql` |
| 171 | `20260918223254_business_appointment_waitlist.sql` | `supabase/migrations/20260918223254_business_appointment_waitlist.sql` |
| 172 | `20260918234416_business_google_profile_connections.sql` | `supabase/migrations/20260918234416_business_google_profile_connections.sql` |
| 173 | `20260919015517_subscription_payment_method_update_attempts.sql` | `supabase/migrations/20260919015517_subscription_payment_method_update_attempts.sql` |
| 174 | `20260919023609_business_onboarding_reviewed_drafts.sql` | `supabase/migrations/20260919023609_business_onboarding_reviewed_drafts.sql` |
| 175 | `20260919033712_business_marketing_publication.sql` | `supabase/migrations/20260919033712_business_marketing_publication.sql` |
| 176 | `20260919043012_business_referral_campaigns.sql` | `supabase/migrations/20260919043012_business_referral_campaigns.sql` |
| 177 | `20260919052000_assistant_manual_service_receipts.sql` | `supabase/migrations/20260919052000_assistant_manual_service_receipts.sql` |
| 178 | `20260919052907_subscription_payment_schedule_guards.sql` | `supabase/migrations/20260919052907_subscription_payment_schedule_guards.sql` |
| 179 | `20260919063800_assistant_outstanding_balances.sql` | `supabase/migrations/20260919063800_assistant_outstanding_balances.sql` |
| 180 | `20260919084221_assistant_booking_reschedule.sql` | `supabase/migrations/20260919084221_assistant_booking_reschedule.sql` |
| 181 | `20260919084558_business_customer_campaigns.sql` | `supabase/migrations/20260919084558_business_customer_campaigns.sql` |
| 182 | `20260919100831_business_rebooking_advice.sql` | `supabase/migrations/20260919100831_business_rebooking_advice.sql` |
| 183 | `20260919101239_business_service_contribution_reviews.sql` | `supabase/migrations/20260919101239_business_service_contribution_reviews.sql` |
| 184 | `20260919134856_instagram_onboarding_import.sql` | `supabase/migrations/20260919134856_instagram_onboarding_import.sql` |
| 185 | `20260919134859_assistant_profile_settings_read.sql` | `supabase/migrations/20260919134859_assistant_profile_settings_read.sql` |
| 186 | `20260919143452_assistant_authoritative_money_reads.sql` | `supabase/migrations/20260919143452_assistant_authoritative_money_reads.sql` |
| 187 | `20260919144513_subscription_payment_explicit_phase_intent.sql` | `supabase/migrations/20260919144513_subscription_payment_explicit_phase_intent.sql` |
| 188 | `20260919181855_business_reusable_replies.sql` | `supabase/migrations/20260919181855_business_reusable_replies.sql` |
| 189 | `20260923040827_master_build_independent_plans.sql` | `supabase/migrations/20260923040827_master_build_independent_plans.sql` |
| 190 | `20260923042512_master_build_application_progress.sql` | `supabase/migrations/20260923042512_master_build_application_progress.sql` |
| 191 | `20260923044755_master_build_location_privacy.sql` | `supabase/migrations/20260923044755_master_build_location_privacy.sql` |
| 192 | `20260923053234_master_build_location_controls.sql` | `supabase/migrations/20260923053234_master_build_location_controls.sql` |
| 193 | `20260923060736_master_build_agent_configuration.sql` | `supabase/migrations/20260923060736_master_build_agent_configuration.sql` |
| 194 | `20260923064718_master_build_demo_workspace.sql` | `supabase/migrations/20260923064718_master_build_demo_workspace.sql` |
| 195 | `20260923075422_master_build_assistant_professional_archive.sql` | `supabase/migrations/20260923075422_master_build_assistant_professional_archive.sql` |
| 196 | `20260923090918_master_build_mobile_booking.sql` | `supabase/migrations/20260923090918_master_build_mobile_booking.sql` |
| 197 | `20260923094752_master_build_assistant_active_task.sql` | `supabase/migrations/20260923094752_master_build_assistant_active_task.sql` |
| 198 | `20260923105941_master_build_assistant_booking_catalog_binding.sql` | `supabase/migrations/20260923105941_master_build_assistant_booking_catalog_binding.sql` |
| 199 | `20260923111939_master_build_growth_controls.sql` | `supabase/migrations/20260923111939_master_build_growth_controls.sql` |
| 200 | `20260923115408_master_build_assistant_finance_records.sql` | `supabase/migrations/20260923115408_master_build_assistant_finance_records.sql` |
| 201 | `20260923123443_master_build_booking_reports.sql` | `supabase/migrations/20260923123443_master_build_booking_reports.sql` |
| 202 | `20260923125900_master_build_rebooking_reminders.sql` | `supabase/migrations/20260923125900_master_build_rebooking_reminders.sql` |
| 203 | `20260923132437_master_build_google_setup_help.sql` | `supabase/migrations/20260923132437_master_build_google_setup_help.sql` |
| 204 | `20260923134319_master_build_advertising_benefits.sql` | `supabase/migrations/20260923134319_master_build_advertising_benefits.sql` |
| 205 | `20260923143708_master_build_assistant_operations.sql` | `supabase/migrations/20260923143708_master_build_assistant_operations.sql` |
| 206 | `20260923160500_master_build_solo_team_transition.sql` | `supabase/migrations/20260923160500_master_build_solo_team_transition.sql` |
| 207 | `20260923161002_master_build_assistant_catalog_actions.sql` | `supabase/migrations/20260923161002_master_build_assistant_catalog_actions.sql` |
| 208 | `20260923164532_master_build_assistant_settings.sql` | `supabase/migrations/20260923164532_master_build_assistant_settings.sql` |
| 209 | `20260923171728_master_build_assistant_team.sql` | `supabase/migrations/20260923171728_master_build_assistant_team.sql` |
| 210 | `20260923180819_master_build_assistant_fulfillment.sql` | `supabase/migrations/20260923180819_master_build_assistant_fulfillment.sql` |
| 211 | `20260923183729_master_build_assistant_workspace_settings.sql` | `supabase/migrations/20260923183729_master_build_assistant_workspace_settings.sql` |
| 212 | `20260923190049_master_build_assistant_service_options.sql` | `supabase/migrations/20260923190049_master_build_assistant_service_options.sql` |
| 213 | `20260923191632_master_build_assistant_booking_progress.sql` | `supabase/migrations/20260923191632_master_build_assistant_booking_progress.sql` |
| 214 | `20260923195937_master_build_assistant_photo_upload.sql` | `supabase/migrations/20260923195937_master_build_assistant_photo_upload.sql` |
| 215 | `20260923203222_master_build_assistant_marketing.sql` | `supabase/migrations/20260923203222_master_build_assistant_marketing.sql` |
| 216 | `20260923212146_master_build_assistant_waitlist.sql` | `supabase/migrations/20260923212146_master_build_assistant_waitlist.sql` |
| 217 | `20260924050655_private_demo_catalog_resilience.sql` | `supabase/migrations/20260924050655_private_demo_catalog_resilience.sql` |
| 218 | `20260924125427_private_demo_history_readback.sql` | `supabase/migrations/20260924125427_private_demo_history_readback.sql` |
| 219 | `20260924164000_private_business_presentation_history.sql` | `supabase/migrations/20260924164000_private_business_presentation_history.sql` |

## Protected values deliberately left outside Engine

- Supabase, Stripe, notification, Maps, AI-provider, signing and service-role credentials: deployment secrets; never sent to the browser or stored in public configuration.
- RLS policies, permission keys, database functions, booking overlap constraints and financial ledger invariants: reviewed engineering migrations; Engine shows status but cannot alter them.
- Stripe transaction history, invoices, refunds, completed bookings, disputes and audit/security events: immutable or retention-protected records; dedicated workflows change status or redact/anonymize eligible identity data.
- Arbitrary HTML, JavaScript, SQL and executable AI tools/prompts: intentionally unsupported. Engine uses bounded schemas, approved component variants, provider/model allowlists, human review and deterministic fallback.
- US-only legal/address/currency boundaries: changing country or currency requires reviewed payments, tax, identity, address and legal work rather than a casual setting.
