# Photo details conflict recovery

Status: **correction implemented and all eight focused browser cases passed locally.** This is a bounded UI-05/COPY-01 correction, not a new photo feature or service. Production publication and acceptance are not claimed.

## Reproduced cause

The existing metadata PATCH correctly rejected an outdated expected snapshot with409 PHOTO_STALE. The editor retained the draft and instructed the owner to reload saved details, but offered no such action. Reopening used the same old metadata reference. `photo-conflict-before-roles.log` and its retained Chromium trace reproduce the actual missing Reload saved details control after the409 response and retained draft.

Earlier `combined-179-fixture-corrections` and `photo-conflict-before` attempts stopped at test setup selectors and are not counted as reproductions. Exact getByLabel on wrapping labels matched text containing textarea/option content; explicit textbox/combobox roles select their real accessible names. The original DOM trace retained both the dialog aria-labelledby attribute and heading id. The final regression retains the named-dialog assertion after editing its title; no speculative application accessibility change was made.

## Correction

BusinessPhotoLibrary now offers an explicit reload after a conflict. It uses the existing protected profile GET with no-store and the existing scoped session. It rejects a different business, a removed selected photo or invalid metadata. A successful reload refreshes the complete current gallery/metadata snapshot, displays the currently saved details for comparison, and updates the expected concurrency token while leaving every draft field intact. Only a subsequent explicit Save can replace the saved details.

Failed reloads retain the draft and exact support reference and leave Save blocked. Closing/reopening the editor or changing business invalidates late responses. No automatic retry, provider call, new API, permission or migration is introduced. New recovery copy is explicitly supplied in English, French, Spanish and Simplified Chinese.

## Verification

- `photo-conflict-types.log` and `photo-conflict-lint.log`:TypeScript and focused ESLint passed before source freeze.
- `photo-conflict-copy.log`:explicit four-locale key coverage passed.
- `combined-ui-final-browser.log`: six of eight photo cases passed across Chromium and WebKit: concurrent edit plus failed reload and exact reference, draft retention, full-gallery metadata preservation, explicit current-token save and refresh, and rejection of foreign and removed-photo snapshots.
- Both delayed-response cases reached their final closed-editor assertion after the actual save succeeded. Their generic `dialog[open]` locator then resolved to the independently open desktop GC Assistant (`aria-labelledby="gc-assistant-title"`), rather than the closed photo editor. The retained error contexts and traces in `combined-ui-final-results` establish this fixture cause. The tests now target the exact named `Edit photo details` dialog; the closed-editor, stale-response suppression, retained draft, expected concurrency token and two-save assertions remain unchanged. No application change was made for these failures. The original combined run remains preserved as 52 passed and two failed, rather than being relabeled successful.
- `combined-ui-tabs-browser.log`: all eight photo conflict cases passed across Chromium and WebKit in the final combined run (24 total passed). This verifies both corrected late-response cases and confirms the locator diagnosis while preserving the original assertions.
- The named-dialog assertion after editing the photo title passed in both engines, so the earlier setup failure does not establish a lost accessible name. The retained `photo-conflict-review.png` captures were visually inspected in both engines at a 390×844 CSS viewport: the saved snapshot, separate retained draft, Close and Save controls are readable and within the dialog, without overlap. This is local automated and screenshot evidence; no production claim is made.

Final required checks and the protected release process still apply. The photo correction requires no database migration, provider request or additional sign-in.
