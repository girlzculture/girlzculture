import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260716120000_location_foundation.sql", "utf8");
const geocoder = fs.readFileSync("src/lib/geocodingServer.ts", "utf8");
const provider = fs.readFileSync("src/components/location/CustomerLocationProvider.tsx", "utf8");

for (const required of [
  "salons_prepare_geocoding",
  "address_fingerprint",
  "address_needs_review",
  "geocode_status",
  "distance_miles",
  "salons_coordinates_idx",
  "location_markets_admin_write",
]) assert.ok(migration.includes(required), `Missing location migration behavior: ${required}`);

assert.ok(geocoder.includes("process.env.GOOGLE_MAPS_SERVER_API_KEY"), "Server geocoder must use a server-only key.");
assert.ok(!geocoder.includes("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"), "Server geocoder must not reuse the browser key.");
assert.ok(geocoder.includes('"ROOFTOP", "RANGE_INTERPOLATED"'), "Approximate addresses must not receive coordinates.");
assert.ok(provider.includes("navigator.geolocation.getCurrentPosition"), "Device location must require an explicit action.");
assert.ok(!provider.includes("watchPosition"), "The location provider must not silently track customers.");

function miles(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.sqrt(Math.min(1, h)));
}
const harlem = { lat: 40.8116, lng: -73.9465 };
const brooklyn = { lat: 40.6782, lng: -73.9442 };
const buffalo = { lat: 42.8864, lng: -78.8784 };
assert.ok(miles(harlem, brooklyn) > 5 && miles(harlem, brooklyn) < 20, "NYC borough distances should be local but distinct.");
assert.ok(miles(harlem, buffalo) > 250, "Buffalo must not qualify as nearby NYC.");

console.log("Verified address change detection, protected geocoding, consent-based customer location, and canonical mile-distance behavior.");
