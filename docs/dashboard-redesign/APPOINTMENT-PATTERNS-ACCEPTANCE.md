# Own-business historical appointment patterns

Status: **AUTOMATED ONLY / IN PROGRESS**. This implements one historical advice clause of ADVISE-02 and SF-MONEY. It does not establish hosted acceptance, historical utilization, demand or the completion of either requirement.

The existing authorized `get_business_summary` read now supplies aggregate historical appointment patterns to both the planner and answer generator. It reuses the complete, paginated booking read for the requested period. It introduces no additional database query, route, migration, provider request or write. The existing business/permission/assignment boundary applies before aggregation. No customer or professional identity is included in the new projection.

Only completed appointments count. Dates and six-hour periods use the business timezone; partial first/last local days and future dates are excluded. Comparisons require at least fourteen complete local days and two occurrences of each compared weekday. Lower observed periods are measured against the median appointments per calendar occurrence among nonzero observed periods. Empty periods never become evidence of a slow opening period. Historical opening hours, closures, unrecorded visits, service duration, demand and staffing capacity remain explicitly unknown. The assistant must review the current calendar before suggesting an action.

The projection reports complete counts and explicit total/shown/excerpt metadata, with at most twelve observed periods and six lower periods. Malformed, duplicated or oversized records and invalid windows produce unavailable evidence rather than invented zero activity.

## Evidence

- **FAIL before:** `appointment-patterns-before-product.log` records five cases failing because the capability did not exist. The earlier `appointment-patterns-before.log` is a host subprocess permission failure, not product evidence.
- **PASS automated:** `appointment-patterns-core.log`, five cases covering own-record calculations, completed-only status, partial/future exclusion, daylight-saving local-day counts, empty/short evidence, malformed/duplicated data and identity-free bounded projection.
- **PASS integrated:** `appointment-patterns-integrated.log`, 55/55 new and affected core/planner/performance cases. The new regression exercises the actual owner reader through planner and answer serialization, checks own-business query filters and exact aggregate facts, and excludes the synthetic private visitor from the projection.
- **PASS independent source review:** authorization reuse, partial-day handling, explicit unknown historical hours and identity-free aggregation reviewed by a second agent; no additional blocker identified.
- **PASS automated build:** the final combined183 production build passed with identical803-file source digests before and after compilation (`combined-183-final-build.log`).
- **UNVERIFIED:** required CI on the committed correction and a bounded question against authorized hosted records on the release candidate. Existing successful OpenAI connection evidence is retained; it does not verify this new tool output.

This evidence does not turn own recorded service prices into an external market benchmark. Existing language behavior, opt-in memory, both USD25 caps and the founder's Wolof/Google activation deferrals remain unchanged.
