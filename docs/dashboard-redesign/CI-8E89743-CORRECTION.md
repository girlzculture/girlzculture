# 8e89743 existing CI failure diagnosis

Status: **AUTOMATED ONLY: focused corrections pass; original remote run remains failed.** No remote workflow rerun, production build or provider request was initiated for this diagnosis.

Source:8e89743b48274ce4acdb2515f31a62ec3fc9a300. Existing release run https://github.com/girlzculture/girlzculture/actions/runs/35436470116. The status snapshot and unmodified completed-job logs are preserved in sibling redesign-evidence/ci-8e89743-release-status.json, ci-8e89743-owner-core.log and ci-8e89743-browser-shard1.log.

## Strict core job105879865924

Owner source inventory and locale coverage passed. Strict P0 core then completed672 passing and1 failing test. The sole failure was the migration179 vocabulary assertion, which incorrectly compared that historical37-tool stage to the current38-tool assistant after migration180 added the reschedule proposal tool. A focused local run reproduced the exact set difference before correction (ci-8e89743-vocabulary-before.log).

The correction keeps the historical179 predecessor plus outstanding-balances equality, checks180 equals179 plus only the reschedule proposal, and checks180 against the current assistant vocabulary. Read-only risk and no-new-table/grant/mutation assertions remain. The independent existing180 retention test also remains. Both focused checks pass2/2 (ci-8e89743-vocabulary-after.log). No schema or tool permissions changed. Independent review by assistant_operational confirmed that all historical and current vocabulary equalities remain enforced.

## Browser shard1 job105879866100

Completed379 passing and4 failing cases in9.8min. All four failures were the same finance-receipt test at390x844,768x900,1440x1000 and844x390. The broad Finances descendant alert locator now matched both the genuine receipt error and the newly legitimate schedule-unavailable alert. The exact receipt error was present in the failure output.

The corrected locator identifies the Finances operation alert by direct ownership and its named Reload control. It asserts exactly one such alert and the original exact protected incident reference. Draft retention, stable retry request ID, single receipt, saved status, refresh persistence, responsive cards and typography assertions are unchanged. The schedule warning is neither removed nor made artificially successful.

The four affected Chromium cases pass4/4 against the unchanged existing production fixture build in20.1s; log ci-8e89743-finance-after.log and screenshots under ci-8e89743-finance-after-results. Targeted test-file lint passed (ci-8e89743-correction-lint.log). Other still-running CI jobs were not cancelled, restarted or treated as passing.

## Final completed results

The existing required run35436470099 and release run35436470116 have now completed at the same8e89743 source. No workflow was rerun. Final JSON status snapshots and full original logs are preserved as `ci-8e89743-{required,release}-final-status.json`, `ci-8e89743-required-final.log`, `ci-8e89743-browser-shard3.log` and `ci-8e89743-browser-shard2-pass.log` in sibling redesign-evidence.

| Existing job | Final browser result | Cause |
|---|---|---|
| Required verify105879865567 |1134 passed,9 failed,5 skipped;51.1min browser step | Eight receipt cases repeat the already corrected alert ambiguity; one product-draft period-reload case also used an overbroad descendant-alert locator. |
| Release shard1 |379 passed,4 failed;9.8min | Known receipt-alert ambiguity. |
| Release shard2 105879866022 |379 passed,4 skipped;26.4min | Passed. |
| Release shard3 105879866034 |377 passed,4 failed,1 skipped;47.6min | Known receipt-alert ambiguity, WebKit at all four viewports. |

The required job's earlier20 WebKit business-card repetitions,5 onboarding lifecycle repetitions,23 complete WebKit onboarding cases and56 focused accessibility/contrast cases all passed. Its clean migration chain, typecheck, lint and production build also passed. Production migration steps and optional billing-sandbox were skipped; the release-candidate aggregate was skipped after failures. None of these results establish live acceptance.

For the additional required-run failure, the downloaded immutable artifact `ci-8e89743-required-artifact/test-results/business-finances-Business-f43f5-ding-and-failed-period-read-chromium/error-context.md` confirms the only remaining descendant alert was inside **Schedule opportunities**: “Unavailable, not zero.” The finance operation error was gone, August records had loaded and the product/stylist/quantity/price/client draft remained intact. The same case passed in the independent release shard, explaining its timing-sensitive broad locator without treating a repeat as a fix.

The test-only correction scopes the period-read error to the Finances-owned alert containing Reload, asserts exactly one with the original incident reference before retry, and still requires that precise operation alert to disappear after success. It additionally verifies that the unrelated real capacity-unavailable warning remains. All retained-field assertions and request gates are unchanged. The two shared service/product variants now pass on both engines: Chromium2/2 in `combined-183-mobile-calendar-browser.log` before the unrelated landscape stop, and WebKit2/2 in the final34/34 `combined-183-final-mobile-calendar-browser.log`. The intervening application change affected only Calendar spacing; Finance source stayed unchanged. No application source change was needed for these CI failures.
