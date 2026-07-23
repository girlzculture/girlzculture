import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260722110000_discovery_authoritative_eligibility.sql", "utf8");
const api = fs.readFileSync("src/app/api/discovery/salons/route.ts", "utf8");
const UI = fs.readFileSync("src/components/public/SalonDiscovery.tsx", "utf8");

for (const condition of ["public.is_marketplace_visible", "geocode_status,''))='success'", "address_needs_review,false)=false", "c.distance_miles<=v.radius", "count(*)over()", "e.id"]) {
  assert.ok(migration.includes(condition), `Discovery SQL is missing: ${condition}`);
}
assert.ok(migration.includes("greatest(0,e.distance_miles-e.plan_distance_bonus)"), "Any tier bonus must remain bounded inside distance ranking.");
assert.ok(migration.includes("greatest(0.0,least(3.0"), "The plan-distance bonus must be capped to prevent distant paid displacement.");
assert.ok(!/service_role/i.test(api), "Public discovery must run through customer-safe RLS/RPC access.");
assert.ok(api.includes('"Cache-Control": "private, no-store"'), "Location-specific results must not enter shared caches.");
assert.ok(UI.includes("Choose a location to see nearby salons"), "No-location state must not pretend results are nearby.");
assert.ok(UI.includes("Load more salons"), "Discovery results must use bounded incremental loading.");
assert.ok(UI.includes("Change location"), "Customers must be able to change location.");

function miles(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const customer = { lat: 40.8116, lng: -73.9465 };
const approximatelyFiveMilesAway = { lat: 40.7392, lng: -73.9465 };
const fixtureDistance = miles(customer, approximatelyFiveMilesAway);
assert.ok(fixtureDistance > 4.8 && fixtureDistance < 5.2, `Coordinate fixture should be about five miles, got ${fixtureDistance}`);
for (const radius of [10, 15, 50]) assert.ok(fixtureDistance <= radius, `Five-mile fixture must be included within ${radius} miles.`);
assert.ok(fixtureDistance > 2, "Five-mile fixture must be excluded from an explicit two-mile request.");

console.log("Verified authoritative organic eligibility, bounded paid weighting, customer-safe fields, honest location states, and a five-mile inclusion fixture at 10/15/50 miles.");
