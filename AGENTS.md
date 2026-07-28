<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Launch-critical engineering rules

These rules apply to every launch-stabilization change in this repository:

1. Reproduce the original failure before correcting it.
2. Verify the original failure no longer reproduces after the correction.
3. Test every directly affected page and route.
4. Test mobile, tablet, desktop, and relevant landscape layouts.
5. Test every affected authenticated role.
6. Verify save, refresh, logout/login, and cross-device persistence when data is changed.
7. Verify both success and failure behavior.
8. Require JSON-only application API responses, including authentication and provider failures.
9. Confirm every user-visible incident reference exactly matches its protected Engine event reference.
10. Run regression tests for previously corrected launch-critical workflows.
11. Independently review the final diff before delivery.
12. Never substitute TypeScript, lint, build, or CI success for live workflow verification.
13. Mark every acceptance item `PASS`, `FAIL`, `BLOCKED`, or `AUTOMATED ONLY`.
14. Never claim completion while a requested P0 item remains untested or failed.
15. Never merge, publish, migrate production, make real payments, or modify unrelated production data without explicit authorization.
16. When the same defect returns, add a permanent regression test that exercises its actual failure boundary.
17. If access is missing, state exactly which credential, permission, integration, test identity, or authenticated browser session is required instead of silently using a mock.
