import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260720170000_platform_engine_governance.sql");
const api = read("src/app/api/admin/engine/config/route.ts");
const publicApi = read("src/app/api/config/route.ts");
const dashboard = read("src/components/AdminDashboard.tsx");
const control = read("src/components/admin/EngineControlCenter.tsx");
const manifest = read("src/lib/engineManifest.ts");
const checkout = read("src/app/api/stripe/booking-checkout/route.ts");
const manualBooking = read("src/app/api/admin/bookings/route.ts");

const categories = [
  "branding_design", "navigation_menus", "pages_sections", "homepage_composition",
  "service_taxonomies", "salon_lifecycle", "booking_availability", "payments_subscriptions",
  "search_discovery", "markets_service_areas", "media_uploads", "languages_translations",
  "notifications_templates", "trust_quality", "promotions_campaigns", "customer_support",
  "users_roles", "ai_automation", "test_data_maintenance", "integrations_system", "configuration_history",
];
for (const category of categories) assert.match(manifest, new RegExp(`"${category}"`));

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
assert.match(control, /Secret values\s+can never be viewed or edited in Engine/);
assert.match(control, /beforeunload/);
assert.match(control, /Search all Engine controls/);
assert.match(checkout, /getEngineNumber\("booking\.deposit_percentage"/);
assert.match(manualBooking, /getEngineNumber\("booking\.deposit_percentage"/);
assert.doesNotMatch(control, /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);

console.log(`Platform Engine verification passed (${categories.length} governed areas).`);
