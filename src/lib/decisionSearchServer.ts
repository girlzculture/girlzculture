import "server-only";

import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import {
  discoverNearbySalons,
  type PublicSalonResult,
} from "@/lib/discoveryServer";
import {
  boundedSearchNumber,
  decisionSearchRadius,
  stableMasterStyleMatch,
} from "@/lib/discoverySearchCore";
import {
  collectDecisionSearchEnrichment,
  decisionEffectivePrice,
  groupDecisionSearchRowsBySalon,
  resolveDecisionServiceIdentity,
  selectBestDecisionPromotion,
} from "@/lib/decisionSearchEnrichmentCore";
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
};

export type DecisionSearchSalon = PublicSalonResult & {
  matched_service: {
    id: string;
    name: string;
    price: number | null;
    original_price: number | null;
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

type CatalogService = {
  id: string;
  name: string;
  aliases: string[];
};

type StyleRow = {
  id: string;
  salon_id: string;
  master_style_id: string | null;
  name: string;
  base_price: number | null;
  price_display_min: number | null;
  price_display_max: number | null;
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
};

type BookingRow = {
  id: string;
  salon_id: string;
  status: string;
};

type ParsedIntent = {
  service: CatalogService | null;
  stableServiceId: string | null;
  radiusMiles: number;
  minimumRating: number | null;
  maximumPrice: number | null;
  date: string | null;
  timePeriod: "any" | "morning" | "afternoon" | "evening";
  sort: "distance" | "rating" | "price_low" | "price_high";
  promotionOnly: boolean;
  bestIntent: boolean;
  affordableIntent: boolean;
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, needle: string) {
  const normalizedNeedle = normalize(needle);
  if (!normalizedNeedle) return false;
  return ` ${haystack} `.includes(` ${normalizedNeedle} `);
}

function dateOnly(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function nextWeekday(day: number) {
  const today = new Date();
  const delta = (day - today.getUTCDay() + 7) % 7 || 7;
  return dateOnly(delta);
}

function requestedDate(query: string, explicit: unknown) {
  const supplied = String(explicit || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(supplied)) return supplied;
  if (containsPhrase(query, "today")) return dateOnly();
  if (containsPhrase(query, "tomorrow")) return dateOnly(1);
  const days: Array<[string, number]> = [
    ["sunday", 0],
    ["monday", 1],
    ["tuesday", 2],
    ["wednesday", 3],
    ["thursday", 4],
    ["friday", 5],
    ["saturday", 6],
  ];
  const match = days.find(([name]) => containsPhrase(query, name));
  return match ? nextWeekday(match[1]) : null;
}

function requestedTimePeriod(
  query: string,
): ParsedIntent["timePeriod"] {
  if (/\b(morning|before noon)\b/.test(query)) return "morning";
  if (/\bafternoon\b/.test(query)) return "afternoon";
  if (/\b(evening|after work|night)\b/.test(query)) return "evening";
  return "any";
}

function timeMatches(value: string, period: ParsedIntent["timePeriod"]) {
  if (period === "any") return true;
  const hour = Number(value.split(":")[0]);
  return period === "morning"
    ? hour < 12
    : period === "afternoon"
      ? hour >= 12 && hour < 17
      : hour >= 17;
}

function displayedPrice(style: StyleRow | null) {
  if (!style) return null;
  const values = [
    style.price_display_min,
    style.base_price,
    style.price_display_max,
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? Math.min(...values) : null;
}

function promotionApplies(promotion: PromotionRow, style: StyleRow | null) {
  const scope = String(promotion.target_scope || "salon");
  const targets = Array.isArray(promotion.target_ids)
    ? promotion.target_ids.map(String)
    : [];
  if (scope === "salon") return true;
  if (!style) return false;
  if (scope === "services") return targets.includes(style.id);
  if (scope === "master_styles" && style.master_style_id)
    return targets.includes(style.master_style_id);
  return false;
}

async function catalog() {
  const admin = getSupabaseAdmin();
  const [styles, rules] = await Promise.all([
    admin
      .from("master_styles")
      .select("id,name")
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
    return {
      id: String(style.id),
      name: String(style.name),
      aliases: [...new Set([String(style.name), ...aliases])],
    };
  });
}

async function resolveOrigin(
  normalizedQuery: string,
  supplied: Coordinates | null,
) {
  if (supplied && validCoordinates(supplied)) {
    return { origin: supplied, locationLabel: "your location" };
  }
  const admin = getSupabaseAdmin();
  const markets = await admin
    .from("location_markets")
    .select("name,state_code,center_latitude,center_longitude")
    .eq("is_active", true)
    .limit(1_000);
  if (markets.error) throw markets.error;
  const market = (markets.data || [])
    .map((row) => ({
      row,
      phrase: normalize(`${row.name} ${row.state_code || ""}`),
      namePhrase: normalize(row.name),
    }))
    .filter(
      ({ phrase, namePhrase }) =>
        containsPhrase(normalizedQuery, phrase) ||
        containsPhrase(normalizedQuery, namePhrase),
    )
    .sort(
      (left, right) =>
        right.namePhrase.length - left.namePhrase.length,
    )[0]?.row;
  if (market) {
    return {
      origin: {
        lat: Number(market.center_latitude),
        lng: Number(market.center_longitude),
      },
      locationLabel: [market.name, market.state_code]
        .filter(Boolean)
        .join(", "),
    };
  }
  const zip = normalizedQuery.match(/\b\d{5}(?:-\d{4})?\b/)?.[0];
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
      };
    }
  }
  return { origin: null, locationLabel: null };
}

function parseIntent(
  rawQuery: string,
  services: CatalogService[],
  filters: DecisionSearchFilters,
): ParsedIntent {
  const query = normalize(rawQuery);
  const serviceIdentity = resolveDecisionServiceIdentity(
    query,
    services,
    filters.serviceId,
  );
  const affordableIntent =
    /\b(affordable|cheap|budget|lowest price|low cost)\b/.test(query);
  const bestIntent =
    /\b(best|best rated|highest rated|top rated|reliable)\b/.test(query);
  const radiusMatch = query.match(
    /\b(?:within|under|up to)\s+(\d{1,3}(?:\.\d+)?)\s*(?:miles?|mi)\b/,
  );
  const budgetMatch = query.match(
    /\b(?:under|below|less than|max(?:imum)?|budget(?: of)?)\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)\b/,
  );
  const ratingMatch = query.match(
    /\b([1-5](?:\.\d)?)\s*(?:stars?|and up|\+)\b/,
  );
  const explicitSort = filters.sort;
  const sort =
    explicitSort ||
    (bestIntent
      ? "rating"
      : affordableIntent
        ? "price_low"
        : "distance");
  const maximumPrice =
    boundedSearchNumber(filters.maximumPrice, null, 0, 100_000) ??
    boundedSearchNumber(budgetMatch?.[1], null, 0, 100_000);
  const minimumRating =
    boundedSearchNumber(filters.minimumRating, null, 0, 5) ??
    boundedSearchNumber(
      ratingMatch?.[1],
      bestIntent ? 3.9 : null,
      0,
      5,
    );
  return {
    // A stable catalog identity is authoritative. If it no longer exists, do
    // not reinterpret the display copy and accidentally return another style.
    service: serviceIdentity.service,
    stableServiceId: serviceIdentity.stableServiceId,
    radiusMiles: decisionSearchRadius(
      filters.radiusMiles,
      radiusMatch?.[1],
    ),
    minimumRating,
    maximumPrice,
    date: requestedDate(query, filters.date),
    timePeriod: requestedTimePeriod(query),
    sort,
    promotionOnly:
      filters.promotionOnly === true ||
      /\b(discount|deal|promotion|promo|offer|sale)\b/.test(query),
    bestIntent,
    affordableIntent,
  };
}

function relevantStyle(
  rows: StyleRow[],
  salonId: string,
  service: CatalogService | null,
  stableServiceId: string | null,
) {
  const salonRows = rows.filter((row) => row.salon_id === salonId);
  if (!salonRows.length) return null;
  if (stableServiceId) {
    return stableMasterStyleMatch(salonRows, stableServiceId);
  }
  if (service) {
    const exact = salonRows.find(
      (row) =>
        row.master_style_id === service.id ||
        normalize(row.name) === normalize(service.name),
    );
    if (exact) return exact;
  }
  return [...salonRows].sort(
    (left, right) =>
      (displayedPrice(left) ?? Number.POSITIVE_INFINITY) -
      (displayedPrice(right) ?? Number.POSITIVE_INFINITY),
  )[0];
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
  const intent = parseIntent(normalizedQuery, services, filters);
  const resolved = await resolveOrigin(normalizedQuery, input.origin);
  if (!resolved.origin || !validCoordinates(resolved.origin)) {
    return {
      needs_location: true,
      question:
        "Add a city, neighborhood, or ZIP to your search, or use your location.",
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
      summary:
        "A location is needed before nearby salons can be compared.",
      location_label: null,
    };
  }

  const discovery = await discoverNearbySalons({
    origin: resolved.origin,
    radius: intent.radiusMiles,
    style: intent.service?.name || undefined,
    masterStyleId: intent.stableServiceId,
    minimumRating: intent.minimumRating,
    // Offers are loaded below and the customer's real post-promotion service
    // price is authoritative. Filtering here would discard an otherwise
    // eligible $100 service with a 25% offer from an "under $80" search.
    maximumPrice: null,
    sort: intent.sort,
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
    };
  }

  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const [styleResult, promotionResult, bookingResult] = await Promise.all([
    collectDecisionSearchEnrichment<StyleRow>(
      ids,
      (salonIds, from, to) => {
        let query = admin
          .from("styles")
          .select(
            "id,salon_id,master_style_id,name,base_price,price_display_min,price_display_max",
          )
          .in("salon_id", salonIds)
          .is("archived_at", null)
          .eq("is_draft", false);
        if (intent.stableServiceId) {
          query = query.eq("master_style_id", intent.stableServiceId);
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
            "id,salon_id,title,discount_label,discount_value,promotion_type,target_scope,target_ids",
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
          .select("id,salon_id,status")
          .in("salon_id", salonIds)
          .order("id", { ascending: true })
          .range(from, to),
    ),
  ]);
  if (styleResult.error) throw styleResult.error;
  if (promotionResult.error) throw promotionResult.error;
  if (bookingResult.error) throw bookingResult.error;

  const styles = (styleResult.data || []) as StyleRow[];
  const promotions = (promotionResult.data || []) as PromotionRow[];
  const bookingRows = (bookingResult.data || []) as BookingRow[];
  const stylesBySalon = groupDecisionSearchRowsBySalon(styles);
  const promotionsBySalon = groupDecisionSearchRowsBySalon(promotions);
  const bookingsBySalon = groupDecisionSearchRowsBySalon(bookingRows);

  const enriched = await Promise.all(
    discovery.salons.map(async (salon): Promise<DecisionSearchSalon | null> => {
      const style = relevantStyle(
        stylesBySalon.get(salon.id) || [],
        salon.id,
        intent.service,
        intent.stableServiceId,
      );
      if (intent.stableServiceId && !style) return null;
      const applicablePromotions = (
        promotionsBySalon.get(salon.id) || []
      ).filter(
        (promotion) => promotionApplies(promotion, style),
      );
      const originalPrice = displayedPrice(style);
      const promotion = selectBestDecisionPromotion(
        originalPrice,
        applicablePromotions,
      );
      if (intent.promotionOnly && !promotion) return null;
      const price = decisionEffectivePrice(originalPrice, promotion);
      if (
        intent.maximumPrice !== null &&
        (price === null || price > intent.maximumPrice)
      )
        return null;

      const related = bookingsBySalon.get(salon.id) || [];
      const completed = related.filter(
        (row) => String(row.status).toLowerCase() === "completed",
      ).length;
      const cancelled = related.filter((row) =>
        ["cancelled", "canceled", "no-show", "no show"].includes(
          String(row.status).toLowerCase(),
        ),
      ).length;
      const total = related.length;
      const cancellationRate = total
        ? Math.round((cancelled / total) * 1_000) / 10
        : 0;

      let nextSlot: DecisionSearchSalon["next_slot"] = null;
      if (intent.date && style?.id) {
        try {
          const result = await bookingAvailability({
            salonId: salon.id,
            styleId: style.id,
            date: intent.date,
          });
          const slot = result.slots.find((candidate) =>
            timeMatches(candidate.value, intent.timePeriod),
          );
          if (slot) {
            nextSlot = {
              date: intent.date,
              value: slot.value,
              label: slot.label,
              stylist_name: slot.stylistName || null,
            };
          }
        } catch {
          nextSlot = null;
        }
        if (!nextSlot) return null;
      }

      return {
        ...salon,
        starting_price: price ?? salon.starting_price,
        matched_service: style
          ? {
              id: style.id,
              name: style.name,
              price,
              original_price:
                price !== originalPrice ? originalPrice : null,
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
          completed_appointments: completed,
          cancellation_rate_percent: cancellationRate,
          label: reliabilityLabel(completed, cancelled, total),
        },
        sponsored: false,
      };
    }),
  );

  const salons = enriched.filter(
    (salon): salon is DecisionSearchSalon => Boolean(salon),
  );
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
  const details = [
    `${salons.length} ${salons.length === 1 ? "salon" : "salons"} found within ${intent.radiusMiles} miles`,
    intent.maximumPrice !== null
      ? `${underBudget} at or below $${Math.round(intent.maximumPrice)}`
      : "",
    offerCount ? `${offerCount} with active offers` : "",
    intent.date ? `${availableCount} with a matching opening` : "",
  ].filter(Boolean);

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
    salons,
    summary: `${details.join(". ")}.`,
    location_label: resolved.locationLabel,
  };
}
