# Prelaunch replacement-document readiness

Status: the original WebKit timing failure is reproduced and its document-readiness correction remains locally verified. A later CI counterexample disproved the regression's browser-specific assumption about incomplete geometry; the corrected regression now proves the stylesheet is held and readiness stays pending. The latest complete Chromium/WebKit prelaunch run passed **30/30 in 3.1 minutes**. Scoped lint exited 0 and independent source/test review passed. Application source, styling, navigation and discovery behavior are unchanged.

## Original failure and measured cause

The release run for commit `332a716` passed 27 prelaunch cases and failed the WebKit 390×844 navigation/session case at its immediate `document.documentElement.scrollWidth <= innerWidth` assertion. The original trace and screenshot are retained under `../redesign-evidence/ci-332a716-prelaunch-failure/test-results/prelaunch/p0-prelaunch-demonstration-15323-ession-retention-at-390x844-webkit/`.

The trace contains a second full `/site-access` document navigation after the initial `goto()` completed. The next assertion crossed that navigation and then measured its replacement document before its render-blocking Google stylesheet import finished: the measurement was around `19:29:20.047Z`; the stylesheet completed around `19:29:20.081Z`. The public menu was still SSR-disabled. A separate unchanged-app local attempt passed; its document and viewport were both 390px, so that isolated pass did not explain or invalidate CI.

The trace does not record the JavaScript navigation initiator or HMR message frames. The development PWA component only unregisters service workers and has no reload callback. Next's development runtime contains HMR and debug-channel cache-recovery reload paths, and two HMR connections appear in the trace. The evidence does not uniquely attribute the original second navigation to one runtime path.

## Deterministic regression and correction

`tests/browser/p0-prelaunch.spec.ts` now gates the actual external CSS import during a replacement-document navigation, leaving its bytes and all application CSS unchanged. The preserved BEFORE version retains the original immediate assertion and fails exactly there in WebKit. Its attachment measures viewport **390px**, document **1608px**, and `readyState=loading`; intrinsic promo images were being laid out before their responsive rules applied. `document.fonts.status` already reported `loaded`, proving that fonts alone are not an adequate document-readiness condition.

The test now waits for the current document's load event, the existing public-menu hydration signal (SSR disables the button), and `document.fonts.ready` before applying the original no-overflow assertion. It does not poll geometry, sleep, retry, lower thresholds, or add overflow clipping. Navigation, cookies, session retention and menu interaction assertions remain. The gated regression also proves that readiness remains unresolved while the document is loading, then requires `readyState=complete`, loaded fonts, exact no-overflow and a working menu after release.

In that initial local run, Chromium already fit while the import was pending, whereas WebKit reproduced the 1608px width. The first two-engine run preserved that observation: WebKit passed; Chromium failed an unnecessarily universal *new regression characterization*, not the original final no-overflow assertion. The characterization was initially made WebKit-specific. That browser-specific assumption is **superseded by the later CI evidence below**; the historical measurements remain valid observations. Both engines retain every readiness and final-layout assertion. The intentional BEFORE environment branch was removed from the candidate and its full source remains archived outside Git.

| Evidence | Result |
| --- | --- |
| `ci-332a716-release-gate.log` and original failure artifact | 27 passed, 1 failed; original immediate width assertion |
| `ci-332a716-prelaunch-local-before.log` | Unchanged-app local WebKit case passed; not a CI-cause proof |
| `ci-332a716-prelaunch-gated-before.log` | Exact original immediate assertion fails; 390px viewport / 1608px document while loading |
| `p0-prelaunch-gated-before.spec.ts` outside Git | Preserved reproducible BEFORE source |
| `ci-332a716-prelaunch-gated-after.log` | 1 passed, 1 failed only the cross-engine premature-overflow assumption; original output retained |
| `ci-332a716-prelaunch-full-after.log` | **30 passed in 3.2 minutes**, Chromium and WebKit: original 28 plus 2 gated cases; no failures or skips |
| Final lint and independent review | Lint exit 0; independent source/test/doc review passed |

The intentional failing BEFORE case also exposed a teardown race between releasing the held route and unregistering its handler. Cleanup now awaits the released handler before unregistering it. The original secondary `Route is already handled` output is preserved; it did not cause the recorded geometry mismatch.

## Later CI counterexample and invariant readiness proof

Release run `35472407837`, revision `b81396c`, passed 29 prelaunch cases and failed one at the new regression's preliminary assertion that WebKit must overflow while the stylesheet is held. The original log is `ci-b81396c-release-gate-failed.log`; the single downloaded failure artifact remains unchanged in `ci-b81396c-release-gate-artifact`. Its exact held-stylesheet attachment reports `readyState=loading`, viewport 390, document 390, body 374, and no elements outside the viewport. Thus a still-loading WebKit document can already fit. The failure occurred before the pending-readiness and final-layout checks, not at the application's final width assertion. The failure screenshot was taken after cleanup released the stylesheet, so it is not evidence of held-response geometry.

The test now explicitly checks that the actual stylesheet request has started, its gate is unreleased, and its route has not continued. It repeats the held-response checks after a browser protocol round trip and still requires incomplete document readiness and an unresolved readiness helper. After release, it retains the exact `complete`, loaded fonts, no-overflow and working-menu assertions. Geometry is attached as evidence in both stages but its incomplete value is not prescribed. There is no geometry polling, retry, sleep, application change or configuration change.

To demonstrate that this tests the readiness behavior rather than merely inspecting gate flags, an isolated outside-Git source copy temporarily replaced only the readiness helper with an immediate return. Both engines failed `expect(ready).toBe(false)` after the held-response and incomplete-document assertions had passed. The corrected source was restored in a `finally` block and its SHA-256 matched the preserved corrected copy before the AFTER run. No temporary mode, environment branch or no-op helper remains in the candidate.

| Current evidence | Result |
| --- | --- |
| `ci-b81396c-release-gate-failed.log` and original artifact | **29 passed, 1 failed** in 1.7 minutes; incorrect WebKit premature-overflow characterization |
| `ci-b81396c-prelaunch-held-geometry.json` | Original CI attachments: both engines can fit 390px while still loading |
| `ci-b81396c-prelaunch-immediate-helper-before.ts` and `ci-b81396c-prelaunch-readiness-before.log` | **2 intentional failures**, Chromium and WebKit, at the pending-readiness assertion; source, traces and screenshots preserved outside Git |
| `ci-b81396c-prelaunch-readiness-after.log` | **2/2 passed in 22.0 seconds**, corrected helper and held-response contract |
| `ci-b81396c-prelaunch-readiness-after-geometry.json` | Local held layout measured 390px in Chromium and 1608px in WebKit; both final documents measured 390px and were complete |
| `ci-b81396c-prelaunch-full-after.log` | **30/30 passed in 3.1 minutes**, zero failures/skips, both engines and every existing prelaunch case |
| `ci-b81396c-prelaunch-correction-lint.log` and independent review | Lint exit 0; read-only source/evidence review **PASS** |

These are local browser fixtures and document-readiness checks, not hosted/public release acceptance. The founder's closed-discovery behavior and direct real-business routes remain unchanged. No production/provider configuration or application CSS was changed for this correction.
