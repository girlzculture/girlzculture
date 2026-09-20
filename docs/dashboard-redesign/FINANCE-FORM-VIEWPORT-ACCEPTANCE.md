# Finance form reduced-height viewport acceptance

Browser and rendered acceptance: **PASS at bounded local-fixture scope.** Both journeys passed in Chromium and WebKit (**4/4**) on unchanged build 199. The shared run also passed six existing public-policy cases (**10/10 total in 1.0 minute**); those six are separate policy coverage. No application or CSS change was needed.

## Bounded coverage

`tests/browser/business-finances.spec.ts` extends the existing **Business finance wage agreement, obligation and partial payment retain separate totals after refresh** journey. Before its original arrangement save, the owner enters employee/stylist/amount fields at 390×844, focuses the amount and reduces the viewport to 390×430. The test retains every entered/default date and period value, then continues the original arrangement→obligation→partial-payment writes and refreshed $60 outstanding/$100 recorded wage cost checks.

The new **Business finance receipt and expense drafts retain values with clear actions in a reduced-height viewport** journey uses one own-business completed $125.50 fixture sale with a recorded $25.50 deposit. It enters a $37.50 transfer balance receipt and a $23.25 operating expense, preserving all entered amounts, selections, notes and times across the focused-input viewport reduction. Exact POST payloads and fixture readback are required. After reload, the sale remains $125.50, receipts total $63.00, unpaid balance is $62.50, and one $23.25 expense appears. The explicit entered August timestamps stay within the selected August reporting period. These are recorded outside-app amounts; no charge, transfer or provider action occurs.

For receipt, expense and arrangement separately, the test scrolls normally to Cancel and Save, requires enabled/visible/actionable controls and checks their center plus four inset corners against `elementFromPoint`, with full bounds inside the current viewport. Screenshots cover the focused input, Cancel and Save at 390×430; input and Save captures must have distinct form scroll positions. No forced clicks, overlay removal, CSS injection, arbitrary sleep or screenshot stitch supplies clearance evidence.

This is explicitly a **focused-input reduced-height viewport proxy, not an operating-system soft keyboard**. It does not establish keyboard IME behavior, real device visual-viewport resizing, hosted persistence, staff permission coverage or real financial mutations. Existing finance permission, failure/idempotency and other viewport tests remain unchanged.

## Evidence and execution scope

- **PASS:** scoped ESLint, `../redesign-evidence/finance-form-proxy-lint.log`.
- **PASS:** full TypeScript no-emit check, `../redesign-evidence/finance-form-proxy-types.log`; independent read-only review passed.
- **PASS:** parent-owned Chromium+WebKit execution, **4/4 finance cases**, in `../redesign-evidence/finance-forms-and-policy-fixture.log` and `finance-forms-and-policy-fixture-results` on unchanged build 199.
- **PASS:** all nine WebKit viewport captures inspected: root reviewed the six focused-input/Save images; an independent follow-up reviewed the three Cancel images. All were current captures from this run.

Recorded viewport captures per form: `finance-{receipt|expense|arrangement}-focused-390x430-proxy.png`, `-cancel-390x430-proxy.png`, and `-save-390x430-proxy.png`. The corresponding `finance-{form}-reduced-height-clearance` JSON records positions and hit-test results. Any demonstrated overlap remains a failure requiring its own reproduced correction; these tests do not weaken the geometry condition to match an image.


## Inspected viewport evidence

The receipt Cancel view shows its full Cancel control, the outside-app/no-charge explanation and retained focused 37.50 amount. Payment method continues toward the bottom bar; lower fields and Save are deliberately shown in the separately inspected Save position. The expense Cancel view similarly shows the full Cancel control and retained focused “Studio supplies” category; lower inputs continue below this viewport. These images do not claim all fields and both actions fit simultaneously.

The arrangement Cancel capture shows Weekly and the complete compensation explanation, with **Save record and Cancel both clear above the fixed bottom navigation**. Root's six focused/Save views establish retained inputs and clear Save targets for all three forms. Headings or earlier fields scroll above the fixed header at lower positions; that ordinary scrolling is not a demonstrated target obstruction. The five-point target checks and actual explicit saves/readback passed in both engines.

[Receipt Cancel](<C:/Users/AfriToGoDeliveryServ/Documents/Codex/2026-09-08/files-pasted-by-the-user-girlz/work/redesign-evidence/finance-forms-and-policy-fixture-results/business-finances-Business-d7fe1-n-a-reduced-height-viewport-webkit/finance-receipt-cancel-390x430-proxy.png>) · [Expense Cancel](<C:/Users/AfriToGoDeliveryServ/Documents/Codex/2026-09-08/files-pasted-by-the-user-girlz/work/redesign-evidence/finance-forms-and-policy-fixture-results/business-finances-Business-d7fe1-n-a-reduced-height-viewport-webkit/finance-expense-cancel-390x430-proxy.png>) · [Arrangement Cancel](<C:/Users/AfriToGoDeliveryServ/Documents/Codex/2026-09-08/files-pasted-by-the-user-girlz/work/redesign-evidence/finance-forms-and-policy-fixture-results/business-finances-Business-f3bab-parate-totals-after-refresh-webkit/finance-arrangement-cancel-390x430-proxy.png>).

No new visual defect was demonstrated by these nine EN 390×430 views. This closes only these three fixture form/clearance gaps, not all Finance states, all 14 dashboard sections, other locales, hosted acceptance or actual OS-keyboard behavior.
