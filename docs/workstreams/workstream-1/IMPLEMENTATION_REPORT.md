# Workstream 1 implementation report

## Continuity and scope

- Repository: `girlzculture/girlzculture`
- Verified starting `origin/main`: `22dd9b55ac417823a4a35e7d8fb14b9d970ccd7d`
- Branch: `codex/workstream-1-readability-accessibility`
- Final branch SHA: recorded in the Draft pull request and delivery report. A commit cannot contain its own resulting SHA; this document records the immutable starting point and the reviewed implementation scope.
- Workstream: WS01-001 through WS01-018 only—readability, semantic theme roles, visual states, accessibility, enforcement, evidence, and acceptance documentation.

The branch was created from the verified remote main commit in a separate clean worktree. The six historical Workstream 0 audit documents under `docs/audits/workstream-0/` were preserved unchanged. No retired audit branch was reused.

This work did **not** create or edit a migration, database object, price, deposit, refund rule, Stripe behavior, booking rule, search/advertising ranking, permission, authentication flow, provider configuration, policy meaning, notification delivery behavior, or production record. Workstreams 2–18 were not started.

## Original failures reproduced

Before implementation, the following baseline gaps were confirmed:

| Gap | Reproduction/evidence | Baseline result |
|---|---|---|
| Unapproved literal | `npm run verify:design-system` | Failed on `rgba(45,15,50,.04)` in `AdminContentManager.tsx`. |
| Utility bypass | Scanner fixture using `text-slate-600` | Existing verifier did not report it. |
| Footer contrast | Computed white-alpha colors on the then-current `#0083A6` teal | `text-white/45` = 2.03:1, `/55` = 2.35:1, `/60` = 2.52:1, `/65` = 2.73:1, `/70` = 2.93:1. |
| Direct accessibility runner | Package/script inventory | No Axe, Pa11y, Lighthouse-accessibility, or equivalent direct runner existed. |
| Placeholder vs entered value | Browser-test inventory | No test compared rendered placeholder and entered-value styles. |
| Disabled appearance/behavior | Browser-test and global-style inventory | No cross-control computed/behavioral contract; many controls relied on opacity. |
| Computed contrast | Browser-test inventory | No reusable effective foreground/background contrast helper or cross-surface assertions. |
| Shared state contract | Global/shared component inventory | Active, selected, inactive, disabled, unavailable, loading, completed, and error were not one semantic system. |

The reproduction findings are preserved here rather than rewriting the historical Workstream 0 audit.

## Architecture and design decisions

### Semantic content roles

Girlz Culture keeps its approved launch palette and existing Tailwind 4 architecture. Semantic content roles sit above brand aliases so text meaning remains stable when Engine theme values change.

| Role | CSS token / class | Approved default | Use |
|---|---|---:|---|
| Primary | `--gc-text-primary` / `.gc-text-primary` | Engine body (`#0D1114`) | Body copy, labels, values, instructions |
| Secondary | `--gc-text-secondary` / `.gc-text-secondary` | `color-mix(in srgb, var(--gc-body) 60%, var(--gc-muted))` | Supporting copy that remains distinct from primary and from muted metadata |
| Muted | `--gc-text-muted` / `.gc-text-muted` | `#52616A` | Genuine supplementary metadata |
| Placeholder | `--gc-text-placeholder` / `.gc-placeholder-light` | `#667681` | Empty input/textarea prompt only |
| Disabled | `--gc-text-disabled` / `.gc-disabled-control` | `#52616A` | Unavailable native/custom control label |
| On dark | `--gc-text-on-dark` / `.gc-text-on-dark` | `#FFFFFF` | Important content on dark surfaces |
| On-dark muted | `--gc-text-on-dark-muted` / `.gc-text-on-dark-muted` | `#F5F7F8` | Supporting content on dark surfaces |
| Link | `--gc-text-link` / `.gc-text-link` | `#006B88` | Text links on light surfaces |
| Danger | `--gc-text-danger` / `.gc-text-danger` | `#C83F4A` | Errors and destructive notices |
| Success | `--gc-text-success` / `.gc-text-success` | `#147D64` | Successful/completed outcomes |
| Warning | `--gc-text-warning` / `.gc-text-warning` | `#795516` | Warnings requiring attention |

The launch teal remains recognizable in the interface. Text-bearing strong surfaces use `#006B88`: white text is 6.07:1 and muted on-dark text is 5.65:1. Other static reference ratios are primary/page 18.96:1, muted/page 6.41:1, placeholder/page 4.69:1, success/page 5.06:1, danger/page 4.92:1, warning/page 6.72:1, and link/page 6.07:1.

### Shared visual-state strategy

The shared contract provides `gc-state-active`, `gc-state-selected`, `gc-state-inactive`, `gc-state-disabled`, `gc-state-unavailable`, `gc-state-loading`, `gc-state-completed`, and `gc-state-error`. Each state uses a visible text/semantic cue plus a distinct border weight/style or inset marker; color is not the only cue. Loading specifically uses the strong surface, a 3px double border, and a 5px inset accent marker together with `aria-busy`, the visible text “Loading availability…”, and the progress cursor. It does not claim or simulate determinate progress. Native controls retain `disabled`; custom controls retain `aria-disabled`, `aria-selected`, `aria-pressed`, `aria-expanded`, `aria-current`, or `aria-busy` as appropriate. Guarded handlers block pointer, Enter, Space, and scripted activation for unavailable controls.

The former broad disabled `!important` floor was narrowed to the explicit shared compatibility contract, allowing unavailable and loading controls to remain distinguishable while preserving native semantics.

### Placeholder, focus, and Engine themes

- Entered values use primary/control text; placeholders use semantic light or on-dark prompt roles at opacity 1.
- Native select prompts are explicitly styled as prompt state and change to primary on selection.
- Focus-visible covers native and custom interactive elements with a two-tone 3px inner plus white outer ring, providing a visible edge on light and dark surfaces.
- Engine persistence, draft, publication, import, rollback, permission, and history semantics remain unchanged.
- At render time, complete readable light and dark Engine palettes pass through unchanged. Legacy or unsafe partial published combinations are clamped to a coherent accessible surface group and readable text/action fallbacks.

### Static enforcement

`scripts/verify-launch-design-system.mjs` now calls a testable scanner module. It rejects legacy colors, unapproved hex/RGB/HSL, gray-family text utilities, arbitrary text colors, inline hardcoded foreground/background pairs, disconnected semantic roles, opacity-qualified on-dark text, prefixed placeholder/disabled opacity, direct status-family utilities, and problematic ordinary low-opacity text. The inventory is an exact ratchet: `intentional-visual-exceptions.json` records 307 reviewed per-file/token occurrence ceilings and 3 exact non-text visual-layer opacity exceptions. It is not a palette allowlist. A new file/token pair, an increased occurrence count, or an important-context opacity use fails verification.

Positive and negative fixtures exercise every rule and include stable violation codes and file/line/column locations.

## Files changed

The authoritative exact list is the Draft PR diff. It is grouped here for reviewer navigation; no file outside these categories is intentionally changed.

### Tokens, runtime theme, and non-DOM visual roles

- `src/app/globals.css`
- `src/lib/colorContrast.ts`
- `src/lib/engineConfigServer.ts`
- `src/lib/nonDomVisualTokens.mjs`
- `src/lib/supabaseAdmin.ts`
- `src/lib/bookingCommunications.ts`
- `src/lib/bookingRescheduleServer.ts`
- `src/app/api/salon/bookings/[id]/service/route.ts`

### Public and page surfaces

- `src/app/[page]/page.tsx`
- `src/app/about/page.tsx`
- `src/app/blog/page.tsx`
- `src/app/careers/page.tsx`
- `src/app/help/page.tsx`
- `src/app/legal/page.tsx`
- `src/app/plans/page.tsx`
- `src/app/press/page.tsx`
- `src/app/salon/[slug]/page.tsx`
- `src/app/salon/[slug]/product/[productId]/page.tsx`
- `src/app/salon/[slug]/stylist/[stylistId]/page.tsx`
- `src/app/salon/apply/page.tsx`
- `src/app/testimonials/page.tsx`
- `src/components/SalonStyles.tsx`
- `src/components/SearchClient.tsx`
- `src/components/public/BeautyConcierge.tsx`
- `src/components/public/ComplaintForm.tsx`
- `src/components/public/ContactSupportForm.tsx`
- `src/components/public/FeaturedSalonPlacement.tsx`
- `src/components/public/HelpCenter.tsx`
- `src/components/public/HomepagePromoRail.tsx`
- `src/components/public/MarketplaceSalonCard.tsx`
- `src/components/public/NearbySalonPlacement.tsx`
- `src/components/public/SalonDiscovery.tsx`
- `src/components/public/SalonPhotoGallery.tsx`
- `src/components/public/SalonRatingSummary.tsx`
- `src/components/public/TrendingVideoPlacement.tsx`
- `src/components/search/AutocompleteInputs.tsx`
- `src/components/search/GoogleSalonMap.tsx`
- `src/components/search/HeaderStyleSearch.tsx`
- `src/components/site/NewsletterForm.tsx`
- `src/components/site/PublicChrome.tsx`
- `src/components/site/PublicContentSections.tsx`
- `src/components/site/SearchComposer.tsx`

### Customer, booking, checkout, forms, and feedback

- `src/components/ActionToast.tsx`
- `src/components/BookingInbox.tsx`
- `src/components/CustomerAccount.tsx`
- `src/components/CustomerAuth.tsx`
- `src/components/ImageUpload.tsx`
- `src/components/InlineFormValidation.tsx`
- `src/components/PasswordRecovery.tsx`
- `src/components/ReviewForm.tsx`
- `src/components/SalonApplication.tsx`
- `src/components/SalonBookingWizard.tsx`
- `src/components/SalonLogin.tsx`
- `src/components/SalonOnboarding.tsx`
- `src/components/SalonReviews.tsx`
- `src/components/booking/GuestBookingManager.tsx`
- `src/components/booking/GuestBookingRecovery.tsx`
- `src/components/commerce/PickupReservationForm.tsx`
- `src/components/commerce/PickupReservationManager.tsx`
- `src/components/commerce/ProductCheckoutClient.tsx`
- `src/components/commerce/ProductPurchaseActions.tsx`
- `src/components/location/MobileLocationOnboarding.tsx`
- `src/components/notifications/DashboardNotificationCenter.tsx`
- `src/components/notifications/PushSetup.tsx`

### Platform Admin

- `src/components/AdminContentManager.tsx`
- `src/components/AdminDashboard.tsx`
- `src/components/AdminLogin.tsx`
- `src/components/AdminSupportInbox.tsx`
- `src/components/admin/AdminApplicationReview.tsx`
- `src/components/admin/AdminBookingEditor.tsx`
- `src/components/admin/AdminEngineLanding.tsx`
- `src/components/admin/AdminFeaturedCampaigns.tsx`
- `src/components/admin/AdminFeaturedProducts.tsx`
- `src/components/admin/AdminFinanceDashboard.tsx`
- `src/components/admin/AdminHomepageMarketing.tsx`
- `src/components/admin/AdminManualBookingWizard.tsx`
- `src/components/admin/AdminPromoCodes.tsx`
- `src/components/admin/AdminPromotionSectionWorkspace.tsx`
- `src/components/admin/AdminRecordWorkspace.tsx`
- `src/components/admin/AdminSalonPayoutAction.tsx`
- `src/components/admin/AdminSalonPayoutWorkspace.tsx`
- `src/components/admin/AdminSalonsManager.tsx`
- `src/components/admin/AdminServiceCatalogWorkspace.tsx`
- `src/components/admin/AdminSubmissionDetail.tsx`
- `src/components/admin/AdminSubmissionsWorkspace.tsx`
- `src/components/admin/AdminTimeZonePreference.tsx`
- `src/components/admin/AdminTrendingCampaigns.tsx`
- `src/components/admin/AdminUserActivityTimeline.tsx`
- `src/components/admin/AiAutomationManager.tsx`
- `src/components/admin/BrandAppearanceManager.tsx`
- `src/components/admin/EngineControlCenter.tsx`
- `src/components/admin/ErrorMonitoringManager.tsx`
- `src/components/admin/IdentityDeletionManager.tsx`
- `src/components/admin/MediaRulesSettings.tsx`
- `src/components/admin/NavigationMenuManager.tsx`
- `src/components/admin/NotificationTemplateManager.tsx`
- `src/components/admin/RecordLifecycleManager.tsx`
- `src/components/admin/SalonLifecycleSettings.tsx`
- `src/components/admin/SearchLanguageSettings.tsx`
- `src/components/admin/SystemStatusManager.tsx`
- `src/components/admin/TestDataManager.tsx`
- `src/components/admin/TranslationManager.tsx`

### Salon owner and team

- `src/components/auth/TeamUserManager.tsx`
- `src/components/owner/BookingCheckInExceptionForm.tsx`
- `src/components/owner/OwnerDashboardApp.tsx`
- `src/components/owner/OwnerDashboardShell.tsx`
- `src/components/owner/SalonDescriptionEditor.tsx`
- `src/components/owner/SalonOpenStatusControl.tsx`
- `src/components/owner/SalonProductOrders.tsx`
- `src/components/owner/SalonPromotionsManager.tsx`
- `src/components/owner/SalonSpreadsheetPanel.tsx`
- `src/components/owner/SalonVanityManager.tsx`
- `src/components/owner/StructuredCatalogEditors.tsx`
- `src/components/owner/StylistSectionFallbackEditor.tsx`

### Acceptance harness, tests, scanner, CI, dependency, and evidence

- `src/app/internal/acceptance/accessibility-states/page.tsx`
- `src/app/internal/acceptance/salon-profile/page.tsx`
- `src/app/internal/acceptance/stylist-profile/page.tsx`
- `src/components/internal/AccessibilityStatesAcceptanceHarness.tsx`
- `src/components/internal/MediaUploadAcceptanceHarness.tsx`
- `src/components/internal/OwnerWorkflowAcceptanceHarness.tsx`
- `tests/browser/helpers/accessibility.ts`
- `tests/browser/workstream-1-accessibility.spec.ts`
- `tests/browser/workstream-1-visual-states.spec.ts`
- `scripts/verify-launch-design-system.mjs`
- `scripts/lib/launch-design-system-audit.mjs`
- `tests/design-system/launch-design-system-audit.test.mjs`
- `tests/design-system/theme-contrast.test.ts`
- `tests/fixtures/design-system/**`
- `.github/workflows/database-migrations.yml`
- `package.json`
- `package-lock.json`
- `docs/workstreams/workstream-1/intentional-visual-exceptions.json`
- `docs/workstreams/workstream-1/evidence/2026-08-28/*.png`
- `docs/workstreams/workstream-1/IMPLEMENTATION_REPORT.md`
- `docs/workstreams/workstream-1/MANUAL_ACCEPTANCE.md`

### Release-control continuation

The original Workstream 1 implementation and evidence inventory contained 219 paths. The release-control continuation added these five CI-only paths:

- `.github/workflows/content-slot-search-hotfix.yml`
- `.github/workflows/final-launch-mobile-realtime-admin-corrections.yml`
- `.github/workflows/verify-booking-checkout-hold-safety.yml`
- `.github/workflows/verify-booking-payout-workflow.yml`
- `.github/workflows/verify-featured-campaign-owner-controls.yml`

PR #51 therefore contains 224 total changed paths: the original 219-path Workstream 1 implementation/evidence inventory plus the five CI-only release-control paths. Each workflow modification changed its job key only; triggers, filters, permissions, environment, steps, and behavior remain unchanged.

## Automated evidence

| Check | Result |
|---|---|
| `npm ci` | PASS — 490 packages installed, 491 packages audited, 0 vulnerabilities. The first restricted-process attempt returned Windows `spawn EPERM`; the same immutable install passed with approved execution. |
| `npm run verify:design-system` | PASS — 489 source assets scanned; 20 documented color literals; 6 documented RGB roles; 18/18 positive and negative scanner fixtures; 14/14 runtime theme-contrast tests. The exact exception inventory contains 307 per-file/token ratchets and 3 non-text visual exceptions. |
| `npm run verify:migrations` | PASS — 136 unique migrations ordered; no migration was changed or added. |
| `npx tsc --noEmit` | PASS. |
| `npm run lint` | PASS — 0 errors and 9 warnings. The warnings are the existing unused-import/variable and native-image advisories; none is an accessibility-rule failure. |
| `npm run build` | PASS under the sanitized acceptance environment; 147 routes generated. The intentionally unavailable local Supabase fixture timed out and exercised its sanitized fallback without failing the build. |
| `npm run test:accessibility` | PASS — 56/56 focused Chromium tests: 29 Axe WCAG A/AA scans with `color-contrast` enabled and 0 violations, plus 27 direct computed-contrast, state, behavior, keyboard, focus, validation, responsive, overflow, and evidence checks. An earlier run exposed four fixture-readiness/reflow test defects; the focused closure rerun passed 56/56 after those test/harness corrections. |
| First `npm run test:browser` full-suite attempt | INCONCLUSIVE INFRASTRUCTURE FAILURE — one Chromium browser process crashed during the parallel run. This was a runner/process crash, not a product assertion failure, and is not reported as a product PASS or FAIL. |
| Reduced-concurrency `npm run test:browser` closure rerun | PASS — 143 passed, 6 conditional/provider-dependent tests skipped, 0 failed across 149 collected cases using two workers. |
| Post-review full-suite closure after the tablet footer correction | PASS — the final isolated run completed with 143 passed, 6 conditional/provider-dependent tests skipped, and 0 failed across all 149 collected cases using two workers. Two earlier Windows attempts each reached 142 passed and 6 skipped before a repository reader locked a different tracked PNG during evidence output; the final run was isolated from concurrent repository reads and completed cleanly. The affected header/menu matrix also passed 2/2 in its isolated serial rerun. |
| `npm run verify:booking-comms` | PASS — confirms the semantic non-DOM email visual-token bridge preserves booking communications. |
| `git diff --check` | PASS; Windows working-tree LF/CRLF notices only. |

### Acceptance-environment boundaries

- Local and GitHub Playwright acceptance is fixture-backed. The public routes run against sanitized acceptance configuration, while the protected owner, Platform Admin, and stylist surfaces use deterministic internal acceptance fixtures. These runs do not prove authenticated staging roles or live provider behavior.
- The focused accessibility suite combines 29 direct Axe WCAG A/AA scans with 27 computed-style, semantic, keyboard, focus, validation, responsive, overflow, and evidence checks. Axe and computed-style results are automated evidence, not a substitute for assistive-technology or founder acceptance.
- The Netlify Deploy Preview build is **SUCCESS/READY**: Netlify built and deployed this branch. Netlify header and redirect checks are also **SUCCESS**.
- The `preview-smoke` wrapper job is **SUCCESS**, but its checkout, dependency setup, Chromium setup, `Exercise the actual Netlify Deploy Preview` browser step, provider diagnostics, and preview evidence upload are **SKIPPED** because `ENABLE_SUPABASE_PREVIEW_SMOKE` is not enabled. Supabase Preview is likewise **SKIPPED**. The ready Deploy Preview proves that Netlify built and deployed the branch. The skipped browser-exercise step means this is not yet provider-backed deployed-preview browser acceptance.
- Provider-backed staging acceptance and representative authenticated customer, stylist/team, salon-owner, and Platform Admin role acceptance remain pending. No Stripe, Maps, OpenAI, Cloudinary, notification, or other external-provider success is inferred from the fixture-backed suites.

Three independently isolated verifier mismatches remain pre-existing and outside Workstream 1. `npm run verify:engine` expects the historical `section === "engine" ? "settings"` mapping although main already uses `const permissionForSection = section => section`. `npm run verify:brand-appearance` likewise expects `requireAdminPermission(request, "settings")` while main's Engine route uses the `engine` permission. `npm run verify:content-presentation` expects an incomplete content card to be absent although main's unchanged presentation contract renders that state. The relevant verifier/core/route files have zero diff from `origin/main`; this branch does not change permissions or content behavior and does not weaken those tests to mask unrelated failures.

The focused Axe suite in `tests/browser/workstream-1-accessibility.spec.ts` uses WCAG 2 A/AA, 2.1 A/AA, and 2.2 AA tags. It runs 18 complete-route scans, 10 scoped deterministic-fixture scans, and 1 modal scan. Color contrast remains enabled and there are no broad rule or page-region exclusions. Result: 29/29 scans passed with 0 violations. The remaining 27 focused tests are the 15 direct semantics/contrast/behavior checks in that file plus the 12 responsive/evidence tests generated by `tests/browser/workstream-1-visual-states.spec.ts`.

Main had no direct Axe runner, so the honest baseline is “not measured,” not an invented before-violation count. After implementation, all 29 scans report zero violations across every Axe impact level returned by the configured WCAG A/AA rules.

### Exact Workstream 1 test and CI inventory

- Design enforcement files: `scripts/verify-launch-design-system.mjs`, `scripts/lib/launch-design-system-audit.mjs`, `tests/design-system/launch-design-system-audit.test.mjs`, `tests/design-system/theme-contrast.test.ts`, and `tests/fixtures/design-system/**`.
- Browser accessibility files: `tests/browser/helpers/accessibility.ts`, `tests/browser/workstream-1-accessibility.spec.ts`, and `tests/browser/workstream-1-visual-states.spec.ts`.
- Direct accessibility dependency: `@axe-core/playwright@4.13.0` in `package.json` and `package-lock.json`.
- CI step **Verify Workstream 1 semantic design system** runs `npm run verify:design-system` immediately after `npm ci`.
- CI step **Exercise focused Workstream 1 accessibility and contrast workflows** runs `npm run test:accessibility` against the sanitized production acceptance build.
- Existing CI step **Exercise responsive and affected browser workflows** runs `npm run test:browser` after the focused Workstream 1 gate.

## Route/state visual evidence

The 68 deterministic screenshots are under `docs/workstreams/workstream-1/evidence/2026-08-28/`; the exact filename-to-route/viewport matrix is in `MANUAL_ACCEPTANCE.md`. Provenance is explicit:

- `/`, `/salons`, `/salon/acceptance-salon`, and `/legal` are public-route renders under the sanitized acceptance runtime. They are presentation evidence, not provider or live-record acceptance.
- `/internal/acceptance/stylist-profile` is the deterministic stylist-profile fixture. Its files are named `workstream-1-fixture-stylist-profile-*`.
- `/internal/acceptance/owner-workflows` and `/internal/acceptance/admin-workflows/customers` are deterministic owner/Admin fixtures. Their files retain the user-facing names `workstream-1-owner-dashboard-*` and `workstream-1-admin-report-table-*`; those names must not be read as authenticated production evidence.
- `/internal/acceptance/accessibility-states` supplies every generic viewport file (`workstream-1-phone-*`, `workstream-1-tablet-*`, and `workstream-1-desktop-*`), every `workstream-1-fixture-*` composite-state capture other than the stylist-profile family, both modal files, both state-error files, and the 320px/200% reflow file.
- Conditional legal-link presentation is covered by the deterministic selectors `footer-legal-fixture` and `footer-legal-link`; this avoids pretending that an unpublished Content Management link exists on every public footer.

Evidence covers homepage/navigation/footer, discovery, salon and stylist presentation, booking/checkout, customer account, owner dashboard, Platform Admin workflows, legal/policy, advertising, finance/report, modal, table, empty, toast/alert, validation, all eight shared states, phone, tablet, desktop, mobile landscape, and 320px/200% reflow.

The final screenshots were inspected independently in addition to computed assertions. That inspection caught the desktop footer switching to its six-column grid too early at 1024px, where the “For Professionals” heading could break inside the word. The final implementation retains the two-column tablet grid until the wider breakpoint and permits heading wrapping only between words. The focused 56-test suite was rerun after the correction. Text is not clipped, footer copy remains readable, state labels are distinguishable without color alone, forms retain visible labels and prompts, and focus/validation states remain legible.

Authenticated production accounts and provider-backed Google Maps/payment operations were intentionally not used. The owner/Admin/stylist acceptance routes are sanitized deterministic fixtures. Public routes and the acceptance-safe public salon route were exercised directly. No real booking, message, provider request, or charge was created.

## WS01-001 through WS01-018

| ID | Requirement | Prior audit | Status | Implementation and automated evidence | Manual evidence / limitation |
|---|---|---|---|---|---|
| WS01-001 | Placeholder text | Complete but weak | PASS | Semantic light/on-dark roles; input, textarea, select prompt computed tests. | Manual script §§3–4; no provider needed. |
| WS01-002 | Disabled controls | Partially implemented | PASS | Native/custom contract; pointer, Enter, Space, scripted activation and computed-style tests. | Manual script §5. |
| WS01-003 | Clearly nonessential metadata | Partially implemented | PASS | Content-role migration and exact 307-ceiling/3-exception inventory; important financial/booking/policy copy promoted. | Representative families reviewed; remaining genuine metadata is ratcheted, not globally approved. |
| WS01-004 | Inactive states | Partially implemented | PASS | Eight shared states with non-color cues and ARIA/native semantics; state matrix. | Manual script §5. |
| WS01-005 | Full text-color audit | Partially implemented | AUTOMATED ONLY | Static inventory plus representative computed route/state matrix pass. | Founder visual review and unavailable authenticated/provider staging variants remain explicit acceptance work. |
| WS01-006 | Semantic theme tokens | Partially implemented | PASS | Ten required text roles plus on-dark-muted and shared state surfaces; Engine mapping. | Token table above. |
| WS01-007 | Primary text use | Complete but weak | PASS | Cross-family targeted role migration; scanner blocks known bypass classes. | Founder checks representative routes in §7. |
| WS01-008 | Hardcoded gray removal | Partially implemented | PASS | Known RGB and `text-slate-600` fixed; gray/hex/RGB/HSL/inline scanners baseline-clean. | Scanner fixtures reproduce rejection. |
| WS01-009 | Automated prohibited-color enforcement | Complete but weak | PASS | Testable scanner with positive/negative fixtures, stable codes and locations; CI-required. | No manual action. |
| WS01-010 | Light/dark/card/modal/mobile/disabled testing | Partially implemented | PASS | Direct computed assertions and screenshots for all six categories. | Screenshot matrix §§2 and 12. |
| WS01-011 | Keyboard/focus/responsive/error testing | Partially implemented | PASS | Tab/reverse Tab, activation keys, Escape/restoration, focus-ring, validation, viewports and reflow. | Manual scripts §§5, 8–10. |
| WS01-012 | Important information readability | Partially implemented | PASS | Booking totals, deposit/balance, checkout, account, Admin finance, policy, modal, toast/alert computed tests. | No real payment is submitted. |
| WS01-013 | Placeholder versus entered text | Complete but weak | PASS | Separate computed pseudo-element/value measurements for light, dark, and select prompt. | Manual script §4. |
| WS01-014 | Disabled controls do not appear active | Partially implemented | PASS | Visual signatures and behavior differ from active, selected, unavailable, and loading. | Manual script §5. |
| WS01-015 | Desktop/mobile visual review | Partially implemented | AUTOMATED ONLY | Versioned route/state matrix at phone, landscape, tablet, desktop and zoom/reflow sizes, followed by independent screenshot inspection. | Founder product acceptance remains required; provider/auth cases are named in §11. |
| WS01-016 | Automated accessibility suite | Partially implemented | PASS | Explicit Axe dependency/script; WCAG A/AA, contrast enabled, no broad exclusions; required `verify` step. | Zero unreviewed violations in scoped suite. |
| WS01-017 | All important text readable | Partially implemented | PASS | Footer remediated; semantic roles and runtime Engine contrast clamping; representative computed matrix. | Provider-backed staging remains a separate acceptance step. |
| WS01-018 | Ordinary content not faint by default | Partially implemented | PASS | Ordinary on-dark opacity removed; shared roles replace accidental opacity; static and computed enforcement. | Intentional metadata/decorative exceptions inventoried. |

`AUTOMATED ONLY` means the implementation and deterministic evidence pass but final founder visual acceptance and any unavailable authenticated/provider-backed staging route remain outstanding. It does not mean the implementation layer is omitted.

## CI changes

The comprehensive protected job in `.github/workflows/database-migrations.yml` remains named exactly `verify`. Its exact new/affected named gates are **Verify Workstream 1 semantic design system**, **Exercise focused Workstream 1 accessibility and contrast workflows**, and the existing **Exercise responsive and affected browser workflows**. The first runs `npm run verify:design-system`; the second runs `npm run test:accessibility`; the third runs `npm run test:browser`. Non-comprehensive legacy workflow jobs use unique check identities so they cannot ambiguously satisfy the protected `verify` requirement; their triggers, steps, and behavior are unchanged. The existing `migrate` job remains separate and conditional; pull requests do not run production migrations. The acceptance environment uses sanitized local fixture values and requires no production secret.

## Known limitations and blocked acceptance

- No real customer, salon, stylist, or Admin account was used. Sanitized acceptance fixtures cover protected state presentations.
- No Google Maps, Stripe, email, SMS, push, or other provider-backed action was invoked.
- A founder should review the Draft PR preview at the routes and viewports in `MANUAL_ACCEPTANCE.md`.
- Automated WCAG checks do not replace a later specialist audit with assistive technology and representative authenticated staging accounts.

## Rollback

Revert the Workstream 1 commits in reverse order through a follow-up pull request. This restores the former presentation/test files without database rollback because this workstream creates no migration or persistent-data change. Remove the Axe dependency only with its package-lock entry and remove the two CI steps with the corresponding scripts; do not rewrite the Workstream 0 audit.
