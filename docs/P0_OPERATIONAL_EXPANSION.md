# P0 operational expansion — PR #61

Status: **AUTOMATED ONLY** for local API, browser and PostgreSQL acceptance. **BLOCKED** for real hosted backend, live AI/transcription and external delivery acceptance. Keep Draft, open, unmerged and undeployed.

## Owner capability mapping

The exact 31-tool registry (17 reads, 14 prepared actions), permissions and risk classes are recorded in [GC_ASSISTANT_P0.md](GC_ASSISTANT_P0.md) and enforced by `src/lib/gcAssistantCore.ts`.

| Existing owner area | Assistant coverage | Controlled boundary retained |
| --- | --- | --- |
| Overview and analytics | Business summary, profile views/completion, completed booking value, customers, upcoming appointments and source breakdown | Existing metric definitions; no claim of cash revenue or invented new-customer metric |
| Bookings and customer relationships | Scoped booking/customer reads, manual appointment create/reschedule/cancel, private booking notes | Existing booking identity/calendar; no fabricated customer account or review credit |
| Availability/calendar | Service-free gaps, professional availability, duration-aware service fit, hours and blocks | Shared hours/roster/booking/hold/blockout contracts and atomic occupancy lock |
| My Page and Business Policies | Profile/hours/social preparation, current policy read, structured policy draft/review/publish | Owner-only social review and separate original-policy review/publication confirmation |
| Styles & Pricing | Service search/read, create draft, edit draft | Existing catalog identities, materials transaction, sanitizer and deposit rules |
| Professionals | Scoped list and new/existing professional draft | Existing specialty validation; no published-record overwrite |
| Products | Scoped list and new/existing product draft | Shared subscription/limit validation, restrictive scheduled plan, existing database limits; no product order/payment action |
| Promotions | Scoped list and new/existing promotion draft | Shared subscription/limit validation, business timezone, inactive Draft; no activation or paid campaign |
| Messages | Authorized conversation reads, original draft and confirmed send | Existing membership, immutable original/source, translation cache and notification claims |
| Reviews | Business review read | No fabricated reviews, responses, ratings or verified credit |
| Earnings/transactions | Existing completed-booking-value summary | No refunds, payouts, transfers or Stripe changes |
| Subscription | Safe current plan/status/renewal and scheduled-plan read; navigation | Existing billing workflow only; no billing changes |
| Team/settings/security | Navigation to existing controls | No permission/owner changes, suspension, deletion or legal acceptance |
| Imports/media/homepage/trending campaigns | Existing setup/import navigation | No arbitrary scraping/upload/database access; no campaign or marketplace ranking manipulation |
| Help/support/notifications | Existing navigation and workflow information | No autonomous support impersonation or external bulk messaging |

## One operational calendar

`bookings` remains the appointment record. `booking_origin` distinguishes marketplace from business_added; the latter has explicit phone/walk_in/instagram/whatsapp/other source, creator, request identity, timestamp, original guest name, optional contacts and service/professional context. A custom noncatalog service requires an explicit name and duration. An existing service supplies its authoritative duration and buffer; ranges require clarification. Multiple professionals require an explicit selection. The dashboard form uses the same deterministic preparation and atomic confirmation as the Assistant, even when AI is unavailable.

Preparations check current hours and availability; SQL confirms under row/advisory locks against current business hours, professional hours, existing bookings, checkout holds and blockouts. A stale service/duration/buffer/booking preview cannot write. Shared occupancy rejects a marketplace reservation overlapping a manual booking and vice versa. Rescheduling retains the booking ID and releases its former window; cancellation releases capacity without invoking Stripe or customer-approval rescheduling.

Business-added appointments store zero GC booking value/deposit/balance/commission/payout/refund/discount and no payment/provider/promotion identity. They cannot receive verified review rows/tokens or customer-conversation welcome events. The shared dashboard summary includes total operational workload and source breakdown, while marketplace completed value/customer/cancellation/acquisition metrics and platform quality aggregates exclude them. The source/creator/request identity is immutable. No fake customer is inserted.

Private notes live in `owner_booking_notes`, linked to the existing booking. RLS and server checks require the current business's booking permission and any stylist-linked scope. Browser writes have no direct table/RPC grant. Both the dashboard and Assistant require a persisted preview and explicit confirmation; audit and note save are atomic/idempotent. Notes never become customer messages or trigger customer delivery.

## Policies, evidence and languages

See [BUSINESS_POLICIES_ARCHITECTURE.md](BUSINESS_POLICIES_ARCHITECTURE.md) for the published revision, structured refund/satisfaction and cancellation/no-show fields, platform rules, separate acknowledgements and immutable checkout evidence. Manual appointments explicitly say customer policy acceptance was not collected through Girlz Culture. The original published policy is never replaced by a later revision in an existing booking.

See [BOOKING_CONVERSATIONS_AND_TRANSLATION.md](BOOKING_CONVERSATIONS_AND_TRANSLATION.md) for sender-selected original language/provenance, original text preservation, same-language bypass and recipient translation/cache. Dictation edits the visible transcript only and never authorizes a mutation. All new first-party UI copy participates in the existing en/fr/wo/es/zh-CN source inventory; exact user prose remains unchanged.

## Forward migration and acceptance

New migration: `supabase/migrations/20260914113932_p0_operational_calendar_and_policy_acceptance.sql`. It extends the P0 tool/permission checks; adds manual-origin and acceptance fields, private notes/RLS and immutable provenance; introduces shared occupancy guards and deterministic operational RPCs; updates the existing combined-checkout evidence column list and marketplace-only analytics filters; advances the Engine migration marker. Existing financial calculations and the 143 previous migrations remain unchanged. No migration has been applied to a hosted database.

Local empty-database evidence: 144 migrations, 183 foundation assertions, 64 existing P0 assertions and 55 new operational assertions pass. Server regressions cover authoritative/missing durations, professional ambiguity, foreign scope, availability conflicts, draft limits, separate pre-Stripe acknowledgements, immutable provenance and notification isolation. Browser tests separately prove real components and fixture persistence, not hosted integrations. Final exact head/results are recorded in the PR validation report.

External blockers remain explicit: approved isolated hosted Supabase project/test identities; approved AI provider/model and positive cost configuration; isolated notification channels; real browser microphone/provider support (especially Wolof); native review of sensitive Wolof/Chinese policy/payment translations. Production, PR #59, PR #60, subscription sales settings, customer Concierge and SEO remain outside this work.
