# Morning Brief — implemented, automated verification only

Owner Overview now opens with a read-only operating brief. No hosted or production acceptance is claimed. It uses existing authorized business records, not model-generated facts. No new migration, AI request, notification, booking, charge or finance write is performed by opening or refreshing it.

| Requested clause | Implemented behavior | Evidence |
| --- | --- | --- |
| Immediate daily operating view | Appears after the welcome header; uses the business timezone and shows refresh time | Chromium/WebKit, phone/tablet/desktop/landscape |
| Appointments, clients, stylists | Today's scoped appointments with canonical service/professional names and record links; test bookings excluded | Server test with two businesses and adjacent dates; browser names preserved |
| Schedule risks | Same-professional overlapping pairs, unassigned appointments and started appointments whose status needs checking | Server overlap fixture; no inferred no-show |
| Expected value, deposits, balances | Canonical Finances books; deposit is part of received money; refunds reduce receipts; estimates explicitly distinct from received revenue | $200 expected, $10 deposits, $45 received after refund, $155 outstanding fixture |
| Cancellations/no-shows | Recorded statuses counted separately; excluded from displayed appointment-money totals with explicit explanation | Server fixture |
| Open time/waitlist | Existing live availability helper includes holds/blocks; waiting windows matched only as opportunities requiring review | Scoped query test; interface explicitly does not promise service-fit or create an offer |
| Inventory/reorder | Existing protected stock RPC; low/out/unknown tracked stock and names; inventory link | Server and browser fixtures |
| Follow-ups | Due, unexpired, pending post-visit queue joined to this business's completed matching booking revision; test bookings excluded; record links | Server projection and browser fixture; sending still requires the existing consent/eligibility checks |
| One or two next steps | Deterministic priorities from available risks, stock, waitlist and follow-ups; links to controlled workflows | Browser checks exact two links |
| Operating brief, not analytics | Today and actionable records only; historical analytics remain in their existing section | Rendered desktop/phone inspection |

Security: owner-only endpoint; fresh authenticated business authority; no accepted business-ID query override; scoped queries before projection; mixed-business related/finance records fail closed; `private, no-store`; no credentials or raw database errors returned. Partial failures preserve available sections and show the exact captured incident reference rather than a false zero. Staff retain their existing individually permitted views and never request this owner summary.

Automated evidence (outside Git in `work/redesign-evidence`):

- `morning-unit.log`: 5/5 focused server/core regressions.
- `morning-browser-final.log`: 12/12 Morning Brief cases, Chromium/WebKit; four release languages, refresh/reload, partial failure recovery, owner/staff boundary.
- `morning-browser-before.log`: all eight affected overview/calendar regressions passed. The one new Spanish assertion failed because it assumed Spain's currency format; corrected to the existing `es-US` contract. Original screenshot/trace retained. No application language behavior was changed to satisfy it.
- `morning-build.log`, `morning-types.log`, `morning-lint.log`: build, TypeScript, targeted lint pass.
- `morning-design.log`, `morning-monitoring.log`: semantic design and all 150 monitored API routes pass.
- `morning-catalog.log`: 2501/2501 source strings covered in EN/FR/ES/zh-CN; Wolof deferred.
- `morning-local-schema.log`: existing local schema supports the new projections; transaction read-only and rolled back.
- `morning-clean-database-utc.log`: all 172 migrations and SQL assertions, including waitlist concurrency, pass against a new local database with UTC sessions.

## Two demonstrated CI failures corrected in this checkpoint

Required run 35409827640 rejected `disabled:opacity-50` in Google settings. The control now uses semantic disabled surface/text colors. The audit remains enforced.

Release-candidate run 35409827609 passed localization and all three browser shards, then failed the finance SQL fixture. At reproduction, database date was 2026-09-19 while the New York business date was 2026-09-18. `current_date` had selected a future local agreement. `finance-utc-before.log` reproduces the exact failure; `finance-utc-after.log` passes the unchanged commission-version assertion plus new checks immediately before and at business midnight. Application compensation logic was not changed or weakened.

Remaining: updated-source required CI, final hosted authorized-business acceptance with real existing records and error recovery, and the wider release gates. Neither this brief nor the Google integration is claimed live.
