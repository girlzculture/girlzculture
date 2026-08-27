# Girlz Culture Workstream 0 — Known Risks

**Baseline:** `52af829ae8934a6607c32e1372c55d9f846d2d1b`  
**Rule:** No secret values, full card data or unnecessary personal information are included.

## Risk posture

The repository has strong migration, RLS, authentication, media and monitoring foundations. The highest risks arise where the implemented behavior conflicts with an unresolved business model or where fixture/static verification is being used in place of provider-backed acceptance.

The risk register below separates launch blockers from later scaling dependencies. “Launch blocker” refers to the affected feature scope: product commerce can be blocked while a controlled appointment-only pilot proceeds, for example.

## Critical
### PAY-001 — Immediate Stripe Checkout destination-transfer behavior does not implement the required uncaptured authorization and 30-minute capture model.

| Field | Detail |
|---|---|
| Category | Financial and payment |
| Likelihood | High |
| Affected users/systems | Customers, salons, bookings, refunds |
| Exact evidence | `src/app/api/stripe/booking-checkout/route.ts`; `src/lib/stripeServer.ts`; handoff Workstream 5 |
| Failure/exploitation scenario | A customer is charged/captured immediately or cancellation/refund behavior differs from the promised grace period. |
| Existing mitigation | Webhook verification, idempotent checkout hold, cancellation/refund foundations. |
| Required remediation | Approve one Stripe architecture; implement the state machine; test with connected test accounts. |
| Launch blocker | Yes |
| Professional/founder review | Founder + payments/legal/accounting |

### PAY-002 — Destination transfers coexist with a separate Admin salon-transfer/payout workflow.

| Field | Detail |
|---|---|
| Category | Financial and payment |
| Likelihood | Medium |
| Affected users/systems | Salons, finance ledger, connected accounts |
| Exact evidence | Booking checkout destination transfer; `salon_payout_attempts`; Admin booking payout route |
| Failure/exploitation scenario | The same economic amount could be transferred twice or the UI could misstate what has been paid. |
| Existing mitigation | Booking-specific payout idempotency and source-charge evidence. |
| Required remediation | Prove mutual exclusivity or remove one path after architecture approval. |
| Launch blocker | Yes |
| Professional/founder review | Payments/accounting |

### COM-001 — Product commerce can operate before merchant-of-record, sales-tax, shipping, returns, chargeback and commission rules are approved.

| Field | Detail |
|---|---|
| Category | Tax/legal/financial |
| Likelihood | High |
| Affected users/systems | Customers, salon sellers, Girlz Culture |
| Exact evidence | `src/lib/commerceCheckoutServer.ts`; commerce routes/migrations; `STRIPE_TAX_ENABLED` |
| Failure/exploitation scenario | Untaxed or incorrectly taxed sales, unclear refund liability, or unsupported fulfillment disputes. |
| Existing mitigation | Inventory/order/refund foundations and optional Stripe Tax. |
| Required remediation | Keep product commerce disabled; obtain tax/legal decisions; implement isolated provider tests. |
| Launch blocker | Yes for product commerce |
| Professional/founder review | Tax professional + legal + founder |

### SUB-001 — Subscription plan names, prices, entitlements and Stripe env names conflict.

| Field | Detail |
|---|---|
| Category | Financial/data integrity |
| Likelihood | High |
| Affected users/systems | Salons, billing, public plan page |
| Exact evidence | `src/lib/plans.ts`; `.env.example`; subscription routes |
| Failure/exploitation scenario | A salon could buy the wrong plan, price or entitlement. |
| Existing mitigation | Real Stripe Billing/Portal/change mechanics. |
| Required remediation | Freeze sales; approve a database-backed plan model and matching Stripe products/prices. |
| Launch blocker | Yes for subscription billing |
| Professional/founder review | Founder + legal/payments |

## High
### REL-001 — `main` is unprotected and has no required status checks although it deploys production.

| Field | Detail |
|---|---|
| Category | Release/reliability |
| Likelihood | High |
| Affected users/systems | Production application/database |
| Exact evidence | GitHub branch metadata at baseline |
| Failure/exploitation scenario | A direct push or unverified merge can deploy broken or unsafe code. |
| Existing mitigation | CI workflows exist and are currently green. |
| Required remediation | Enable branch protection, required checks, review and restricted direct pushes. |
| Launch blocker | Yes |
| Professional/founder review | Founder/repository administrator |

### ENV-001 — No dedicated provider-backed staging environment was verified.

| Field | Detail |
|---|---|
| Category | Reliability/testing |
| Likelihood | High |
| Affected users/systems | All critical flows |
| Exact evidence | Supabase Preview skipped; acceptance harness uses fixture; Netlify production branch is main |
| Failure/exploitation scenario | Provider/configuration defects appear only in production. |
| Existing mitigation | Deploy previews and local fixture acceptance exist. |
| Required remediation | Create isolated Supabase/Netlify staging with test provider accounts. |
| Launch blocker | Yes |
| Professional/founder review | Founder + engineering |

### SMS-001 — Twilio sender variable name differs between runtime and `.env.example`.

| Field | Detail |
|---|---|
| Category | Reliability/configuration |
| Likelihood | High |
| Affected users/systems | SMS recipients |
| Exact evidence | Runtime `TWILIO_PHONE_NUMBER`; example `TWILIO_FROM_NUMBER` |
| Failure/exploitation scenario | SMS silently reports skipped and customers/salons miss critical messages. |
| Existing mitigation | Sender returns skipped rather than throwing for missing configuration. |
| Required remediation | Standardize name, validate at startup and persist skipped delivery as an operational failure. |
| Launch blocker | Yes if SMS is promised |
| Professional/founder review | Engineering + provider owner |

### SEC-001 — Rate limiting uses process-local memory in a serverless deployment.

| Field | Detail |
|---|---|
| Category | Security/abuse |
| Likelihood | High |
| Affected users/systems | Public auth, support, complaint, discovery and write routes |
| Exact evidence | `src/lib/requestSecurity.ts` |
| Failure/exploitation scenario | Requests distributed across instances bypass limits; restarts clear counters. |
| Existing mitigation | Per-route limits and validation exist. |
| Required remediation | Use a shared durable rate limiter and add abuse tests. |
| Launch blocker | Yes for broad public launch |
| Professional/founder review | Security/engineering |

### EVT-001 — Important events are fragmented across many feature-specific tables without a versioned domain-event contract.

| Field | Detail |
|---|---|
| Category | Data integrity/operations |
| Likelihood | High |
| Affected users/systems | Support, analytics, disputes, AI operations |
| Exact evidence | Multiple audit/event tables; no `domain_events`, version or correlation contract |
| Failure/exploitation scenario | Timelines cannot be reconstructed consistently; automation double-processes or misses actions. |
| Existing mitigation | Many domain audits contain useful facts. |
| Required remediation | Define event dictionary and transactional outbox; preserve existing history. |
| Launch blocker | Yes for AI/advanced support, not necessarily first pilot |
| Professional/founder review | Data/Analytics + engineering |

### LEG-001 — Versioned customer/partner policy acceptance, appeals and strike enforcement are incomplete.

| Field | Detail |
|---|---|
| Category | Legal/trust |
| Likelihood | High |
| Affected users/systems | Customers, salons, support |
| Exact evidence | Legal/content pages and support routes; no policy-version acceptance/appeal/strike system found |
| Failure/exploitation scenario | Refund or enforcement decisions lack a provable accepted policy version. |
| Existing mitigation | Complaint/support/audit foundations. |
| Required remediation | Legal approval followed by versioned acceptance and case/enforcement workflow. |
| Launch blocker | Yes |
| Professional/founder review | Legal + founder + Trust/Support |

### MAP-001 — Google Maps/Places production provider acceptance is unverified and a current provider test was skipped.

| Field | Detail |
|---|---|
| Category | Reliability/customer experience |
| Likelihood | Medium |
| Affected users/systems | Discovery and salon location |
| Exact evidence | Google map loader; Playwright skipped provider test; prior provider-rejection history |
| Failure/exploitation scenario | Map/autocomplete fails for real customers or uses fallback without clear operator visibility. |
| Existing mitigation | Bounded retry, explicit errors, approximate/manual location fallback. |
| Required remediation | Fix/verify key restrictions and run provider-backed staging/mobile tests. |
| Launch blocker | Yes if map is required |
| Professional/founder review | Google Cloud account owner |

### BAK-001 — No current tested database backup/restore procedure was verified.

| Field | Detail |
|---|---|
| Category | Data integrity/recovery |
| Likelihood | Medium |
| Affected users/systems | All production data |
| Exact evidence | Documentation searches and deployment audit |
| Failure/exploitation scenario | A bad migration or incident cannot be recovered within an approved objective. |
| Existing mitigation | Safe migrations and Netlify deploy history. |
| Required remediation | Document RPO/RTO, perform non-production restore drill and record evidence. |
| Launch blocker | Yes |
| Professional/founder review | Founder + Supabase owner |

### MSG-001 — Booking conversation lacks complete support-access records, attachment policy, formal action timeline and export.

| Field | Detail |
|---|---|
| Category | Privacy/support |
| Likelihood | Medium |
| Affected users/systems | Customers, salons, support |
| Exact evidence | `src/app/api/messages/route.ts`; booking message migrations |
| Failure/exploitation scenario | Staff access is not fully auditable; dispute evidence is incomplete. |
| Existing mitigation | Participant checks, read state, moderation and translation preview. |
| Required remediation | Add canonical conversation aggregate, access reasons, export and retention policy. |
| Launch blocker | Yes before claiming monitored chat |
| Professional/founder review | Legal/privacy + Trust/Support |

### AUTH-001 — Message Admin access uses a feature-specific check rather than the canonical Admin permission guard.

| Field | Detail |
|---|---|
| Category | Authorization |
| Likelihood | Medium |
| Affected users/systems | Booking messages |
| Exact evidence | Message route versus `requireAdminPermission` |
| Failure/exploitation scenario | An inconsistent Admin status/permission edge case could expose a conversation. |
| Existing mitigation | Database participant/RLS checks and Admin rows. |
| Required remediation | Consolidate on canonical guard and add non-super-admin permission tests. |
| Launch blocker | Potentially |
| Professional/founder review | Security/engineering |

## Medium
### I18N-001 — The locale registry suggests broad support, but complete translated interface coverage is limited.

| Field | Detail |
|---|---|
| Category | Accessibility/operations |
| Likelihood | High |
| Affected users/systems | Non-English customers and salon owners |
| Exact evidence | `src/i18n/catalog.ts`; localization migrations/verifiers |
| Failure/exploitation scenario | Essential English appears in onboarding, billing, support or policies. |
| Existing mitigation | Four bundled locales, version/review schema and fallback. |
| Required remediation | Measure route coverage; finish and professionally review French before expanding. |
| Launch blocker | No for English-only pilot; yes before multilingual promise |
| Professional/founder review | Localization reviewers + legal |

### MON-001 — Incident export/filter/recovery is narrower than the handoff.

| Field | Detail |
|---|---|
| Category | Operations |
| Likelihood | High |
| Affected users/systems | Platform Admin/engineering |
| Exact evidence | `src/app/api/admin/engine/errors/route.ts` |
| Failure/exploitation scenario | Operators cannot filter by every needed dimension or replay failed work safely. |
| Existing mitigation | Strong CSV/JSON redaction, audit, assignment and occurrence data. |
| Required remediation | Add explicit filters, bundles, duplicate linking, replay and failed-job controls. |
| Launch blocker | No for small pilot if manual response exists |
| Professional/founder review | Operations + engineering |

### TEST-001 — Many verification scripts assert source patterns rather than executing behavior.

| Field | Detail |
|---|---|
| Category | Testing/quality |
| Likelihood | High |
| Affected users/systems | Engineering/release |
| Exact evidence | `scripts/verify-*.mjs`; no conventional unit framework/coverage |
| Failure/exploitation scenario | Code can satisfy a regex while runtime/provider behavior is wrong. |
| Existing mitigation | Clean DB and Playwright add real integration coverage. |
| Required remediation | Add focused unit/integration tests and coverage for critical state machines. |
| Launch blocker | Yes for high-risk payments |
| Professional/founder review | Engineering/QA |

### A11Y-001 — No comprehensive automated accessibility/contrast suite was verified.

| Field | Detail |
|---|---|
| Category | Accessibility |
| Likelihood | High |
| Affected users/systems | All users |
| Exact evidence | Playwright/focus tests; hardcoded text opacity; no axe dependency |
| Failure/exploitation scenario | Low-contrast text or semantic defects remain on untested pages. |
| Existing mitigation | Responsive browser tests and focus/error assertions. |
| Required remediation | Add semantic tokens, automated contrast/accessibility testing and manual review. |
| Launch blocker | No for internal pilot; should block public accessibility claim |
| Professional/founder review | Product/UX + accessibility reviewer |

### ATTR-001 — First-touch, last-non-direct, UTM/referral/QR attribution and confidence are incomplete.

| Field | Detail |
|---|---|
| Category | Reporting/privacy |
| Likelihood | High |
| Affected users/systems | Salons, marketing, Admin |
| Exact evidence | Repository searches; finance/booking tables |
| Failure/exploitation scenario | Girlz Culture overclaims acquired customers or reports misleading ROAS. |
| Existing mitigation | Booking/campaign basics and some metrics. |
| Required remediation | Define touchpoint/event model and reconcile reports before publishing claims. |
| Launch blocker | No for transaction pilot |
| Professional/founder review | Data/Analytics + privacy |

### ADS-001 — Featured/Trending campaigns are Admin-controlled, not a complete self-service inventory marketplace.

| Field | Detail |
|---|---|
| Category | Financial/advertising |
| Likelihood | High |
| Affected users/systems | Salons, marketing, customers |
| Exact evidence | Featured/trending routes/tables; no reservation/purchase workflow |
| Failure/exploitation scenario | Manual overselling, unfair share of voice or misleading reporting. |
| Existing mitigation | Eligibility, scheduling, audit and sponsored surfaces exist. |
| Required remediation | Keep Admin-controlled pilot; design inventory/capacity/payment/reporting. |
| Launch blocker | No for controlled Admin campaigns |
| Professional/founder review | Marketing + legal + founder |

### COHORT-001 — Founding cohort, waitlist and demand-gap dashboard are missing.

| Field | Detail |
|---|---|
| Category | Operations |
| Likelihood | High |
| Affected users/systems | Founder, Salon Operations |
| Exact evidence | No cohort/waitlist objects found |
| Failure/exploitation scenario | Launch scaling decisions rely on spreadsheets/memory. |
| Existing mitigation | Individual readiness and overview metrics. |
| Required remediation | Build after trust/payment core using real pilot data. |
| Launch blocker | No for first few salons |
| Professional/founder review | Founder + Operations |

### REPO-001 — Bundled Git binaries/archive and many stale branches/documents increase repository size and ambiguity.

| Field | Detail |
|---|---|
| Category | Maintainability/security |
| Likelihood | High |
| Affected users/systems | Engineering/CI |
| Exact evidence | `.tools/git/`; `git.zip`; branch list; historical docs |
| Failure/exploitation scenario | Clones/builds slow, outdated code/docs are mistaken for current truth, binary supply-chain exposure persists. |
| Existing mitigation | Current release gate ignores most non-product files. |
| Required remediation | After audit, verify references and remove/archive safely in a dedicated cleanup. |
| Launch blocker | No |
| Professional/founder review | Engineering/repository administrator |

### CFG-001 — Provider configuration is distributed and not startup-validated as one contract.

| Field | Detail |
|---|---|
| Category | Configuration/reliability |
| Likelihood | High |
| Affected users/systems | All integrations |
| Exact evidence | `.env.example`, runtime helpers, Netlify metadata |
| Failure/exploitation scenario | Missing/mismatched values cause silent skips or runtime-only failures. |
| Existing mitigation | System status route and provider checks exist. |
| Required remediation | Create typed config validation and environment-specific readiness report. |
| Launch blocker | Yes for promised provider channels |
| Professional/founder review | Engineering + provider owners |

### ROLL-001 — Netlify rollback capability exists but an end-to-end application/database rollback drill is not evidenced.

| Field | Detail |
|---|---|
| Category | Release/recovery |
| Likelihood | Medium |
| Affected users/systems | Production |
| Exact evidence | Netlify deploy history; docs search |
| Failure/exploitation scenario | A frontend rollback does not reverse incompatible database changes. |
| Existing mitigation | Migration workflow and deploy history. |
| Required remediation | Define forward-fix vs rollback policy and perform staging drill. |
| Launch blocker | Yes |
| Professional/founder review | Engineering + database owner |

## Low
### PERF-001 — No dedicated performance/load thresholds were verified; CI reports missing build cache.

| Field | Detail |
|---|---|
| Category | Performance |
| Likelihood | Medium |
| Affected users/systems | Mobile users and CI |
| Exact evidence | Release logs |
| Failure/exploitation scenario | Slow pages, provider calls or CI can degrade at launch. |
| Existing mitigation | Next build and responsive browser tests pass. |
| Required remediation | Add Web Vitals/load targets and enable safe build caching. |
| Launch blocker | No for controlled pilot |
| Professional/founder review | Engineering/Product |

### DEP-001 — Deprecated transitive packages and lint warnings remain despite zero known vulnerabilities.

| Field | Detail |
|---|---|
| Category | Maintainability |
| Likelihood | High |
| Affected users/systems | Engineering |
| Exact evidence | npm ci and ESLint output |
| Failure/exploitation scenario | Future upgrades become harder; warnings hide new issues. |
| Existing mitigation | Pinned versions/overrides and clean vulnerability audit. |
| Required remediation | Schedule dependency and warning cleanup without destabilizing launch. |
| Launch blocker | No |
| Professional/founder review | Engineering |



## Risk summary by category

| Category group | Main risks |
|---|---|
| Security and tenant isolation | Process-local rate limiting, inconsistent message Admin guard, unprotected `main` |
| Privacy | Conversation access/export/retention gaps, consent and policy acceptance gaps |
| Financial/payment | Immediate capture vs grace model, overlapping transfer paths, subscription mismatch |
| Tax/legal | Product MOR/tax/returns, policy enforceability, advertising/consent |
| Data integrity | Fragmented events, recovery/backup, attribution |
| Reliability | No provider-backed staging, Google/SMS config, incomplete DLQ/replay |
| Accessibility | No complete semantic color/contrast/accessibility gate |
| Operational | Missing cohort, incident recovery controls, repository ambiguity |

## Launch-blocking subset

### Appointment-booking pilot

- PAY-001 and PAY-002
- REL-001
- ENV-001
- SMS-001 when SMS is part of the customer promise
- LEG-001
- MAP-001 when map/autocomplete is required
- BAK-001
- CFG-001
- ROLL-001

### Subscription billing

- SUB-001
- provider-backed Stripe Billing acceptance
- final pricing, grandfathering and entitlement approval

### Product commerce

- COM-001
- product tax/fulfillment/returns/legal decisions
- isolated product payment and support tests

### Self-service advertising

- ADS-001
- sponsored/editorial policy, inventory/capacity and payment approval
- attribution/reporting foundation
