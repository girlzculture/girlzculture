# PAGE-09 reusable business replies

Implementation prepared on 2026-09-19. This closes the previously absent reusable-reply code path named in `founder-handoff.md`; it does not establish production deployment or authenticated hosted acceptance.

Owners and currently authorized team members can create, edit, search, page through and archive private replies belonging to their business. Each reply preserves the exact original text and declared language. Choosing a reply performs a fresh authorized read of that active revision and populates an editable conversation draft. It never sends a message, requests a translation, calls a model, or notifies a customer. A nonempty existing draft requires explicit replacement confirmation.

The library is a sibling of the existing message form. Enter in its title/search inputs cannot implicitly submit the composed message. The parent composer verifies the current actor, business, conversation authorization and deadline, generation token, unchanged draft and busy state before insertion. A changed-and-restored draft or language change invalidates a pending insertion. A failed conversation read leaves reply controls disabled until current authorization succeeds.

Revision conflicts retain unsaved reply text and prevent a repeated stale overwrite. Refresh reads the current library without silently changing the editor's revision. The user can explicitly keep those edits in a new reply or discard them and reopen the current record. Unchanged retries retain their request ID; the database's exact last-request replay returns the saved revision without another mutation. Archive requires explicit confirmation and does not alter already composed messages.

## Boundaries and storage

- API: `/api/salon/reusable-replies`, GET and POST; authenticated business context plus current `bookings` permission, checked before and after reads.
- Strict query/action schemas reject foreign business IDs, unrecognized fields, incomplete pages and mixed-business returned rows. Response fields exclude internal actor/request records. Failures return JSON and preserve the sanitized protected incident reference.
- Migration188: `20260919181855_business_reusable_replies.sql`. Private table with RLS enabled and no `anon`/`authenticated` table or RPC access. Service-only INVOKER functions derive no customer data and check the supplied server-derived actor/business against fresh canonical permission. Mutations lock identity, business, membership and the selected reply before revision checks.
- Search/list pages contain at most25 records, with exact count/offset. Title80 characters and message2,000 characters are validated without silently truncating saved text. Archived replies remain readable by authorized teammates and cannot be inserted or edited.
- No existing booking/message rows, providers, payment behavior or $25 caps change.

## Evidence

All listed logs are in sibling `../redesign-evidence/` outside Git.

| Check | Status | Evidence and limit |
|---|---|---|
| Initial missing-capability contract | PASS | `reusable-replies-contract-before.log`:3 tests failed because the new contract/module did not exist. This records an absent requested feature, not a reproduced defect in a deployed endpoint. |
| Core, actual API/reader, original-language and isolation tests | AUTOMATED ONLY | `reusable-replies-node-final.log`:12 passed,0 failed/skipped. Includes fresh revocation, foreign/partial rows, exact replay/readback, stale edits, archive and four-locale placeholder parity. Transport is simulated. |
| Actual local database roles | AUTOMATED ONLY | `reusable-replies-sql-after.log`: verifier passed in disposable `girlzculture_reply_review`, cloned from verified187. Actual service role exercises two businesses, owner/team/customer boundaries, denied/revoked identity, revision/replay/archive, exact25+1 paging; actual anon/authenticated calls are denied. Fixture rows roll back. |
| Migration apply | AUTOMATED ONLY | `reusable-replies-migration-initial.log`:188 applied only to that disposable clone. Initial verifier fixture used a nonexistent identity enum and was corrected to canonical `Disabled`; original failure remains in `reusable-replies-sql-initial.log`. |
| Local database advisors | AUTOMATED ONLY | `reusable-replies-advisors.json` and `reusable-replies-advisor-comparison.json`:0 errors,77 warnings identical to187,0 new findings. Loopback only; no production connection. |
| Full TypeScript and scoped ESLint | PASS | `reusable-replies-types-final.log`, `reusable-replies-lint-final.log`:exit0. Initial lint correctly rejected a non-hook named `useReply`; renamed to `insertReply`, without suppressing the rule. |
| Independent source review | PASS | Two independent reviews found no remaining core/server/SQL isolation blocker. Stale-editor recovery, composer version checks, forbidden-conversation binding and implicit form-submit findings were corrected before browser acceptance. |
| Browser/UI acceptance | AUTOMATED ONLY | `combined-197-replies-corrected-browser.log`:18/18 passed in both engines on build197; original first-run failures and test correction are documented below. No hosted/provider claim. |
| Hosted role, refresh/login/cross-device and production release | BLOCKED | No new migration or feature has been applied to production by this slice. Protected release and authenticated hosted verification remain required. |

The parent release owner registers the API in operational monitoring, the dictionary rows in the existing owner source catalog, the SQL verifier in the clean-database gate, and the browser spec in the existing acceptance collection. No new model or provider setup is required.
# Integrated browser verification — build197

The shared production build passed with 842 source files and identical before/after digest `219252354eb1690197aceb2ccc595526c797b03c73068493da982ee590ead492`. The Inbox integration mounts the library outside the message-send form. It requires a successfully authorized current conversation, then rechecks actor, business, conversation, draft/translation generations, original draft text, busy state and the current reply deadline before insertion. Independent source review identified and corrected the failed-conversation-read and implicit Enter-submit edges before this build.

The first browser command preserved **34 passed / 7 failed**, not a pass: 32 offer-layout cases and 2 reusable-reply cases passed. Seven Chromium reply cases could not resolve label-text locators containing their nested textarea/options, or selected both the application alert and Next route announcer. The trace accessibility tree showed the intended controls with their exact accessible names. The tests now use exact named textbox/combobox roles and the main-region alert, retaining every original behavior assertion. The new reply spec was also explicitly registered in the existing WebKit selection; it had not been collected for that engine in the first command. No application change, assertion removal, timeout increase or retry was used for these test corrections.

`combined-197-replies-corrected-browser.log`: **18/18 passed, 0 failed, 0 skipped in 55.7 seconds**, Chromium and WebKit, on the same compiled application. Coverage includes four interface locales, original French message preservation (including whitespace, `$180` and `GCABC12`), source-language preservation, create/edit/archive, retained 503 draft and retry identity, stale 409 preservation and explicit new-copy recovery, replacement cancellation/confirmation, changed-and-restored composer text, language changes during pending reads, archived reply rejection, switching conversations during a pending read, denied-current-conversation recovery, and native Enter in Title/Search with a nonempty draft. Tests assert zero message POSTs; real sending, notifications and provider calls were not performed.

Root inspected the actual WebKit English 390px archived-original screenshot and stale-edit desktop screenshot from `combined-197-replies-corrected-results`. They show preserved original content, readable controls and retained stale edits; these captures cover their scroll positions, not every possible native-keyboard state. The test separately checks horizontal overflow. Repository monitoring passed at 167 routes; the design source audit passed; strict interface coverage is 2792/2792 for EN/FR/ES/zh-CN after registering nine individually reviewed DOM IDs, React keys, internal generation/header/module/locale literals. Wolof remains deferred. Required updated-source CI, protected migration application and hosted/live persistence acceptance remain outstanding.
