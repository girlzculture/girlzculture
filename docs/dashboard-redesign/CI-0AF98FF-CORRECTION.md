# CI correction evidence for 0af98ff

Status: **AUTOMATED ONLY; updated-source CI and hosted acceptance remain required.** Original failures and artifacts are preserved outside Git in sibling `redesign-evidence`. No original workflow was rerun and no assertion, skip, retry or timeout policy was weakened.

The original source is `0af98ff91c6f42d4c5504ade40e098ec1ed78d56`, PR80. Release run [35456360463](https://github.com/girlzculture/girlzculture/actions/runs/35456360463) has these completed results:

| Job | Original result | Demonstrated cause |
| --- | --- | --- |
| Owner localization / core | 880 passed, 4 failed | Four service-contribution tests supplied an obsolete partial Finance summary; the new rankings correctly require the canonical period, currency and category shape. |
| Browser shard1 | 438 passed, 4 failed | Three demo locators selected hidden streamed duplicate controls; the fourth treated an original IANA time-zone identifier as English interface copy. |
| Browser shard2 | 436 passed, 1 failed, 4 skipped | Same Finance identifier boundary in WebKit. |
| Browser shard3 | 440 passed, 1 skipped | No new failure; existing tablet-landscape promotion-swipe skip retained. |

The protected sandbox billing job remains skipped because its explicit credential/input gate is unmet. That is not evidence of provider acceptance.

The required database/verification run [35456360465](https://github.com/girlzculture/girlzculture/actions/runs/35456360465) failed at the broad browser step's 60-minute overall limit. Its 1,324-case collection recorded **1,236 passed, 2 failed, 4 skipped and 82 without a completed result**. Both reported failures are the same Spanish Finance identifier assertion in Chromium and WebKit. All preceding migration/schema, static/build and 104 focused browser checks passed; production application jobs were skipped. The killed full run did not finalize its HTML report: the uploaded HTML still describes the earlier 56-case accessibility step. It must not be presented as a full-suite pass. The complete job log and partial failure artifacts are preserved.

Only that overall browser-step envelope changes from 60 to 90 minutes. All tests, assertions, two workers, zero retries, the default test budget and existing explicit test budgets remain. Independent comparison matched all 1,324 unique release cases against the 1,242 completed required cases. The remaining 82 took 586.3 seconds combined in the preserved release runs; scaling by the observed required-run slowdown estimates about 8 additional minutes with two workers, excluding overhead. This supports the extra overall headroom; it does not guarantee a passing new run. Evidence: `ci-0af98ff-required-envelope-analysis.json`. All **32/32** protected-migration guard regressions pass after the workflow edit (`ci-envelope-migration-guards.log`). No migration authorization condition or application step changed.

## Corrections and focused evidence

- The service-contribution stub now uses the real `summarizeOperatingBooks` builder with its requested period. Original contribution, permission, isolation and history assertions remain. The actual before run reproduces four `FINANCE_INVALID_RECORD` failures; the first sandbox `EPERM` attempt is retained separately and is not defect evidence. After: **18/18** contribution/rankings Node checks pass (`ci-0af98ff-contribution-after.log`); independent review passes.
- Demo disclosure/control locators now target the accessible main and exact named combobox. Original traces show hidden `DIV#S:1` duplicates. Keyboard, four navigation controls, geometry, history, exact sample facts and forbidden-request assertions remain. After: **14/14** Chromium/WebKit checks pass in `combined-194-browser.log`. See `BUSINESS-DEMO-SCENARIOS-ACCEPTANCE.md`.
- Finance marks only original professional names and the canonical IANA identifier `translate="no"`. All surrounding UI still uses translation. Exact twelve retained tied names, original identifier, currency, period and ranking are asserted. After: **18/18** tab/ranking browsers pass on194. The exact original empty-team cases separately pass **8/8**, all four languages and both engines, on195 (`combined-195-finance-empty-browser.log`,20.3seconds). The unchanged strict locale checker passes; it was not relaxed.

## Integrated source boundaries

Build194 passes with identical before/after837-file digest `3b2e71fc92faceea8a6ce4ba39f51424d029581b627f89daff25855afca3e7ab`. Its focused50-case run has **42 passed,8 promotion failures**; it must not be described as wholly passing. All14 demo,18 Finance and8 pickup cases pass, as do two promotion DST validation cases. Promotion failures exposed a separate application enum defect and a test recovery interaction, recorded in `PROMOTION-DATE-ACCEPTANCE.md`.

Build195 passes with identical837-file digest `33851b2787089932aaec1d08e8842dc14cd391089d9fa341e64cf75149206b12`. The only compiled change after194 is explicit canonical values on three promotion status options. Full TypeScript, scoped changed-file lint and four-language localization pass;194 full lint had0errors and14existing warnings, and design/contrast checks passed. These results do not establish changed live-provider behavior, remote migrations, final CI or publication.
