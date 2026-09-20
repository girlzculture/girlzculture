# Finance period and empty-team correction

Status: **AUTOMATED ONLY / NOT RELEASED**. This entry covers the narrow UI-06 finance correction. It is not evidence that all Finances requirements or the release are complete.

## Demonstrated cause and correction

`BusinessFinances` retained the previous response while the URL immediately selected a new reporting period. Against the existing local combined179 build, a test held August's GET using an explicit request gate. The URL and loading state showed August while five nodes still contained July's $125.50. The old books also remained available to transaction controls. The original response-generation guard rejected late responses but did not prevent the already loaded response from rendering under new dates.

The component now renders a snapshot only when its business, permissions, dates and time zone match the current request. A selected receipt/refund resolves by ID from those matching books; a selection from the previous period cannot render an actionable form. MoneyInsights and BookingMoney retain their implementations and receive only matching parent data.

Entry options are separately bound to the same business and permissions. Independent review identified that binding these options to the date range would remove selected options from an otherwise retained free-form draft. The corrected state preserves selected stylist/product options during pending and failed date reads. It does not persist them outside the mounted component or retain them after a business/permission change. Free-form sale/expense drafts remain intact across same-workspace tabs and dates.

The empty Team earnings panel now explains that no stylist earnings exist in the selected period. Authorized loggers can open Record a sale; read-only staff can focus the existing reporting-period control. Both new interface strings have French, Spanish and Simplified Chinese entries in the existing finance catalog. No backend authorization, money calculation, provider or production configuration changed.

## Evidence

| Check | Status | Evidence |
|---|---|---|
| Original stale-period failure | FAIL, preserved before correction | `redesign-evidence/finance-period-before-corrected.log` and its sibling results directory contain the failed five-versus-zero old-value assertion, trace and screenshot. |
| Original empty-team failure | FAIL, preserved before correction | `redesign-evidence/finance-period-before.log` and its sibling results directory show the missing empty-state explanation/action. |
| Test-harness correction | AUTOMATED ONLY | The first stale-period attempt stopped on an ambiguous Overview/Reports locator. That log remains preserved; only the later exact-panel run counts as defect reproduction. |
| Focused ESLint and full TypeScript | AUTOMATED ONLY | Both exited0 after the final entry-option correction. These checks do not establish browser behavior. |
| Independent source review | AUTOMATED ONLY | Reviewer found no further blocker after the entry-option correction; period/role bindings, canonical selected-sale resolution and draft-preservation cases were inspected. |
| Rebuilt browser acceptance | PASS, AUTOMATED ONLY | `redesign-evidence/combined-ui-final-browser.log`: all14 new Chromium/WebKit cases pass (held period, four locale/viewport empty states, service/product drafts through pending GET,503 and Reload). All20 affected existing Finance save, compensation and tab/draft cases also pass. The combined54-case run had52passes and2 unrelated Photo late-reload failures; it is not relabelled fully passing. No sleeps, automatic retries or weakened assertions were added. |
| Published behavior | BLOCKED | No publication or live claim for this correction. Final required CI and release smoke checks must cover the released source. |

The delayed-period case uses different July/August canonical records and amounts, verifies old totals/records/refund actions and the selected balance form are absent before release, then checks the new $283.75 sale and $200.00 balance. All new draft tests reject POSTs. Test records and session fixtures are local; no real customer records, notifications, charges or refunds are used.

BusinessFinances currently receives business/permission props, not an actor ID. These cases verify the mounted component's business/permission/period boundary; they do not independently establish an in-place actor switch that bypasses the existing dashboard authentication/remount boundary.
