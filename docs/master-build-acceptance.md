# Master Build acceptance and release record

Source: Girlz_Culture_Master_Build.pdf (all five pages), founder pasted correction of 23 September, and subsequent explicit production release authorization. The authorization replaces the old stop-at-PR instruction; it does not override exclusions. This is the current-build checklist, not a claim of live completion.

## Baseline and release controls

- Branch: `codex/master-build-current-scope`, based on `692b89be11c0599c579f90254032b56431590fe2` (PR #86 CI correction).
- Baseline required CI: [35815751467](https://github.com/girlzculture/girlzculture/actions/runs/35815751467), successful: **1,402 passed, 5 skipped, 0 failed; 1,407 accounted for exactly once**, eight isolated runners, one worker each, zero retries. TypeScript, lint, build, clean migration chain and focused gates passed on that commit. This does not verify the subsequent Master Build changes.
- Master Build changes: local implementation checkpoint `c461a6c`, followed by mobile-booking work; not yet pushed or released. No Master Build migration, application change or demo record has been applied to production.
- Last observed published deployment: `6ab1801846433e00086f1d08`. Recheck exact source and rollback compatibility before release.
- Required acceptance statuses: PASS (verified actual workflow), AUTOMATED ONLY (local/CI evidence), FAIL (demonstrated failure), BLOCKED (not implemented/verified or external dependency). No unchecked requirement counts as complete.

## Requirement-by-requirement evidence

| ID | Current requirement and detailed acceptance | Implementation / evidence | Acceptance |
|---|---|---|---|
| S01 | Hair & Braiding live; six named categories waitlist-only; remove Other from selection and intake | Active category catalog and server intake updated; 3 local category/locale tests passed | AUTOMATED ONLY |
| S02 | Current homepage/recruitment page and `/site-access` retained; no mother/category homepages | No homepage files edited; final diff and regression outstanding | BLOCKED |
| S03 | Six designed coming-soon pages: correct name, no dates, waitlist path, actual available hair businesses below | Category route written; rendered/translated acceptance outstanding | BLOCKED |
| S04 | Existing waitlist fields/questions/uploads/steps untouched; exact category messaging; no onboarding/charge | Form untouched; intake messaging changed; browser acceptance outstanding | BLOCKED |
| S05 | Admin demand counts by category | Admin scoped demand API and dashboard panel implemented; hosted role/count acceptance outstanding | BLOCKED |
| V01 | Generic vocabulary in navigation, content, empty/error states, email and legal; preserve genuine hair terminology | Audit/corrections outstanding | BLOCKED |
| V02 | Category-specific team and service labels in en/fr/es/zh-CN; solo team hidden | Category-specific labels and four-language copy implemented; Solo shell hides team; full rendered category matrix outstanding | BLOCKED |
| V03 | Four interface languages; Wolof removed from choices, authored historical text intact | Catalog/provider/API filters implemented; three local category/locale checks pass | AUTOMATED ONLY |
| V04 | Explore and For Businesses menus exactly specified, no duplicate application destination | Navigation and Why Girlz Culture route written; rendered verification outstanding | BLOCKED |
| V05 | Honest AI labels on all three assistants and other AI features; concise natural copy | Audit outstanding | BLOCKED |
| P01 | Two families, five exact monthly prices, complete 23-row comparison, organic visibility statement | Catalog/page/fixture tests written; 4 local plan tests pass; browser outstanding | AUTOMATED ONLY |
| P02 | Every comparison-row entitlement enforced: reminders, reporting, source, waitlist, rebooking, promotions, products, GBP help, ads | Promotion/product limits implemented; remaining entitlement paths under review | BLOCKED |
| P03 | Core booking, deposits, chat, cards, finance, full Assistant, visibility, language and unlimited bookings for all tiers | Core flags/database resolution updated; 44 local DB checks pass | AUTOMATED ONLY |
| P04 | Solo one calendar across professionals, simultaneous overlapping booking attempts; team separate calendars | Database advisory lock and occupancy guard; 44 local checks include concurrency with distinct customers/professionals | AUTOMATED ONLY |
| P05 | One-action Solo to Starter upgrade grants calendars/team with audit, no unverified charging claim | Not implemented; payment configuration excluded | BLOCKED |
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
| B02 | All calendar, finance, page/media/service, client/card, team, product/promotion, review/message/settings/subscription capabilities with review | Existing tools require capability-by-capability audit; no blanket completion claim | BLOCKED |
| B03 | Fuzzy service/professional matches, Boho/Dominican examples; choices only for real ambiguity | Existing P0 evidence retained; Master examples outstanding | BLOCKED |
| B04 | Any professional/service; Alma Aba Thu Sep 24 15:30 exact or conflict with real alternatives; no silent 15:00 substitution | Exact frozen-clock Alma Sep 24 15:30 any-service/professional preparation and conflict-without-time-substitution checks passed locally; hosted/provider wording outstanding | AUTOMATED ONLY |
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
