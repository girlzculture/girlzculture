# Operational monitoring route inventory

Generated: 2026-07-23. This inventory is enforced by `scripts/verify-operational-monitoring.mjs`; a route cannot be added without a classification and shared operational wrapper.

## Coverage rules

- **Protected:** unexpected failures and authentication/session failures create sanitized Engine events; expected permission denials remain ordinary 403 responses.
- **Provider-backed:** the same wrapper covers returned 5xx/unsafe 4xx/uncaught failures, while partial notification failures are captured at the provider call site.
- **Public/read-only:** expected input responses remain inline; unexpected 5xx and unsafe provider/database responses are monitored.
- **Expected-only:** ordinary validation, bot, rate-limit, login, and not-found outcomes are not incidents; unexpected failures are still monitored.
- Every Engine response reference is the occurrence reference persisted by `capture_platform_error`. Database deduplication groups fingerprint + environment + release while retaining occurrence references, counts, first occurrence, and last occurrence.
- Service-role Supabase clients use a monitored transport. This detects 5xx, authentication/session failures, RLS/permission failures, constraints, timeouts and network failures even when a legacy caller fails to inspect a returned `{ error }`. `PGRST116` no-row results remain ordinary expected outcomes.

## Next API routes

| Route | Methods | Classification | Coverage |
|---|---|---|---|
| `/api/admin/bookings/[id]` | GET, PATCH | protected | Covered |
| `/api/admin/bookings` | POST | protected | Covered |
| `/api/admin/content` | GET, PUT, DELETE | protected | Covered |
| `/api/admin/data` | GET | provider-backed | Covered |
| `/api/admin/engine/ai` | GET, PATCH, POST | provider-backed | Covered |
| `/api/admin/engine/config` | GET, PATCH, POST | protected | Covered |
| `/api/admin/engine/errors` | GET, PATCH | protected | Covered |
| `/api/admin/engine/lifecycle` | GET, PATCH | protected | Covered |
| `/api/admin/engine/media` | GET, PATCH | provider-backed | Covered |
| `/api/admin/engine/navigation` | GET, POST, PATCH | protected | Covered |
| `/api/admin/engine/notifications` | GET, PATCH | provider-backed | Covered |
| `/api/admin/engine/search` | GET, PATCH | protected | Covered |
| `/api/admin/engine/system-status` | GET | protected | Covered |
| `/api/admin/engine/translations` | GET, PATCH | protected | Covered |
| `/api/admin/featured-campaigns` | GET, POST | protected | Covered |
| `/api/admin/identity-conflicts` | GET, PATCH | protected | Covered |
| `/api/admin/identity-deletion` | GET, POST | protected | Covered |
| `/api/admin/inbox-counts` | GET | protected | Covered |
| `/api/admin/marketing` | GET, POST, DELETE | protected | Covered |
| `/api/admin/promo-codes` | GET, POST, PATCH | protected | Covered |
| `/api/admin/records` | GET, POST | protected | Covered |
| `/api/admin/salons/[id]` | GET, POST | protected | Covered |
| `/api/admin/salons/reconcile` | GET, POST | protected | Covered |
| `/api/admin/salons` | GET | protected | Covered |
| `/api/admin/submissions/[id]/decision` | POST | provider-backed | Covered |
| `/api/admin/submissions/[id]` | GET | provider-backed | Covered |
| `/api/admin/support/[id]/read` | PATCH | provider-backed | Covered |
| `/api/admin/support/[id]/respond` | POST | provider-backed | Covered |
| `/api/admin/team` | GET, POST, PATCH, DELETE | provider-backed | Covered |
| `/api/admin/test-data` | GET, POST | protected | Covered |
| `/api/admin/trending-campaigns` | GET, POST | protected | Covered |
| `/api/admin/verify` | POST | protected | Covered |
| `/api/auth/destination` | POST | protected | Covered |
| `/api/auth/login/start` | POST | expected-only | Covered |
| `/api/auth/login/verify` | POST | expected-only | Covered |
| `/api/auth/mfa/settings` | GET, POST | protected | Covered |
| `/api/auth/password-reset/complete` | POST | provider-backed | Covered |
| `/api/auth/password-reset/request` | POST | provider-backed | Covered |
| `/api/auth/password-reset/verify` | POST | provider-backed | Covered |
| `/api/auth/signup` | POST | expected-only | Covered |
| `/api/booking-availability` | GET | public/read-only | Covered |
| `/api/bookings/notify` | POST | protected | Covered |
| `/api/bookings/reminders` | POST | provider-backed | Covered |
| `/api/complaints` | GET, POST | provider-backed | Covered |
| `/api/concierge/search` | POST | provider-backed | Covered |
| `/api/config` | GET | public/read-only | Covered |
| `/api/customer/favorites` | POST, DELETE | protected | Covered |
| `/api/discovery/availability` | POST | expected-only | Covered |
| `/api/discovery/featured` | GET | public/read-only | Covered |
| `/api/discovery/salons` | GET | public/read-only | Covered |
| `/api/discovery/trending` | GET | public/read-only | Covered |
| `/api/guest/bookings/manage` | GET, POST | provider-backed | Covered |
| `/api/guest/bookings/recovery/request` | POST | provider-backed | Covered |
| `/api/guest/bookings/recovery/verify` | POST | provider-backed | Covered |
| `/api/i18n/preference` | POST | protected | Covered |
| `/api/i18n` | GET | public/read-only | Covered |
| `/api/location/geocode-salon` | POST | provider-backed | Covered |
| `/api/location/resolve` | GET | public/read-only | Covered |
| `/api/media/cleanup` | POST | provider-backed | Covered |
| `/api/media/upload` | GET, POST, DELETE | provider-backed | Covered |
| `/api/messages` | GET, POST | provider-backed | Covered |
| `/api/monitor/client-provider` | POST | provider-backed | Covered |
| `/api/newsletter` | POST | expected-only | Covered |
| `/api/promo/validate` | POST | expected-only | Covered |
| `/api/promotions/salon` | GET | public/read-only | Covered |
| `/api/push/subscription` | GET, POST, DELETE | provider-backed | Covered |
| `/api/salon/application` | POST | provider-backed | Covered |
| `/api/salon/availability/block` | POST, DELETE | protected | Covered |
| `/api/salon/bookings/[id]/cancel` | POST | provider-backed | Covered |
| `/api/salon/bookings/[id]/reschedule` | GET, POST | provider-backed | Covered |
| `/api/salon/bootstrap` | POST | protected | Covered |
| `/api/salon/discovery-diagnostics` | GET | protected | Covered |
| `/api/salon/lifecycle` | GET, POST | protected | Covered |
| `/api/salon/onboarding` | GET, POST | protected | Covered |
| `/api/salon/open-status` | POST | protected | Covered |
| `/api/salon/profile` | GET, PATCH | protected | Covered |
| `/api/salon/records` | GET, POST | protected | Covered |
| `/api/salon/records/save` | POST | protected | Covered |
| `/api/salon/team` | GET, POST, PATCH, DELETE | protected | Covered |
| `/api/salon/workspace` | GET | protected | Covered |
| `/api/search/suggestions` | GET | public/read-only | Covered |
| `/api/stripe/booking-checkout` | POST | provider-backed | Covered |
| `/api/stripe/booking-status` | GET | provider-backed | Covered |
| `/api/stripe/portal` | POST | provider-backed | Covered |
| `/api/stripe/subscription/change` | POST | provider-backed | Covered |
| `/api/stripe/subscription/checkout` | POST | provider-backed | Covered |
| `/api/stripe/subscription/lifecycle` | POST | provider-backed | Covered |
| `/api/stripe/webhook` | POST | provider-backed | Covered |
| `/api/support` | POST | provider-backed | Covered |

## Netlify functions

| Function | Classification | Coverage |
|---|---|---|
| `booking-reminders.mjs` | provider-backed/system | Covered by `monitoredNetlifyFailure`; upstream bodies are never echoed |
| `media-cleanup.mjs` | provider-backed/system | Covered by `monitoredNetlifyFailure`; upstream bodies are never echoed |

## Server actions

No Next.js server actions (files containing a top-level `use server` directive) exist in this repository. All protected mutations are API routes and are inventoried above.

## Provider-backed operation groups

| Group | Entry points | Monitoring behavior |
|---|---|---|
| Supabase database/RLS | All API routes through shared wrapper | Returned 5xx, unsafe 4xx, and uncaught failures become sanitized Engine events |
| Supabase Auth/session | Auth, admin, salon, customer routes | Protected 401/session failures create low-severity Engine events; expected 403 denials do not |
| Supabase Storage/media | `/api/media/*`, signed application media, cleanup function | Route/function events include release, environment, operation and safe record identifiers |
| Booking/availability | availability, admin booking, salon cancellation/blocking, checkout | Unexpected overlap/query/provider failures are monitored; normal unavailable slots remain 409 responses |
| Stripe | checkout, portal, subscription lifecycle/change, webhook | Provider failures and 5xx responses are monitored; invalid webhook signatures remain expected 400 responses |
| OpenAI/AI | concierge and Engine AI sandbox | Timeout/provider/5xx failures are monitored; normal clarification/fallback is not an incident |
| Email/SMS/push | messages, complaints, booking notifications, support, applications | Route failures are monitored; partial delivery failures create Engine references returned as warnings where a user request still succeeds |
| Geocoding | salon address/application flows | Provider failures are monitored while intentionally deferred geocoding is recorded without exposing provider payloads |
| Scheduled Netlify work | booking reminders and media cleanup | Function wrapper persists sanitized events and returns the same reference in body/header |

## Audited server/provider operation entry points

| Entry point | Operation | Classification | Coverage |
|---|---|---|---|
| `src/lib/supabaseAdmin.ts` | service-role database/Auth/Storage transport, Resend, Twilio, booking notification delivery and reminders | provider-backed/protected | Monitored transport catches ignored provider results; delivery failures are sanitized and warning references are returned to the protected route |
| `src/lib/stripeServer.ts` | Stripe requests and webhook signature verification | provider-backed | Provider bodies/messages are never thrown; status-only failures flow through the protected route wrapper |
| `src/lib/beautyConciergeServer.ts` | OpenAI intent extraction, AI usage accounting, discovery and availability enrichment | provider-backed/public | OpenAI and secondary availability failures create Engine events; deterministic fallback responses include the same warning references |
| `src/lib/aiAutomationServer.ts` | governed AI sandbox and usage accounting | provider-backed/protected | Every database result is checked; unexpected failures flow through `/api/admin/engine/ai` |
| `src/lib/webPushServer.ts` | Web Push delivery, subscription revocation and reachability | provider-backed | Provider bodies are not retained; non-expiry failures create sanitized Engine events and returned warning references |
| `src/lib/geocodingServer.ts` | Google geocoding and salon location persistence | provider-backed/protected | Provider failures use status-only codes; every database write/read is checked and the route returns the matching reference |
| `src/lib/teamInvite.ts` | Supabase Auth admin invitations and identity audit | provider-backed/protected | Invitation provider failure is not disguised as validation; it flows through the admin/salon team wrapper |
| `src/lib/secureLoginServer.ts` | role verification, login-attempt audit and MFA challenge/delivery | provider-backed/protected | Auth/session/database/delivery failures fail safely through monitored auth routes; expected invalid credentials/codes remain ordinary responses |
| `src/lib/identityServer.ts` | canonical identity lookup and security audit | provider-backed/protected | Audit writes and Auth lookup errors are checked and flow through the invoking protected route |
| `src/lib/identityDeletionServer.ts` | dependency audit and Supabase Auth deletion | provider-backed/protected | Dependency/RPC/Auth failures are checked and flow through the invoking protected route |
| `src/lib/promoCodes.ts` | promotion lookup, usage count and atomic reservation | provider-backed | Known business-rule outcomes remain inline; unknown database failures retain only a safe code and are monitored |
| `src/lib/engineConfigServer.ts` | published Engine configuration reads | provider-backed/read-only | Failure creates a sanitized Engine event before integrity-safe defaults are used |
| `src/lib/content.ts` | published content, navigation and blog reads | public/read-only | Failure creates a sanitized Engine event before the safe public fallback/empty state is used |
| `src/lib/publicPageMonitoring.ts` | server-rendered public discovery/catalog/content fallbacks | public/read-only | Unexpected database/provider failures create sanitized Engine events; raw errors are never written by page components |
| `src/lib/discoveryServer.ts` | service resolution and ranked nearby discovery | provider-backed/public | Main failures fail safely; secondary service-resolution failures produce warning references through the route context |
| `src/lib/bookingAvailabilityServer.ts` | booking, hold, customer-overlap and blockout reads | provider-backed | Service-role monitored transport covers every query, including legacy result objects, and booking routes expose matching references |
| `src/lib/bookingRescheduleServer.ts` | customer-approved proposal validation, secure access delivery and multi-channel notifications | provider-backed/protected | Authoritative availability is rechecked before the service-only proposal RPC; partial delivery failures create sanitized Engine references without undoing the saved proposal |
| `src/lib/guestBookingAccess.ts` | signed booking access, token rotation, recovery verification and access audit | provider-backed/guest | Tokens are scoped, hashed, expiring and revocable; expected invalid/expired responses remain inline while database and delivery failures create sanitized Engine events |
| `src/lib/supabase.ts` | browser role-scoped sessions and direct Supabase transport | provider-backed/client | Unexpected RLS/session/storage/database responses are replaced with safe text containing the exact reference returned by `/api/monitor/client-provider`; expected auth/validation/no-row outcomes pass through unchanged |
| `src/app/api/monitor/client-provider/route.ts` | rate-limited sanitized client-provider bridge | provider-backed | Accepts only status, safe code, allowlisted provider, operation and page path; persists no provider body, query, token, cookie or user-entered content and returns the event reference |

The repository contains no other direct server provider adapters. Source inventory scans cover `fetch`, Supabase RPC/Auth/Storage operations, Stripe, OpenAI, Resend, Twilio, Web Push and Netlify functions. Client-only fetches receive safe API responses and are not allowed to persist Engine events directly.

## Data minimization

Monitoring stores UUID/account identifiers only when verified or safely parsed, plus feature/action, route, environment, release, provider label, status/code, and sanitized technical context. It excludes authorization headers, cookies, passwords, tokens, API keys, card data, CVC, full provider payloads, email addresses, phone numbers, and arbitrary request bodies.

## Verification evidence

`npm run verify:monitoring` executes behavior assertions for expected 400/403/404/429 outcomes, protected authentication/session failures, database/RLS, booking/availability, storage, Stripe, OpenAI, notification, client-provider bridge behavior, provider-response transport classification, reference parity, warning parity, recursive secret/contact redaction and Netlify function behavior. It also enforces the complete route/method/classification inventory and provider-entry-point table. Type checking, lint, the existing repository verification matrix and a production build are run separately before handoff.
