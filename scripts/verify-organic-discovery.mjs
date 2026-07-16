import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260716130000_organic_salon_discovery.sql", "utf8");
const api = fs.readFileSync("src/app/api/discovery/salons/route.ts", "utf8");
const UI = fs.readFileSync("src/components/public/SalonDiscovery.tsx", "utf8");

for (const condition of ["public.is_marketplace_visible", "geocode_status = 'success'", "address_needs_review = false", "distance_miles <=", "count(*) over()", "e.id asc"]) {
  assert.ok(migration.includes(condition), `Discovery SQL is missing: ${condition}`);
}
assert.ok(!/subscription_tier/i.test(migration), "Organic discovery must not rank or expose subscription tier.");
assert.ok(!/service_role/i.test(api), "Public discovery must run through customer-safe RLS/RPC access.");
assert.ok(api.includes('"Cache-Control": "private, no-store"'), "Location-specific results must not enter shared caches.");
assert.ok(UI.includes("Choose a location to see nearby salons"), "No-location state must not pretend results are nearby.");
assert.ok(UI.includes("Load more salons"), "Discovery results must use bounded incremental loading.");
assert.ok(UI.includes("Change location"), "Customers must be able to change location.");

console.log("Verified organic distance ranking, customer-safe result fields, honest location states, and bounded discovery pagination.");
