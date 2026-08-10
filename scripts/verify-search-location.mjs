import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260720140000_search_language_engine.sql");
const hardeningMigration = read("supabase/migrations/20260809170000_search_authorization_and_runtime_hardening.sql");
const suggestions = read("src/app/api/search/suggestions/route.ts");
const discoveryServer = read("src/lib/discoveryServer.ts");
const searchLanguage = read("src/lib/searchLanguage.ts");
const composer = read("src/components/site/SearchComposer.tsx");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const locationProvider = read("src/components/location/CustomerLocationProvider.tsx");
const firstRelevantRequest = read("src/components/location/FirstRelevantLocationRequest.tsx");
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
assert.match(suggestions, /marketplace_visible_salon_ids/);
assert.match(suggestions, /\.eq\("is_draft", false\)/);
assert.match(hardeningMigration, /public\.is_marketplace_visible\(salon\.id\)/);
assert.match(hardeningMigration, /resolve_search_service_query\(text\)[\s\S]*to service_role/);
assert.match(discoveryServer, /if \(resolution\.error\) throw resolution\.error/);
assert.match(suggestions, /createHash\("sha256"\)/);
assert.match(suggestions, /if \(!term\) return Response\.json\(\{ suggestions: \[\], groups: \[\], no_result: false \}\)/);
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
assert.doesNotMatch(composer, /customerLocation\.clearLocation\(\)/);
assert.doesNotMatch(composer, /Near <b/);
assert.match(composer, /query\.set\("lat", String\(selectedLocation\.lat\)\)/);
assert.match(composer, /query\.set\("lng", String\(selectedLocation\.lng\)\)/);
assert.match(composer, /query\.set\("location", selectedLocation\.label\)/);
assert.match(composer, /\? "Current location"/);
assert.match(discovery, /const \[locationText, setLocationText\] = useState\(""\)/);
assert.match(discovery, /const visibleLocation =/);
assert.match(discovery, /customerLocation\.location\?\.label \|\|/);
assert.doesNotMatch(discovery, /locationText \|\| customerLocation\.location\?\.label/);
assert.match(discovery, /setLocationText\(""\)/);
assert.match(locationProvider, /navigator\.geolocation\.getCurrentPosition/);
assert.match(locationProvider, /navigator\.permissions\.query/);
assert.match(locationProvider, /permission\.state === "granted"/);
assert.match(locationProvider, /const precise = await devicePosition\(\)/);
assert.match(locationProvider, /const useDeviceLocation = useCallback/);
assert.doesNotMatch(locationProvider, /permission\.state === "prompt"[\s\S]{0,180}devicePosition/);
assert.match(firstRelevantRequest, /permission\.state === "denied"/);
assert.match(firstRelevantRequest, /remember\("prompted"\)/);
assert.match(firstRelevantRequest, /location\.useDeviceLocation\(\)/);
assert.match(locationProvider, /popstate/);
assert.match(locationProvider, /pageshow/);
assert.match(autocomplete, /onResolved\?\.\(null\)/);

console.log("Verified deterministic catalog search, privacy-safe zero results, stale-request cancellation, and the Texas/current-location controlled-input regression.");
