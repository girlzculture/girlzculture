# Selected-service calendar evidence — 2026-09-19

Status: **AUTOMATED ONLY**. Build191 and all14 focused Chromium/WebKit capacity cases pass locally. Hosted/provider acceptance, final release checks and deployment remain separate. This is a bounded ADVISE-02/ADVISE-03 addition, not a claim that all advice requirements or all 201 requirement groups are complete.

## Reproduced defects

- `../redesign-evidence/service-capacity-before-actual.log`: actual `readAssistantData(get_availability)` returned **60 minutes instead of 180** for a saved required option adding 120 minutes. Its late-start evidence could therefore describe a service that would not finish before closing. The initial child-process `spawn EPERM` is retained separately in `service-capacity-before.log`; the actual assertion was reproduced using Node's supported in-process test isolation.
- Independent review found that the existing availability engine does not enforce checkout's configured lead/advance window. `service-capacity-lead-before.log` reproduces a 09:00 start inside a two-hour lead requirement. The new private reader applies the exact current Engine keys, defaults and bounds used by checkout before computing date/global totals. The public booking route is unchanged.

## Implemented boundary

The existing `get_availability` tool now supports one exact own-service selection over one to seven dates. Previously saved three-field arguments remain valid. Strict arguments reject another business/customer ID, supplied duration/prices, duplicate option choices and invalid dates. The reader reuses canonical saved-option duration calculation and canonical interval/assignment/booking/hold/blockout checks. Required options must be selected explicitly; a saved duration range uses its **maximum**, which the UI and model evidence identify. Missing/invalid/truncated evidence is unavailable rather than invented free time.

Services and Availability grants, current ownership, active staff membership and assigned professional are checked before and after reads. Sources and selected style IDs are restricted to the authenticated business. No cross-business customer conflict lookup occurs. Complete totals count **overlapping start-time alternatives**, never additional appointments. The API shows at most 42 starts; assistant projection shows at most 12 and retains full totals, excerpt flags, exact dates/times and validated own calendar links. Follow-up planning/answers refresh records and revoke old derived prose when authorization or facts change.

The new monitored `GET /api/salon/service-capacity` joins this read to an independently verified historical positive-contribution/fewer-appointments candidate. It retains the existing earnings/bookings/styles and business-finance scope intersection before and after the read, plus Availability. A changed historical fingerprint or missing recommendation fails closed. No financial value is fabricated or recalculated by the capacity read.

The contribution panel offers an explicit check only for a qualifying candidate and authorized role. Required saved options, first date, checked period/timezone, duration/buffer, total/shown count and calendar links are visible in English, French, Spanish and Simplified Chinese. Date/choice changes and pending/failed refreshes suppress prior start links. Existing cost-review workflows remain intact. Calendar links select the actual date/professional; they do not reserve a slot or claim customer eligibility, profit or demand.

## Verification

- `service-capacity-focused.log`: **12/12** new cases passed, including actual dispatcher and planner/answer projection, lead/advance limits, required choices, ranges, own staff/tenant boundaries, revoked permission and assignment, truncated/changed evidence, complete duration/buffer overlap, exact counts/links, API safe error references and four-language key/placeholder parity.
- `service-capacity-presentation.log`: the additional direct-presentation case passed in all four locales; missing required choices cannot render as zero availability. **13 unique new Node cases pass.** `service-capacity-monitoring.log`: the complete route inventory check passed at 166 API routes.
- `service-capacity-regressions.log`: **69/70** existing calendar, assistant execution, tool/schema cases passed. The remaining existing canonical-identity case needed its VM fixture to provide `URLSearchParams` and the new strict service source; original identity assertions are unchanged. `service-capacity-execution-after.log`: that remaining case passed. **70 unique existing cases have passing evidence.**
- `service-capacity-types-final.log`: full TypeScript exit 0. `service-capacity-lint.log`: scoped ESLint exit 0. Final source independently reviewed by `reconciliation_review`; no outstanding concrete blocker found in the inspected boundary.
- `combined-191-focused-browser.log`: all **14/14 Business service capacity** cases passed on local production build191 in Chromium and WebKit: four languages at phone/tablet/desktop/landscape sizes, controlled pending/failure/recovery at320px, and staff with/without Availability. These are seven tests in `business-service-contribution.spec.ts`, executed in both engines with isolated API fixtures. The full mixed-feature run was **26 passed,4 failed**; its unrelated stock-label/navigation failures are preserved, so this is not a passing whole-run claim. Build log: `combined-191-build.log`. Both `combined-191-source-before.json` and `combined-191-source-after.json` retain digest `d60209a48bccb3c232aa8f81eff987b32549a9ae6805528e24f4271f5a6fa04c` across the browser run. No additional build/server/provider process was launched for this review.

## Saved build191 visual review

Seven actual saved images were inspected: all four WebKit locale/size cases, the320px failure in both engines, and Chromium English390px. The checked choice/date,180-minute maximum duration plus15-minute buffer, selected dates/timezone, two overlapping start alternatives and real calendar actions are readable in the inspected result captures. Business-provided option/professional names remain original text. The failure captures retain the changed date and required selection, remove old calendar starts and show a recoverable verification error; the full incident reference is readable in the Chromium capture. No concrete capacity-form clipping or lost-control defect was established by these images.

| Capture | Actual inspected file under sibling `redesign-evidence/combined-191-focused-results` |
|---|---|
| English390, WebKit | `business-service-contribut-9e680-calendar-alternatives-in-en-webkit/service-capacity-en-390.png` |
| French768, WebKit | `business-service-contribut-205a0-calendar-alternatives-in-fr-webkit/service-capacity-fr-768.png` |
| Spanish1440, WebKit | `business-service-contribut-22c10-calendar-alternatives-in-es-webkit/service-capacity-es-1440.png` |
| Simplified Chinese844 landscape, WebKit | `business-service-contribut-53e34-endar-alternatives-in-zh-CN-webkit/service-capacity-zh-CN-844.png` |
| Failed changed selection320, WebKit | `business-service-contribut-7d08b-lection-and-retains-choices-webkit/service-capacity-failure-320.png` |
| English390, Chromium | `business-service-contribut-9e680-calendar-alternatives-in-en-chromium/service-capacity-en-390.png` |
| Failed changed selection320, Chromium | `business-service-contribut-7d08b-lection-and-retains-choices-chromium/service-capacity-failure-320.png` |

These are **component captures**, not complete initial workspace viewports. Fixed shell header/navigation appears within or is clipped by several tall captures; that alone neither proves a runtime overlap defect nor establishes that the initial workspace and every action clear the chrome. The short landscape capture contains that same limitation. This review does not establish actual-device keyboard behavior, native-speaker copy quality, every empty/excerpt state, real business data, hosted authorization, provider interpretation or live booking availability. The fourteen passing cases supply functional fixture evidence separately from this bounded visual inspection.

## Practical limits

This checks present bookable alternatives for the chosen future dates, separately from the historical contribution period. It does not forecast demand, calculate net profit, pack overlapping starts into an appointment capacity total, reserve time, verify a particular customer's conflicts/eligibility, or promise availability at booking. Existing canonical booking checks run again. Oversized/unsupported saved option structures fail closed for review. Required CI, hosted authorization and actual deployment remain outstanding release evidence.
