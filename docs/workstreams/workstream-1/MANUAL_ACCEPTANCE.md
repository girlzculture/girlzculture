# Workstream 1 founder manual acceptance

This is the safe, reproducible Workstream 1 product-review script. PR #51 is already merged and closed, and its old Deploy Preview is stale; do not use that runtime for acceptance. Use a designated nonproduction preview only after its exact release SHA is documented and the provider-backed smoke passes. Acceptance-only routes require a preview/local build with `GIRLZ_CULTURE_ACCEPTANCE_MODE=true` and `NEXT_PUBLIC_ENABLE_ACCEPTANCE_HARNESS=true`; they do not write bookings, payments, providers, or production data.

## 1. Accounts, environment, and viewports

Use Chrome or Edge and a fresh exact-head nonproduction preview that has passed its readiness and smoke gates.

Current environment status:

| Environment check | Status |
|---|---|
| Isolated Supabase preview branch | PASS — all 136 migrations executed. |
| Guarded synthetic preview seed | PASS — database assertions passed; no copied/live records. |
| Existing Netlify `deploy-preview-51` | FAIL/STALE — it predates the repair and must not be reviewed. |
| Fresh exact-head Netlify preview | BLOCKED/not yet created. |
| Full local clean-PostgreSQL workflow | BLOCKED — no disposable local PostgreSQL/Docker runtime is available. |
| Production | Unchanged and not used for this acceptance. |

| Review family | Account required now | Safe source |
|---|---|---|
| Public pages and footer | None | Real public routes in a fresh exact-head preview after smoke passes; currently blocked |
| State, salon-profile, stylist-profile, owner, and Platform Admin deterministic review | None | `/internal/acceptance/**` routes, with the two acceptance flags enabled |
| Real customer, stylist/team, salon-owner, and Platform Admin review | Four separate, non-production staging accounts | Deferred staging acceptance in §11 |
| Google Maps, payment, email/SMS/push, and external media | Provider-configured non-production staging runtime | Deferred provider acceptance in §11; do not create a charge |

Start at 100% browser zoom. Test these exact CSS viewports:

- narrow phone: 320×568
- phone: 360×800, 390×844, and 412×915
- mobile landscape: 844×390
- tablet portrait: 768×1024
- tablet landscape: 1024×768
- desktop: 1366×768 and 1440×1000
- reflow: 320×568 with the root text size increased to 200% as described in §10

At every size, fail the review for clipped/overlapping copy, horizontal page overflow, unreadable faint text, missing focus, a state distinguishable only by color, or an available action that looks disabled (and vice versa).

## 2. Evidence provenance and route matrix

The screenshots live in `docs/workstreams/workstream-1/evidence/2026-08-28/`.

- Public presentation files use `/`, `/salons`, `/salon/acceptance-salon`, and `/legal` under the sanitized acceptance runtime. They are not provider or live-record proof.
- Stylist files named `workstream-1-fixture-stylist-profile-*` use `/internal/acceptance/stylist-profile`.
- Files named `workstream-1-owner-dashboard-*` and `workstream-1-admin-report-table-*` use `/internal/acceptance/owner-workflows` and `/internal/acceptance/admin-workflows/customers`. Despite their concise filenames, they are deterministic fixtures, not authenticated production dashboards.
- Generic phone/tablet/desktop files, composite `fixture-*` files (other than the stylist family), modal files, state-error files, and the reflow file use `/internal/acceptance/accessibility-states`.
- Conditional configured footer/legal content is represented deterministically by `data-testid="footer-legal-fixture"` and `data-testid="footer-legal-link"` on the state fixture.

The automated route matrix captures the public/fixture families at 320×568, 390×844, 844×390, 1024×768, and 1440×1000. The 390×844 and 1440×1000 route captures are full-page; the other three are viewport captures. The generic state fixture is additionally captured at 360×800, 412×915, 768×1024, and 1366×768.

## 3. Public route and footer review

No account is required. Open each route at 390×844, 1024×768, 1366×768, and 1440×1000:

- `/`
- `/salons`
- `/styles`
- `/how-it-works`
- `/about`
- `/blog`
- `/partner`
- `/contact`
- `/legal`
- `/salon/acceptance-salon`
- `/internal/acceptance/salon-profile` (acceptance mode only)
- `/internal/acceptance/stylist-profile` (acceptance mode only)

For each route:

1. Read the main heading, ordinary paragraph, card metadata, field labels/prompts, status text, and action labels.
2. Resize from desktop to tablet landscape and then phone without refreshing.
3. Confirm the header, page content, and fixed/mobile controls do not overlap or create horizontal page scroll.
4. On a public route, scroll to the footer. Read the brand copy, group headings, ordinary links, newsletter guidance, email prompt, and copyright line.
5. Confirm the footer is a strong approved teal with bright readable copy, not translucent gray-on-teal.
6. Tab to a footer link and confirm the visible two-tone focus indicator.
7. On the state fixture, locate `[data-testid="footer-legal-fixture"]`, read its supporting copy, then Tab to `[data-testid="footer-legal-link"]`. This is the deterministic proof for a configured legal link when public Content Management has not published one.

## 4. Placeholder and entered-value review

### Dark footer field

No account is required. On `/legal`, scroll to the newsletter field.

1. Confirm `name@example.com` is readable and visually distinct as a prompt.
2. Type `reader@example.com`.
3. Confirm the entered value is stronger/primary and does not retain prompt styling.
4. Do not submit on production. Tab to Subscribe and confirm its focus indicator is visible.

### Light input, textarea, and select

Open `/internal/acceptance/accessibility-states` and locate “Support request fixture.”

1. Confirm the Email address prompt `name@example.com` and Message prompt `Describe what you need help with` are readable.
2. Type `reader@example.com` and `Please help review this fixture.`; entered text must be visually stronger than each prompt.
3. Locate Booking category. Confirm `Choose a booking category` reads as the initial prompt.
4. Select `Booking support`; the entered selection must change to primary text.
5. Compare `workstream-1-fixture-validation-desktop.png`.

## 5. Exact eight-state and control-behavior review

Open `/internal/acceptance/accessibility-states`, section “Controls and feedback,” and then “State inventory.” Confirm all eight visible labels and cues:

| State | Required non-color presentation/semantics |
|---|---|
| Active | Visible `Active`/`Active control` text, solid strong surface/border, and inset bottom accent marker |
| Selected | Visible `Selected` text, 3px double border, inset side marker, and selected/pressed semantics |
| Inactive | Visible `Inactive` text and dotted border on the card surface |
| Disabled | Visible `Disabled` text, solid muted border/surface, native `disabled`, and no normal focus/activation |
| Unavailable | Visible `Unavailable`/reason text, dashed warning border, `aria-disabled`, and guarded activation |
| Loading | Visible `Loading`/`Loading availability…` text, `aria-busy`, strong surface, 3px double border, 5px inset accent marker, and progress cursor; no determinate-progress claim |
| Completed | Visible `Completed` text and 3px double success border |
| Error | Visible `Error` text/alert semantics and a 5px solid leading border |

Then perform the behavior checks:

1. Confirm `Successful activations: 0`. Click Active control once and confirm it becomes `1`.
2. Try the native disabled button, input, textarea, select, checkbox, and radio. They must not receive normal Tab focus, change, or increment the successful counter.
3. Focus Unavailable control, Unavailable link, Unavailable custom action, and Unavailable afternoon slot. For each, press Enter and Space. The successful counter must remain `1`, the link must not navigate, the slot must remain unselected, and `Blocked attempts observed` must increase.
4. Focus Loading availability… and press Enter and Space. It remains busy and must not increment the successful counter.
5. Confirm the eight chips have pairwise-distinct labels and border/marker signatures; color alone is insufficient.
6. Compare `workstream-1-fixture-disabled-loading-toast-alert-desktop.png` and `workstream-1-fixture-state-inventory-desktop.png`.

## 6. Booking, checkout, account, advertising, policy, and finance figures

No account is required. Use `/internal/acceptance/accessibility-states`; do not click a payment/provider action.

1. Customer account: read the upcoming booking, completed booking, and `No saved salons yet` empty state.
2. Booking/checkout: verify Service total `$240.00`, Reservation deposit `$24.00`, and Balance due at salon `$216.00`; all labels and amounts must be equally clear.
3. Advertising: verify the Featured salon placement contains a readable `Sponsored` disclosure.
4. Finance: verify Deposits collected `$42.00`, Balance due at salons `$378.00`, and all table headers/rows.
5. Policy: read the complete deposit/refund summary; policy meaning must not be styled as faint metadata.
6. Compare these exact files:
   - `workstream-1-fixture-customer-account-empty-completed-desktop.png`
   - `workstream-1-fixture-booking-checkout-totals-deposit-desktop.png`
   - `workstream-1-fixture-featured-advertising-desktop.png`
   - `workstream-1-fixture-admin-finance-report-table-desktop.png`
   - `workstream-1-fixture-admin-finance-report-table-mobile.png`
   - `workstream-1-fixture-policy-desktop.png`

These are sanitized fixture values, not proof of live financial/provider data.

## 7. Stylist, salon-owner, and Platform Admin fixtures

No real account is required. Review:

- stylist profile: `/internal/acceptance/stylist-profile`
- owner: `/internal/acceptance/owner-workflows`
- Admin customer table: `/internal/acceptance/admin-workflows/customers`
- Admin customer detail: `/internal/acceptance/admin-workflows/customers/customer-1`
- Admin finance/report: `/internal/acceptance/admin-workflows/finance`
- Admin booking list/detail: `/internal/acceptance/admin-workflows/bookings`

At 320×568, 390×844, 844×390, 1024×768, and 1440×1000:

1. Read headings, navigation, instructions, status text, tables, booking amounts, deposit figures, and empty states.
2. Tab through every available control and confirm the visible two-tone focus indicator.
3. At 320×568, confirm the owner dashboard does not create horizontal page overflow.
4. Confirm no card/table copy is clipped or faint.
5. Compare the exact stylist, owner, and Admin route families listed in §12.

Authenticated production dashboards remain a staging-account item. Do not use real customer records for this fixture review.

## 8. Modal, toast, alert, and validation summary

Open `/internal/acceptance/accessibility-states`.

1. Activate `Open review dialog`. Focus must move to `Close dialog`.
2. Press Tab: focus must move to `Review totals`. Press Shift+Tab: it must return to `Close dialog`.
3. Press Escape. The dialog closes and focus returns to `Open review dialog`.
4. Activate `Show success toast`; the status text must be readable and announced as a status.
5. Activate `Show error alert`; the error text must be readable and announced as an alert.
6. Activate `Validate fixture` with both fields empty. The exact summary heading `Correct the highlighted fields.` must appear; focus must move to Email address; both fields must expose invalid state and associated error text.
7. Enter `reader@example.com` and `Please help me review this acceptance fixture.`, then activate `Validate fixture` again.
8. The error summary must disappear and the exact completion message `Completed: the acceptance form passed validation. Nothing was sent.` must appear. Nothing is transmitted.
9. Compare `workstream-1-modal-desktop.png`, `workstream-1-modal-mobile.png`, `workstream-1-state-errors-desktop.png`, `workstream-1-state-errors-mobile.png`, and `workstream-1-fixture-validation-desktop.png`.

## 9. Exact keyboard and focus order

### State fixture controls

Open `/internal/acceptance/accessibility-states`, click a non-interactive background area, and Tab forward. Once focus reaches `Active control`, the expected interactive order in that section is:

1. Active control
2. Unavailable control
3. Loading availability…
4. Unavailable link
5. Unavailable custom action (`role="button"`)
6. Unavailable afternoon slot (`role="option"`)
7. How the visual states work (`summary`)
8. Custom preference · Inactive (`role="button"`)
9. Booking category (`select`)
10. Open review dialog
11. Show success toast
12. Show error alert
13. Email address
14. Message
15. Validate fixture

The native disabled button/input/textarea/select/checkbox/radio must be skipped. At each focusable target, the two-tone focus indicator must remain visible. Press Shift+Tab to verify reverse traversal.

On `How the visual states work`, press Enter to open and Space to close. On the custom-role button, confirm `Custom activations: 0`, press Enter and verify `Custom preference · Selected` plus count `1`, then press Space and verify `Custom preference · Inactive` plus count `2`.

### Representative real/fixture surfaces

1. `/`: Tab to Browse Styles, Shift+Tab away, Tab back, press Enter, and confirm navigation to `/styles`.
2. `/internal/acceptance/salon-profile`: Tab to the Knotless Braids disclosure, press Space to expand (`aria-expanded=true`), then Enter to collapse.
3. `/internal/acceptance/owner-workflows`: Tab to Search bookings, type `Monique`, Tab to Search, Shift+Tab back, Tab forward, press Enter, and confirm the URL contains `q=Monique`.
4. `/internal/acceptance/admin-workflows/customers`: Tab to Customer status, Shift+Tab to the customer search field, Tab forward again, then Tab to Janel Smith and press Enter. The record link must activate by keyboard.

## 10. Reflow and responsive acceptance

1. Open `/internal/acceptance/accessibility-states` at 320×568.
2. Increase the root text size to 200% (the automated fixture sets `document.documentElement.style.fontSize = "200%"`; for manual review, use the browser accessibility/text-size control that produces equivalent CSS text scaling).
3. Read and Tab through the page. Controls, labels, figures, all eight state chips, modal trigger, and error summary must remain visible without two-dimensional page scrolling.
4. Repeat `/` at 844×390 and 1024×768.
5. Repeat `/internal/acceptance/owner-workflows` at 320×568 and confirm no horizontal overflow.
6. Compare `workstream-1-reflow-320px-200-percent.png`, `workstream-1-phone-landscape-844x390.png`, `workstream-1-tablet-landscape-1024x768.png`, and `workstream-1-owner-dashboard-narrow-mobile-320x568.png`.

## 11. Required staging and specialist acceptance

These checks remain pending founder/specialist acceptance; they are not silently reported as passed:

1. Create or use four separate non-production staging identities: customer, stylist/team member, salon owner, and Platform Admin. Do not reuse one browser session across roles; use isolated browser profiles.
2. For each role, review the first dashboard page and one data-rich page at 390×844, 1024×768, and 1440×1000. Verify ordinary copy, metadata, statuses, disabled/unavailable controls, focus, error text, and financial/booking figures.
3. The isolated Supabase fixture is available, but a fresh application deployment, authenticated role identities, and external providers remain pending. In a provider-configured non-production runtime, review Google Maps, external media, and notification setup/failure surfaces. Do not send real customer notifications.
4. Review checkout/payment presentation with Stripe test mode only. Do not create a real charge.
5. Have an accessibility specialist run NVDA or JAWS with Chrome/Edge and VoiceOver with Safari, including landmarks, headings, names/roles/states, error announcements, modal focus, responsive reflow, and zoom.
6. Record the exact route, role, viewport, text/control, keyboard step, and screenshot for every failure.

WS01-005 and WS01-015 are automated-complete but remain pending this founder/manual acceptance where authenticated roles, a fresh exact-head deployment, or provider-backed variants are unavailable.

## 12. Exact evidence filename inventory

### Generic state-fixture viewports

- `workstream-1-phone-360x800.png`
- `workstream-1-phone-390x844.png`
- `workstream-1-phone-412x915.png`
- `workstream-1-phone-landscape-844x390.png`
- `workstream-1-tablet-768x1024.png`
- `workstream-1-tablet-landscape-1024x768.png`
- `workstream-1-desktop-1366x768.png`
- `workstream-1-desktop-1440x1000.png`

### Public and deterministic route families

| Route/source | Exact files |
|---|---|
| `/` | `workstream-1-homepage-nav-footer-narrow-mobile-320x568.png`; `workstream-1-homepage-nav-footer-mobile-390x844.png`; `workstream-1-homepage-nav-footer-phone-landscape-844x390.png`; `workstream-1-homepage-nav-footer-tablet-landscape-1024x768.png`; `workstream-1-homepage-nav-footer-desktop-1440x1000.png` |
| `/salons` | `workstream-1-discovery-narrow-mobile-320x568.png`; `workstream-1-discovery-mobile-390x844.png`; `workstream-1-discovery-phone-landscape-844x390.png`; `workstream-1-discovery-tablet-landscape-1024x768.png`; `workstream-1-discovery-desktop-1440x1000.png` |
| `/salon/acceptance-salon` | `workstream-1-salon-profile-narrow-mobile-320x568.png`; `workstream-1-salon-profile-mobile-390x844.png`; `workstream-1-salon-profile-phone-landscape-844x390.png`; `workstream-1-salon-profile-tablet-landscape-1024x768.png`; `workstream-1-salon-profile-desktop-1440x1000.png` |
| `/internal/acceptance/stylist-profile` | `workstream-1-fixture-stylist-profile-narrow-mobile-320x568.png`; `workstream-1-fixture-stylist-profile-mobile-390x844.png`; `workstream-1-fixture-stylist-profile-phone-landscape-844x390.png`; `workstream-1-fixture-stylist-profile-tablet-landscape-1024x768.png`; `workstream-1-fixture-stylist-profile-desktop-1440x1000.png` |
| `/internal/acceptance/owner-workflows` | `workstream-1-owner-dashboard-narrow-mobile-320x568.png`; `workstream-1-owner-dashboard-mobile-390x844.png`; `workstream-1-owner-dashboard-phone-landscape-844x390.png`; `workstream-1-owner-dashboard-tablet-landscape-1024x768.png`; `workstream-1-owner-dashboard-desktop-1440x1000.png` |
| `/internal/acceptance/admin-workflows/customers` | `workstream-1-admin-report-table-narrow-mobile-320x568.png`; `workstream-1-admin-report-table-mobile-390x844.png`; `workstream-1-admin-report-table-phone-landscape-844x390.png`; `workstream-1-admin-report-table-tablet-landscape-1024x768.png`; `workstream-1-admin-report-table-desktop-1440x1000.png` |
| `/legal` | `workstream-1-legal-policies-narrow-mobile-320x568.png`; `workstream-1-legal-policies-mobile-390x844.png`; `workstream-1-legal-policies-phone-landscape-844x390.png`; `workstream-1-legal-policies-tablet-landscape-1024x768.png`; `workstream-1-legal-policies-desktop-1440x1000.png` |

### Composite state, modal, validation, and reflow files

- `workstream-1-fixture-customer-account-empty-completed-desktop.png`
- `workstream-1-fixture-salon-stylist-selected-unavailable-desktop.png`
- `workstream-1-fixture-booking-checkout-totals-deposit-desktop.png`
- `workstream-1-fixture-admin-finance-report-table-desktop.png`
- `workstream-1-fixture-admin-finance-report-table-mobile.png`
- `workstream-1-fixture-policy-desktop.png`
- `workstream-1-fixture-featured-advertising-desktop.png`
- `workstream-1-fixture-disabled-loading-toast-alert-desktop.png`
- `workstream-1-fixture-validation-desktop.png`
- `workstream-1-fixture-state-inventory-desktop.png`
- `workstream-1-state-errors-desktop.png`
- `workstream-1-state-errors-mobile.png`
- `workstream-1-modal-desktop.png`
- `workstream-1-modal-mobile.png`
- `workstream-1-reflow-320px-200-percent.png`

### Retained companion captures

These ten companion files use earlier concise names for the same reviewed public/fixture families and remain in the evidence directory:

- `workstream-1-homepage-nav-footer-desktop.png`
- `workstream-1-homepage-nav-footer-mobile.png`
- `workstream-1-discovery-desktop.png`
- `workstream-1-discovery-mobile.png`
- `workstream-1-owner-dashboard-desktop.png`
- `workstream-1-owner-dashboard-mobile.png`
- `workstream-1-admin-report-table-desktop.png`
- `workstream-1-admin-report-table-mobile.png`
- `workstream-1-legal-policies-desktop.png`
- `workstream-1-legal-policies-mobile.png`

The directory contains 68 PNG files total. Report any failure with the route/source, exact viewport, exact visible text/control, keyboard step, and closest evidence filename.
