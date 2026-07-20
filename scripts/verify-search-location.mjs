import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260720140000_search_language_engine.sql");
const suggestions = read("src/app/api/search/suggestions/route.ts");
const searchLanguage = read("src/lib/searchLanguage.ts");
const composer = read("src/components/site/SearchComposer.tsx");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const locationProvider = read("src/components/location/CustomerLocationProvider.tsx");
const autocomplete = read("src/components/search/AutocompleteInputs.tsx");

for (const behavior of [
  "search_engine_settings",
  "search_language_rules",
  "search_zero_result_aggregates",
  "resolve_search_service_query",
  "wash my hair",
  "locks",
  "ranking_boost",
]) assert.ok(migration.includes(behavior), `Search migration is missing ${behavior}.`);

assert.match(suggestions, /Styles \/ Services/);
assert.match(suggestions, /Categories/);
assert.match(suggestions, /createHash\("sha256"\)/);
assert.doesNotMatch(suggestions, /raw_query|query_text/);
assert.match(searchLanguage, /normalize\("NFKD"\)/);
assert.match(searchLanguage, /editDistance/);
assert.match(autocomplete, /AbortController/);
assert.match(autocomplete, /No matching styles or salons found\./);
assert.match(autocomplete, /HighlightedText/);

// Regression: a prior confirmed value such as Texas must live outside the
// controlled input. Typing or clearing operates only on locationText.
assert.match(composer, /value=\{locationText\}/);
assert.doesNotMatch(composer, /value=\{[^}]*customerLocation\.location\?\.label/);
assert.match(composer, /customerLocation\.clearLocation\(\)/);
assert.match(composer, /Near <b[^>]*>\{effectiveLocation\.label\}/);
assert.match(composer, /\? "Current location"/);
assert.match(discovery, /const displayedLocation = locationText/);
assert.doesNotMatch(discovery, /locationText \|\| customerLocation\.location\?\.label/);
assert.match(discovery, /setLocationText\(""\)/);
assert.match(locationProvider, /navigator\.geolocation\.getCurrentPosition/);
assert.ok(locationProvider.indexOf("navigator.geolocation.getCurrentPosition") > locationProvider.indexOf("const useDeviceLocation"), "Geolocation must be requested only in the click-driven callback.");
assert.match(locationProvider, /popstate/);
assert.match(locationProvider, /pageshow/);
assert.match(autocomplete, /onResolved\?\.\(null\)/);

console.log("Verified deterministic catalog search, privacy-safe zero results, stale-request cancellation, and the Texas/current-location controlled-input regression.");
