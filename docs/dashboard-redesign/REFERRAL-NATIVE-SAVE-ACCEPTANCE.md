# Referral configuration native Save activation

This correction addresses the WebKit landscape failure in required run `35466416788` at revision `ff4792f`. It changes only viewport scrolling while the Engine referral campaign editor is present. Campaign terms, permissions, API behavior, inactive status and reward issuance are unchanged.

## Original evidence

The original `Referral configuration saves final terms inactive and verifies refresh in zh-CN` failed waiting for its exact saved-and-verified status. The original artifact was downloaded once to `../redesign-evidence/ci-ff4792f-required-artifact`; its trace and failure image remain unchanged under `test-results/business-referrals-Referra-076ff-d-verifies-refresh-in-zh-CN-webkit`.

The trace records all entered values still present, no campaign POST, and a Save pointer coordinate of `(422,311)`. The page moved from scroll position 598 at the input snapshot to 623 after the pointer action and 662 afterward, with `scroll-behavior: smooth`. GC Assistant is not mounted on this administrator route. The original trace does not record native pointer targets or prove a form submission; it supports a moving-target diagnosis rather than a saved-then-reset claim.

## Reproduction and correction

An instrumented unchanged original case passed locally once: `referral-native-before.log`. Its native pointerdown/up/click remained on Save at scroll 662, all eight inputs were valid, and the form submitted once. That passing run does not explain away the original failure.

The added boundary case requests the same 64px default-behavior viewport movement before pressing the native pointer, then releases after that same scroll reaches its endpoint. It never starts scrolling after pointerdown, retries a click, sleeps, forces a click, or submits through JavaScript. On unchanged build 200 it reproduced the exact missing success status: **FAIL**, one test in 11.9 seconds, `referral-native-gated-before.log`. Its initial Save coordinate was `(422,311)` at scroll 598; pointerdown reached `MAIN` at scroll 661 and pointerup/click reached `MAIN` at 662. All inputs were valid and no submit occurred. These events are preserved in `referral-native-gated-before-events.json`; the screenshot and original trace are in `referral-native-gated-before-results`.

`ReferralCampaigns.tsx` now marks its form with `data-referral-campaign-editor`. `globals.css` includes only that marker in the existing instant-scroll editor rule. This makes the requested reposition finish before the browser uses the control's coordinates. It adds no validation bypass and changes no campaign data.

## Acceptance

| Check | Result and evidence |
| --- | --- |
| Original remote failure preserved | **FAIL retained**, original trace/image and `ci-ff4792f-required-failed.log` |
| Deterministic native pointer reproduction, unchanged build 200 | **FAIL retained**, `referral-native-gated-before.log` and native-event attachment |
| Scoped ESLint | **PASS**, `referral-native-final-lint.log` |
| TypeScript | **PASS**, `referral-native-final-types.log` |
| Independent source/test review | **PASS**, reviewer inspected scoped CSS/form changes, original trace summary and deterministic native-event evidence; no additional blocker |
| Corrected production build | **PASS**, build 201; identical before/after 848-file source digest `7ffba5cde0eb62be5b17fc7676161956187b2d0c8f050512ab33e48b255b58af` |
| Complete focused referral browser suite | **PASS — AUTOMATED ONLY**, 26/26 in 1.3 minutes across Chromium and WebKit; `referral-native-after.log` and `referral-native-after-results` |
| Original zh-CN and new native-boundary saved views | **PASS**, all four Chromium/WebKit images directly inspected after fixture reload; inactive campaign and saved terms remain visible |
| Original zh-CN and new native-boundary event attachments | **PASS**, `referral-native-after-events.json` extracted from preserved `referral-native-after-report.zip`; all four record valid inputs, native pointerdown/up/click on Save, exactly one submit and no invalid event |

For both new boundary cases, the requested scroll finishes at 662 before the coordinate is captured: Save is at `(422,247)`, with top 225/bottom 269 throughout pointerdown, pointerup and click. Both record `scroll-behavior: auto`. The original zh-CN cases also retain a stationary Save through the entire pointer sequence. Chromium subsequently scrolls when the saved result changes the document, after submission; the event attachment distinguishes that from movement during activation.

The directly inspected files are `referral-configuration-zh-CN-844.png` in these four directories beneath `../redesign-evidence/referral-native-after-results`:

- `business-referrals-Referra-076ff-d-verifies-refresh-in-zh-CN-chromium`
- `business-referrals-Referra-076ff-d-verifies-refresh-in-zh-CN-webkit`
- `business-referrals-Referra-98bd6-ing-landscape-repositioning-chromium`
- `business-referrals-Referra-98bd6-ing-landscape-repositioning-webkit`

These are full-region captures taller than the landscape viewport; the fixed navigation appears across their middle. They establish the retained saved content, not simultaneous unobstructed visibility of every form control. Exact success-message and native activation checks occur before the subsequent reload capture.

The regression retains the original exact terms, inactive-status, single-save and reload assertions, and additionally requires native pointerdown/up/click on Save, one submit and zero invalid events. The existing four-locale owner/administrator cases cover phone, tablet, desktop and landscape, denied administrator access, failed claim recovery and persisted fixture readback. These are local transport-fixture checks; they do not establish hosted authentication, real campaign activation, provider acceptance or reward issuance.
