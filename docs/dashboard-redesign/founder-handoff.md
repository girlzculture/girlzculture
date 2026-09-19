# Girlz Culture — complete Codex implementation handoff

Recorded: 17 September 2026. Consolidated: 18 September 2026, including all dashboard corrections, the Software Value Build Spec, and the final customer-website and demo-removal instructions.

Status: Requirements intake complete for the changes supplied in this conversation. This is the consolidated implementation handoff for Codex, not a claim that the work has already been implemented or deployed. Every requirement remains to be checked against the actual current code and live behavior. Later explicit founder instructions take precedence over illustrative mockup content. Two unresolved business-rule decisions are identified in section 19; neither permits silently dropping a feature.

## Read this first — instruction to Codex

Implement the complete scope in this document in the existing Girlz Culture repository and connected deployment environment. Read the entire file before changing code. Treat all detailed requirements, page specifications and the final coverage checklist as required scope. Inspect every design image supplied with this handoff before implementing the relevant interface, including its desktop and mobile details. Identify whether each attachment is a desired design reference or a screenshot of the current product; do not use a current-state bug capture as the target design. Use written descriptions only as the fallback for reference images that are unavailable; do not ignore attached images in favor of the text alone.

The intended outcome is a modern, mobile-first business platform with a useful GC Assistant, complete business-management features, and an accessible, genuinely bookable customer marketplace. The business-owner dashboard requires the full layout and interaction redesign described here; a recolor or a subset of its pages does not fulfill that request. The public website has a different design instruction: retain its existing approved layout, sections, content, identity and customer journeys, and use the new website images for selective visual inspiration. Do not rebuild the public website as a copy of those mockups. A functioning provider connection or passing CI alone does not complete the functional scope.

| Area | How Codex must use the images |
| --- | --- |
| Business software/dashboard | Follow the supplied dashboard reference designs closely for layout, sections, tabs, assistant placement and desktop/mobile interaction, with the explicit feature requirements and corrections in this document. |
| Public customer website/app | Keep the existing site as the baseline. Borrow modern details such as search-bar and card shapes, tabs, spacing, subtle depth and interaction polish. Preserve teal, white and black. The website images are inspiration, not replacement page templates. Apply the separately specified routing, demo-removal, navigation, pricing placement and functional corrections. |

This distinction is the founder's explicit clarification and governs any broader “redesign” wording elsewhere in this document.

The final public-site correction is mandatory: preserve the approved root landing experience at girlzculture.com; make /site-access the complete working customer homepage/marketplace entry with connected public pages; remove public demo banners, demo-only labels and demo booking restrictions. Keep teal, white and black. Move subscription Pricing under For Businesses with three actual plan tiers. Put future-business-category applications/waitlists in the business center, not the customer homepage. Sections 18–20 provide the full instructions and individual completion checks.

Use the existing project, integrations and release procedures. Do not restart authentication/provider setup unnecessarily, reset working sessions or reopen the founder-completed customer-account verification. Inspect actual current main and deployment state so that later work is preserved. Resolve concrete defects and complete the full implementation, required verification, applicable migrations, merge and deployment using existing authorization and protected workflows. Do not bypass a real approval control; if one truly blocks a specific action, prepare the exact reviewed change and explain that specific requirement once. Do not end with only a plan or an incomplete UI presented as done.

Record evidence against every checklist item. Maintain a checkpoint in the repository so progress and outstanding work survive interruptions. Keep the existing two $25 assistant caps unchanged. Preserve the separately agreed Wolof deferral; the new EN/FR/ES/ZH scope is required throughout.

## 1. Purpose and evidence

The founder requests a full redesign of the business-owner dashboard to match the supplied desktop/mobile references. Changing colors, fonts, and font colors alone does not fulfill the request. The layout, navigation, content organization, editing flows, responsive behavior, and assistant interaction must change across every owner tab.

Sources: ten reference composites, current dashboard captures int1.PNG–int13.PNG, “WhatsApp Image 2026-09-17 at 7.18.46 PM.jpeg”, “WhatsApp Image 2026-09-17 at 7.18.46 PM (1).jpeg”, and the founder's accompanying instructions. References are named “ChatGPT Image Sep 17, 2026, 06_23_36 PM (1).png” and “ChatGPT Image Sep 17, 2026, 06_23_37 PM (2).png” through “(10).png”.

Additional source: “Pasted markdown(20260918-001704).md”, headed GIRLZ CULTURE — SOFTWARE VALUE BUILD SPEC, provided on 18 September and read in full. Section 17 maps all six parts into this same implementation scope. The original attachment remains unchanged.

Final visual sources: “ChatGPT Image Sep 17, 2026, 08_38_15 PM(1).png” (customer homepage), “08_38_33 PM(1).png” (salon discovery/results), and “08_38_47 PM(1).png” (public salon profile/booking). All three were inspected at original resolution. Their written visual specification is in section 18. The founder specifically rejects copying their sample wording, unsupported claims, public waitlist blocks and top-level Pricing link.

Evidence boundaries:

- Static images establish visible presentation, not whether a feature works or exists farther down a page or behind a card.
- The current Overview, My Page, Photos, Styles & Pricing, Stylists, Calendar landing page, Bookings, Earnings, Promotions, and open assistant are visible. Products is partly obscured by the assistant.
- No separate current Messages, Reviews, Subscription, or Settings captures have been provided. Two mobile assistant captures are now available; they do not establish every underlying mobile page's layout.
- int11.PNG visibly supports the delayed message-submission report: the question remains in the composer while an assistant loading indicator is displayed. No browser-level reproduction or code diagnosis has been performed in this review.
- The reference images include illustrative figures, identities, dates, badges, and features. These must not be mistaken for verified business facts or already implemented capabilities.
- The phone hardware, decorative background, and slogans outside the app in the reference composites illustrate the presentation. They are not permanent elements of the desktop dashboard.

## 2. Shared interface corrections

| ID | Requirement | Completion evidence |
| --- | --- | --- |
| UI-01 | Apply a coherent redesign to all 14 owner navigation sections: Overview, My Page, Photos, Styles & Pricing, Stylists, Products, Availability & Calendar, Bookings, Messages, Reviews, Finances (renamed from Earnings & Payouts), Promotions, Subscription, Settings. Include their editing/detail views and dialogs. | A page inventory and matched screenshots account for every section; no old landing screen is silently excluded. |
| UI-02 | Match the references' layout and visual hierarchy: compact header, recognizable navigation, useful page headings, organized cards, imagery, clear actions, consistent spacing and typography. | Review composition as well as colors/fonts. |
| UI-03 | Reduce the stacked header, assistant-button strip, breadcrumb/search strip, and oversized route cards that push actual work down the page. | Owners reach the main editor, calendar, gallery, list, or conversation directly. |
| UI-04 | Preserve existing functions, data, validation, permissions, and save/publish behavior while changing their presentation. Spreadsheet import/export remains accessible as a secondary task instead of dominating everyday work. | Existing important workflows remain reachable and functional. |
| UI-05 | Use plain business language. Replace implementation-oriented explanations in ordinary screens with useful labels, statuses, help, and recoverable errors. | For example, media owners see uploading/saved/published/retry status rather than a permanent explanation of storage stages. |
| UI-06 | Design loading, empty, error, and populated states deliberately. | A business without transactions or bookings still gets a useful screen; missing activity is never replaced with fabricated live figures. |
| UI-07 | Extend the founder's modern, bright, colorful, conversational and interactive design direction and plain-language copy review across the main website and app as well as the owner dashboard. | Keep the detailed dashboard references as the current visual specification; incorporate further customer-facing design instructions as they arrive. Public profile, policy, promotion and booking changes below are already explicit scope. |

## 3. Mobile behavior

Mobile is the primary design priority because the founder expects most business owners to use phones. The mobile experience should be designed independently within the same visual system, rather than shrinking desktop columns.

| ID | Requirement |
| --- | --- |
| MOB-01 | Keep every necessary feature accessible on mobile, using compact cards, lists, tabs, and menus suitable for touch. |
| MOB-02 | Keep a clearly labeled GC Assistant icon/button near the top on every owner page. Open the conversation only on a tap; do not automatically cover the mobile screen. |
| MOB-03 | Use shorter My Page labels: Info, Services, Location, More. Desktop retains fuller labels such as Services & Pricing and Location & Hours. |
| MOB-04 | More exposes Amenities & Policies, Social & Links, and other overflow content. Selecting an item displays its actual editable content. |
| MOB-05 | Actions that do not fit, including calendar availability/full-day actions, go in an accessible three-line/menu or More control. Do not remove them on mobile. |
| MOB-06 | Mobile photo uploads inherit the selected category and allow titles/captions and editing. |
| MOB-07 | Match the references' compact navigation and content hierarchy, including the mobile bottom navigation where appropriate. Keep Save, Upload, Send, and Close usable when the keyboard is open. |

Implementation quality expectations: readable text, sufficient contrast, touch-sized controls, visible focus, properly labeled menus, status text in addition to calendar colors, and no unintended page-wide horizontal scrolling. These support the requested usability rather than adding a separate workstream.

## 4. Page-by-page comparison and target

### Overview — int1.PNG / reference 1

Current: “Your Dashboard”; large separate alert and opening-status bands; five metric cards; profile completion, upcoming appointments, and reviews. The captured business has zero activity. No personalized greeting/date, chart, or docked assistant appears in the captured portion.

Target: “Welcome back, [owner name]”, today's summary, and the correct local date; compact status/notification presentation; useful metric cards; bookings/revenue trends; today's schedule; page-health/completion checklist; upcoming appointments; recent reviews; quick actions; contextual assistant beside the workspace. Use the actual owner, business timezone, reporting periods, and data. Do not hardcode Isha, the reference date, sample values, or warning thresholds.

### My Page — int2.PNG / reference 2

Current: setup guide and a grid of links for business information, description, address, hours, social links, media, policies, and identity. Existing data is summarized in cards, but the profile is not visually editable on the landing screen.

Target: visible cover image and overlapping profile/logo image, business identity, direct Change Cover Photo and Change Profile Photo controls, public-page preview, and clear saving/publishing actions. Tabs: Business Information, Services & Pricing, Location & Hours, Amenities & Policies, Social & Links. Each tab contains its relevant fields/content. Retain existing policies, public identity, trust, and other current functionality within the new structure.

Saved changes must update the correct business and, through the existing publication rules, its public website page. A draft must not be presented as published. Show completion and verification only from real records. Mobile uses Info / Services / Location / More and an accessible Save action.

Update of 18 September: Business Policy becomes one main text editor, with an optional separate Before your appointment field. Replace the former policy-dropdown design as detailed in section 12. Add a Walk-ins welcome checkbox to My Page and a corresponding public-page label.

### Photos — int3.PNG / reference 3

Current: Cover Photo, Salon Logo, and Gallery navigation cards; counts and technical media-state explanation. Actual images and category controls are not visible on this landing screen.

Target: gallery visible immediately; All Photos, Services, Before & After, Salon Space, Team, and other supported categories; upload controls, cover preview, image thumbnails, edit actions, titles/subtitles/captions, category metadata, ordering and relevant display options. Preserve existing crop/remove/retry and public-visibility functionality.

Upload flow: select Services → Upload Photos → upload is assigned to Services → enter/edit title or caption → save → item appears in that category. The category must remain clear throughout the flow and be editable. Before/after pairs should remain associated where supported. Reference analytics or moderation badges need real underlying support; sample counts are not requirements to fabricate values.

### Styles & Pricing — int4.PNG / reference 4

Current: spreadsheet import/export dominates the top of the page; services appear below in tall text rows with filters, prices, durations, and “No service image uploaded” notices.

Target: clear categories, featured services and meaningful popular-service presentation, appropriate images, search/filter controls, usable service cards or table, and accessible add/edit actions. Preserve actual price ranges, duration ranges, deposit rules, categories, status, add-ons, and import/export. Popularity must have a defined real basis; featured is distinct from popular. Reuse existing photos only when correctly associated with the service.

### Stylists — int5.PNG / reference 5

Current: search and status/availability filters plus four staff cards with real photos, experience and specialty text. Card widths are uneven and specialty lists are truncated.

Target: consistent staff cards, readable specialty chips, clear availability, useful filters, and selected-person detail. Reference sections include Team Members, Performance, Schedules, Payouts, Onboarding, and Team Settings, plus service assignments and working hours. Inventory existing support before exposing these controls; any missing capability remains an explicit implementation item, not a decorative finished-looking button. Preserve real team identities, services, permissions, and schedules.

### Availability & Calendar — int6.PNG / reference 6

Current: six cards lead to Add Appointment, Appointment Calendar, Store Hours, Bookable Time Slots, Per-stylist Availability, and Overrides & Blackouts. The calendar is behind another click; this does not establish that it is absent from the system.

Target: calendar as the main workspace; date/week navigation; staff/stylist selectors; labeled color-coded appointments and availability; readable breaks, closures, blackouts and statuses. Add Availability and Mark Full Day remain directly accessible on desktop, with remaining scheduling controls organized coherently. Mobile provides a compact calendar/agenda and menu for actions that do not fit.

Preserve timezone correctness, existing availability calculations, conflict checking, preview/confirmation, and the recently fixed appointment submission behavior. Do not change real availability simply to populate screenshots. Reference extras such as waitlists, templates, drag/drop rescheduling or utilization need implementation/data inventory before being claimed complete.

### Bookings — int7.PNG / reference 7

Current: Add Appointment, a large search/filter block, status tabs, and an empty table. The image shows no appointments for the selected status; it does not prove bookings functionality is missing.

Target: compact operational summary, practical date/staff/service/status filters, clear booking details and actions, and strong hierarchy for time, customer, service, stylist, deposit, balance and status. Desktop can use a detailed table/list with a calendar switch where implemented; mobile uses readable booking cards. Preserve existing search, status meanings, manual appointments, cancellation and conflict behavior. Empty states need useful next actions without invented appointments.

### Messages — reference 8; current standalone capture pending

Target: organized conversation list, selected conversation, useful customer/booking context, and contextual assistant help. Reference features include inbox categories, unread state, attachments, reply suggestions, reusable replies and relevant actions. Mobile should move clearly between inbox and conversation instead of compressing all columns. Determine existing support for reminders/automation and attachments; do not imply they work merely because the reference contains controls. No current-layout verdict is made without a current capture.

### Reviews — reference 9; current standalone capture pending

Target: genuine rating summary, usable search and filters, review list/detail, response editing and assistant help. Reference charts include rating trends, distribution and sentiment; show only real, supported analysis or transparent empty/unavailable states. Do not add fictional reviews to live businesses. No current-layout verdict is made without a current capture.

### Finances — currently Earnings & Payouts, int8.PNG / reference 10

Current: real financial categories (deposits, refunds, net owed, client balance), connection/status panels, empty trend and detailed ledger with search, dates, export and transaction evidence. The screenshot shows Stripe not connected and no historical activity.

Target: clearer period selection, financial summary, trends where data exists, organized payment/payout details, readable transactions, and exports. Preserve the ledger's accounting accuracy, audit details, filters and CSV export. Do not relabel booking value as received revenue or a transfer as a settled bank payout. Reference payment-method charts, statements, tips, refunds/disputes and payout details need actual data/capabilities. Mobile needs comprehensible transaction cards/details rather than a squeezed wide table.

Update of 18 September: rename this area consistently to Finances. Detailed requirements have now arrived in the Software Value Build Spec and are incorporated in section 17. Include the promotion/deposit accounting requirements in section 14. The combined goal is a useful everyday financial workspace for platform bookings, walk-ins and off-platform payments, staff arrangements, products, expenses and profit.

### Products — partially visible behind int10.PNG

Current: import/export, product filters, empty product area and pickup-reservation area are visible beneath the assistant overlay. The full screen cannot be assessed from this capture.

Target: apply the same visual system to catalog, imagery, stock, fulfilment and reservation/order details. Keep import/export accessible but secondary. Preserve existing product/payment/stock rules. No dedicated product reference was supplied, so document design decisions consistently with the other pages.

### Promotions — int9.PNG; no dedicated target reference

Current: New Promotion and an empty Saved Promotions panel with extensive unused space.

Target: useful empty state, clear promotion cards or list, status and dates where supported, and coherent creation/editing. Preserve the existing draft → preview → activate flow and booking eligibility rules. Populate demonstrations in a designated demo context rather than activating offers for real customers.

### Subscription and Settings — no dedicated current or target captures

Both remain mandatory redesign scope. Apply the shared shell, mobile navigation, forms and assistant behavior while retaining all existing account, plan, billing, notification, language and business settings. Plan benefits must match actual entitlements; do not invent sales-uplift promises to fill a card. Record design decisions and missing reference coverage explicitly.

Update of 18 September: Subscription → Manage payment method reportedly fails with an unavailable/reference error. Fix changing the subscription payment method without creating a charge for that update; see section 13. This is distinct from a business's payout-account connection.

## 5. GC Assistant corrections

| ID | Requirement | Evidence / acceptance |
| --- | --- | --- |
| GC-01 | On desktop, show the assistant alongside the workspace by default on every owner page. | Current int10 is a large overlay that tints and obscures the page. Target is the reference's adjacent panel. |
| GC-02 | Provide X to close and an obvious way to reopen. | Closing must work immediately and not be instantly undone by a rerender. The assistant stays available on each page. |
| GC-03 | On mobile, show the top entry button; open only on tap. | The conversation must not automatically cover the working screen. |
| GC-04 | Use “GC Assistant” and “Your business co-pilot.” Remove “AI” and generic “Ask about…” phrasing from assistant-facing labels and copy. | Current footer says “Review AI suggestions before saving changes.” Use plain wording such as “Review suggested changes before saving.” Preserve the review behavior. |
| GC-05 | Keep voice interaction and read-aloud controls understandable and compact. | Current repeated device-voice explanations take significant message space; place necessary information in suitable help/settings. |
| GC-06 | Update assistant context to the current page and business. Keep the conversation coherent as the owner navigates. | int10 shows booking/calendar/overview suggestion chips while Products is open. Provide contextually useful actions rather than repeating the same generic chips after each answer. |
| GC-07 | Retrieve relevant authorized business facts when needed and preserve language preferences. | A static reply asking for service details does not establish a backend defect; inspect actual retrieval before diagnosing. Do not make owners repeat information the assistant can legitimately read. |
| GC-08 | Keep changes reviewable and verify actual outcomes through existing tools/permissions. | Do not replace real operations with decorative success messages. Existing confirmation requirements remain in effect. |
| GC-09 | Retain the existing consent-based memory behavior. | A persistent panel or route change must not silently enable transcript storage or cross-business access. |

### Message send bug — user report now supported by int11.PNG

CHAT-01 — Immediately insert submitted messages, clear the composer, and show a separate assistant loading state; implement and verify every interaction below.

Observed by the founder: after entering “Do I have any bookings today?” and pressing Enter, the question remains in the input while a loading state runs. The message appears in the conversation only once the assistant responds.

int11.PNG now shows that question still in the composer and a three-dot assistant loading indicator in the conversation. It supports the reported visible state; exact timing and underlying code still need verification during implementation.

Required interaction:

1. Enter or Send immediately inserts one user message into the conversation.
2. Clear the composer immediately while retaining the submitted text in message state.
3. Display a separate assistant typing/loading indicator beneath that message.
4. Render the answer when received; use streaming only if the existing provider path supports it appropriately.
5. On failure, keep the user's message visible with a clear retry/error action. Do not lose text, silently duplicate it, or issue duplicate requests from repeated taps.
6. Preserve multiline composition and language input; submitting while a user is composing characters must not send prematurely.
7. Keep the latest exchange visible without repeatedly forcing scroll away from an owner reading earlier messages. Keep the composer usable with the mobile keyboard.

This is a chat-state correction as well as a visual redesign. The supplied screenshot is now incorporated; no further account sign-in is needed to record it.

## 6. Real business content and demonstrations

The founder reports 25 active/live businesses. Verify the inventory read-only when implementation begins; the count has not been independently checked in this screenshot review.

- Populate the new views with each business's actual identity, services, prices, photos, staff, opening hours and other authorized content. Reuse existing records rather than creating a parallel mock database for the production UI.
- Select approximately three to five businesses for representative demonstrations and richer content, as requested. Track which records/assets were selected and the intended destination of any additions.
- Preserve business ownership and data boundaries. Do not move one business's private/customer information into another business or a public demo.
- Treat any invented descriptions or metadata as drafts for the intended demonstration. Use clearly labeled isolated demo scenarios for synthetic bookings, reviews, revenue, customers or promotions; do not contaminate real operational records to make the UI look populated.
- Existing content not shown at the top of the current page may already be available. Connect and display it correctly before concluding that new content must be created.
- Real businesses with no bookings, products or payment history still need an honest, useful interface.

## 7. Implementation handoff and acceptance

This section is now an execution and acceptance instruction for the receiving Codex session. The earlier intake-only status is superseded by the completed handoff. Implement the complete scope and verify it against the current repository and connected environment:

1. Inventory existing routes/components and functionality against this register. Reuse the working OpenAI, DeepL, memory, calendar, payment and public-profile integrations.
2. Map every reference/current page to its implementation and distinguish visual changes from genuinely missing functionality. Show unresolved items honestly.
3. Implement the shared layout and mobile navigation, then complete each listed page and the assistant interaction changes. New buttons must have real actions and states.
4. Review matched desktop and mobile screenshots against the references, including populated and empty states. Functional CI alone does not prove visual fidelity.
5. Verify the changed workflows: correct business/public-page and policy saves, customer policy acknowledgement, category-aware uploads and captions, calendar preview/conflicts, responsive menus, assistant context and natural-language retrieval, business isolation, immediate message insertion, errors/retry, voice controls and language continuity, subscription payment-method updates and promotion/deposit calculations.
6. Use existing authorized sessions and relevant valid test evidence. Do not repeatedly ask for owner/admin/customer sign-ins or rerun unrelated provider suites without a concrete need. The founder has already completed the customer-account check.
7. Maintain the existing two $25 caps and approved protections. Wolof remains deferred; this redesign does not silently reopen it or certify the entire GCIA roadmap.
8. A completion report must distinguish implemented, visually verified, functionally verified, and still pending items. Publishing code is not evidence that all references were matched.

## 8. Evidence inventory

- Received and reviewed: int11.PNG (pending chat state), int12.PNG (service-answer exchange), int13.PNG (policy error and annotated form), and both mobile photo-count conversation captures.
- The founder reports a subscription payment-method error; no dedicated screenshot or support-reference value for that error was supplied in this batch.
- Received and reviewed: the three final customer-page references described in section 18. Detailed written requirements cover pages whose images the receiving Codex session may not have; do not require the founder to resupply the entire image collection before starting.

Update this same record as evidence arrives. Do not require the founder to repeat the requirements already captured above.

## 9. What the new screenshots establish

| Source | Observed evidence | Implication and limits |
| --- | --- | --- |
| int11.PNG | “Do I have any bookings today?” remains in the composer while the assistant shows loading dots. The preceding answer says it found policies but does not show their content. | Correct immediate message insertion. A useful policy answer should return the requested facts when available, rather than only announcing that policies were found. The image alone does not verify whether a policy read actually succeeded. |
| int12.PNG | One answer claims the service inventory is “total: 0” and demands an exact name. After the owner mentions Boho/knotless, the next answer names Boho / Goddess Braids and Box Braids with prices/durations, speculates about its earlier answer, then asks which label to use on a booking page. | There is inconsistent service information and the reply drifts away from the price question. Investigate retrieval, filters, context, matching and response grounding. Do not diagnose only an exact-match search defect from the screenshot. Quoted prices are assistant claims, not verified catalog facts. |
| int13.PNG | “Business policies are temporarily unavailable.” Support reference: 70ad1644-c08f-4a16-af76-014d9b58b0df. The founder crosses out multiple dropdowns/fields and parts of the refund/satisfaction wording. | Availability/save/publish failure needs investigation using the reference and actual failed request. The screenshot does not establish whether the underlying cause is authentication, endpoint, validation, database or another dependency. |
| Mobile image without “(1)” | Asked “How many photos do I have saved?”, the assistant says it cannot see the number and asks the owner where photos are stored. | Add a reliable current-business media inventory/count lookup and direct answer. Do not require an owner to explain the platform's own Photos section. |
| Mobile image with “(1)” | After “They are in my photos”, the assistant asks what the owner wants to confirm/update and whether a service, product or photo is meant. | Preserve the original count question through follow-ups. Do not reinterpret a clarification as a new editing request. |
| Both mobile images | Long text bubbles, repeated voice explanations, unrelated suggestion chips and a large composer/footer consume much of the screen. | Shorten routine answers and interface copy, reduce repeated explanations, and improve mobile density while retaining readable controls. |

## 10. Natural language and complete business coverage

NL-01 — Accept everyday wording, abbreviations, common service aliases, punctuation differences, misspellings, spoken rambling and multilingual phrasing. “How much is boho braids?” should search relevant current-business service names, including compound names such as Boho / Knotless Braids when present. A missing exact string is not a reason to stop searching.

NL-02 — Resolve wording to real catalog records. Search broadly enough within the authorized business, rank plausible matches and return their actual names, prices, price ranges and relevant options. Do not blindly equate all Boho, Goddess, Mermaid, Box and Knotless services; they may be distinct records or variants. For an informational question, list plausible matches and their prices when useful. Ask a short clarification only when a meaningful distinction remains; a change or booking must use the intended specific record.

NL-03 — Preserve intent across follow-ups. “My photos” after a question about photo counts still means count the owner's saved business photos. “That service” should resolve from the active conversation. Changing pages should update context without erasing the question. The current page guides relevance but does not limit access to other authorized modules of the same business.

NL-04 — Answer first, then offer a relevant next action if helpful. Avoid long explanations of how the assistant works, speculation about why a previous answer was wrong, and questions asking the owner to supply facts already held by the platform. After a correction, reread authoritative data and acknowledge the corrected fact plainly.

NL-05 — Distinguish zero records, zero search matches, unavailable data and an unsuccessful lookup. A failed or empty tool response must not become “you have no services/photos/bookings” without evidence. Use concise error language with retry when a read fails. Never invent a price, count, policy or calculation to avoid admitting a failure.

DATA-01 — Connect the assistant to the same authoritative business records used by the dashboard, using authorized lookups on demand and maintained Girlz Culture product guidance. A responding model does not itself establish complete access to application data. The implementation needs an explicit inventory of reads, calculations and permitted actions for every module; do not rely on a static prompt containing a partial snapshot.

| Module | Required knowledge and representative outcomes |
| --- | --- |
| Overview | Today's activity, date/timezone, selected-period metrics, trends and clear explanations of how figures are calculated. |
| My Page | Current public/draft business details, contact information, hours, cover/profile media, walk-in status, policy and preparation text, public-page status. |
| Photos | Saved/uploaded/published counts with clear definitions, category counts, cover/logo versus gallery distinctions, captions and upload status. Do not double-count one asset used in multiple places without explaining the measure. |
| Styles & Pricing | All authorized service records and variants, alias matching, exact prices/ranges, durations, add-ons, deposits, categories and status. |
| Stylists | Staff profiles, assigned services, availability and other records permitted to the signed-in role. |
| Products | Catalog, stock, prices, fulfillment, orders and pickup records where available. |
| Availability & Calendar | Appointments, working hours, gaps, overrides, blocks, conflicts and business timezone. |
| Bookings | Counts/details/statuses for requested periods, permitted customer information, deposits and remaining balances. |
| Messages | Authorized business conversations and relevant context, summaries, drafts and existing approved messaging actions. |
| Reviews | This business's reviews, ratings and grounded summaries; existing permitted response actions. |
| Finances | Accurate service/product totals, discounts, collected deposits, balances, refunds, fees and payouts; consistent dates, currency and arithmetic. |
| Promotions | This business's offers, eligibility, selected services/groups, dates, actual savings, remaining balance and activation state. |
| Subscription | This business's plan, actual entitlements, billing status and payment-method management entry; appropriate masked payment details only. |
| Settings | Authorized account/business preferences, language, assistant appearance and available actions. |
| Girlz Culture guidance | Maintained platform explanations, navigation, features and policies, without disclosing or retrieving another business's information. |

DATA-02 — Use authoritative amounts/counts and reliable calculation code for arithmetic, percentages, financial rounding and date filters. Return the period and basis where relevant. Write actions retain review/confirmation as required and report success only after a verified save.

## 11. Strict separation between businesses

SCOPE-01 — The assistant serves the currently selected, authorized business only, plus general Girlz Culture platform guidance. It must refuse requests for information about another business, including publicly available profiles, prices, services, reviews or images. A public webpage is not an exception. Do not browse or query other businesses to satisfy such requests.

SCOPE-02 — Enforce that boundary in the application's server-side authorization and data access, not merely in conversational instructions. Derive the active business from the authenticated and authorized session. An owner-supplied prompt, URL or model-supplied business ID must not expand scope. Preserve staff-role permissions within the business as well.

SCOPE-03 — Apply the same boundary to searches, tools, file/media reads, aggregates, caches, conversation context, saved memory, exports and write actions. Only authorized current-business results should reach the model. Prevent other-business information from entering shared caches or reply suggestions.

SCOPE-04 — If the application allows a user to manage multiple businesses, a deliberate authorized business switch sets a new context; do not carry one business's facts or memory into the other. Asking the assistant to name or select Business B must not itself switch authorization.

SCOPE-05 — Verify direct requests, indirect comparisons, guessed record IDs and follow-up questions across two isolated test businesses. Confirm both refusal in the interface and rejection at data/tool boundaries. Preserve the explicit public-information restriction even if ordinary website visitors can view those profiles manually.

## 12. Business Policy redesign and save failure

POL-01 — Fix the reported unavailable/save/confirm/publish failure. Start from support reference 70ad1644-c08f-4a16-af76-014d9b58b0df and correlate the request/logs when implementation begins. Preserve the owner's draft during failures. A success message must correspond to a real save and, when requested, publication.

POL-02 — Replace the collection of refund/satisfaction, missed-appointment, late-arrival, guest and children dropdowns with one main text editor titled Business Policy. The founder's spoken instruction is for one coherent policy write-up; do not preserve the old form solely because one field lacks a drawn X.

POL-03 — Give optional writing guidance or an editable starting outline covering cancellation notice, missed appointments, late arrivals, rescheduling, guests/children and applicable refund/service concerns. The owner can write everything in normal language. Do not impose invented policy terms or populate public text without an intentional save.

POL-04 — Keep an optional Before your appointment text area, as expressly allowed. Fold additional business notes into the main write-up instead of retaining a separate large duplicate field.

POL-05 — Move walk-in acceptance to a Walk-ins welcome checkbox in My Page. Saving it displays/removes the corresponding label on the correct public business page. This label must not silently modify online appointment capacity or availability rules.

POL-06 — Publish a clear Business Policy link on the public business page. Link the applicable published policy from a required acknowledgement checkbox during booking before completion. Customers must be able to read it on mobile without losing their booking progress. Retain the policy version/reference associated with the acknowledgement rather than retrospectively changing what an existing booking agreed to.

POL-07 — Carry existing saved policy content into the new editor without loss. The interface simplification must not silently change already enforced deposit, cancellation or platform booking rules. Identify any structured settings the transaction engine still relies on and reconcile the published narrative with actual behavior as part of implementation.

POL-08 — Acceptance follows the full path: edit → save/review → publish → refresh → public policy link → booking acknowledgement, including a failed-save recovery. The owner must be able to preview exactly what customers will read.

## 13. Subscription payment-method correction

BILL-01 — The founder reports Subscription → Manage payment method shows an unavailable/support-reference error. It remains a reported functional failure, with no dedicated error screenshot supplied. Diagnose the actual subscription-billing flow rather than assuming the separate payout-account connection is the cause.

BILL-02 — Let the authorized business owner update the payment method attached to the correct existing subscription/billing customer. Do not create a new subscription, immediate purchase, upgrade, proration or payment merely to save a replacement method. Updating the card must not itself charge the owner.

BILL-03 — Reuse the secure Stripe integration for collecting/updating payment details. After return, show the updated masked/default method and persist it for the intended subsequent subscription payments. Do not put raw card details into application logs or the assistant conversation.

BILL-04 — Verify update and cancellation paths, persistence/default selection, correct business association and absence of an app-initiated charge from this action. Keep the existing subscription price, billing schedule and plan intact. Any independent existing invoice/payment behavior must be identified accurately; the card-edit flow must not promise that all future or unrelated charges cease.

## 14. Finances and promotions

FIN-01 — Rename Earnings & Payouts to Finances in navigation, headings, breadcrumbs, page search, assistant guidance and translated labels. Preserve route compatibility where useful. The deeper financial scope is now specified by the attached Software Value Build Spec, incorporated in section 17.

PROMO-01 — A promotion can target selected styles/services, a service group or the business's eligible services as a whole. Save the exact targets, percentage and applicable dates/conditions. Define how a business-wide scope applies to services versus products rather than extending it to subscriptions or unrelated payments automatically.

PROMO-02 — Show clear evidence of an active offer on the relevant public business/service views and through booking: original price, offer/discount, revised payable amount, unchanged required deposit and remaining balance. Keep owner promotion records, booking details, customer confirmation and Finances consistent. Expired/ineligible offers must not apply, and unrelated businesses/services must be unaffected.

PROMO-03 — The founder explicitly requires the booking deposit to remain unchanged; deduct the promotion's monetary saving from the remaining amount due. Do not apply the discount to, or automatically reduce/recalculate, the protected deposit. Do not stack a discount twice or generate a negative balance.

PROMO-04 — Percentage basis needs an explicit final rule. “20% off the service with an unchanged deposit” and “20% off only the remaining balance” produce different totals. The founder's message establishes deposit protection but does not finally settle that distinction. Record it for the final consolidated specification; do not silently choose a formula or interrupt the current intake with a question.

Illustration only: on a 100-unit service with a 10-unit deposit, 20% of the service price gives a 20-unit discount and a 70-unit balance after the unchanged deposit. Applying 20% only to the original 90-unit balance gives an 18-unit discount and a 72-unit balance. These are alternative interpretations, not approved production amounts.

PROMO-05 — Define rounding, eligibility, overlapping promotions, optional add-ons and discounts larger than the available balance against the real pricing engine before implementation. Never silently cut a protected deposit or advertise a saving the customer cannot receive. Verify the approved arithmetic and evidence from public offer through booking and Finances; no real charge is needed to record these requirements.

## 15. Conversational copy, avatars and mobile space

COPY-01 — Audit user-facing copy throughout the platform, especially GC Assistant. Replace mechanical phrases such as “Ask about your business, find an answer, or prepare a change. I will keep it conversational…” with short, natural, useful wording. Remove unnecessary self-description and repeated system-process explanations. Keep internal diagnostic detail available to support rather than filling ordinary screens with it.

COPY-02 — A concise greeting can identify the assistant and offer relevant help without claiming to be a human. Answer the owner's question directly; use a short list or detail view only when it helps. Preserve necessary transaction confirmations and understandable errors while removing the “AI” branding requested earlier.

AVATAR-01 — Replace the robot-only presentation with a choice of friendly illustrated/emoticon avatars: smiling men, smiling women and optional pets. A single default can be used initially, but the requested finished scope includes a small selectable set and a saved business preference. This is an in-product avatar selector, not a request to install a ChatGPT pet/plugin.

AVATAR-02 — Use the selected avatar consistently in the assistant launcher, header and messages on desktop and mobile. The avatar setting must stay within its business context. Provide descriptive accessible names and a sensible default.

MOB-08 — Review the supplied real mobile assistant captures for excessive header/footer/composer space, long low-information replies, repeated Read aloud explanations and irrelevant chips. Prioritize the conversation and practical controls. Preserve the user's ability to enlarge text and use assistive technology; do not solve crowding by making essential text tiny.

## 16. Consolidation status

All corrections from this batch are incorporated into the same record. They include functional failures, broader authorized business knowledge, strict business isolation, policy redesign/public acknowledgement, payment-method repair, promotion accounting, Finances naming, avatar choices and the wider copy/design direction.

The founder has now supplied the final change. All supplied requirements are included in this handoff. Existing release evidence does not mark the newly identified defects or redesign requirements as completed. The Software Value Build Spec and final public-site changes are incorporated below.

## 17. Software Value Build Spec — complete scope addition

Source: Pasted markdown(20260918-001704).md. The founder's accompanying instruction is to take note of this change because Finances must become more in-depth and the software must offer greater everyday value to businesses.

The source explicitly places all six parts in one build scope with nothing deferred. Record every capability below as required, not as a future wishlist. Implementation may sequence dependencies, but must not silently drop parts or describe a partial release as completing this specification. The receiving Codex session must implement and verify them; creation of this handoff itself has not built or released these features.

### 17.1 Product purpose and operating model

VALUE-01 — Girlz Culture should help the owner run the whole business, including activity originating outside the marketplace. The intended value is an invisible bookkeeper, a reliable client record, and an informed advisor in the owner's language. It must remain useful on days when customers come through walk-ins, repeat visits, phone calls or social media rather than a Girlz Culture booking.

VALUE-02 — The supplied specification requires deposits to route directly to the business, no Girlz Culture commission or Girlz Culture processing fee, and subscription charges as the money Girlz Culture collects for itself. Offline cash/card/transfer entries are records of payments handled outside the app, not instructions to charge customers.

Treat this as the requested operating model, not proof of the current payment architecture or of zero payment-provider fees. At implementation, map the existing Stripe and product/deposit flows to it. Distinguish fees charged by Girlz Culture from any underlying provider fees, and do not remove a functioning deposit integration or alter funds routing solely because the source says “does not process payments.” Stylist payout tracking below records obligations and payments; it does not authorize automatic money transfers.

VALUE-03 — Keep every screen, label, export and assistant reply available in EN/FR/ES/ZH, using the existing language preference and DeepL integration where appropriate. Include new modules, validation, empty/error states, PDFs, spreadsheets and customer communications. Preserve names, actual amounts, dates and service facts during translation. This adds to the existing four-language implementation; Wolof remains separately deferred as previously agreed.

### 17.2 Finance and accounting engine — source part 1

| Requirement | Captured capability and acceptance |
| --- | --- |
| FIN-02 — Automatic platform records | Capture service, agreed/listed price, actual deposit, stylist, customer, booking identity and date/time from platform bookings. Keep pending, paid, refunded, cancelled and completed states accurate. Repeated events must not duplicate a transaction. |
| FIN-03 — Fast walk-in/off-platform entry | Make service, price, stylist and payment method the minimal required fields; client name is optional. Use sensible editable date/time defaults. Entry must work in seconds on a phone or at the front desk. Record this source distinctly from platform bookings. |
| FIN-04 — Balance at the chair | From a platform booking, provide a one-tap or comparably short action to record the remaining balance and its payment method. Link it to the already-recorded deposit and service. This records a payment, without processing a new charge. |
| FIN-05 — Consistent transaction details | Store date, service/product, amount, deposit/balance/full-payment stage, cash/card/transfer method label, stylist where relevant and platform/walk-in/off-platform source. Preserve history and clear correction/refund links. |
| FIN-06 — Stylist reporting | Earnings for any requested day/week/month/period, clients served and top earner. State whether a number means gross service sales, earned compensation or cash already paid out. |
| FIN-07 — Business reporting | Daily/weekly/monthly/custom-period totals, cash/card/transfer breakdown, deposit and balance position, revenue by service, platform versus walk-in activity, busiest/slowest days and client counts across sources. |
| FIN-08 — Daily close and summaries | Provide an understandable end-of-day summary plus automatic weekly and monthly totals. Summarize from the same ledger used by screens, exports and assistant answers. Distinguish visits/transactions from distinct identified clients when walk-ins have no name. |
| FIN-09 — Commission arrangements | Owner configures a stylist's percentage and calculation basis. Compute earnings from eligible completed transactions; show earned, paid and outstanding amounts with a payout history. Define treatment of discounts, refunds and relevant amounts explicitly. |
| FIN-10 — Booth rent | Configure weekly/monthly rent; track rent owed and paid and the stylist retaining their service income. Do not automatically treat the stylist's full service sales as salon-owned revenue or a debt the salon owes them. |
| FIN-11 — Employee/flat arrangements | Record the agreed wage amount/period and other inputs required by that arrangement. Compute the amount due and record actual payments. A flat wage cannot be inferred from service turnover alone. Preserve arrangement history so later edits do not silently rewrite prior payouts. |
| FIN-12 — Deposit clarity | Clearly distinguish collected deposits, booked/unpaid balances and fully paid transactions, with a usable view of who still owes money at the chair. Money collected before a visit must not become an additional sale on top of that visit. |
| FIN-13 — Reports and exports | Monthly, quarterly and yearly income summaries, payment-method breakdowns, downloadable PDF and spreadsheet exports suitable for sharing with an accountant. Include consistent dates, currency, periods and totals in the selected language. Exports are organized records, not a claim that the app files or certifies tax returns. |
| FIN-14 — Owner-set deposits | Let businesses configure their deposit rate, including a higher rate above a service-price threshold. Source examples are 20% normally and 40% above $300; these are examples, not hardcoded rates. Calculate and snapshot the applicable terms for each booking. |
| FIN-15 — Owner-controlled access | Owner sees the business's complete finance view and decides whether a stylist sees only their own earnings or none, and what front-desk/staff roles may view and log. Enforce equivalent permissions in UI, assistant answers, exports and server operations. |

FIN-16 — Owner-set deposit rates extend the earlier fixed-deposit assumptions; they do not erase the instruction that a promotion must leave the applicable deposit unchanged. Use the business's applicable booking deposit rule and explicitly settle its price basis with the promotion formula. Existing booking amounts must not change retroactively when a rate is edited. Model the relationship between threshold rates and any no-show-related higher rate; do not accidentally apply both twice.

### 17.3 Financial reconciliation and definitions

FIN-17 — Correct the source document's closing shorthand before it becomes code. “Platform + walk-in + cash + deposits + product sales - expenses” combines overlapping categories. Source, payment method and payment stage are separate attributes of the same underlying transactions; adding all of them together would double-count money.

Illustration: a $100 service with a $20 deposit and an $80 cash balance has $100 of payments before any refunds, not $200 or $120. It can appear under its booking source, cash/payment-method breakdown and deposit/balance breakdown, but contributes once to the overall payment total. A deposit is a payment stage, not a payment method; it may itself have been paid by card or transfer. Daily summaries must label non-overlapping totals or clearly identify sub-breakdowns.

FIN-18 — Keep agreed sale value, completed service/product sales, cash received, unpaid balances, expenses and recorded profit distinct. Define each reporting period and calculation consistently. Discounts and refunds reduce the relevant amounts once; stylist compensation and recorded payouts must not count as the same expense twice. Inventory restock costs and the cost attributed to sold products need a consistent treatment to avoid deducting both twice.

FIN-19 — Show profit from recorded revenue and applicable recorded costs. If expenses or service costs are incomplete, make that limit visible and do not claim an exact margin or “most profitable service” without supporting cost data. Do not equate the highest revenue service with the most profitable. This is needed for trustworthy assistant advice as well as screens and exports.

### 17.4 Client history and formula cards — source part 2

CLIENT-01 — Maintain a business-specific client record containing past services/dates, exact service details or formula (color, size, length, technique and similar instructions), preferences, notes, allergies/sensitivities/cautions, photos of prior work and spend history. The owner's example includes medium waist-length box braids, approximately four hours, and a preference against excessive tightness.

CLIENT-02 — Make a returning client's history easy for the owner or an authorized relevant stylist to open before service. Apply owner-set permissions to fields, photos, assistant retrieval and updates. Support the required languages while preserving the meaning of formulas, numerical quantities and cautions. A shared customer identity must not expose another business's private formula card or notes.

### 17.5 GC Assistant as business advisor — source part 3

ADVISE-01 — Deepen the existing assistant; preserve its working language, memory and action functionality. Ground answers in this business's actual bookings, finances, staff, services, calendar, inventory and authorized client history. Every claim about a trend, profit opportunity or available capacity must have a real data basis and period.

ADVISE-02 — Provide proactive, specific suggestions: slow Tuesday afternoons; a genuinely profitable but underbooked service; own-business regulars absent for six weeks; uneven stylist utilization; open Thursday slots; and low stock before the weekend. Explain the relevant numbers briefly. Do not hardcode the sample “8%”, “6 clients” or “3 slots” as facts.

ADVISE-03 — Offer useful next steps such as preparing a promotion, featuring a service, drafting a rebooking message, suggesting a schedule adjustment or a restock action. Execute only the authorized/approved operation through the real workflow. Suggesting a message, purchase or reschedule is not evidence it was sent, bought or saved.

ADVISE-04 — Retain natural-language matching and follow-up continuity from sections 10–11. Be warm, concise and specific in each language, and explain genuine data limitations instead of providing generic advice or invented figures. Finance questions must respect staff-role access, not just business ownership.

### 17.6 Customer communication — source part 4

COMMS-01 — Maintain one shareable business booking link showing its page, services, prices, availability and booking/deposit flow. It should be usable in Instagram, TikTok, WhatsApp, Google and printed materials, with bookings feeding the same business record.

COMMS-02 — Create the two-way booking conversation automatically when a booking is made. Translate both directions through DeepL so business and customer each use their chosen language. Include automatic welcome messages, questions, confirmations and the stylist-substitution flow. The requested active window ends 24 hours after the appointment; define how rescheduling/cancellation affects that window and distinguish closing a chat from deleting its history.

COMMS-03 — Add automatic booking confirmation, day-before reminder, and post-visit thank-you/rebooking nudge in the customer's language. Respect actual booking status, timezones, delivery preferences and channel configuration; avoid duplicate or inappropriate reminders after cancellation/rescheduling.

COMMS-04 — Let the business send promotions/updates to its own eligible client list, translated to customer languages. Use the existing permissions and messaging consent/preferences, with clear recipient selection and send behavior. This requirement describes a product feature; it is not an instruction to send any real campaign during requirements capture.

COMMS-05 — Position this as retaining and rebooking customers served by the business. The source refers to a separate Booking Conversation document for fuller details; that document's full text is not present in this attachment. Record the dependency for consolidation without inventing its contents or dropping the specified chat capabilities.

### 17.7 No-show protection and waitlists — source part 5

NOSHOW-01 — Capture the requested customer no-show and late-cancellation history and support a higher deposit for repeat incidents. The source asks for a cross-platform history visible before booking confirmation. It does not specify the incident definitions, correction/dispute handling, visibility details or how the rule fits the existing instant-booking flow; these are concrete design points for the implementation specification.

NOSHOW-02 — Reconcile this new cross-platform request with the founder's earlier absolute restriction on an assistant using another business's information. Do not silently expose other-business bookings, identities or incidents. A possible design is a tightly limited platform-level eligibility indicator without other-business details, but that is a proposal requiring an explicit boundary decision, not an already-approved exception. Own-business history, platform-level indicators and another business's private records must remain distinguishable.

WAIT-01 — Provide a waitlist by service, stylist and requested time. When an eligible booking cancels, automatically offer the slot to suitable waitlisted clients. Implement offer expiry and atomic slot claiming so one cancellation cannot create multiple confirmed bookings. Keep the owner informed and preserve availability/conflict rules. Offering a slot must not silently charge or confirm every notified customer.

### 17.8 Inventory, product sales and expenses — source part 6

STOCK-01 — Track retail products (such as wigs, oils, edge control and accessories) and key business supplies, with appropriate quantities and configurable low-stock alerts. Make current stock and alerts available to the assistant. Reconcile logged sales, restocks and stock corrections without duplicating existing inventory deductions.

STOCK-02 — Log product sales into the same financial reporting model as services, preserving product identity, quantity, price, source and payment records. The owner can ask for product revenue over any supported period. Record payments handled outside the app as such; do not introduce an unintended new checkout or payment-processing scope.

EXPENSE-01 — Let the business log supplies, rent, restocks and other expenses with dates, amounts and useful categories. Feed these into expense breakdowns and recorded-profit reporting, subject to the reconciliation definitions above. The assistant must answer what was spent, the largest categories and profit for a requested period from actual records.

### 17.9 Completion evidence for the added scope

- Timed practical mobile/front-desk checks for walk-in and balance logging, with optional client name and required fields only.
- Reconciled example datasets covering platform bookings, walk-ins, deposits/balances, payment methods, service/product sales, discounts, refunds, expenses and profit; no duplicate counting.
- Correct commission, booth-rent and flat-arrangement calculations and payment history across the applicable period boundaries.
- Configurable deposit and price-threshold rules, protected promotion deposits and unchanged existing booking terms; verify actual deposit routing against the specified business model.
- Matching screen, PDF, spreadsheet and assistant totals; translations of new UI, exports and replies in EN/FR/ES/ZH.
- Owner/staff/stylist permission checks for finance, client cards, assistant tools and exports, including explicit cross-business denial.
- Client formula, preference, caution, photo and spend-history save/retrieval; grounded advisor examples tied to the underlying records.
- Booking chat, translation both ways, reminders, permitted client messaging and stylist-substitution behavior from the full conversation specification.
- No-show/deposit behavior after its visibility boundary is settled; waitlist offer and single-claim behavior without booking conflicts.
- Inventory alerts, product revenue, expense reporting and profit calculations, plus focused regression of existing booking, deposit, discovery, dashboard and assistant behavior.

All six parts remain in scope. Open calculation or access-policy decisions must be stated and resolved in the consolidated handoff, not converted into silent deferrals or unsupported completion claims.

## 18. Final customer-website instructions and visual specification

### 18.1 Routing, live availability and demo removal

PUBLIC-01 — Use the established project/domain girlzculture.com. Preserve the root landing page and its existing approved purpose; the founder explicitly likes the page currently reached there. Capture its current behavior before editing and ensure the requested marketplace changes do not overwrite or incorrectly redirect it.

PUBLIC-02 — /site-access must provide the complete working customer homepage/marketplace entry and access to its other public pages. It must not strand visitors in a demo-only presentation. Keep the customer navigation and Home destinations coherent with this entry. Inventory and preserve valid existing salon, style, booking and shared-business deep links instead of inventing an incompatible duplicate route tree.

PUBLIC-03 — Remove public demo/demonstration banners, demo-only labels, preview/demo disclaimers, sample-only notices and demo-specific restrictions on real booking actions from the production customer experience. Search all relevant components, route wrappers, translations, feature/configuration flags and cached production assets. Do not merely hide one banner on one viewport. This includes the visible top banner the founder explicitly says was missed earlier.

PUBLIC-04 — Make the public marketplace accessible and real eligible salons/services bookable. Follow an actual supported path through discovery, business profile, availability, policy acknowledgement, deposit and booking confirmation, using authorized verification methods. Buttons must not end in simulated success or a disabled demo flow. Preserve legitimate account requirements, business permissions, capacity checks, payment verification and booking protections; a public-site demo restriction is distinct from those controls.

PUBLIC-05 — Removing public demo notices does not authorize passing invented reviews, transactions, availability or synthetic sample businesses off as real. Reuse actual approved business content and eligibility. Keep the previously requested enriched demonstrations isolated from genuine customer operations; internal test/demo fixtures can remain labeled internally. Do not fabricate live financial or booking activity to make the redesign look populated.

### 18.2 Navigation and category placement

PUBLIC-06 — Primary customer navigation should expose Explore, For Businesses and How It Works, together with appropriate existing search, account and booking actions. Remove the standalone subscription Pricing item from the customer top-level navigation. Place Pricing inside For Businesses/the business center and link to a three-tier business subscription comparison using the actual current plans, entitlements and billing configuration. The founder's final instruction to nest pricing supersedes their earlier verbal hesitation. Preserve approved prices unless explicitly changed elsewhere; do not infer new prices from a mockup.

PUBLIC-07 — Provide a mobile hamburger menu with access to the same relevant navigation, including For Businesses → Pricing. Menus must work by touch and keyboard, close predictably and keep visible focus. Retain useful existing mobile bottom navigation where appropriate; do not copy an image's control if it lacks a real route/action.

PUBLIC-08 — Customer discovery is currently for the supported hair-salon category. Keep future-category information, applications and category waitlists inside For Businesses/the business center. Remove “More beauty categories coming soon” grids, category waitlist banners and join-waitlist prompts from the customer homepage and comparable customer discovery marketing areas. Do not offer booking for business categories that are not launched.

PUBLIC-09 — Preserve the appointment/cancellation waitlist specified in part 5 of the Software Value Build Spec. It is a separate operational feature from future-business-category applications; the request to remove homepage category waitlists does not cancel appointment waitlists.

### 18.3 What to adapt from the references

PUBLIC-10 — Preserve the existing public website's approved layout, sections, content and customer journeys while refining its appearance in teal, white and black. The website mockups are inspiration only, not a replacement design to reproduce. Interpret “glows” as polished contrast, clean surfaces, appealing component shapes, restrained depth and modern interaction. Do not rebuild or reorder whole public pages solely to match an image, replace the palette, import new slogans or add harsh glow effects. Apply the founder's separately specified functional and navigation corrections; this restraint on the public website does not reduce the full business-dashboard redesign scope.

PUBLIC-11 — Adapt the rounded/pill-shaped search bars and category controls, soft card corners, clear active tabs, compact header, balanced whitespace and prominent actions. Use a consistent radius/spacing/type system across desktop and mobile. Inputs should look like one intentional search experience, with location, query and submit clearly related. Keep labels readable and avoid oversized stacked bars consuming the mobile viewport.

PUBLIC-12 — Homepage reference (08_38_15), visual inspiration: a polished image-led hero, readable heading, rounded location/query/search control, clear actions and neatly shaped photo-led business cards. Mobile visual cues include wide rounded search, touch-friendly category controls and compact cards. Apply suitable component styling to the existing homepage; do not replace its hero, sections or ordering simply to copy the reference. Keep existing approved imagery/content unless a requested correction needs a change. Do not hardcode the sample New York location, copy invented counts or add every illustrated module.

PUBLIC-13 — Discovery/results reference (08_38_33), visual inspiration: rounded search, neat service chips, concise sorting and consistently shaped salon cards. Refine the existing discovery layout and controls; do not add a new map, sidebar or layout merely because one appears in the image. Where list/map functionality already exists, maintain and polish it. Display actual images, names, valid ratings/location/open status, tags and prices with clear profile/booking actions. Preserve working filters/location behavior and readable mobile results.

PUBLIC-14 — Public salon reference (08_38_47), visual inspiration: polished cover/profile imagery, a clear business identity, compact tabs and rounded service/staff/gallery cards. The illustration places booking alongside desktop content and uses an accessible mobile Book action; these demonstrate clarity and component treatment rather than requiring wholesale replacement of the existing public profile. Improve the existing profile and booking controls while preserving its approved content and flow, conflict/availability/payment rules and required stylist/options. Implement the requested Business Policy link and acknowledgement and display only supported verification/rating claims.

PUBLIC-15 — Mockups are visual references, not copy or fact specifications. The founder rejects the displayed “Easy online booking”, “Secure & reliable”, “A community that uplifts” promotional blocks and “Confidence looks good on you” wording. Do not import these or other unwanted sample slogans merely because they appear in the image, including text baked into a replacement image. Preserve approved site wording except for requested navigation/copy corrections. Never copy illustrative claims such as 10K+ salons, 250K+ clients, sample ratings, background checks, health-standard certification or free rescheduling without actual support.

PUBLIC-16 — Desktop and mobile each require intentional layouts. Verify the new component shapes, tabs, search, cards, menus and booking controls at representative narrow phone, wider phone, tablet and desktop sizes, with translated labels and mobile keyboard behavior. Avoid horizontal page overflow, clipped text, hidden primary actions and decorative controls that do not work.

PUBLIC-17 — Verify demo removal and public routing on the deployed production site, not only a local build or preview. Confirm the published deployment/source identity; check the root landing, /site-access, connected public pages and representative business/booking deep links after refresh and direct navigation. Account for service-worker/CDN/browser caching in the existing app. Save desktop and mobile screenshots showing the correct production UI and absence of demo presentation.

### 18.4 Owner-page coverage register

These checks apply to all the detailed requirements under each page in section 4 and the related functional scope elsewhere. A heading present in the sidebar does not complete the page.

| ID | Page | Required coverage |
| --- | --- | --- |
| PAGE-01 | Overview | Personalized welcome/date, useful summaries and metrics, schedule/trends where data supports them, page health, quick actions, status and responsive assistant layout. |
| PAGE-02 | My Page | Cover/profile editing, tabbed content, correct public synchronization, policies/preparation, walk-ins and mobile More. |
| PAGE-03 | Photos | Visible categorized gallery, selected-category upload, title/caption editing, cover/logo controls, ordering/status/retry and mobile flow. |
| PAGE-04 | Styles & Pricing | Rich service organization/cards/table, actual images and prices, featured/popular distinction, filters, service management and accessible secondary import/export. |
| PAGE-05 | Stylists | Consistent staff cards, assignments and schedules, permissions, payout-arrangement configuration and usable details. |
| PAGE-06 | Products | Catalog, stock/supplies, images, relevant orders/pickups, alerts, sales records and integration with Finances. |
| PAGE-07 | Availability & Calendar | Calendar-first layout, staff selection, labeled colors, availability/blocks/actions, mobile controls, conflicts and reliable saving. |
| PAGE-08 | Bookings | Filters, useful desktop/mobile records, correct statuses/prices/deposits, manual/walk-in capture where appropriate and client-history access. |
| PAGE-09 | Messages | Inbox/conversation layout, booking/customer context, translation, approved reply/send flows, reminders and client communications. |
| PAGE-10 | Reviews | Real summaries and filters, review/detail/response management and contextual assistant behavior. |
| PAGE-11 | Finances | Every finance, payout-arrangement, expense, deposit, product-sale, reporting, export and permission requirement from sections 14 and 17. |
| PAGE-12 | Promotions | Real targets, draft/preview/activation, eligibility/dates, public evidence and approved deposit-preserving calculations. |
| PAGE-13 | Subscription | Plan/entitlement information, repaired payment-method management and unchanged billing for a method-only update. |
| PAGE-14 | Settings | Existing account/business preferences, language and relevant assistant-avatar controls, clear forms and appropriate permissions. |

The new client-history, communication, no-show and waitlist capabilities must be placed coherently within the navigation/workflows. Their absence from an older reference sidebar is not permission to omit them.

## 19. Execution instructions, unresolved decisions and release proof

EXEC-01 — Start by reading project instructions and inspecting the current repository, open changes, current main, migrations, routes, connected services and deployment state. Work in an isolated branch/worktree as appropriate. Preserve unrelated user work. Use the existing Girlz Culture GitHub/Netlify/database connections and secrets securely; never ask the founder to paste keys into chat or print secret values.

The previously reported release was source d37cbf4ef3954063797946b7508352470653a739, deployment 6aac503fa5eacb00089c6d87, after the opt-in-memory migration 20260917185913. DeepL migration 20260916204952 was already applied once. These are historical context, not a new live-state verification: inspect the actual current state before acting. Do not reapply old migrations or reopen completed PRs as if they were pending.

EXEC-02 — Build a requirement-to-code-and-evidence map from section 20 before editing. Inventory existing functions, distinguish defects from missing capability, and implement the full specified scope. Treat each checklist row as all of its detailed clauses, including interactions, responsive behavior, translations, failure states and data rules. Do not reduce the request to a theme update or mark a backend feature done solely because a button exists.

EXEC-03 — Resolve the two material business-rule decisions in one concise batch after inspecting the current implementation and preparing concrete alternatives: (1) the percentage-promotion basis while preserving the applicable business-set deposit, and (2) the visibility boundary for cross-platform no-show signals alongside the strict no-other-business-information rule. Do not silently choose a money formula, leak another business's records, remove cross-platform protection from scope or hold unrelated work while these decisions are pending. Show actual numerical examples and exact proposed visibility, not an open-ended design questionnaire.

EXEC-04 — Use working authorized sessions across related checks. Do not repeatedly request owner, staff, admin or customer logins without a demonstrated missing permission/session need; never use an owner's privileges to simulate a restricted user's authorization. The founder already completed the customer-account check. Use fixtures/test roles and existing evidence where suitable. Request a secure sign-in only when actually necessary for a concrete remaining check.

EXEC-05 — Keep existing OpenAI/DeepL integrations, four supported assistant languages, opt-in memory, calendar conflict/preview safeguards, public-profile data and financial records intact while extending them. Do not select a different model, increase caps, reset authentication or rewrite core integrations as a shortcut. Any required underlying change must address an observed implementation need and receive proportionate verification.

EXEC-06 — Reuse real content across the reported 25 businesses and prepare the requested three-to-five richer demonstrations without overwriting live identity or inventing real transactions/reviews. Verify the inventory first. Keep public, bookable records and isolated synthetic examples distinguishable internally while removing the general production-site demo presentation as required.

EXEC-07 — Use focused tests and direct visual review for changed behavior, then satisfy the repository's actual required CI/release gates. Avoid repeated unchanged full-suite/provider reruns. Investigate failures from logs and reproducible evidence, fix the cause or explain the genuine infrastructure issue, and rerun the relevant check for a reason. Do not weaken assertions, skip failing coverage or claim success from an unrelated passing workflow.

EXEC-08 — Verify live provider functionality with the minimum sufficient authenticated checks for changed tool/data paths, reusing valid unchanged evidence. Provider success alone does not prove the assistant knows every module. Include natural-language service queries, photo-count follow-ups, real permitted reads/calculations, translation, action review/save and explicit forbidden cross-business requests. Respect the existing $25 caps and clean up authorized test data.

EXEC-09 — Inspect all attached reference images and review visual results across owner and customer pages at matched mobile/desktop sizes. For the business dashboard, compare layout, hierarchy, tabs, cards, imagery, assistant placement and interaction closely with the reference designs. For the public website, compare before/after against the existing approved site: preserve its structure/content and brand while showing selective component polish inspired by the website images. Do not judge public-site completion by whether it copies a mockup. Use written descriptions only for missing references, and provide before/after implementation screenshots as evidence.

EXEC-10 — Prepare backward-compatible data changes where necessary, preserve existing business/policy/payment history, and apply only reviewed pending migrations through the actual protected workflow. Merge through the repository's required checks and deploy through the existing Netlify release process using the authorization already available. Preserve a viable rollback and publication controls. If a real control requires additional explicit approval, identify the exact prepared migration or release action and the source of that requirement; do not invent a new blanket approval ceremony.

EXEC-11 — Verify the actual production deployment and relevant routes/actions after publication. Record deployment ID, source commit, migration outcome and public behavior. A merged PR or green build is not a statement that customers are seeing the new release. The final public demo-banner/routing checks in PUBLIC-17 are mandatory and must have their own production evidence.

EXEC-12 — Deliver a final report mapping every requirement to implementation and verification evidence. Use Completed/Verified, Implemented/Not verified, Needs decision or Blocked with the exact reason. No silent omissions, invented passes or “all done” while rows remain unresolved. Include what is live, remaining exceptions, links to the relevant PR/workflows, exact deployment/commit and rollback. Distinguish historical evidence from new checks and partial releases from full-scope completion.

## 20. Complete requirement checklist

Codex must maintain this checklist through implementation. Every row refers to the full definition and associated detailed acceptance criteria above; short labels are an index, not a reduced scope. The initial status is Not verified because this handoff records requirements rather than inspecting the receiving Codex session's implementation. For completion, replace each status with a truthful outcome and link to files/tests/screenshots/live evidence as appropriate. Check all clauses within each row, not just the opening sentence.

<!-- REQUIREMENT_CHECKLIST_START -->

Total: **140 individually tracked requirements**, covering the detailed clauses above.

| ID | Requirement index | Status | Evidence / remaining work |
| --- | --- | --- | --- |
| UI-01 | Apply a coherent redesign to all 14 owner navigation sections: Overview, My Page, Photos, Styles & Pricing, Stylists, Products, Availability & Calendar,… | Not verified | — |
| UI-02 | Match the references' layout and visual hierarchy: compact header, recognizable navigation, useful page headings, organized cards, imagery, clear actions,… | Not verified | — |
| UI-03 | Reduce the stacked header, assistant-button strip, breadcrumb/search strip, and oversized route cards that push actual work down the page. | Not verified | — |
| UI-04 | Preserve existing functions, data, validation, permissions, and save/publish behavior while changing their presentation | Not verified | — |
| UI-05 | Use plain business language | Not verified | — |
| UI-06 | Design loading, empty, error, and populated states deliberately. | Not verified | — |
| UI-07 | Extend the founder's modern, bright, colorful, conversational and interactive design direction and plain-language copy review across the main website and… | Not verified | — |
| MOB-01 | Keep every necessary feature accessible on mobile, using compact cards, lists, tabs, and menus suitable for touch. | Not verified | — |
| MOB-02 | Keep a clearly labeled GC Assistant icon/button near the top on every owner page | Not verified | — |
| MOB-03 | Use shorter My Page labels: Info, Services, Location, More | Not verified | — |
| MOB-04 | More exposes Amenities & Policies, Social & Links, and other overflow content | Not verified | — |
| MOB-05 | Actions that do not fit, including calendar availability/full-day actions, go in an accessible three-line/menu or More control | Not verified | — |
| MOB-06 | Mobile photo uploads inherit the selected category and allow titles/captions and editing. | Not verified | — |
| MOB-07 | Match the references' compact navigation and content hierarchy, including the mobile bottom navigation where appropriate | Not verified | — |
| GC-01 | On desktop, show the assistant alongside the workspace by default on every owner page. | Not verified | — |
| GC-02 | Provide X to close and an obvious way to reopen. | Not verified | — |
| GC-03 | On mobile, show the top entry button; open only on tap. | Not verified | — |
| GC-04 | Use “GC Assistant” and “Your business co-pilot.” Remove “AI” and generic “Ask about…” phrasing from assistant-facing labels and copy. | Not verified | — |
| GC-05 | Keep voice interaction and read-aloud controls understandable and compact. | Not verified | — |
| GC-06 | Update assistant context to the current page and business | Not verified | — |
| GC-07 | Retrieve relevant authorized business facts when needed and preserve language preferences. | Not verified | — |
| GC-08 | Keep changes reviewable and verify actual outcomes through existing tools/permissions. | Not verified | — |
| GC-09 | Retain the existing consent-based memory behavior. | Not verified | — |
| CHAT-01 | Immediately insert submitted messages, clear the composer, and show a separate assistant loading state; implement and verify every interaction below. | Not verified | — |
| NL-01 | Accept everyday wording, abbreviations, common service aliases, punctuation differences, misspellings, spoken rambling and multilingual phrasing | Not verified | — |
| NL-02 | Resolve wording to real catalog records | Not verified | — |
| NL-03 | Preserve intent across follow-ups | Not verified | — |
| NL-04 | Answer first, then offer a relevant next action if helpful | Not verified | — |
| NL-05 | Distinguish zero records, zero search matches, unavailable data and an unsuccessful lookup | Not verified | — |
| DATA-01 | Connect the assistant to the same authoritative business records used by the dashboard, using authorized lookups on demand and maintained Girlz Culture… | Not verified | — |
| DATA-02 | Use authoritative amounts/counts and reliable calculation code for arithmetic, percentages, financial rounding and date filters | Not verified | — |
| SCOPE-01 | The assistant serves the currently selected, authorized business only, plus general Girlz Culture platform guidance | Not verified | — |
| SCOPE-02 | Enforce that boundary in the application's server-side authorization and data access, not merely in conversational instructions | Not verified | — |
| SCOPE-03 | Apply the same boundary to searches, tools, file/media reads, aggregates, caches, conversation context, saved memory, exports and write actions | Not verified | — |
| SCOPE-04 | If the application allows a user to manage multiple businesses, a deliberate authorized business switch sets a new context; do not carry one business's… | Not verified | — |
| SCOPE-05 | Verify direct requests, indirect comparisons, guessed record IDs and follow-up questions across two isolated test businesses | Not verified | — |
| POL-01 | Fix the reported unavailable/save/confirm/publish failure | Not verified | — |
| POL-02 | Replace the collection of refund/satisfaction, missed-appointment, late-arrival, guest and children dropdowns with one main text editor titled Business Policy | Not verified | — |
| POL-03 | Give optional writing guidance or an editable starting outline covering cancellation notice, missed appointments, late arrivals, rescheduling,… | Not verified | — |
| POL-04 | Keep an optional Before your appointment text area, as expressly allowed | Not verified | — |
| POL-05 | Move walk-in acceptance to a Walk-ins welcome checkbox in My Page | Not verified | — |
| POL-06 | Publish a clear Business Policy link on the public business page | Not verified | — |
| POL-07 | Carry existing saved policy content into the new editor without loss | Not verified | — |
| POL-08 | Acceptance follows the full path: edit → save/review → publish → refresh → public policy link → booking acknowledgement, including a failed-save recovery | Not verified | — |
| BILL-01 | The founder reports Subscription → Manage payment method shows an unavailable/support-reference error | Not verified | — |
| BILL-02 | Let the authorized business owner update the payment method attached to the correct existing subscription/billing customer | Not verified | — |
| BILL-03 | Reuse the secure Stripe integration for collecting/updating payment details | Not verified | — |
| BILL-04 | Verify update and cancellation paths, persistence/default selection, correct business association and absence of an app-initiated charge from this action | Not verified | — |
| FIN-01 | Rename Earnings & Payouts to Finances in navigation, headings, breadcrumbs, page search, assistant guidance and translated labels | Not verified | — |
| PROMO-01 | A promotion can target selected styles/services, a service group or the business's eligible services as a whole | Not verified | — |
| PROMO-02 | Show clear evidence of an active offer on the relevant public business/service views and through booking: original price, offer/discount, revised payable… | Not verified | — |
| PROMO-03 | The founder explicitly requires the booking deposit to remain unchanged; deduct the promotion's monetary saving from the remaining amount due | Not verified | — |
| PROMO-04 | Percentage basis needs an explicit final rule | Not verified | — |
| PROMO-05 | Define rounding, eligibility, overlapping promotions, optional add-ons and discounts larger than the available balance against the real pricing engine… | Not verified | — |
| COPY-01 | Audit user-facing copy throughout the platform, especially GC Assistant | Not verified | — |
| COPY-02 | A concise greeting can identify the assistant and offer relevant help without claiming to be a human | Not verified | — |
| AVATAR-01 | Replace the robot-only presentation with a choice of friendly illustrated/emoticon avatars: smiling men, smiling women and optional pets | Not verified | — |
| AVATAR-02 | Use the selected avatar consistently in the assistant launcher, header and messages on desktop and mobile | Not verified | — |
| MOB-08 | Review the supplied real mobile assistant captures for excessive header/footer/composer space, long low-information replies, repeated Read aloud… | Not verified | — |
| VALUE-01 | Girlz Culture should help the owner run the whole business, including activity originating outside the marketplace | Not verified | — |
| VALUE-02 | The supplied specification requires deposits to route directly to the business, no Girlz Culture commission or Girlz Culture processing fee, and… | Not verified | — |
| VALUE-03 | Keep every screen, label, export and assistant reply available in EN/FR/ES/ZH, using the existing language preference and DeepL integration where appropriate | Not verified | — |
| FIN-02 | Automatic platform records: Capture service, agreed/listed price, actual deposit, stylist, customer, booking identity and date/time from platform bookings | Not verified | — |
| FIN-03 | Fast walk-in/off-platform entry: Make service, price, stylist and payment method the minimal required fields; client name is optional | Not verified | — |
| FIN-04 | Balance at the chair: From a platform booking, provide a one-tap or comparably short action to record the remaining balance and its payment method | Not verified | — |
| FIN-05 | Consistent transaction details: Store date, service/product, amount, deposit/balance/full-payment stage, cash/card/transfer method label, stylist where… | Not verified | — |
| FIN-06 | Stylist reporting: Earnings for any requested day/week/month/period, clients served and top earner | Not verified | — |
| FIN-07 | Business reporting: Daily/weekly/monthly/custom-period totals, cash/card/transfer breakdown, deposit and balance position, revenue by service, platform… | Not verified | — |
| FIN-08 | Daily close and summaries: Provide an understandable end-of-day summary plus automatic weekly and monthly totals | Not verified | — |
| FIN-09 | Commission arrangements: Owner configures a stylist's percentage and calculation basis | Not verified | — |
| FIN-10 | Booth rent: Configure weekly/monthly rent; track rent owed and paid and the stylist retaining their service income | Not verified | — |
| FIN-11 | Employee/flat arrangements: Record the agreed wage amount/period and other inputs required by that arrangement | Not verified | — |
| FIN-12 | Deposit clarity: Clearly distinguish collected deposits, booked/unpaid balances and fully paid transactions, with a usable view of who still owes money at… | Not verified | — |
| FIN-13 | Reports and exports: Monthly, quarterly and yearly income summaries, payment-method breakdowns, downloadable PDF and spreadsheet exports suitable for… | Not verified | — |
| FIN-14 | Owner-set deposits: Let businesses configure their deposit rate, including a higher rate above a service-price threshold | Not verified | — |
| FIN-15 | Owner-controlled access: Owner sees the business's complete finance view and decides whether a stylist sees only their own earnings or none, and what… | Not verified | — |
| FIN-16 | Owner-set deposit rates extend the earlier fixed-deposit assumptions; they do not erase the instruction that a promotion must leave the applicable deposit… | Not verified | — |
| FIN-17 | Correct the source document's closing shorthand before it becomes code | Not verified | — |
| FIN-18 | Keep agreed sale value, completed service/product sales, cash received, unpaid balances, expenses and recorded profit distinct | Not verified | — |
| FIN-19 | Show profit from recorded revenue and applicable recorded costs | Not verified | — |
| CLIENT-01 | Maintain a business-specific client record containing past services/dates, exact service details or formula (color, size, length, technique and similar… | Not verified | — |
| CLIENT-02 | Make a returning client's history easy for the owner or an authorized relevant stylist to open before service | Not verified | — |
| ADVISE-01 | Deepen the existing assistant; preserve its working language, memory and action functionality | Not verified | — |
| ADVISE-02 | Provide proactive, specific suggestions: slow Tuesday afternoons; a genuinely profitable but underbooked service; own-business regulars absent for six… | Not verified | — |
| ADVISE-03 | Offer useful next steps such as preparing a promotion, featuring a service, drafting a rebooking message, suggesting a schedule adjustment or a restock action | Not verified | — |
| ADVISE-04 | Retain natural-language matching and follow-up continuity from sections 10–11 | Not verified | — |
| COMMS-01 | Maintain one shareable business booking link showing its page, services, prices, availability and booking/deposit flow | Not verified | — |
| COMMS-02 | Create the two-way booking conversation automatically when a booking is made | Not verified | — |
| COMMS-03 | Add automatic booking confirmation, day-before reminder, and post-visit thank-you/rebooking nudge in the customer's language | Not verified | — |
| COMMS-04 | Let the business send promotions/updates to its own eligible client list, translated to customer languages | Not verified | — |
| COMMS-05 | Position this as retaining and rebooking customers served by the business | Not verified | — |
| NOSHOW-01 | Capture the requested customer no-show and late-cancellation history and support a higher deposit for repeat incidents | Not verified | — |
| NOSHOW-02 | Reconcile this new cross-platform request with the founder's earlier absolute restriction on an assistant using another business's information | Not verified | — |
| WAIT-01 | Provide a waitlist by service, stylist and requested time | Not verified | — |
| STOCK-01 | Track retail products (such as wigs, oils, edge control and accessories) and key business supplies, with appropriate quantities and configurable low-stock… | Not verified | — |
| STOCK-02 | Log product sales into the same financial reporting model as services, preserving product identity, quantity, price, source and payment records | Not verified | — |
| EXPENSE-01 | Let the business log supplies, rent, restocks and other expenses with dates, amounts and useful categories | Not verified | — |
| PUBLIC-01 | Use the established project/domain girlzculture.com | Not verified | — |
| PUBLIC-02 | /site-access must provide the complete working customer homepage/marketplace entry and access to its other public pages | Not verified | — |
| PUBLIC-03 | Remove public demo/demonstration banners, demo-only labels, preview/demo disclaimers, sample-only notices and demo-specific restrictions on real booking… | Not verified | — |
| PUBLIC-04 | Make the public marketplace accessible and real eligible salons/services bookable | Not verified | — |
| PUBLIC-05 | Removing public demo notices does not authorize passing invented reviews, transactions, availability or synthetic sample businesses off as real | Not verified | — |
| PUBLIC-06 | Primary customer navigation should expose Explore, For Businesses and How It Works, together with appropriate existing search, account and booking actions | Not verified | — |
| PUBLIC-07 | Provide a mobile hamburger menu with access to the same relevant navigation, including For Businesses → Pricing | Not verified | — |
| PUBLIC-08 | Customer discovery is currently for the supported hair-salon category | Not verified | — |
| PUBLIC-09 | Preserve the appointment/cancellation waitlist specified in part 5 of the Software Value Build Spec | Not verified | — |
| PUBLIC-10 | Preserve the existing public website's layout, content and journeys; use reference images only for visual inspiration in teal, white and black | Not verified | — |
| PUBLIC-11 | Adapt the rounded/pill-shaped search bars and category controls, soft card corners, clear active tabs, compact header, balanced whitespace and prominent actions | Not verified | — |
| PUBLIC-12 | Homepage reference (08_38_15): polished image-led hero, strong readable heading, rounded desktop location/query/search control, clear booking/business… | Not verified | — |
| PUBLIC-13 | Discovery/results reference (08_38_33): rounded combined desktop search, service chips with small images, compact result count and sorting, consistent salon… | Not verified | — |
| PUBLIC-14 | Public salon reference (08_38_47): wide cover photograph, overlapping business logo, strong business name, concise location/hours/rating information,… | Not verified | — |
| PUBLIC-15 | Mockups are visual references, not copy or fact specifications | Not verified | — |
| PUBLIC-16 | Desktop and mobile each require intentional layouts | Not verified | — |
| PUBLIC-17 | Verify demo removal and public routing on the deployed production site, not only a local build or preview | Not verified | — |
| PAGE-01 | Overview: Personalized welcome/date, useful summaries and metrics, schedule/trends where data supports them, page health, quick actions, status and… | Not verified | — |
| PAGE-02 | My Page: Cover/profile editing, tabbed content, correct public synchronization, policies/preparation, walk-ins and mobile More. | Not verified | — |
| PAGE-03 | Photos: Visible categorized gallery, selected-category upload, title/caption editing, cover/logo controls, ordering/status/retry and mobile flow. | Not verified | — |
| PAGE-04 | Styles & Pricing: Rich service organization/cards/table, actual images and prices, featured/popular distinction, filters, service management and accessible… | Not verified | — |
| PAGE-05 | Stylists: Consistent staff cards, assignments and schedules, permissions, payout-arrangement configuration and usable details. | Not verified | — |
| PAGE-06 | Products: Catalog, stock/supplies, images, relevant orders/pickups, alerts, sales records and integration with Finances. | Not verified | — |
| PAGE-07 | Availability & Calendar: Calendar-first layout, staff selection, labeled colors, availability/blocks/actions, mobile controls, conflicts and reliable saving. | Not verified | — |
| PAGE-08 | Bookings: Filters, useful desktop/mobile records, correct statuses/prices/deposits, manual/walk-in capture where appropriate and client-history access. | Not verified | — |
| PAGE-09 | Messages: Inbox/conversation layout, booking/customer context, translation, approved reply/send flows, reminders and client communications. | Not verified | — |
| PAGE-10 | Reviews: Real summaries and filters, review/detail/response management and contextual assistant behavior. | Not verified | — |
| PAGE-11 | Finances: Every finance, payout-arrangement, expense, deposit, product-sale, reporting, export and permission requirement from sections 14 and 17. | Not verified | — |
| PAGE-12 | Promotions: Real targets, draft/preview/activation, eligibility/dates, public evidence and approved deposit-preserving calculations. | Not verified | — |
| PAGE-13 | Subscription: Plan/entitlement information, repaired payment-method management and unchanged billing for a method-only update. | Not verified | — |
| PAGE-14 | Settings: Existing account/business preferences, language and relevant assistant-avatar controls, clear forms and appropriate permissions. | Not verified | — |
| EXEC-01 | Start by reading project instructions and inspecting the current repository, open changes, current main, migrations, routes, connected services and… | Not verified | — |
| EXEC-02 | Build a requirement-to-code-and-evidence map from section 20 before editing | Not verified | — |
| EXEC-03 | Resolve the two material business-rule decisions in one concise batch after inspecting the current implementation and preparing concrete alternatives: (1)… | Not verified | — |
| EXEC-04 | Use working authorized sessions across related checks | Not verified | — |
| EXEC-05 | Keep existing OpenAI/DeepL integrations, four supported assistant languages, opt-in memory, calendar conflict/preview safeguards, public-profile data and… | Not verified | — |
| EXEC-06 | Reuse real content across the reported 25 businesses and prepare the requested three-to-five richer demonstrations without overwriting live identity or… | Not verified | — |
| EXEC-07 | Use focused tests and direct visual review for changed behavior, then satisfy the repository's actual required CI/release gates | Not verified | — |
| EXEC-08 | Verify live provider functionality with the minimum sufficient authenticated checks for changed tool/data paths, reusing valid unchanged evidence | Not verified | — |
| EXEC-09 | Inspect attached images; follow dashboard references closely and verify selective website polish against its existing design | Not verified | — |
| EXEC-10 | Prepare backward-compatible data changes where necessary, preserve existing business/policy/payment history, and apply only reviewed pending migrations… | Not verified | — |
| EXEC-11 | Verify the actual production deployment and relevant routes/actions after publication | Not verified | — |
| EXEC-12 | Deliver a final report mapping every requirement to implementation and verification evidence | Not verified | — |

<!-- REQUIREMENT_CHECKLIST_END -->
