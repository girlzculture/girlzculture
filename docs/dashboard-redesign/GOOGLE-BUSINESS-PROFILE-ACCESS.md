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

The founder has no qualifying profile yet. Company website: https://girlzculture.com. Do not request another profile or retry the zero-quota API while this decision stands. This removes live Google activation from the current release gate only. The OAuth/secure per-business connection/disconnect/synchronization code, simulated provider tests and a truthful unavailable interface remain required; they are not yet complete. Keep live actions and background synchronization disabled. Do not advertise a working integration or show an unusable Connect action.

## Future activation checklist

1. Obtain the real salon's public Google profile URL, its own representative website, owner/manager account, and confirmation that the verified profile has been active for at least 60 days. The company website alone is not evidence of a qualifying salon profile.
2. Use existing project `project-f0d9935c-69db-42c9-b22`, project number `886435271334`. Submit Google's Application for Basic API Access using the qualifying owner/manager identity. Confirm approval and usable quota; enabling an API alone is insufficient.
3. Confirm required API access for Account Management, Business Information and the approved synchronization operations. Business Information is already enabled. Review Google's current access/verification requirements before enabling other APIs or submitting attestations.
4. Configure a Web OAuth client with exact production callback `https://girlzculture.com/api/salon/integrations/google/callback`. This is the reserved implementation contract, not a currently live endpoint. Add a held-candidate callback only for an explicitly identified acceptance deployment; no wildcard redirect URLs. Record the final candidate URL before live testing.
5. Configure the consent screen, verified authorized domain `girlzculture.com`, privacy/terms links and `business.manage` scope. Complete any Google-required OAuth app verification before general availability. Development test-user status is not production approval.
6. Store client ID, client secret and connection-encryption key through the existing secure server-only configuration. Never expose tokens to the browser/model/logs, reuse another business's connection, or put secrets in Git. Verify exact callback/environment configuration and keep activation disabled until approved live acceptance.
7. On one authorized qualifying salon, verify owner connect/cancel, state/PKCE/expiry checks, selected location binding, initial read/sync, reviewed permitted updates, conflict handling, provider error/retry, token refresh, disconnect/revocation and cessation of background work. Verify a second business cannot list, select, sync or disclose that connection's data. No profile edits without an explicit reviewed action.
8. Enable live controls/background scheduling only after all access/configuration/live checks pass and record the deployed source, environment and evidence. Do not equate simulated responses with provider acceptance.

## External application preparation (deferred)

When the founder resumes activation with a qualifying salon, prepare an Application for Basic API Access using this project number and that profile. Do not invent eligibility or submit an attestation without confirming it.

Source: [Google prerequisites and approval status](https://developers.google.com/my-business/content/prereqs#request-access).

The authenticated Google Cloud tab is preserved. Live activation is expressly deferred and is no longer a release blocker. Implementation and isolated tests remain required. API activation is not a successful connection/sync acceptance test.
