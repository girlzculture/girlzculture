# Prelaunch marketplace safety

Status: **AUTOMATED ONLY — ten missing-flag browser checks and isolated registry assertions pass; hosted acceptance is unverified.**

The server launch gate is `CUSTOMER_MARKETPLACE_LIVE`. Only the exact string `true` enables the marketplace; missing/empty/false values fail closed. This branch does not change deployed environment variables or production configuration.

Public discovery, styles/salons, social discovery, the current public Concierge, public business profiles and direct customer booking/pickup entry points are gated. Public pages show truthful prelaunch presentation using Engine-managed `marketplace.prelaunch_title` and `marketplace.prelaunch_description`; owner/admin/signup/help/legal routes remain accessible. Customer pages remain noindex and robots requires both the existing indexing gate and marketplace launch. No SEO rollout or future-category launch is included.

## Private Platform Admin preview

An authenticated Platform Admin can choose **Preview marketplace** from the admin header. The protected API verifies the dedicated admin session, issues a signed, HTTP-only 30-minute preview grant, and opens the real customer homepage. The grant is audited, cannot be created by an anonymous visitor, and fails closed if its signature, lifetime, or server signing secret is invalid.

The preview grant opens only read-only customer pages and the GET/HEAD discovery, search, and salon data routes they need. Booking, pickup, guest-booking, Concierge POST, availability, promotion validation, and every Stripe route remain behind the public launch gate. The preview displays a persistent private-preview warning and an exit control. Public visitors without the signed grant continue to receive the prelaunch page.

The booking-checkout, commerce-checkout and pickup-reservation handlers each check the launch gate before database/provider access. Actual handler tests reproduce the formerly reachable boundary and assert 503 JSON with `CUSTOMER_MARKETPLACE_NOT_LIVE` and **zero Supabase or Stripe calls**. The flag is also checked at public routing/data boundaries; client presentation is not payment authorization.

With launch enabled in isolated acceptance only, `test_data_registry` remains authoritative for registered demo/test exclusion. `is_marketplace_visible` excludes registered salon entities, and direct public profile/checkout paths independently reject them. Lookup failure fails closed. A real non-test fixture may be visible only if all ordinary eligibility conditions also pass. The flag alone does not approve a business or bypass an active plan.

The SQL suite first makes an isolated business publication-eligible using the existing audited fixture override, asserts visibility, then registers that same business as test data. Its publication diagnostic remains eligible while marketplace visibility becomes false. All fixture changes roll back. No production record is classified or changed by these tests.

## Future activation checklist

Before separate founder-approved activation: finish the route/role/browser matrix, prove live-flag genuine-vs-registered-demo fixture behavior, validate the new additive migration on the assigned isolated environment, complete multilingual/Assistant/policy/message acceptance, and obtain provider/native review where required. Review truthful Engine copy and keep broad indexing off until the customer Concierge workstream is accepted. Production migration and deployment each require separate authorization; this PR does neither.
