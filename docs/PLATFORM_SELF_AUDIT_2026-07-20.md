# Girlz Culture platform self-audit

Audit date: 2026-07-20  
Branch: `codex/owner-linking-visual-foundation`  
Scope: identity, admin security, salon discovery, lifecycle, media, localization, numeric inputs, Engine governance, record lifecycle, identity deletion, test data, and live configuration consumers.

This inventory distinguishes code that exists in the repository from database migrations, deployment configuration, and live verification. A migration file in Git is not evidence that the migration has been applied to Supabase.

## Implementation ledger

| Section | Commit | Delivered scope |
| --- | --- | --- |
| 1 | `1b6ee6e` | Canonical platform identity and single-role destination enforcement. |
| 2 | `fce54fa` | Company-domain admin invitation, verification, MFA, and protection controls. |
| 3 | `2b37413` | Admin salon query/filter/result integrity and defensive collection handling. |
| 4 | `c9bc789` | Salon lifecycle, setup gates, activation, suspension, restoration, offboarding, and visibility diagnostics. |
| 5–6 | `776f5d3` | Governed service search, suggestions, geocoding, location persistence, and discovery. |
| 7 | `ca7478b` | Unified governed image/media workflow and storage ownership registry. |
| 8 | `f71658c` | Locale foundation, translation publishing, persistence, and safe fallback. |
| 9 | `ed44f34` | Shared numeric input behavior and server validation audit. |
| 10 | `a530c0a` | The Engine control center, 17 categories, draft/publish/history, and secret-safe status. |
| 11 | `98fed89` | Dependency-aware create/edit/archive/delete/reassign record lifecycle. |
| 12 | `a6d7adb` | Protected auth identity deletion/anonymization and normalized email reuse. |
| 13 | `2d50fa8` | Explicit test batches, dry-run preview, protected history, and safe cleanup. |
| 14 | `bebf01d` | Engine values connected to live homepage, booking, catalog, support, media, brand, and notification behavior. |
| 15 | `16bb585` | Engine environment isolation, import/export, optimistic concurrency, affected surfaces, and emergency recovery. |
| 14 reminder delivery | `e8c7ddb` | Idempotent governed booking reminders and Netlify scheduled execution. |
| 16 | `5319e71` | Concrete page/dashboard/configuration self-audit and deployment inventory. |

Section 17 test evidence is maintained in `docs/PLATFORM_TEST_MATRIX_2026-07-20.md`.

## 1. Configuration surfaces made admin-manageable

The main UI is Admin > Engine (`/admin/engine`), implemented by `src/components/admin/EngineControlCenter.tsx`. Access requires the admin `settings` permission; publishing security, booking, billing, or safety-impact settings follows the high-impact confirmation rules. Super-admin and recent MFA are required for emergency recovery and destructive maintenance actions.

| Engine category | Settings or managed records | Live consumers |
| --- | --- | --- |
| General & Branding | `branding.primary_color`, `branding.cta_color` | `src/app/layout.tsx` sets validated CSS variables used by Tailwind theme tokens platform-wide. |
| Identity, Roles & Admin Security | MFA policy/status; allowed admin domain is displayed as secure environment status | Login/verification APIs and `src/lib/adminSecurityServer.ts`; secrets/domain remain deployment configuration. |
| Salon Onboarding & Activation | `salon.activation_mode`, `salon.eligibility_grace_days`, `salon.setup_requirements` | lifecycle functions and diagnostics in migrations `20260720130000` and admin salon detail/API. |
| Booking Rules & Availability | `booking.default_buffer_minutes`, `booking.deposit_percentage`, `booking.minimum_lead_minutes`, `booking.maximum_advance_days`, `booking.client_notes_max_length` | salon structured service editor, booking page/wizard, Stripe checkout route. |
| Payments, Deposits & Plans | plan display names/copy/features through `subscription_plans`; deposit percentage through Engine | plans page, feature gates, Stripe subscription/booking APIs. Stripe Price IDs and secrets remain environment-only. |
| Service Catalog & Option Lists | categories/groups/master styles/add-ons plus `catalog.size_options`, `catalog.length_options`, `catalog.material_options`, `catalog.material_quality_grades`, `catalog.material_longevity_weeks`, `catalog.included_items`, `catalog.business_types` | Admin Content Management catalog editors, salon application, salon style editor, public salon/booking data. Stylist specialties use the master-style catalog rather than a duplicate list. |
| Search, Keywords & Synonyms | `search_synonyms`, service keywords, phrases, stop words, ranking boosts | `/api/search/suggestions`, homepage autocomplete, Browse/Search navigation. |
| Location, Markets & Discovery | `location_markets`, `search.default_radius_miles`, `location.country_codes` (currently restricted to `US`) | geocoding, homepage/search discovery, admin salon filters and diagnostics. |
| Homepage & Page Composition | content page sections/cards plus `homepage.nearby_card_count`, `homepage.featured_card_count`, `homepage.trending_card_count` | homepage server query and placement components. Campaign scheduling/radius/weights remain in dedicated campaign editors. |
| Content, FAQs & Legal | `content_pages`, `blog_posts`, homepage section cards, `content.faq_search_enabled` | dynamic editorial routes, `/help`, `/blog`, `/blog/[slug]`, `/[page]`, and public content-section renderer. |
| Badges, Verification & Trust | `trust.verified_label` and CMS trust copy | public salon profile and cards; factual verification state remains derived from salon records. |
| Notifications & Templates | `notifications.channels`, confirmation/cancellation/reminder subjects, `notifications.booking_reminder_hours` | `src/lib/supabaseAdmin.ts`, `/api/bookings/notify`, `/api/bookings/reminders`, scheduled Netlify worker. Sender identities and credentials remain environment-only. |
| Languages & Translations | supported locale records and `translation_entries` with Draft/Reviewed/Published states | global locale provider, `/api/i18n`, language selector, translation manager. English is the fixed integrity-safe fallback. |
| Media Rules & Dimensions | `media_upload_profiles`, `media.public_image_quality` | `/api/media/upload`, `src/components/ImageUpload.tsx`, browser optimizer. Trending-video constraints use the dedicated campaign flow. |
| Quality, Cancellations & Support | `quality.cancellation_threshold_percent`, complaint reasons, cancellation reasons, support categories/statuses | owner quality warning, complaint/contact forms, salon cancellation API, admin support inbox/response. |
| Test Data & Maintenance | explicit test batches/types; preview and execute controls | `/api/admin/test-data`, Engine maintenance panel, `safe_execute_test_data_batch`. |
| Configuration History & Publishing | draft/publish, affected surfaces, versions, rollback, import/export, emergency last-known-good recovery | Engine UI/API and Engine SQL functions. |

### Page-by-page public/customer inventory

| Route | Data/configuration source and behavior |
| --- | --- |
| `/` | CMS page/sections plus governed nearby/featured/trending counts, location state, ranked real salon data, public trust labels, newsletter API. |
| `/styles` | active master catalog and real salon counts; cards link to `/salons?style=...`. |
| `/salons`, `/search` | discovery API, normalized search/synonyms, selected coordinates/radius, subscription/lifecycle visibility, sorting/pagination. |
| `/salon/[slug]` | live salon, style/material, stylist, product, review, hours, verification and visibility data; governed verified label. |
| `/salon/[slug]/book` | availability, lead/advance limits, deposit percent, notes limit, selected style/stylist/date; Stripe checkout. |
| `/salon/[slug]/product/[productId]` | visible salon product linked to its eligible public salon. |
| `/salon/[slug]/stylist/[stylistId]` | active stylist linked to its eligible public salon. |
| `/login`, `/forgot-password`, `/reset-password` | canonical identity and protected password-reset APIs. |
| `/account` | canonical customer identity, bookings, reviews, favorites, messages; database-backed tabs. |
| `/review/[bookingId]` | completed-booking authorization, ratings, review text and governed review-image upload. |
| `/about`, `/press`, `/testimonials`, `/help`, `/how-it-works`, `/partner`, `/plans`, `/[page]` | editable content pages and content-section cards. Help FAQ search is governed. Plans read plan records. |
| `/blog`, `/blog/[slug]` | published `blog_posts`; admin changes go live after save/publish. |
| `/contact`, `/complaint` | governed categories/reasons, sanitization, rate limits/honeypot, support inbox persistence. |
| `/featured`, `/trending` | eligible, time/radius constrained, audited campaign records and real linked salons. |
| `/social` | official social URLs from deployment configuration; missing channels stay hidden. |
| `/offline` | PWA offline fallback. |
| `/careers` | code retained but navigation/footer link intentionally hidden. |

### Salon-owner inventory

| Route/section | Managed behavior |
| --- | --- |
| `/salon/signup`, `/salon/apply`, `/salon/application-submitted`, `/pending` | canonical signup; Engine business types; application persistence; lifecycle-aware pending redirect. Initial application does not duplicate media collection. |
| `/salon/login` | separate storage namespace for salon session; canonical role destination check. |
| `/salon/onboarding` | setup checklist derived from governed lifecycle gates; required logo/cover/gallery and business data are collected here. |
| Dashboard Overview | real booking/review/profile metrics; governed cancellation quality threshold and lifecycle/subscription notices. |
| My Page / Photos | salon details, structured US address and geocoding; logo/cover/gallery unified uploads with consent. |
| Styles & Pricing | master catalog, structured size/length/material/longevity/quality/included choices, prices/durations, service media. |
| Stylists | active stylist profiles, master-style specialties, availability, avatar and portfolio media. |
| Products | product create/edit/archive, price and public visibility, unified product media. |
| Availability & Calendar | hours, slot/buffer settings, per-stylist availability, blockouts, conflict-aware bookings. |
| Bookings / Messages | real booking records, audited cancellation reasons, private booking messages, mandatory notifications. |
| Reviews | booking-based reviews and salon replies. |
| Earnings & Payouts / Subscription | Stripe Connect/subscription state, ledger-safe history, owner-only billing. Team users inherit the salon subscription without seeing billing. |
| Promotions | plan-gated salon promotions; higher-tier features enforced server-side. |
| Settings & Team | profile notification settings, unified add-user form, roles/permissions, revoke/remove workflow. |

### Platform-admin inventory

`/admin/[section]` exposes Overview, Submissions, Salons, Customers, Bookings, Quality & Performance, Reviews, Payments & Finance, Marketing & Promotions, Content Management, Customer Support, Complaints, Subscriptions, Engine, and Settings & Team. `permissionForSection`/`AdminShell` in `src/components/AdminDashboard.tsx` and `requireAdminPermission` in `src/lib/supabaseAdmin.ts` gate sections and sensitive APIs. Missing collections pass through the dashboard `rows(value)` guard so absent API arrays become empty arrays rather than a `.map` crash.

Admin-specific managed surfaces include submission decisions, salon lifecycle and diagnostics, customer records, booking edits/cancellation, quality thresholds, review moderation, financial read models, promo codes, Featured/Trending campaigns, CMS/pages/blog/catalog/media, support responses, subscription records, Engine publishing, identity conflicts/deletion, test batches, and authorized admin invitations/permissions.

## 2. Hardcoded values moved into Engine

The following previously hardcoded business values now have governed published settings and live consumers:

- Brand primary and CTA colors.
- Salon activation mode, setup requirements, and eligibility grace days.
- Booking default buffer, deposit percentage, minimum lead time, maximum advance window, and client-notes length.
- Nearby, Featured, and Trending homepage card counts.
- Search default radius and search synonym/alias/phrase/ranking/stop-word records.
- US business-type choices for applications.
- Salon service size, length, material, material longevity, material quality, and included-item choices.
- Complaint reasons, salon cancellation reasons, support request categories, support ticket statuses, and salon cancellation-review threshold.
- FAQ search enabled state and verified-salon label.
- Enabled transactional notification channels and confirmation/cancellation/reminder subjects.
- Booking reminder timing, now consumed by the scheduled reminder worker.
- Public image JPEG quality; placement dimensions remain editable as media-profile records.
- Supported language records and editable translation entries.
- Public homepage/CMS copy, page sections, links, images, blog posts, legal placeholders, FAQs, and testimonials.

## 3. Hardcoded values intentionally not moved

| Value | Location | Reason |
| --- | --- | --- |
| Supabase URLs/keys and service role | environment variables and server modules | Credentials and trust roots must never be browser-editable. |
| Stripe secret/webhook keys and Price IDs | environment variables | Financial credentials and immutable Stripe object identities require provider-side control. Display plan content is editable, but existing financial history is never rewritten. |
| Admin allowed email domain | `ADMIN_EMAIL_DOMAIN` | Lockout/security boundary. Engine shows safe status only; changing it requires verified domain ownership and deployment review. |
| MFA/password reset/identity signing secrets | server environment | Authentication integrity. |
| Resend, Twilio, VAPID, Google Maps server credentials | server environment | Provider secrets. Engine exposes only Configured/Not configured status. |
| Public Google Maps browser key and map ID | deployment environment | Must be referrer/API restricted in Google Cloud; not content. |
| US-only phone, state and ZIP validation | validation libraries | Current market and payment/legal/address rules are US-only. `location.country_codes` is constrained to `US`; another country requires code, tax, payments, and legal readiness. |
| USD as the only supported transaction currency | plans/Stripe and validation | Multi-currency requires new Stripe Prices, tax and ledger work. Engine validation currently permits only USD. |
| English as fallback locale | i18n catalog/provider | Prevents raw translation keys and unsafe missing legal/payment copy. Additional published languages fall back to English. |
| Booking overlap constraints and terminal statuses | booking migrations/APIs | Database integrity and financial history cannot be weakened through casual configuration. |
| RLS policies, role names, permission keys | migrations/server authorization | Security boundaries require reviewed code/migrations. |
| Upload MIME allowlists and absolute 12 MB original safety ceiling | media server/client | Browser/storage security and memory protection. Per-placement dimensions/output sizes and JPEG quality are manageable. |
| Rate-limit implementation and absolute defensive ceilings | `requestSecurity` and APIs | Attack-control ceilings remain code/server controls; operational MFA values are environment-configurable. |
| Generated public error wording for authorization/database failures | server APIs | Avoids data disclosure. Editorial help/empty-state copy can use CMS or translations; security errors remain reviewed code. |
| Trending video browser capabilities | `videoUploadClient`/campaign editor | MP4/WebM, duration and safe compression depend on browser support; arbitrary transcoding/trim is not claimed. A managed transcoding provider is needed for broader formats. |

## 4. Record types and permitted lifecycle operations

All generic admin operations use `/api/admin/records`, typed confirmation, reason, server permission checks, dependency inspection and `record_management_events`. Dedicated flows remain authoritative where listed.

| Record type | Create/edit | Archive/deactivate | Delete/reassign/anonymize/cancel |
| --- | --- | --- | --- |
| Service category | Content Management | Yes | Delete only without dependents; groups/add-ons/styles are counted first. |
| Service group | Content Management | Yes | Delete or reassign master styles through transactional catalog RPC. |
| Service add-on | Content Management | Yes | Delete when eligible. |
| Master service/style | Content Management | Yes | Archive/delete/reassign; linked salon services block unsafe deletion. |
| Salon application | application/admin submission flow | Rejection is retained as archive-equivalent | Hard delete not offered; decision history is required. |
| Salon | application/onboarding/admin salon flow | Suspend/restore/offboard | Hard delete not offered because bookings/subscriptions/ledger may exist. |
| Stylist | salon/admin editor | Yes if booking history | Hard delete only without bookings; team links inspected. |
| Salon service | salon/admin editor | Yes if booking history | Hard delete only without bookings; material options handled. |
| Product | salon editor | Hide/archive | Delete allowed from generic admin flow if eligible. |
| Salon promotion | salon/marketing flow | Pause/archive | Delete allowed when eligible. |
| Promo code | admin marketing | Archive | Delete only without redemptions. |
| Customer | signup/account/admin | N/A | Protected identity deletion anonymizes retained records and removes auth when eligible. |
| Salon team member | salon settings | Suspend/revoke | Protected identity deletion; linked stylist ownership handled. |
| Admin user | admin Settings & Team invitation/edit | Suspend/revoke | Protected deletion; cannot delete self or last active super-admin. |
| Booking | checkout/admin | Terminal history retained | Cancel through booking-specific flow; completed/previously cancelled records cannot be erased. |
| Review | completed-booking review/admin moderation | Archive/unpublish | Hard deletion is not offered because moderation/booking evidence is retained. |
| Complaint/support ticket | intake/admin support | Close/archive | History retained; responses and verification evidence remain auditable. |
| Featured/Trending campaign | admin marketing | Pause/draft | Media cleanup only when ownership/reference safety permits. |
| Blog post | Content Management | Draft/archive | Delete via dependency-safe catalog RPC. |
| Content/homepage/legal/FAQ/testimonial page | Content Management | Draft/archive | No casual hard delete; public route contracts are preserved. |
| Location market | Engine/market editor | Archive | Delete only when no salons are assigned; reassign first. |
| Newsletter subscriber | public form/admin management | Unsubscribe/archive | Delete permitted for eligible marketing-only record. |
| Engine setting/translation/media profile | Engine typed editors | Draft/unpublish where supported | Version rollback, not destructive history deletion. |
| Financial ledger, invoice, refund, subscription event, audit/security event | provider/webhook/read-only admin views | Status/lifecycle through dedicated APIs | Never hard deleted or rewritten. |

## 5. Unsupported operations and reasons

- Salons, applications with decisions, bookings, payments, refunds, subscription events, notification logs, complaints, moderation history, and audit/security events do not expose casual hard delete because they are operational, legal, safety, or financial evidence.
- Customers, salon owners, team members, and admins are not deleted from generic record management. `/api/admin/identity-deletion` performs a recent-MFA, dependency-aware anonymization/auth-removal workflow.
- Acting admin and last active super-admin cannot be suspended or deleted.
- A salon owner with active subscription/booking history is offboarded rather than cascade-deleted.
- Content route records are archived instead of deleting the route contract.
- Shared or attached media is archived/referenced; only an owner-controlled staged orphan is physically removed immediately.
- Existing Stripe invoices/paid periods are immutable. Plan changes use new/current Stripe Prices and webhook lifecycle events.
- Video trimming and arbitrary-codec transcoding are not implemented in-browser. Current campaign video accepts MP4/WebM, validates <=30 seconds, attempts safe WebM compression where supported, previews, retries/cleans failed uploads, and never autoplays with sound.

## 6. Authentication/signup/login/invitation paths audited

| Path | Canonical behavior |
| --- | --- |
| Customer signup (`/login` -> `/api/auth/signup`) | normalizes email; reserves a single `platform_identity`; one primary role; generic conflict response; server-created auth identity. |
| Salon signup/application (`/salon/signup`, `/salon/apply`) | canonical salon-owner identity; duplicate cross-role email blocked; application and owner link use auth user ID, not email matching. |
| Customer/salon/admin login (`/api/auth/login/start`, `/verify`) | role destination is resolved from canonical identity. Browser storage namespaces keep admin/salon/customer sessions independent. |
| Admin login (`/admin/login`) | exact `ADMIN_EMAIL_DOMAIN`, pre-authorized active/invited admin, verified email, password, configurable MFA/device verification and permissions. No public admin signup. |
| Admin invitation (`/api/admin/team`) | canonical identity reservation, normalized-email conflict check, invite/resend/revoke/suspend/reactivate/remove; self/last-super-admin protection. |
| Salon team invitation (`/api/salon/team`) | one-screen create with role/status/permissions; canonical identity; first-attempt creation is server-side; team inherits parent salon subscription and never sees billing. |
| Password reset (`/forgot-password`, `/reset-password`, reset APIs) | generic request response, signed short-lived code, attempt limits, reset for canonical auth user. |
| OAuth | No public OAuth provider flow is currently exposed. Therefore duplicate-role OAuth handling is not applicable until a provider is deliberately enabled. |
| Email change | No self-service email-change UI is exposed. Changing a canonical email requires a future protected identity migration workflow; direct disconnected edits are intentionally blocked. |
| Imported users | No bulk user import surface is exposed. Engine import explicitly imports non-secret configuration drafts only. |
| Duplicate remediation | Admin identity conflict queue inventories conflicts and offers explicit safe remediation; it does not auto-merge/delete. |

## 7. Media-upload surfaces

Unified image tool: `src/components/ImageUpload.tsx` + `src/lib/imageUpload.ts` + `/api/media/upload` + media profiles/registry/storage RLS.

| Surface | Placement/profile |
| --- | --- |
| Salon logo, cover, gallery | Owner My Page/Photos; square logo, safe-area cover, gallery/card profiles. |
| Stylist avatar and work portfolio | Structured Stylist editor; avatar and gallery profiles. |
| Service/style image gallery | Structured Styles & Pricing editor; service profile. |
| Product photo | Products editor; square product profile. |
| Review result photos | `ReviewForm`; completed-booking authorization; review profile. |
| CMS hero/background/section card/blog cover | `AdminContentManager`; content/card profiles. |
| Featured campaign creative | Reuses eligible salon imagery; campaign records reference real salon/media. |
| Trending campaign video | Dedicated `AdminTrendingCampaigns` workflow; MP4/WebM validation, <=30 seconds, optimization attempt, preview, storage cleanup and moderation. |

The initial salon application intentionally has no logo/gallery upload. Approved salons complete governed media requirements in onboarding/dashboard. Profile images for customer/admin team accounts are not currently user-uploadable; they are an exception, not a broken upload path. Poster-frame selection and browser-side trimming are not implemented; see section 5.

## 8. Numeric-input audit

- Global CSS removes browser spinners for every `input[type=number]`.
- `src/components/forms/NumericInput.tsx` preserves blank optional state, validates integer/decimal/min/max/negative rules and uses appropriate mobile input modes.
- Structured style prices/durations/options/materials, stylist experience, products, availability buffers, promotions, campaign radius/priority/weight/amounts, quality thresholds, Engine numeric values, booking options, admin booking amounts and plan editors were audited.
- Optional values use `""`/`null`, not forced zero. Existing legitimate stored zero is preserved.
- Phone, ZIP, IDs, confirmation codes, and payment-card data are not numeric inputs; phone/ZIP use text/tel with US validation to preserve formatting and leading zeros.
- Server routes repeat bounds and precision validation for money, percentages, durations, radii, counts and priorities. Client controls are not treated as authorization or integrity enforcement.

## 9. Localization coverage and exceptions

Foundation: `src/i18n/catalog.ts`, `LocaleProvider`, `LanguageSelector`, `/api/i18n`, `translation_entries`, Engine Translation Manager, locale cookie/local storage, `Intl` date/number/currency helpers, and English safe fallback. Supported locale records are English, Spanish, French and Wolof.

Current translated stable-key coverage includes global desktop/mobile public navigation, footer headings/copy, trust-strip labels/copy, shared language/common actions, and any published Engine translation entry consumed by a component key. CMS pages can store locale-specific published content through the translation manager.

Exception requiring continued editorial/component conversion: much of the long-form English copy and many form/dashboard labels in customer account, booking wizard, salon dashboard, admin dashboard, validation responses, and transactional email bodies are still direct source strings rather than `t(key)` consumers. They safely remain English and never expose raw keys, but this means full whole-platform translated operation is **not yet complete**. User-generated salon descriptions/reviews/messages are intentionally never auto-translated. Legal/payment/safety translations require human Reviewed/Published status.

## 10. Salon public-visibility gates

The single lifecycle evaluator requires and reports:

1. Application/approval state.
2. Lifecycle status (Pending, Approved, Ready for Activation, Active, Suspended, Offboarded).
3. Configured setup checklist items and exact completion percentage.
4. Required business name/contact/description/agreement fields.
5. Complete structured US address.
6. Successful precise geocoding or resolved address review.
7. Required logo/cover/gallery counts from Engine rules.
8. At least one valid active service with price/duration.
9. At least one active stylist or accepted sole-stylist state.
10. Store hours/availability.
11. Active eligible subscription and payout/policy requirements.
12. Explicit discoverability and temporary open/closed state.

Admin Salon detail/API explains every pass/fail gate in plain language. Auto-activation applies only when Engine mode allows and all gates pass. Manual mode enters Ready for Activation. Suspend hides the salon without deleting future/history records; restore reevaluates eligibility; offboard preserves bookings/financial history. `/pending` redirects based on current canonical lifecycle. Public discovery functions require eligibility, coordinates, radius and actual distance; missing coordinates never produce a false “near you” label.

## 11. Deployment, migrations, environment and live-test requirements

### Migration order for this pass

Apply in filename order after all earlier repository migrations. The new ordered range is:

1. `20260720100000_canonical_identity.sql`
2. `20260720110000_admin_identity_security.sql`
3. `20260720120000_admin_salon_result_integrity.sql`
4. `20260720130000_salon_lifecycle_engine.sql`
5. `20260720140000_search_language_engine.sql`
6. `20260720150000_unified_media_engine.sql`
7. `20260720160000_localization_engine.sql`
8. `20260720170000_platform_engine_governance.sql`
9. `20260720180000_record_lifecycle_management.sql`
10. `20260720190000_identity_deletion_and_reuse.sql`
11. `20260720200000_safe_test_data_batches.sql`
12. `20260720210000_platform_engine_governance_recovery.sql`
13. `20260720220000_booking_reminder_delivery.sql`

Do not skip migrations or run them out of order. They are code-complete in Git but were not applied from this local environment because no authorized Supabase database connection/CLI is available.

### Required server/deployment environment

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Identity/security: `ADMIN_EMAIL_DOMAIN` (confirmed live domain), `INTERNAL_API_SECRET`, `PASSWORD_RESET_SECRET`, `MFA_CODE_SECRET`, `ADMIN_MFA_MODE`; optional MFA timing overrides shown in `.env.example`.
- Stripe test mode: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, server-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASIC_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`.
- Transactional delivery: `RESEND_API_KEY`, `EMAIL_FROM_SECURITY`, `EMAIL_FROM_BOOKINGS`, `EMAIL_FROM_ACCOUNT`, `EMAIL_FROM_SUPPORT`; Twilio account/token/number; VAPID public/private/subject.
- Location: browser-restricted Maps key/map ID and server-only Geocoding key.
- Deployment/public: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ALLOW_INDEXING=false` until launch, optional official social URLs, `COMPLAINT_RATE_LIMIT_SALT`.

### External actions still required

- Apply migrations to the intended Supabase project and verify each row/function/policy.
- Confirm `ADMIN_EMAIL_DOMAIN=girlzculture.com` can receive mail before enforcing it in production.
- Configure and verify Resend sending domains, Twilio number, VAPID keys, Google APIs/restrictions, Stripe test products/Prices/webhook endpoint, and all Netlify environment variables.
- Netlify must deploy the scheduled `booking-reminders` function; confirm schedule invocations and delivery logs after deployment.
- Run authenticated live role tests with separate anonymous/customer/salon owner/salon team/limited-admin/super-admin sessions and real test fixtures.
- Verify RLS using anon/authenticated/service-role clients against the migrated Supabase project.
- Verify Stripe test checkout, lifecycle webhook, portal/change paths, deposit/refund/ledger behavior with Stripe test events.
- Confirm media storage buckets/policies and upload/replace/failure cleanup in the live project.
- Confirm Google geocoding/discovery with an actual test address and browser-permission denial/timeout cases.
- Run responsive/accessibility browser testing on physical or emulated mobile/tablet/desktop devices.
- Push branch, open/merge PR, deploy, and perform production-domain smoke verification. None of those external state changes are implied by local commits.

### Architecture findings

- The repository now has one canonical identity and role destination layer, but pre-existing production duplicates require the admin remediation queue; they must not be auto-merged.
- Engine configuration is deliberately split from transactional/provider configuration. Secret status is visible, secret values are not.
- Discovery and lifecycle are database-centered for consistency; migration application is therefore a deployment blocker for the new code paths.
- The current image pipeline is suitable for launch-scale images. Higher volume/video should move rendition/transcoding jobs to managed object storage/CDN/media processing without changing the `media_assets` ownership registry contract.
- Full translation coverage remains the largest product-completeness gap; the infrastructure and management workflow exist, but many components still contain direct English strings.
