Girlz Culture — final implementation instruction for the existing Codex session

Founder instruction, 18 September 2026. Continue the existing Girlz Culture work and incorporate the revised specification into the same implementation. This is authorization to do the work, not a request for another scope-only review.

Updated with the founder's additional completion and layout requirements: every feature must have its necessary configuration, connections, saved outcomes and repeat-use journey working; related dashboard content must be organized into clear, compact tabs rather than oversized navigation boxes. Sections 2A and 2B are mandatory acceptance requirements across the entire agreed scope.

1. Continue the current work and reconcile once

Finish any operation already in flight safely, checkpoint the current work, then incorporate this instruction before further release decisions. Preserve uncommitted work, commits, useful tests, authenticated sessions and verified behavior. Continue the existing branch/PR where appropriate; if it has since merged, continue from current main without rebuilding completed features. Do not start a second competing implementation.

Compare every requirement with the actual code and saved evidence. Enhance partial or weak implementations and build missing capabilities. Do not recreate working booking, finance, authentication, translation, assistant, chat or website systems. Do not ask again whether to implement the full handoff: implement it.

The goal is a ready-to-use premium operating system for hair businesses: owners can run existing appointments, walk-ins, clients, staff, money, inventory, communication and marketing, with GC Assistant acting as their informed, multilingual invisible employee. Its value must exist before marketplace-generated customers arrive.

Read the existing project instructions, relevant checkpoints, the complete earlier founder handoff and its visual references. Reconcile these sources in this order:

The latest explicit founder decisions and completion/layout requirements in sections 2, 2A and 2B of this instruction.

The revised software-first specification reproduced in Appendix A, except where those latest instructions override it.

Compatible earlier dashboard, finance, communication, client, deposit, inventory and public-site requirements, including the existing 140-item handoff.

The comparison and release evidence as implementation context, not proof of current completion.

Relevant saved repository records include docs/dashboard-redesign/requirements.json, PROGRESS-2026-09-18.md, CHECKPOINT.md and founder-handoff.md. The companion review is GC_Software_First_Review_2026-09-18.md. Use the current copies available to you. Preserve all earlier requirement IDs and add traceable IDs for the revised specification; do not replace the old checklist with a shorter summary.

Create or update one requirement-to-code-and-evidence map. Record each requirement as verified complete, partial, weak, missing, provider-dependent, or requiring a specific business decision. Separately record implementation, verification and release status. For each gap, identify the existing module to extend, remaining behavior and acceptance evidence. Then proceed directly to implementation. This mapping is part of execution, not a new approval stage.

2. Confirmed founder decisions — these override older conflicting text

Topic

Required behavior

Domain and brand

Use the established girlzculture.com project. Spoken variations are not a domain change. Keep teal, white and black.

Root website

Keep or restore the existing coming-soon experience at https://girlzculture.com. Preserve the page the founder already approved. Do not replace it with the open marketplace or a new homepage concept.

Demonstration entry

Keep https://girlzculture.com/site-access as the special marketplace entry for founder demonstrations. Reuse the existing appropriate access mechanism. Normal public navigation must not open marketplace discovery; demonstration pages should not be indexed. Do not add unnecessary repeated sign-ins.

Demonstration content

Demo businesses demonstrate the software; they do not count as real active businesses. Preserve the requested polished presentation without presenting fabricated activity as real or enabling real charges/bookings/notifications against synthetic records. Prepare richer demonstrations using permitted content and isolated demo data.

Business acquisition

Keep business signup/application accessible while customer marketplace discovery is closed. This is the primary entry for businesses finding Girlz Culture online.

First live category

Hair Salon & Braiding remains live. Hair salons and independent/solo hair professionals can apply and begin using the software through the appropriate existing onboarding/approval flow.

Other categories

Accept applications onto the existing waitlist. Preserve applications for later founder approval and confirmation/onboarding emails. Do not activate, charge or advertise those categories as available yet. Their later category-specific customization must not delay the hair-first launch.

Real business websites

Legitimate software customers must be able to share their own business website and receive direct bookings. Separate that from public multi-business discovery and synthetic demonstrations.

Marketplace opening

Ten genuinely active businesses plus operational readiness is a checkpoint. The founder initiates public marketplace launch; reaching a counter must not automatically open it. Other categories open progressively when approved.

Monthly plans

Implement Starter USD89, Growth USD109 and Premium USD129. These current working launch prices are now authorized. The same tiers apply to shops and independent professionals. Do not reopen a broad pricing-permission question.

Stripe

Reconcile the feature/allowance matrix with existing entitlements; create or reuse the correct recurring Stripe Prices, then update Price ID mappings, plan displays, checkout and portal options together. Reuse the existing Stripe account/products and valid API keys. A price change does not require new API keys.

Existing subscriptions

Inspect actual existing agreements. Use the approved offer for new subscriptions; do not silently migrate existing paid agreements, generate prorations or charge customers without an applicable approved migration policy. Prepare the new catalog while resolving any actual existing-customer edge case.

Promotion calculation

Apply the approved percentage to the eligible service price, protect the applicable deposit, cap savings at the unpaid balance and preserve booked terms. This decision is already settled.

No-show protection

Use verified incidents at the current business only. No shared blacklists, cross-business histories, scores, anonymous flags or derived eligibility signals.

Assistant isolation

The business assistant may access only the current authenticated business's authorized data and general Girlz Culture platform guidance. It must refuse other-business information, including public information. Staff permissions still apply inside the business.

Existing limits and behavior

Preserve both USD25 assistant caps, working OpenAI/DeepL integration, opt-in memory, calendar protections and authorized sessions. Wolof acceptance remains explicitly deferred; do not claim it works or make it an unexpected release gate.

The public website needs selective visual polish using the references, with existing content and journeys preserved except for these explicit launch rules. The business dashboard requires the substantive layout and interaction redesign already specified. Pricing remains under For Businesses, with corresponding mobile navigation.

2A. Mandatory functional completion — every feature must be connected and configured

The founder's house analogy is the acceptance standard: a fitted bathroom must have working water, drainage, controls and a usable repeated cycle. Apply the same standard to software. A screen, button, component, database table, installed SDK or successful API connection on its own does not establish a working business capability.

For every required feature, trace and complete the actual journey: entry point, inputs, authorization, validation, operation, durable result, dependent updates, understandable outcome, return path and the next use. Include external services and later callbacks/jobs only where the feature needs them. Finish existing disconnected pieces instead of adding parallel infrastructure or unrelated features.

Add WIRE-01 through WIRE-10 to the consolidated tracker and apply them to each relevant feature. A shared implementation may satisfy several rows when its actual use and evidence are identified; do not duplicate the same verification unnecessarily.

ID

Required configuration and connection

What establishes completion

WIRE-01

Map the complete user journey and its dependencies.

Identify the real entry/button/tab, relevant input, server operation, canonical record, external dependency if any, resulting screen and next action. Every visible action reaches a working destination. A missing connection is recorded and completed, not hidden behind a placeholder.

WIRE-02

Verify the configuration that the deployed feature actually uses.

Check applicable environment-variable names and presence, runtime/build/deploy context, correct provider account and live/test mode, endpoint URLs, project/resource IDs, permissions, feature flags, storage/export resources, callback/webhook configuration and job triggers. Use existing valid secrets securely; never expose their values. A key's presence alone is not proof that the operation works. A setting edited in the UI must save, reload and affect the intended behavior.

WIRE-03

Implement the feature's full lifecycle and transitions.

Cover applicable draft, review, save, publication, pending, success, edit, cancellation, expiration and failure states. Each transition has a real trigger and a permitted destination. Distinguish queued work from completed work. Do not leave a submitted action permanently loading or a record permanently pending with no completion mechanism.

WIRE-04

Persist the result and show the authoritative outcome.

Save through the real authorized operation, verify the stored result where needed, and show the saved data after refresh/navigation. Optimistic feedback is acceptable when clearly pending and reconciled on failure; it must not manufacture final success. Read failures must not become false zero totals or empty inventories.

WIRE-05

Connect all affected views and records.

Update or invalidate the appropriate dashboard, detail view, public page, calendar, client history, finance totals, stock, assistant retrieval and exports as applicable. Where external completion is asynchronous, validate and process the callback/job result and expose truthful status. Maintain one source of truth instead of unrelated copies that disagree.

WIRE-06

Complete the return-and-repeat cycle.

The user can finish, return to the correct tab/list and perform another valid action. Reload/resume preserves committed records, intended context and permissions. Retry, double-click, browser back or a repeated callback must not duplicate a booking, charge, sale, stock movement, notification or reward. Separate a retry of the same operation from an intentional new operation.

WIRE-07

Make required automation operational.

Confirm that the necessary scheduler/worker/queue/webhook is registered and enabled in the intended environment and executes the applicable lifecycle. Verify timezone/due-time logic, bounded retries, expiry/cancellation, duplicate prevention and enough run history to diagnose a missed operation. Writing a function that never runs is incomplete. Preserve cost limits.

WIRE-08

Repair real failures and provide recovery.

Trace reproducible failures through the responsible request, record, configuration or provider response. Fix the cause. Preserve entered work and give a useful retry/correct-input/reconnect path where appropriate. Tell the user what failed, whether anything was saved and what they can do next. A support reference may remain as secondary diagnostic information; a generic reference error is not a functioning implementation or a substitute for repair.

WIRE-09

Preserve consistency under actual access and timing conditions.

Enforce business/role permissions and ownership at the operation, including relevant concurrent updates, stale data, unavailable slots and changed provider state. Check the appropriate guard again before committing consequential changes. Fix configuration or logic without removing authorization, financial or booking protections.

WIRE-10

Provide evidence of the working journey in the intended release.

Link the entry-to-outcome acceptance case, applicable configuration verification without secret values, durable readback and affected-screen result. Demonstrate the next use and representative recovery/concurrency cases where there is a concrete risk. Confirm important environment-dependent behavior on the candidate/production as appropriate. Do not mark a required feature complete while a known blocker prevents its normal supported use.

Maintain a compact configuration register alongside the existing tracker: feature, required configuration/resource, environment, owner/system of record, verified state and evidence. Record only applicable dependencies, never secret values. Do not add new providers, permissions, approval stages or infrastructure merely to populate the register.

Existing incidents such as Business Policy failing to save and Manage payment method returning a support reference require diagnosis and verified repair. Rewording the error, suppressing it, catching and ignoring an exception, hardcoding success, removing a guard or showing mock data does not repair the feature. Unexpected outages must recover honestly; the goal is reliable supported workflows, not a false promise that external services can never fail.

Use the following connected journeys as concrete acceptance examples, adapted to the actual authorized records and current implementation:

Journey

Required connected result

Upload a service photo

Upload into the selected category, validate/process/store/attach it, save caption/order as applicable, show correct visibility and gallery count, reflect intended public content, and make the same actual media count available to GC Assistant. Refresh and upload another item; failed retries do not duplicate attachments.

Edit a service

Save its actual price/duration/options to the existing catalog, update the appropriate public page and future booking quote, and answer a natural-language price question correctly. Preserve already-agreed booking terms. Return to the service list with relevant filters intact.

Publish Business Policy

Write the policy, save/review/publish, retrieve the correct public version and show its link during booking acknowledgement. Preserve past accepted versions. Reopen the editor and make another change without losing the existing policy.

Record a walk-in or chair balance

Resolve the current business and authorized professional, save one transaction/payment record, connect the client where supplied, update the relevant totals and compensation calculations, and return matching UI/assistant/export results. Refresh and record another entry. An offline payment record must not trigger a customer charge.

Activate a promotion

Select the real eligible services/group/business, calculate and preview the discount, activate within its dates, reflect it on the relevant business/service/booking surfaces, protect the applicable deposit and report actual attribution where available. Editing/expiry must update eligibility correctly.

Reschedule an appointment

Resolve the booking, check the new slot, follow any required customer approval, save the accepted change, update staff/calendar/customer views and replace obsolete reminders. Notify through the authorized flow without duplicates. Decline, expiry and conflict outcomes retain coherent booking state.

Fill a cancelled slot

Release actual availability, find eligible current-business waitlist requests, make an authorized offer, expire it appropriately and accept at most one valid claim. Recheck availability and deposit terms at acceptance; update the schedule and queue so the same slot cannot be sold twice.

Change a subscription payment method

Open the correct configured Stripe customer flow, complete or cancel the update, return to the correct Subscription tab and show the authoritative saved method/status. No app-initiated charge occurs merely from replacing the method. New-plan checkout separately uses the approved Price ID and entitlements.

Onboard and connect a business

Import only permitted information into a draft, review uncertainties, save the workspace and supported business page/booking link, and expose remaining setup clearly. For an authorized external integration, verify connect, sync result, conflict/retry and disconnect behavior. A completed-looking setup screen with an unconnected backend is incomplete.

Implement required features as complete vertical journeys, with their user interface and dependent operations connected before declaring them done. Keep useful existing work and follow dependency order; this instruction does not require rewriting the system or repeating valid unchanged checks.

2B. Mandatory layout — clear tabs, direct content and comfortable spacing

The founder explicitly rejects pages consisting of six oversized navigation containers that each require another click just to reach ordinary working content. Related functions should form a coherent workspace with clearly arranged tabs. Selecting a tab shows that tab's real content directly. A record, action or detail inside that content can then open the appropriate editor/detail page with a clear return path.

Add LAYOUT-01 through LAYOUT-09 to the tracker. Apply them across the 14 dashboard workspaces and their applicable details without forcing unrelated functions into one giant page.

ID

Layout requirement

Acceptance

LAYOUT-01

Use a consistent page structure.

Clear title/context, relevant concise primary action, organized tab row and one active content area. Eliminate redundant header bands, duplicate headings and oversized navigation-only boxes. The owner reaches useful content on opening the page.

LAYOUT-02

Tabs must operate the actual workspace.

Each tab loads the intended records/content and has working actions. Connect route/state, selection and history appropriately. Keep the active tab understandable after detail navigation/back/refresh or a direct link. Do not implement cosmetic tabs that merely change color.

LAYOUT-03

Use restrained color coding and accessible active states.

Use approved brand/semantic colors and suitable tints within the teal/white/black design. Give tabs clear labels and selected/focus treatment such as an underline or background; color alone must not carry meaning. Keyboard/touch access works. Do not introduce an unrelated rainbow palette.

LAYOUT-04

Keep the content neat and proportionate.

Align controls, use consistent spacing and appropriate text/input sizes, and group related fields. Avoid overlapping layers, cramped dense forms, excessive blank panels and oversized boxes. Cards remain useful for metrics, photos, services and actual records; size them for their content rather than using them as unnecessary navigation barriers.

LAYOUT-05

Make detail and edit journeys coherent.

A list/grid item opens the right detail/editor with the correct business and record. Provide save/cancel/back behavior. Return to the right tab with relevant filters/search/context retained. Protect unsaved work where needed without adding confirmations to every harmless tab click; respect existing privacy and session rules.

LAYOUT-06

Design phone navigation intentionally.

Use short tab labels, a usable horizontal tab strip or a compact More/menu where needed. Keep primary tasks discoverable and secondary actions accessible. Do not squeeze desktop columns into a phone or spread tab labels across an uncontrolled stack. Touch targets remain usable.

LAYOUT-07

Manage screen space and overlays.

Headers, menus, assistant panels, drawers and the phone keyboard must not hide the essential content or submit controls. Keep scrolling/focus predictable. The mobile assistant remains an explicit top launcher; desktop dismissal and reopening remain usable.

LAYOUT-08

Give every active tab complete states and useful copy.

Show relevant loading, populated, empty, error/retry and permission states within that workspace. Remove repeated technical paragraphs and decorative instructions occupying working space; put secondary help where it is useful. The underlying operation and visible state must agree.

LAYOUT-09

Inspect the actual rendered journeys.

Review affected desktop/phone pages, tabs, details and dialogs against the supplied references with realistic and empty data plus longer translated text. Correct clipping, overlap, lost actions, awkward navigation and spacing before acceptance. Passing browser assertions alone does not prove that the visual result is acceptable.

Examples of organization, adapted to the existing required content rather than treated as additional features:

My Page: business information, services/pricing, location/hours and appropriate More items such as amenities/policies/social links, with cover/profile editing integrated into the workspace.

Photos: visible photo collection with category tabs such as All photos, Services and Before/after; uploading acts on the chosen category and offers the required caption/details.

Finances: coherent areas for overview, transactions/balances, expenses, team earnings/arrangements and reports. Relevant shared period filters and consistent totals connect them; six large navigation cards are not the finance workspace.

Calendar: show the usable schedule with staff/date/view controls and accessible availability actions. Put secondary setup/settings in appropriate controls rather than replacing the calendar with a directory of boxes.

Messages: real inbox/conversation navigation with booking context, usable phone list/detail transitions and a composer that remains accessible.

Do not solve clutter by deleting required features or hiding ordinary tasks behind several menus. Reorganize the same complete capabilities into the appropriate tabs, sections and detail flows. Use sensible component reuse while respecting each workspace's purpose.

3. Comparison baseline — preserve these foundations and close the real gaps

The independent check at approximately 19:16 UTC on 18 September found draft PR #80 at b3401f079f34bae55bd355154a48d93a455a5fc6, with 15 commits and 337 changed files. Production still used d37cbf4ef3954063797946b7508352470653a739, deployment 6aac503fa5eacb00089c6d87. These are dated observations: inspect current state and your unpushed work before acting; never reset to this snapshot.

The old 140-item tracker recorded 17 implemented/unverified, 103 in progress, 19 not started and one completed governance decision. This is not a completion percentage and does not yet cover every added requirement in Appendix A.

Area

Existing work to reuse

Required extension or completion

Dashboard

Shared shell, overview and major workspaces in PR #80

Finish all pages, details/editors and mobile states against the actual references; preserve functional behavior.

Assistant

Authorized read/preparation tools, conversational memory and four-language foundation

Complete broad own-business coverage, flexible wording, useful follow-ups, missing action tools and concise factual answers.

Voice

Browser dictation and read-aloud

Deliver speech-to-intent-to-authorized-action-to-persisted-result. Dictation that only fills a composer is not completion.

Languages

Existing account-specific locale persistence, translations and DeepL

Complete new surfaces, reports and communications; verify different staff languages over the same canonical records.

Morning Brief

Overview greeting, dates, metrics, schedule and trends

Combine today's schedule, balances, risks, stock and follow-ups into a brief with one or two grounded actions.

Finances

Scoped operating ledger, compensation, expenses, products and exports

Finish attribution, daily close, reconciliation, reporting and meaningful money intelligence without a second ledger.

Marketing

Business photos/services/promotions/booking links

Build the business-facing content engine and approved calendar/scheduling workflow; platform advertising is not this feature.

Business website

Existing business pages, media, prices, hours, policies and booking

Complete the mobile editor-to-public-page workflow, SEO/language behavior and shareable direct booking.

Assisted onboarding

Existing signup and setup evaluation

Add permitted source-to-draft import, provenance, uncertain fields, owner review and manual fallback.

Google Business Profile

Maps/location and social-link foundations

Add the official owner-connected integration; Maps support does not prove profile-sync access.

Communications

Booking chat, substitution, reminder fixes and new consent preferences

Finish post-visit/rebooking delivery and eligible own-client campaign workflow, preserving consent and lifecycle behavior.

Appointment waitlist

Requirement existed but completion was not recorded

Complete service/stylist/time preferences, cancellation offers, expiry and single-claim booking. This is separate from category application waitlists.

Referrals and pricing

Existing plans, billing and entitlements

Implement configurable modest referral credit rules and the authorized USD89/109/129 catalog consistently.

4. Carry forward every compatible earlier requirement

Complete all 14 dashboard areas: Overview, My Page, Photos, Styles & Pricing, Stylists, Products, Availability & Calendar, Bookings, Messages, Reviews, Finances, Promotions, Subscription and Settings. Include their detail screens, editors, dialogs, navigation and loading/empty/error/populated states. A shared color/font change is insufficient.

Use the supplied dashboard references closely and inspect desktop/mobile results visually. Use public-site reference images for selective inspiration. Never claim to have reviewed an unavailable image. Use the existing reference inventory and identify any indispensable missing file precisely while continuing unrelated work.

Preserve these specific requirements:

Overview: personalized welcome/date, useful metrics, schedule and real actions; extend it with Morning Brief.

My Page: cover/profile editing, meaningful content tabs, mobile short labels/More, business information/services/location/hours/amenities/policies/social links, save and public-page synchronization.

Photos: actual categorized gallery, selected-category upload, title/caption editing, cover/logo controls, order/status/retry and usable phone flow.

Calendar: calendar-first layout, staff selection, labeled colors, availability and full-day actions, mobile action menu, conflicts and reliable saving.

GC Assistant: desktop panel available and initially visible across dashboard pages, close/reopen behavior respecting dismissal; mobile top launcher opening only on tap. Keep the working page usable. Use “GC Assistant — Your business co-pilot,” friendly selectable avatars and concise business language. Remove repetitive technical/AI wording from ordinary interface copy without misrepresenting the assistant as a human.

Chat submission: show the user's sent message immediately, clear the composer, show response loading separately and preserve/retry failed messages without duplicates. Maintain conversation and selected language across follow-ups.

Natural language: resolve ordinary phrasing, typos and aliases such as “boho braids” against the actual authorized service catalog. Return likely matches and correct prices/durations before asking for clarification where ambiguity genuinely remains. Do not demand exact labels or invent matches. Answer photo counts using the actual media records and explain saved/published counts when relevant.

Business policies: one main free-text Business Policy editor with useful writing guidance, optional preparation instructions, functioning save/review/publish, public link and booking acknowledgement. Walk-ins welcome is a separate editable business attribute/badge. Preserve historical accepted policy versions. Fix the reported save failure.

Subscription: fix Manage payment method for the correct existing Stripe customer; verify saved default method and cancellation without an app-initiated payment merely for changing the method.

Promotions: service/group/business eligibility, dates, preview/activation, correct public evidence, and the settled deposit-preserving arithmetic.

Finances: rename Earnings & Payouts consistently; platform and walk-in/off-platform records, balance-at-chair capture, cash/card/transfer/source/stage distinctions, deposits/unpaid balances, service/product sales, expenses, corrections/refunds, daily close and period reports. Distinguish sale value, collected money and profit. A USD100 service with USD20 deposit and USD80 cash balance contributes USD100, not multiple counted revenues.

Compensation: configurable commission basis, earned/paid/outstanding records, booth rent and flat wages, arrangement history and owner-controlled staff finance visibility. Logging a payout is not permission for an automatic transfer.

Deposits/payment model: retain configurable business deposit rates and thresholds, booked-term snapshots and own-business no-show rules. Verify the requested direct-to-business deposit model and absence of Girlz Culture commission/processing charges while distinguishing underlying provider fees. Recording offline money is not a new customer charge.

Private client records: service/formula details, preferences, cautions, photos, visits and spend history with business and staff permissions. A shared customer identity must never expose another business's notes.

Communications: booking conversation, translated two-way chat, welcome/notification, customer-approved stylist substitution, appointment lifecycle and 24-hour post-appointment chat window, reminders, permitted thank-you/rebooking and consent-aware own-client campaigns. Closed history is not automatically deleted. Retries/reschedules must not cause duplicate or obsolete messages.

Inventory/expenses: products and supplies, stock movements/low-stock alerts, sales linked to the operating books, restocks/corrections and useful expense categories. Avoid duplicate stock deductions or double-counted costs.

Reuse the reported business content and prepare the requested three-to-five richer demonstrations without overwriting live business identities or fabricating real reviews, transactions or results.

These examples do not shorten the earlier 140 requirements. Reconcile every original row, explicitly marking superseded launch directions instead of silently dropping requirements.

5. Finish the revised software capabilities before software launch

Appendix A contains the complete new specification. Its principal added workflows must meet these concrete standards:

Assisted onboarding: an Instagram handle or other permitted source creates a reviewable draft from information actually available. Preserve provenance, flag uncertainties and require owner confirmation of identity/prices/hours/location/media/team/policies before publication. Use official supported access where required and provide manual entry. A handle is not permission to import arbitrary data.

Voice actions: “Log a walk-in — silk press, USD120, cash, Aisha” records exactly one authorized transaction through the same operation as manual entry and reports the saved result. Revenue/balance/schedule questions read current facts. “Move Sarah to 3 PM” resolves the correct booking/date, checks availability and follows applicable customer approval. Clarify real ambiguity and confirm destructive or otherwise approval-required changes; do not turn routine reads into permission loops. Audit writes and preserve text fallback.

Multilingual workspace: retain per-user preferences, canonical records, locale-aware dates/numbers and consistent facts. Extend EN/FR/ES/Simplified Chinese coverage to every new relevant surface, error, report and communication. Record additional language support by actual capability—interface, assistant, recognition, playback, translation, export and glossary. Do not advertise every provider language as full product support. Wolof remains deferred.

Morning Brief and advice: combine today's appointments, clients/staff, risks, expected money, deposits/balances, cancellations/no-shows, gaps/waitlist, stock and follow-ups. Ground one or two next actions in actual records. Preserve the earlier advisor examples: slow periods, profitable underbooked services where costs support that claim, absent regulars, uneven utilization, open slots and low stock.

Money intelligence and tax readiness: use one ledger across screens, assistant, PDFs and spreadsheets. Finish expected versus realized revenue, cancellation impact, staff contribution, deposits, balances, attribution, quarterly/monthly/yearly summaries, expense/payment breakdowns and independent/booth reporting. Include 1099-supporting data only where appropriate; do not claim filing or tax advice. Label missing costs and estimates. Price benchmarks need permissible non-competing-business sources, period/geography/sample context and clear limits; never use other businesses' records or public profiles through the assistant as a workaround.

Marketing: use actual approved before/after photos, services, portfolio and promotions to create captions/tags/booking calls to action, multilingual drafts and an owner-approved calendar. Implement the supported scheduling/publishing flow with truthful status, retries and results. Do not call an external post published when only a draft was stored. Do not invent customer identity, claims, prices or results.

Business website: complete identity, services/prices, hours/location, gallery/team, policies/promotions and booking; shareable URL, intentional phone layouts and SEO/language behavior. A saved dashboard edit must appear correctly on the same business's page. Direct live-business booking must work while marketplace discovery remains closed.

Google Business Profile: official integration, owner authorization/connect/disconnect, correct location mapping, authoritative-field rules, eligible info/hours/media/post sync, conflicts, status/last success, retries and audit. Check actual provider approval/access early. Implement everything possible while access is pending; do not replace this with a Maps link or silently defer it.

Referrals: configurable campaign amount, recipient, dates and qualifying activation/payment; no self-referrals or duplicate rewards, with audit and fraud controls. USD20 is an example, not an automatically approved live campaign. Do not promise a free month per referral. Prepare inactive configurable campaigns where final campaign terms are not yet supplied; do not issue real rewards during tests.

Keep creator recruitment, major influencer/paid acquisition, regional demand expansion, Girlz Culture consumer commerce/private label and Girlz Culture+ membership in their explicitly later phase. Preserve merchant products/inventory now. WhatsApp remains community/announcements for now; do not add WhatsApp customer booking. The removed marketplace-enforcement workstream is outside this addition, but existing functioning protections remain.

6. Address concrete failures efficiently

At the dated comparison snapshot, required run 35384752821 failed in verify:media-contract. The script scripts/verify-media-upload-contract.mjs expected exactly serverExternalPackages: ["sharp"], while next.config.ts had ["sharp", "pdfkit"]. The earlier semantic design-system failure passed, and the complete 168-file clean-database migration chain passed in that run. Production migration jobs were skipped. Refresh current state; do not redo a fix already completed.

If this mismatch remains, verify the intended configuration and media/PDF packaging, then correct the brittle check while preserving actual Sharp/native-media guarantees. Do not remove PDF functionality or disable assertions merely to pass. Run the focused check and remaining inexpensive static gates before launching expensive browser/release suites. Do not rerun an unchanged failing workflow hoping for a different outcome.

Minimize credit and time waste: batch independent inspection, avoid repeated full-repository reads, use targeted checks for changed risks, reuse valid unchanged provider evidence, and run the repository's real required gates at the proper release points. Do not invent extra full-suite gates or bypass required ones. Keep a concise checkpoint so interruptions resume from saved work.

Reuse existing authorized sessions. Do not repeatedly request business/Admin/customer sign-ins. The founder's customer account check is complete; reopen it only for a concrete affected regression. A genuinely expired session may need renewal, but first establish why the existing session is insufficient.

7. Sequence implementation and verify useful outcomes

Continue working in dependency order: reconcile the scope once; resolve existing correctness defects; finish shared finance/client/inventory/actions; connect voice/Morning Brief/intelligence/reports; complete onboarding/websites/marketing/integrations/referrals; reconcile launch access/pricing; perform final acceptance and release. Complete each feature's applicable WIRE and LAYOUT criteria as part of that work, rather than leaving all connection/configuration work to the end. Start actual external-access work early. These are execution stages, not invitations to request permission after every stage or defer core software to another month.

Use the same server-side business/role checks for dashboards, tools, exports, background jobs and writes. Derive authorization from the authenticated session; page context and model-supplied IDs cannot grant access. Keep caches, memory and conversations scoped. Read-only answers should be direct; changes should follow the actual authorized operation and report only confirmed outcomes.

Acceptance must demonstrate, with appropriate safe fixtures and the minimum necessary live checks:

Hair-business signup and supported onboarding; other categories remain waitlisted.

A realistic day using appointments/walk-ins, clients, stock, expenses and staff compensation, with matching finance/export/assistant totals.

Voice/text commands that actually save permitted actions, retain correct facts and avoid duplicates on retries.

Morning Brief and advice grounded in current records, including honest empty/unavailable states.

Flexible service lookup, photo counts and follow-up continuity across pages/languages.

Policy publication/booking acknowledgement, promotion eligibility/protected deposits, calendar conflicts and waitlist single-claim behavior.

Internal communication, preferences, cancellation/reschedule/reminder/post-visit lifecycle and authorized marketing drafts/sends.

Authorized staff access and explicit two-business isolation, including negative cases for tools, memory, exports and writes.

Desktop and phone visual inspection against the relevant references, including composer/keyboard behavior and real edit/save flows.

Onboarding import review, business website/public persistence, provider connect/sync/disconnect and campaign/referral state where applicable.

Approved plan prices matched across UI/Stripe/checkout, correct entitlements, and payment-method-only updates without unintended charges.

Production root coming soon, special demonstration entry, accessible business signup and direct live-business booking, without prematurely opening public discovery.

Correct applicable deployment/provider/job configuration and complete entry-to-result-to-return journeys, including saved readback, dependent updates and the next use. Verify recovery for concrete changed failure risks without generating real unintended side effects.

Working, clearly arranged tabbed workspaces with usable details/back navigation and deliberate desktop/phone spacing. Inspect the actual output for large navigation-only panels, overlaps, cramped content and hidden controls.

Do not generate real client notifications, financial transfers, bookings or charges merely to populate demonstrations or tests. Use authorized test recipients/data and isolated environments; if a particular real operation is essential and not already authorized, prepare the exact minimal action and identify that need. Do not treat a mocked provider response as live verification.

8. Carry the authorized work through release

I authorize completing the implementation and carrying the approved software through review, required CI, merges, reviewed necessary pending migrations and Netlify production deployment using the established release controls. This does not authorize opening the customer marketplace, changing settled privacy rules, raising assistant caps, silently migrating existing paid agreements or starting the later growth programs.

Prepare backward-compatible migrations only where necessary; preserve existing data/history and apply only genuinely pending reviewed migrations through the protected workflow. Recheck actual production history rather than trusting the dated count. Preserve rollback capability. Never repair migration history or reapply previously applied migrations merely to make version counts match.

Verify a stable candidate against the actual source to be released; satisfy required PR/main checks, publish the intended production deployment and verify production identity plus affected user workflows. Respect any genuine protected operation that still requires specific founder approval. Prepare it fully, state the exact action and named reason, and ask once only for that operation while continuing unrelated work. Do not invent a blanket new confirmation requirement.

Keep marketplace access rules intact during software publication. A deployed partial branch is not completion of this assignment. Do not label the software ready while required product acceptance or a required provider integration remains unverified or blocked. If an external prerequisite prevents completion, state precisely what is missing and the smallest founder action needed, with the implementation already prepared; do not replace it with an indefinite “waiting” message.

9. Progress and completion report

Give short, concrete updates at meaningful milestones: what now works, what remains, the current blocker and the next action. Maintain one accurate checklist and checkpoint. Do not inflate progress with commit counts, duplicate tests or a governance decision counted as a delivered feature.

Finish with a requirement-by-requirement mapping to code and evidence, including WIRE and LAYOUT coverage, the non-secret configuration register, the released commit/deployment and URL, relevant migration results, actual provider/visual/behavioral verification, current pricing/access behavior and any genuine remaining limitation. Report whole working journeys and outcomes, not merely pages/buttons created or providers installed. Clearly distinguish implemented, verified, published and intentionally deferred. The founder should not need to ask separately whether to merge, migrate or deploy when those steps are already authorized and their gates are satisfied.

Proceed with the work. Preserve and complete what exists, incorporate the revised scope, and deliver the ready-to-use software described here.

Appendix A — complete text of the revised source specification

Source: Girlz_Culture_Final_Software_First_Implementation_Spec_REVISED(1).docx.

The source text below is included to prevent an omitted attachment from losing requirements. Section 2 above overrides its immediate broad-category launch, root-homepage and pricing-permission wording; sections 2A and 2B add the founder's mandatory complete-journey and tabbed-layout acceptance standards. The source's embedded citation markers came from another conversation and are not verified provider documentation. Check current official documentation when implementing an integration; do not publish unverified competitor or language-coverage claims.

GIRLZ CULTURE
FINAL SOFTWARE-FIRST IMPLEMENTATION SPECIFICATION
Premium Business Operating System • Software-First Launch • Marketplace Later
Important Revision
This document supersedes the previous implementation document. The Customer Obsession, Partner Quality, Customer Protection and related marketplace-enforcement material is removed from this implementation scope because those areas have already been implemented or are being handled separately. This document is focused on the software-first product expansion discussed today.
The major correction is timing: the Morning Brief, money intelligence, multilingual workspace, marketing engine, professional business website, zero-setup onboarding, voice-first operation, tax-time readiness and related software capabilities are NOT 30–60 day ideas. They are part of the final pre-launch implementation because they are the reason Girlz Culture is going to market as a premium software product.

Launch Strategy
Stage | What is public | When
Phase 1 — Software launch | Girlz Culture is premium business software for salons, spas, stylists, barbers, nail/lash/brow professionals, aesthetics/tattoo businesses, solopreneurs and independent contractors. | NOW
Phase 2 — Customer marketplace | Customers discover and book real Girlz Culture businesses. | After 10 active businesses AND operational readiness
Later growth | Creator network, major influencer push, broader paid campaigns, products, membership and new markets. | After real traction
“Phase 2 trigger” simply means opening the customer-facing marketplace. It does NOT mean delaying the software capabilities in this document.

The Product Standard
The goal is not to launch another basic appointment system. Current competitors already cover booking, CRM, payments, reminders, waitlists, marketing, loyalty, inventory, analytics and related tools. Fresha, GlossGenius and Vagaro currently advertise broad feature sets, including AI/automation, websites, marketing, reporting, waitlists and client management. citeturn0search0turn0search1turn0search2
Girlz Culture should therefore be positioned as: “This can actually run my business.” The differentiation is removing work, connecting systems and turning business data into actions.

Existing Product Foundations
Appointments, booking and deposits.
Business booking links.
Business pages, descriptions, photos and stylists.
Client history and records.
No-show/cancellation memory.
Waitlist and auto-fill.
Finance/payment recording and revenue clarity.
Expenses and inventory foundations.
GC Assistant.
Localization/DeepL foundation.
Performance/ranking/sponsorship foundations.
Business dashboards and Platform Admin.
Realtime updates and booking notifications.
Manual Admin booking.
Stripe checkout links and Stripe Connect.
Featured Salon campaigns.
Incident Queue/export.
Service Catalog.
Homepage Hero/About content management.
Typo-tolerant search and mobile keyboard search.
Existing customer ↔ business post-booking chat.
Implementation rule: audit each existing capability first, then enhance or connect it. Do not create duplicate systems.

FINAL PRE-LAUNCH — Zero-Setup Onboarding
Target: “I typed my Instagram handle and my business appeared.”
Owner enters Instagram handle or approved business source.
Create a draft workspace and draft business page.
Import only permitted business information/media.
AI structures information that actually exists; it never invents facts.
Flag uncertain fields.
Owner confirms business identity, services/prices, hours, photos, team and policies.
Create workspace, booking link and page.
Show remaining setup actions.
Use approved APIs where required.
Store provenance internally.
Never silently publish imported information.
Never invent prices, hours, services or location.
Provide manual fallback.

FINAL PRE-LAUNCH — Voice-First Operations
The existing GC Assistant should become a real authorized action layer.
Voice command | Expected action
“Log a walk-in — silk press, $120, cash, Aisha.” | Create the transaction.
“What did I make today?” | Return current-day revenue.
“Move Sarah to 3 PM.” | Find, check, reschedule and confirm.
“Who owes me money?” | Return outstanding balances.
“What appointments do I have tomorrow?” | Return schedule.
Speech → intent → authorization → action → result.
Reuse GC Assistant.
Role permissions apply.
Confirm ambiguous/destructive actions.
Audit every write.
Distinguish completed actions from suggestions.
Text fallback remains available.

FINAL PRE-LAUNCH — Multilingual Workspace
Per-user language preference.
Different employees can use different languages simultaneously.
One canonical business dataset.
Assistant follows user language.
Customer communications use supported customer language.
Clean fallback.
Reviewed beauty/business glossary.
Girlz Culture already has localization/DeepL foundations. The implementation task is to verify exactly what is covered and extend missing surfaces, not replace the system.
Current DeepL documentation confirms text/HTML translation, glossaries/formality controls and 100+ supported translation languages; the published language list includes French, Spanish, Chinese, Wolof, Tagalog and Cebuano. Not every language supports every customization feature, so the actual Girlz Culture coverage must be verified per feature. citeturn1search0turn1search1

FINAL PRE-LAUNCH — Morning Brief
The owner should open Girlz Culture and immediately see what matters today.
Today's appointments, clients and stylists.
Schedule risks.
Expected revenue, deposits and balances.
Cancellations/no-shows.
Open slots and waitlist opportunities.
Low inventory/reorder warnings.
Clients needing follow-up.
One or two actionable recommendations.
This is an operating brief, not another analytics dashboard.

FINAL PRE-LAUNCH — Money Intelligence
Revenue trends.
Expected versus realized revenue.
Deposits and outstanding balances.
Cancellation/no-show impact.
Stylist/team contribution.
Underused schedule periods.
Promotion opportunities.
Reliable price benchmarks.
Promotion performance where attribution exists.
Actionable recommendations with explanations.
Every benchmark must show relevant period/geography/sample context and distinguish measured data from estimates.

FINAL PRE-LAUNCH — Tax-Time Readiness
Quarterly income summaries.
Cash/card breakdown.
Expense summaries.
Booking/payment reconciliation.
Independent-professional/booth-renter reporting where applicable.
1099-supporting information where appropriate.
Exportable reports.
Organize records for tax preparation. Do not claim tax advice or filing unless separately implemented and reviewed.

FINAL PRE-LAUNCH — Marketing Engine
Girlz Culture should act like an in-house marketing assistant.
Input | Output
Before/after photo | Caption, service/style tags, booking CTA.
Completed service | Draft social content.
Portfolio item | Draft promotional content.
Promotion | Compliant promotional copy linked to booking.
Marketing calendar | Owner-approved scheduling.
Owner approval by default.
Never invent claims, prices, results or customer identity.
Use real business media/service data.
Support multilingual content.
Connect content to the business page and booking destination.

FINAL PRE-LAUNCH — Professional Business Website
Business identity and description.
Services and prices.
Hours/location.
Gallery.
Stylists/team.
Booking.
Policies.
Promotions where appropriate.
Language-aware presentation.
Shareable Girlz Culture URL.
Mobile-first presentation.
SEO-ready structure.
This is a major software value proposition: a business without a proper website gets a professional business presence through Girlz Culture.

FINAL PRE-LAUNCH — Google Business Profile
Official/approved integration.
Owner connect/disconnect.
Authoritative-field rules.
Hours/business information synchronization.
Supported media/posts where appropriate.
Sync status and last success.
Conflict detection.
Retry and audit history.
Google's current documentation confirms Business Profile APIs for profile/location management and related functionality, with access/approval requirements and no general sandbox. citeturn0search4turn0search7

WhatsApp — Corrected Scope
The previous document over-prioritized WhatsApp booking. That is removed from the immediate software scope.
Keep the Girlz Culture WhatsApp community/channel for announcements, education, promotions and community content.
Do not build a WhatsApp customer-booking workflow now.
Evaluate business/customer WhatsApp booking later only if U.S. customer behavior proves demand.
The existing Girlz Culture internal chat is the primary customer ↔ business communication layer.
After a booking, the customer can receive a message such as: “Hi Sarah, thanks for booking Business A. Business A is connected to this chat. If you have questions, concerns or updates, you can let them know here.” The business receives the corresponding appointment/chat notification and can communicate through the same system.

Referral Economics — Corrected
Do not promise a free month for every referred business. That is too expensive for the current model.
Working concept: use a limited-time referral promotion with a modest fixed reward, such as a $20 credit/discount for a qualifying referred business or referrer. The exact recipient and amount should be configurable by campaign.
Founder controls campaign dates.
Reward requires qualifying activation/payment.
No self-referrals.
No duplicate rewards.
Fraud controls.
Promotion can change over time.

Premium Pricing — Corrected Direction
The previous $59/$69/$89 pricing should not be treated as the final direction. The product is now intended to be a premium operating system with AI, finance, communications, localization, marketing, website, booking and other infrastructure.
Tier | Working price | Positioning
Starter | $89/month | Premium core operating system for independent professionals and smaller businesses.
Growth | $109/month | Full operating system plus stronger growth/automation capability.
Premium | $129/month | Highest included capability set and advanced business functionality.
These are working prices for the launch model, not a claim that the economics are finalized. The same tiers and prices apply to shops and solopreneurs/independent professionals. They should not receive a separate lower-priced software tier that removes access to the same core opportunities.
The premium positioning is also economically relevant: competitors vary widely, with current published examples including Fresha at $19.95 for an independent plan plus optional add-ons, GlossGenius at $28/$56/$168 monthly, and Vagaro at roughly $30/month for one location before selected add-ons/services. Girlz Culture should justify its premium price through included value and reduced operational work, not simply a higher price tag. citeturn0search0turn0search1turn0search2

What Is Included in the Premium Software Promise
Booking and deposits.
Business page/website.
Client records and history.
No-show/cancellation memory.
Waitlists.
Services/catalog.
Stylists/team.
Finance and revenue clarity.
Inventory/expenses.
AI assistant.
Voice actions.
Multilingual workspace.
Morning Brief.
Money intelligence.
Marketing content engine.
Booking/customer communication.
Professional public business page.
SEO-ready business page.
Future official integrations as they become available.
The exact entitlement matrix should be reconciled against the existing Starter/Growth/Premium implementation before changing prices in Stripe or production. Do not silently alter existing live subscriptions.

Phase 1 — Exact Pre-Launch Plan
Finish and verify the software enhancements in this document.
Audit existing implementations so nothing is duplicated.
Make the public website software-first.
Create/repair software SEO pages by business type and language.
Keep customer marketplace Coming Soon.
Keep the demo marketplace private.
Open software applications/signups.
Activate founding businesses.
Monitor their first use closely.
Use the first 10 active businesses as the readiness checkpoint for opening the marketplace.
The 10-business checkpoint is not a 30-day delay. It is a marketplace-readiness threshold after the software is already publicly available.

What Happens After Launch — Not Deferred Product Build
The following are not “wait until days 31–60” implementation items. They are part of the pre-launch software build: Morning Brief, money intelligence, multilingual workspace, marketing engine, professional business website, zero-setup onboarding, voice-first operations, tax-time reporting, and the enhancements to existing booking/finance/client/inventory systems.
The only major items intentionally deferred are growth systems that require real customer traction or a larger operating base, such as the creator network, major influencer push, large-scale paid acquisition, direct-to-consumer products and membership.

Later — Creator Network
After real customers and businesses exist, recruit a controlled cohort of approximately 10–20 UGC/creator partners.
Real Girlz Culture usage.
Clearly disclosed compensation/credits.
Discovery creators.
Experience creators.
Beauty education creators.
Long-term ambassadors.
Never require positive reviews or five-star ratings.

Later — Customer Growth Surge
Once the marketplace has real businesses, credible customer experiences and usable content, activate the larger growth engine: UGC, influencers, Instagram/Facebook/TikTok ads, selective Reddit/X testing, referrals and retargeting.
The goal is repeated legitimate exposure, not artificial virality.

Later — Regional Waitlists
Create city/state waitlists.
Collect demand by geography and service.
Use content to generate interest before market entry.
Recruit businesses after demand appears.
Open new markets when supply and demand support them.
This allows surrounding markets to begin requesting Girlz Culture before the company officially launches there.

Later — Direct Customer Commerce
Curated third-party beauty products.
Girlz Culture bundles.
Girlz Culture-branded products.
Private-label hero products after proven demand.
Do not build a warehouse or large inventory operation before demand proves the model.

Later — Girlz Culture+
Member-only offers.
Beauty credits/rewards.
Birthday benefit.
Priority support.
Product offers.
Selected early access.
Personalized recommendations.
Introduce only after repeat usage demonstrates recurring customer value.

Final Go-to-Market Sequence
Step | Decision
1 | Complete the final software implementation in this document.
2 | Verify the existing product and new capabilities end-to-end.
3 | Finalize premium Starter/Growth/Premium pricing and reconcile Stripe entitlements without silently changing existing live subscriptions.
4 | Make the public website software-first.
5 | Publish and technically verify software SEO pages.
6 | Open software applications and begin acquiring businesses.
7 | Activate the first 10 businesses.
8 | Use real business usage to verify product value and fix remaining high-impact defects.
9 | Open the customer marketplace when the 10-business checkpoint and operational readiness are satisfied.
10 | After real customer traction, activate creators, larger marketing, regional waitlists, products and other growth layers.

The Standard for This Final Build
The implementation is successful only if a business owner can see Girlz Culture and understand why it is materially more useful than basic booking software.
The intended reaction is not:
“Another salon booking app.”
It should be:
“This is a premium operating system for my business. It organizes my work, helps me run the business, helps me make money, helps me market the business, gives me a professional online presence, and saves me time.”

Final Instruction to the Implementation Partner
Inspect the current code first. Map every requirement above to the existing implementation. Mark each item as already complete, partially implemented, weak, missing, provider-dependent or requiring a founder decision. Then enhance existing systems and implement missing layers.
Do not push major features into a later 30/60/90-day roadmap merely because they are substantial. The purpose of this assignment is to complete the premium software product before the software-first launch.
Do not start the creator/influencer surge, nationwide customer marketplace expansion, direct product commerce or membership as part of this implementation. Those are later growth phases.
Do not alter live pricing, subscriptions or production payment behavior until the final pricing/entitlement decision has been reconciled with the existing Stripe implementation and tested.