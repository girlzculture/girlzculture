import "server-only";

import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import {
  discoverNearbySalons,
  type PublicSalonResult,
} from "@/lib/discoveryServer";
import {
  collectDecisionSearchEnrichment,
  DECISION_SEARCH_AVAILABILITY_CONCURRENCY,
  DECISION_SEARCH_RELIABILITY_WINDOW_DAYS,
  decisionBookingReliability,
  decisionExplicitLocationRequest,
  decisionDisplayedStylePrice,
  evaluateDecisionStyleCandidates,
  groupDecisionSearchRowsBySalon,
  mapDecisionSearchWithConcurrency,
  selectDecisionStyleWithOpening,
} from "@/lib/decisionSearchEnrichmentCore";
import {
  decisionSemanticMatch,
  matchDecisionLocationMarket,
  normalizeDecisionQuery as normalize,
  parseDecisionSearchIntent,
  type DecisionIntentCatalogService,
  type ParsedDecisionSearchIntent,
} from "@/lib/decisionSearchIntentCore";
import { validCoordinates, type Coordinates } from "@/lib/location";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type DecisionSearchFilters = {
  serviceId?: string | null;
  radiusMiles?: number | null;
  minimumRating?: number | null;
  maximumPrice?: number | null;
  date?: string | null;
  sort?: "distance" | "rating" | "price_low" | "price_high";
  promotionOnly?: boolean;
  page?: number | null;
  pageSize?: number | null;
};

export type DecisionSearchSalon = PublicSalonResult & {
  matched_service: {
    id: string;
    name: string;
    price: number | null;
    original_price: number | null;
    maximum_displayed_price: number | null;
  } | null;
  promotion: {
    id: string;
    title: string;
    label: string | null;
  } | null;
  next_slot: {
    date: string;
    value: string;
    label: string;
    stylist_name: string | null;
  } | null;
  reliability: {
    completed_appointments: number;
    cancellation_rate_percent: number;
    label: string;
  };
  sponsored: false;
};

type CatalogService = DecisionIntentCatalogService;

type StyleRow = {
  id: string;
  salon_id: string;
  master_style_id: string | null;
  name: string;
  base_price: number | null;
  price_display_min: number | null;
  price_display_max: number | null;
  service_group_id: string | null;
  category_id: string | null;
  category: string | null;
};

type PromotionRow = {
  id: string;
  salon_id: string;
  title: string;
  discount_label: string | null;
  discount_value: number | null;
  promotion_type: string | null;
  target_scope: string | null;
  target_ids: string[] | null;
  restrictions: Record<string, unknown> | null;
};

type BookingRow = {
  id: string;
  salon_id: string;
  status: string;
  cancellation_initiated_by: string | null;
  cancelled_by: string | null;
  appointment_datetime: string;
};

type SalonSearchRow = {
  id: string;
  name: string;
  description: string | null;
};

type StylistSearchRow = {
  id: string;
  salon_id: string;
  specialties: unknown;
  bio: string | null;
};

function timeMatches(
  value: string,
  period: ParsedDecisionSearchIntent["timePeriod"],
) {
  if (period === "any") return true;
  const hour = Number(value.split(":")[0]);
  return period === "morning"
    ? hour < 12
    : period === "afternoon"
      ? hour >= 12 && hour < 17
      : hour >= 17;
}

async function catalog() {
  const admin = getSupabaseAdmin();
  const [styles, rules] = await Promise.all([
    admin
      .from("master_styles")
      .select(
        "id,name,category_id,service_group_id,category,service_group:service_groups(id,name,service_category:service_categories(id,name))",
      )
      .eq("is_active", true)
      .order("name")
      .limit(2_000),
    admin
      .from("search_language_rules")
      .select(
        "target_id,canonical_term,aliases,keywords,common_phrases,misspellings",
      )
      .eq("target_type", "service")
      .eq("is_active", true)
      .limit(4_000),
  ]);
  if (styles.error) throw styles.error;
  if (rules.error) throw rules.error;
  const ruleByTarget = new Map(
    (rules.data || []).map((row) => [String(row.target_id), row]),
  );
  return (styles.data || []).map((style): CatalogService => {
    const rule = ruleByTarget.get(String(style.id));
    const aliases = [
      rule?.canonical_term,
      ...(Array.isArray(rule?.aliases) ? rule.aliases : []),
      ...(Array.isArray(rule?.keywords) ? rule.keywords : []),
      ...(Array.isArray(rule?.common_phrases) ? rule.common_phrases : []),
      ...(Array.isArray(rule?.misspellings) ? rule.misspellings : []),
    ]
      .map(String)
      .map((value) => value.trim())
      .filter((value) => value.length >= 3);
    const group = Array.isArray(style.service_group)
      ? style.service_group[0]
      : style.service_group;
    const category = Array.isArray(group?.service_category)
      ? group.service_category[0]
      : group?.service_category;
    return {
      id: String(style.id),
      name: String(style.name),
      aliases: [...new Set([String(style.name), ...aliases])],
      categoryId: String(category?.id || style.category_id || "") || null,
      categoryName: String(category?.name || "") || null,
      serviceGroupId: String(group?.id || style.service_group_id || "") || null,
      serviceGroupName: String(group?.name || style.category || "") || null,
    };
  });
}

async function resolveOrigin(
  normalizedQuery: string,
  supplied: Coordinates | null,
) {
  const admin = getSupabaseAdmin();
  const markets = await admin
    .from("location_markets")
    .select("name,state_code,center_latitude,center_longitude")
    .eq("is_active", true)
    .limit(1_000);
  if (markets.error) throw markets.error;
  const marketMatch = matchDecisionLocationMarket(normalizedQuery, (markets.data || []).map((row) => ({
    name: String(row.name),
    state_code: row.state_code,
    center_latitude: Number(row.center_latitude),
    center_longitude: Number(row.center_longitude),
  })));
  const market = marketMatch?.market;
  if (market) {
    return {
      origin: {
        lat: Number(market.center_latitude),
        lng: Number(market.center_longitude),
      },
      locationLabel: [market.name, market.state_code]
        .filter(Boolean)
        .join(", "),
      matchedLocationPhrase: normalize(market.name),
      unresolvedLocationPhrase: null,
    };
  }
  const explicitLocation = decisionExplicitLocationRequest(normalizedQuery);
  const zip = explicitLocation?.kind === "zip" ? explicitLocation.phrase : null;
  if (zip) {
    const salon = await admin
      .from("salons")
      .select("address_city,address_state,latitude,longitude")
      .eq("status", "Active")
      .eq("is_discoverable", true)
      .eq("address_zip", zip)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(1)
      .maybeSingle();
    if (salon.error) throw salon.error;
    if (salon.data) {
      return {
        origin: {
          lat: Number(salon.data.latitude),
          lng: Number(salon.data.longitude),
        },
        locationLabel: [
          salon.data.address_city,
          salon.data.address_state,
          zip,
        ]
          .filter(Boolean)
          .join(", "),
        matchedLocationPhrase: normalize(zip),
        unresolvedLocationPhrase: null,
      };
    }
  }
  if (explicitLocation) {
    return {
      origin: null,
      locationLabel: null,
      matchedLocationPhrase: null,
      unresolvedLocationPhrase: explicitLocation.phrase,
    };
  }
  if (supplied && validCoordinates(supplied)) {
    return {
      origin: supplied,
      locationLabel: "your location",
      matchedLocationPhrase: null,
      unresolvedLocationPhrase: null,
    };
  }
  return {
    origin: null,
    locationLabel: null,
    matchedLocationPhrase: null,
    unresolvedLocationPhrase: null,
  };
}

function withoutLocationPhrase(value: string | null, locationPhrase: string | null) {
  if (!value || !locationPhrase) return value;
  const locationTokens = new Set(normalize(locationPhrase).split(" ").filter((token) => token.length >= 2));
  const remaining = normalize(value).split(" ").filter((token) => !locationTokens.has(token));
  return remaining.join(" ").trim() || null;
}

function relevantStyles(
  rows: StyleRow[],
  service: CatalogService | null,
  stableServiceId: string | null,
  serviceGroupId: string | null,
  categoryId: string | null,
) {
  if (!rows.length) return [];
  if (stableServiceId) {
    return rows.filter((row) => row.master_style_id === stableServiceId);
  }
  if (service) {
    const exact = rows.filter(
      (row) =>
        row.master_style_id === service.id ||
        normalize(row.name) === normalize(service.name),
    );
    if (exact.length) return exact;
  }
  if (serviceGroupId) {
    return rows.filter((row) => row.service_group_id === serviceGroupId);
  }
  if (categoryId) {
    return rows.filter((row) => row.category_id === categoryId);
  }
  return [...rows].sort(
    (left, right) =>
      (decisionDisplayedStylePrice(left) ?? Number.POSITIVE_INFINITY) -
      (decisionDisplayedStylePrice(right) ?? Number.POSITIVE_INFINITY),
  );
}

function reliabilityLabel(
  completed: number,
  cancelled: number,
  total: number,
) {
  if (total < 3) return "New booking history";
  const rate = total ? (cancelled / total) * 100 : 0;
  if (rate <= 5 && completed >= 5) return "Highly reliable";
  if (rate <= 12) return "Reliable";
  return "Review recent availability";
}

export async function runDecisionSearch(input: {
  query: string;
  origin: Coordinates | null;
  filters?: DecisionSearchFilters;
}) {
  const services = await catalog();
  const filters = input.filters || {};
  const normalizedQuery = normalize(input.query);
  const intent = parseDecisionSearchIntent(
    normalizedQuery,
    services,
    filters,
  );
  const resolved = await resolveOrigin(normalizedQuery, input.origin);
  intent.semanticPhrase = withoutLocationPhrase(intent.semanticPhrase, resolved.matchedLocationPhrase);
  if (!resolved.origin || !validCoordinates(resolved.origin)) {
    const unresolved = resolved.unresolvedLocationPhrase;
    return {
      needs_location: true,
      question: unresolved
        ? `We couldn't match "${unresolved}" to a supported city, market, or ZIP. Check the location and try again.`
        : "Add a city, neighborhood, or ZIP to your search, or use your location.",
      intent: {
        service: intent.service?.name || null,
        radius_miles: intent.radiusMiles,
        minimum_rating: intent.minimumRating,
        maximum_price: intent.maximumPrice,
        date: intent.date,
        sort: intent.sort,
        promotion_only: intent.promotionOnly,
      },
      salons: [] as DecisionSearchSalon[],
      summary: unresolved
        ? "The typed location could not be resolved, so current-location coordinates were not substituted."
        : "A location is needed before nearby salons can be compared.",
      location_label: null,
      empty_reason: unresolved
        ? "location_unresolved" as const
        : "location_required" as const,
    };
  }

  const discovery = await discoverNearbySalons({
    origin: resolved.origin,
    radius: intent.radiusMiles,
    // Radius/eligibility is deliberately the first stage. Service, rating,
    // semantic, real post-promotion price and availability are evaluated in
    // sequence below so an empty result can name the first failed condition.
    sort: intent.sort,
    // Apply the decisive service, semantic, current-price, promotion, and
    // availability checks to the complete eligible radius set. Capping the
    // nearest 50 before those checks can incorrectly return zero even when a
    // matching salon exists later in the radius-ranked set.
    limit: "all",
  });
  const ids = discovery.salons.map((salon) => salon.id);
  if (!ids.length) {
    return {
      needs_location: false,
      question: null,
      intent: {
        service: intent.service?.name || null,
        radius_miles: intent.radiusMiles,
        minimum_rating: intent.minimumRating,
        maximum_price: intent.maximumPrice,
        date: intent.date,
        sort: intent.sort,
        promotion_only: intent.promotionOnly,
      },
      salons: [] as DecisionSearchSalon[],
      summary: `No matching salons were found within ${intent.radiusMiles} miles. Try a wider distance or fewer filters.`,
      location_label: resolved.locationLabel,
      empty_reason: "no_salons_in_radius" as const,
    };
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const reliabilityStartsAt = new Date(
    Date.parse(now) - DECISION_SEARCH_RELIABILITY_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const [
    styleResult,
    promotionResult,
    bookingResult,
    salonSearchResult,
    stylistSearchResult,
  ] = await Promise.all([
    collectDecisionSearchEnrichment<StyleRow>(
      ids,
      (salonIds, from, to) => {
        let query = admin
          .from("styles")
          .select(
            "id,salon_id,master_style_id,service_group_id,category_id,name,category,base_price,price_display_min,price_display_max",
          )
          .in("salon_id", salonIds)
          .is("archived_at", null)
          .eq("is_draft", false);
        if (intent.stableServiceId) {
          query = query.eq("master_style_id", intent.stableServiceId);
        } else if (intent.serviceGroupId) {
          query = query.eq("service_group_id", intent.serviceGroupId);
        } else if (intent.categoryId) {
          query = query.eq("category_id", intent.categoryId);
        }
        return query.order("id", { ascending: true }).range(from, to);
      },
    ),
    collectDecisionSearchEnrichment<PromotionRow>(
      ids,
      (salonIds, from, to) =>
        admin
          .from("salon_promotions")
          .select(
            "id,salon_id,title,discount_label,discount_value,promotion_type,target_scope,target_ids,restrictions",
          )
          .in("salon_id", salonIds)
          .eq("status", "Active")
          .eq("is_active", true)
          .is("archived_at", null)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gte.${now}`)
          .order("id", { ascending: true })
          .range(from, to),
    ),
    collectDecisionSearchEnrichment<BookingRow>(
      ids,
      (salonIds, from, to) =>
        admin
          .from("bookings")
          .select("id,salon_id,status,cancellation_initiated_by,cancelled_by,appointment_datetime")
          .in("salon_id", salonIds)
          .gte("appointment_datetime", reliabilityStartsAt)
          .lte("appointment_datetime", now)
          .order("id", { ascending: true })
          .range(from, to),
    ),
    collectDecisionSearchEnrichment<SalonSearchRow>(
      ids,
      (salonIds, from, to) =>
        admin
          .from("salons")
          .select("id,name,description")
          .in("id", salonIds)
          .order("id", { ascending: true })
          .range(from, to),
    ),
    collectDecisionSearchEnrichment<StylistSearchRow>(
      ids,
      (salonIds, from, to) =>
        admin
          .from("stylists")
          .select("id,salon_id,specialties,bio")
          .in("salon_id", salonIds)
          .eq("is_active", true)
          .order("id", { ascending: true })
          .range(from, to),
    ),
  ]);
  if (styleResult.error) throw styleResult.error;
  if (promotionResult.error) throw promotionResult.error;
  if (bookingResult.error) throw bookingResult.error;
  if (salonSearchResult.error) throw salonSearchResult.error;
  if (stylistSearchResult.error) throw stylistSearchResult.error;

  const styles = (styleResult.data || []) as StyleRow[];
  const promotions = (promotionResult.data || []) as PromotionRow[];
  const bookingRows = (bookingResult.data || []) as BookingRow[];
  const salonSearchRows = (salonSearchResult.data || []) as SalonSearchRow[];
  const stylistSearchRows = (stylistSearchResult.data || []) as StylistSearchRow[];
  const stylesBySalon = groupDecisionSearchRowsBySalon(styles);
  const promotionsBySalon = groupDecisionSearchRowsBySalon(promotions);
  const bookingsBySalon = groupDecisionSearchRowsBySalon(bookingRows);
  const salonSearchById = new Map(
    salonSearchRows.map((row) => [String(row.id), row]),
  );
  const stylistsBySalon = groupDecisionSearchRowsBySalon(stylistSearchRows);

  const dateAtOffset = (start: string, offset: number) => {
    const value = new Date(`${start}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const evaluated = await mapDecisionSearchWithConcurrency(
    discovery.salons,
    async (salon): Promise<{ salon: DecisionSearchSalon | null; passedStage: number; availabilityFailure: boolean }> => {
      const candidateStyles = relevantStyles(
        stylesBySalon.get(salon.id) || [],
        intent.service,
        intent.stableServiceId,
        intent.serviceGroupId,
        intent.categoryId,
      );
      if (
        (intent.stableServiceId || intent.serviceGroupId || intent.categoryId) &&
        candidateStyles.length === 0
      )
        return { salon: null, passedStage: 0, availabilityFailure: false };
      if (
        intent.minimumRating !== null &&
        Number(salon.rating_overall || 0) < intent.minimumRating
      )
        return { salon: null, passedStage: 1, availabilityFailure: false };
      if (
        !decisionSemanticMatch(intent.semanticPhrase, [
          salonSearchById.get(salon.id)?.name,
          salonSearchById.get(salon.id)?.description,
          ...(stylesBySalon.get(salon.id) || []).flatMap((row) => [
            row.name,
            row.category,
          ]),
          ...(stylistsBySalon.get(salon.id) || []).flatMap((row) => [
            row.specialties,
            row.bio,
          ]),
        ])
      )
        return { salon: null, passedStage: 2, availabilityFailure: false };
      const candidateEvaluation = evaluateDecisionStyleCandidates({
        salonId: salon.id,
        styles: candidateStyles,
        promotions: promotionsBySalon.get(salon.id) || [],
        maximumPrice: intent.maximumPrice,
        promotionOnly: intent.promotionOnly,
      });
      if (
        intent.maximumPrice !== null &&
        candidateEvaluation.withinBudget.length === 0
      )
        return { salon: null, passedStage: 3, availabilityFailure: false };
      if (intent.promotionOnly && candidateEvaluation.eligible.length === 0) {
        return { salon: null, passedStage: 4, availabilityFailure: false };
      }

      const reliability = decisionBookingReliability(
        bookingsBySalon.get(salon.id) || [],
        Date.parse(now),
      );

      const availabilityStart =
        intent.date ||
        (intent.bestIntent ? new Date().toISOString().slice(0, 10) : null);
      const availabilityDays = intent.date ? 1 : intent.bestIntent ? 7 : 0;
      const selection = await selectDecisionStyleWithOpening({
        candidates: candidateEvaluation.eligible,
        requireOpening: Boolean(intent.date),
        loadOpening:
          availabilityStart && availabilityDays
            ? async (candidate) => {
                for (
                  let offset = 0;
                  offset < availabilityDays;
                  offset += 1
                ) {
                  const date = dateAtOffset(availabilityStart, offset);
                  const result = await bookingAvailability({
                    salonId: salon.id,
                    styleId: candidate.style.id,
                    date,
                  });
                  const slot = result.slots.find((slotCandidate) =>
                    timeMatches(slotCandidate.value, intent.timePeriod),
                  );
                  if (slot) {
                    return {
                      date,
                      value: slot.value,
                      label: slot.label,
                      stylist_name: slot.stylistName || null,
                    };
                  }
                }
                return null;
              }
            : undefined,
      });
      if (intent.date && !selection.candidate) {
        return {
          salon: null,
          passedStage: 5,
          availabilityFailure: selection.availabilityFailure,
        };
      }
      const selectedCandidate = selection.candidate;
      const style = selectedCandidate?.style || null;
      const originalPrice = selectedCandidate?.originalPrice ?? null;
      const promotion = selectedCandidate?.promotion || null;
      const price = selectedCandidate?.price ?? null;
      const nextSlot = selection.opening || null;

      return {
        passedStage: 6,
        availabilityFailure: selection.availabilityFailure,
        salon: {
          ...salon,
          starting_price: price ?? salon.starting_price,
          matched_service: style
            ? {
                id: style.id,
                name: style.name,
                price,
                original_price:
                  price !== originalPrice ? originalPrice : null,
                maximum_displayed_price:
                  style.price_display_max === null
                    ? null
                    : Number(style.price_display_max),
              }
            : null,
          promotion: promotion
            ? {
                id: promotion.id,
                title: promotion.title,
                label: promotion.discount_label,
              }
            : null,
          next_slot: nextSlot,
          reliability: {
            completed_appointments: reliability.completed,
            cancellation_rate_percent: reliability.cancellationRatePercent,
            label: reliabilityLabel(
              reliability.completed,
              reliability.salonCancellations,
              reliability.terminalOutcomes,
            ),
          },
          sponsored: false,
        },
      };
    },
    DECISION_SEARCH_AVAILABILITY_CONCURRENCY,
  );

  const salons = evaluated.map((result) => result.salon).filter(
    (salon): salon is DecisionSearchSalon => Boolean(salon),
  );
  const stageCounts = {
    service: evaluated.filter((result) => result.passedStage >= 1).length,
    rating: evaluated.filter((result) => result.passedStage >= 2).length,
    semantic: evaluated.filter((result) => result.passedStage >= 3).length,
    budget: evaluated.filter((result) => result.passedStage >= 4).length,
    promotion: evaluated.filter((result) => result.passedStage >= 5).length,
    opening: evaluated.filter((result) => result.passedStage >= 6).length,
  };
  const availabilityFailureCount = evaluated.filter(
    (result) => result.availabilityFailure,
  ).length;
  salons.sort((left, right) => {
    if (intent.sort === "price_low") {
      return (
        (left.matched_service?.price ??
          left.starting_price ??
          Number.POSITIVE_INFINITY) -
          (right.matched_service?.price ??
            right.starting_price ??
            Number.POSITIVE_INFINITY) ||
        Number(Boolean(right.promotion)) - Number(Boolean(left.promotion)) ||
        left.distance_miles - right.distance_miles
      );
    }
    if (intent.sort === "price_high") {
      return (
        (right.matched_service?.price ??
          right.starting_price ??
          Number.NEGATIVE_INFINITY) -
          (left.matched_service?.price ??
            left.starting_price ??
            Number.NEGATIVE_INFINITY) ||
        left.distance_miles - right.distance_miles
      );
    }
    if (intent.sort === "rating" || intent.bestIntent) {
      const score = (salon: DecisionSearchSalon) =>
        Number(salon.rating_overall || 0) * 20 +
        Math.log10(Number(salon.review_count || 0) + 1) * 12 +
        Math.min(20, salon.reliability.completed_appointments / 2) -
        salon.reliability.cancellation_rate_percent * 0.45 -
        salon.distance_miles * 0.12 +
        (salon.next_slot ? 5 : 0);
      return score(right) - score(left);
    }
    return left.distance_miles - right.distance_miles;
  });

  const underBudget =
    intent.maximumPrice === null
      ? 0
      : salons.filter((salon) => {
          const price =
            salon.matched_service?.price ?? salon.starting_price;
          return price !== null && price <= intent.maximumPrice!;
        }).length;
  const offerCount = salons.filter((salon) => salon.promotion).length;
  const availableCount = salons.filter((salon) => salon.next_slot).length;
  const currentPrices = salons
    .map((salon) => salon.matched_service?.price ?? salon.starting_price)
    .filter((value): value is number => value !== null && Number.isFinite(Number(value)))
    .map(Number);
  const lowestCurrentPrice = currentPrices.length ? Math.min(...currentPrices) : null;
  const totalCompleted = salons.reduce(
    (sum, salon) => sum + salon.reliability.completed_appointments,
    0,
  );
  const details = [
    `${salons.length} ${salons.length === 1 ? "salon" : "salons"} found within ${intent.radiusMiles} miles`,
    lowestCurrentPrice !== null
      ? `the lowest current matched-service price is $${Math.round(lowestCurrentPrice)}`
      : "",
    intent.maximumPrice !== null
      ? `${underBudget} at or below $${Math.round(intent.maximumPrice)}`
      : "",
    offerCount ? `${offerCount} with active offers` : "",
    intent.date || intent.bestIntent ? `${availableCount} with a verified opening` : "",
    intent.bestIntent
      ? `ranking used ratings, review counts, ${totalCompleted} completed appointments, salon-initiated cancellation history, availability, and distance`
      : "",
  ].filter(Boolean);

  const pageSize = Math.max(
    1,
    Math.min(25, Math.floor(Number(filters.pageSize) || 20)),
  );
  const page = Math.max(1, Math.min(100, Math.floor(Number(filters.page) || 1)));
  const pageOffset = (page - 1) * pageSize;
  const pagedSalons = salons.slice(pageOffset, pageOffset + pageSize);

  const emptyReason = salons.length
    ? null
    : intent.date && availabilityFailureCount > 0
      ? "technical_search_failure" as const
    : (intent.stableServiceId || intent.serviceGroupId || intent.categoryId) && stageCounts.service === 0
      ? "service_unavailable_nearby" as const
      : intent.minimumRating !== null && stageCounts.rating === 0
        ? "rating_unavailable" as const
      : intent.semanticPhrase && stageCounts.semantic === 0
        ? "service_unavailable_nearby" as const
        : intent.maximumPrice !== null && stageCounts.budget === 0
          ? "budget_unavailable" as const
          : intent.promotionOnly && stageCounts.promotion === 0
            ? "promotion_unavailable" as const
            : intent.date && stageCounts.opening === 0
              ? "opening_unavailable" as const
              : "no_exact_match" as const;
  const emptySummary = emptyReason === "service_unavailable_nearby"
    ? "No nearby salon currently offers every requested service detail. Try a broader service or wider distance."
    : emptyReason === "rating_unavailable"
      ? `Nearby salons were found, but none currently meets the ${Number(intent.minimumRating || 0).toFixed(1)}-star minimum.`
    : emptyReason === "budget_unavailable"
      ? `No service match currently passes the $${Math.round(intent.maximumPrice || 0)} budget. Try a higher budget or remove that filter.`
      : emptyReason === "promotion_unavailable"
        ? "Matching nearby salons were found, but none currently has an eligible active offer."
        : emptyReason === "opening_unavailable"
          ? "Matching nearby salons were found, but none has the requested opening. Try another date or time."
          : emptyReason === "technical_search_failure"
            ? "We found nearby service matches, but availability could not be verified right now. Try again; no opening result has been guessed."
          : "No eligible nearby salons match every requested detail.";

  return {
    needs_location: false,
    question: null,
    intent: {
      service: intent.service?.name || null,
      radius_miles: intent.radiusMiles,
      minimum_rating: intent.minimumRating,
      maximum_price: intent.maximumPrice,
      date: intent.date,
      sort: intent.sort,
      promotion_only: intent.promotionOnly,
    },
    salons: pagedSalons,
    summary: salons.length ? `${details.join(". ")}.` : emptySummary,
    partial_search: pagedSalons.length > 0 && availabilityFailureCount > 0,
    warning: availabilityFailureCount > 0
      ? "Availability could not be verified for every matching salon. Unverified openings were not presented as available."
      : null,
    location_label: resolved.locationLabel,
    empty_reason: emptyReason,
    pagination: {
      page,
      page_size: pageSize,
      returned_count: pagedSalons.length,
      evaluated_match_count: salons.length,
      discovered_candidate_count: discovery.salons.length,
      total_discovered_count: discovery.total,
      candidate_limit: null,
      has_more_results: pageOffset + pagedSalons.length < salons.length,
      candidate_set_truncated: false,
    },
    evidence: {
      discovered_salons: discovery.salons.length,
      after_service: stageCounts.service,
      after_rating: stageCounts.rating,
      after_semantic: stageCounts.semantic,
      after_budget: stageCounts.budget,
      after_promotion: stageCounts.promotion,
      after_opening: stageCounts.opening,
      availability_failures: availabilityFailureCount,
      lowest_current_price: lowestCurrentPrice,
      active_offer_count: offerCount,
      verified_opening_count: availableCount,
      completed_appointments: totalCompleted,
    },
  };
}
