import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pilotOverrideReasonError,
  publicationBlockMessage,
  publicationGateFailures,
  publicationOverriddenGateLabels,
} from "../src/lib/publicationActivationCore.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20260727230000_publication_activation_and_stylist_slugs.sql",
);
const decisionRoute = read(
  "src/app/api/admin/submissions/[id]/decision/route.ts",
);
const applicationReview = read(
  "src/components/admin/AdminApplicationReview.tsx",
);
const salonPage = read("src/app/salon/[slug]/page.tsx");
const stylistPage = read("src/app/salon/[slug]/stylist/[stylistId]/page.tsx");
const stylistCards = read("src/components/SalonStylists.tsx");
const publicMetadata = read("src/lib/salonPublicMetadata.ts");
const systemStatus = read("src/app/api/admin/engine/system-status/route.ts");
const deletionHardening = read(
  "supabase/migrations/20260804210000_offboarded_test_salon_protected_deletion.sql",
);

const diagnostic = {
  checks: {
    application_approved: {
      label: "Application approved",
      required: true,
      passed: true,
      overridden: false,
      effective_passed: true,
    },
    salon_logo: {
      label: "Salon logo",
      required: true,
      passed: false,
      overridden: true,
      effective_passed: true,
    },
    optional_gallery: {
      label: "Gallery",
      required: false,
      passed: false,
      overridden: false,
      effective_passed: false,
    },
  },
  missing_gate_labels: ["Salon logo"],
  effective_missing_gate_labels: [],
  actual_required_complete: false,
  all_required_complete: true,
};

assert.deepEqual(publicationGateFailures(diagnostic, "actual"), ["Salon logo"]);
assert.deepEqual(publicationGateFailures(diagnostic), []);
assert.deepEqual(publicationOverriddenGateLabels(diagnostic), ["Salon logo"]);
assert.deepEqual(
  publicationGateFailures({
    checks: {
      missing: {
        label: "Verified address",
        required: true,
        passed: false,
      },
    },
  }),
  ["Verified address"],
);
assert.match(
  publicationBlockMessage(["Verified address"]),
  /Complete: Verified address/,
);
assert.equal(pilotOverrideReasonError("specific pilot reason"), null);
assert.match(pilotOverrideReasonError("too short"), /at least 12/i);

for (const requiredFragment of [
  "create or replace function public.salon_publication_diagnostic",
  "public.salon_lifecycle_diagnostic(p_salon_id)",
  "'actual_required_complete', v_raw_complete",
  "'all_required_complete', v_effective_complete",
  "'profile_public', v_profile_public",
  "'discovery_eligible', v_discovery_eligible",
  "create or replace function public.is_salon_profile_public",
  "create or replace function public.is_marketplace_visible",
  "create or replace function public.admin_activate_salon_application",
  "create or replace function public.admin_set_salon_publication_override",
  "create table if not exists public.salon_publication_override_audit",
  "before update or delete on public.salon_publication_override_audit",
  "and admin_user.status = 'Active'",
  "pilot_activation_override",
  "length(v_reason) < 12",
  "'PUBLICATION_GATES_INCOMPLETE'",
  "'idempotent', not v_changed",
  "add column if not exists slug text",
  "create unique index if not exists stylists_salon_slug_unique_idx",
  "add constraint stylists_slug_format_check",
  "before insert or update of slug on public.stylists",
  "if tg_op = 'INSERT' then",
  "Published stylist URLs are stable",
  "not style.is_draft",
  "public.salon_has_permission(id, 'my_page')",
]) {
  assert.ok(
    migration.includes(requiredFragment),
    `Publication migration is missing ${requiredFragment}`,
  );
}

const activationStart = migration.indexOf(
  "create or replace function public.admin_activate_salon_application",
);
const activationEnd = migration.indexOf(
  "revoke all on function public.salon_publication_diagnostic",
  activationStart,
);
assert.ok(activationStart >= 0 && activationEnd > activationStart);
const activationSql = migration.slice(activationStart, activationEnd);
for (const forbiddenFinancialMutation of [
  /(?:insert\s+into|update|delete\s+from)\s+public\.subscriptions/i,
  /(?:insert\s+into|update|delete\s+from)\s+public\.billing_events/i,
  /(?:insert\s+into|update|delete\s+from)\s+public\.stripe_webhook_events/i,
  /stripe_subscription_id\s*=/i,
  /subscription_status\s*=/i,
]) {
  assert.equal(
    forbiddenFinancialMutation.test(activationSql),
    false,
    `Activation may not mutate financial state: ${forbiddenFinancialMutation}`,
  );
}

for (const requiredFragment of [
  'decision === "activate"',
  'body.pilot_override === true',
  'admin.rpc("admin_activate_salon_application"',
  "publicationGateFailures(lifecycle)",
  "status: 409",
  '"Cache-Control": "private, no-store"',
  "override_active: overrideActive",
  "overridden_gate_labels: overriddenGateLabels",
  "idempotent: !changed",
]) {
  assert.ok(
    decisionRoute.includes(requiredFragment),
    `Activation route is missing ${requiredFragment}`,
  );
}

assert.match(applicationReview, /Recheck gates & publish if ready/);
assert.match(applicationReview, /Publish with audited pilot override/);
assert.match(applicationReview, /never creates a subscription or changes Stripe/);
assert.match(applicationReview, /Recorded gates:/);
assert.match(salonPage, /is_salon_profile_public/);
assert.match(salonPage, /const canBook =/);
assert.match(salonPage, /Bookings paused/);
assert.match(salonPage, /\.eq\("product_status", "Active"\)/);
assert.match(salonPage, /dispute_status\.neq\.Removed/);
assert.match(stylistPage, /is_salon_profile_public/);
assert.match(stylistPage, /is_marketplace_visible/);
assert.match(stylistPage, /legacyId/);
assert.match(stylistPage, /permanentRedirect/);
assert.match(stylistCards, /stylist\.slug \|\| stylist\.id/);
assert.match(publicMetadata, /is_salon_profile_public/);
assert.match(systemStatus, /EXPECTED_MIGRATION = REPOSITORY_MIGRATION_HEAD/);
assert.match(systemStatus, /generated\/repositoryMetadata/);

const hardenedReconcile = deletionHardening.match(
  /create or replace function public\.reconcile_salon_publication\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(hardenedReconcile, "Deletion hardening must retain publication reconciliation.");
for (const requiredFragment of [
  "v_before public.salons%rowtype",
  "v_after public.salons%rowtype",
  "v_override_effective boolean",
  "v_application_active boolean",
  "v_before.status = 'Active'",
  "and v_override_effective",
  "application.status = 'Active'",
  "v_after.status not in ('Suspended', 'Offboarded')",
  "Authorized pilot publication override remains effective",
  "pilot_publication_override",
  "if v_before.deleted_at is not null then",
]) {
  assert.ok(
    hardenedReconcile.includes(requiredFragment),
    `Deletion hardening regressed publication reconciliation: ${requiredFragment}`,
  );
}

console.log(
  "Publication activation verification passed: the canonical diagnostic separates raw and effective gates, normal activation and authorized pilot overrides are explicit and idempotent, financial records are untouched, profile visibility is distinct from bookability, RLS excludes draft content, and stylist URLs are stable with legacy UUID redirects.",
);
