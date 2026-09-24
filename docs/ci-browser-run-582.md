# Browser verification run 582

Baseline: PR #86, `2fc9ebffa30ca8a842c54eb1f160f1a79e00d4b4`.
Required run: https://github.com/girlzculture/girlzculture/actions/runs/35793460178

The full browser step began at 22:50 UTC on September 22. Eight acceptance
builds ran serially until 23:07, then eight shards shared four slots on the same
runner. Shard 8 only started at 23:37. The 90-minute step deadline cancelled
it at 00:20 on September 23. Shard 4 took 55.6 minutes under contention; its
late-defaults tests passed. A focused green gate did not establish full success.

There were also two failures that must not be attributed to that deadline:

* Chromium's onboarding offline check did not find the offline heading. A
  deterministic regression reproduced the missing-heading path when optional
  precaching of `/offline` fails. The worker now provides a self-contained HTML
  offline response even when that cache entry is unavailable.
* The early-history test never reached its body: Chromium received SIGSEGV
  while creating the context. No application/history assertion failed. The
  original run preserves the crash stack. Separate runners remove contention,
  but a passing subsequent run alone will not prove the crash's cause.

## Correction

Eight matrix jobs each own one runner, one build, one app/fixture port pair and
one browser worker. Each job has a 60-minute deadline, zero retries and no test
filters. The existing Playwright project configuration is unchanged. JSON
reports are reconciled against a fresh full collection at the same commit.
Missing/duplicate tests, missing shards, wrong commits, retries, global errors,
expected-failure annotations and unsuccessful results all fail the gate.
Conditional skips are reported separately, never counted as passes.

Only reports/logs and failure traces are uploaded; eight Next build trees are
no longer part of the failure artifact.

## Focused evidence (local; not hosted acceptance)

* `NODE_OPTIONS=--test-isolation=none node --test tests/production-migration-gate.test.mjs`: 32 passed, 0 failed.
* `node --test --test-isolation=none tests/browser-shard-results.test.mjs`: 14 passed, 0 failed.
* `node scripts/verify-service-worker-csp.mjs`: reproduced missing offline HTML
  before the correction, passed afterward.
* Chromium: old-cache containment, missing-precache offline fallback, two
  late-defaults widths and two early-history controls: 6 passed, 0 failed.
* WebKit: both service-worker checks: 2 passed, 0 failed.
* ESLint for changed runner/report/test files: passed.

Full matrix verification remains required. No production data, migrations,
provider keys or Netlify settings changed as part of this correction.
