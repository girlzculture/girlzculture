Complete the existing Girlz Culture implementation urgently. My time and credit expenditure are serious constraints. I need a complete, working release, with every approved requirement accounted for.

Work extremely fast through disciplined implementation, early verification and efficient use of existing evidence. Preserve the required quality standard. Repeated unexplained failures, partial features and lengthy verification cycles without a concrete result are unacceptable.

1. Continue the existing work and establish the actual remaining scope.

Preserve the current workspace, uncommitted changes, branch and PR #80. Check the latest state before acting.

Use the existing founder handoffs, screenshots, requirements tracker, SOFTWARE-FIRST-MAP.md and acceptance records as the authoritative specification. This instruction strengthens execution; it does not replace or reduce that specification.

Identify which approved requirements are complete, which need implementation, which need verification and which genuinely depend on something I must configure. Use the existing tracker. Do not spend another cycle creating a new planning system.

Give me a short factual status, then continue working. Do not stop after reporting or ask whether to proceed with already approved work.

2. Pause Stripe work.

Record: “Founder-directed pause—remaining Stripe configuration and live provider acceptance will be handled separately.”

Stop further Stripe troubleshooting, live provider testing, configuration changes and repeated credential requests. Preserve existing billing functionality, records, subscriptions, completed code and payment protections.

Give me precise instructions for configuration I can complete myself. Keep any necessary unchanged billing regression checks, but do not make deferred Stripe acceptance a blanket blocker for unrelated work.

If a change genuinely depends on unfinished Stripe work, identify the exact dependency and isolate it safely. Do not delete working functionality or silently claim the payment integration is complete.

3. Diagnose failures before repeating expensive workflows.

The last inspected release run, 35466416770, included:

- Seven inbox tests failing with “useLayoutEffect is not a function” in tests/p0-inbox-session.test.mjs.
- A WebKit failure in tests/browser/business-marketing.spec.ts because the expected invalid promotion-time alert did not appear.

Check whether subsequent work has already resolved these before repeating anything.

For each remaining failure, establish whether it comes from application code, the test setup, configuration, data or infrastructure. Inspect the relevant logs and trace, reproduce the smallest meaningful case, correct the cause and verify the correction.

For the inbox issue, preserve account isolation, sign-out handling, translation behavior and protection of newer drafts.

For the promotion issue, preserve rejection of nonexistent and ambiguous daylight-saving times, retention of the entered value and prevention of an invalid save.

Do not remove assertions, mark failures skipped, use meaningless mocks or increase timeouts simply to obtain a pass. Retry an unchanged workflow only when evidence identifies a transient failure and supports that retry.

4. Check the complete connection before implementing each remaining feature.

Before editing, trace the existing path from the interface through authorization, request handling, validation, storage, provider dependencies and the final displayed result.

Check the relevant field names, request and response formats, business ownership, environment configuration and migration requirements together. Resolve incompatible assumptions before running a long release workflow.

Use existing working services and components where appropriate. Avoid introducing a second implementation of functionality that already exists.

This is the standard I mean by configuring it correctly: the entire feature must work from beginning to end and remain usable afterward.

5. Finish the complete approved dashboard and public-interface work.

Cover every approved section: Overview, My Page, Photos, Styles & Pricing, Stylists, Products, Availability & Calendar, Bookings, Messages, Reviews, Finances, Promotions, Subscription and Settings, with Stripe-dependent acceptance separated as instructed.

Follow the reference screenshots and detailed handoff. Finish the layouts, tabs, actions, forms and mobile behavior. Keep teal, white and black. Do not treat changes to fonts and colors as completion of the redesign.

Verify cover/profile editing, categorized uploads and photo titles, service presentation, staff/calendar interactions, bookings, messaging, policy editing, financial views and promotion behavior.

Use compact tabs that display their content directly. Check small screens, overflow menus, text wrapping, keyboard interaction and assistant placement. Preserve the public website’s identity while applying the approved improvements.

Complete approved onboarding, imports, Morning Brief, marketing, referrals, voice/actions and business-advice requirements wherever they remain unfinished. Do not silently drop them because they are absent from this shortened list.

6. Make the GC Assistant useful with the business’s real information.

Complete the approved “invisible employee” behavior. It must understand ordinary wording, spelling variations, relevant service aliases and follow-up questions.

Verify that:

- “Boho braids” finds relevant configured services without demanding an exact label.
- Photo questions return actual counts.
- Prices, durations, bookings and calculations come from authoritative business data.
- Page context improves assistance without restricting access to other authorized information belonging to that business.
- A submitted message appears immediately in the conversation, and the composer clears while the response is pending.
- Language preference and conversational context behave correctly.
- Approved actions complete through the existing authorization and confirmation process.
- Errors receive a useful, recoverable response without falsely claiming success.

Use natural, concise language and the approved assistant presentation. Preserve strict separation between businesses. An owner’s assistant must not retrieve or disclose another business’s information, including its public information.

7. Verify complete business journeys.

For changed functionality, verify input, authorization, validation, processing, persistence, authoritative readback, the dependent dashboard/public result, refresh and successful reuse.

A visible button, mock response or “saved” notification alone does not establish completion.

Specifically cover the reported business-policy saving problem, the simplified policy write-up, public policy access and booking acknowledgement, walk-in labeling, photo management, imports, promotions and their calculations.

Preserve the approved deposit rules and existing commercial agreements. Keep genuinely Stripe-dependent checks explicitly separate.

Confirm meaningful failure recovery and prevention of duplicate actions where relevant.

8. Give me one consolidated manual-configuration handoff.

For each task I can perform myself, specify the exact service, settings page, field names, values you can establish, secure location for secrets, required action and expected success signal.

State precisely which feature depends on it. Check previously supplied information before asking again. Never request passwords or secret keys in chat.

For Meta/Instagram, distinguish completed integration code, simulated verification and actual live import verification. Prepare everything possible on your side, explain the remaining owner-controlled setup and keep manual onboarding functional.

Continue independent work while I handle configuration. Do not falsely mark an integration complete or founder-deferred.

9. Preserve decisions and control scope.

Keep Google Business Profile live activation, Wolof and the other explicitly approved deferrals unchanged. Do not reopen them as launch blockers.

Maintain the agreed coming-soon/business recruitment experience at girlzculture.com and marketplace access through /site-access. Preserve the hair-salon-first launch and other-category waitlists.

Keep both $25 assistant caps unchanged and follow the latest approved pricing specification.

The exploratory WhatsApp/Muse discussion does not automatically authorize another workstream or launch dependency.

Reuse valid existing authenticated sessions. Customer-account verification is already founder-accepted; do not reopen it without a specific relevant regression.

10. Reduce unnecessary testing and credit consumption.

Batch related corrections. Run focused checks as you work, then the required complete checks for the finished release.

Reuse valid evidence for unchanged functionality. Avoid duplicate builds, redundant provider calls, repeated sign-ins and full-suite runs after every small edit.

Do not hide known problems to save time. Fix them efficiently and verify the affected behavior. Keep status updates concise and tied to concrete outcomes.

11. Finish the authorized release.

Once the non-Stripe release requirements pass, complete the authorized merge, necessary reviewed migrations and production deployment.

Determine which migrations are actually pending and respect their dependencies. Do not reapply completed migrations or alter migration history unnecessarily.

Preserve rollback capability. Verify the deployed source and the actual hosted result, including the important changed user journeys.

Do not leave completed work in a draft PR or unpublished candidate without stating a genuine blocker.

12. Report completion precisely.

Provide the completed and live features, merged commit, deployment ID, publication time, production URL, required test results and migrations actually applied.

List my remaining manual actions, the paused Stripe items and any other unfinished requirement with its exact blocker and next action.

Do not use a large test count or “implemented” status as a substitute for working, verified functionality. Do not claim the whole scope is complete while required journeys remain unfinished.

Start with the actual causes of delay and the next concrete fixes. Then execute this instruction through to completion.