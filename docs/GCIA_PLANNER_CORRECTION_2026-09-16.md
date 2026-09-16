# GCIA planner correction — 16 September 2026

This is a verification record, not a claim that the full invisible-employee expansion is complete.

## Published baseline

PR #68 is published as commit `585f501b490f29ed5c3be63accfc36eddd1ddd04`, Netlify deploy `6aaadcf3827d520008801ce8`, at 19:13:54 UTC. Automatic publication remains locked. Its PR, release-candidate and exact-main checks passed.

| Live acceptance | Status | Evidence |
| --- | --- | --- |
| Original service order | PASS | Isha's 16 services run from the three Knotless Braids entries to Silk Press in their original order. |
| Calendar record names | PASS | August 28 shows Knotless Braids and the original professional name; no object-string labels. |
| Booking search | PASS | The All group with Knotless Braids finds the completed August 28 appointment. |
| Direct service quick action | PASS | Authorized read returns the 16 services and recorded prices. |
| Free-form inventory question | FAIL | First request selected the profile tool. A clean-session retry selected services but produced a long reply ending mid-list. |
| Silk Press price follow-up | FAIL | Reproduced in two sessions; planning rejected before a service lookup was saved. Protected canonical reference: `3d9c678f-2356-4bfe-808d-56c11ff1ceec`. |
| Failure reference in the drawer | FAIL | The failed price request displayed the generic fallback without the protected incident reference. The exact transport body was not available in the browser diagnostic interface. |

## Correction under verification

The provider's previous JSON schema permitted several non-null decisions, although server validation rejected that state. The new schema contains one decision: a tool with its arguments, a clarification, or navigation. The answer phase accepts only a reply. Server validation, current permissions, plan access, budget reservations and confirmation requirements remain authoritative.

Each tool now has a purpose description, including the distinction between profile information and actual service prices. The current question takes precedence over older conversational context. A general inventory answer receives a count and four concise service examples, explicitly marked as an excerpt, rather than unsolicited add-on lists. Targeted lookups retain the requested service details.

Provider format failures now retain a bounded diagnostic reason in the protected usage ledger, without storing the model output. The client preserves the exact server reference from its response header if the error body is not valid JSON. This addresses a reproduced error-handling weakness; the live transport cause still requires verification.

- **AUTOMATED ONLY:** three new regressions failed on the published source and pass after correction: competing provider actions, inventory-answer overload, and reference loss on non-JSON errors.
- **AUTOMATED ONLY:** current planner/session checks pass, including permission revocation, all five locale instructions, phase separation, malformed/truncated responses, budget protection and no automatic retry.
- **AUTOMATED ONLY:** TypeScript and affected-file ESLint pass. Owner coverage remains 1,834 sources in all five languages. The new header lookup is classified by its exact source context as protocol data, not user-facing copy.
- **BLOCKED locally:** Chromium is absent; the installed WebKit cannot start without system libraries. Browser CI is required. The current CI workflows and assertions are unchanged.
- **BLOCKED diagnostic method:** automatic security review rejected copying production credentials and a gateway token into the workspace for a local provider diagnostic. That method was not retried. Verification must use the authenticated application with credentials retained on the server.
- **PENDING:** the exact candidate's CI, held production deployment, real-provider acceptance and final publication. No new migration, business-data change, message, payment, model change or budget increase is part of this correction.

## Required real-provider acceptance

Test the held candidate through its ordinary authenticated interface before publication. For each of English, French, Spanish, Wolof and Simplified Chinese: ask for services/prices, follow with the Silk Press price question, and verify an authorized service lookup returning the recorded USD 120 price. Verify the inventory answer includes the count, makes clear it is an excerpt and ends cleanly. A quick-action success does not substitute for free-form acceptance. Also check profile hours, a platform-help question, a missing-service question and an unavailable-provider response/reference. Retain all failed observations; a later successful retry does not erase a failure.

Physical-device speech, restricted-team/customer test sessions, protected Stripe connectivity, and the larger GCIA expansion remain separate, uncompleted acceptance items.
