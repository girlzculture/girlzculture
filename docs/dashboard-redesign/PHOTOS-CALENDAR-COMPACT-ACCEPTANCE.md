# Photos and Calendar compact mobile acceptance

Status: **FAIL before; bounded final browser and visual checks PASS, AUTOMATED ONLY.** No production change or provider request.

## Final bounded results

The corrected production build passed with identical before/after digest `bc3a57809a3a5a60141e27ffe0438f83f6b22e3dc8e8d3da625e4cca55f0d200` across 803 application/assets/config files. The final affected group passed **34/34** in 2.7 minutes: six Calendar geometry/control cases, eight overview/calendar cases, eight profile/photo persistence cases, ten operational Calendar original-name/search cases, and two remaining WebKit Finance draft-recovery cases. Log: `combined-183-final-mobile-calendar-browser.log`; captures: `combined-183-final-mobile-calendar-results`, outside Git in sibling redesign-evidence. Original-name/search coverage includes the existing Wolof record-preservation case; it does not verify Wolof assistant answers or remove that deferral.

The earlier **6/6** Photos geometry/interaction passes on both engines remain valid because Photos source did not change during the subsequent landscape Calendar correction (`combined-183-photo-geometry.log`). Root visually inspected the WebKit390 Photos and final Calendar390/844 landscape viewport captures. Gallery/date content is within the usable initial viewport, and labels and 44px controls remain visible. The landscape capture only establishes the first visible date area, not that a full week fits without scrolling. Original failure logs and the unchanged geometry thresholds are preserved below. Required updated-source CI, full14-section/editor visual coverage and hosted persistence remain separate outstanding release checks.

The chronology below records prior pending states and the actual correction sequence; this final section supersedes those pending local-browser statements.

## Reproduced on existing production fixture build

Six permanent geometry regressions measure the actual gallery/calendar data region at initial scroll zero against the sticky header and fixed bottom-navigation bounds. They require at least96px of actual content on the two portrait sizes and48.75px in844x390 landscape. No fixed delay or assertion weakening is used.

| Surface |320x844 data top|390x844 data top|844x390 data top|Before result|
|---|---:|---:|---:|---|
|Photos|1026.8px|954.8px|683.6px|3/3 FAIL: data below usable viewport|
|Calendar|1052.0px|920.0px|559.6px|3/3 FAIL: dates below usable viewport|

Original logs, screenshots and traces are outside Git in sibling redesign-evidence/photos-compact-before.log, photos-compact-before-results, calendar-compact-before.log and calendar-compact-before-results. The initial sandbox spawnEPERM happened before test execution; the permitted local fixture run above produced the real failures.

## Correction

Photos keeps primary upload immediate and replaces the mobile summary/upload/cover stack with a labelled, keyboard-operable disclosure. Its expanded region retains all four metrics, the large upload invitation, current cover preview, cover/logo destinations and public-gallery link. The desktop region remains visible. Category filters and photo cards follow the closed toolbar. Upload metadata, save/concurrency/recovery and gallery persistence code is unchanged. The added label has explicit EN/FR/ES/zh-CN copy.

Owner Calendar uses a compact heading and professional/appointment toolbar. The existing open/full-day control follows the calendar on mobile and retains its desktop order. An optional compactHeader calendar layout combines view/date/search controls, removes the repeated visible phone heading and keeps the current date accessible; all view, previous/next/today/date/search actions remain present. Only the owner enables compactHeader. Other calendar consumers keep their original header branch. Booking and closure interval/filter logic is unchanged.

## Required verification

- AFTER: six new cases on Chromium and WebKit (12 total), including disclosure metrics/navigation, category-aware upload, editor entry, calendar professional/date/today/search behavior and preserved secondary actions; no mutation is needed for geometry.
- Affected existing tests: profile/photo save/failure/reload at four sizes; overview/calendar filtering/navigation at four sizes; operational calendar names/search in existing locales. Existing canonical appointment-save and conflict tests remain required release gates.
- Visually inspect new portrait/landscape screenshots. Complete all14-screen visual acceptance is not implied by these two corrections.
- Static: photo dictionary checks2/2 PASS; targeted component/browser lint PASS (photos-calendar-compact-lint.log). Shared TypeScript found no errors in this slice but reported two nullable-reference errors in the separate, then-in-progress serviceContributionServer; that owner was notified. Parent final combined TypeScript is still required.
- Independent source review: reconciliation_review found no blocker in Photos disclosure, preserved persistence paths, Calendar default-false option, owner-only use, accessible controls and full-day action preservation. This is not a substitute for the pending after-build geometry/interaction run.

No live acceptance, hosted save or release claim is made here.

## First combined-build findings

On the combined183 production fixture build with digest prefix61f92458, Photos' six geometry/interaction cases passed on Chromium and WebKit. Its source has not changed since those results. Parent visually inspected the corresponding captures. Four existing Chromium overview/calendar cases and both new portrait Calendar cases also passed.

The844x390 Calendar case exposed a remaining actual landscape defect: dates began at282.625px and only43.375px remained above the bottom navigation, below the unchanged48.75px requirement. Original evidence is `../redesign-evidence/combined-183-mobile-calendar-browser.log` and `combined-183-mobile-calendar-results/dashboard-overview-calenda-38daa-d-keeps-controls-at-844x390-chromium/calendar-initial-viewport.png`. This was a real rendered failure, not a locator issue.

The follow-up applies only below1024px width and at most600px viewport height. It reduces the heading from24px to20px, subtitle margin from4px to2px, outer/inner vertical gaps from12px to8px and controls-to-dates margin from12px to8px. The title, timezone, professional selector, actions and every44px control remain visible. The geometry assertion is unchanged and now also checks five main control heights remain at least44px. Full TypeScript and targeted ESLint passed (`calendar-landscape-types.log`, `calendar-landscape-lint.log`). **The landscape follow-up and remaining affected-browser cases still require the parent's rebuilt production fixture run.** No unrelated Photos or product correction was made for this failure.
