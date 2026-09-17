# Explicitly saved Assistant context

The owner Assistant previously lost all context on refresh. The existing business-action audit did not provide user-controlled conversational memory. This batch adds an explicit, actor-and-business-scoped context bookmark; it does not store chat transcripts or introduce a second business database.

Owners may save up to six successful service, product, professional, profile, policy or plan topic references and their response language. Save is opt-in and replaces the previous bookmark. Resume rereads the bookmark, checks expiry and current permissions, and starts a fresh conversation. Every subsequent business question still performs an authorized current-data read. Customer records/messages, booking context, earnings, write proposals and arbitrary free text cannot enter the bookmark. Delete remains available after subscription expiry. Account deletion cascades to the bookmark.

Context expires after 30 days. The UI explains that expired context cannot be resumed and is removed by a daily cleanup; independent business audit retention is unchanged. Cleanup only operates on the published Production deployment and only deletes expired rows. Failed cleanup uses existing protected monitoring.

## Verification and release boundaries

- Local core tests: 282 passed, including explicit consent, body bounds, actor/business isolation, revoked permissions, expiry, deletion after plan expiry, private error handling and cleanup deployment guards.
- Chromium/WebKit: refresh, another isolated browser session, explicit resume, cross-session delete and stale-panel reread exercise the real drawer against synthetic API fixtures. Existing response-language switching regressions also pass. These are **AUTOMATED ONLY**, not real database or provider acceptance.
- A new browser regression reproduced an initially missing memory incident reference. The reference now has its own display state and remains separate from ordinary Assistant errors. Original failed log/trace is preserved in the local release evidence.
- TypeScript, localization coverage, migration order, shared operational monitoring and production build are checked before review. Language coverage is not native-speaker certification; Wolof remains founder-deferred.
- SQL isolation/retention assertions run as part of the existing clean-database CI chain. Migration `20260917185913_gcia_opt_in_memory.sql` is additive and has **not** been applied to production during implementation. It changes no AI budget/provider setting, customer booking, payment or notification policy.
- Live save/refresh/logout-login/cross-device/delete acceptance remains pending the reviewed migration and a held candidate. Do not publish this feature or mark it live solely from fixture tests.

## Other release work

PR #78 merged as `525f4103a778b95290885ee15e7bf1ffee8839af`, tree `61fb103c7a958427ff13c162d92106810753cc61`. Its required PR run [35258015071](https://github.com/girlzculture/girlzculture/actions/runs/35258015071) passed 570 browser cases with five existing viewport skips. [Release-candidate run 35258015229](https://github.com/girlzculture/girlzculture/actions/runs/35258015229) also passed, including 24 prelaunch cases. Sixteen real OpenAI calls on held candidate `6aac301530b675b3b823e033` verified the exact Spanish temporal-switch regression and French, Spanish, Simplified Chinese and English follow-ups, preserving USD120 and 90–135-minute facts. Main run [35263797230](https://github.com/girlzculture/girlzculture/actions/runs/35263797230) and its separate publication record determine that release's final state; this document does not predeclare it published.

At this batch's implementation baseline, public deploy `6aac1308b73ff70007ac9066` / commit `9063de1d72cdd276205e99b48e8f2a1c548b0a97` remains the locked rollback target for PR #78. Its public calendar conflict/preview checks and real DeepL checks passed. DeepL migration `20260916204952` was applied once; do not reapply or repair it.

Both existing monthly AI caps remain $25. Customer login is explicitly skipped by the founder; it is not a passing authenticated acceptance result. Contextual customer appointment orchestration remains a separate incomplete requirement. Physical-device speech, restricted-team live acceptance, isolated business-write persistence and protected Stripe test connectivity remain unverified. No whole-GCIA completion claim is made.
