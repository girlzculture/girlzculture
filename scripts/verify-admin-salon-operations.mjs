import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260716140000_admin_salon_operations.sql");
const listApi = read("src/app/api/admin/salons/route.ts");
const detailApi = read("src/app/api/admin/salons/[id]/route.ts");
const manager = read("src/components/admin/AdminSalonsManager.tsx");
const dashboard = read("src/components/AdminDashboard.tsx");
const owner = read("src/components/owner/OwnerDashboardApp.tsx");

assert.match(migration, /create table if not exists public\.salon_status_audit/i);
assert.match(migration, /prevent_salon_status_audit_mutation/i);
assert.match(migration, /future_booking_count/i);
assert.match(migration, /admin_change_salon_status/i);
assert.match(migration, /internal reason of at least 5 characters/i);
assert.match(migration, /admin_list_salons/i);
assert.match(migration, /distance_miles\(/i);
assert.match(listApi, /requireAdminPermission\(request, "salons"\)/);
assert.match(listApi, /count: "exact", head: true/);
assert.match(detailApi, /admin_change_salon_status/);
assert.match(detailApi, /geocodeSalonAddress/);
assert.match(manager, /All states/);
assert.match(manager, /Address Needs Review/);
assert.match(manager, /View details/);
assert.match(manager, /future bookings will remain\s+in place/);
assert.match(manager, /Status history/);
assert.match(dashboard, /<AdminSalonsManager/);
assert.match(owner, /This salon is suspended/);
assert.match(owner, /lifecycleStatus==="offboarded"/);

console.log("Admin salon operations verification passed.");
