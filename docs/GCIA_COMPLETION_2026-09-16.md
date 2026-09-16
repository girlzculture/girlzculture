# GCIA completion acceptance — 16 September 2026

This is the current acceptance record. It does not certify completion while live or physical-device evidence is missing.

## Authorization and release baseline

The founder explicitly authorized execution of `GCIA_Codex_Completion_Prompt_2026-09-16.md`, including routine merges, reviewed migrations through the protected production workflow, held-candidate verification and deployment. Required gates, account controls, the existing $25 owner / $25 customer monthly caps, customer-data isolation and the marketplace prelaunch flag remain intact.

- PR #69 merged with expected-head guard `cc8e91d388f287ce37c9584215f9ab372c7200e5`.
- Merge: `219f5a9e4404140be42d56f5bffc12fc6cf05b02`. Tree `35ef9b976ce1ab038e600f55dd84a36709adaa7f` exactly matches the reviewed candidate.
- PR CI and release checks passed; an independent local core run passed **191 / 0 / 0**. The first local attempt was blocked by Windows sandbox worker-spawn permissions; the approved unsandboxed run passed.
- Exact-main CI: https://github.com/girlzculture/girlzculture/actions/runs/35148729892 — **PASS**. Full browser section: **512 passed / 5 skipped**. The five skips are viewport-specific mobile contracts on desktop/tablet-landscape projects; corresponding phone projects exercise those cases. Google Maps is not among those skips.
- Published baseline / rollback: `585f501b490f29ed5c3be63accfc36eddd1ddd04`, deploy `6aaadcf3827d520008801ce8`. Publication locked; independently unchanged after merge. PR #69 is not published yet.
- Production Supabase metadata: healthy; 149 migrations through `20260915133423`. No production schema or application data changes made in this continuation. Provider environment configuration is being coordinated separately; existing feature/budget settings remain unchanged.
- Follow-up implementation: `codex/gcia-direct-providers-completion`, based on the merged PR #69.

## Provider evidence and secure handoff

Site `girlzculture`, ID `e7da549f-eb32-48e2-9d78-ca06fe2fb91a`.
Site-level environment metadata did not contain `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `DEEPL_AUTH_KEY` or `DEEPL_API_URL`. The authenticated official Netlify CLI independently confirmed their absence; the team shared-variable inventory was empty. Absence from the site list is not proof of an unconfigured live gateway. No secret values were printed or written to local files. The connected Netlify browser has no authenticated session.

PR #69's held production-context build is ready: `6aab00880e9a9300094a3813`, commit `219f5a9e4404140be42d56f5bffc12fc6cf05b02`, unpublished. No live authenticated AI acceptance has been performed on it. The founder has been asked to enter only the two provider secrets directly in secure Netlify production Functions settings and give nonsecret confirmation of the OpenAI credit/spend configuration. No full provider-account password or admin key is needed.

Production feature metadata confirms OpenAI `gpt-5.4-nano`, 500 daily requests each and 2500 cents monthly each for owner/customer. Translation drafts are disabled, test provider, zero monetary budget, 25 daily requests. No settings were changed.

Direct credentials must be entered securely in Netlify **production context**, scope **Functions** (and Runtime if required by the adapter), never in untrusted deploy previews or repository files. Endpoint/key pairs must be configured together before rebuilding a held production candidate. Proposed translation approval is `deepl` / `deepl-api-free`; reasoning stays `openai` / `gpt-5.4-nano`. No recharge, purchase, subscription or paid DeepL endpoint is authorized. The reported OpenAI $50 purchase is not yet independently confirmed as an available balance or spend limit.

The founder subsequently confirmed entry of both provider keys. Non-production assignments were removed by value IDs, and both keys are now secret, production-only, Functions/Runtime scoped. Their production values were preserved. `OPENAI_BASE_URL=https://api.openai.com` and `DEEPL_API_URL=https://api-free.deepl.com` are production-only Functions/Runtime variables. No values were exported or logged. Existing approved model/provider allowlists and feature budgets remain unchanged; DeepL activation is still outstanding.

After automatic approval review required specific approval, the founder explicitly approved one held main build. Candidate `6aab0f23657256296bd5224f` is ready at `219f5a9e4404140be42d56f5bffc12fc6cf05b02`, production context, `published_at=null`. The guard independently confirmed the exact main SHA and locked published baseline before creating it. The founder signed in on this candidate securely.

**FAIL — real provider acceptance, 22:02 UTC:** the first English free-form inventory request returned `ASSISTANT_UNAVAILABLE`. Browser reference `bd4ee3ba-5b58-405d-98bd-410619216ace` exactly matches the protected production event at this release. The event was in the planning stage; a one-cent usage reservation was finalized `failed` / `PLANNER_FAILED`. No authorized service read or answer completed. Further provider requests stopped. Existing code discards every non-success HTTP response, so the precise HTTP status/category was not retained and cannot be inferred from this event. This does not prove a bad key, insufficient credit, model denial or invalid schema.

A focused follow-up adds bounded, fixed-category HTTP diagnostics to the protected event/usage ledger, preserving the public error code and incident reference. Raw provider prose, headers, credentials, prompts and schema echoes are not logged. A regression failed before correction. Requests reject redirects and never retry automatically. This diagnostic correction does not itself establish a successful live assistant response.

The candidate's deterministic services quick action independently passed: **16 services**, a clearly labeled four-service excerpt and 12 additional services. This verifies the authorized read path, not the failed free-form provider path. The diagnostic follow-up passes **218 core tests / 0 failures / 0 skips**, TypeScript and affected-file lint. The original live failure remains recorded above.

PR #70 (`b5836e5480c9fb99aa696cc3fc9ad7ea97f74ee9`) is Draft/open, with DeepL and speech changes; CI is still running. PR #71 (`026926d17eac1826fff5be17080e964476e39016`) contains safe provider diagnostics and is also Draft/open with CI running. Dashboard page context, canonical entitlements and a new-conversation control form a separate follow-up on `codex/gcia-dashboard-context`. They are not in the held candidate or PR #70/#71.

## Acceptance matrix

| Scope | Status | Evidence / remaining boundary |
| --- | --- | --- |
| PR #69 planner exclusivity, inventory excerpt, support reference | AUTOMATED ONLY | Exact-tree CI and 191 local core passes. Original live failures remain in the preceding planner record. |
| Direct OpenAI runtime and real five-language service follow-ups | FAIL | Authenticated held candidate's first English request failed, exact protected reference above. Remaining languages not run. Safe diagnostic correction requires a new reviewed candidate. |
| DeepL Free adapter | AUTOMATED ONLY | 14 focused adapter/route tests pass: mappings, Free origin/auth, no retries, fact preservation, private-message separation, authorized metadata and exact protected incident references. Real quota and translation not yet exercised. |
| Translation provider governance | AUTOMATED ONLY | All 150 migrations and 16 DeepL SQL assertions pass on a fresh local database. Reviewed production application remains outstanding. |
| Owner approved reads/prepared changes and audit | AUTOMATED ONLY | Existing platform services retained. Live isolated save/refresh/role acceptance outstanding. |
| Whole-dashboard/page-aware help and plan entitlements | AUTOMATED ONLY | Section-only context, controlled navigation across dashboard sections, canonical plan prices/features and permission-scoped usage counts implemented in the separate context batch. Live provider wording remains unverified. |
| Period comparisons, performance, finance and trends | BLOCKED | Existing booking-value aggregates remain explicitly distinct from cash sales; broader implementation and live acceptance remain outstanding. |
| Conversation memory and tenant isolation | AUTOMATED ONLY | Existing bounded conversation mechanisms retained; audit and live role checks outstanding. |
| Dictation and spoken answers | AUTOMATED ONLY | Explicit installed-device voice playback, pause/resume/stop, account/language/close cleanup, no autoplay or paid audio API. Five core speech checks plus 20 real-browser UI tests pass. Browser voices are simulated in those tests; physical-device/native-language quality remains BLOCKED. |
| Customer search, follow-ups, booking/support workflows | BLOCKED | Existing implementation being audited; no real notifications or charges permitted for testing. |
| Prior launch corrections | AUTOMATED ONLY | Existing CI evidence plus historical live checks in the dated handoff; fresh acceptance outstanding. |
| Production publication | BLOCKED | Held candidate, exact-main checks, authenticated real-provider acceptance and secure configuration required. |

## Implementation and validation notes

The translation adapter uses only `https://api-free.deepl.com`, rejects redirects, requests current stable language support from `/v3/languages?resource=translate_text`, checks `/v2/usage`, and requests `/v2/translate` with `DeepL-Auth-Key`. App mappings explicitly include `en-US`, `fr`, `es`, `wo`, `zh-Hans`; an unavailable target fails before the translation POST. Wolof quality/support is not inferred from its locale code.

Protected names, numbers, URLs, formatting placeholders and booking tokens must survive exactly. No translated text is cached globally. Existing booking cache remains keyed by message, locale and source hash after authorized booking lookup. Private message-display translations no longer duplicate message prose into the global editorial draft queue. UI translations remain unpublished reviewable drafts.

The local migration permits DeepL only for `translation_drafts` / `deepl-api-free` and adds a service-role-only, row-locked character reservation using the existing usage ledger. It does not enable a feature or change a monetary cap. Failed/uncertain reservations are retained conservatively; account usage and API Free enforce the quota without paid fallback.

Official references checked September 16:
- https://developers.openai.com/api/docs/models/gpt-5.4-nano — existing model, structured output support, $0.20 input / $1.25 output per million tokens.
- https://developers.deepl.com/docs/languages/using-the-languages-api
- https://developers.deepl.com/docs/languages/migrating-from-v2-languages
- https://developers.deepl.com/api-reference/translate/request-translation
- https://developers.deepl.com/api-reference/usage-and-quota/check-usage-and-limits
- https://developers.deepl.com/docs/resources/usage-limits

Never represent the mocked adapter tests, existing CI, or a rendered deploy preview as real provider acceptance.

## Required CI failure and correction after provider diagnostics

PR #71 required run `35156652047` at head `026926d17eac1826fff5be17080e964476e39016` failed: **521 passed / 5 viewport skips / 1 failure** (45.9-minute browser step). The separate three shards and final release-candidate job passed, but they do not override this failure. No merge or publication followed.

The failure was WebKit, `p0-operational-calendar.spec.ts`, English dashboard preview/persistence. The trace shows customer-name input followed by an empty required field on submit; native validation prevented the conflict request. `ManualAppointmentEditor` enabled inputs before its first authentication callback, which resets the actor-scoped form. The correction keeps native form controls disabled until initial session readiness and while an operation is pending. Same-actor callbacks preserve edits; account changes still clear drafts and discard delayed responses. No timeout, retry, skip or weaker conflict assertion was introduced; the browser case additionally asserts that the typed name remains present.

A deterministic initial-session regression failed before correction and passes afterward. All **219 P0 core tests**, affected-file lint and the production fixture build (including TypeScript) pass. Owner localization remains **1,849/1,849** per required language; the local generated coverage file needed line-ending normalization after switching branches, with no copy change. The exact failed WebKit case passed **10 consecutive runs**. All **40 affected Chromium/WebKit cases passed** across five languages, with **2 additional mobile-landscape checks passing**. Existing fixture stream-close and simulated unauthenticated-backend diagnostics remain recorded; no browser assertion failed. New CI must pass before release.

## Current local evidence and preserved failures

- Initial DeepL tests failed because the adapter did not exist; implementation passes them.
- A stale remote quota count allowed reservations beyond the remaining allowance in the first local SQL implementation. The permanent regression failed before correction; a persisted conservative external-use baseline plus a row lock now passes it. Failed/uncertain reservations remain charged against the character allowance.
- The first database-denial mapping lost the specific quota cause. The added regression failed before correction; known quota/rate codes now survive while other SQL details stay private.
- Customer conversation state previously survived account changes, and delayed responses could reappear. Two component regressions failed before correction; identity-generation guards now pass these and the new-conversation/localized-follow-up check. Saved-business responses use the same guard.
- Final core suite for this batch: **213 passed, 0 failed, 0 skipped**. The earlier 208-test run also passed.
- TypeScript and production fixture build pass. Full lint: **0 errors, 16 existing warnings**.
- `npm audit --audit-level=high`: **0 vulnerabilities**, exit 0. No dependency upgrades.
- Owner source coverage: **1,849/1,849** for each of English, French, Spanish, Wolof and Simplified Chinese. This is functional copy coverage, not native review.
- Chromium + WebKit: **20 passed, 0 failed, 0 skipped** (2.2 minutes), covering governed skills and new speech controls in five languages with phone, tablet, desktop and landscape dimensions. Local server emitted stream-close diagnostics during fixture navigation; no browser assertion failed. These fixture tests do not establish live provider or physical-device voice quality.
- Fresh local PostgreSQL `gcia_clean_v3`: **150 migrations applied successfully**; existing P0 security tests and **16 DeepL governance assertions** passed. Only loopback disposable databases were used.

## Remaining application audit

Existing tools cover authorized profile/services/products/professionals, appointments/calendar gaps, reviews/promotions, policy and customer-message drafts, published Help content and controlled business mutations. The following broader requirements are not certified by this first implementation batch:

- Context follow-up: active section hints exclude record IDs/query strings and cannot grant permissions. Navigation covers every dashboard section through existing guarded routes. Canonical plan prices/features, current paid plan versus scheduled downgrade limits, and authorized product/promotion counts now reach the planner. Unknown plans/usage stay unavailable; no sales uplift is invented.
- Review found that nested usage counts could survive a later product/promotion permission revocation in replayed plan facts. A regression failed before correction; fresh permission checks now redact those nested counts before both planning and answer generation.
- New conversation clears the panel, replayed request IDs and local text; existing business-action audit records remain. This is not durable conversational memory.
- Context validation: 20 Chromium/WebKit checks pass across all five languages, phone/tablet/desktop/landscape, including new-conversation clearing, page payload, translated navigation and dialog accessibility. Voice/API responses are fixtures. The same stream-close diagnostic occurred during navigation without failed assertions. Owner copy coverage is 1,851/1,851 per required language; full lint has 0 errors and 16 existing warnings.
- Final context batch validation: **225 core tests passed, 0 failed, 0 skipped**; production fixture build (including TypeScript) passes after the replay-permission correction. No database migration is added by this batch.
- Booking-value aggregates exist and are explicitly not cash sales; real period comparisons, service/staff performance and settled-payment/fee/refund/payout distinctions need further implementation/acceptance.
- In-session bounded history exists with owner/customer identity guards; durable opt-in memory and retention controls are not yet implemented. Existing action audit records are not a user-controlled conversation memory feature.
- Public Help retrieval is keyword based on published source text, without multilingual semantic retrieval. Its source language is unknown, so playback does not guess an English voice for those excerpts.
- Customer discovery/book links exist, but contextual appointment management and a human case-summary/reference handoff require further audit and implementation.
- Native Wolof and Mandarin speech accuracy, restricted-team/customer identities, isolated persistence and Stripe test-mode acceptance still require appropriate authenticated accounts/devices/test context. No real notifications, charges or refunds have been issued.
