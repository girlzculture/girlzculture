# Production migration gate

Normal pull requests and pushes to `main` still run the complete `verify` job in `database-migrations.yml`, including all browser engines, accessibility, security audits, build, clean-database execution and application checks. The release-candidate workflow is unchanged.

Normal CI also runs the business-card WebKit pointer/keyboard interaction 20 consecutive times and the entire business-onboarding spec using its dedicated WebKit configuration. Both checks use one worker and zero retries, then the existing accessibility and full browser suites run unchanged. These checks never run inside the manual migration path.

Run #449's trace places `context.newPage()` at 26,886 ms. The original card click started with only 2,035 ms left in the shared 30-second test budget; the trace contains the initial actionability wait, not repeated reports that the element was unstable. Fonts and category images had completed loading before the click, the category image source was fixed, and card hover/focus styles do not animate geometry. The trace does not expose the browser-internal reason for slow page creation or prove continuous geometry between snapshots.

The shared browser fixture now gives page creation its own bounded 30-second setup deadline, while retaining the built-in context's isolation/tracing/cleanup and the unchanged 30-second application test deadline. The original pointer/keyboard test is unchanged. A runner-level regression proves that slow setup no longer consumes the interaction deadline and that a slow interaction still fails. Full WebKit validation runs on Linux CI: the installed Windows WebKit build cannot decode the repository's AVIF category assets, as confirmed with a network-free image probe.

A manual dispatch takes a separate path. It requires `APPLY REVIEWED MIGRATIONS`, the canonical repository, `refs/heads/main`, and an immutable checkout of the dispatch SHA. The workflow source SHA and current remote main SHA must match that checkout.

`verify-production-migration-gate.mjs` reads GitHub Actions evidence for the latest normal **push to main at that exact SHA**. That run, its particular attempt's `verify` job, both browser steps, security audit and complete migration-chain step must all have succeeded. A PR merge-test SHA or manual dispatch cannot substitute. A newer unsuccessful or running normal push cannot fall back to an older success. Missing evidence, API errors, incomplete listings and a moving main branch fail closed. The release-candidate workflow does not run on main pushes, so it is not a substitute for this exact-commit proof. This proves the specified normal CI workflow; it does not claim to enumerate repository branch-protection settings.

The manual `verify-migrations` job has no production credentials. It runs the gate regressions, migration-order verification, repository metadata verification, and the complete migration chain against a fresh PostgreSQL 17 service. The existing clean-database runner checks security, integrity, concurrency, explicit application choices and the Engine migration marker. Additional read-only SQL checks verify the business-signup published seed, safe initial category destinations, scoped video profile and storage compatibility. There are currently 142 repository migrations; the runner discovers the full chain rather than fixing its count.

Only a successful migration verification unlocks the `migrate` job, which retains the `production-database` environment and `girlz-culture-production-database` concurrency group with cancellation disabled. That protected job requires all three existing Supabase secrets and the reviewed project identity `cuzfockthsqwubupskui`. It uses CLI `2.111.0` and repeats exact-main/CI verification after environment approval and immediately before application.

The database command sequence is: link the reviewed project, list migration history, run `db push --linked --include-all --dry-run`, recheck the source/CI proof, apply with `db push --linked --include-all`, then list the resulting history. Each step requires the preceding step to succeed. There is no history repair, automatic retry, browser rerun, skip override or continue-on-error in the manual path. The completed one-time legacy history repair and its associated baseline dump are removed from ordinary migration application.

After reviewing and merging a change, wait for its main push CI to succeed before requesting a separate, explicitly authorized manual application. If main changes while approval is pending, review its new commit and wait for normal CI before dispatching again. A missing secret, wrong project or unavailable CI API stops application; do not bypass the guard.

Local guard verification requires no database or credentials:

```sh
node --test tests/production-migration-gate.test.mjs
npm run verify:migrations
npm run verify:repository-metadata
```

The isolated database checks require an empty local PostgreSQL database using the same setup as CI. Never point `CLEAN_DATABASE_URL` at a live project. Adding this workflow does not authorize a production dispatch or apply any migration.

Implementation references: [GitHub workflow-run API](https://docs.github.com/en/rest/actions/workflow-runs), [attempt-specific jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt), [workflow environment variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables), [Supabase db push](https://supabase.com/docs/reference/cli/supabase-db-push).
