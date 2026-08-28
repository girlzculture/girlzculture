# Girlz Culture Workstream 0 — Implementation Dependencies

**Baseline:** `52af829ae8934a6607c32e1372c55d9f846d2d1b`  
**Purpose:** Separate current blockers from decisions and inputs that belong to later phases. Engineering must not silently decide these matters.

## 1. Current blockers

| Dependency | Why it blocks current work | Owner/input required |
|---|---|---|
| Booking-deposit architecture | Current immediate Checkout/destination-transfer behavior conflicts with the required authorization/grace/capture model | Founder, Stripe/payments specialist, legal and accounting |
| One authoritative salon money-movement path | Destination transfer and manual payout workflows overlap | Payments/accounting + engineering |
| Protected production branch | `main` can change without required checks | Repository administrator/founder |
| Provider-backed staging | Stripe, Google Maps, email/SMS and push cannot be accepted safely through fixture-only tests | Founder/provider account owners + engineering |
| Legally reviewed cancellation/refund/customer-protection terms | Booking states and support outcomes need an accepted policy version | Legal + founder + Trust/Support |
| Notification configuration contract | Twilio variable-name mismatch and provider presence are unresolved | Engineering + Twilio/Resend owners |
| Tested backup/restore and rollback | Release cannot be safely recovered | Supabase/Netlify owner + engineering |
| Test identities and connected test salon | Critical role, payment, cancellation and payout workflows need safe test actors | Founder/Operations |

## 2. Founder decisions

The handoff reserves the following decisions:

1. Exact Starter, Growth and Premium entitlements.
2. Exact grandfathering wording.
3. Founding 15–20 salon free/discounted treatment.
4. Default deposit percentage.
5. Deposit dollar maximum.
6. Whether every service receives the same 30-minute grace.
7. Rescheduling windows.
8. Customer-care credit values.
9. Strike thresholds.
10. Salon cancellation threshold for advertising eligibility.
11. Initial advertising prices.
12. Sponsored capacity by surface.
13. Consecutive-week/cooldown rules.
14. Product limits by tier.
15. Language sequence after French.
16. Chat retention.
17. Evidence retention.
18. Whether chat opens at authorization or capture.
19. Whether salons choose cancellation policies within platform limits.
20. Product-commerce commission.
21. Optional payment of remaining service balance through Girlz Culture.
22. Support outcomes requiring founder/senior approval.

Additional founder decisions exposed by the current code:

- whether the launch subscription model remains the current Basic/Growth/Premium implementation or changes to the handoff’s Starter/Growth/Premium model;
- whether Admin complimentary placements can remain reason-free while retaining sufficient audit evidence;
- whether product and appointment items may share one customer checkout;
- whether first launch includes products, subscriptions or Admin-only promotions.

## 3. Legal review

Required before the associated production behavior is accepted:

- Customer Protection and Booking Policy.
- Salon Partner Standards and Enforcement Policy.
- Cancellation, rescheduling, lateness, no-show, price-change and refund language.
- Chat monitoring, staff access, attachment and retention disclosure.
- Evidence handling, law-enforcement handling and deletion rights.
- Messaging consent, opt-out, WhatsApp and quiet-hours rules.
- Advertising disclosure, creative rights and editorial separation.
- Subscription grandfathering, proration and fair-use language.
- Product seller, return, shipping, prohibited-category and marketplace terms.
- Translated contracts and policies.
- Privacy language for precise, approximate and saved location.

## 4. Payment architecture

### Appointment deposits

Must be decided and documented:

- Stripe Connect account type.
- Charge type: direct, destination, separate charge/transfer or another approved model.
- Merchant of record.
- Destination of authorization/capture funds.
- Whether and when an application fee exists; current business model says no service-booking commission.
- Refund and dispute responsibility.
- Negative connected-account balance handling.
- Whether manual salon payout exists at all when the booking charge already transfers funds.
- Authorization/capture eligibility and exact grace timer.
- Capture-failure and payment-update windows.
- Reconciliation source of truth.
- Accounting presentation and exports.

### Subscriptions

- Approved products/prices in Stripe.
- Database-backed plan/entitlement source.
- Proration, downgrade timing, cancellation and reactivation.
- Founding/grandfathered records.
- Failed-payment grace.
- Invoice/receipt retention.

### Product commerce

- Seller and merchant of record.
- Marketplace-facilitator/sales-tax obligations by jurisdiction.
- Stripe Tax configuration and product tax codes.
- Product commission, if any.
- Shipping/pickup ownership.
- Returns, refunds and chargebacks.
- Restricted product categories.
- Seller and platform support liability.

## 5. Tax review

Current blocker for product commerce:

- nexus and marketplace-facilitator analysis;
- seller vs platform tax responsibility;
- tax registrations;
- taxable product mapping;
- shipping tax treatment;
- refund tax adjustments;
- reporting and accounting exports.

No code or configuration should infer these decisions from `STRIPE_TAX_ENABLED`.

## 6. Translation review

Required human inputs:

- professional French;
- native Wolof;
- native Fulfulde/Fulani;
- legal translation;
- terminology glossary;
- cultural review;
- approval workflow and named reviewers;
- fallback and disputed-translation rules.

The current schema can store review/version data, but reviewer operations and full journey coverage are not complete.

## 7. Marketing inputs

Needed for advertising/social work:

- inventory by placement, geography, service, audience and date;
- pilot rates and plan discounts;
- capacity/share-of-voice/cooldown;
- creative specifications and rights declarations;
- moderation and correction rules;
- sponsored labels;
- editorial selection standards;
- social content calendar;
- tracked-link and attribution taxonomy;
- campaign reporting promises;
- ownership/access for Meta, Google, TikTok, YouTube, email and WhatsApp accounts.

## 8. Salon Operations inputs

Needed for service data and onboarding:

- textured-hair taxonomy;
- plain-language service examples;
- required vs optional fields by category;
- photo standards;
- real braider validation;
- first-salon data-entry support;
- identity and location verification procedure;
- Google Business Profile duplicate/claim/verification process;
- availability-maintenance training;
- test-booking and launch-readiness checklist;
- founding cohort criteria and onboarding capacity.

## 9. Customer Support and Trust inputs

Required:

- case categories and priorities;
- response deadlines;
- decision matrix;
- credit values;
- refund-authority thresholds;
- strike thresholds;
- escalation and appeal rules;
- evidence sufficiency standards;
- suspected fraud/abuse handling;
- staff conversation-access rules;
- safe replay and high-risk action approvals.

## 10. External credentials and third-party accounts

Names only; never values:

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

### Stripe

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- approved plan price IDs
- connected test and live salon accounts

### Email/SMS/push

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- one standardized Twilio sender variable
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

### Location/media

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_SERVER_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_NOTIFICATION_SECRET`

### Platform accounts

- Netlify site ownership
- GitHub repository administration
- Google Cloud/Maps
- Google Business Profile
- Meta/Instagram/WhatsApp
- TikTok
- YouTube

## 11. Data migration dependencies

Before later implementation:

- reconcile API-route and migration inventory counts through a local generated inventory;
- preserve production history and audit rows;
- map current booking/payment states to the approved future state model;
- map hardcoded plans and existing subscriptions to approved plan records;
- identify public sample/demo salons before removing or replacing data;
- add event/outbox data without deleting domain-specific audit history;
- define migration/rollback for policy acceptance, attribution and cohort data;
- create staging copies without exposing production personal information.

## 12. Test accounts

Minimum safe matrix:

| Account | Required capabilities |
|---|---|
| Customer | verified email, controlled phone, booking/payment/refund access |
| Salon owner | owns one test salon and test connected Stripe account |
| Salon team member | limited booking/catalog permissions |
| Stylist | linked to the test salon where supported |
| Support Admin | support/complaints only |
| Finance Admin | finance only |
| Marketing Admin | marketing only |
| Engine Admin | incident/system status only |
| Super Admin | high-risk override tests |
| Unauthorized identities | cross-tenant and route-denial tests |

Use separate browser profiles and non-production data.

## 13. Staging dependencies

A credible staging environment needs:

- separate Supabase project or branch;
- Netlify branch/staging deploy;
- Stripe test keys, webhook and connected test accounts;
- restricted Google Maps staging key;
- Resend/Twilio test or controlled recipients;
- isolated storage/media folders;
- non-production VAPID keys;
- sanitized seed data;
- provider callback URLs;
- release/environment identifiers;
- incident routing;
- database reset/restore procedure;
- explicit prohibition on real customer notifications and charges.

## 14. Technical sequencing dependencies

The repository should follow the handoff sequence:

1. Audit approval.
2. Readability/theme.
3. Roles/permissions reconciliation.
4. Canonical event/audit foundation.
5. Monitoring/export/recovery foundation.
6. Internationalization framework.
7. Staging/test reliability.
8. Structured service data.
9. Destination/radius/timezone.
10. Booking/slot locking.
11. Approved payment architecture and grace/capture.
12. Booking conversation.
13. refund/policy/dispute.
14. Onboarding/Google/social/attribution/cohort.
15. subscriptions.
16. advertising.
17. scale systems.
18. product commerce.

### Dependencies that must precede other work

- Event foundation precedes reliable attribution, AI operations and case evidence.
- Payment architecture precedes payment-state UI, policy promises and finance reporting.
- Policy decisions precede automated case decisions/strikes.
- Staging precedes provider acceptance.
- Plan decisions precede subscription migration.
- Tax/legal decisions precede product commerce.
- Attribution precedes ROAS and campaign-performance claims.
- Consent/preference foundation precedes WhatsApp and marketing messaging.

## Audit-review dependency before remediation

The hardened matrix is an evidence map, not automatic authorization to implement. Founder and domain owners must review unsafe, duplicated, missing and partial rows; specialists must review payments, tax, privacy, accessibility and legal rows; and engineering must re-trace cited symbols if `main` advances beyond `52af829ae8934a6607c32e1372c55d9f846d2d1b`. Implementation issues must link to the stable `Requirement_ID`.
