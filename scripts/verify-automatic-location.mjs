import assert from "node:assert/strict";
import fs from "node:fs";
import {
  approximateLocationFromHeaders,
  approximateLocationFromProviderPayload,
} from "../src/lib/approximateLocationCore.ts";
import netlifyApproximateLocation from "../netlify/edge-functions/approximate-location.ts";

const headerLocation = approximateLocationFromHeaders(
  new Headers({
    "x-vercel-ip-latitude": "40.7128",
    "x-vercel-ip-longitude": "-74.0060",
    "x-vercel-ip-city": "New York",
    "x-vercel-ip-country-region": "NY",
    "x-forwarded-for": "203.0.113.20",
  }),
);
assert.deepEqual(headerLocation, {
  lat: 40.7128,
  lng: -74.006,
  label: "New York, NY",
  source: "approximate",
});
assert.doesNotMatch(JSON.stringify(headerLocation), /203\.0\.113\.20/);

assert.deepEqual(
  approximateLocationFromProviderPayload({
    latitude: 33.749,
    longitude: -84.388,
    city: "Atlanta",
    region_code: "GA",
    ip: "198.51.100.8",
  }),
  {
    lat: 33.749,
    lng: -84.388,
    label: "Atlanta, GA",
    source: "approximate",
  },
);

const edgeResponse = await netlifyApproximateLocation(
  new Request("https://girlzculture.com/api/location/resolve"),
  {
    geo: {
      city: "Brooklyn",
      subdivision: { code: "NY" },
      latitude: 40.6782,
      longitude: -73.9442,
    },
  },
);
assert.ok(edgeResponse instanceof Response);
assert.deepEqual((await edgeResponse.json()).location, {
  lat: 40.6782,
  lng: -73.9442,
  label: "Brooklyn, NY",
  source: "approximate",
});
assert.equal(edgeResponse.headers.get("cache-control"), "private, no-store");

const provider = fs.readFileSync(
  "src/components/location/CustomerLocationProvider.tsx",
  "utf8",
);
assert.match(provider, /localStorage\.setItem/);
assert.match(provider, /permission\.state === "granted"/);
assert.match(provider, /\/api\/location\/resolve/);
assert.match(provider, /search\.default_radius_miles/);
for (const placement of [
  "NearbySalonPlacement.tsx",
  "FeaturedSalonPlacement.tsx",
  "TrendingVideoPlacement.tsx",
]) {
  const source = fs.readFileSync(`src/components/public/${placement}`, "utf8");
  assert.match(source, /radiusMiles/);
  assert.doesNotMatch(source, /LocationAutocomplete|Use my location/);
}

console.log(
  "Automatic location verification passed: edge/header/provider resolution returns city-level coordinates without IP data, explicit/stored precedence is wired, and local placements use the Engine radius.",
);
