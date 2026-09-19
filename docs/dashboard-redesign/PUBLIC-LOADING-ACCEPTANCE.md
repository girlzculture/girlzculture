# Public marketplace loading layout

Status: locally verified component correction, not deployed or full public-site acceptance.

The existing nearby and featured home sections rendered loading cards in a vertical stack on narrow phones, then replaced the stack with a horizontal carousel. At 390px the reproduced loading card positions spanned 901.5px vertically; the regression expected a single row and failed on the prior production build. The original evidence is retained in `../redesign-evidence/public-loading-before.log` and its report.

`SalonCardSkeletons` now shares the actual compact card widths and image ratios. Home loading rows stay horizontal and decorative overflow is clipped. The existing featured-results page retains its full responsive grid. Section order, root landing, hero, imagery, labels, routing, discovery data, location and business facts are unchanged. No reference-image slogans or sample claims were introduced.

| Check | Evidence |
| --- | --- |
| Chromium: 6 passed | `../redesign-evidence/public-loading-after.log` |
| WebKit: 6 passed | `../redesign-evidence/public-loading-webkit.log` |
| Targeted ESLint | `../redesign-evidence/public-loading-lint.log` |
| Design source guard | `../redesign-evidence/public-loading-design.log` |

The browser cases gate real interface fetches with synthetic discovery responses. They cover 320, 390, 768 and 1440px; loading-to-result width consistency; no horizontal page overflow; real profile/booking destination construction; preserved fixture prices; the featured results grid; explicit error recovery; and honest empty states without invented cards. There are no new test retries or arbitrary sleeps. Both engines ran against the local development server after the correction, not a held production candidate. The before test ran against the prior local production build.

Loading and loaded390px captures were inspected in Chromium and WebKit. The local preview document links the images. The development indicator in those initial captures is not production UI. The subsequent corrected production build passes all12 cases within `combined-181-corrected-browser.log` (54total); its WebKit390px loaded capture was also inspected and has no development indicator. These are synthetic local discovery records, not a live-site acceptance claim.

This supplies bounded evidence for UI-07 and PUBLIC-10/12/13/16. Full translated public-page review, keyboard/booking journeys, final required CI on the combined source and hosted/public acceptance remain separate requirements. It does not mark those whole groups complete.
