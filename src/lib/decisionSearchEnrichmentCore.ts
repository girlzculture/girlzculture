export const DECISION_SEARCH_ENRICHMENT_PAGE_SIZE = 500;
export const DECISION_SEARCH_MAX_SALON_IDS_PER_QUERY = 25;
export const DECISION_SEARCH_MAX_ENCODED_ID_FILTER_CHARACTERS = 1_200;

export type DecisionCatalogService = {
  id: string;
  name: string;
  aliases: string[];
};

export type DecisionPromotionPrice = {
  promotion_type: string | null;
  discount_value: number | null;
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
        candidate.aliases.map((term) => ({
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
