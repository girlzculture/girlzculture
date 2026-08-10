export const DECISION_SEARCH_ENRICHMENT_PAGE_SIZE = 500;
export const DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY = 25;
export const DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS = 1_200;
export const DECISION_SEARCH_AVAILABILITY_CONCURRENCY = 4;
export const DECISION_SEARCH_RELIABILITY_WINDOW_DAYS = 180;

export type DecisionReliabilityBooking = {
  status: unknown;
  appointment_datetime: unknown;
  cancellation_initiated_by?: unknown;
  cancelled_by?: unknown;
};

export type DecisionExplicitLocationRequest = {
  kind: "zip" | "place";
  phrase: string;
};

/**
 * Identify a location the customer explicitly typed. This is intentionally
 * conservative: service names such as "feed-in braids" and the generic
 * phrase "near me" are not treated as cities. A typed ZIP is always explicit.
 * Callers use this signal to prevent an unresolved place from silently falling
 * back to the browser's current coordinates.
 */
export function decisionExplicitLocationRequest(
  rawQuery: string,
): DecisionExplicitLocationRequest | null {
  const query = normalizeDecisionSearchText(rawQuery);
  const contextualZip = query.match(
    /\b(?:in|near|around|zip(?: code)?)\s+(\d{5})(?:\s?\d{4})?\b/,
  )?.[1];
  const zip = contextualZip || (/^\d{5}$/.test(query) ? query : null);
  if (zip) return { kind: "zip", phrase: zip };

  const locationPattern =
    /\b(?:in|near|around)\s+([a-z][a-z0-9.' -]{1,60}?)(?=\s+(?:in|near|around|within|under|up to|today|tomorrow|this|next|open|available|at|on|for|with|[1-5](?:\.\d)?\s*(?:stars?|\+))\b|$)/g;
  const serviceOnly = /^(?:(?:feed|stitch|home)\s+)?(?:braids?|braiding|locs?|twists?|cornrows?|salons?|styles?)$/;
  for (const match of query.matchAll(locationPattern)) {
    const phrase = normalizeDecisionSearchText(match[1])
      .replace(/\b(?:salons?|nearby)\b$/g, "")
      .trim();
    if (!phrase || phrase === "me" || serviceOnly.test(phrase)) continue;
    return { kind: "place", phrase };
  }
  return null;
}

export type DecisionCatalogService = {
  id: string;
  name: string;
  aliases: string[];
};

export type DecisionPromotionPrice = {
  promotion_type: string | null;
  discount_value: number | null;
};

export type DecisionSearchStyleCandidate = {
  id: string;
  salon_id: string;
  master_style_id: string | null;
  service_group_id: string | null;
  base_price: number | null;
  price_display_min: number | null;
  price_display_max: number | null;
};

export type DecisionSearchPromotionCandidate = DecisionPromotionPrice & {
  id: string;
  salon_id: string;
  target_scope: string | null;
  target_ids: string[] | null;
  restrictions: Record<string, unknown> | null;
};

export type EvaluatedDecisionStyle<
  TStyle extends DecisionSearchStyleCandidate = DecisionSearchStyleCandidate,
  TPromotion extends DecisionSearchPromotionCandidate = DecisionSearchPromotionCandidate,
> = {
  style: TStyle;
  originalPrice: number | null;
  price: number | null;
  promotion: TPromotion | null;
};

export type DecisionSearchPageResult<T> = {
  data: T[] | null;
  error: unknown;
};

type DecisionSearchCollectionOptions = {
  pageSize?: number;
  maximumIdsPerChunk?: number;
  maximumEncodedFilterCharacters?: number;
};

/**
 * Run provider-backed work with a hard concurrency ceiling while preserving
 * input/result order. This prevents one broad search from opening an
 * unbounded availability request for every discovered salon at once.
 */
export async function mapDecisionSearchWithConcurrency<T, R>(
  values: T[],
  worker: (value: T, index: number) => Promise<R>,
  requestedConcurrency = DECISION_SEARCH_AVAILABILITY_CONCURRENCY,
) {
  const results = new Array<R>(values.length);
  const concurrency = Math.max(
    1,
    Math.min(values.length || 1, Math.floor(requestedConcurrency || 1)),
  );
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        results[index] = await worker(values[index], index);
      }
    }),
  );
  return results;
}

/**
 * Reliability is a rate over recent terminal appointment outcomes—not over
 * pending requests, future appointments, or a salon's lifetime row count.
 * The appointment timestamp defines the auditable window consistently across
 * completed and cancelled outcomes.
 */
export function decisionBookingReliability(
  rows: DecisionReliabilityBooking[],
  now = Date.now(),
  windowDays = DECISION_SEARCH_RELIABILITY_WINDOW_DAYS,
) {
  const boundedDays = Math.max(1, Math.min(730, Math.floor(windowDays || 1)));
  const startsAt = now - boundedDays * 86_400_000;
  const terminalStatuses = new Set([
    "completed",
    "cancelled",
    "canceled",
    "no show",
    "no-show",
  ]);
  const eligible = rows.filter((row) => {
    const status = String(row.status || "").trim().toLowerCase();
    const occurredAt = Date.parse(String(row.appointment_datetime || ""));
    return (
      terminalStatuses.has(status) &&
      Number.isFinite(occurredAt) &&
      occurredAt >= startsAt &&
      occurredAt <= now
    );
  });
  const completed = eligible.filter(
    (row) => String(row.status || "").trim().toLowerCase() === "completed",
  ).length;
  const salonCancellations = eligible.filter((row) => {
    const status = String(row.status || "").trim().toLowerCase();
    const actor = String(
      row.cancelled_by || row.cancellation_initiated_by || "",
    ).trim().toLowerCase();
    return ["cancelled", "canceled"].includes(status) && actor === "salon";
  }).length;
  const terminalOutcomes = eligible.length;
  return {
    completed,
    salonCancellations,
    terminalOutcomes,
    cancellationRatePercent: terminalOutcomes
      ? Math.round((salonCancellations / terminalOutcomes) * 1_000) / 10
      : 0,
    windowDays: boundedDays,
  };
}

function normalizeDecisionSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsDecisionSearchPhrase(haystack: string, needle: string) {
  const normalizedNeedle = normalizeDecisionSearchText(needle);
  return Boolean(
    normalizedNeedle &&
      ` ${normalizeDecisionSearchText(haystack)} `.includes(
        ` ${normalizedNeedle} `,
      ),
  );
}

/**
 * Resolve typed service copy to the same stable master-style identity used by
 * an explicit catalog selection. Once a customer types a recognized exact
 * service (for example, Box Braids or Boho Braids), downstream discovery must
 * never fall back to a similarly named or cheaper unrelated service.
 */
export function resolveDecisionServiceIdentity<T extends DecisionCatalogService>(
  query: string,
  services: T[],
  explicitServiceId: unknown,
): { service: T | null; stableServiceId: string | null } {
  const explicitId = String(explicitServiceId || "").trim();
  if (explicitId) {
    return {
      service: services.find((service) => service.id === explicitId) || null,
      stableServiceId: explicitId,
    };
  }

  const excluded = new Set([
    "affordable",
    "best",
    "best rated",
    "highest rated",
    "salon",
    "salons",
    "salon near me",
    "salons near me",
    "beauty salon",
    "hair salon",
    "near me",
  ]);
  const service =
    services
      .flatMap((candidate) =>
        [candidate.name, ...candidate.aliases].map((term) => ({
          service: candidate,
          normalized: normalizeDecisionSearchText(term),
        })),
      )
      .filter(
        (candidate) =>
          !excluded.has(candidate.normalized) &&
          containsDecisionSearchPhrase(query, candidate.normalized),
      )
      .sort(
        (left, right) =>
          right.normalized.length - left.normalized.length ||
          left.service.name.localeCompare(right.service.name),
      )[0]?.service || null;

  return {
    service,
    stableServiceId: service?.id || null,
  };
}

export function decisionEffectivePrice(
  original: number | null,
  promotion: DecisionPromotionPrice | null,
) {
  if (original === null || !promotion) return original;
  const value = Math.max(0, Number(promotion.discount_value || 0));
  if (promotion.promotion_type === "percentage")
    return Math.max(0, original * (1 - Math.min(100, value) / 100));
  if (promotion.promotion_type === "fixed")
    return Math.max(0, original - value);
  if (promotion.promotion_type === "free_service") return 0;
  return original;
}

export function decisionDisplayedStylePrice(
  style: Pick<
    DecisionSearchStyleCandidate,
    "base_price" | "price_display_min" | "price_display_max"
  >,
) {
  const values = [
    style.price_display_min,
    style.base_price,
    style.price_display_max,
  ]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? Math.min(...values) : null;
}

function normalizedDecisionTarget(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Calculate the real search-card price for one service and one already-active
 * promotion. The search query pre-filters publication dates/status, while this
 * function enforces the customer-facing target and minimum-subtotal rules.
 */
export function decisionPromotionPriceForStyle<
  TPromotion extends DecisionSearchPromotionCandidate,
>(
  salonId: string,
  style: DecisionSearchStyleCandidate,
  originalPrice: number | null,
  promotion: TPromotion,
) {
  if (originalPrice === null) return null;
  if (promotion.salon_id && promotion.salon_id !== salonId) return null;

  const targets = new Set(
    (promotion.target_ids || [])
      .map(normalizedDecisionTarget)
      .filter(Boolean),
  );
  const scope = normalizedDecisionTarget(promotion.target_scope || "salon");
  const applies =
    scope === "salon" ||
    (scope === "services" && targets.has(normalizedDecisionTarget(style.id))) ||
    (scope === "service_groups" &&
      Boolean(
        style.service_group_id &&
          targets.has(normalizedDecisionTarget(style.service_group_id)),
      )) ||
    (scope === "master_styles" &&
      Boolean(
        style.master_style_id &&
          targets.has(normalizedDecisionTarget(style.master_style_id)),
      ));
  if (!applies) return null;

  const minimumSubtotal = Number(
    promotion.restrictions?.minimum_subtotal || 0,
  );
  if (!Number.isFinite(minimumSubtotal) || originalPrice < minimumSubtotal)
    return null;

  const type = normalizedDecisionTarget(promotion.promotion_type);
  const value = Math.max(0, Number(promotion.discount_value || 0));
  if (!Number.isFinite(value)) return null;
  if (type === "percentage")
    return Math.max(0, originalPrice * (1 - Math.min(100, value) / 100));
  if (type === "fixed") return Math.max(0, originalPrice - value);
  if (type === "free_service") return 0;
  // Product and add-on promotions cannot alter a service-only search price.
  return null;
}

/**
 * Evaluate every candidate service before choosing one. This prevents a cheap
 * pre-discount service with no opening from hiding another service that really
 * satisfies the customer's budget, promotion and availability request.
 */
export function evaluateDecisionStyleCandidates<
  TStyle extends DecisionSearchStyleCandidate,
  TPromotion extends DecisionSearchPromotionCandidate,
>(input: {
  salonId: string;
  styles: TStyle[];
  promotions: TPromotion[];
  maximumPrice: number | null;
  promotionOnly: boolean;
}) {
  const all = input.styles
    .map((style): EvaluatedDecisionStyle<TStyle, TPromotion> => {
      const originalPrice = decisionDisplayedStylePrice(style);
      const offers = input.promotions
        .map((promotion) => ({
          promotion,
          price: decisionPromotionPriceForStyle(
            input.salonId,
            style,
            originalPrice,
            promotion,
          ),
        }))
        .filter(
          (entry): entry is { promotion: TPromotion; price: number } =>
            entry.price !== null,
        )
        .sort(
          (left, right) =>
            left.price - right.price ||
            left.promotion.id.localeCompare(right.promotion.id),
        );
      return {
        style,
        originalPrice,
        price: offers[0]?.price ?? originalPrice,
        promotion: offers[0]?.promotion || null,
      };
    })
    .sort(
      (left, right) =>
        (left.price ?? Number.POSITIVE_INFINITY) -
          (right.price ?? Number.POSITIVE_INFINITY) ||
        left.style.id.localeCompare(right.style.id),
    );
  const withinBudget = all.filter(
    (candidate) =>
      input.maximumPrice === null ||
      (candidate.price !== null && candidate.price <= input.maximumPrice),
  );
  const eligible = input.promotionOnly
    ? withinBudget.filter((candidate) => candidate.promotion !== null)
    : withinBudget;
  return { all, withinBudget, eligible };
}

/**
 * Select the cheapest real candidate with a verified opening. When openings
 * are informative rather than required (for example a best-rated search), a
 * lack of slots falls back to the cheapest eligible service.
 */
export async function selectDecisionStyleWithOpening<
  TCandidate,
  TOpening,
>(input: {
  candidates: TCandidate[];
  loadOpening?: (candidate: TCandidate) => Promise<TOpening | null>;
  requireOpening: boolean;
}) {
  const fallback = input.candidates[0] || null;
  if (!input.loadOpening)
    return {
      candidate: fallback,
      opening: null as TOpening | null,
      availabilityFailure: false,
    };

  let availabilityFailure = false;
  for (const candidate of input.candidates) {
    try {
      const opening = await input.loadOpening(candidate);
      if (opening)
        return { candidate, opening, availabilityFailure };
    } catch {
      availabilityFailure = true;
    }
  }
  return {
    candidate: input.requireOpening ? null : fallback,
    opening: null as TOpening | null,
    availabilityFailure,
  };
}

/** Select the active applicable offer that produces the customer's real price. */
export function selectBestDecisionPromotion<T extends DecisionPromotionPrice>(
  original: number | null,
  promotions: T[],
): T | null {
  return promotions.reduce<T | null>((best, candidate) => {
    if (!best) return candidate;
    const candidatePrice = decisionEffectivePrice(original, candidate);
    const bestPrice = decisionEffectivePrice(original, best);
    if (candidatePrice === null) return best;
    if (bestPrice === null || candidatePrice < bestPrice) return candidate;
    return best;
  }, null);
}

export function encodedSalonIdFilterLength(ids: string[]) {
  return encodeURIComponent(ids.join(",")).length;
}

/**
 * Keep each PostgREST `in` filter small in both record count and encoded URL
 * size. Discovery may return every matching salon, so one global filter is not
 * safe even when every identifier is a UUID.
 */
export function chunkDecisionSearchSalonIds(
  salonIds: string[],
  options: DecisionSearchCollectionOptions = {},
) {
  const maximumIds = Math.max(
    1,
    Math.floor(
      options.maximumIdsPerChunk ??
        DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY,
    ),
  );
  const maximumEncodedCharacters = Math.max(
    1,
    Math.floor(
      options.maximumEncodedFilterCharacters ??
        DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS,
    ),
  );
  const uniqueIds = [
    ...new Set(salonIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const id of uniqueIds) {
    const candidate = [...current, id];
    if (
      current.length > 0 &&
      (candidate.length > maximumIds ||
        encodedSalonIdFilterLength(candidate) > maximumEncodedCharacters)
    ) {
      chunks.push(current);
      current = [id];
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Collect every enrichment row for every salon-ID chunk. Advance by the
 * number of rows the provider actually returned rather than assuming it
 * honored the requested range: a deployment-level PostgREST maximum can be
 * lower than the requested page size. An empty page is the only end marker.
 */
export async function collectDecisionSearchEnrichment<T>(
  salonIds: string[],
  loadPage: (
    salonIdChunk: string[],
    from: number,
    to: number,
  ) => PromiseLike<DecisionSearchPageResult<T>>,
  options: DecisionSearchCollectionOptions = {},
): Promise<DecisionSearchPageResult<T>> {
  const pageSize = Math.max(
    1,
    Math.min(
      1_000,
      Math.floor(options.pageSize ?? DECISION_SEARCH_ENRICHMENT_PAGE_SIZE),
    ),
  );
  const rows: T[] = [];
  const chunks = chunkDecisionSearchSalonIds(salonIds, options);

  for (const chunk of chunks) {
    let from = 0;
    for (;;) {
      const result = await loadPage(chunk, from, from + pageSize - 1);
      if (result.error) return { data: null, error: result.error };
      const page = result.data || [];
      if (!page.length) break;
      rows.push(...page);
      from += page.length;
    }
  }

  return { data: rows, error: null };
}

export function groupDecisionSearchRowsBySalon<
  T extends { salon_id: unknown },
>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const salonId = String(row.salon_id || "");
    if (!salonId) continue;
    const salonRows = grouped.get(salonId);
    if (salonRows) salonRows.push(row);
    else grouped.set(salonId, [row]);
  }
  return grouped;
}
