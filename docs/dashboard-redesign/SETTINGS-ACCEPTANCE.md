# Settings direct workspace and appearance entry

Status: AUTOMATED ONLY / NOT RELEASED. No production preference or account change was made.

Settings now opens compact tabs directly. Account updates submit only email/phone; Notifications submits only notification preferences. Before correction, absent form controls could clear unrelated preferences or submit invalid missing contact fields. A settings-only team role no longer sees editable account controls without profile permission, including direct URLs. Backend permissions were not widened.

The owner-only Assistant appearance button opens the existing conversation options and focuses the selected avatar. It reuses the existing authenticated preference API, existing saved-business binding, and existing avatar readback. There is no second preference store. Closing returns focus to the Settings button; reopening after refresh displays the saved choice.

Evidence: the missing Settings appearance entry was reproduced against the prior build (`settings-appearance-before.log`). The combined rebuilt run passed all22 Settings Chromium/WebKit cases: tab-specific updates, retained failure/retry, four language/viewports, two staff/direct URL boundaries, and mobile/desktop appearance save/refresh/focus. TypeScript, scoped lint and independent review pass. The new Settings paths also preserve the existing14 owner cases.

Rendered English phone and Spanish desktop Settings screenshots were inspected: readable direct forms, compact horizontally scrollable tabs and reachable controls. Full-page captures include fixed navigation at its actual viewport position; they are not a claim that every Settings dialog/state has completed visual acceptance. Hosted role/persistence acceptance and final source CI remain required.