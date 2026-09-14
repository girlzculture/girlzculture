# P0 implementation status

This is an in-progress implementation ledger, not a completion report.

- Authority: founder-approved `Girlz_Culture_P0_Single_Authoritative_Codex_Brief.docx`.
- Starting main: `b7dbc88ad31ab22f55018e0603ead8483fd33924`.
- Branch: `codex/p0-multilingual-business-os-assistant`.
- PRs 59 and 60 are parked and must remain untouched.
- No production writes, migration application, deployment, Stripe configuration changes, subscription gate changes, or search indexing rollout.

| Area | Current evidence | Acceptance |
| --- | --- | --- |
| A Owner localization | 67 reachable files / 1,863 candidates: 1,660 copy sources covered in all five locales, 134 reviewed non-copy values and 69 proper-name allowances. The gate now includes dynamic/error/template literals and exact code contexts. 38 actual routes × five locales × Chromium/WebKit at 390px pass (380 visits), with no detected overflow or Axe violations in those states. Populated French service save/validation/retry, message-original and 21-route checks pass at 390px in Chromium/WebKit. The full production-mode matrix is running. | AUTOMATED ONLY |
| B Business policies | Structured draft/review/publish UI/API plus immutable revisions and booking snapshots on public, checkout, confirmation, owner and support surfaces. Fixed a null-policy lookup regression. Policy UI matrix passes; database proves old evidence survives later publication and both paid/no-charge combined checkout retain the accepted revision. | AUTOMATED ONLY |
| C Assistant foundation | Fixed schemas, server auth, explicit confirmation, atomic mutation/audit, budget reservation, timeout, shared dashboard drawer implemented. The toolbar no longer obscures controls. Eight provider-planning tests and eight execution-boundary tests cover authorization, bounded context, service search and retained identities. Live provider acceptance is blocked. | AUTOMATED ONLY |
| D Assistant skills | All eleven tool contracts and all five authoritative mutations implemented and exercised in local PostgreSQL. Stale previews, wrong-tenant access, revoked identity and duplicate confirmations are covered. Full natural-language and browser skill proof remains pending. | AUTOMATED ONLY |
| E Assisted setup | Shared planning/preview flow and existing import links implemented; natural-language setup/browser acceptance pending. | FAIL |
| F Booking conversations | Immutable/idempotent welcome, exact original text, recipient authorization, translation leases/cache and same-source-locale no-provider path implemented. Four reproduced inbox races now pass: sign-out privacy, awaiting-session send, outdated target-language preview and newer unsent draft preservation. Focused French browser journeys now pass in both engines, including original/translated display and exact sent text. Other locales/widths are running; full customer/support/account lifecycle acceptance remains outstanding. | AUTOMATED ONLY |
| G Prelaunch safety | Three checkout boundary regressions pass with zero provider calls. Ten prelaunch browser tests pass in Chromium/WebKit with the launch flag absent. The real publication diagnostic and existing test registry now prove that an eligible fixture is visible before registration and excluded afterward. | AUTOMATED ONLY |
| Release gates | Latest core suite: 101 pass / 0 fail / 0 skip. Complete 143-migration chain plus 64 P0 SQL assertions passes in disposable PostgreSQL (clean8). Earlier full browser: 302 pass / 7 fail / 5 existing viewport skips; focused tests confirm the policy null lookup, P0 desktop copy and narrow-login reflow fixes. Real Maps remains blocked locally by an absent test key and is not skipped. TypeScript and the compiled fixture build pass. Lint has 0 errors / 19 warnings. Both high-level and production moderate-level npm audits report 0 vulnerabilities. The current full browser run contains 410 tests. | AUTOMATED ONLY |

## Required remaining evidence

Complete populated owner workflow coverage at 390/768/1440 in both engines, including validation/save/error, user-content boundaries and account lifecycle; full Assistant natural-language skill and setup journeys; populated booking conversations and recipient translation; launch-enabled genuine-vs-registered-test fixtures; final TypeScript/lint/build/audits and browser gates; screenshot gallery visual review; final diff review; final architecture-document updates and exact delivery report. A local dev-server-only transient 404 and WebKit HMR chunk error were also observed; production-build browser verification is required rather than hiding these with retries.

## Live verification constraints

No isolated hosted Supabase project or approved external AI credential has been assigned to this P0 workstream. Use isolated local database and local browser fixtures for automated implementation evidence. Do not use production or the Workstream 1 backend. Native/founder review of newly drafted sensitive Wolof and Chinese legal/payment text remains a review gate; generated wording must never be described as reviewed legal advice.
