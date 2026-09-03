import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  collectDecisionSearchEnrichment,
  collectDecisionSearchPages,
  compareDecisionSearchRating,
  chunkDecisionSearchSalonIds,
  DECISION_SEARCH_AVAILABILITY_CONCURRENCY,
  DECISION_SEARCH_RELIABILITY_WINDOW_DAYS,
  DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS,
  DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY,
  decisionCanonicalStyleIsEligible,
  decisionCatalogHierarchyIsEligible,
  decisionBookingReliability,
  decisionDisplayedStylePrice,
  decisionExplicitLocationRequest,
  decisionEffectivePrice,
  decisionPromotionPriceForStyle,
  decisionRelevantStyles,
  decisionSearchPagination,
  decisionSearchPageOffset,
  decisionServiceMatchQuality,
  encodedSalonIdFilterLength,
  evaluateDecisionStyleCandidates,
  groupDecisionSearchRowsBySalon,
  mapDecisionSearchWithConcurrency,
  resolveDecisionServiceIdentity,
  selectBestDecisionPromotion,
  selectDecisionStyleWithOpening,
} from "../src/lib/decisionSearchEnrichmentCore.ts";
import {
  resolveCatalogCorrection,
  withUniqueCanonicalNameTokens,
} from "../src/lib/catalogFuzzySearchCore.ts";
import { stableMasterStyleMatch } from "../src/lib/discoverySearchCore.ts";
import {
  salonTrustPresentationItems,
  visibleSalonTrustLabels,
} from "../src/lib/salonTrustPresentation.ts";

const salonId = "10000000-0000-4000-8000-000000000001";

const activeLifecycleRow = { is_active: true, archived_at: null };
assert.equal(
  decisionCatalogHierarchyIsEligible({
    master: activeLifecycleRow,
    group: activeLifecycleRow,
    category: activeLifecycleRow,
  }),
  true,
);
for (const rejectedHierarchy of [
  {
    master: { is_active: false, archived_at: null },
    group: activeLifecycleRow,
    category: activeLifecycleRow,
  },
  {
    master: { is_active: true, archived_at: "2026-09-01T00:00:00Z" },
    group: activeLifecycleRow,
    category: activeLifecycleRow,
  },
  {
    master: activeLifecycleRow,
    group: { is_active: false, archived_at: null },
    category: activeLifecycleRow,
  },
  {
    master: activeLifecycleRow,
    group: { is_active: true, archived_at: "2026-09-01T00:00:00Z" },
    category: activeLifecycleRow,
  },
  {
    master: activeLifecycleRow,
    group: activeLifecycleRow,
    category: { is_active: false, archived_at: null },
  },
  {
    master: activeLifecycleRow,
    group: activeLifecycleRow,
    category: { is_active: true, archived_at: "2026-09-01T00:00:00Z" },
  },
]) {
  assert.equal(
    decisionCatalogHierarchyIsEligible(rejectedHierarchy),
    false,
    "an inactive or archived canonical master/group/category must be absent from broad-search eligibility",
  );
}
const eligibleCanonicalMasterIds = new Set(["master-active"]);
assert.equal(
  decisionCanonicalStyleIsEligible(
    { master_style_id: "master-active" },
    eligibleCanonicalMasterIds,
  ),
  true,
);
assert.equal(
  decisionCanonicalStyleIsEligible(
    { master_style_id: "master-archived" },
    eligibleCanonicalMasterIds,
  ),
  false,
  "broad group/category enrichment must reject a salon style whose canonical master was filtered from the live catalog",
);
assert.equal(
  decisionCanonicalStyleIsEligible(
    { master_style_id: null },
    eligibleCanonicalMasterIds,
  ),
  false,
  "uncanonicalized salon styles must not enter public decision-search enrichment",
);
const broadSearchStyles = [
  {
    id: "salon-live",
    salon_id: salonId,
    master_style_id: "master-active",
    service_group_id: "group-protective",
    category_id: "category-braiding",
    name: "Live Protective Style",
    base_price: 100,
    price_display_min: 100,
    price_display_max: 150,
  },
  {
    id: "salon-archived-canonical",
    salon_id: salonId,
    master_style_id: "master-archived",
    service_group_id: "group-protective",
    category_id: "category-braiding",
    name: "Archived Canonical Style",
    base_price: 75,
    price_display_min: 75,
    price_display_max: 100,
  },
].filter((style) =>
  decisionCanonicalStyleIsEligible(style, eligibleCanonicalMasterIds),
);
assert.deepEqual(
  decisionRelevantStyles(broadSearchStyles, {
    serviceGroupId: "group-protective",
  }).map((style) => style.id),
  ["salon-live"],
  "a broad service-group search must not surface a salon style backed by an archived canonical master",
);
assert.deepEqual(
  decisionRelevantStyles(broadSearchStyles, {
    categoryId: "category-braiding",
  }).map((style) => style.id),
  ["salon-live"],
  "a broad category search must not surface a salon style backed by an inactive or archived catalog hierarchy",
);

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
// a catalog click. Longer aliases win deterministically, while an explicit
// stale/archived ID is rejected instead of becoming an unverified identity.
const catalog = [
  { id: "master-box", name: "Box Braids", aliases: ["Box Braids", "box braid"] },
  { id: "master-boho", name: "Boho Braids", aliases: ["Boho Braids", "bohemian braids"] },
];
assert.deepEqual(
  resolveDecisionServiceIdentity("Box braids under $80", catalog, null),
  {
    service: catalog[0],
    stableServiceId: "master-box",
    rejectedExplicitServiceId: false,
  },
);
assert.deepEqual(
  resolveDecisionServiceIdentity("bohemian braids near me", catalog, null),
  {
    service: catalog[1],
    stableServiceId: "master-boho",
    rejectedExplicitServiceId: false,
  },
);
assert.deepEqual(
  resolveDecisionServiceIdentity("Box braids", catalog, "removed-master-id"),
  {
    service: null,
    stableServiceId: null,
    rejectedExplicitServiceId: true,
  },
  "a missing or archived explicit UUID must not become an eligible master identity",
);

// A meaningful token from a canonical service name is a safe shorthand only
// while that token belongs to one service. Ambiguous aliases must never be
// resolved by alphabetical order.
const shorthandCatalog = withUniqueCanonicalNameTokens([
  { id: "master-dominican", name: "Dominican Blowout", terms: [] },
  { id: "master-trim", name: "Trim (Dusting / Shape-Up)", terms: [] },
]);
assert.equal(
  resolveCatalogCorrection("Blowout", shorthandCatalog)?.serviceId,
  "master-dominican",
  "the unique canonical Blowout shorthand must resolve to Dominican Blowout",
);
assert.equal(
  resolveCatalogCorrection("protective style", [
    { id: "master-a", name: "Service A", terms: ["protective style"] },
    { id: "master-b", name: "Service B", terms: ["protective style"] },
  ]),
  null,
  "an alias owned by two services must remain ambiguous",
);
assert.equal(
  resolveCatalogCorrection("Blowout", [
    { id: "canonical-owner", name: "Blowout", terms: [] },
    {
      id: "alias-owner",
      name: "Silk Press",
      terms: [],
      aliasTerms: ["Blowout"],
    },
  ])?.serviceId,
  "canonical-owner",
  "an exact canonical name must win a same-text collision with an alias",
);
assert.equal(
  resolveCatalogCorrection("Knotles Braids", [
    {
      id: "approved-alias",
      name: "Knotless Braids",
      terms: [],
      aliasTerms: ["Knotles Braids"],
    },
    {
      id: "approved-misspelling",
      name: "Braided Style",
      terms: [],
      misspellingTerms: ["Knotles Braids"],
    },
  ])?.serviceId,
  "approved-alias",
  "an exact approved alias must win a same-text collision with a misspelling",
);
assert.deepEqual(
  resolveDecisionServiceIdentity(
    "protective style near me",
    [
      { id: "master-a", name: "Service A", aliases: ["protective style"] },
      { id: "master-b", name: "Service B", aliases: ["protective style"] },
    ],
    null,
  ),
  {
    service: null,
    stableServiceId: null,
    rejectedExplicitServiceId: false,
  },
  "the intent resolver must not choose an equally specific alias alphabetically",
);
assert.equal(
  resolveDecisionServiceIdentity(
    "boho knotless braids near me",
    [
      { id: "master-knotless", name: "Knotless Braids", aliases: [] },
      {
        id: "master-boho",
        name: "Boho Braids",
        aliases: ["boho knotless braids"],
      },
    ],
    null,
  ).stableServiceId,
  "master-boho",
  "the longest approved alias must outrank a shorter canonical substring",
);
assert.deepEqual(
  visibleSalonTrustLabels(
    [
      "Verified",
      "Identity checked",
      "License confirmed",
      "Girlz Culture Approved",
      "Vetted Professional",
      "Certified Salon",
      "Background Checked",
      "Trusted Professional",
      "Transparent Pricing · Verified",
      "Transparent Pricing",
      "Time Respected",
      "Real Availability",
    ],
    false,
  ),
  ["Pricing shown upfront", "Appointment timing", "Current availability"],
  "unverified CMS copy must use only the exact positive neutral allowlist",
);
assert.deepEqual(
  visibleSalonTrustLabels(["Verified", "Transparent Pricing"], true),
  ["Verified", "Transparent Pricing"],
  "verified salons retain their approved verification trust label",
);
assert.deepEqual(
  salonTrustPresentationItems(
    ["Verified", "Transparent Pricing", "Time Respected", "Real Availability"],
    false,
  ),
  [
    { label: "Pricing shown upfront", kind: "pricing" },
    { label: "Appointment timing", kind: "scheduling" },
    { label: "Current availability", kind: "availability" },
  ],
  "unverified neutral facts must retain semantic icon kinds after unsafe labels are removed",
);
assert.deepEqual(
  salonTrustPresentationItems(
    ["Verified", "Transparent Pricing", "Time Respected", "Real Availability"],
    true,
  ).map(({ kind }) => kind),
  ["verification", "pricing", "scheduling", "availability"],
  "verified trust labels must receive icons from meaning rather than array position",
);

const publishedStyles = [
  {
    id: "salon-dominican",
    salon_id: salonId,
    master_style_id: "master-dominican",
    service_group_id: "group-blowouts",
    category_id: "category-styling",
    name: "Dominican Blowout",
    base_price: 95,
    price_display_min: 95,
    price_display_max: 135,
    description: "Published service",
    stylistBio: "",
  },
  {
    id: "salon-trim",
    salon_id: salonId,
    master_style_id: "master-trim",
    service_group_id: "group-cuts",
    category_id: "category-cuts",
    name: "Trim (Dusting / Shape-Up)",
    base_price: 20,
    price_display_min: 20,
    price_display_max: 30,
    description: "Includes a blowout finish",
    stylistBio: "Blowout specialist",
  },
];
assert.equal(
  decisionDisplayedStylePrice({
    base_price: 95,
    price_display_min: null,
    price_display_max: null,
  }),
  95,
  "null display fields must not become a false $0 price",
);
assert.equal(
  decisionDisplayedStylePrice({
    base_price: null,
    price_display_min: null,
    price_display_max: null,
  }),
  null,
  "a genuinely unknown service price must remain unknown",
);
assert.equal(
  evaluateDecisionStyleCandidates({
    salonId,
    styles: [{
      ...publishedStyles[0],
      price_display_min: null,
      price_display_max: null,
    }],
    promotions: [],
    maximumPrice: 10,
    promotionOnly: false,
  }).eligible.length,
  0,
  "a $95 service with nullable display fields must not pass a $10 budget",
);
assert.deepEqual(
  decisionRelevantStyles(publishedStyles, {
    stableServiceId: "master-dominican",
  }).map((style) => style.id),
  ["salon-dominican"],
  "Dominican Blowout must return only the salon's corresponding published service",
);
assert.deepEqual(
  decisionRelevantStyles(publishedStyles, {
    unresolvedServicePhrase: "blowout",
  }),
  [],
  "an unresolved service-like phrase must not select Trim from description or stylist biography copy",
);

const strongestMatchFirst = evaluateDecisionStyleCandidates({
  salonId,
  styles: [
    publishedStyles[1],
    { ...publishedStyles[0], base_price: 120, price_display_min: 120 },
  ],
  promotions: [],
  maximumPrice: null,
  promotionOnly: false,
  matchQuality: (style) => decisionServiceMatchQuality("Dominican Blowout", style.name),
});
assert.equal(
  strongestMatchFirst.eligible[0]?.style.id,
  "salon-dominican",
  "service-match quality must outrank the cheaper Trim row",
);

const ratingOrdered = [
  { id: "many-reviews", rating_overall: 4.8, review_count: 4_000, distance_miles: 1 },
  { id: "highest-rating", rating_overall: 4.9, review_count: 2, distance_miles: 12 },
  { id: "rating-tie-nearer", rating_overall: 4.9, review_count: 2, distance_miles: 3 },
].sort(compareDecisionSearchRating);
assert.deepEqual(
  ratingOrdered.map((salon) => salon.id),
  ["rating-tie-nearer", "highest-rating", "many-reviews"],
  "Best rated must rank by rating before review volume or distance",
);
assert.deepEqual(decisionSearchPagination({ page: 0, pageSize: 48 }), {
  page: 1,
  pageSize: 48,
});
assert.deepEqual(decisionSearchPagination({ page: 101, pageSize: 48 }), {
  page: 101,
  pageSize: 48,
});
assert.deepEqual(decisionSearchPagination({ page: 999, pageSize: 999 }), {
  page: 999,
  pageSize: 50,
});
assert.deepEqual(
  decisionSearchPagination({ page: Number.MAX_SAFE_INTEGER, pageSize: 50 }),
  { page: Number.MAX_SAFE_INTEGER, pageSize: 50 },
);
assert.equal(
  decisionSearchPageOffset({ page: 101, pageSize: 48, totalCount: 10_000 }),
  4_800,
);
assert.equal(
  decisionSearchPageOffset({ page: 999, pageSize: 50, totalCount: 100_000 }),
  49_900,
);
assert.equal(
  decisionSearchPageOffset({
    page: Number.MAX_SAFE_INTEGER,
    pageSize: 50,
    totalCount: 77,
  }),
  77,
  "an overflow-prone but valid page must return an empty page at the collection end",
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

function providerCappedPageLoader(rows, providerMaximum, calls = []) {
  return async (from, to) => {
    calls.push({ from, to });
    return {
      data: rows.slice(from, Math.min(to + 1, from + providerMaximum)),
      error: null,
    };
  };
}

// Active master styles and their approved language rules must remain complete
// beyond the former route/server limits (2,000 styles and 4,000 rules). The
// provider fixture deliberately returns less than the requested 500-row range,
// proving that pagination advances by the returned count until an empty page.
const activeMasterRows = Array.from({ length: 2_001 }, (_, index) => ({
  id: `active-master-${index}`,
  name: index === 2_000 ? "Protective Look Beyond Cap" : `Master Style ${index}`,
}));
const activeRuleRows = Array.from({ length: 4_001 }, (_, index) => ({
  target_id: index === 4_000 ? "active-master-2000" : `rule-target-${index}`,
  aliases: index === 4_000 ? ["beyond cap protective alias"] : [],
}));
const masterPageCalls = [];
const rulePageCalls = [];
const completeMasters = await collectDecisionSearchPages(
  providerCappedPageLoader(activeMasterRows, 137, masterPageCalls),
);
const completeRules = await collectDecisionSearchPages(
  providerCappedPageLoader(activeRuleRows, 173, rulePageCalls),
);
assert.equal(completeMasters.data?.length, 2_001);
assert.equal(completeRules.data?.length, 4_001);
assert.ok(
  masterPageCalls.some((call) => call.from >= 2_000),
  "master-style catalog pagination must continue beyond 2,000 rows",
);
assert.ok(
  rulePageCalls.some((call) => call.from >= 4_000),
  "language-rule pagination must continue beyond 4,000 rows",
);
const completeRuleByTarget = new Map(
  (completeRules.data || []).map((rule) => [rule.target_id, rule]),
);
const beyondCapCandidates = (completeMasters.data || []).map((style) => ({
  id: style.id,
  name: style.name,
  terms: [],
  aliasTerms: completeRuleByTarget.get(style.id)?.aliases || [],
}));
assert.equal(
  resolveCatalogCorrection(
    "beyond cap protective alias near me",
    beyondCapCandidates,
  )?.serviceId,
  "active-master-2000",
  "an approved alias beyond both former caps must resolve to its active master style",
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
const intentCore = read("src/lib/decisionSearchIntentCore.ts");
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
assert.match(server, /collectDecisionSearchPages/);
assert.match(route, /collectDecisionSearchPages/);
assert.doesNotMatch(server, /\.limit\((?:2_000|4_000)\)/);
assert.doesNotMatch(route, /\.limit\((?:2_000|4_000)\)/);
assert.match(
  server,
  /\.from\("master_styles"\)[\s\S]{0,500}\.eq\("is_active", true\)[\s\S]{0,200}\.is\("archived_at", null\)/,
);
assert.match(server, /decisionCatalogHierarchyIsEligible/);
assert.match(server, /service_group:service_groups\(id,name,is_active,archived_at,service_category:service_categories\(id,name,is_active,archived_at\)\)/);
assert.match(server, /decisionCanonicalStyleIsEligible\(style, eligibleMasterStyleIds\)/);
assert.match(intentCore, /rejectedExplicitServiceId/);
assert.match(server, /if \(intent\.rejectedExplicitServiceId\)/);
assert.doesNotMatch(
  route,
  /result\.intent\.stable_service_id\s*\|\|\s*serviceId/,
);
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
  "Decision-search enrichment verification passed: explicit unresolved places cannot borrow current coordinates; typed Box/Boho requests resolve to canonical master IDs; inactive or archived canonical master/group/category records cannot leak through broad group/category searches; every eligible salon in the radius participates in post-promotion budget and opening selection; minimum-subtotal and service-group scope are enforced; availability fan-out is bounded; reliability uses a 180-day terminal-outcome denominator; enrichment paging and PostgREST chunks are bounded; and result/discovery counts remain separate.",
);
