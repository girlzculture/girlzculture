export type SearchLanguageRule = {
  target_type: "service" | "category";
  target_id: string;
  canonical_term: string;
  aliases: string[];
  keywords: string[];
  common_phrases: string[];
  misspellings: string[];
  ranking_boost: number;
  is_active: boolean;
};

export function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchTokens(value: unknown, stopWords: string[] = []) {
  const stops = new Set(stopWords.map(normalizeSearchText).filter(Boolean));
  return normalizeSearchText(value).split(" ").filter((token) => token && !stops.has(token));
}

/** Damerau-Levenshtein distance, including one adjacent transposition. */
export function editDistance(left: string, right: string) {
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
        matrix[row][column - 1] + 1,
        matrix[row - 1][column] + 1,
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

export function deterministicSearchScore({
  query,
  candidates,
  stopWords = [],
  fuzzyDistance = 2,
  boost = 1,
}: {
  query: string;
  candidates: string[];
  stopWords?: string[];
  fuzzyDistance?: number;
  boost?: number;
}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return Math.max(1, boost);
  const queryTokens = searchTokens(normalizedQuery, stopWords);
  let best = 0;
  for (const source of candidates) {
    const candidate = normalizeSearchText(source);
    if (!candidate) continue;
    if (candidate === normalizedQuery) best = Math.max(best, 120);
    else if (candidate.startsWith(normalizedQuery)) best = Math.max(best, 95);
    else if (candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)) best = Math.max(best, 78);
    const candidateTokens = searchTokens(candidate, stopWords);
    if (queryTokens.length && queryTokens.every((token) => candidateTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken)))) {
      best = Math.max(best, 70 + queryTokens.length);
    }
    if (queryTokens.length && queryTokens.every((token) => candidateTokens.some((candidateToken) => token.length >= 4 && candidateToken.length >= 4 && editDistance(token, candidateToken) <= fuzzyDistance))) {
      best = Math.max(best, 52 + queryTokens.length);
    }
  }
  return best ? best + Math.max(0, Number(boost) || 0) : 0;
}

export function ruleCandidates(rule: SearchLanguageRule | undefined, fallback: string) {
  return [
    fallback,
    rule?.canonical_term || "",
    ...(rule?.aliases || []),
    ...(rule?.keywords || []),
    ...(rule?.common_phrases || []),
    ...(rule?.misspellings || []),
  ].filter(Boolean);
}
