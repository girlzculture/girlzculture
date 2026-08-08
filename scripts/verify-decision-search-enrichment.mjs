import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectDecisionSearchEnrichment,
  chunkDecisionSearchSalonIds,
  DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS,
  DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY,
  decisionEffectivePrice,
  encodedSalonIdFilterLength,
  groupDecisionSearchRowsBySalon,
  resolveDecisionServiceIdentity,
  selectBestDecisionPromotion,
} from "../src/lib/decisionSearchEnrichmentCore.ts";
import { stableMasterStyleMatch } from "../src/lib/discoverySearchCore.ts";

const salonId = "10000000-0000-4000-8000-000000000001";

// Typed exact-service copy must become the same canonical master-style ID as
// a catalog click. Longer aliases win deterministically, and an explicit stale
// ID remains authoritative rather than being fuzzily reinterpreted.
const catalog = [
  { id: "master-box", name: "Box Braids", aliases: ["Box Braids", "box braid"] },
  { id: "master-boho", name: "Boho Braids", aliases: ["Boho Braids", "bohemian braids"] },
];
assert.deepEqual(
  resolveDecisionServiceIdentity("Box braids under $80", catalog, null),
  { service: catalog[0], stableServiceId: "master-box" },
);
assert.deepEqual(
  resolveDecisionServiceIdentity("bohemian braids near me", catalog, null),
  { service: catalog[1], stableServiceId: "master-boho" },
);
assert.deepEqual(
  resolveDecisionServiceIdentity("Box braids", catalog, "removed-master-id"),
  { service: null, stableServiceId: "removed-master-id" },
);

// Budget eligibility is based on the best real applicable price after active
// promotions. A $100 service with 25% off must survive an under-$80 filter.
const offers = [
  { id: "ten-off", promotion_type: "percentage", discount_value: 10 },
  { id: "twenty-five-off", promotion_type: "percentage", discount_value: 25 },
];
const bestOffer = selectBestDecisionPromotion(100, offers);
assert.equal(bestOffer?.id, "twenty-five-off");
assert.equal(decisionEffectivePrice(100, bestOffer), 75);
assert.ok(decisionEffectivePrice(100, bestOffer) <= 80);
assert.equal(
  decisionEffectivePrice(100, {
    promotion_type: "free_service",
    discount_value: 0,
  }),
  0,
  "A valid free-service promotion must participate in budget eligibility at $0.",
);

function providerCappedLoader(rows, providerMaximum, calls = []) {
  return async (salonIds, from, to) => {
    calls.push({ salonIds: [...salonIds], from, to });
    const scopedRows = rows.filter((row) => salonIds.includes(row.salon_id));
    return {
      data: scopedRows.slice(from, Math.min(to + 1, from + providerMaximum)),
      error: null,
    };
  };
}

// The old global style limit was 5,000. Put the exact requested master style
// after that boundary and simulate a provider returning pages smaller than the
// requested range. The collector must continue and identity selection must not
// replace it with the first/cheapest unrelated row.
const styleRows = Array.from({ length: 5_001 }, (_, index) => ({
  id: index === 5_000 ? "exact-style-after-old-cap" : `unrelated-${index}`,
  salon_id: salonId,
  master_style_id:
    index === 5_000 ? "master-style-requested" : "master-style-unrelated",
  base_price: index === 0 ? 1 : 100,
}));
const styleCalls = [];
const styleResult = await collectDecisionSearchEnrichment(
  [salonId],
  providerCappedLoader(styleRows, 137, styleCalls),
);
assert.equal(styleResult.error, null);
assert.equal(styleResult.data?.length, 5_001);
assert.equal(styleResult.data?.at(5_000)?.id, "exact-style-after-old-cap");
const groupedStyles = groupDecisionSearchRowsBySalon(styleResult.data || []);
const exactStyle = stableMasterStyleMatch(
  groupedStyles.get(salonId) || [],
  "master-style-requested",
);
assert.equal(exactStyle?.id, "exact-style-after-old-cap");
assert.notEqual(exactStyle?.id, "unrelated-0");
assert.ok(
  styleCalls.some((call) => call.from > 5_000),
  "Style paging must continue beyond the former 5,000-row ceiling.",
);

// Promotions and booking reliability had separate 1,000 and 10,000 global
// caps. Sentinels immediately after both boundaries must also survive.
const promotionRows = Array.from({ length: 1_001 }, (_, index) => ({
  id: index === 1_000 ? "promotion-after-old-cap" : `promotion-${index}`,
  salon_id: salonId,
}));
const promotionResult = await collectDecisionSearchEnrichment(
  [salonId],
  providerCappedLoader(promotionRows, 211),
);
assert.equal(promotionResult.data?.length, 1_001);
assert.equal(promotionResult.data?.at(1_000)?.id, "promotion-after-old-cap");

const bookingRows = Array.from({ length: 10_001 }, (_, index) => ({
  id: index === 10_000 ? "booking-after-old-cap" : `booking-${index}`,
  salon_id: salonId,
}));
const bookingResult = await collectDecisionSearchEnrichment(
  [salonId],
  providerCappedLoader(bookingRows, 347),
);
assert.equal(bookingResult.data?.length, 10_001);
assert.equal(bookingResult.data?.at(10_000)?.id, "booking-after-old-cap");

// A complete discovery result may contain many salons. Prove the IDs are
// deduplicated and no PostgREST request receives a huge encoded `in` filter.
const manySalonIds = Array.from(
  { length: 83 },
  (_, index) =>
    `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const chunks = chunkDecisionSearchSalonIds([
  ...manySalonIds,
  manySalonIds[0],
]);
assert.deepEqual(chunks.flat(), manySalonIds);
assert.ok(chunks.length > 1);
for (const chunk of chunks) {
  assert.ok(chunk.length <= DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY);
  assert.ok(
    encodedSalonIdFilterLength(chunk) <=
      DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS,
  );
}

// Keep the executable boundary test connected to the server and to the one
// customer-visible collection consumed by both the list and map.
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("src/lib/decisionSearchServer.ts");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const enrichmentBlock = server.slice(
  server.indexOf("const [styleResult, promotionResult, bookingResult]"),
  server.indexOf("const enriched = await Promise.all"),
);
assert.match(server, /collectDecisionSearchEnrichment<StyleRow>/);
assert.match(server, /collectDecisionSearchEnrichment<PromotionRow>/);
assert.match(server, /collectDecisionSearchEnrichment<BookingRow>/);
assert.match(server, /\.in\("salon_id", salonIds\)/);
assert.match(server, /\.eq\("master_style_id", intent\.stableServiceId\)/);
assert.match(server, /masterStyleId: intent\.stableServiceId/);
assert.match(server, /maximumPrice: null/);
assert.match(server, /selectBestDecisionPromotion/);
assert.match(server, /decisionEffectivePrice/);
assert.doesNotMatch(enrichmentBlock, /\.in\("salon_id", ids\)/);
assert.doesNotMatch(
  enrichmentBlock,
  /\.limit\((?:5_000|1_000|10_000)\)/,
);
assert.match(discovery, /salons\.map\(\(salon\)/);
assert.match(discovery, /<GoogleSalonMap[\s\S]*?salons=\{salons\}/);

console.log(
  "Decision-search enrichment verification passed: typed Box/Boho requests resolve to canonical master IDs, active offers determine real budget eligibility, enrichment continues beyond former global caps, short provider pages and bounded PostgREST ID chunks are handled, and list/map share one collection.",
);
