# EXEC-06 isolated business demonstrations — 19 September 2026

Status: **AUTOMATED ONLY; all14 demo browser cases pass on build194 after the three CI locator corrections.** This slice does not establish complete EXEC-06 or hosted business workflow acceptance. See `BUSINESS-DEMO-VISUAL-REVIEW.md` for preserved before/after evidence and exact limits.

## Inventory and boundaries

Root recorded the authorized read-only production aggregate before this work: 31 businesses, 25 active and marketplace-visible, 342 published services, 71 active published professionals, zero registered test businesses, and 20 candidates meeting the stated cover/description/gallery5/services3/professional1 content criterion. This agent made no database/provider request and does not independently claim those counts were queried again. No real identities, bookings, transactions, reviews or other records were changed or seeded. Existing real marketplace content remains intact; the ordinary `/site-access` page was not edited.

The explicit `/site-access/business-demo` route now contains four fictional scenarios: a solo natural-hair studio, multi-professional braiding studio, loc-maintenance studio and mobile occasion-hair team. Their 16 services, eight fictional professionals and 25 sample appointments are isolated in a demo-only data module. Every page retains the fictional/read-only notice and fixed September14–20,2026 period. Reserved administration, break and travel blocks are labelled separately. No reviews, recorded payments, real customer accounts or simulated assistant replies are introduced.

The existing shared calendar renders these local samples. Controls filter only the selected sample roster, reset to the fixed week and retain native calendar navigation. Scenario/view choices use validated demo-only URL parameters and native browser history; no route fetch, account session, storage or API operation is added by the demo components. Existing global application language/brand configuration is not replaced or bypassed. Real tools retain their ordinary business-login destination.

All four required interface languages have complete local dictionary parity. Sample names and service identities remain original example content, explicitly labelled as English. Controls have44px minimum targets. Menu/team cards reuse existing dashboard styles. The demo opts into the shared calendar's new title-first event ordering; its default ordering and the real business shell are unchanged.

## Reproduced before implementation

`business-demo-scenarios-before-render.log` preserves the actual old component render failing the four-choice regression: zero scenario options versus four required, with one hard-coded generic Demo Studio. Its old headline24 appointments/$2,840 was unrelated to its three displayed events. The initial process-isolated Node invocation failed to spawn withEPERM before executing the test; the same regression then ran with Node’s supported `--test-isolation=none`, producing the real assertion failure. No application change preceded that render failure.

## Implemented and checked

- Four distinct service menus, professional assignments and non-overlapping per-professional schedules; dates and names remain clearly synthetic.
- Weekly summaries derive from the displayed appointments and exact menu cents, including pending examples and excluding reserved blocks. Listed service value explicitly means neither money received, revenue nor forecast. Expected values/hours: solo$440/6.75h; braids$1,450/26h; locs$505/7.5h; occasion$745/8.25h.
- Four-locale rendered notices/navigation, complete dictionary keys, deep-link normalization, sample-professional filtering and disconnected-source checks: **7/7 Node PASS**, recorded in `business-demo-scenarios-after.log` outside Git.
- Full TypeScript and targeted ESLint: **PASS** (`business-demo-types.log`, `business-demo-lint.log`).
- Browser spec `business-demo-scenarios.spec.ts`: **14/14 PASS** on production build187, seven cases per engine. Covers four locale/layout combinations, original content and totals, services/team/calendar,44px controls, filtering/reset, reload/history, invalid links, no overflow, axe accessibility, forbidden business/provider requests, ordinary destinations and two initial-content mobile geometries. Original failures and precise corrections are in the visual review; no assertions were weakened.

Independent source review by `reconciliation_review`: **PASS**. The reviewer found no concrete blocker in sample arithmetic/assignments, pending/reserved labels, scenario-state reset, normalized demo-only URL inputs, disconnected transport or fixtures that reject unexpected business/provider requests. This is source review, not browser acceptance.

Root coordinated the successful build/browser run and inspected corrected phone/landscape screenshots. No production mutation, provider call or deployment occurred. Existing real-business record and hosted acceptance obligations remain separate.

## Later CI locator boundary — 0af98ff

Release run35456360463, shard1 job105932226478, reported three demo failures: French768 and Spanish1440 disclosure focus matched two summaries; English390 initial-calendar control measurement returned a null bounding box. The original log, screenshots and traces are preserved outside Git in `ci-0af98ff-shard1-job.log` and `ci-0af98ff-shard1-artifact/`. Artifact10588635604 was downloaded without rerunning the workflow. The shard's fourth failure belongs to Finance and is tracked separately.

The actual before-action snapshots contain two copies: hidden streamed `DIV#S:1` and the rendered workspace. `ci-0af98ff-demo-trace-boundary.json` records their decoded ancestor paths. The page-wide CSS disclosure locator included both. The English trace fails at its first measurement, the label-based scenario selector, while its screenshot and accessibility snapshot show the visible named combobox. The hidden duplicate ID/label was selected instead. This is demonstrated by the original trace, not inferred from earlier local passes.

The test-only correction scopes disclosure interaction to the accessible main and addresses the scenario control by its exact combobox role/name. Each44px assertion now first requires visibility and a non-null rendered box; all four navigation controls must exist. Keyboard, disclosure contents, saved URL/history, exact sample values, initial-content geometry, accessibility and forbidden-request assertions remain. Geometry queries already operate inside accessible regions/articles and need no page-wide selector change. No application source, timeout, retry, sleep or assertion threshold changed.

Targeted spec ESLint and diff checks: **PASS**. Independent read-only review: **PASS**. The parent-coordinated build194 after-check now passes **14/14** demo cases in Chromium and WebKit; the historical local result is not reused as proof of this correction.

`../redesign-evidence/combined-194-browser.log` records the exact14 passing demo cases, including original four-locale workflows and both initial-content geometry cases with the corrected visible-control locators. The whole mixed-feature run is **42 passed / 8 promotion failures** (3.3 minutes), not a passing whole-run or release claim. `combined-194-build.log` passed; `combined-194-source-before.json` and `combined-194-source-after.json` retain the identical837-file digest `3b2e71fc92faceea8a6ce4ba39f51424d029581b627f89daff25855afca3e7ab`. The subsequent compiled change is limited to three promotion option-value attributes and does not change the demo source or these preserved results.

These are local disconnected demonstration fixtures, not real business operations, provider acceptance or hosted deployment. No additional screenshot review, browser rerun or provider action was performed while recording this result; the earlier bounded visual review remains separately attributed to its captures.
