import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLAN_ORDER,
  SUBSCRIPTION_PLANS,
  canonicalPlanForStored,
  planDowngradeLimitConflicts,
  restrictivePlanForLimits,
} from "../src/lib/plans.ts";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260831110000_official_subscription_plans_and_limits.sql",
    import.meta.url,
  ),
  "utf8",
);
const saveRoute = readFileSync(
  new URL("../src/app/api/salon/records/save/route.ts", import.meta.url),
  "utf8",
);
const cleanDatabase = readFileSync(
  new URL("./sql/verify-clean-database.sql", import.meta.url),
  "utf8",
);
const cleanDatabaseRunner = readFileSync(
  new URL("./verify-clean-database.mjs", import.meta.url),
  "utf8",
);
const bookingCheckout = readFileSync(
  new URL("../src/app/api/stripe/booking-checkout/route.ts", import.meta.url),
  "utf8",
);
const featuredProducts = readFileSync(
  new URL("../src/components/public/FeaturedProductPlacement.tsx", import.meta.url),
  "utf8",
);
const subscriptionChange = readFileSync(
  new URL(
    "../src/app/api/stripe/subscription/change/route.ts",
    import.meta.url,
  ),
  "utf8",
);
const salonRecordSave = readFileSync(
  new URL("../src/app/api/salon/records/save/route.ts", import.meta.url),
  "utf8",
);

assert.deepEqual(PLAN_ORDER, ["Starter", "Growth", "Premium"]);
assert.equal(canonicalPlanForStored("Basic"), "Starter");
assert.equal(SUBSCRIPTION_PLANS.Starter.entitlements.productListings.limit, 10);
assert.equal(SUBSCRIPTION_PLANS.Growth.entitlements.productListings.limit, 30);
assert.equal(SUBSCRIPTION_PLANS.Premium.entitlements.productListings.limit, null);
assert.equal(SUBSCRIPTION_PLANS.Starter.entitlements.customerPromotions.limit, 1);
assert.equal(SUBSCRIPTION_PLANS.Growth.entitlements.customerPromotions.limit, 5);
assert.equal(SUBSCRIPTION_PLANS.Premium.entitlements.customerPromotions.limit, null);
for (const plan of PLAN_ORDER) {
  assert.equal(
    SUBSCRIPTION_PLANS[plan].entitlements.marketplaceVisibility,
    "Standard",
  );
  assert.equal(
    SUBSCRIPTION_PLANS[plan].entitlements.appointmentCommissionPercent,
    0,
  );
}

assert.deepEqual(
  planDowngradeLimitConflicts("Starter", {
    productListings: 10,
    activePromotions: 1,
  }),
  [],
);
assert.equal(restrictivePlanForLimits("Premium", "Starter"), "Starter");
assert.equal(restrictivePlanForLimits("Growth", "Premium"), "Growth");
assert.equal(restrictivePlanForLimits("Premium", null), "Premium");
assert.equal(restrictivePlanForLimits(null, "Starter"), null);
assert.deepEqual(
  planDowngradeLimitConflicts("Growth", {
    productListings: 31,
    activePromotions: 6,
  }),
  [
    { resource: "product listings", count: 31, limit: 30, overBy: 1 },
    { resource: "active promotions", count: 6, limit: 5, overBy: 1 },
  ],
);
assert.deepEqual(
  planDowngradeLimitConflicts("Premium", {
    productListings: 100_000,
    activePromotions: 100_000,
  }),
  [],
);

assert.match(migration, /alter column selected_plan set default 'Starter'/);
assert.match(migration, /scheduled_tier in \('Starter', 'Growth', 'Premium', 'Basic'\)/);
assert.match(migration, /when 'starter' then 1/);
assert.match(migration, /when 'basic' then 1/);
assert.match(migration, /create or replace function public\.approve_salon_application/);
assert.match(migration, /when 'starter' then 'Starter'/);
assert.match(migration, /when 'basic' then 'Basic'/);
assert.match(migration, /message = 'UNRECOGNIZED_APPLICATION_PLAN'/);
assert.doesNotMatch(
  migration,
  /v_plan\s*:=\s*case[\s\S]*?else\s+'Basic'[\s\S]*?end;/,
);
assert.match(migration, /when 'featured_rotation' then false/);
assert.match(migration, /when 'premium_badge' then false/);
assert.match(migration, /salon_products_enforce_plan_limit/);
assert.match(migration, /salon_promotions_enforce_plan_limit/);
assert.match(migration, /salon_limit_plan_key/);
assert.match(migration, /subscriptions_enforce_scheduled_plan_limits/);
assert.match(migration, /PLAN_DOWNGRADE_PRODUCT_LIMIT_EXCEEDED/);
assert.match(migration, /PLAN_DOWNGRADE_PROMOTION_LIMIT_EXCEEDED/);
assert.match(migration, /pg_advisory_xact_lock/g);
assert.match(migration, /PLAN_PRODUCT_LIMIT_REACHED/);
assert.match(migration, /PLAN_PROMOTION_LIMIT_REACHED/);
assert.match(migration, /FEATURED_PRODUCT_ENTITLEMENT_REQUIRED/);
assert.match(migration, /FEATURED_PRODUCT_ENTITLEMENT_INVALID/);
assert.match(migration, /subscription\.tier/);
assert.match(migration, /not exists \([\s\S]*from public\.subscriptions subscription/);
assert.match(
  migration,
  /create or replace function public\.salon_effective_plan_key/,
);
assert.equal(
  (migration.match(/public\.salon_effective_plan_key\(target_salon_id\)/g) || [])
    .length,
  2,
);
assert.doesNotMatch(
  migration,
  /advanced_analytics[\s\S]{0,180}salon\.subscription_tier/,
);
assert.match(migration, /when 'premium' then null/);
assert.match(migration, /else 0/);
assert.doesNotMatch(
  migration,
  /^update\s+public\.(salons|subscriptions|salon_applications)\b/im,
);
assert.doesNotMatch(migration, /delete\s+from|truncate\s+|drop\s+table/i);

assert.match(saveRoute, /enforcePlanAllowance/);
assert.match(saveRoute, /entitlements\.productListings\.limit/);
assert.match(saveRoute, /entitlements\.customerPromotions\.limit/);
assert.match(saveRoute, /status:\s*409/);

assert.match(subscriptionChange, /enforceDowngradePlanLimits/);
assert.match(
  subscriptionChange,
  /SUBSCRIPTION_PLANS\[input\.targetPlan\]\.entitlements/,
);
assert.match(
  subscriptionChange,
  /product_status\.is\.null,product_status\.neq\.Archived/,
);
assert.match(
  subscriptionChange,
  /\.eq\("is_active", true\)[\s\S]*?\.eq\("status", "Active"\)/,
);
assert.match(
  subscriptionChange,
  /if \(!isUpgrade\)[\s\S]*?await enforceDowngradePlanLimits\([\s\S]*?\/subscription_schedules/,
);
assert.match(subscriptionChange, /This downgrade cannot be scheduled yet/);
assert.match(subscriptionChange, /409/);
assert.match(subscriptionChange, /release-unpersisted-schedule/);
assert.match(
  subscriptionChange,
  /PLAN_DOWNGRADE_PRODUCT_LIMIT_EXCEEDED[\s\S]*?PLAN_DOWNGRADE_PROMOTION_LIMIT_EXCEEDED[\s\S]*?409/,
);

assert.match(salonRecordSave, /restrictivePlanForLimits/);
assert.match(
  salonRecordSave,
  /select\("tier,status,current_period_end,scheduled_tier"\)/,
);

assert.match(cleanDatabase, /Starter product limit was not enforced by the database/);
assert.match(cleanDatabase, /Growth promotion limit was not enforced by the database/);
assert.match(cleanDatabase, /Tier-only homepage product placement was not rejected/);
assert.match(cleanDatabase, /expired subscription was allowed to create a product/i);
assert.match(cleanDatabase, /legacy, inactive, downgrade, or drifted plan allowances/i);
assert.match(
  cleanDatabase,
  /Advanced analytics did not use the authoritative effective subscription plan/,
);
assert.match(cleanDatabase, /mismatched homepage product entitlement was accepted/i);
assert.match(cleanDatabase, /Starter application approval did not preserve the selected plan/);
assert.match(cleanDatabase, /A downgrade was scheduled above the target product limit/);
assert.match(cleanDatabase, /A downgrade was scheduled above the target promotion limit/);
assert.match(cleanDatabase, /Scheduled downgrade limits were bypassed by a later inventory write/);

assert.match(cleanDatabaseRunner, /runConcurrentPlanBoundaryWorkers/);
assert.match(cleanDatabaseRunner, /Starter product-limit race/);
assert.match(cleanDatabaseRunner, /Growth product-limit race/);
assert.match(cleanDatabaseRunner, /Starter promotion-limit race/);
assert.match(cleanDatabaseRunner, /Growth promotion-limit race/);
assert.match(cleanDatabaseRunner, /select pg_sleep\(0\.4\)/);
assert.match(cleanDatabaseRunner, /boundaryCounts !== "10,30,1,5"/);
assert.match(
  cleanDatabaseRunner,
  /32 concurrent database transactions/,
);
assert.match(cleanDatabaseRunner, /runScheduledDowngradeWriterRace/);
assert.match(
  cleanDatabaseRunner,
  /Scheduled downgrade versus product writer race/,
);
assert.match(
  cleanDatabaseRunner,
  /Scheduled downgrade versus promotion writer race/,
);
assert.match(
  cleanDatabaseRunner,
  /scheduleOutcome === "scheduled" && writeOutcome === "write_limit"/,
);
assert.match(
  cleanDatabaseRunner,
  /scheduleOutcome === "schedule_limit" && writeOutcome === "inserted"/,
);
assert.match(cleanDatabaseRunner, /expectedProductState[\s\S]*?"Starter,10"[\s\S]*?",11"/);
assert.match(cleanDatabaseRunner, /expectedPromotionState[\s\S]*?"Starter,1"[\s\S]*?",2"/);
assert.match(
  cleanDatabaseRunner,
  /scheduled downgrade atomicity against product and promotion writers with four worker transactions \(two concurrent workers per race\)/i,
);

assert.match(featuredProducts, /entitlement:marketing_entitlements/);
assert.match(featuredProducts, /entitlement\.placement_type === "Featured Product"/);
assert.match(featuredProducts, /\["Paid", "Credited"\]/);

assert.doesNotMatch(bookingCheckout, /application_fee_amount/);
assert.match(bookingCheckout, /platform_fee:\s*0/);

console.log(
  "Founder plan enforcement source checks passed: canonical allowances, shared authoritative plan resolution, wired concurrent database boundary verification, entitlement separation, legacy compatibility, and 0% booking commission. Runtime SQL and race assertions remain part of the clean-database workflow.",
);
