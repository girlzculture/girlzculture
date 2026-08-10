import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectDecisionSearchEnrichment,
  chunkDecisionSearchSalonIds,
  DECISION_SEARCH_AVAILABILITY_CONCURRENCY,
  DECISION_SEARCH_RELIABILITY_WINDOW_DAYS,
  DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS,
  DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY,
  decisionBookingReliability,
  decisionExplicitLocationRequest,
  decisionEffectivePrice,
  decisionPromotionPriceForStyle,
  encodedSalonIdFilterLength,
  evaluateDecisionStyleCandidates,
  groupDecisionSearchRowsBySalon,
  mapDecisionSearchWithConcurrency,
  resolveDecisionServiceIdentity,
  selectBestDecisionPromotion,
  selectDecisionStyleWithOpening,
} from "../src/lib/decisionSearchEnrichmentCore.ts";
import { stableMasterStyleMatch } from "../src/lib/discoverySearchCore.ts";

const salonId = "10000000-0000-4000-8000-000000000001";

assert.deepEqual(decisionExplicitLocationRequest("box braids in Atlantis"), {
  kind: "place",
  phrase: "atlantis",
});
assert.deepEqual(decisionExplicitLocationRequest("box braids near 11201"), {
  kind: "zip",
  phrase: "11201",
});
assert.equal(
  decisionExplicitLocationRequest("feed in braids near me"),
  null,
  "a service phrase and current-location request must not be mistaken for an unresolved city",
);
assert.equal(
  decisionExplicitLocationRequest("box braids under $10000"),
  null,
  "a five-digit budget must not be mistaken for a ZIP code",
);

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

// Production candidate selection must consider every matching service. The
// cheapest pre-discount row has no Saturday opening, while a second service
// becomes affordable through a valid service-group offer and does have one.
const candidateStyles = [
  {
    id: "cheap-no-opening",
    salon_id: salonId,
    master_style_id: "master-braids",
    service_group_id: "group-braids",
    base_price: 60,
    price_display_min: 60,
    price_display_max: 80,
  },
  {
    id: "discounted-with-opening",
    salon_id: salonId,
    master_style_id: "master-braids",
    service_group_id: "group-braids",
    base_price: 100,
    price_display_min: 100,
    price_display_max: 120,
  },
];
const candidatePromotions = [
  {
    id: "braid-group-25",
    salon_id: salonId,
    promotion_type: "percentage",
    discount_value: 25,
    target_scope: "service_groups",
    target_ids: ["group-braids"],
    restrictions: { minimum_subtotal: 90 },
  },
  {
    id: "wrong-group-90",
    salon_id: salonId,
    promotion_type: "percentage",
    discount_value: 90,
    target_scope: "service_groups",
    target_ids: ["group-locs"],
    restrictions: {},
  },
];
assert.equal(
  decisionPromotionPriceForStyle(
    salonId,
    candidateStyles[0],
    60,
    candidatePromotions[0],
  ),
  null,
  "The minimum subtotal must make the group offer ineligible for the $60 service.",
);
assert.equal(
  decisionPromotionPriceForStyle(
    salonId,
    candidateStyles[1],
    100,
    candidatePromotions[0],
  ),
  75,
  "A valid service-group offer must set the real search price.",
);
assert.equal(
  decisionPromotionPriceForStyle(
    salonId,
    candidateStyles[1],
    100,
    candidatePromotions[1],
  ),
  null,
  "A promotion for another service group must not change the search price.",
);
const candidateEvaluation = evaluateDecisionStyleCandidates({
  salonId,
  styles: candidateStyles,
  promotions: candidatePromotions,
  maximumPrice: 80,
  promotionOnly: false,
});
assert.deepEqual(
  candidateEvaluation.withinBudget.map((entry) => [
    entry.style.id,
    entry.price,
  ]),
  [
    ["cheap-no-opening", 60],
    ["discounted-with-opening", 75],
  ],
);
const saturdaySelection = await selectDecisionStyleWithOpening({
  candidates: candidateEvaluation.eligible,
  requireOpening: true,
  loadOpening: async (candidate) =>
    candidate.style.id === "discounted-with-opening"
      ? { date: "2026-08-08", value: "10:00" }
      : null,
});
assert.equal(saturdaySelection.candidate?.style.id, "discounted-with-opening");
assert.equal(saturdaySelection.candidate?.price, 75);
assert.equal(saturdaySelection.opening?.date, "2026-08-08");

let activeWorkers = 0;
let maximumWorkers = 0;
const concurrencyResult = await mapDecisionSearchWithConcurrency(
  Array.from({ length: 17 }, (_, index) => index),
  async (value) => {
    activeWorkers += 1;
    maximumWorkers = Math.max(maximumWorkers, activeWorkers);
    await new Promise((resolve) => setTimeout(resolve, 1));
    activeWorkers -= 1;
    return value * 2;
  },
  3,
);
assert.deepEqual(
  concurrencyResult,
  Array.from({ length: 17 }, (_, index) => index * 2),
  "bounded workers must preserve input/result order",
);
assert.ok(maximumWorkers <= 3, `availability fan-out reached ${maximumWorkers}`);
assert.equal(DECISION_SEARCH_AVAILABILITY_CONCURRENCY, 4);

const reliabilityNow = Date.parse("2026-08-09T12:00:00.000Z");
const reliability = decisionBookingReliability(
  [
    { status: "Completed", appointment_datetime: "2026-08-01T12:00:00.000Z" },
    { status: "Cancelled", appointment_datetime: "2026-07-20T12:00:00.000Z", cancelled_by: "salon" },
    { status: "Canceled", appointment_datetime: "2026-07-10T12:00:00.000Z", cancellation_initiated_by: "Customer" },
    { status: "No Show", appointment_datetime: "2026-06-10T12:00:00.000Z" },
    { status: "Confirmed", appointment_datetime: "2026-08-08T12:00:00.000Z" },
    { status: "Completed", appointment_datetime: "2025-01-01T12:00:00.000Z" },
    { status: "Cancelled", appointment_datetime: "2026-09-01T12:00:00.000Z", cancelled_by: "salon" },
  ],
  reliabilityNow,
);
assert.deepEqual(reliability, {
  completed: 1,
  salonCancellations: 1,
  terminalOutcomes: 4,
  cancellationRatePercent: 25,
  windowDays: DECISION_SEARCH_RELIABILITY_WINDOW_DAYS,
});

const promotionOnlyEvaluation = evaluateDecisionStyleCandidates({
  salonId,
  styles: candidateStyles,
  promotions: candidatePromotions,
  maximumPrice: 80,
  promotionOnly: true,
});
assert.deepEqual(
  promotionOnlyEvaluation.eligible.map((entry) => entry.style.id),
  ["discounted-with-opening"],
  "Promotion-only searches must exclude a style whose minimum subtotal is not met.",
);

const postPromotionBudget = evaluateDecisionStyleCandidates({
  salonId,
  styles: [
    { ...candidateStyles[0], id: "ten-off-service", base_price: 90, price_display_min: 90, price_display_max: 90 },
    { ...candidateStyles[1], id: "twenty-five-off-service" },
  ],
  promotions: [
    { ...candidatePromotions[0], id: "ten-off-specific", promotion_type: "percentage", discount_value: 10, target_scope: "services", target_ids: ["ten-off-service"], restrictions: {} },
    { ...candidatePromotions[0], id: "twenty-five-off-specific", target_scope: "services", target_ids: ["twenty-five-off-service"], restrictions: {} },
  ],
  maximumPrice: 80,
  promotionOnly: false,
});
assert.deepEqual(
  postPromotionBudget.eligible.map((entry) => [entry.style.id, entry.price]),
  [["twenty-five-off-service", 75]],
  "Budget filtering must select the real post-promotion service, not the cheapest original row.",
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
const route = read("src/app/api/discovery/decision-search/route.ts");
const discovery = read("src/components/public/SalonDiscovery.tsx");
const enrichmentStart = server.indexOf(
  "collectDecisionSearchEnrichment<StyleRow>",
);
const enrichmentEnd = server.indexOf("const styles =", enrichmentStart);
assert.ok(enrichmentStart >= 0 && enrichmentEnd > enrichmentStart);
const enrichmentBlock = server.slice(enrichmentStart, enrichmentEnd);
assert.match(server, /collectDecisionSearchEnrichment<StyleRow>/);
assert.match(server, /collectDecisionSearchEnrichment<PromotionRow>/);
assert.match(server, /collectDecisionSearchEnrichment<BookingRow>/);
assert.match(server, /\.in\("salon_id", salonIds\)/);
assert.match(server, /\.eq\("master_style_id", intent\.stableServiceId\)/);
assert.match(server, /Radius\/eligibility is deliberately the first stage/);
assert.doesNotMatch(server, /masterStyleId: intent\.stableServiceId/);
assert.doesNotMatch(server, /maximumPrice: null/);
assert.match(server, /evaluateDecisionStyleCandidates/);
assert.match(server, /selectDecisionStyleWithOpening/);
assert.match(server, /mapDecisionSearchWithConcurrency/);
assert.match(server, /limit:\s*"all"/);
assert.match(server, /decisionBookingReliability/);
assert.match(server, /reliabilityStartsAt/);
assert.match(server, /evaluated_match_count/);
assert.match(server, /total_discovered_count/);
assert.match(server, /candidate_set_truncated/);
assert.match(server, /location_unresolved/);
assert.match(server, /candidate_set_truncated: false/);
assert.match(route, /Send a valid search request\./);
assert.doesNotMatch(route, /errorResponse\(error/);
assert.doesNotMatch(route, /catch \(error\)[\s\S]*Search could not be completed/);
assert.match(server, /restrictions/);
assert.doesNotMatch(enrichmentBlock, /\.in\("salon_id", ids\)/);
assert.doesNotMatch(
  enrichmentBlock,
  /\.limit\((?:5_000|1_000|10_000)\)/,
);
assert.match(discovery, /salons\.map\(\(salon\)/);
assert.match(discovery, /<GoogleSalonMap[\s\S]*?salons=\{salons\}/);

console.log(
  "Decision-search enrichment verification passed: explicit unresolved places cannot borrow current coordinates; typed Box/Boho requests resolve to canonical master IDs; every eligible salon in the radius participates in post-promotion budget and opening selection; minimum-subtotal and service-group scope are enforced; availability fan-out is bounded; reliability uses a 180-day terminal-outcome denominator; enrichment paging and PostgREST chunks are bounded; and result/discovery counts remain separate.",
);
