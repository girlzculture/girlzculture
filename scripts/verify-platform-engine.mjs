import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260720170000_platform_engine_governance.sql");
const api = read("src/app/api/admin/engine/config/route.ts");
const publicApi = read("src/app/api/config/route.ts");
const dashboard = read("src/components/AdminDashboard.tsx");
const control = read("src/components/admin/EngineControlCenter.tsx");
const checkout = read("src/app/api/stripe/booking-checkout/route.ts");
const manualBooking = read("src/app/api/admin/bookings/route.ts");

const categories = [
  "general_branding", "identity_security", "salon_activation", "booking_rules",
  "payments_plans", "service_catalog", "search_language", "location_markets",
  "homepage_composition", "content_legal", "trust_badges", "notifications",
  "languages", "media", "quality_support", "test_data", "configuration_history",
];
for (const category of categories) assert.match(control, new RegExp(`\"${category}\"`));

assert.match(dashboard, /\["engine", "The Engine", SlidersHorizontal\]/);
assert.match(dashboard, /section === "engine" \? "settings"/);
assert.match(api, /requireAdminPermission\(request,"settings"\)/);
assert.match(migration, /enable row level security/g);
assert.match(migration, /SETTING_VERSION_CONFLICT/);
assert.match(migration, /HIGH_IMPACT_CONFIRMATION_REQUIRED/);
assert.match(migration, /engine_setting_versions/);
assert.match(migration, /revision=revision\+1/);
assert.match(migration, /revoke all on function public\.engine_apply_setting/);
assert.match(publicApi, /Cache-Control/);
assert.match(publicApi, /ETag/);
assert.match(control, /Save draft/);
assert.match(control, /Publish change/);
assert.match(control, /Restore/);
assert.match(control, /Secret values can never be viewed or edited/);
assert.match(checkout, /getEngineNumber\("booking\.deposit_percentage"/);
assert.match(manualBooking, /getEngineNumber\("booking\.deposit_percentage"/);
assert.doesNotMatch(control, /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);

console.log(`Platform Engine verification passed (${categories.length} governed categories).`);
