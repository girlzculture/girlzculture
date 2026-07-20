import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260720130000_salon_lifecycle_engine.sql");
const onboardingApi = read("src/app/api/salon/onboarding/route.ts");
const engineApi = read("src/app/api/admin/engine/lifecycle/route.ts");
const settings = read("src/components/admin/SalonLifecycleSettings.tsx");
const salons = read("src/components/admin/AdminSalonsManager.tsx");
const destination = read("src/app/api/auth/destination/route.ts");

for (const gate of ["application_approved", "structured_address", "precise_geocoding", "cover_photo", "gallery_photos", "business_details", "priced_service", "active_stylist", "business_hours", "active_subscription", "payout_account", "agreements"]) {
  assert.match(migration, new RegExp(`'${gate}'`));
}
assert.match(migration, /salon_lifecycle_diagnostic/);
assert.match(migration, /reconcile_salon_lifecycle/);
assert.match(migration, /Ready for Activation/);
assert.match(migration, /Needs Attention/);
assert.match(migration, /future_booking_count/);
assert.match(migration, /loss_behavior/);
assert.match(onboardingApi, /reconcile_salon_lifecycle/);
assert.match(engineApi, /requireAdminPermission\(request, "settings"\)/);
assert.match(engineApi, /reconciled/);
assert.match(settings, /Automatically activate eligible salons/);
assert.match(salons, /Public visibility diagnostic/);
assert.match(salons, /all_required_complete/);
assert.match(destination, /"\/pending"/);

console.log("Salon lifecycle engine verification passed.");
