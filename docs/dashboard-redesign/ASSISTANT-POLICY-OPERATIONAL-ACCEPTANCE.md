# Assistant and policy operational corrections

Status: **AUTOMATED ONLY; not hosted or production acceptance.** Changes continue PR #80 from `4bf477de17d45473d19c3462ce42697c72a43acb`. They do not change provider configuration, billing caps, business data or production schema.

## Demonstrated causes and corrections

1. Service matching accepted a one-character insertion/deletion/substitution but rejected adjacent transpositions such as `booh braids` and partial tokens such as `knotl braids`. Matching now accepts a single adjacent transposition and a prefix of at least four characters. Results remain candidates with their actual service IDs, names and prices; Mermaid, Goddess, Boho and Knotless are not equated. Queries remain restricted to the authenticated business before matching.
2. The assistant API carried conversation and page context into planning, but discarded both when generating an answer. Follow-up references could therefore lose their meaning between phases. The answer now receives bounded conversation and page context. Historical request IDs are separately reauthorized solely for transcript safety; only the current read supplies answer facts. Foreign, missing, revoked or changed historical reads discard the associated transcript before the provider request.
3. Independent review found that prior prepared actions checked broad tool permission but did not refresh professional assignment before replaying a transcript. A regression reproduced that gap. Both planning and answer phases now reuse the existing proposal-scope guard and discard a reassigned booking's transcript.
4. Policy loading returned only the newest 30 revisions. Thirty newer drafts could hide the still-current published revision, leaving the editor with blank defaults. The API now fetches that revision separately through an authenticated-business filter. Missing or unpublished current revisions fail closed, and the editor cannot save defaults over them.
5. Policy publication success was based on the mutation response alone and the owner editor omitted a public policy link. The editor now requires fresh GET readback of the exact published revision before success and exposes the canonical public-page policy anchor. Published history and original booking snapshots remain intact.
6. The booking wizard renders desktop and mobile review panels concurrently. Its policy link used a document-wide selector, opening the hidden desktop disclosure on phones/tablets. The strengthened browser check failed in both engines. The handler now resolves the clicked review panel, opens/focuses its disclosure and retains booking inputs without navigation.
7. The assistant used discovery eligibility to describe saved-photo publication. Discovery deliberately excludes temporarily closed or paused businesses whose public profile remains readable. It now uses the public page's profile-public and registered-test checks; a failed visibility check remains unknown while verified image counts stay available.

## Evidence

Logs reside in the sibling `redesign-evidence` workspace, outside Git.

| Check | Result | Evidence |
|---|---|---|
| Original service matching and answer-context regressions | FAIL before correction: 25 passed, 2 failed | `assistant-operational-before.log` |
| Prepared-action transcript after reassignment | FAIL before correction | `assistant-proposal-transcript-before.log` |
| Assistant execution, planning, API diagnostics and professional isolation | 68 passed; simulated providers and two-business fixtures | `assistant-operational-final.log` |
| Closed-business photo visibility | FAIL before correction; 20 execution tests passed after correction | `assistant-photo-visibility-before.log`, `assistant-photo-visibility-final.log` |
| Existing immediate chat submission, pending state, single-turn retry, page persistence and IME behavior | 18 passed across Chromium/WebKit, phone/tablet/desktop/landscape; unchanged UI on the existing isolated build | `assistant-operational-browser.log` |
| Current policy hidden by newer drafts | FAIL before correction | `policy-current-before.log` |
| Policy API, editor conversion and disclosure | 11 passed | `policy-current-focused.log` |
| Targeted lint and TypeScript | PASS, including final photo visibility changes | `policy-photo-final-lint.log`, `assistant-policy-final-types.log` |
| Updated owner policy workflow and recovery | All 10 new cases passed in Chromium/WebKit across EN/FR/ES/zh-CN; actual rendered phone/desktop captures inspected | `policy-current-browser.log`, screenshots under `policy-current-browser` |
| Strengthened public-policy acknowledgement link | Original run: 2 desktop cases passed, 4 phone/tablet cases exposed the hidden-panel defect. Corrected build: all 6 passed across Chromium/WebKit with retained guest input, actual full-policy link, acknowledgement and policy replacement checks. | `policy-current-browser.log`, `operational-browser-final.log` (6 policy + 18 billing cases, all passed) |

Policy screenshots inspected: `policy-current-browser/p0-public-policy-P0-public-f8633-ks-the-published-page-in-en-webkit/policy-current-en.png` and `policy-current-browser/p0-public-policy-P0-public-0b60e-ks-the-published-page-in-es-webkit/policy-current-es.png`. The input, rules, published history and public link are readable without horizontal overflow. These focused captures do not establish acceptance of the entire dashboard redesign.

Existing photo-count retrieval is preserved: actual own-business gallery, cover, logo and distinct-image counts; duplicate references do not inflate totals; unavailable public visibility stays unknown; private customer attachments and another business's records do not enter the result. The focused assistant suite verifies these paths rather than replacing them.

## CI-discovered unanchored answer transcript correction

The first checkpoint's required CI retained ten failures in the existing language test: the answer call passed older client prose despite an empty prior-request list. This was an actual missing authorization boundary, not a language assertion to relax. The route now omits unanchored answer transcript; the planner independently requires a historical request ID distinct from the current read, with the existing fresh business/actor/permission/assignment checks. User and assistant transcript text are both discarded when that anchor is absent. Authorized follow-up intent remains available and current answer facts remain restricted to the new read. Planning-only clarification retains its existing bounded user intent contract.

`assistant-unanchored-before.log` reproduces private user and assistant prose reaching the provider before this correction. `assistant-unanchored-focused.log` verifies 79/79 assistant language/planning/execution/route cases, with the original ten language assertions unchanged. `assistant-core-all-after-anchor.log` verifies 551/551 P0 cases on the combined working tree, including new onboarding/marketing cases; this is local automated evidence, not CI or real-provider acceptance of a released commit.

## Remaining hosted acceptance

- On the final held candidate, ask about an actual business's Boho service using ordinary wording and a spelling variation, then a follow-up. Confirm names, prices and durations against its authorized records.
- Ask the actual saved-photo count and a referential follow-up from a different dashboard section. Use a second authorized business to verify isolation. Do not claim native-speaker linguistic quality from fixtures.
- Perform a bounded policy edit/review/publish/readback using authorized test content; verify public disclosure and acknowledgement without a real customer charge or notification, and preserve accepted historical terms.
- The existing OpenAI/DeepL provider successes remain valid for their original source. These changed answer-context paths still need bounded real-provider acceptance on the final candidate.
- Wolof remains deferred. No new live-provider tests or production changes were performed for this local correction.
