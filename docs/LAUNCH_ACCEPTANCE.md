# Girlz Culture pilot launch acceptance

This is the permanent acceptance contract for pilot-launch corrections. A green
build is necessary, but it is not proof that a customer, salon owner, or
platform administrator can complete a workflow.

## Evidence levels

- **Repository/build verification** — static type, lint, build, migration, and
  security assertions.
- **Automated fixture verification** — deterministic tests against fixtures or
  an isolated database.
- **Browser verification** — the affected page is opened at each required
  viewport and exercised through its visible controls.
- **Authenticated runtime verification** — a real test identity and session
  exercise the protected route, role, database state, and persistence boundary.
- **Provider verification** — a test-mode provider accepts and completes the
  operation.

Every item must be marked exactly one of:

- `PASS` — completed end to end with the required role and persistence check.
- `FAIL` — reproduced and still failing.
- `BLOCKED` — exact unavailable identity, credential, permission, integration,
  browser session, or environment is named.
- `AUTOMATED ONLY` — validated by an automated or fixture test but not the
  required live workflow.

## Required correction loop

1. Reproduce and record the original failure and reference.
2. Identify the actual failing operation and root cause.
3. Implement the smallest complete correction.
4. Run a focused permanent regression test.
5. Open the actual affected page.
6. Exercise the real workflow using the appropriate role.
7. Refresh and verify persisted state.
8. Verify logout/login and a second browser/device where persistence matters.
9. Test directly related pages, roles, and failure states.
10. Review the final diff independently and classify the evidence honestly.

## Pilot acceptance matrix

Current correction run: `codex/final-pilot-launch-stabilization`, 2026-07-27.

| Area | Required evidence | Status | Current evidence / remaining gate |
| --- | --- | --- | --- |
| Fresh platform-admin login and refresh | Browser + authenticated runtime | AUTOMATED ONLY | Session isolation, refresh, JSON auth failure, and retry behavior pass focused tests. A preview admin identity and signed-in browser session are still required for runtime acceptance. |
| Fresh salon-owner login and refresh | Browser + authenticated runtime | AUTOMATED ONLY | Role-scoped token migration, refresh coalescing, logout, and second-login behavior pass focused tests. A preview owner identity and signed-in browser session are still required. |
| Workspace and notifications without 403 | Authenticated runtime + Engine correlation | AUTOMATED ONLY | Workspace/notification JSON auth handling, bounded retry, Realtime cleanup, deduplication, and release correlation pass focused tests. A preview owner session is required to exercise the protected routes. |
| Application approval | Authenticated runtime + database persistence | AUTOMATED ONLY | Approval remains separate from billing/publication and its API regression suite passes. A preview application and admin identity are required for persisted runtime acceptance. |
| Subscription gate | Authenticated runtime, active and inactive states | AUTOMATED ONLY | Active/inactive and team-member inheritance logic pass lifecycle, billing, and authorization tests. Preview identities and test-mode Stripe state are required. |
| Normal activation | Authenticated runtime + lifecycle diagnostic | AUTOMATED ONLY | Exact publication gates, idempotent activation, lifecycle diagnostics, public filtering, and clean-database assertions are covered. A preview salon with completed gates is required. |
| Authorized admin override | Authenticated runtime + immutable audit | AUTOMATED ONLY | Required reason, actor, exact overridden gates, immutable audit, and no fabricated financial state pass focused migration/API tests. A preview admin and application are required. |
| Logo upload and hard refresh | Browser + authenticated runtime + storage/database | AUTOMATED ONLY | Direct signed upload, optimized variants, attachment transaction, JSON failure handling, and reload retrieval pass media tests. A preview owner/storage bucket is required. |
| Three gallery files in one selection retained | Browser + authenticated runtime + hard refresh | AUTOMATED ONLY | Multi-file queue, per-file progress, partial success, source retention, variants, and attachment pass media tests. A preview owner/storage bucket is required. |
| Cover photo retained | Browser + authenticated runtime + hard refresh | AUTOMATED ONLY | Direct upload and salon attachment pass focused tests. A preview owner/storage bucket is required. |
| Stylist profile and multi-file portfolio retained | Browser + authenticated runtime + hard refresh | AUTOMATED ONLY | Existing stylist attachment and staged new-stylist media behavior pass focused tests. A preview owner, stylist record, and storage bucket are required. |
| Service image retained | Browser + authenticated runtime + hard refresh | AUTOMATED ONLY | Existing service attachment and staged new-service media behavior pass focused tests. A preview owner, service record, and storage bucket are required. |
| Public salon page | Browser + anonymous runtime | AUTOMATED ONLY | Public eligibility, stable slug, draft filtering, and unavailable-state tests pass. A migrated preview with an eligible salon is required to open the real published record. |
| Public stylist page | Browser + anonymous runtime | AUTOMATED ONLY | Collision-safe stylist slugs and public child filtering pass focused tests. A migrated preview with an eligible stylist is required. |
| Nearby discovery after one permission grant | Browser + location persistence + anonymous runtime | AUTOMATED ONLY | Automated Chromium/mobile/tablet tests confirm one grant is reused across Home, Find Salons, and Browse Styles and denial is remembered. Precise location was not transmitted during manual browser review. |
| Correct distance on all discovery surfaces | Browser + database coordinates | AUTOMATED ONLY | Ranking, radius, coordinate, and location persistence tests pass; read-only production diagnosis confirmed the target coordinates. A migrated preview with an eligible target salon is required for browser acceptance. |
| Selected-salon financial ledger | Authenticated admin runtime + reconciliation | AUTOMATED ONLY | Selected-salon scoping, unified transaction types, statuses, and totals pass finance/reconciliation tests. A preview admin and representative financial fixtures are required. |
| Safe filtered CSV | Browser + formula-injection assertions | AUTOMATED ONLY | Selected-row export and spreadsheet formula escaping pass focused tests. A preview admin and representative ledger are required. |
| Mobile | Browser | PASS | In-app browser at 390x844 rendered Home and Find Salons without console warnings/errors; the responsive Playwright matrix also passed. |
| Tablet | Browser | AUTOMATED ONLY | Tablet Playwright coverage passes. A separate manual in-app tablet review was not performed in this correction run. |
| Tablet landscape | Browser | AUTOMATED ONLY | Tablet-landscape Playwright coverage passes. A separate manual in-app tablet-landscape review was not performed. |
| Desktop | Browser | PASS | In-app browser at 1440x1000 rendered Home, Find Salons, Browse Styles, and How It Works without console warnings/errors. |
| Mobile landscape | Browser | PASS | In-app browser at 844x390 rendered Home without console warnings/errors or horizontal document overflow (`scrollWidth 829 <= innerWidth 844`). |
| No HTML parsed as JSON | Success/failure route tests + browser | AUTOMATED ONLY | Shared safe response parsing and JSON-only protected-route failure tests pass; public manual browsing had no parse or console errors. Protected browser failure paths require preview sessions. |
| Exact UI/Engine reference correlation | Authenticated failure test + Engine lookup | AUTOMATED ONLY | Safe-error and monitoring regressions verify one reference across API/UI/Engine records. A preview authenticated failure and Engine lookup are still required. |
| No cross-salon data access | Two-salon authenticated RLS test | AUTOMATED ONLY | RLS/security and ownership assertions pass repository and migration tests. Two preview salon identities are required for runtime denial acceptance. |

Video transcoding is explicitly deferred for the pilot and must not block this
matrix.

## Mandatory automated gates

- TypeScript
- ESLint
- Production build
- Complete migration chain against a genuinely empty database
- Migration ordering
- RLS and security assertions
- Responsive browser suite
- Focused regressions for every corrected launch-critical defect

Automated gates must be reported as `AUTOMATED ONLY` until the corresponding
browser, authenticated-runtime, or provider workflow has also been exercised.

## Delivery guardrails

The correction branch may be pushed and a draft pull request opened. Do not
merge, publish production, apply production migrations, change production
providers, make real payments, delete production data, or modify unrelated
production records without explicit authorization. Production diagnostics are
read-only unless a separately authorized, clearly labeled test record is
required.
