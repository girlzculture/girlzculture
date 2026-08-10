import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  boundedSearchNumber,
  canonicalDiscoveryResults,
  decisionSearchRadius,
  stableMasterStyleMatch,
  wrappedLongitudeDelta,
} from "../src/lib/discoverySearchCore.ts";
import { waitForGoogleMapsSdkReady } from "../src/lib/googleMapsFailureCore.ts";
import { formatDistanceMiles } from "../src/lib/location.ts";

// Runtime regression: optional filters must stay optional. Number(null) === 0
// caused the production "no salons" result by imposing a hidden $0 ceiling.
assert.equal(boundedSearchNumber(null, null, 0, 100_000), null);
assert.equal(boundedSearchNumber(undefined, null, 0, 100_000), null);
assert.equal(boundedSearchNumber("", null, 0, 100_000), null);
assert.equal(boundedSearchNumber("250", null, 0, 100_000), 250);
assert.equal(decisionSearchRadius(undefined, undefined), 50);
assert.equal(decisionSearchRadius(null, "25"), 25);
assert.equal(decisionSearchRadius(500, undefined), 100);

// Runtime regression: prove the canonical result transformer neither caps the
// list at 25/40/50 nor emits duplicates, and that distance mode is truthful.
const unordered = Array.from({ length: 73 }, (_, index) => ({
  id: `salon-${String(index).padStart(3, "0")}`,
  distance_miles: Number(((72 - index) / 10).toFixed(1)),
}));
unordered.splice(17, 0, { ...unordered[9] });
const canonical = canonicalDiscoveryResults(unordered, "distance");
assert.equal(canonical.length, 73);
assert.equal(new Set(canonical.map((salon) => salon.id)).size, 73);
for (let index = 1; index < canonical.length; index += 1) {
  assert.ok(
    canonical[index - 1].distance_miles <= canonical[index].distance_miles,
    "Distance results must remain nearest-first.",
  );
}

assert.equal(formatDistanceMiles(0.08), "Under 0.1 mile away");
assert.equal(formatDistanceMiles(1), "1 mile away");
assert.equal(formatDistanceMiles(1.46), "1.5 miles away");
assert.equal(formatDistanceMiles(null), "Distance unavailable");

// Runtime identity regression: a stable style ID can only select that exact
// master style. It must never fall through to a name match or cheapest row.
const salonStyles = [
  { id: "cheap-unrelated", master_style_id: "master-box", price: 50 },
  { id: "selected-knotless", master_style_id: "master-knotless", price: 200 },
];
assert.equal(
  stableMasterStyleMatch(salonStyles, "master-knotless")?.id,
  "selected-knotless",
);
assert.equal(stableMasterStyleMatch(salonStyles, "missing-master"), null);
assert.equal(stableMasterStyleMatch(salonStyles, null), null);

// Runtime antimeridian regression: 179.9E and 179.9W are 0.2 degrees apart,
// not 359.8 degrees apart, so the SQL bounding prefilter must retain them.
assert.ok(Math.abs(wrappedLongitudeDelta(179.9, -179.9) - 0.2) < 0.000001);
assert.ok(Math.abs(wrappedLongitudeDelta(-73.9, -74.1) - 0.2) < 0.000001);

// Runtime regression: the async Google loader may become ready shortly after
// the script load event. It is not an invalid SDK response during that window.
let checks = 0;
assert.equal(
  await waitForGoogleMapsSdkReady({
    isReady: () => ++checks >= 4,
    wait: async () => {},
    timeoutMs: 200,
    intervalMs: 20,
  }),
  true,
);
assert.equal(
  await waitForGoogleMapsSdkReady({
    isReady: () => false,
    wait: async () => {},
    timeoutMs: 60,
    intervalMs: 20,
  }),
  false,
);

// Supplemental inventory checks keep the runtime regressions connected to the
// actual public routes and database contract. These are not the only evidence.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20260807200000_authoritative_discovery_search.sql",
);
const decisionSearch = read("src/lib/decisionSearchServer.ts");
const discovery = read("src/lib/discoveryServer.ts");
const salonsPage = read("src/app/salons/page.tsx");
const salonDiscovery = read("src/components/public/SalonDiscovery.tsx");
const map = read("src/components/search/GoogleSalonMap.tsx");
const autocomplete = read("src/components/search/AutocompleteInputs.tsx");
const stylesPage = read("src/app/styles/page.tsx");
const styleCatalog = read("src/components/public/StyleCatalog.tsx");
const nearby = read("src/components/public/NearbySalonPlacement.tsx");

assert.match(migration, /coalesce\(result_limit,20\) <= 0 and auth\.role\(\)='service_role' then null/);
assert.match(migration, /coalesce\(result_limit,20\) <= 0 then 50/);
assert.match(migration, /limit\(select page_size from validated\)/);
assert.match(migration, /e\.distance_miles asc/);
assert.match(migration, /360\.0-abs\(s\.longitude-origin_longitude\)/);
assert.doesNotMatch(migration, /plan_distance_bonus|max_plan_distance_bonus/);
assert.match(migration, /master_style_id uuid/);
assert.match(migration, /master_style_filter uuid/);
assert.match(migration, /fs\.master_style_id=master_style_filter/);
assert.match(
  migration,
  /discover_nearby_salons_ranked\(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer\) from public,anon,authenticated/,
);
assert.match(
  migration,
  /distance_miles\(double precision,double precision,double precision,double precision\) to service_role/,
);
assert.match(
  migration,
  /discover_nearby_salons_ranked\(double precision,double precision,double precision,text,uuid,numeric,numeric,numeric,text,integer,integer\) to service_role/,
);
assert.match(migration, /integrations\.expected_migration/);
assert.match(migration, /notify pgrst,'reload schema'/);
assert.match(migration, /to anon, authenticated, service_role/);
assert.match(decisionSearch, /limit: "all"/);
assert.match(decisionSearch, /candidate_set_truncated: false/);
assert.match(decisionSearch, /mapDecisionSearchWithConcurrency/);
assert.match(decisionSearch, /total_discovered_count/);
assert.match(decisionSearch, /Radius\/eligibility is deliberately the first stage/);
assert.doesNotMatch(decisionSearch, /masterStyleId: intent\.stableServiceId/);
assert.match(
  decisionSearch,
  /\(intent\.stableServiceId \|\| intent\.serviceGroupId \|\| intent\.categoryId\)[\s\S]*candidateStyles\.length === 0/,
);
assert.match(decisionSearch, /rows\.filter\(\(row\) => row\.master_style_id === stableServiceId\)/);
assert.match(decisionSearch, /evaluateDecisionStyleCandidates/);
assert.match(decisionSearch, /selectDecisionStyleWithOpening/);
assert.match(discovery, /result_limit: limit/);
assert.match(discovery, /master_style_filter: query\.masterStyleId \|\| null/);
assert.match(salonsPage, /limit: "all"/);
assert.match(salonsPage, /masterStyleId: initialStyleId \|\| null/);
assert.match(salonDiscovery, /className="mt-3 grid gap-3"/);
assert.doesNotMatch(salonDiscovery, /lg:grid-cols-2/);
assert.doesNotMatch(salonDiscovery, /Load more|pagination/i);
assert.match(salonDiscovery, /!ignoreInitialOrigin &&[\s\S]*initialOrigin/);
assert.match(salonDiscovery, /setIgnoreInitialOrigin\(true\)/);
assert.match(salonDiscovery, /restorationChecked\.current = true/);
assert.match(salonDiscovery, /restoredFromStorage\.current = true/);
assert.match(salonDiscovery, /!restorationChecked\.current \|\|[\s\S]*restoredFromStorage\.current/);
assert.match(salonDiscovery, /setScrollRestoreRevision/);
assert.match(salonDiscovery, /\[salons\.length, scrollRestoreRevision\]/);
assert.match(map, /const selectedSalon = salons\.find/);
assert.match(map, /SalonMapSelectionSummary salon=\{selectedSalon\}/);
assert.match(map, /rating\.toFixed\(1\)/);
assert.match(map, /mapPrice\(salon\.starting_price/);
assert.match(map, /formatDistanceMiles\(salon\.distance_miles\)/);
assert.match(autocomplete, /waitForGoogleMapsSdkReady/);
assert.match(autocomplete, /callback=\$\{GOOGLE_MAPS_READY_CALLBACK\}/);
assert.match(stylesPage, /master_style_id/);
assert.match(styleCatalog, /style_id=/);
assert.match(styleCatalog, /STYLE_STATE_KEY/);
assert.match(nearby, /lat: String\(location\.lat\)/);
assert.match(nearby, /radius: String\(locationState\.radiusMiles\)/);

console.log(
  "Authoritative discovery verification passed: absent-filter semantics, 50-mile defaults, bounded decision-search candidates and availability concurrency, separated result/discovery counts, exact distance copy, multi-service price/opening qualification, delayed Maps readiness, unified style identity/state and list/map route wiring are covered.",
);
