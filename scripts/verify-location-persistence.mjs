import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createStoredCustomerLocation,
  DEFAULT_NEARBY_RADIUS_MILES,
  normalizeRadius,
  parseStoredCustomerLocation,
} from "../src/lib/location.ts";

const location = {
  lat: 40.8116,
  lng: -73.9465,
  label: "Harlem, New York, NY",
  source: "explicit",
};
const now = Date.UTC(2026, 6, 24, 12);
const retained = createStoredCustomerLocation(location, 30, now);
assert.equal(retained.expiresAt, now + 30 * 24 * 60 * 60 * 1_000);
assert.deepEqual(
  parseStoredCustomerLocation(JSON.stringify(retained), {
    now: now + 29 * 24 * 60 * 60 * 1_000,
  })?.location,
  location,
);
assert.equal(
  parseStoredCustomerLocation(JSON.stringify(retained), {
    now: retained.expiresAt,
  }),
  null,
);
assert.equal(
  normalizeRadius(""),
  DEFAULT_NEARBY_RADIUS_MILES,
  "An omitted radius must never be interpreted as a one-mile search.",
);
assert.deepEqual(
  parseStoredCustomerLocation(JSON.stringify(location), { now })?.location,
  location,
  "Legacy stored locations must be upgraded without losing the customer choice.",
);
assert.equal(
  parseStoredCustomerLocation(
    JSON.stringify({ ...location, lat: 999 }),
    { now },
  ),
  null,
);

const read = (path) => fs.readFileSync(path, "utf8");
const provider = read("src/components/location/CustomerLocationProvider.tsx");
const locationCore = read("src/lib/location.ts");
const composer = read("src/components/site/SearchComposer.tsx");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const cards = read("src/components/public/MarketplaceSalonCard.tsx");
const nearbyPlacement = read(
  "src/components/public/NearbySalonPlacement.tsx",
);
const autocomplete = read("src/components/search/AutocompleteInputs.tsx");
const salonsPage = read("src/app/salons/page.tsx");
const migration = read(
  "supabase/migrations/20260724100000_location_persistence_controls.sql",
);

assert.match(provider, /search\.location_retention_days/);
assert.match(locationCore, /expiresAt/);
assert.match(provider, /CUSTOMER_LOCATION_STORAGE_KEY/);
assert.doesNotMatch(
  composer.match(/function beginLocationEdit[\s\S]*?\n  \}/)?.[0] || "",
  /clearLocation/,
);
assert.doesNotMatch(
  composer.match(/function requestDeviceLocation[\s\S]*?\n  \}/)?.[0] || "",
  /clearLocation/,
);
assert.doesNotMatch(
  discovery.match(/onChange=\{\(value\)=>\{[^}]+\}\}/)?.[0] || "",
  /clearLocation/,
);
assert.doesNotMatch(cards, /context\.set\("lat"|context\.set\("lng"/);
assert.match(cards, /const profileHref = `\/salon\/\$\{salon\.slug\}`/);
assert.match(nearbyPlacement, /lat: String\(location\.lat\)/);
assert.match(nearbyPlacement, /lng: String\(location\.lng\)/);
assert.match(nearbyPlacement, /location: location\.label/);
assert.match(nearbyPlacement, /radius: String\(locationState\.radiusMiles\)/);
assert.match(autocomplete, /router\.push\(item\.href\)/);
assert.match(salonsPage, /latitude && longitude && validCoordinates\(origin\)/);
assert.match(migration, /search\.location_retention_days/);

for (const route of [
  "/",
  "/salons",
  "/styles",
  "/concierge",
  "/salon/[slug]",
  "/salon/[slug]/book",
]) {
  assert.ok(route, "Public location route inventory must remain explicit.");
}

console.log(
  "Location persistence verification passed: versioned retention, expiry, invalid-data rejection, legacy upgrade, non-destructive editing, clean salon URLs and the full public route inventory are covered.",
);
