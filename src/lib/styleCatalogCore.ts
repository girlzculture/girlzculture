export const STYLE_CATALOG_DEFAULTS = {
  query: "",
  category: "",
  length: "",
  price: "any",
  sort: "popularity",
} as const;

export type StyleCatalogPriceFilter =
  | "any"
  | "under-150"
  | "150-250"
  | "over-250";

export type StyleCatalogSort = "popularity" | "a-z";

export type StyleCatalogFilters = {
  query: string;
  category: string;
  length: string;
  price: StyleCatalogPriceFilter;
  sort: StyleCatalogSort;
};

export type FilterableStyleCatalogItem = {
  name: string;
  category: string;
  count: number;
  price?: number | null;
  length?: string;
  lengths?: string[];
  searchTerms?: string[];
};

const CONTROLLED_QUERY_KEYS = [
  "q",
  "category",
  "length",
  "price",
  "sort",
] as const;

const priceFilters = new Set<StyleCatalogPriceFilter>([
  "any",
  "under-150",
  "150-250",
  "over-250",
]);

const sortValues = new Set<StyleCatalogSort>(["popularity", "a-z"]);

const alphabeticalCollator = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "base",
  numeric: true,
});

const exactCollator = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "variant",
  numeric: true,
});

export function normalizeStyleCatalogText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1)
    matrix[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] +
          (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + 1,
        );
      }
    }
  }
  return matrix[left.length][right.length];
}

function allowedTokenDistance(token: string) {
  if (token.length < 5) return 0;
  if (token.length <= 8) return 1;
  return 2;
}

function fuzzyTermMatch(query: string, candidate: string) {
  const queryTokens = query.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (!queryTokens.length || !candidateTokens.length) return false;
  if (Math.abs(queryTokens.length - candidateTokens.length) > 1) return false;
  return queryTokens.every((queryToken) =>
    candidateTokens.some((candidateToken) => {
      if (queryToken === candidateToken) return true;
      if (
        Math.abs(queryToken.length - candidateToken.length) >
        allowedTokenDistance(candidateToken)
      )
        return false;
      return (
        editDistance(queryToken, candidateToken) <=
        allowedTokenDistance(candidateToken)
      );
    }),
  );
}

export function styleMatchesCatalogQuery(
  item: FilterableStyleCatalogItem,
  rawQuery: string,
) {
  const query = normalizeStyleCatalogText(rawQuery);
  if (!query) return true;
  const candidates = [item.name, ...(item.searchTerms || [])]
    .map(normalizeStyleCatalogText)
    .filter(Boolean);
  return candidates.some(
    (candidate) =>
      candidate === query ||
      candidate.includes(query) ||
      query.includes(candidate) ||
      fuzzyTermMatch(query, candidate),
  );
}

export function itemCatalogLengths(item: FilterableStyleCatalogItem) {
  return [...(item.lengths || []), ...(item.length ? [item.length] : [])]
    .map((label) => String(label || "").trim())
    .filter(Boolean)
    .filter(
      (label, index, values) =>
        values.findIndex(
          (candidate) =>
            normalizeStyleCatalogText(candidate) ===
            normalizeStyleCatalogText(label),
        ) === index,
    );
}

function matchesPrice(
  value: number | null | undefined,
  filter: StyleCatalogPriceFilter,
) {
  if (filter === "any") return true;
  const price = Number(value);
  if (!Number.isFinite(price) || value === null || value === undefined)
    return false;
  if (filter === "under-150") return price < 150;
  if (filter === "150-250") return price >= 150 && price <= 250;
  return price > 250;
}

function compareStyleNames(
  left: FilterableStyleCatalogItem,
  right: FilterableStyleCatalogItem,
) {
  const normalized = alphabeticalCollator.compare(
    normalizeStyleCatalogText(left.name),
    normalizeStyleCatalogText(right.name),
  );
  if (normalized) return normalized;
  const exact = exactCollator.compare(left.name, right.name);
  if (exact) return exact;
  return alphabeticalCollator.compare(left.category, right.category);
}

export function filterStyleCatalogItems<T extends FilterableStyleCatalogItem>(
  items: readonly T[],
  filters: StyleCatalogFilters,
) {
  const category = normalizeStyleCatalogText(filters.category);
  const length = normalizeStyleCatalogText(filters.length);
  const result = items.filter((item) => {
    if (!styleMatchesCatalogQuery(item, filters.query)) return false;
    if (
      category &&
      normalizeStyleCatalogText(item.category) !== category
    )
      return false;
    if (
      length &&
      !itemCatalogLengths(item).some(
        (option) => normalizeStyleCatalogText(option) === length,
      )
    )
      return false;
    return matchesPrice(item.price, filters.price);
  });
  return [...result].sort((left, right) => {
    if (filters.sort === "popularity") {
      const popularity = Number(right.count || 0) - Number(left.count || 0);
      if (popularity) return popularity;
    }
    return compareStyleNames(left, right);
  });
}

export function parseStyleCatalogFilters(
  params: Pick<URLSearchParams, "get">,
): StyleCatalogFilters {
  const price = params.get("price") as StyleCatalogPriceFilter | null;
  const sort = params.get("sort") as StyleCatalogSort | null;
  return {
    query: String(params.get("q") || "").trim(),
    category: String(params.get("category") || "").trim(),
    length: String(params.get("length") || "").trim(),
    price: price && priceFilters.has(price) ? price : "any",
    sort: sort && sortValues.has(sort) ? sort : "popularity",
  };
}

export function sanitizeStyleCatalogFilters(
  filters: StyleCatalogFilters,
  categories: readonly string[],
  lengths: readonly string[],
): StyleCatalogFilters {
  const matchingCategory = categories.find(
    (option) =>
      normalizeStyleCatalogText(option) ===
      normalizeStyleCatalogText(filters.category),
  );
  const matchingLength = lengths.find(
    (option) =>
      normalizeStyleCatalogText(option) ===
      normalizeStyleCatalogText(filters.length),
  );
  return {
    ...filters,
    category: matchingCategory || "",
    length: matchingLength || "",
  };
}

export function styleCatalogFiltersToParams(
  filters: StyleCatalogFilters,
  currentParams: URLSearchParams = new URLSearchParams(),
) {
  const params = new URLSearchParams(currentParams.toString());
  for (const key of CONTROLLED_QUERY_KEYS) params.delete(key);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.length) params.set("length", filters.length);
  if (filters.price !== "any") params.set("price", filters.price);
  if (filters.sort !== "popularity") params.set("sort", filters.sort);
  return params;
}

export function sameStyleCatalogFilters(
  left: StyleCatalogFilters,
  right: StyleCatalogFilters,
) {
  return (
    left.query === right.query &&
    left.category === right.category &&
    left.length === right.length &&
    left.price === right.price &&
    left.sort === right.sort
  );
}
