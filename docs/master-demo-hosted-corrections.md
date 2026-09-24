# Private demo hosted corrections

The Culture House owner signed into Production-context candidate
`6ab4f69cb08ffc00087788c0` (source `cf91f0001cd3861d84b3d9204a2cbb5bdece7429`).
The authenticated workspace showed the sample banner, six services, eight photos,
four professionals, four products and sample conversations. This is the existing
private demo, not a replacement business or newly seeded account.

## Reproduced defects and corrections

- Bookings displayed zero while Calendar/Overview showed appointments. The list
  removed all test-mode records. It now includes classified sample bookings only
  within the authenticated private demo; genuine-business sandbox exclusions stay.
- Client history likewise removed all test-mode visits in its database projection.
  The existing authorization, business, linked-client and staff/field restrictions
  remain in place. Private demo visits are included and recorded simulated receipts
  counted once, without adding fictitious provider deposits.
- Booking outcomes returned `BOOKING_MONEY_INVALID_EVIDENCE`: its guard expected a
  provider payment for simulated deposits/refunds. Private-demo evidence now requires
  the exact recorded receipt amounts. Real provider verification remains mandatory.
- Fourteen sample Premium events displayed $1.99 instead of $199 and midnight UTC
  appeared on the prior local day. Migration `20260924125427` corrects only unchanged
  canonical fictional billing rows to cents and local monthly dates, updates the
  canonical seed procedure, and does not reseed bookings or touch login identities.
  Subscription history is ordered by event date, labeled as fictional, and cannot
  initiate plan changes or advertising purchases from the demo.
- The assistant labeled 14:00 UTC as New York time for a 10:00 EDT appointment.
  Answer facts now contain an explicit localized date/time and DST abbreviation;
  the planner retains the original instant for authorized follow-up selection.
- My Page and Photos previews led to the intentionally inaccessible public sample URL. Their
  profile and policy preview links now use the existing authenticated private page,
  including only the current published policy. Public discovery remains blocked.
- The held candidate blocked the eight canonical public-origin sample images under
  its existing content-security policy. Those exact bundled asset URLs now render
  from the current deployment. Stored URLs, uploaded images and the CSP are unchanged.
- The Partner Agreement metadata fallback now uses the required exact title.

## Local evidence

- Planner: 94 passed; financial evidence: 12 passed.
- Preview/policy API: 10 passed, including foreign and unpublished policy denial.
- New sample-booking/subscription browser regression: 8 passed across Chromium and
  WebKit at 390×844, 768×1024, 1440×1000 and 844×390.
- Existing bookings, subscription and booking-money browser regression: 42 passed.
- Private preview policy/navigation/recovery: 8 passed, four locales and both engines.
- The final gallery-link/image-loading/private-preview checks: 16 passed across
  Chromium/WebKit and the same four layouts; exact-asset URL guards: 2 passed.
- TypeScript and changed-file lint passed.
- Clean database: all 218 migrations plus database/concurrency assertions passed.
- Demo seed/current-schema and already-seeded upgrade: 95 checks each, including
  client totals, receipt reconciliation, tenant denial and genuine-row preservation.
- Representative upgrade: 188 + 30 migrations; 10 preservation checks and 20 SQL
  assertion suites passed.

These are local results, not a claim that the corrections are deployed. Required
PR/main CI, the protected pending migration, corrected-candidate hosted readback,
and production verification remain release gates. Existing valid unrelated
acceptance evidence is retained. Stripe and payment-method configuration are
unchanged; both AI caps remain unchanged.

## Separate hosted/content evidence and limits

The unchanged fictional business policy completed draft/review/publication and
refresh on the existing candidate. The public Help deposit wording and exact
Partner Agreement heading were published through the existing CMS. Unreviewed
translations were not published. The pre-existing Partner Agreement body is empty;
no unreviewed legal prose was invented. The reported facial watermark still needs
the requested screenshot to identify the affected asset; no image was guessed or
changed. Final release must report these limitations accurately.
