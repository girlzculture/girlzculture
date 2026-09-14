# P0 implementation and acceptance ledger

This branch is a **Draft implementation, not a launch approval**. Local fixtures and disposable PostgreSQL provide automated evidence; they do not establish live multilingual/provider/backend acceptance.

- Authority: founder-approved `Girlz_Culture_P0_Single_Authoritative_Codex_Brief.docx`.
- Starting main: `b7dbc88ad31ab22f55018e0603ead8483fd33924`.
- Branch: `codex/p0-multilingual-business-os-assistant`.
- Draft PR: [#61](https://github.com/girlzculture/girlzculture/pull/61).
- PRs 59 and 60 remain parked, independent and untouched.
- No production writes, migration application, deployment, Stripe configuration changes, subscription gate changes or search indexing rollout.

| Area | Implemented evidence and its limit | Acceptance |
| --- | --- | --- |
| A Owner localization | 67 reachable files / 1,863 source candidates: 1,660 UI sources covered in all five locales, 134 exact-context non-copy values, 69 proper-name allowances. Mandatory 38-route and 21-populated-route matrices cover five locales, 390/768/1440 and Chromium/WebKit; Firefox covers core switching. Real sign-out/sign-in controls and a fresh context cover account preference and second-user isolation with explicit API fixtures. Sensitive native review and hosted persistence remain blocked. | AUTOMATED ONLY |
| B Business policies | Structured draft/review/publish API/UI, immutable revisions and booking snapshots on public, checkout, confirmation, owner, customer, guest management and support surfaces. Six Chromium/WebKit journeys exercise the actual public profile, pre-confirmation review, booking confirmation and replacement policy at three widths using unique isolated fixture businesses. Real SQL verifies old evidence after publication plus paid/no-charge combined checkout. A stale policy review fails before Stripe. Policy enum values translate while exact original prose is preserved. | AUTOMATED ONLY |
| C Assistant foundation | Fixed schemas, fresh auth/permission/plan checks, persisted preview, explicit confirmation, atomic writes/audit, Engine budget/timeout and shared drawer. Reproduced pre-execution failure-audit gaps now retain protected Engine references without rejected raw prose. Live model acceptance is blocked. | AUTOMATED ONLY |
| D Assistant skills | Six reads and five prepared actions implemented against existing authoritative records. The ten five-locale/engine browser skill journeys exercise previews, unchanged pre-confirmation state, resulting fixture records and fallback. Server/SQL assertions independently verify tenant scope, revoked access, stale previews and idempotence. Scripted planners do not establish real natural-language understanding. | AUTOMATED ONLY |
| E Assisted setup | Existing shared planner produces one reviewable profile/hours/service draft at a time; existing import/media routes remain authoritative. Setup clarification is covered in browser journeys. Real multilingual setup and code-switching require an approved provider. | AUTOMATED ONLY |
| F Booking conversations | Immutable/idempotent welcome, original message preservation, participant authorization, per-recipient translation/cache leases and existing notifications. Customer/team/support browser journeys cover all five locales and three widths, exact originals, policy evidence and read-only support. Guest replies are explicitly deferred for token-purpose/sender-RLS security work. Hosted persistence and actual translated delivery remain blocked. | AUTOMATED ONLY |
| G Prelaunch safety | Dedicated default-off server gate; truthful configurable public state; registered-test exclusion even when live. Seven handler regressions verify off-state and registered-test rejection before Stripe, registry errors fail closed, and genuine fixture passage through the registry boundary. Ten prelaunch browser tests cover missing/off gate. SQL proves a genuine eligible fixture becomes hidden after registration. | AUTOMATED ONLY |

## Validation record

The source-level record at preparation of this commit is: **118 core tests passed, zero failed/skipped**; source localization 1,660/1,660 for en/fr/wo/es/zh-CN; TypeScript and production fixture build passed; lint zero errors / 19 warnings; design-system source/fixtures and 14 contrast tests passed. Both npm audit thresholds reported zero vulnerabilities without changing the lockfile. The complete **143-migration clean database chain** and **64 P0 SQL assertions** passed in a disposable local PostgreSQL database.

Focused browser evidence includes the 18 Assistant/recipient/account-lifecycle journeys, plus the strengthened recipient policy/name regression rerun. Full-suite exact totals, the final tested head and screenshot review are recorded in the PR's final validation report/checks, rather than inferred from source coverage. Earlier failed/aborted attempts are retained in local logs; they are not reported as successful complete runs. The real Maps test passed with the repository's existing CI test credential; missing local credentials are reported as a failed prerequisite, never converted to a skip.

Further failure investigation reproduced service-draft loss when a delayed Engine default response reinitialized every editor field. Record initialization now finishes before interactive paint, and later defaults only populate an untouched new-record buffer. Permanent browser cases cover existing drafts, explicitly edited new-record buffers, untouched defaults, save and reload. Policy recipient tests also assert native disclosure open states before interacting with nested controls.

Mandatory release-candidate CI includes source/core checks, all browser tests across three independent shards, clean database verification, security audits, TypeScript/lint/build and the separate off-state browser suite. All browser shards must pass. Normal CI's complete 447-case serial collection finished with 442 passed / five existing viewport skips but exceeded its 60-minute overall step budget during completion; it now runs the unchanged collection with two workers. Its full browser step remains in `verify`, and production evidence/dispatch guards, assertions, retries and timeouts remain intact. No workflow was manually dispatched.

Fixture gallery: `docs/screenshots/p0/` (local generated evidence, also uploaded by CI). Route inventories, policies, Assistant previews/results/outage states and recipient originals are included. Review artifacts use synthetic names and records only.

## Exact external blockers

- No approved isolated hosted Supabase project/test identities are assigned. Production and Workstream 1 backends are prohibited. Hosted signup/login/cross-device persistence, end-to-end live policy/booking/notification persistence and realtime acceptance remain **BLOCKED**.
- No approved AI provider key/model/positive cost-rate configuration is assigned. The Engine feature defaults disabled. Actual five-language understanding, code-switching, natural-language setup and real recipient translations remain **BLOCKED**.
- No isolated email/SMS/push delivery configuration is assigned. Real external transactional delivery remains **BLOCKED**; existing deduplicated delivery boundaries are tested locally.
- Newly authored sensitive Wolof and Simplified Chinese policy/payment/legal translations need founder/native review before acceptance. Bundled/source coverage is **not** linguistic/legal approval.
- Guest replies require scoped token-purpose extension, expiry/revocation/replay protections, explicit guest sender audit identity and participant RLS acceptance. Existing secure guest booking management remains intact; two-way guest chat is **deferred**, as allowed by the brief.

The existing public one-shot Beauty Concierge is expressly not accepted as complete. Persistent customer conversation/matching/booking handoff remains the next workstream before SEO. No real cards, payments, future-category launch or production changes were introduced. Keep this PR Draft, open, unmerged and undeployed.
