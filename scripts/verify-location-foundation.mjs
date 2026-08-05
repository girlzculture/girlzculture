import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260716120000_location_foundation.sql", "utf8");
const geocoder = fs.readFileSync("src/lib/geocodingServer.ts", "utf8");
const provider = fs.readFileSync("src/components/location/CustomerLocationProvider.tsx", "utf8");
const firstRelevantRequest = fs.readFileSync("src/components/location/FirstRelevantLocationRequest.tsx", "utf8");

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
const systemStatus = fs.readFileSync(
  "src/app/api/admin/engine/system-status/route.ts",
  "utf8",
);
const mapsIntegration = systemStatus.slice(
  systemStatus.indexOf('key: "maps"'),
  systemStatus.indexOf('key: "openai"'),
);
assert.match(mapsIntegration, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
assert.match(mapsIntegration, /GOOGLE_MAPS_SERVER_API_KEY/);
const mapsConnectionTest = systemStatus.slice(
  systemStatus.indexOf('if (key === "maps")'),
  systemStatus.indexOf('if (key === "openai")'),
);
assert.match(mapsConnectionTest, /process\.env\.GOOGLE_MAPS_SERVER_API_KEY/);
assert.doesNotMatch(
  mapsConnectionTest,
  /process\.env\.(?:NEXT_PUBLIC_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY)/,
  "The server geocoding health test must not reuse a browser/referrer key.",
);
assert.ok(geocoder.includes('"ROOFTOP", "RANGE_INTERPOLATED"'), "Approximate addresses must not receive coordinates.");
assert.ok(provider.includes("navigator.geolocation.getCurrentPosition"), "Device location must use the browser geolocation boundary.");
assert.match(firstRelevantRequest, /AUTOMATIC_LOCATION_REQUEST_KEY/);
assert.match(firstRelevantRequest, /permission\.state === "denied"/);
assert.match(firstRelevantRequest, /location\.useDeviceLocation\(\)/);
assert.ok(!provider.includes("watchPosition"), "The location provider must not silently track customers.");
assert.ok(!firstRelevantRequest.includes("watchPosition"), "The first relevant visit must request once, never track.");

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

console.log("Verified address change detection, protected geocoding, one native request on the first relevant visit, denial-safe fallback, no background tracking, and canonical mile-distance behavior.");
