# Business policies

Status: **AUTOMATED ONLY — isolated database and browser evidence; no live backend acceptance.**

Girlz Culture platform terms, privacy, payment protections and Care remain read-only. Business preferences live under My Page → Your Business Policies. No business setting may replace platform payment rules or legal rights; this tool does not provide legal advice.

## Fields and publication

The strict policy schema includes cancellation/rescheduling notice (0–168 hours), late-arrival grace (0–60 minutes), no-show/late-arrival preferences, guest/children/walk-in preferences, preparation and additional original notes. Deposit treatment is fixed to platform rules, the remaining balance is due after service, and satisfaction concerns go through business contact with platform protections preserved. Unknown keys, invalid types/ranges and obvious contradictory payment claims are rejected. Text validation cannot prove the legal sufficiency of arbitrary prose; the original-language review remains mandatory.

`/api/salon/policies` resolves the business and `my_page` permission from the authenticated actor. It checks current subscription status. Saving creates an immutable draft revision; the response includes a SHA-256 preview digest and the expected current revision. Publishing requires explicit confirmation, original-language review and platform-rule acknowledgment. The atomic RPC locks the business/current pointer, identity/team and subscription rows, rechecks permission/plan, compares the expected revision and assigns the next version. A stale preview fails without publication. History preserves author/publisher and timestamps.

## Booking evidence

The additive P0 migration adds `business_policy_revision_id`, `business_policy_version`, `business_policy_snapshot` and `business_policy_captured_at` to bookings. A booking trigger records the applicable immutable revision. A checkout review carries the revision ID; if the business publishes a different revision before checkout starts, the server rejects the stale review. Paid checkout intents preserve the accepted version for later webhook completion, including the existing combined-commerce insertion path. Policy changes cannot rewrite a booking's captured evidence.

The public profile exposes summary/full detail; booking review shows the policy before confirmation. Confirmation, owner booking detail, booking conversations/support and secure guest management render the saved booking snapshot, never today's policy substituted into old evidence. Historical bookings without a saved policy explicitly say that no business policy was recorded and that platform protections still apply.

`scripts/sql/verify-p0-business-os.sql` tests publication, stale versions, immutable old bookings, tenant access and real Assistant policy publication against disposable PostgreSQL. `tests/browser/p0-owner.spec.ts` tests draft → review → checkbox → publish, preserving original text and stable field labels after remount. Provider/native review and full hosted checkout acceptance remain blocked/unverified; no production migration was applied.

Unexpected read/save failures retain the authenticated actor/business and available admin client when recording a protected Engine event. The JSON response uses POLICY_UNAVAILABLE plus the exact canonical incident reference. Local API regressions reproduce and protect this persistence boundary without logging policy prose or database details to the user.
