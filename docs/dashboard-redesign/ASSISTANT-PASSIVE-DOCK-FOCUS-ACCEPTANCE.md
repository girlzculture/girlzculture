# Passive assistant dock focus — CI correction

Status: **AUTOMATED ONLY**. The demonstrated focus defect is corrected and the bounded production-build browser checks pass. This is fixture-backed rendered acceptance, not hosted owner/provider acceptance or closure of the full release.

## Failure and correction

Release run `35466416770`, head `ff4792fc695628dd57ad4e6c69481e2e651713f2`, shard 3 finished **462 passed, 1 failed, 1 skipped**. The failing WebKit promotion-date case expected the exact daylight-saving-time validation message. Its screenshot instead shows native required-field validation on an empty Internal title, so the submit never reached date validation.

The original trace shows the title still empty after its successful `fill("Own draft")` call while the automatic desktop assistant changes from closed to open; subsequent headline/date/time-zone input persists. This supports an interrupted fill. It does **not** prove that a populated title was later reset, and that trace did not capture the active element. The original screenshot and trace remain unchanged in `ci-ff4792f-shard3-artifact/test-results/business-marketing-Busines-62a39-le-wall-times-before-saving-webkit/`; the decoded timing summary is `ci-ff4792f-promotion-trace-summary.json`.

A deterministic regression then filled the title, set its cursor to position 4, and crossed the existing desktop breakpoint from 1279 to 1280 pixels. On unchanged build 199, native dialog opening moved focus to Close GC Assistant: **1 failed in 5.0 seconds**, at the retained-focus assertion. This directly reproduced the application focus defect without delaying the test past automatic opening.

`GcAssistant.tsx` now distinguishes explicit launch intent from passive desktop opening. Passive opening restores the connected outside control's focus synchronously with `preventScroll`; explicit opening still focuses the assistant. Phone modal opening and the existing Appearance focus behavior remain. No promotion data, native form validation, date calculation, save or provider behavior changed.

## Verification

All evidence paths below are relative to the sibling `redesign-evidence` directory outside Git.

| Check | Result and evidence |
|---|---|
| Original CI | **FAIL**, preserved `ci-ff4792f-release-shard3.log` and original artifact above. |
| Deterministic BEFORE | **FAIL**, `marketing-dock-before.log` and `marketing-dock-before-results/`. |
| Source checks | **PASS**, scoped lint `promotion-dock-focus-lint.log`, full TypeScript `promotion-dock-focus-types.log`, diff check and independent source/test review. |
| Shared build 200 | **PASS**, 848-file source digest `e6a62873fb60f962b87830fc6a188cabf74f8e76f25c310bac45807313dfcce2` identical before/after the production build. |
| Focused rendered AFTER | **PASS**, `promotion-dock-after.log`: **14/14 in 33.0 seconds**, Chromium and WebKit, with `promotion-dock-after-results/`. This comprises 2 dock cases, 2 original exact DST cases, 8 existing responsive workspace cases (390×844, 768×900, 844×390 and 1440×900), and 2 existing IME/multiline cases. |

The new cases assert retained focus and cursor 4, continued insertion producing exactly `Own reviewed draft`, unchanged headline, explicit close/reopen focus inside the assistant, and no writes or unexpected requests. The original DST messages, retained invalid values and no-write assertions are unchanged. No retry, arbitrary sleep, disabled automatic opening or weaker assertion was introduced.

Visual inspection compared the [WebKit BEFORE](../../../redesign-evidence/marketing-dock-before-results/business-marketing-Busines-43f1e-preserves-offer-draft-focus-webkit/offer-automatic-dock-focus.png) with [WebKit AFTER](../../../redesign-evidence/promotion-dock-after-results/business-marketing-Busines-43f1e-preserves-offer-draft-focus-webkit/offer-automatic-dock-focus.png) and [Chromium AFTER](../../../redesign-evidence/promotion-dock-after-results/business-marketing-Busines-43f1e-preserves-offer-draft-focus-chromium/offer-automatic-dock-focus.png): the BEFORE ring is on assistant Close; both AFTER rings remain on Internal title while the assistant is open. Cursor position and continued typing are established by the browser assertions, not inferred from the still images.
