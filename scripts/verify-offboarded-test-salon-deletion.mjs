import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20260804210000_offboarded_test_salon_protected_deletion.sql",
);
const authoritative = read(
  "supabase/migrations/20260807020000_authoritative_submission_lifecycle.sql",
);
const api = read("src/app/api/admin/records/route.ts");
const manager = read("src/components/admin/RecordLifecycleManager.tsx");
const salonList = read("src/app/api/admin/salons/route.ts");
const adminData = read("src/app/api/admin/data/route.ts");
const authoritativePublication = read(
  "supabase/migrations/20260727230000_publication_activation_and_stylist_slugs.sql",
);

// The strict registered-test cleanup remains impossible for an active salon,
// an unmarked real salon, a non-super-admin, or a request without recent
// high-risk authentication and an exact environment match.
assert.match(
  migration,
  /Only a Super Admin can permanently delete an offboarded test salon/,
);
assert.match(
  migration,
  /lower\(trim\(coalesce\(v_salon\.status, ''\)\)\) <> 'offboarded'/,
);
assert.match(migration, /registry\.record_type = 'salon'/);
assert.match(migration, /registry\.record_id = p_salon_id::text/);
assert.match(
  migration,
  /This salon is not explicitly registered as test data/,
);
assert.match(migration, /maintenance\.test_data_enabled/);
assert.match(migration, /status = 'Published'/);
assert.match(migration, /if not coalesce\(v_enabled, false\)/);
assert.match(
  migration,
  /p_environment not in \('development', 'preview', 'production'\)/,
);
assert.match(migration, /v_batch\.environment is distinct from p_environment/);
assert.match(migration, /v_batch\.status = 'Cleared'/);
assert.match(migration, /DELETE TEST SALON /);
assert.match(
  migration,
  /length\(trim\(coalesce\(p_reason, ''\)\)\) < 8/,
);
assert.match(
  api,
  /assertRecentHighRiskVerification\(admin, user\.id, "admin"\)/,
);
assert.match(api, /is_super_admin/);
assert.match(api, /acknowledge_retention/);
assert.match(api, /state\.eligible/);
assert.match(api, /trustedDeploymentEnvironment/);
assert.match(api, /process\.env\.CONTEXT/);
assert.doesNotMatch(api, /NODE_ENV\s*===\s*"production"[\s\S]*return "production"/);
assert.match(api, /maintenance\.test_data_enabled/);
assert.match(api, /maintenance\.data\?\.status === "Published"/);
assert.match(api, /batch\?\.environment === environment/);
assert.match(api, /p_environment: state\.environment/);
assert.match(
  migration,
  /grant execute on function public\.admin_delete_offboarded_test_salon\(uuid,uuid,text,text,text,jsonb\)\s+to service_role/,
);

// The platform owner also has a distinct audited operational-deletion action.
// It does not weaken or replace the registered-test workflow above.
assert.match(authoritative, /create or replace function public\.admin_operationally_delete_salon/);
assert.match(authoritative, /Only a Super Admin can permanently remove a salon from operational records/);
assert.match(authoritative, /DELETE SALON /);
assert.match(authoritative, /tombstone_retained/);
assert.match(authoritative, /financial_history_retained/);
assert.match(authoritative, /booking_history_retained/);
assert.match(authoritative, /audit_history_retained/);
assert.match(authoritative, /delete from public\.salon_applications where salon_id=p_salon_id/);
assert.doesNotMatch(authoritative, /delete from public\.bookings/i);
assert.doesNotMatch(authoritative, /delete from public\.subscriptions/i);
assert.doesNotMatch(authoritative, /delete from public\.billing_events/i);
assert.match(api, /actions: \["offboard", "delete", "delete_test"\]/);
assert.match(api, /admin_operationally_delete_salon/);
assert.match(api, /owner_confirmation_phrase/);
assert.match(api, /DELETE SALON/);
assert.match(manager, /Super Admin permanent action/);
assert.match(manager, /ownerConfirmation/);
assert.match(manager, /Permanently delete registered test salon/);
assert.match(manager, /Permanently delete/);

// Permanent test cleanup means operational removal backed by a hidden
// tombstone; it must never cascade-delete financial or booking evidence.
assert.doesNotMatch(migration, /delete from public\.salons/i);
for (const protectedTable of [
  "bookings",
  "subscriptions",
  "billing_events",
  "booking_financial_events",
  "booking_refund_operations",
  "salon_recovery_balances",
  "subscription_change_requests",
  "product_orders",
]) {
  assert.doesNotMatch(
    migration,
    new RegExp(`delete\\s+from\\s+public\\.${protectedTable}`, "i"),
  );
}
for (const retainedFlag of [
  "financial_history_deleted', false",
  "booking_history_deleted', false",
  "refund_history_deleted', false",
  "subscription_history_deleted', false",
  "audit_history_deleted', false",
])
  assert.match(migration, new RegExp(retainedFlag));
assert.match(migration, /guest_email = null/);
assert.match(migration, /salon_test_deletion_audit/);
assert.match(migration, /Test salon deletion audit records are immutable/);
assert.match(migration, /record_management_events/);
assert.match(migration, /integrations\.expected_migration/);
assert.match(migration, /20260804210000/);

// The tombstone must release every public URL/social identifier while keeping
// the provider account key needed to reconcile retained financial history.
const tombstoneUpdate = migration.match(
  /update public\.salons\s+set name = 'Deleted test salon '[\s\S]*?where id = p_salon_id;/,
)?.[0];
assert.ok(tombstoneUpdate, "Expected the protected salon tombstone update.");
for (const clearedField of [
  "slug",
  "vanity_slug",
  "instagram_url",
  "tiktok_url",
  "google_business_url",
  "formatted_address",
  "address_fingerprint",
]) {
  assert.match(
    tombstoneUpdate,
    new RegExp(`\\b${clearedField}\\s*=\\s*null\\b`),
  );
}
assert.doesNotMatch(tombstoneUpdate, /stripe_account_id\s*=/);
assert.match(migration, /stripe_account_id_retained_for_reconciliation', true/);
assert.match(
  migration,
  /retained_salon\.stripe_account_id is distinct from v_salon\.stripe_account_id/,
);
assert.match(
  migration,
  /salon_vanity_slug_available\(v_salon\.vanity_slug, null\)/,
);
assert.match(
  migration,
  /salon_slug_redirects[\s\S]*retired_at = coalesce\(retired_at, now\(\)\)/,
);
assert.match(tombstoneUpdate, /approved_at\s*=\s*null/);

// Address and lifecycle triggers execute inside the tombstone UPDATE. Their
// latest definitions must special-case deleted rows, and the deletion function
// must assert the final post-trigger row rather than trusting its SET clause.
assert.match(
  migration,
  /create or replace function public\.prepare_salon_geocoding\(\)[\s\S]*if new\.deleted_at is not null then[\s\S]*new\.address_fingerprint := null/,
);
assert.match(
  migration,
  /update of address_street,[\s\S]*deleted_at[\s\S]*execute function public\.prepare_salon_geocoding/,
);
assert.match(
  migration,
  /create or replace function public\.reconcile_salon_publication\([\s\S]*if v_before\.deleted_at is not null then[\s\S]*set slug = null,[\s\S]*vanity_slug = null/,
);
assert.match(migration, /final_salon\.slug is not null/);
assert.match(migration, /final_salon\.vanity_slug is not null/);
assert.match(migration, /final_salon\.instagram_url is not null/);
assert.match(migration, /final_salon\.tiktok_url is not null/);
assert.match(migration, /final_salon\.google_business_url is not null/);
assert.match(migration, /final_salon\.address_fingerprint is not null/);
assert.match(migration, /final_salon\.geocode_status <> 'needs_review'/);
assert.match(
  migration,
  /final_salon\.address_needs_review is distinct from true/,
);
assert.match(
  migration,
  /retained or regenerated a public identifier after lifecycle and address triggers/,
);

// The deletion-hardened publication reconciliation must retain every
// authoritative activation/override branch introduced by the prior definition.
const authoritativeReconcile = authoritativePublication.match(
  /create or replace function public\.reconcile_salon_publication\([\s\S]*?\n\$\$;/,
)?.[0];
const hardenedReconcile = migration.match(
  /create or replace function public\.reconcile_salon_publication\([\s\S]*?\n\$\$;/,
)?.[0];
assert.ok(
  authoritativeReconcile,
  "Expected the authoritative publication reconciliation function.",
);
assert.ok(
  hardenedReconcile,
  "Expected the deletion-hardened publication reconciliation function.",
);
for (const marker of [
  "v_before public.salons%rowtype",
  "v_after public.salons%rowtype",
  "v_diagnostic jsonb",
  "v_override_effective boolean",
  "v_application_active boolean",
  "v_future_count integer",
  "v_before.status = 'Active'",
  "and v_override_effective",
  "application.status = 'Active'",
  "v_after.status not in ('Suspended', 'Offboarded')",
  "Authorized pilot publication override remains effective",
  "pilot_publication_override",
  "lifecycle_reason = 'Authorized pilot publication override'",
]) {
  assert.ok(
    authoritativeReconcile.includes(marker),
    `Authoritative reconciliation is missing ${marker}`,
  );
  assert.ok(
    hardenedReconcile.includes(marker),
    `Hardened reconciliation regressed ${marker}`,
  );
}
assert.match(hardenedReconcile, /if v_before\.deleted_at is not null then/);

// UI distinguishes ordinary offboarding, owner-authoritative deletion, and the
// stricter registered-test cleanup. It shows retention effects and exact typed
// confirmations without decorative icon dependencies.
assert.match(manager, /Permanently delete registered test salon/);
assert.match(manager, /Offboard/);
assert.match(manager, /History explicitly retained/);
assert.match(manager, /hidden tombstone/);
assert.match(manager, /acknowledgeRetention/);
assert.match(manager, /confirmation_phrase/);
assert.match(manager, /protectedDeletionPreviewUnavailable/);
assert.match(manager, /Dependency counts could not be verified/);
assert.match(manager, /protectedActionUnavailable/);
assert.match(manager, /disabled=\{protectedActionUnavailable\}/);
assert.match(manager, /readApiResponse/);
assert.match(manager, /safeApiError/);
assert.doesNotMatch(manager, /response\.json\(\)/);
assert.doesNotMatch(manager, /lucide-react/);

// Tombstones disappear from both salon inventory and aggregate admin data.
assert.match(salonList, /deleted_at/);
assert.match(salonList, /deletedIds/);
assert.match(adminData, /table === "salons"/);
assert.match(adminData, /deleted_at/);
assert.match(api, /query\.is\("deleted_at", null\)/);

console.log(
  "Verified strict registered-test cleanup plus separately audited Super Admin operational salon deletion, with immutable financial and booking history retained.",
);
