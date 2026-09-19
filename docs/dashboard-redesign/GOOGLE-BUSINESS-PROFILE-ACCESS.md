# Google Business Profile access checkpoint

Read-only inspection after the founder-approved API activation, 18 September 2026.

- Project ID: `project-f0d9935c-69db-42c9-b22`.
- Project number: `886435271334`; display name: My First Project.
- `mybusinessbusinessinformation.googleapis.com`: **Enabled**.
- Requests per minute: **0**; current usage: 0.
- Google documents 0 QPM as not approved, and 300 QPM as approved. The other daily operation limits do not establish API access.
- No Business Profile connected or modified; no OAuth client, key, Maps setting or profile data changed.

## Founder decision — 18 September 2026

**Live activation deferred by founder—awaiting a qualifying salon profile, Google approval and live verification.**

The founder has no qualifying profile yet. Company website: https://girlzculture.com. Do not request another profile or retry the zero-quota API while this decision stands. This removes live Google activation from the current release gate only. The OAuth/secure per-business connection/disconnect/synchronization code, simulated provider tests and a truthful unavailable interface remain required; implementation and automated verification are recorded separately below. Keep live actions and background synchronization disabled. Do not advertise a working integration or show an unusable Connect action.

## Future activation checklist

1. Obtain the real salon's public Google profile URL, its own representative website, owner/manager account, and confirmation that the verified profile has been active for at least 60 days. The company website alone is not evidence of a qualifying salon profile.
2. Use existing project `project-f0d9935c-69db-42c9-b22`, project number `886435271334`. Submit Google's Application for Basic API Access using the qualifying owner/manager identity. Confirm approval and usable quota; enabling an API alone is insufficient.
3. Follow Google’s current Basic setup requirements after approval: Google My Business API (media/posts), Account Management, Business Information, Lodging, Place Actions, Notifications and Verifications. The code currently calls only Account Management, Business Information and Google My Business; enabling related APIs is not a claim those features are implemented. Business Information is already enabled. Check scope/quota/terms before future activation.
4. Configure a Web OAuth client with exact production callback `https://girlzculture.com/api/salon/integrations/google/callback`. This callback is implemented on PR80, not yet released or live-verified. Add a held-candidate callback only for an explicitly identified acceptance deployment; no wildcard redirect URLs. Record the final candidate URL before live testing.
5. Configure the consent screen, verified authorized domain `girlzculture.com`, privacy/terms links and `business.manage` scope. Complete any Google-required OAuth app verification before general availability. Development test-user status is not production approval.
6. Store client ID, client secret and connection-encryption key through the existing secure server-only configuration. Never expose tokens to the browser/model/logs, reuse another business's connection, or put secrets in Git. Verify exact callback/environment configuration and keep activation disabled until approved live acceptance.
7. On one authorized qualifying salon, verify owner connect/cancel, state/PKCE/expiry checks, selected location binding, initial read/sync, reviewed permitted updates, conflict handling, provider error/retry, token refresh, disconnect/revocation and cessation of background work. Verify a second business cannot list, select, sync or disclose that connection's data. No profile edits without an explicit reviewed action.
8. Enable live controls/background scheduling only after all access/configuration/live checks pass and record the deployed source, environment and evidence. Do not equate simulated responses with provider acceptance.

## External application preparation (deferred)

When the founder resumes activation with a qualifying salon, prepare an Application for Basic API Access using this project number and that profile. Do not invent eligibility or submit an attestation without confirming it.

Source: [Google prerequisites and approval status](https://developers.google.com/my-business/content/prereqs#request-access).

The authenticated Google Cloud tab is preserved. Live activation is expressly deferred and is no longer a release blocker. Implementation and isolated tests remain required. API activation is not a successful connection/sync acceptance test.

## Exact server configuration (future activation only)

All values belong in approved server-only Netlify Production Functions/Runtime configuration; no NEXT_PUBLIC values, secret files, or broadened deploy-preview scope. No values have been created or changed by this implementation.

- GOOGLE_BUSINESS_PROFILE_CLIENT_ID — approved Web OAuth client.
- GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET — corresponding secret.
- GOOGLE_BUSINESS_PROFILE_ENCRYPTION_KEY — cryptographically random 32-byte key encoded as base64, backed up securely. Do not rotate without migrating existing encrypted connections; losing it requires owner reconnection.
- GOOGLE_BUSINESS_PROFILE_REDIRECT_URI — exact https://girlzculture.com/api/salon/integrations/google/callback for live mode.
- GOOGLE_BUSINESS_PROFILE_APPROVED — true only after Google grants this project usable access.
- GOOGLE_BUSINESS_PROFILE_ACTIVATION — absent/disabled now; acceptance only on a named held Production-context candidate; live only after acceptance.
- GOOGLE_BUSINESS_PROFILE_ACCEPTANCE_OWNER_ID — the one authorized owner for acceptance mode. Exact held callback must be https://<24-character deployment ID>--girlzculture.netlify.app/api/salon/integrations/google/callback; record its real ID and register that precise URL when ready, never a wildcard. Acceptance mode rejects public-origin use and background jobs.
- GOOGLE_BUSINESS_PROFILE_VERIFIED_AT — actual past UTC acceptance timestamp, required for live mode.
- Existing INTERNAL_API_SECRET — reused only by the separately bounded Google worker; never printed or changed.

## Implementation / simulated evidence

PR80 implements owner OAuth with state/PKCE and one-use ten-minute flows; AES-GCM connections tied to business and purpose; fresh owner authorization; strict location selection; reviewed name/phone/description/regular-hours updates; owner-selected existing gallery photos and posts; conflict/readback checks; idempotent intent history; expiry/uncertain-write protection; disconnect/token revocation. Address, website, categories and reviews are preserved. No Google data reaches assistant tools, caches, exports or memory.

Background synchronization is a separate scheduled worker and returns disabled before provider/database work while deferred. It processes at most one due business, rotates due time, preserves booking-reminder isolation and pauses on conflict/error. Unknown media/post outcomes are not automatically repeated. Owners must reconcile those in Google before creating different updates; no blind replay is offered.

Eleven simulated Node checks and isolated rollback SQL assertions pass. A fresh local 172-migration chain including two-session waitlist concurrency passes. These are AUTOMATED ONLY. Browser verification and corrected-source CI are tracked in CHECKPOINT.md; no live Google provider acceptance is claimed. Production migration remains pending.

Documentation: [Google basic setup](https://developers.google.com/my-business/content/basic-setup), [OAuth implementation](https://developers.google.com/my-business/content/implement-oauth), [Business Profile policies](https://developers.google.com/my-business/content/policies).
