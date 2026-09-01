import {
  boundedSearchNumber,
  decisionSearchRadius,
} from "@/lib/discoverySearchCore";
import {
  resolveDecisionServiceIdentity,
  type DecisionCatalogService,
} from "@/lib/decisionSearchEnrichmentCore";

export type DecisionIntentFilters = {
  serviceId?: string | null;
  radiusMiles?: number | null;
  minimumRating?: number | null;
  maximumPrice?: number | null;
  date?: string | null;
  sort?: "distance" | "rating" | "price_low" | "price_high";
  promotionOnly?: boolean;
};

export type DecisionIntentCatalogService = DecisionCatalogService & {
  categoryId?: string | null;
  categoryName?: string | null;
  serviceGroupId?: string | null;
  serviceGroupName?: string | null;
};

export type DecisionLocationMarket = {
  name: string;
  state_code?: string | null;
  center_latitude: number;
  center_longitude: number;
};

export function matchDecisionLocationMarket(
  rawQuery: string,
  markets: DecisionLocationMarket[],
) {
  const query = normalizeDecisionQuery(rawQuery);
  return markets
    .map((market) => ({
      market,
      phrase: normalizeDecisionQuery(`${market.name} ${market.state_code || ""}`),
      namePhrase: normalizeDecisionQuery(market.name),
    }))
    .filter(({ phrase, namePhrase }) => containsPhrase(query, phrase) || containsPhrase(query, namePhrase))
    .sort((left, right) => right.namePhrase.length - left.namePhrase.length || left.namePhrase.localeCompare(right.namePhrase))[0] || null;
}

export type ParsedDecisionSearchIntent = {
  service: DecisionIntentCatalogService | null;
  stableServiceId: string | null;
  rejectedExplicitServiceId: boolean;
  serviceGroupId: string | null;
  categoryId: string | null;
  semanticPhrase: string | null;
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

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  twentyfive: 25,
  fifty: 50,
  hundred: 100,
};

export function normalizeDecisionQuery(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, needle: string) {
  const normalizedNeedle = normalizeDecisionQuery(needle);
  return Boolean(
    normalizedNeedle &&
      ` ${normalizeDecisionQuery(haystack)} `.includes(` ${normalizedNeedle} `),
  );
}

function singularizedDecisionPhrase(value: unknown) {
  return normalizeDecisionQuery(value)
    .split(" ")
    .map((token) => {
      if (token.length >= 5 && token.endsWith("ies"))
        return `${token.slice(0, -3)}y`;
      if (token.length >= 5 && token.endsWith("s")) return token.slice(0, -1);
      return token;
    })
    .join(" ");
}

function dateOnly(now: Date, offsetDays = 0) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function nextWeekday(now: Date, day: number) {
  const delta = (day - now.getUTCDay() + 7) % 7 || 7;
  return dateOnly(now, delta);
}

function requestedDate(query: string, explicit: unknown, now: Date) {
  const supplied = String(explicit || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(supplied)) return supplied;
  if (containsPhrase(query, "today")) return dateOnly(now);
  if (containsPhrase(query, "tomorrow")) return dateOnly(now, 1);
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
  return match ? nextWeekday(now, match[1]) : null;
}

function requestedTimePeriod(
  query: string,
): ParsedDecisionSearchIntent["timePeriod"] {
  if (/\b(morning|before noon)\b/.test(query)) return "morning";
  if (/\bafternoon\b/.test(query)) return "afternoon";
  if (/\b(evening|after work|night)\b/.test(query)) return "evening";
  return "any";
}

function wordRadius(query: string) {
  const match = query.match(
    /\b(?:within|under|up to)\s+([a-z]+(?:\s+[a-z]+)?)\s*(?:miles?|mi)\b/,
  );
  if (!match) return null;
  const key = match[1].replace(/\s+/g, "");
  return NUMBER_WORDS[key] ?? null;
}

function broadCatalogMatch(
  query: string,
  services: DecisionIntentCatalogService[],
) {
  type BroadCandidate = {
    id: string;
    categoryId: string | null;
    term: string;
    kind: "group" | "category";
  };
  const candidates = services.flatMap((service): BroadCandidate[] => {
    const result: BroadCandidate[] = [];
    if (
      service.serviceGroupId &&
      service.serviceGroupName &&
      normalizeDecisionQuery(service.serviceGroupName).length >= 3
    ) {
      result.push({
        id: service.serviceGroupId,
        categoryId: null,
        term: service.serviceGroupName,
        kind: "group",
      });
    }
    if (
      service.categoryId &&
      service.categoryName &&
      normalizeDecisionQuery(service.categoryName).length >= 3
    ) {
      result.push({
        id: service.categoryId,
        categoryId: service.categoryId,
        term: service.categoryName,
        kind: "category",
      });
    }
    return result;
  });
  return candidates
    .filter((candidate) => {
      if (containsPhrase(query, candidate.term)) return true;
      const term = normalizeDecisionQuery(candidate.term);
      if (
        containsPhrase(
          singularizedDecisionPhrase(query),
          singularizedDecisionPhrase(term),
        )
      )
        return true;
      // "braid", "braids" and "braiding" describe the managed Braids
      // category/group; they must not disappear as stop words or degrade into
      // an unfiltered salon search.
      return /\bbraid(?:s|ing)?\b/.test(query) && /\bbraid(?:s|ing)?\b/.test(term);
    })
    .sort(
      (left, right) =>
        normalizeDecisionQuery(right.term).length -
          normalizeDecisionQuery(left.term).length ||
        left.term.localeCompare(right.term),
    )[0] || null;
}

function residualSemanticPhrase(query: string) {
  const residual = ` ${query} `
    .replace(/\b(?:salons?|hair salon|beauty salon|near me|nearby)\b/g, " ")
    .replace(
      /\b(?:affordable|cheap|budget|lowest price|low cost|best|best rated|highest rated|top rated|highly rated|reliable)\b/g,
      " ",
    )
    .replace(/\b(?:open|opening|available|availability|appointment|book)\b/g, " ")
    .replace(/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, " ")
    .replace(/\b(?:within|under|up to)\s+(?:\d+(?:\.\d+)?|[a-z]+(?:\s+[a-z]+)?)\s*(?:miles?|mi)\b/g, " ")
    .replace(/\b(?:under|below|less than|max(?:imum)?|budget(?: of)?)\s*\$?\s*\d+(?:\.\d+)?\b/g, " ")
    .replace(/\b(?:[1-5](?:\.\d)?)\s*(?:stars?|and up|\+)\b/g, " ")
    .replace(/\b(?:braid|braids|braiding|service|services|style|styles|in|the|a|an|with|and|for)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return residual.length >= 3 ? residual : null;
}

/**
 * One deterministic parser powers typed search, catalog links, filters, and
 * the AI concierge fallback. It never invents a salon or service identity.
 */
export function parseDecisionSearchIntent(
  rawQuery: string,
  services: DecisionIntentCatalogService[],
  filters: DecisionIntentFilters = {},
  now = new Date(),
): ParsedDecisionSearchIntent {
  const query = normalizeDecisionQuery(rawQuery);
  const serviceIdentity = resolveDecisionServiceIdentity(
    query,
    services,
    filters.serviceId,
  );
  const broad = serviceIdentity.stableServiceId || serviceIdentity.rejectedExplicitServiceId
    ? null
    : broadCatalogMatch(query, services);
  const affordableIntent =
    /\b(affordable|cheap|budget|lowest price|low cost)\b/.test(query);
  const bestIntent =
    /\b(best|best rated|highest rated|top rated|highly rated|reliable)\b/.test(
      query,
    );
  const radiusMatch = query.match(
    /\b(?:within|under|up to)\s+(\d{1,3}(?:\.\d+)?)\s*(?:miles?|mi)\b/,
  );
  const budgetMatch = query.match(
    /\b(?:under|below|less than|max(?:imum)?|budget(?: of)?)\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)\b/,
  );
  const ratingMatch = query.match(
    /\b([1-5](?:\.\d)?)\s*(?:stars?|and up|\+)\b/,
  );
  const sort =
    filters.sort ||
    (bestIntent ? "rating" : affordableIntent ? "price_low" : "distance");
  const maximumPrice =
    boundedSearchNumber(filters.maximumPrice, null, 0, 100_000) ??
    boundedSearchNumber(budgetMatch?.[1], null, 0, 100_000);
  const minimumRating =
    boundedSearchNumber(filters.minimumRating, null, 0, 5) ??
    boundedSearchNumber(ratingMatch?.[1], bestIntent ? 3.9 : null, 0, 5);
  const semanticPhrase =
    serviceIdentity.stableServiceId ||
    serviceIdentity.rejectedExplicitServiceId ||
    broad
    ? null
    : residualSemanticPhrase(query);

  return {
    service: serviceIdentity.service,
    stableServiceId: serviceIdentity.stableServiceId,
    rejectedExplicitServiceId: serviceIdentity.rejectedExplicitServiceId,
    serviceGroupId: broad?.kind === "group" ? broad.id : null,
    categoryId: broad?.kind === "category" ? broad.categoryId : null,
    semanticPhrase,
    radiusMiles: decisionSearchRadius(
      filters.radiusMiles,
      radiusMatch?.[1] ?? wordRadius(query),
    ),
    minimumRating,
    maximumPrice,
    date: requestedDate(query, filters.date, now),
    timePeriod: requestedTimePeriod(query),
    sort,
    promotionOnly:
      filters.promotionOnly === true ||
      /\b(discount|deal|promotion|promo|offer|sale)\b/.test(query),
    bestIntent,
    affordableIntent,
  };
}

export function decisionSemanticMatch(
  phrase: string | null,
  fields: unknown[],
) {
  if (!phrase) return true;
  const normalizedPhrase = normalizeDecisionQuery(phrase);
  const haystack = normalizeDecisionQuery(fields.flatMap((field) =>
    Array.isArray(field) ? field : [field],
  ).join(" "));
  if (containsPhrase(haystack, normalizedPhrase)) return true;
  const tokens = normalizedPhrase.split(" ").filter((token) => token.length >= 3);
  return Boolean(tokens.length && tokens.every((token) => containsPhrase(haystack, token)));
}
