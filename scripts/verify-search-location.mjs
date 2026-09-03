import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectDecisionSearchKeysetPages,
  collectDecisionSearchPages,
} from "../src/lib/decisionSearchEnrichmentCore.ts";
import {
  deterministicSearchScore,
  ruleCandidates,
} from "../src/lib/searchLanguage.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260720140000_search_language_engine.sql");
const hardeningMigration = read("supabase/migrations/20260809170000_search_authorization_and_runtime_hardening.sql");
const completeCoverageMigration = read("supabase/migrations/20260901130000_complete_search_suggestion_coverage.sql");
const decisionSearchServer = read("src/lib/decisionSearchServer.ts");
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
assert.match(suggestions, /marketplace_visible_salon_ids_page/);
assert.match(suggestions, /\.eq\("is_draft", false\)/);
assert.match(suggestions, /collectDecisionSearchPages/);
assert.match(suggestions, /\.is\("archived_at", null\)/);
assert.doesNotMatch(suggestions, /\.limit\(2_000\)/);
assert.doesNotMatch(suggestions, /\.limit\(5_000\)/);
assert.doesNotMatch(suggestions, /\.limit\(500\)/);
assert.match(suggestions, /collectDecisionSearchKeysetPages/);
assert.match(completeCoverageMigration, /p_after is null or salon\.id > p_after/);
assert.match(completeCoverageMigration, /order by salon\.id/);
assert.match(completeCoverageMigration, /public\.is_marketplace_visible\(salon\.id\)/);
assert.match(decisionSearchServer, /location_markets[\s\S]*?\.order\("name"[\s\S]*?\.order\("id"[\s\S]*?\.range\(from, to\)/);
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

const cappedPageLoader = (rows, providerMaximum, calls) => async (from, to) => {
  calls.push({ from, to });
  return {
    data: rows.slice(from, Math.min(to + 1, from + providerMaximum)),
    error: null,
  };
};

// The homepage/header suggestion catalog used to stop at 2,000 rows. Keep an
// offered active service and its approved alias immediately beyond that cap,
// while simulating a provider maximum smaller than the requested range.
const masterRows = Array.from({ length: 2_001 }, (_, index) => ({
  id: `suggestion-master-${index}`,
  name: index === 2_000 ? "Protective Look Beyond Suggestion Cap" : `Style ${index}`,
}));
const languageRows = Array.from({ length: 2_001 }, (_, index) => ({
  target_type: "service",
  target_id: index === 2_000 ? "suggestion-master-2000" : `suggestion-rule-${index}`,
  canonical_term: "",
  aliases: index === 2_000 ? ["header alias beyond cap"] : [],
  keywords: [],
  common_phrases: [],
  misspellings: [],
  ranking_boost: 0,
  is_active: true,
}));
const offeringRows = Array.from({ length: 5_001 }, (_, index) => ({
  salon_id: "visible-salon",
  master_style_id:
    index === 5_000 ? "suggestion-master-2000" : `offered-master-${index}`,
}));
const masterCalls = [];
const ruleCalls = [];
const offeringCalls = [];
const completeMasters = await collectDecisionSearchPages(
  cappedPageLoader(masterRows, 149, masterCalls),
);
const completeRules = await collectDecisionSearchPages(
  cappedPageLoader(languageRows, 163, ruleCalls),
);
const completeOfferings = await collectDecisionSearchPages(
  cappedPageLoader(offeringRows, 181, offeringCalls),
);
assert.equal(completeMasters.data?.length, 2_001);
assert.equal(completeRules.data?.length, 2_001);
assert.equal(completeOfferings.data?.length, 5_001);
assert.ok(masterCalls.some((call) => call.from >= 2_000));
assert.ok(ruleCalls.some((call) => call.from >= 2_000));
assert.ok(offeringCalls.some((call) => call.from >= 5_000));
const ruleByTarget = new Map(
  (completeRules.data || []).map((rule) => [
    `${rule.target_type}:${rule.target_id}`,
    rule,
  ]),
);
const offeredMasterIds = new Set(
  (completeOfferings.data || []).map((offering) => offering.master_style_id),
);
const suggestionsBeyondCap = (completeMasters.data || [])
  .filter((style) => offeredMasterIds.has(style.id))
  .map((style) => {
    const rule = ruleByTarget.get(`service:${style.id}`);
    return {
      id: style.id,
      score: deterministicSearchScore({
        query: "header alias beyond cap",
        candidates: ruleCandidates(rule, style.name),
      }),
    };
  })
  .filter((item) => item.score > 0);
assert.deepEqual(
  suggestionsBeyondCap.map((item) => item.id),
  ["suggestion-master-2000"],
  "an offered active service and approved alias beyond the old cap must remain suggestible",
);

// Regressions for the previous suggestion/location ceilings. Exercise the
// same collectors with provider pages smaller than requested and place the
// only relevant record after each former total cap.
const visibleSalonRows = Array.from({ length: 1_251 }, (_, index) => ({
  salon_id: String(index).padStart(8, "0"),
}));
const visibleSalonCalls = [];
const completeVisibleSalons = await collectDecisionSearchKeysetPages(
  async (after, requestedPageSize) => {
    visibleSalonCalls.push({ after, requestedPageSize });
    const start = after === null
      ? 0
      : visibleSalonRows.findIndex((row) => row.salon_id === after) + 1;
    return {
      data: visibleSalonRows.slice(start, start + 137),
      error: null,
    };
  },
  (row) => row.salon_id,
);
assert.equal(completeVisibleSalons.data?.length, 1_251);
assert.equal(completeVisibleSalons.data?.at(-1)?.salon_id, "00001250");
assert.ok(visibleSalonCalls.some((call) => Number(call.after) >= 500));
const completeVisibleSalonIds = new Set(
  (completeVisibleSalons.data || []).map((row) => row.salon_id),
);
const salonRows = visibleSalonRows.map((row, index) => ({
  id: row.salon_id,
  name: index === 1_250 ? "Salon Beyond Former Cap" : `Salon ${index}`,
}));
assert.deepEqual(
  salonRows
    .filter((salon) => completeVisibleSalonIds.has(salon.id))
    .map((salon) => ({
      name: salon.name,
      score: deterministicSearchScore({
        query: "salon beyond former cap",
        candidates: [salon.name],
      }),
    }))
    .filter((salon) => salon.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 1)
    .map((salon) => salon.name),
  ["Salon Beyond Former Cap"],
  "a canonically eligible salon beyond the former cap must remain suggestible",
);

const categoryRows = Array.from({ length: 751 }, (_, index) => ({
  id: `category-${String(index).padStart(4, "0")}`,
  name: index === 750 ? "Category Beyond Former Cap" : `Category ${index}`,
}));
const marketRows = Array.from({ length: 1_251 }, (_, index) => ({
  id: `market-${String(index).padStart(4, "0")}`,
  name: index === 1_250 ? "Market Beyond Former Cap" : `Market ${index}`,
  state_code: index === 1_250 ? "NY" : "GA",
  center_latitude: 40 + index / 10_000,
  center_longitude: -74 - index / 10_000,
}));
const completeCategories = await collectDecisionSearchPages(
  cappedPageLoader(categoryRows, 113, []),
);
const completeMarkets = await collectDecisionSearchPages(
  cappedPageLoader(marketRows, 127, []),
);
assert.equal(completeCategories.data?.at(-1)?.name, "Category Beyond Former Cap");
assert.deepEqual(
  (completeCategories.data || [])
    .map((category) => ({
      name: category.name,
      score: deterministicSearchScore({
        query: "category beyond former cap",
        candidates: [category.name],
      }),
    }))
    .filter((category) => category.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 1)
    .map((category) => category.name),
  ["Category Beyond Former Cap"],
  "an offered category beyond the former cap must remain suggestible",
);
assert.equal(completeMarkets.data?.length, 1_251);
assert.deepEqual(
  (completeMarkets.data || [])
    .map((market) => ({
      name: market.name,
      score: deterministicSearchScore({
        query: "market beyond former cap ny",
        candidates: [market.name, market.state_code, `${market.name}, ${market.state_code}`],
      }),
    }))
    .filter((market) => market.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 1)
    .map((market) => market.name),
  ["Market Beyond Former Cap"],
  "an active market beyond the former cap must remain searchable",
);

console.log("Verified complete paged suggestion/location coverage, deterministic catalog search, privacy-safe zero results, stale-request cancellation, and the Texas/current-location controlled-input regression.");
