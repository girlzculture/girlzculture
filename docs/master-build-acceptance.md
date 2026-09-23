# Master Build acceptance and release record

Source: Girlz_Culture_Master_Build.pdf (all five pages), founder pasted correction of 23 September, and subsequent explicit production release authorization. The authorization replaces the old stop-at-PR instruction; it does not override exclusions. This is the current-build checklist, not a claim of live completion.

## Baseline and release controls

- Branch: `codex/master-build-current-scope`, based on `692b89be11c0599c579f90254032b56431590fe2` (PR #86 CI correction).
- Baseline required CI: [35815751467](https://github.com/girlzculture/girlzculture/actions/runs/35815751467), successful: **1,402 passed, 5 skipped, 0 failed; 1,407 accounted for exactly once**, eight isolated runners, one worker each, zero retries. TypeScript, lint, build, clean migration chain and focused gates passed on that commit. This does not verify the subsequent Master Build changes.
- Master Build changes: local implementation checkpoints from `c461a6c` through `2138405`, plus the verified Solo-to-team subscription projection; not yet pushed or released. No Master Build migration, application change or demo record has been applied to production.
- Last observed published deployment: `6ab1801846433e00086f1d08`. Recheck exact source and rollback compatibility before release.
- Required acceptance statuses: PASS (verified actual workflow), AUTOMATED ONLY (local/CI evidence), FAIL (demonstrated failure), BLOCKED (not implemented/verified or external dependency). No unchecked requirement counts as complete.

## Requirement-by-requirement evidence

| ID | Current requirement and detailed acceptance | Implementation / evidence | Acceptance |
|---|---|---|---|
| S01 | Hair & Braiding live; six named categories waitlist-only; remove Other from selection and intake | Active category catalog and server intake updated; 3 local category/locale tests passed | AUTOMATED ONLY |
| S02 | Current homepage/recruitment page and `/site-access` retained; no mother/category homepages | No homepage files edited; final diff and regression outstanding | BLOCKED |
| S03 | Six designed coming-soon pages: correct name, no dates, waitlist path, actual available hair businesses below | Six category routes localized; actual API-returned business cards, category identity, all four languages and image decode verified in 10 Chromium/WebKit cases | AUTOMATED ONLY |
| S04 | Existing waitlist fields/questions/uploads/steps untouched; exact category messaging; no onboarding/charge | Existing form untouched; all six forms retain exact field names/count, no file uploads or extra steps; approved category messaging verified in 10 browser cases | AUTOMATED ONLY |
| S05 | Admin demand counts by category | Admin scoped demand API and dashboard panel implemented; hosted role/count acceptance outstanding | BLOCKED |
| V01 | Generic vocabulary in navigation, content, empty/error states, email and legal; preserve genuine hair terminology | Owner errors/settings, profile, calendar and photo labels corrected and translated; generic How It Works no longer promises a fixed 10% deposit. Remaining transport/published-content audit and hosted acceptance outstanding | BLOCKED |
| V02 | Category-specific team and service labels in en/fr/es/zh-CN; solo team hidden | All seven category headings and Overview service/team links verified in all four languages; Solo Overview/My Page hide team and exclude it from completion scoring. 64 Chromium/WebKit cases pass | AUTOMATED ONLY |
| V03 | Four interface languages; Wolof removed from choices, authored historical text intact | Catalog/provider/API filters implemented; three local category/locale checks pass | AUTOMATED ONLY |
| V04 | Explore and For Businesses menus exactly specified, no duplicate application destination | Desktop/mobile menus and Why Girlz Culture route localized and verified across four languages, refresh and four viewport sizes; one application destination per business menu | AUTOMATED ONLY |
| V05 | Honest AI labels on all three assistants and other AI features; concise natural copy | Three agent surfaces label AI explicitly; description draft and customer-account assistant labels corrected; final rendered/hosted audit outstanding | BLOCKED |
| P01 | Two families, five exact monthly prices, complete 23-row comparison, organic visibility statement | Catalog/page/fixture tests written; 4 local plan tests pass; browser outstanding | AUTOMATED ONLY |
| P02 | Every comparison-row entitlement enforced: reminders, reporting, source, waitlist, rebooking, promotions, products, GBP help, ads | Promotion/product limits and per-plan reminder timing/manual/automated/targeted waitlists implemented. 60 growth SQL assertions, 31 focused units and 16 four-language Chromium/WebKit cases pass; monthly reporting and source comparisons now enforce current plan and tenant/staff scope (51 SQL assertions, 5 API units, 34 report/finance browser cases). Opt-in automatic/segmented rebooking now has 45 SQL, 15 API/worker and 24 browser checks. GBP guide/setup/review tiers now have 37 SQL assertions, 4 API tests and 24 browser cases; advertising discount/credit/early-access reservations and canonical campaign fulfillment now have 59 SQL assertions, 6 real concurrent-session checks, 7 API tests and 16 browser cases; final combined and hosted verification remain outstanding | BLOCKED |
| P03 | Core booking, deposits, chat, cards, finance, full Assistant, visibility, language and unlimited bookings for all tiers | Core flags/database resolution updated; 44 local DB checks pass | AUTOMATED ONLY |
| P04 | Solo one calendar across professionals, simultaneous overlapping booking attempts; team separate calendars | Database advisory lock and occupancy guard; 44 local checks include concurrency with distinct customers/professionals | AUTOMATED ONLY |
| P05 | One-action Solo to Starter upgrade grants calendars/team with audit, no unverified charging claim | Existing reviewed subscription change flow now projects an active team entitlement to operator identity with an immutable transition audit. 17 SQL and 8 Chromium/WebKit checks pass; real charging remains unverified and excluded | AUTOMATED ONLY |
| P06 | Solo hides/disables team profiles, payouts, permissions, staff login, comparison and multi-calendar; retains full remaining software | Team API/auth/finance/shell guards written; focused role/UI checks outstanding | BLOCKED |
| L01 | Storefront/chair-suite/home/mobile and combinations; required private verification address | Private verification storage, application persistence and settings implemented; isolated location tests passed, complete-chain upgrade evidence being replaced | AUTOMATED ONLY |
| L02 | Public full storefront/host address; private home neighborhood; confirmed-booking-only exact address; mobile no public address | Private home/mobile projection and confirmed-booking-only exact address implemented; role/guest/cancellation local tests passed | AUTOMATED ONLY |
| L03 | Real-location distance preserved; mobile additional travel-radius eligibility only | Ranked discovery preserves original order and applies mobile radius/independent filters before pagination; database ranking regression outstanding | BLOCKED |
| L04 | Business-set deposits/threshold, optional travel fee and privacy save/readback/display before booking | Deposit rules retained; settings CAS and private destination/radius quote implemented; immutable fee/address booking snapshot. 25 local SQL checks, 23 focused units/checkout tests and 8 Chromium/WebKit UI cases pass; hosted geocoder/booking acceptance outstanding | AUTOMATED ONLY |
| L05 | Independent/Travels/Verified badges and independent/mobile/promotion/top-rated filters | Independent/Travels badges, URL filters and multilingual conversational filters implemented; focused discovery 5/5; rendered/DB acceptance outstanding | BLOCKED |
| L06 | Solo manual in-person verification required before approval; team standard review; no fabricated visit | In-person visit audit and approval guard implemented; role, stale address and fabricated/future visit rejection tested locally | AUTOMATED ONLY |
| L07 | Official New York home/mobile licensing requirements checked, claims limited accordingly | Official category-by-category review recorded in docs/master-build-new-york-location-review.md and linked from review controls; individual legal/licensing approval remains real reviewer duty | AUTOMATED ONLY |
| A01 | Immediate operator fork and short independent/team/multiple-location paths, required questions only | Seven-topic branching application implemented; isolated browser cases pass; final source and hosted verification outstanding | AUTOMATED ONLY |
| A02 | Autosave, resume across sessions/devices, conflict protection, recover uncertain saves without losing edits | Private revisioned progress, autosave/conflict/retry and shared interview resume implemented; focused interruption/resume browser coverage passes | AUTOMATED ONLY |
| A03 | Secure photo/file license uploads, no new waitlist uploads | Existing owned signed-upload pipeline preserved; wizard regression outstanding | BLOCKED |
| A04 | Entire flow in applicant language, selector and `?lang=`; language persists | Four-language copy, saved preference, selector and ?lang= entry implemented; focused form/interview browser coverage passes | AUTOMATED ONLY |
| A05 | Form and conversational path share one draft/final application; review and consent before atomic submit | Shared private draft and atomic final submission with reviewed fields/consents implemented; local stale review rejection and shared record checks pass | AUTOMATED ONLY |
| B01 | One business assistant continuous across all pages; no visible modes/page restriction | Existing implementation needs exact scope verification | BLOCKED |
| B02 | All calendar, finance, page/media/service, client/card, team, product/promotion, review/message/settings/subscription capabilities with review | Overview finance supports reviewed expense, received-balance and already-returned refund records in the canonical ledger, alongside existing paid service recording. 35 database assertions, 96 finance/planner units and 8 four-language browser cases pass; Stock/supplies, saved photos, client cards/formulas and review replies now have 43 SQL assertions, 93 planner/operation unit tests and 8 four-language Chromium/WebKit cases; remaining operational capabilities still require implementation/acceptance | BLOCKED |
| B03 | Fuzzy service/professional matches, Boho/Dominican examples; choices only for real ambiguity | Existing P0 evidence retained; Master examples outstanding | BLOCKED |
| B04 | Any professional/service; Alma Aba Thu Sep 24 15:30 exact or conflict with real alternatives; no silent 15:00 substitution | Exact frozen-clock Alma preparation, service/assignment selection, full-duration alternatives and preserved catalog identity implemented. 28 operational/alternative units, 8 Chromium/WebKit four-language cases, 5 new SQL checks and 55 existing calendar SQL checks pass; hosted/provider acceptance outstanding | AUTOMATED ONLY |
| B05 | Explicit unfinished task persists through follow-ups/unrelated question until done/cancelled | Server-owned unfinished tasks, explicit cancellation/confirmation, full task instructions, CAS and actor scope implemented. 8 Chromium/WebKit browser checks, 12 task/language unit checks, 19 SQL boundaries and 82 planner cases passed. Hosted acceptance outstanding | AUTOMATED ONLY |
| B06 | Real saved-photo count, price/duration, today bookings and other factual retrieval; no invented facts | Prior P0 tests pass; populated-demo/live checks outstanding | BLOCKED |
| B07 | French planner incidents, malformed `{`, oversized request, provider failure and correlations with business/language/intent | PR #86 guards and passing suite retained; current requirement-specific mapping outstanding | BLOCKED |
| B08 | Immediate user turn/clear composer, separate loading, retained failed turn, exact retry without duplicate, multiline/IME/voice/mobile keyboard | Existing focused P0 and full suite pass baseline; final changed-source regression outstanding | AUTOMATED ONLY |
| B09 | Business conversation language en/fr/es/zh-CN across refresh/login/device; explicit switch; authored content unchanged | Account response-language preference now saved independently of UI/transcript memory. Four new server lifecycle/failure tests and ten existing language route tests pass; real cross-device acceptance outstanding | AUTOMATED ONLY |
| B10 | Tenant/staff enforcement before model/tools/cache/memory/action/export; no other business information | Existing isolation retained; new paths and two-business regression outstanding | BLOCKED |
| C01 | Public Customer Assistant embedded and clearly AI, discovery all requested filters, live facts, booking handoff, policies, four languages | Public support launcher respects marketplace gate; business-only browsing and retained filters corrected. Immediate turns, exact retry and close/reopen persistence: 8 Chromium/WebKit cases pass. Published Help translations supported in four languages; production translation coverage and actual provider/discovery acceptance outstanding | BLOCKED |
| C02 | Public assistant cannot access private businesses or customer records; misspellings/natural language | Separate public knowledge module; fixed general-guidance slug allowlist, exact-source published translations, strict public request keys. 3 knowledge/route cases and 5 discovery/agent cases pass; live fuzzy discovery acceptance outstanding | AUTOMATED ONLY |
| A06 | Application Agent directly on form: one-question conversation, why-address explanation, uploads, voice, continuous save/resume, human escalation, joining scope only | Application Agent implemented with shared draft, one-question capture, literal evidence, uploads, voice, approved FAQ/escalation, exact retry and resume. Eight focused browser cases pass; live provider acceptance outstanding | AUTOMATED ONLY |
| G01 | Three separate instruction/tool/data boundaries; governed Engine tuning without redeploy; admin cannot disable hard authorization | Separate business/customer/application Engine instruction, tool guidance and routing keys implemented using existing draft/review/publish history; isolated boundary tests pass; hosted publishing outstanding | AUTOMATED ONLY |
| X01 | Products full existing owner journeys, inventory movements, listings and tier limits, no Stripe changes | Limits updated; existing product workflows to verify | BLOCKED |
| D01 | Dedicated fictional demo owner and private access, clearly sample; no genuine business reused | Not provisioned | BLOCKED |
| D02 | Complete profile/demo page, assets, hours/policies, services/prices/durations, team/roles/permissions/schedules/assignments | Canonical fictional demo seed implemented: private profile/page, local images, six services, four professionals/assignments, hours/policies. Eight private-page responsive recovery browser cases pass | AUTOMATED ONLY |
| D03 | Approximately 14 months of connected completed/cancelled/rescheduled/no-show/future/walk-in bookings, availability, waitlist, busy/quiet trends | Canonical seed creates 14 months of connected dated activity plus future appointments, walk-ins, actual rescheduling revisions, waitlist and blocks; local consistency checks pass | AUTOMATED ONLY |
| D04 | Fictional clients, history, notes/formulas, rebooking, messages and consent | 28 fictional clients, private cards/formulas, consent-false message threads and history implemented; local scope checks pass | AUTOMATED ONLY |
| D05 | Reconciled revenue/deposits/refunds/expenses/earnings/payout arrangements/product sales/month reports | Demo ledger, expenses, 50% team arrangements and commissions reconcile with simulated deposits/payments/refunds and product sales; included in 75 passing local DB checks | AUTOMATED ONLY |
| D06 | Products/stock/promotions/private reviews/simulated subscription history/settings/notifications, meaningful every major section | Four products with stock movements, promotions, private reviews and simulated billing history seeded; no provider billing identifiers. Hosted workflow acceptance outstanding | AUTOMATED ONLY |
| D07 | Assistant demo prompts retrieve seed facts and prepare/review safe actions | Seed + hosted verification outstanding | BLOCKED |
| D08 | Prevent demo discovery/reviews/rank/report contamination, payments, messages and notifications at server boundaries | Immutable demo classification, own-business RLS, private discovery, platform metrics exclusion, provider connection/payment/notification denials implemented; 75 local checks pass. Final transport/reporting audit outstanding | AUTOMATED ONLY |
| D09 | Idempotent seed, demo-only safe reset, cross-record consistency checks, founder login and major workflows verified | Idempotent seed and CAS demo-only reset implemented; local 75-check isolation/reconciliation suite passes. Founder account/private access and live journeys not yet provisioned | BLOCKED |
| R01 | Focused tests first, complete required full checks, clean and representative upgrade migrations, independent final diff review | Baseline passing evidence retained. Master focused suites recorded below; clean 195-migration application exposed review-policy contract mismatch, corrected draft migration. Final clean/representative upgrade and full checks outstanding | BLOCKED |
| R02 | Reviewed merge, protected safe production migrations, rollback, exact production deployment, live verification | Not attempted; requires remaining implementation/checks | BLOCKED |

## Exclusions and honest limitations

- No Stripe configuration/payment-method changes. New Solo/Solo Pro recurring charging is not verified and must not be advertised as working. Preserve both $25 AI caps.
- GBP live activation and Wolof remain deferred. No retry of zero-quota Google access.
- No parked multi-category homepage. Existing waitlist fields govern over PDF Part 5.4's shorter field list; do not rebuild those forms.
- No production secrets in repository/logs; demo login supplied only via secure private access, never chat plaintext.

## Focused evidence checkpoint — 23 September

- Demo data isolation, reconciliation, idempotence and reset: **75 passed**, disposable clone of the complete 195-migration schema; no production data. Includes Google/Instagram storage denials and own-business commissions.
- Demo page: **8 passed**, Chromium/WebKit, English/French/Spanish/Chinese at phone/tablet/desktop/landscape sizes. Original missing route and duplicate read failures retained in local logs. Shared in-flight read corrects a reproduced double-effect race; no assertion removed.
- Professional archive review from Overview: **2 passed**, Chromium/WebKit. Safe action refuses professionals with outstanding appointments and preserves history.
- Discovery/agent filters: **5 passed**; money/discovery earlier **25 passed**.
- Response preference: **4 passed** plus existing **10 passed** language route cases (historical Wolof route coverage does not mean Wolof live acceptance).
- Earlier local 185-labelled database template was missing migration 184 (Instagram). It must not be represented as a complete upgrade baseline. Replace it with the full reviewed 188-migration baseline for release checks.
- Current source has not passed full TypeScript/lint/build/CI, has not been merged, and has not been deployed. Pending implementation remains a release blocker.

## 23 September — mobile booking checkpoint

- Customer destination is validated through the existing geocoder, then checked against the private business origin and approved radius. Fifteen-minute quotes bind business, customer/email, location revision and fee; an atomic claim prevents reuse or changed terms. Travel is added after service promotions and never increases the service-based deposit.
- Recorded booking destination and fee are immutable and available only in authorized booking views. Hourly retention removes expired quote duplicates; held/preview deployments cannot run the cleanup.
- Focused JavaScript: 23 passed, 0 failed. SQL: 25 boundary/readback/retention checks passed. Browser: 8 passed, 0 failed, Chromium/WebKit at 390/768/1440/844 widths. TypeScript passed; focused lint initially identified a render-time ref write, corrected to a layout effect, then passed.
- Representative upgrade: complete 188-migration baseline plus all eight new migrations; 10 preservation assertions and six existing SQL suites passed. Complete clean chain: 196 migrations applied, existing checks passed through waitlists; concurrency harness stopped on the disposable database's name. Renamed that same local database to its accepted `*_release` form and completed unchanged waitlist concurrency, Google boundary and mobile SQL checks successfully. No production actions.
- Browser first attempt found an ambiguous test locator also matching Next's route announcer. Named the appointment-location region and scoped the unchanged alert assertion to it. No retry/sleep/skip added.

## 23 September — assistant task continuity checkpoint

- Active tasks are stored under the authenticated business and actor, with fresh permission checks. All user task instructions remain available independently of the recent factual lookup window; an explicit limit fails visibly rather than silently discarding original details.
- Unrelated actions require the owner to end the current task. Ending invalidates pending proposals; completing requires a matching confirmed own-business action. Ending/completing clears stored task prose. No extra provider calls for loading or ending a task.
- 8 browser cases passed in Chromium/WebKit at phone/tablet/desktop/landscape sizes, covering 14 messages, refresh/resume, explicit topic change and retry without duplicate turns. 12 task/language units, 19 local database checks and the 82-case planner suite passed. TypeScript and focused lint passed.
- The operational suite exposed a fixture still expecting the old new-sale prices. Its recorded $59 legacy-agreement assertion remains unchanged; new-sale expectations now use the five authorized plans. Exact Alma preparation and no silent earlier-time substitution passed.
- This remains local-only evidence. No task migration or provider call has been made in production.

## 23 September — public assistant checkpoint

- Reproduced business-only discovery being rejected with a mandatory service question. Service criteria and filter updates are now separate from conversational prose, which previously could become an unintended semantic service filter. Four-language business browsing and filter follow-ups pass.
- Public support launcher uses the existing marketplace-access decision; the recruitment homepage remains closed to marketplace tools. Published platform guidance has a separate public-only reader and only published exact-source translations. Missing translated content is not invented or reported as translated.
- Eight Chromium/WebKit tests pass across phone, tablet, desktop and landscape, including immediate turn/composer clearing, separate loading, exact recovery, unsent draft retention and close/reopen continuity. The first run exposed an actual landscape bottom-navigation overlap, now corrected; its failure log remains preserved.
- 32 focused discovery/owner execution/customer-session checks passed, followed by 3 public knowledge/API boundary checks and the existing concierge verification script. Four existing image lint warnings remain; no new lint errors. Hosted/provider and final required CI acceptance remain outstanding.

## 23 September — exact appointment and conflict checkpoint

- Reproduced two preparation defects: conflicts contained no alternatives, and “any service” stopped at the first catalog row even when another assigned service fitted the exact requested time. Selection now respects service assignments, named/assigned professional scope, saved duration and buffer; it never substitutes a different time.
- At most three real free intervals become explicit alternatives. The original request and incident reference remain in the conversation. Alternatives are bounded structured data, not raw provider errors, and do not save or confirm a booking.
- Reproduced a database identity loss: a service selected from the catalog with original `style_id=null` was saved without its real service link. Migration `20260923105941` binds the reviewed catalog identity through the existing authorization, occupancy and stale-preview checks. Custom manual services remain supported; no payment or notification provider operations are added.
- 28 operational/alternative units and 8 Chromium/WebKit cases in en/fr/es/zh-CN passed; TypeScript and focused lint passed. Five new local SQL checks and the existing 55-check operational-calendar suite passed. The first local failures are preserved. Final complete clean/representative upgrade checks and hosted acceptance are still required before release.

## Reminder and waitlist evidence

- Local only: 60 SQL assertions passed, including downgrade enforcement, final notification-claim checks, stale revisions, tenant isolation, manual offer preview and response-loss replay. Existing reminder and waitlist SQL checks also passed.
- 31 focused units passed; combined Master contracts and production gate: 106 passed, 0 failed, 0 skipped. TypeScript and changed-file lint passed.
- 16 browser cases passed across Chromium/WebKit and English/French/Spanish/Simplified Chinese. They cover retained edits, authoritative saved readback after refresh, stale save recovery, explicit offer confirmation and unchanged retry identity. Initial invalid mock incident IDs were corrected without relaxing exact-reference assertions.
- Required CI now includes Master contracts plus representative upgrade and private-demo checks. Complete final-chain/upgrade and hosted verification remain outstanding. No real offer or notification has been sent.

## Reviewed Assistant financial records

- New service-only functions reuse canonical `record_business_finance`; no provider operation, appointment or notification is triggered. Preparation and confirmation recheck current business permission, plan, exact scoped record, balance snapshot, preview digest and expiry. Confirmation and response-loss replay verify the durable ledger row.
- Local evidence: 35 transactional SQL assertions; 96 finance/planner tests; 8 Chromium/WebKit tests from Overview across all four supported languages; TypeScript and changed-file lint pass. These are automated checks, not real provider or hosted acceptance.
- Original planner-schema and full-history assertions remain: the representative request retains all facts at 63,668 bytes under the unchanged 64,000-byte limit. Duplicate prompt wording was removed after the new tools triggered context compaction. No tool or financial restriction was removed.

## Category and navigation verification

- Five category/locale/navigation units and ten Chromium/WebKit browser cases pass, including six exact category/waitlist paths, unchanged input fields, actual API-returned hair-business cards, four languages, retained locale on reload and no viewport overflow. TypeScript and changed-file lint passed.
- Visual review found WebKit could not decode the category AVIFs; exact-image JPEGs now load directly because an AVIF error can occur before the fallback listener hydrates. All six exact-image decode assertions and the four-language cases now pass in both browsers (10 passed, 0 failed). Homepage files and waitlist form inputs/steps remain unchanged. This is local acceptance, not hosted evidence.

## Monthly appointment reporting

- Basic, Detailed and Advanced reports read the current entitlement at the database boundary. Counts, saved appointment values and source breakdowns use only the authorized business and staff appointments; a downgrade immediately removes expanded data. Core ledger access and exports remain unchanged.
- Local evidence: 51 SQL assertions, 5 API tests, 34 Chromium/WebKit report and existing finance cases passed; TypeScript and changed-file lint passed. The first browser run identified a missing new endpoint in the generic fixture; its log is preserved and the dedicated report cases exercise both error recovery and actual report data.
- Report values are saved appointment prices grouped by scheduled date, not asserted cash received or profit. No production data, provider operation or migration was performed.

## Rebooking reminder controls and delivery

- Automatic reminders default off and require owner review. Each claim checks the current plan, same-business completed visits and upcoming bookings, verified registered customer, current business and booking-specific marketing/email consent, approved settings and channel availability. Premium can segment by last-visit service and minimum completed visits. Downgrades suspend incompatible settings; owners can always disable them.
- Delivery uses the canonical notification ledger, signed unsubscribe links, four approved language templates and a permanent per-visit attempt latch. Uncertain/process-loss attempts are never resent automatically, regardless of provider idempotency expiry. A published Production deployment is required for scheduled execution. Demo sends are rejected; its read-only rebooking history is supported.
- Local evidence: 45 SQL assertions, 15 API/worker tests, 24 Chromium/WebKit tests (new controls plus existing reminders/waitlist), TypeScript and changed-file lint passed. Combined Master contract and protected-migration gates: 133 passed, 0 failed, 0 skipped.
- The first database run caught an invalid notification event ID and the first browser run caught duplicate sibling component keys. Both implementation defects were corrected; original logs remain. No production email, API provider call or database change was performed.

## Google setup assistance (live activation remains deferred)

- Guide tiers link official Google instructions; assisted tiers can review public-ready saved business fields and request setup help through the existing support queue. Premium adds a profile checklist and review request. Private verification addresses never enter the packet.
- Server permissions, fresh plan, snapshot fingerprints, permanent request identities and open-ticket deduplication govern submission. Demo sends and live Google activation remain disabled.
- Local evidence: 37 SQL assertions, 4 API tests and 24 Chromium/WebKit cases (all four languages, retained failures, readback/refresh and existing disabled connection controls) passed. TypeScript and changed-file lint passed. No Google API call or production change was made.

## Advertising plan benefits

- Current-plan 5%/15% discounts, $10 UTC quarterly/monthly non-rollover credit and 48-hour Premium early access are enforced server-side. Each owner sees exact list price, discount, credit and balance before confirming. Reservations expire within 48 hours; lost responses replay the same durable request.
- Existing Featured Business campaigns receive the reviewed placement and canonical audit. Positive balances require exact, staff-verified invoice evidence; fully covered placements use recorded platform credit. No Stripe calls/configuration, payment-method handling or organic ranking changes. Home/mobile businesses use verified private origins without returning coordinates; mobile radius remains enforced. Demo reservations are rejected.
- Local evidence: 59 SQL assertions; 6 concurrency assertions across real independent PostgreSQL sessions; 7 API tests; 16 Chromium/WebKit owner/Admin browser cases across four viewport sizes, with all four owner languages, passed. TypeScript and changed-file lint passed. Screenshots inspected. Earlier SQL alias and incomplete fixture failures remain in local logs; Admin fixtures now use the existing localStorage mechanism. No production placement or invoice was created.


## Reviewed assistant stock, media, client cards and replies

- Four statically permissioned tools reuse canonical inventory, client-card, photo and reply workflows. Preparation performs no write. Confirmation rechecks scoped records, role/field permissions, revision, expiry and exact snapshot, then verifies a durable receipt. Retrying an uncertain response does not repeat the write. Public text still requires moderation; no provider payment, storage deletion or notification is added.
- Local evidence: **43 SQL assertions, 93 planner/operation tests, 8 Chromium/WebKit browser cases** across English/French/Spanish/Simplified Chinese, phone/tablet/desktop/landscape; TypeScript and changed-file lint pass. Each browser case includes four actions, retained failed review, exact retry and fresh facts after refresh.
- Regression checks found stale stock facts were not reread and old client proposals could retain fields after grant revocation. Fresh stock reads and canonical card/field authorization now run before planning and answer history. A WebKit landscape trace showed no request for the lazy review thumbnail; explicit review images now load eagerly. Original failure logs are retained. This is local evidence, not hosted/provider acceptance.

## Solo-to-team transition

- A scheduled or unsuccessful subscription change never changes operator identity. A confirmed active team subscription updates the independent label and records one transition; replay does not duplicate it. Existing plan guards still control calendars and staff access. Private home addresses remain private. No payment provider operation or configuration changed.
- Local evidence: 17 SQL assertions and 8 Chromium/WebKit cases at phone, tablet, desktop and landscape sizes; TypeScript and focused lint pass. The browser uses a simulated canonical provider response, so it does not establish real charging.
- An initial local Chromium attempt encountered an uncompiled development route returning 404. Its cause was not conclusively established; the original log is retained. The completed corrected project collection passed without application-route changes, retries, sleeps or weakened assertions. Required production-build coverage remains outstanding.

## Category labels and generic business copy

- Corrected Solo Overview/My Page links and completeness scoring; a Solo business is no longer sent to team management or penalized for having no team. Category headings, services and team labels use the same mapping across the workspace. Stored names and authored prose remain untouched.
- Generic owner error/settings/profile/calendar/photo wording and its four-language translations now refer to businesses. Description assistance and the customer account assistant explicitly identify AI. Generic How It Works defaults describe the business-controlled deposit rather than promising a fixed 10%; homepage content and existing waitlist fields are unchanged.
- Local evidence: 6 units, 64 Chromium/WebKit category/locale/Solo browser cases, 6 existing photo-menu responsive cases; TypeScript and focused lint pass. The first new test locator omitted the existing accessible completion prefix; corrected to assert the exact visible label on its destination link. Its failure log is preserved. Existing photo assertions now require the specified Business logo label. Hosted acceptance and remaining generic-copy audit are outstanding.
