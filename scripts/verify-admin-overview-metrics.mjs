import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read(
  "supabase/migrations/20260809130000_platform_admin_overview_metrics.sql",
);
assert.match(
  migration,
  /create or replace function public\.platform_admin_overview_metrics\(\)/i,
);
assert.match(migration, /security definer/i);
assert.match(migration, /stable/i);
assert.match(migration, /set search_path = pg_catalog, public/i);
assert.match(migration, /salon\.deleted_at is null/i);
assert.match(migration, /salon\.status = 'Active'/i);
assert.match(migration, /application\.status = 'Pending'/i);
assert.match(migration, /application\.archived_at is null/i);
assert.match(
  migration,
  /lower\(coalesce\(booking\.status, ''\)\) = 'completed'/i,
);
assert.match(
  migration,
  /in \('paid', 'succeeded', 'complete', 'completed'\)[\s\S]*payment_verified_at is not null/i,
);
assert.match(
  migration,
  /revoke all on function public\.platform_admin_overview_metrics\(\)[\s\S]*from public, anon, authenticated/i,
);
assert.match(
  migration,
  /grant execute on function public\.platform_admin_overview_metrics\(\)[\s\S]*to service_role/i,
);
assert.match(migration, /integrations\.expected_migration/i);
assert.match(migration, /20260809130000/);

const route = read("src/app/api/admin/overview-metrics/route.ts");
assert.match(route, /requireAdminPermission\(request, "overview"\)/);
assert.match(route, /admin\.rpc\("platform_admin_overview_metrics"\)/);
assert.match(route, /withOperationalMonitoring/);
assert.match(route, /routeMonitoringProfile\("\/api\/admin\/overview-metrics"/);
assert.match(route, /safeMessage: "Platform overview metrics could not be loaded\."/);
assert.doesNotMatch(route, /Response\.json\([^\n]*error\.message/);

const dashboard = read("src/components/AdminDashboard.tsx");
assert.match(dashboard, /fetch\("\/api\/admin\/overview-metrics"/);
for (const metric of [
  "total_salons",
  "active_salons",
  "pending_submissions",
  "total_customers",
  "total_bookings",
  "completed_booking_value",
  "deposits_collected",
]) {
  assert.match(dashboard, new RegExp(`metrics\\.${metric}`));
}
assert.match(dashboard, /Unable to load authoritative platform totals\./);

const monitoringInventory = read(
  "docs/OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md",
);
assert.match(
  monitoringInventory,
  /\| `\/api\/admin\/overview-metrics` \| GET \| protected \| Covered \|/,
);

const cleanDatabaseAssertions = read("scripts/sql/verify-clean-database.sql");
assert.match(
  cleanDatabaseAssertions,
  /to_regprocedure\('public\.platform_admin_overview_metrics\(\)'\)/,
);
assert.match(cleanDatabaseAssertions, /procedure\.prosecdef/);
assert.match(cleanDatabaseAssertions, /procedure\.provolatile = 's'/);
assert.match(cleanDatabaseAssertions, /search_path=pg_catalog, public/);
assert.match(
  cleanDatabaseAssertions,
  /has_function_privilege\([\s\S]*'anon'[\s\S]*platform_admin_overview_metrics/,
);
assert.match(
  cleanDatabaseAssertions,
  /overview_metrics\.total_salons[\s\S]*select count\(\*\)[\s\S]*public\.salons/,
);
assert.match(
  cleanDatabaseAssertions,
  /overview_metrics\.pending_submissions[\s\S]*status='Pending' and archived_at is null/,
);

console.log("Platform Admin Overview metrics verification passed.");
