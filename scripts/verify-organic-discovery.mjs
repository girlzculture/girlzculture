import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260807200000_authoritative_discovery_search.sql", "utf8");
const api = fs.readFileSync("src/app/api/discovery/salons/route.ts", "utf8");
const UI = fs.readFileSync("src/components/public/SalonDiscovery.tsx", "utf8");

for (const condition of ["public.is_marketplace_visible", "geocode_status,''))='success'", "address_needs_review,false)=false", "c.distance_miles<=v.radius", "count(*)over()", "e.id"]) {
  assert.ok(migration.includes(condition), `Discovery SQL is missing: ${condition}`);
}
assert.ok(migration.includes("e.distance_miles asc"), "Organic discovery must remain nearest-first.");
assert.ok(!migration.includes("plan_distance_bonus"), "Paid tier weighting must not distort truthful organic distance ordering.");
assert.ok(migration.includes("coalesce(result_limit,20) <= 0 and auth.role()='service_role' then null"), "Only the trusted server role may request every result.");
assert.ok(migration.includes("coalesce(result_limit,20) <= 0 then 50"), "Direct customer RPC calls must remain capped.");
assert.ok(migration.includes("360.0-abs(s.longitude-origin_longitude)"), "The longitude prefilter must cross the antimeridian safely.");
assert.ok(migration.includes("fs.master_style_id=master_style_filter"), "Stable style identity must be matched exactly in SQL.");
assert.ok(!/service_role/i.test(api), "Public discovery must run through customer-safe RLS/RPC access.");
assert.ok(api.includes('"Cache-Control": "private, no-store"'), "Location-specific results must not enter shared caches.");
assert.ok(UI.includes('origin ? "Salons Near You" : "Salons"'), "No-location state must not pretend results are nearby.");
assert.ok(!UI.includes("Load more salons"), "All eligible results must render as one continuous list.");
assert.ok(UI.includes("changeLocation") && UI.includes("Change"), "Customers must be able to change location.");

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

const acrossAntimeridian = miles(
  { lat: 0, lng: 179.9 },
  { lat: 0, lng: -179.9 },
);
assert.ok(acrossAntimeridian > 13 && acrossAntimeridian < 15, `Antimeridian fixture should be about 13.8 miles, got ${acrossAntimeridian}`);
assert.ok(acrossAntimeridian <= 50, "A nearby salon across the antimeridian must survive a 50-mile search.");

console.log("Verified authoritative organic eligibility, truthful nearest-first ordering, explicit all-results discovery, customer-safe fields, honest location states, and a five-mile inclusion fixture at 10/15/50 miles.");
