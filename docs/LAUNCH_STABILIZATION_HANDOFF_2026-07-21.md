# Girlz Culture launch-stabilization handoff

Prepared: 2026-07-21

Branch: `codex/launch-blocker-stabilization`

Production mutations performed by Codex: none

This handoff uses only `Complete`, `Not complete`, `Blocked`, and `Not applicable`. Repository or local-runtime proof is not presented as proof of an authenticated production workflow.

## 1. Pushed branch

`codex/launch-blocker-stabilization`. The final response accompanying this document records whether the authorized push completed.

## 2. Final commit hash

The final response records the immutable pushed hash after the documentation commit is created.

## 3. Pull request

The final response records the direct draft pull-request link. Codex does not merge it.

## 4. Pull-request title and description

The complete proposed title and body are committed in `docs/LAUNCH_STABILIZATION_PR_2026-07-21.md`.

## 5. Working-tree state

The final response records the post-push `git status --short` result. A clean tree is required before handoff.

## 6. Main integration

Before push, confirm `git merge-base --is-ancestor origin/main HEAD`. If `origin/main` moves, fetch and merge it, rerun verification, and only then push. No force push is allowed.

## 7. Included commits

The final response supplies the exact `origin/main..HEAD` commit list. This pass includes lifecycle/publication stabilization, truthful local discovery, flexible service catalog and media/campaign workflows, protected error monitoring/localization, and the final catalog/video/accessibility/verification hardening.

## 8. Files changed, grouped by priority

### P1 - lifecycle and authenticated write stability

- Parent and child salon-lifecycle triggers are separated.
- Admin salon coordinates conform to the RPC return type.
- Salon publication/save routes use authenticated server authorization.
- Anonymous public salon reads remain constrained.

### P2 - publication and local discovery

- Publication diagnostics, collision-safe slugs, redirects, controlled reconciliation, pause/unpublish/closure behavior, and ineligible-route fallbacks.
- Fifty-mile default and a configurable plan distance adjustment bounded to 0-3 miles inside the eligible local candidate set.

### P3 - catalog and owner operations

- Flexible group-level salon services, managed option validation, owner save routing, numeric editing behavior, dependency-aware record operations.
- Case-insensitive stable catalog ordering and visible-result-only batch selection.

### P4 - media, campaigns, monitoring, and localization

- Unified responsive media placement; crop movement in all directions.
- Trending MP4/WebM metadata, trim, poster, drag/drop, progress, cancel, retry, cleanup, moderation, archive, and public playback.
- Sanitized error monitoring with reference/correlation IDs.
- Thirty-seven locale records, persistent selector coverage, English fallback, and governed Engine editing.

### P5 - release verification and operator controls

- Protected migration workflow preflight, catalog verifier, dependency upgrades, unauthenticated error-status consistency, gallery dialog focus containment, this handoff, and the PR description.

Use `git diff --stat origin/main...HEAD` and the PR Files changed tab as the authoritative file list.

## 9. Exact migration order

Run only through the protected GitHub Actions workflow and only after the PR is merged into `main`:

1. `20260721110000_launch_blocker_core_stabilization.sql`
2. `20260721120000_salon_publication_controls.sql`
3. `20260721130000_local_discovery_launch_defaults.sql`
4. `20260721140000_flexible_service_catalog.sql`
5. `20260721150000_platform_error_monitoring.sql`

## 10. Migration-impact table

| Migration | Immediate data effect | Objects/permissions | User-state impact | Transaction, rerun, failure, lock/time |
| --- | --- | --- | --- | --- |
| P1 core stabilization | Schema/function repair only. It does not insert, update, delete, or backfill user rows. | Replaces the admin salon RPC coordinate projection with explicit `double precision` casts; replaces parent/child lifecycle trigger functions; recreates triggers on `salons`, `styles`, `stylists`, `salon_applications`, and `subscriptions`; revokes trigger-function execution from public roles. RLS is not disabled or widened. | Does not immediately change salon/application/publication/subscription/ownership/address/URL, booking, billing, Stripe, storage, notification, or Auth rows. Later qualifying writes invoke the corrected trigger. | One transaction. `CREATE OR REPLACE` and `DROP TRIGGER IF EXISTS` make it operationally rerunnable. Failure rolls the file back. Brief function/trigger catalog locks and short table trigger DDL locks; seconds on the current small dataset. Roll forward with a corrected migration if production differs. |
| P2 publication controls | Adds defaulted salon columns and creates empty audit/control tables. It does **not** execute reconciliation. No existing salon slug or visibility row changes merely by applying the migration. | Adds `accepting_bookings`, owner-unpublish and closure columns; creates `salon_slug_redirects`, `salon_closure_requests`, `salon_reconciliation_runs/items`, indexes and RLS; permits public read only of active redirects; creates slug/diagnostic/reconciliation functions and a slug redirect trigger; routes lifecycle triggers through publication checks; restricts reconciliation functions to service role. | No immediate change to status, approval, subscription, ownership, address, coordinates, URLs, bookings/billing/Stripe/storage/notifications/Auth. A later qualifying salon/child write or explicit authorized execute-reconciliation may change a `pending-*` slug and lifecycle/discoverability. Ineligible salons cannot publish because existing lifecycle gates plus active status, valid slug, subscription/setup/address requirements, and owner-unpublish state are enforced. An existing active salon may be hidden on later reconciliation if it fails a required gate or is owner-unpublished. | One transaction. DDL/functions use guards/replacement, but table constraints and policy recreation still require normal release care. Failure rolls the file back. Short `salons` DDL/default lock plus catalog locks; seconds on a small database. Do not call the RPC's `p_execute=false` as a "read-only" preview: it intentionally writes preview audit rows. Use section 11 SQL instead. |
| P3 local discovery defaults | Updates `search.default_radius_miles` only when its published value is still exactly `25`; inserts the max plan bonus setting only if absent. No salon/user rows change. | Replaces `discover_nearby_salons_ranked`, revokes public function rights, grants execute to `anon`/`authenticated`, and documents the ranking contract. No RLS policy changes. | Does not change salon status/publication/subscription/ownership/address/coordinates/URL or any booking/billing/Stripe/storage/notification/Auth record. Query behavior changes to a 50-mile default and a max configured bonus of 1.5 miles (hard bounded 0-3). Plans never bypass eligibility/radius; true distance is the next tie-breaker. | One transaction and safe conditional upsert/replace. Failure rolls back settings and function together. Row locks only on matching Engine settings plus a brief function catalog lock; seconds. |
| P4 flexible service catalog | Backfills `styles.service_group_id` from each linked `master_styles.service_group_id`, then makes the group mandatory. This is the one migration that deliberately updates existing style rows. It deletes no business/history rows. | Adds catalog `sort_order`; adds/constraints/indexes `styles.service_group_id`; makes `master_style_id` optional; replaces structured-style validation trigger and material replacement function; adds a service-group reassignment function with audit event; grants only the intended authenticated/service roles. RLS is not weakened. | Does not change salons, applications, visibility, subscription, ownership, address, coordinates, public URLs, bookings, billing, Stripe, storage, notification, or Auth rows. Existing styles with an absent/broken master or master without a group will cause the transaction to fail before the NOT NULL constraint, rather than silently inventing taxonomy. | One transaction. Add columns are guarded, functions replaced, and index guarded. The backfill/NOT NULL step makes rerun safe only after every style resolves. Failure rolls back the whole file. It takes update locks on affected `styles` rows and a stronger brief table lock for `SET NOT NULL`; preview unresolved rows first. Seconds at current scale; schedule a quiet window if style volume grows. |
| P5 error monitoring | Creates empty event/occurrence tables and inserts/upserts a small fixed set of alert-rule defaults. No user, salon, or operational records change. | Creates three monitoring tables, indexes, RLS and admin-only policies; creates service-role-only sanitized capture/purge functions. Does not create storage rules or expose credentials. | No salon/application/publication/subscription/ownership/address/URL, booking, billing, Stripe, storage, notification, or Auth effect. | One transaction. Tables/indexes are guarded, policies replaced, rules conflict-safe, functions replaced. Failure rolls the file back. Brief catalog locks; seconds. Purge is not run during migration. |

### P2 reconciliation behavior

- Candidate set for an explicit reconciliation run: salons whose slug begins `pending-`, plus salons with `status='Active'` and `is_discoverable=false`, capped by the authorized request (1-500).
- A `pending-*` slug changes only when reconciliation executes after the salon is approved, has a real non-placeholder name, and all lifecycle/publication gates allow the path. Applying P2 alone does not change it.
- The base slug is normalized with unaccent/lowercase/non-alphanumeric hyphenation. Collisions use `-2`, `-3`, and so on, including collisions with active historic redirects.
- A non-pending old slug is preserved in `salon_slug_redirects`; an active old public URL redirects. Deliberately temporary `pending-*` URLs are not advertised and are not preserved as redirects; they render the neutral fallback.
- Reconciliation invokes the existing lifecycle diagnostic. It can publish only an approved, complete, active, subscribed/trialing, geocoded/reviewed, media-complete salon with the required styles/stylists and no owner unpublish state. It cannot make an incomplete, suspended, offboarded, new, pending, unsubscribed, unapproved, or ungeocoded salon public.
- It can keep or make an existing record hidden when a required gate fails. This is intentional fail-closed behavior and must be reviewed from the preview before execute.

## 11. Read-only pre-migration preview queries

Run these in the Supabase SQL Editor before dispatching the workflow. Every statement is `SELECT`-only; none invokes the reconciliation RPC, because even the RPC's preview mode writes audit rows.

```sql
-- A. Current database size and affected operational counts.
select 'salons' object, count(*) rows from public.salons
union all select 'applications', count(*) from public.salon_applications
union all select 'styles', count(*) from public.styles
union all select 'stylists', count(*) from public.stylists
union all select 'bookings', count(*) from public.bookings
union all select 'subscriptions', count(*) from public.subscriptions;

-- B. P1: inspect the current parent/child trigger bodies and admin salon RPC.
select p.proname, pg_get_function_identity_arguments(p.oid) arguments,
       pg_get_functiondef(p.oid) definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('refresh_salon_lifecycle_from_salon',
                    'refresh_salon_lifecycle_from_child',
                    'admin_list_salons')
order by p.proname, arguments;

-- C. P2: exact candidate population, current gates, proposed base slug,
-- and collision count. This predicts; it does not allocate or update a slug.
with facts as (
  select s.id,s.name,s.slug,s.status,s.is_discoverable,s.subscription_status,
         s.approved_at,s.geocode_status,s.address_needs_review,s.latitude,s.longitude,
         exists(select 1 from public.salon_applications a
                where a.salon_id=s.id and a.status in ('Approved','Active')) approved_application,
         (select count(*) from public.styles st where st.salon_id=s.id and st.archived_at is null) active_styles,
         (select count(*) from public.stylists sy where sy.salon_id=s.id and sy.archived_at is null) active_stylists,
         trim(both '-' from regexp_replace(
           regexp_replace(lower(extensions.unaccent(trim(coalesce(s.name,'')))),
                          '[^a-z0-9]+','-','g'),'-+','-','g')) proposed_base_slug
  from public.salons s
  where s.slug ~ '^pending-' or (s.status='Active' and not s.is_discoverable)
)
select f.*,
       (select count(*) from public.salons other
        where other.id<>f.id and other.slug=f.proposed_base_slug) base_slug_collisions
from facts f
order by f.id;

-- D. P3: values that would be conditionally changed/created.
select setting_key,published_value,draft_value,status,version
from public.engine_settings
where setting_key in ('search.default_radius_miles',
                      'search.max_plan_distance_bonus_miles')
order by setting_key;

-- E. P4: rows that cannot be safely backfilled. This result must be empty.
select s.id style_id,s.salon_id,s.name,s.master_style_id,
       m.id matched_master_style_id,m.service_group_id
from public.styles s
left join public.master_styles m on m.id=s.master_style_id
where s.master_style_id is null or m.id is null or m.service_group_id is null
order by s.salon_id,s.name;

-- F. P5: detect pre-existing monitoring objects/rules.
select to_regclass('public.platform_error_events') events_table,
       to_regclass('public.platform_error_occurrences') occurrences_table,
       to_regclass('public.platform_error_alert_rules') rules_table;
```

Save the result grids as launch evidence. If query E returns rows, do not run migrations; repair the catalog mapping in a reviewed migration first.

## 12. Correct GitHub and Netlify release sequence

Because Netlify normally auto-builds/publishes `main`, the safe order is:

1. Open the draft PR and wait for every required PR check to pass.
2. Run section 11 previews and retain the output.
3. **Before merge**, Netlify -> site -> **Deploys** -> **Lock** production deploys. Locking prevents automatic publish while still allowing the merged build to be created.
4. Review and merge the PR into `main` yourself.
5. GitHub -> repository -> **Actions** -> **Verify and apply database migrations** -> **Run workflow** -> branch `main` -> enter exactly `APPLY REVIEWED MIGRATIONS` -> Run workflow. This manual workflow first reruns verification, uses the protected `production-database` environment, serializes execution, performs a dry run, pushes ordered migrations, and prints the final migration list.
6. Do not continue until the workflow and its final migration-list check are green.
7. Netlify -> **Deploys** -> open the build for the merged `main` commit. Confirm build success and the exact commit hash. Publish that deploy, then unlock production deploys (or unlock and retry/trigger the latest deploy as appropriate).
8. Execute the six-role and live/provider portions of section 14. Keep indexing disabled until the founder's launch decision.

The naïve `merge -> migration -> automatic production deploy` order has a race. Locking Netlify before merge makes the required order deterministic: checks -> preview -> lock -> merge -> protected migrations -> publish the already-built compatible app -> production verification.

## 13. Environment-variable changes

No new runtime environment variable is introduced by the final stabilization changes. Preserve the variables in `docs/FOUNDER_GO_LIVE_CHECKLIST.md`. The protected GitHub `production-database` environment must contain `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_PROJECT_ID`. Netlify still requires the existing Supabase public URL/anon key and server-only service-role key plus configured Stripe/provider variables. Never expose the service-role, Stripe secret/webhook, database password, Resend, Twilio, or internal secret with a `NEXT_PUBLIC_` prefix.

## 14. Numbered six-role authenticated test script

Use unique tagged data such as `LAUNCH-20260721-A` and Stripe test mode only. Capture a screenshot plus relevant ID/reference for every step. “DB” means verify in the protected Admin/Engine UI or Supabase Table Editor with read-only inspection; do not edit tables manually.

| # | Role / exact path | Data and action | Expected visible result / expected DB or Engine state | Must not happen / evidence to capture | If it fails / launch status |
| --- | --- | --- | --- | --- | --- |
| 1 | Anonymous `/`, `/styles`, `/salons`, `/how-it-works`, `/about`, `/blog`, `/help`, `/contact`, `/testimonials` | Test desktop and 390px mobile; tab through header, language selector, carousels, accordions and footer; search a style/location. | Every page renders, language choice persists after reload, focus is visible, no horizontal overflow; discovery shows real/empty results, never fabricated cards. | No private tier/email/owner fields, pending salon, broken key, blank translation, console exception, dead link, or raw provider error. Capture full-page desktop/mobile, selected locale and network statuses. | Check deploy hash, console/network, Engine nav/content publication. Any 5xx, leaked data, broken primary nav or overflow blocks launch. |
| 2 | Anonymous `/salon/pending-<fixture>` and an ineligible salon slug | Open the temporary/hidden URL. | Neutral not-available page; server public query returns no salon data. | No salon details or Book Appointment CTA. Capture page and request status. | Inspect publication diagnostic and public-safe server query. Exposure blocks launch. |
| 3 | Anonymous `/login` -> `/forgot-password` | Request reset for known and unknown emails; compare response; use only the delivered known-user code. | Both requests show the same safe acknowledgement; valid reset reaches completion; reused/expired code is rejected. DB: hashed single-use challenge/audit state only. | No account enumeration, code in URL/log, cross-role session loss, or raw Auth error. Capture UI and redacted provider delivery. | Check Auth/provider logs by correlation ID. Enumeration or reset bypass blocks launch. |
| 4 | Customer `/login` sign-up tab | Enter `launch.customer+<tag>@example.test`, strong password, US phone; verify email; try same email with case/whitespace and on salon/admin signup. | One canonical customer identity and customer row; duplicate cross-role attempts are denied generically; correct destination is `/account`. | No second identity, role escalation, or service-role data in browser. Capture normalized identity/customer IDs and denial messages. | Check `platform_identities`, signup route and Auth confirmation. Duplicate identity or wrong role blocks launch. |
| 5 | Customer `/account` then logout/login | Open Overview, Upcoming, Past, Favorites, Reviews, Inbox, Payment Methods, Settings; update allowed profile/locale; logout and log back in. | All eight tabs load arrays/empty states without crash; saved fields and locale persist; customer sees only own data. | No other customer's rows, subscription prompt, or admin/salon session corruption. Capture each tab and DB customer preference. | Inspect scoped session storage, API 401/403, customer RLS. Cross-account data or broken core tabs blocks launch. |
| 6 | Salon applicant `/plans` -> `/salon/signup` -> `/salon/apply` | Select a plan; use `launch.owner+<tag>@example.test`, strong password, US phone; verify; complete business name, owner, email, phone, structured US address/state/ZIP, neighborhood, type, source and consents; submit. | Plan is carried without charging; one canonical owner identity, one application and associated pending salon; `/salon/application-submitted`; admin count/state grouping updates. | No payment at application, email-string ownership matching, duplicate row, public salon, or lost state. Capture IDs, selected plan and submitted/state status. | Check signup/application server logs, `platform_identities`, `salon_applications`, `salons.user_id`. Missing admin record or public pending salon blocks launch. |
| 7 | Super admin `/admin/submissions` | Locate tag under correct US state; open detail; first Reject with reason. | State count is correct; status becomes Rejected; owner sees rejection/status and permitted resubmission path; audit records actor/reason. | No deletion, activation, public visibility or generic `.map` crash. Capture state group/detail/audit. | Check application state normalization, admin permissions and API response. Missing/incorrect state blocks launch. |
| 8 | Salon owner `/salon/apply` or pending status flow | Correct requested field and resubmit same application. | Existing application returns to submitted/pending review without duplicate salon/identity; revision is visible. | No new salon, lost selected plan, public visibility or team access. Capture IDs before/after. | Check application upsert and canonical owner relationship. Duplicate ownership blocks launch. |
| 9 | Limited admin `/admin/submissions` | With only `submissions` permission, review the resubmission; try direct `/admin/finance`, `/admin/settings`, `/admin/engine`. | Granted section loads; other paths show clean access denial/redirect, never crash or undefined `.map`. | No hidden data returned by APIs and no super-admin actions. Capture UI plus 403 network response for a denied API. | Check `admin_users.permissions`, section mapping and server guard. Permission bypass blocks launch. |
| 10 | Super admin `/admin/submissions/<id>` | Approve/activate applicant with reason. | Application Approved/Active, owner/user ID linked, salon status reflects lifecycle; audit actor/time/reason. If setup/subscription incomplete it remains not discoverable. | No automatic public exposure, placeholder slug promotion, or email ownership fallback. Capture detail, lifecycle diagnostic and rows. | Check approval RPC/API, trigger logs and publication gates. Unauthorized/wrong activation blocks launch. |
| 11 | Salon owner `/salon/login` -> `/salon/dashboard/subscription` | Sign in after approval; choose selected plan; complete Stripe **test** checkout using `4242 4242 4242 4242`, future expiry/CVC; wait for webhook. | Before payment, owner is limited to subscription; after successful test webhook salon subscription is active/trialing and dashboard unlocks. Billing event stores provider IDs, not card details. | No real charge, dashboard unlock before webhook, client-controlled activation, or duplicate subscription. Capture Stripe test event, webhook 2xx, subscription/ledger IDs. | Check Stripe event log, Netlify function log, webhook idempotency and subscription row. Billing bypass or wrong amount blocks launch. |
| 12 | Salon owner all dashboard tabs | Open Overview, My Page, Photos, Styles & Pricing, Stylists, Products, Availability & Calendar, Bookings, Messages, Reviews, Earnings & Payouts, Promotions, Subscription, Settings. | All 14 sections render; active plan gating is correct; no realtime listener error or undefined-array crash. | No team-only subscription behavior, direct unauthorized browser write or raw DB error. Capture one screenshot per tab and failed-request list. | Check scoped session, bootstrap payload arrays, permission/subscription gate and realtime registration order. Broken required owner tab blocks launch. |
| 13 | Salon owner `/salon/dashboard/my-page`, `/photos`, `/settings` | Save real salon name/description, US address fields, phone/email, languages, trust fields, hours, booking/notification settings; upload logo, cover and gallery; move crop left/right/up/down; reorder/replace/delete an image. | Saves succeed first attempt and persist after reload; geocode becomes success/reviewed; responsive previews match; media registry/ownership references exist and staged objects finalize. | No RLS violation, fragile email ownership, orphan staging file, overflow, service-role key, or raw storage error. Capture before/after UI, address/geocode state and media IDs. | Use request reference in error monitor; check owner server authorization, media policy/registry and geocoder. Profile/save/auth leak blocks launch. |
| 14 | Salon owner `/salon/dashboard/stylists`, `/styles`, `/products`, `/promotions` | Add/edit/archive/restore a stylist with photo/portfolio/specialties/availability; add a managed or group-level service with duration, prices, size/length, add-ons, materials/inclusions/photos; add product and promotion. Clear/re-enter numeric fields while editing. | Every save persists/reloads and public-eligible content mirrors on profile; blank temporary numerics do not become zero; invalid save gives plain validation. DB: records carry salon ID/user authorization and managed group. | No client direct write bypass, RLS error, broken foreign key, hidden Premium/Growth feature use by lower tier, or stale media. Capture each ID/public render and gating state. | Check `/api/salon/records/save`, owner/team relation, catalog dependency/validation and error reference. Inability to save core records blocks launch. |
| 15 | Salon owner `/salon/dashboard/availability` | Set weekly hours, per-stylist schedule, buffers, any-stylist option and blockout; attempt an invalid/overlapping range. | Valid values persist and booking availability reflects them; invalid ranges are rejected safely. DB: availability/blockout tied to salon/stylist. | No phantom slot, timezone shift or raw exclusion/RLS message. Capture calendar and availability API response. | Check salon timezone, booking rules and constraint reference. Incorrect bookable slots block launch. |
| 16 | Salon owner `/salon/dashboard/settings` Add User | Add `launch.team+<tag>@example.test`, US phone, Stylist role, Active, only selected permissions; click the single Add User button once. | User appears immediately in Authorized Users; invitation/identity/team record created once; remove option visible. | No first-attempt failure, separate Save Permissions button, duplicate identity or owner-level privilege. Capture form/list/invite delivery and relationship row. | Check invitation API, canonical identity reservation and team permissions. Unreliable or overprivileged user creation blocks launch. |
| 17 | Salon team `/salon/login` -> dashboard | Accept invitation/login; open every visible team tab and direct-navigate to every denied owner tab including Subscription. Save one permitted stylist/booking field; attempt one denied action. | Goes straight to dashboard because subscription belongs to salon; only granted tabs/actions appear; permitted save works; denied API is 403 with safe UI. | No Activate subscription screen, billing access, owner permissions, other salon data, or crash. Capture landing page/nav, allowed save and denied response. | Check parent salon active subscription, `salon_team_users`, server permission mapping. Subscription prompt or privilege bypass blocks launch. |
| 18 | Salon owner `/salon/dashboard` + super admin `/admin/salons` | Complete all lifecycle checklist gates. Use lifecycle diagnostic; if authorized, execute controlled reconciliation for tagged salon. | Completion reaches 100%; approved/active/subscribed/geocoded salon gets collision-safe non-pending slug and publishes. Same-name fixture receives `-2` or next suffix. | No incomplete fixture publishes and no broad reconciliation outside selected/tagged salon. Capture diagnostic before/after, slug rows, audit. | Check failed gate labels, migration status, slug collisions and reconciliation item. Wrong publication or collision blocks launch. |
| 19 | Anonymous old/current `/salon/<slug>` | Open final slug, former non-pending slug, and former `pending-*` slug. | Final profile loads; former real public slug redirects to current; temporary pending path stays neutral. | No redirect loop, leaked pending profile, broken canonical URL or booking on inactive salon. Capture status/location and canonical tag. | Check `salon_slug_redirects`, retired flag and public loader. Public routing leak/loop blocks launch. |
| 20 | Salon owner My Page/Settings + admin Salons | Pause/owner-unpublish then republish; submit closure; admin approve close/offboard; reopen/restore where policy permits; request archive/delete with dependencies. | Pause removes discovery/booking without deleting history; republish only when eligible; closure audited; reopen restores eligible state; protected dependencies cause archive/offboard explanation, not hard delete. | No history/billing/booking deletion, hidden state mismatch or unauthorized reopen. Capture lifecycle audit and public/search results at each state. | Check diagnostic, closure request and record management events. Public closed salon or history loss blocks launch. |
| 21 | Anonymous/customer `/salons` | With at least three eligible geocoded fixtures at known distances/plans, search within 50 miles, style/service and filters; compare distance ordering. | Only eligible local matches; nearest-first uses real miles. Premium receives max configured 0-3 mile adjustment, Growth half, Basic zero, then real distance tie-breaks; a substantially farther plan cannot jump a nearer salon. | No out-of-radius, hidden/unsubscribed salon, private tier in response, fake result or Texas stale default. Capture coordinates, returned distance/order and Engine max bonus. | Check migration P3, `is_marketplace_visible`, geocode/radius and Engine settings. Truthful discovery failure blocks launch. |
| 22 | Customer `/salons` -> `/salon/<slug>` -> `/salon/<slug>/book` | Select salon/service/options/stylist/available time; enter customer details and accept deposit terms. | Live price/duration updates; only real available slots; review shows exact service/options/time/stylist/10% deposit. | No stale slot, hidden price, overlapping hold or raw conflict. Capture each booking step and availability response. | Check salon timezone, availability RPC, style IDs/options and concurrent hold. Incorrect price/slot blocks launch. |
| 23 | Two customer sessions same slot | Submit the same stylist/time concurrently; also try overlapping booking with same normalized customer email. | Exactly one succeeds; database rejects stylist overlap and customer overlap; losing session gets plain choose-another-time message. | No double booking or raw constraint/function error. Capture timestamps, booking IDs and protected error reference. | Check booking integrity migration/constraints and normalized generated email. Double booking blocks launch. |
| 24 | Customer booking payment/confirmation | Complete 10% Stripe test deposit; open confirmation, copy code, add calendar. | Checkout is test mode; one booking/PaymentIntent/ledger event; confirmation page and account show Confirmed with exact deposit/balance. | No real card, duplicate charge, full-service charge, secret, or unconfirmed booking before verified webhook. Capture test receipt/event/webhook/confirmation. | Check Stripe webhook idempotency and booking status endpoint. Payment mismatch blocks launch. |
| 25 | Customer `/account?tab=upcoming`, owner Bookings | Reschedule/cancel per policy; owner confirms/cancels where permitted; execute a Stripe test refund if policy calls for it. | Both accounts converge on status/time; slot releases; refund/cancellation ledger and audit are correct and idempotent. | No orphan slot, double refund, history deletion or cross-customer edit. Capture both views, Stripe test refund and ledger. | Check booking event/notification/refund logs. Incorrect money/status blocks launch. |
| 26 | Providers + Engine notifications | For tagged booking, observe confirmation, reschedule, cancel and reminder channels where configured. | Email/SMS/push/templates use booking/customer locale, safe values and delivery status; reminder is sent once at configured time. | No secret/PII in logs, duplicate send, English key fragments or claim of delivery when provider missing. Capture redacted provider event IDs. | Check Engine template publication, provider config, scheduled function and error reference. Email confirmation/payment receipts block launch; optional provider channels may be documented if intentionally disabled. |
| 27 | Customer `/review/<bookingId>`, `/complaint`, `/contact` | Submit completed-booking review/photos; attempt premature/duplicate review; submit complaint and support request. | One verified review linked to completed booking; salon rating updates; premature/duplicate denied; complaint/support arrive in admin inbox with unread count. | No review for another user/booking, XSS rendering, lost message or private contact leak. Capture public review, rating and admin inbox IDs. | Check customer ownership, completion gate, sanitization and support tables. Review bypass or lost complaint blocks launch. |
| 28 | Salon owner Reviews/Messages + admin Reviews/Support/Complaints | Reply to review, message within booking, respond to support, moderate/flag/dispute with reason. | Authorized replies persist; unread counts/realtime update without `subscribe()` callback error; audits keep original content/history. | No edit/delete outside policy, cross-salon thread, raw error or missing actor. Capture all role views and event IDs. | Check channel setup registers listeners before subscribe and cleans up; inspect permission/RLS. Cross-tenant access blocks launch. |
| 29 | Limited admin `/admin/<section>` | Grant only two test permissions; open every admin path: Overview, Submissions, Salons, Customers, Bookings, Quality & Performance, Reviews, Payments & Finance, Marketing & Promotions, Content Management, Customer Support, Complaints, Subscriptions, The Engine, Settings & Team. | Only granted navigation/sections/data load; every denied section fails cleanly without `.map` crash; Overview respects safe scope. | No hidden array/data in network response, settings/Engine escalation or subscription mutation. Capture route/status matrix. | Check `permissionForSection`, `rows()`, API `requireAdminPermission`. Any permission bypass blocks launch. |
| 30 | Super admin same paths | Open all 15 admin sections above; execute read-only filters/pagination and an allowed reversible test action in each operational section. | Every tab loads arrays/empty states, counts and filters; no undefined mapping. Audit action includes actor/reference. | No dead tab, unhandled error, private secret or unexplained count drift. Capture tab matrix/network errors. | Check migration state, `/api/admin/data?section=`, error monitor reference. Broken core admin tab blocks launch. |
| 31 | Super admin `/admin/engine` | Open all 21 Engine categories: Branding & Design; Navigation & Menus; Pages & Page Sections; Homepage Composition; Service Catalog & Taxonomies; Salon Setup & Lifecycle; Booking & Availability; Payments/Deposits/Subscriptions; Search/Discovery/Location; Markets & Service Areas; Media & Upload Rules; Languages & Translations; Notifications & Templates; Trust/Reviews/Quality; Promotions & Campaigns; Customer Support; Users/Roles/Permissions; AI & Automation; Test Data & Maintenance; Integrations & System Status; Configuration History/Publishing/Recovery. | Each category loads, explains affected surfaces, preserves draft/published versions and permissions; ordinary setting draft/publish/reload/rollback works with reason. | No secret values, unreviewed high-risk auto-publish, environment crossing, blank fallback or non-admin access. Capture category matrix and version/audit. | Check Engine migrations/status, permission, environment and history. Security/booking/payment configuration bypass blocks launch. |
| 32 | Super admin Content + public page | Edit a tagged low-risk About/Testimonial/Help item and blog draft; preview desktop/mobile; save/reload; publish; archive/restore. | Draft persists in `content_pages`/`blog_posts`; only published item appears publicly; archived item disappears; error failure has visible reference. | No unsaved false success, draft leak, raw Supabase error or lost structured sections. Capture editor reload, DB timestamps and public result. | Check content API authorization, allowed fields, audit/error reference and cache revalidation. Content save failure blocks launch. |
| 33 | Super admin Service Catalog workspace | Verify case-insensitive accented alphabetical display; create/edit/archive/restore and refresh. Select individual rows, Select visible, Clear, archive; preview dependencies; reassign; delete only safe test row. | Explicit positive sort order wins; otherwise stable alphabetic order with empty last. Selection count/targets match visible results; one confirmation lists outcomes; each row reports success/failure; failed rows remain selected. | No hidden filtered row action, raw FK error, financial/history delete, unsafe dependent delete or stale order. Capture before/after lists, confirmation and event rows. | Check shared comparator, API sorted results, dependency refresh and record events. Unsafe bulk delete blocks launch. |
| 34 | Super admin Marketing -> Trending Picks | Execute section 15 with supplied MP4/WebM, then approve/schedule/publish/archive. | Audited campaign lifecycle, public playback, lazy loading and mobile `playsinline` work. | No raw codec/storage error, orphan canceled upload, autoplay with sound or unmoderated public media. Capture campaign/storage paths and public/mobile video. | Use section 15 diagnostics. Public media leak or unsafe orphan behavior blocks launch. |
| 35 | Super admin Settings & Team | Add limited admin on the one-screen form with name/email/US phone/role/status/permissions and one Add User click; log in as that user; remove/deactivate. | User appears immediately; only selected permissions work; removal revokes future access; last super admin cannot be removed. | No separate Save Permissions, first-attempt failure, company-domain bypass or privilege inheritance. Capture form/list/session denial/audit. | Check canonical invitation, `admin_users`, recent MFA requirement and domain. Admin privilege bypass blocks launch. |
| 36 | Super admin Error Monitoring/Audit | Trigger a safe validation error carrying a unique reference; find by correlation ID; resolve/reopen; inspect retention rule. | Customer sees plain error/reference; protected monitor shows sanitized technical context, severity/fingerprint/count/time; no sensitive values. | No token/password/email/body dump in monitor/public response. Capture redacted event/occurrence and response reference. | Check capture function/service route sanitization. Secret leak blocks launch. |

## 15. Video-fixture tests

Use a short non-copyrighted H.264/AAC MP4 and a short WebM. In `/admin/marketing`, open Trending Picks:

1. Choose the MP4 with the file picker. Confirm name/size, metadata, duration and preview appear.
2. Drop the WebM on the drag/drop area. Confirm it replaces the staged file and metadata reloads.
3. Try `.mov`, renamed text, audio-only, and oversized files. Only `.mp4`/`.webm` containers with accepted MIME/picture track may proceed.
4. For a file over 30 seconds, choose a trim range at most 30 seconds; invalid start/end and >30-second range must be rejected.
5. Seek the preview, choose a poster time, generate the frame, and confirm the poster matches that position.
6. Save. Confirm processing phases and real transfer progress increase; cancel mid-upload. The UI must say the operation was canceled, cleanup partial video/poster paths, and enable **Retry upload**.
7. Disconnect networking during upload, reconnect, retry, and confirm exactly one saved draft campaign and no orphan partial path.
8. Reload; edit caption/time/radius/weight; replace media; confirm old owned media is cleaned only after the new campaign save succeeds.
9. Moderate with a reason, schedule/approve, verify public desktop/mobile playback (`playsinline`, controls, poster, no forced sound), then archive/expire and verify removal from public rotation while audit/history remains.

Expected administrator-safe distinctions:

| Condition | Expected message pattern |
| --- | --- |
| Genuine codec incompatibility | “This browser does not support the video codec inside this file. Export it as H.264/AAC MP4 or VP8/VP9 WebM.” |
| Malformed/unreadable container | “The browser could not read this video container…” or “This file does not contain a usable video.” |
| Timeout | “The media upload timed out. Check your connection and retry.” |
| Storage policy/rejection | “Media storage rejected this file. Check the format and size, then retry.” |
| Permission/session | “You do not have permission…” or “Your admin session expired… Sign in and retry.” |
| Network loss | “The media upload lost its network connection. Check your connection and retry.” |
| Application bug | Generic “Unable to save campaign” plus a protected monitoring reference; never a stack, SQL, bucket credential, JWT or provider payload. |

Browser trimming is best-effort, not universal transcoding. If a browser cannot safely prepare the clip, export a compatible <=30-second MP4/WebM under the stated upload limit and retry.

## 16. Blog 502 evidence collection

Do not infer that the live root cause is fixed from local 200 responses.

1. Reproduce once and record exact local time/time zone, full URL, browser Network request status/duration and any `x-nf-request-id`, `x-request-id`, `cf-ray` or correlation/reference ID. Do not record cookies or authorization headers.
2. Netlify -> Girlz Culture site -> **Deploys**: confirm the active deploy and commit hash. Open that deploy's logs. Then **Logs** -> Functions and filter around two minutes before through five minutes after the failure. Search `/blog`, request ID and status `502`. The route is a Next server-rendered `/blog` request and may appear under the Next.js server/SSR function rather than a source-named `blog` function.
3. Capture sanitized status, duration, function name/region, cold-start/init duration, timeout marker, upstream host/status and top exception class/message. Redact email, IP, cookies, tokens, query PII, request body and credentials.
4. Netlify Observability (if plan provides it): filter the URL, 5xx, function and request ID. A duration ending at the platform timeout with no app response suggests function timeout; an immediate stack with the app release suggests application exception; large init plus first-request-only failure suggests cold start.
5. Supabase Dashboard -> Logs Explorer for the same UTC window: look for PostgREST/Database/Auth/Storage errors tied to the route. A Supabase timeout/5xx or DNS/connect error in the function log distinguishes upstream failure from the UI fallback.
6. Cloudflare -> domain -> **Speed -> Origin Analytics** and Analytics/Logs if enabled; filter the same minute/path/Ray ID. `520` is an unexpected/empty origin response, `522` an origin connection timeout and `524` a connection established but origin response timeout. If Cloudflare shows a 502 copied from origin with Netlify request ID, continue in Netlify; if Netlify never saw the request, investigate Cloudflare/DNS.

Safe evidence to return: UTC time, path without personal query values, deploy/commit, request/correlation/Ray IDs, redacted status/duration/function/exception class and provider event ID. Never send Supabase/Stripe/service-role keys, JWTs, cookies, passwords, database URLs, full personal request bodies or private log exports.

## 17. Localization coverage

- Selector locations: public desktop `PublicChrome`, public mobile `MobilePublicMenu`; customer and salon auth; admin auth; booking wizard; customer account; salon-owner/team shell; platform admin; Engine.
- Persistence: guest locale is stored in local storage and the `gc_locale` cookie for one year; authenticated preference is posted to `/api/i18n/preference`; the provider sets document `lang`/`dir` and uses `Intl` formatting.
- Resolution: `/api/i18n` supplies published remote messages; bundled/remote locale resolution falls back to English without raw keys or blank content. Public/auth/account/dashboard/booking surfaces consume `LocaleProvider`/`DocumentLocalizationBridge`.
- Seeded locales (37): `en`, `es`, `fr`, `ht`, `pt`, `zh-CN`, `zh-TW`, `fil`, `vi`, `ko`, `ja`, `ar`, `ru`, `uk`, `pl`, `de`, `it`, `el`, `he`, `fa`, `hi`, `ur`, `bn`, `pa`, `gu`, `ta`, `te`, `ne`, `th`, `id`, `sw`, `am`, `so`, `yo`, `ig`, `ak`, `wo`.
- Substantive bundled messages currently exist for English, Spanish, French and Wolof. Other locales are incomplete/unpopulated until an administrator creates/reviews/publishes remote translations; English fallback is expected and safe.
- Engine -> Languages & Translations supports add/edit, draft, machine-assisted marker, review, publish, disable, import/export/history and rollback. Status distinguishes Missing, Draft, Reviewed and Published.
- Legal, payment, refund, cancellation, privacy, security, safety, consent and other high-risk translations require fluent human review before publication. Machine-assisted drafts cannot be treated as legal approval.

## 18. Alphabetical catalog ordering

**Complete (repository/static/local build evidence).** `src/lib/catalogOrdering.ts` uses a case-insensitive numeric `Intl.Collator`; explicit positive `sort_order` is first, then normalized accented alphabetic name, variant and ID tie-breakers, with empty names last. The admin content API, catalog editor and owner selectors share the ordering. It is reapplied after load/create/edit/archive/restore/refresh. `scripts/verify-service-catalog-management.mjs` passed.

**Blocked (authenticated production evidence).** Run step 33 after P4 is applied.

## 19. Service Catalog batch selection

**Complete (repository/static/local build evidence).** Every manageable row has an accessible checkbox; Select visible acts only on the current filtered result IDs; Clear and selected count are visible; archive/restore/safe-delete/reassign operations refresh dependencies immediately before one explicit confirmation; the confirmation names target records and consequences; protected historical/financial dependencies archive instead of unsafe deletion; results are per record and failed records remain selected. Hidden records are never added by Select visible. The focused verifier passed.

**Blocked (authenticated production evidence).** Run step 33 after P4 is applied.

## 20. Verification results

| Verification | Status | Evidence |
| --- | --- | --- |
| Clean dependency install | Complete | `npm ci` installed 370 packages; audit reported zero vulnerabilities. |
| TypeScript | Complete | `npx tsc --noEmit` exited 0. |
| ESLint | Complete | `npm run lint` exited 0 with no warnings. |
| Repository verification suites | Complete | All 27 `scripts/verify-*.mjs` files passed. |
| Optimized production build | Complete | Next.js 16.2.11 compiled, type-checked and generated 99 routes. |
| Migration order/static contracts | Complete | 66 unique migrations; latest is P5; marketplace/security/catalog verifiers passed. |
| Dependency/security audits | Complete | `npm audit --omit=dev` and full `npm audit` both found 0 vulnerabilities. |
| Public desktop/mobile smoke and horizontal overflow | Complete | Key public routes passed local browser review at 1440px and 375px with no horizontal overflow; selector and responsive navigation were present. |
| Keyboard source/runtime checks | Complete | Native FAQ details, focusable/named carousel controls, accessible catalog checkboxes/buttons and photo dialog initial focus, Tab containment, Escape and focus return are implemented; focused source verification/build passed. Full assistive-technology production audit remains section 21. |
| Local production HTTP smoke | Complete | `/`, Texas `/salons`, `/styles`, `/blog`, `/help`, `/contact`, `/how-it-works`, `/testimonials` and pending salon route returned 200. |
| Anonymous API safety | Complete | Local built app: admin content/salons/errors 401, admin verify 403, salon team/bootstrap 401. |
| Pending/unpublished public route | Complete | Local route returned neutral fallback; no Book Appointment CTA. |
| Blog repeated local request | Complete | 10/10 consecutive built-app requests returned 200 (about 51 KB each). This does not establish the production 502 root cause. |
| Catalog ordering/batch test | Complete | Focused verifier passed stable ordering, visible-only selection, dependencies, confirmation and per-record outcomes. |
| Trending upload test | Complete | Focused verifier passed XHR progress, abort/cancel, drag/drop, retry, cleanup, archive and mobile playback contracts. |
| Migration execution on Supabase Postgres | Blocked | Not run; founder must dispatch protected workflow after merge. |
| Authenticated six-role production test | Blocked | Founder action after migrations/deploy; use section 14. |
| Stripe/email/SMS/push/geocoder provider test | Blocked | Requires configured deployment/provider credentials and tagged fixtures. |
| Live custom-domain verification | Blocked | No deployment or production mutation was performed. |

## 21. Anything untested

- Actual execution of P1-P5 against the production Supabase schema and the before/after preview comparison.
- Authenticated RLS and cross-tenant behavior for all six roles.
- Real test-mode Stripe checkout/webhooks/refunds and external email/SMS/push/geocoding delivery.
- Live media uploads against production storage policies, supplied codec fixtures, mobile hardware playback and cleanup.
- Production Blog 502 evidence/log correlation.
- Full manual screen-reader/axe audit of every authenticated screen and long-string visual review for all 37 locales.
- Real Netlify/Cloudflare deployment, rollback and domain behavior.

## 22. Remaining launch blockers

**Blocked:** P1-P5 must be applied through the protected workflow, the compatible app deploy must be published, and the founder must complete the launch-blocking rows in section 14. Provider-dependent failures must be resolved or explicitly disabled/documented. No repository verification failure remains at handoff.

## 23. Rollback and recovery

### Migration workflow failure

1. Keep Netlify production deploys locked; do not publish the new app.
2. Open the failed GitHub Actions step and record the first failing migration, SQLSTATE and sanitized message.
3. In Supabase, run only read-only inspection (`supabase_migrations.schema_migrations`, section 11 queries, affected object definitions). Do not edit migration history or rerun later files manually.
4. Each P1-P5 file is transactional, so a failure inside a file rolls that file back. Earlier successfully recorded files may remain. The workflow's final list identifies the exact boundary.
5. Create a reviewed forward-fix migration or make the failed migration safe for the observed pre-state, rerun all local checks, update the PR/main through normal review, then redispatch. Prefer roll-forward; these are additive schema/function changes and no destructive down migrations are supplied.

### Application deploy failure after migrations

1. Netlify -> Deploys -> open the last known-good deploy -> **Publish deploy** for an atomic application rollback; keep deploys locked while diagnosing.
2. P1-P5 are designed to be backward-compatible for reads. P4 permits group-level services without a master style, so while an older app is temporarily restored, freeze catalog writes that depend on the new group-only path.
3. Capture Netlify request/deploy IDs and error-monitor references, fix forward, build/verify, publish the corrected deploy, then unlock.

### Bad publication/reconciliation outcome

1. Do not bulk rerun reconciliation. Owner-unpublish or admin suspend the affected salon through the authorized lifecycle UI so it fails closed.
2. Inspect `salon_reconciliation_runs/items`, lifecycle diagnostic and slug redirects. Do not delete audit/history rows.
3. Correct the failed gate/data through normal admin/owner routes and reconcile only the named salon with actor/reason. Retire a wrong redirect through an audited admin fix; never reuse a colliding slug silently.

### Discovery/configuration issue

Use Engine configuration history to restore the prior published search values (25-mile default or previous bounded bonus) with reason/audit. The database function still enforces a 0-3-mile maximum and eligible-radius filtering.

### Security or data exposure

Lock deploys, owner-unpublish/suspend affected records, revoke compromised sessions/secrets in the provider dashboards, preserve sanitized logs/correlation IDs, rotate credentials, and publish only after the RLS/API regression matrix passes. Do not paste secrets into issues or the PR.
