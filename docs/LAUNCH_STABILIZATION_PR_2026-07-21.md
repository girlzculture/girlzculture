# PR title

Stabilize salon lifecycle, discovery, catalog, media, and launch operations

# PR description

## Summary

This draft PR completes the authorized launch-stabilization repository pass without deploying, applying migrations, merging, or writing to production.

It:

- fixes the salon lifecycle trigger regression by separating parent `salons` records from child records and corrects admin coordinate RPC types;
- routes owner publication-sensitive writes through authenticated server authorization without weakening RLS or reopening anonymous table access;
- adds explicit owner publication controls, collision-safe public slugs, redirects, diagnostics, and an audited, controlled reconciliation path for eligible `pending-*` salons;
- makes discovery truthfully local with a 50-mile default and a configurable plan adjustment bounded to 0-3 miles inside the eligible radius;
- expands the managed service catalog to support group-level salon offerings and dependency-aware reassign/archive/delete operations;
- adds stable case-insensitive catalog ordering and visible-result-only batch management with per-record outcomes;
- hardens image/gallery accessibility and the Trending Picks MP4/WebM workflow with metadata, trim/poster preparation, drag/drop, transfer progress, cancellation, retry cleanup, moderation, archive, and mobile playback;
- adds sanitized protected platform error monitoring with reference/correlation IDs;
- preserves governed localization with persistent selectors, 37 locale records, English fallback and Engine review/publish controls;
- updates Next.js and Sharp to audited versions and extends the protected migration workflow verification.

## Database migrations

Do not paste these into the Supabase SQL Editor. After merge, run the protected GitHub Actions workflow in this exact order:

1. `20260721110000_launch_blocker_core_stabilization.sql`
2. `20260721120000_salon_publication_controls.sql`
3. `20260721130000_local_discovery_launch_defaults.sql`
4. `20260721140000_flexible_service_catalog.sql`
5. `20260721150000_platform_error_monitoring.sql`

The full impact assessment, read-only previews, safe Netlify lock/merge/migrate/publish order, rollback guidance, six-role acceptance script, video fixture matrix and Blog 502 log instructions are in `docs/LAUNCH_STABILIZATION_HANDOFF_2026-07-21.md`.

## Verification

- [x] clean `npm ci`
- [x] 27/27 repository verification scripts
- [x] `npx tsc --noEmit`
- [x] ESLint, zero warnings
- [x] optimized Next.js production build (99 routes)
- [x] full and production dependency audits (0 vulnerabilities)
- [x] local built-app public route smoke
- [x] anonymous admin/salon API denial status checks
- [x] unpublished/pending salon neutral fallback
- [x] 10/10 repeated local `/blog` requests returned 200
- [x] desktop/mobile overflow and responsive public smoke
- [x] focused catalog ordering/batch and Trending video verifiers
- [ ] P1-P5 executed in Supabase Postgres (founder action after merge)
- [ ] authenticated six-role production matrix (founder action after migration/deploy)
- [ ] Stripe/email/SMS/push/geocoder production-provider evidence
- [ ] supplied MP4/WebM production-storage/mobile-device evidence
- [ ] live Blog 502 log correlation if the problem recurs

## Release guardrail

Before merging, lock Netlify production deploys. After merge, dispatch the protected migration workflow from `main` with the exact confirmation `APPLY REVIEWED MIGRATIONS`. Publish the successful merged-commit deploy only after the workflow's final migration list is green. Codex has not merged, deployed, dispatched migrations, or changed production data/providers.

## Review focus

- P2 eligibility and fail-closed publication behavior;
- P4 unresolved service-group preview must return zero rows before migration;
- server-only authorization and unchanged RLS posture;
- discovery radius/real-distance ordering and maximum plan bonus;
- partial upload cleanup/cancellation and public campaign moderation;
- the manual launch evidence checklist in the handoff.
