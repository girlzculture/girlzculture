export type CatalogCorrectionCandidate = {
  id: string;
  name: string;
  terms: string[];
  canonicalTerms?: string[];
  aliasTerms?: string[];
  commonPhraseTerms?: string[];
  keywordTerms?: string[];
  misspellingTerms?: string[];
};

export type CatalogCorrection = {
  serviceId: string;
  serviceName: string;
  originalQuery: string;
  resolvedQuery: string;
  correctedTerms: Array<{ from: string; to: string }>;
  confidence: number;
  exact: boolean;
};

const EXCLUDED_SINGLE_TERMS = new Set([
  "affordable",
  "best",
  "rated",
  "salon",
  "salons",
  "near",
  "nearby",
  "service",
  "services",
  "style",
  "styles",
]);

const EXCLUDED_CANONICAL_NAME_TOKENS = new Set([
  ...EXCLUDED_SINGLE_TERMS,
  "beauty",
  "hair",
  "natural",
  "professional",
  "treatment",
]);

export function normalizeCatalogSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function damerauLevenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  );
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1)
    matrix[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution =
        matrix[row - 1][column - 1] +
        (left[row - 1] === right[column - 1] ? 0 : 1);
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        substitution,
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

/**
 * Add a canonical-name token only when it identifies exactly one service.
 * This lets a customer type a meaningful shorthand such as `Blowout` for the
 * sole `Dominican Blowout` catalog entry without turning generic words such as
 * `Braids` into an arbitrary service choice. If another catalog service later
 * uses the same token, the shorthand automatically becomes unavailable until
 * an approved alias disambiguates it.
 */
export function withUniqueCanonicalNameTokens(
  candidates: CatalogCorrectionCandidate[],
) {
  const owners = new Map<string, Set<string>>();
  const candidateTokens = new Map<string, string[]>();
  for (const candidate of candidates) {
    const tokens = normalizeCatalogSearchText(candidate.name)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 5 && !EXCLUDED_CANONICAL_NAME_TOKENS.has(token),
      );
    candidateTokens.set(candidate.id, tokens);
    for (const token of tokens) {
      const tokenOwners = owners.get(token) || new Set<string>();
      tokenOwners.add(candidate.id);
      owners.set(token, tokenOwners);
    }
  }
  return candidates.map((candidate) => ({
    ...candidate,
    aliasTerms: [
      ...(candidate.aliasTerms || []),
      ...(candidateTokens.get(candidate.id) || []).filter(
        (token) => owners.get(token)?.size === 1,
      ),
    ].filter((term, index, values) => values.indexOf(term) === index),
  }));
}

function singular(value: string) {
  if (value.length >= 5 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length >= 5 && value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function permittedDistance(candidate: string) {
  if (candidate.length < 5) return 0;
  if (candidate.length <= 7) return 1;
  if (candidate.length <= 12) return 2;
  return 3;
}

function tokenDistance(queryToken: string, candidateToken: string) {
  if (queryToken === candidateToken) return 0;
  if (singular(queryToken) === singular(candidateToken)) return 0;
  if (
    candidateToken.length < 5 ||
    queryToken.length < 4 ||
    Math.abs(candidateToken.length - queryToken.length) > 3
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const distance = damerauLevenshteinDistance(queryToken, candidateToken);
  return distance <= permittedDistance(candidateToken)
    ? distance
    : Number.POSITIVE_INFINITY;
}

function bestTermMatch(queryTokens: string[], rawTerm: string) {
  const termTokens = normalizeCatalogSearchText(rawTerm).split(" ").filter(Boolean);
  if (!termTokens.length || queryTokens.length < termTokens.length) return null;
  if (
    termTokens.length === 1 &&
    (termTokens[0].length < 5 || EXCLUDED_SINGLE_TERMS.has(termTokens[0]))
  ) {
    return null;
  }
  let best:
    | {
        start: number;
        score: number;
        edits: number;
        source: string[];
        target: string[];
      }
    | null = null;
  for (let start = 0; start <= queryTokens.length - termTokens.length; start += 1) {
    const source = queryTokens.slice(start, start + termTokens.length);
    let edits = 0;
    let exactTokens = 0;
    let valid = true;
    for (let index = 0; index < termTokens.length; index += 1) {
      const distance = tokenDistance(source[index], termTokens[index]);
      if (!Number.isFinite(distance)) {
        valid = false;
        break;
      }
      edits += distance;
      if (distance === 0) exactTokens += 1;
    }
    if (!valid) continue;
    const totalCharacters = termTokens.reduce(
      (total, token) => total + token.length,
      0,
    );
    const confidence = Math.max(0, 1 - edits / Math.max(1, totalCharacters));
    const exactBoost = exactTokens / termTokens.length / 20;
    const multiTokenBoost = termTokens.length > 1 ? 0.02 : 0;
    const score = Math.min(1, confidence + exactBoost + multiTokenBoost);
    if (!best || score > best.score || (score === best.score && edits < best.edits)) {
      best = { start, score, edits, source, target: termTokens };
    }
  }
  return best;
}

export function resolveCatalogCorrection(
  rawQuery: string,
  candidates: CatalogCorrectionCandidate[],
): CatalogCorrection | null {
  const originalQuery = String(rawQuery || "").trim();
  const normalizedQuery = normalizeCatalogSearchText(originalQuery);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (!queryTokens.length) return null;

  const matches = candidates.flatMap((candidate) => {
    const terms = [
      ...[candidate.name, ...(candidate.canonicalTerms || [])].map((term) => ({
        term,
        provenance: 0,
      })),
      ...[
        ...(candidate.aliasTerms || []),
        ...(candidate.commonPhraseTerms || []),
        ...(candidate.keywordTerms || []),
        ...candidate.terms,
      ].map((term) => ({ term, provenance: 1 })),
      ...(candidate.misspellingTerms || []).map((term) => ({
        term,
        provenance: 2,
      })),
    ]
      .map(({ term, provenance }) => ({
        term: normalizeCatalogSearchText(term),
        provenance,
      }))
      .filter(({ term }) => Boolean(term));
    const uniqueTerms = [
      ...new Map(
        terms
          .sort((left, right) => right.provenance - left.provenance)
          .map((entry) => [entry.term, entry]),
      ).values(),
    ];
    return uniqueTerms.flatMap(({ term, provenance }) => {
      const match = bestTermMatch(queryTokens, term);
      return match ? [{ candidate, term, provenance, ...match }] : [];
    });
  });
  matches.sort(
    (left, right) =>
      Number(right.edits === 0) - Number(left.edits === 0) ||
      right.target.join(" ").length - left.target.join(" ").length ||
      left.provenance - right.provenance ||
      right.score - left.score ||
      left.edits - right.edits ||
      left.candidate.name.localeCompare(right.candidate.name),
  );
  const best = matches[0];
  if (!best) return null;
  const secondDifferentService = matches.find(
    (match) => match.candidate.id !== best.candidate.id,
  );
  const exact = best.edits === 0;
  const minimumConfidence = best.target.length > 1 ? 0.86 : 0.91;
  const margin = secondDifferentService
    ? best.score - secondDifferentService.score
    : 1;
  const ambiguousExact = Boolean(
    exact &&
      secondDifferentService?.edits === 0 &&
      secondDifferentService.score === best.score &&
      secondDifferentService.target.join(" ") === best.target.join(" ") &&
      secondDifferentService.provenance === best.provenance,
  );
  if (
    ambiguousExact ||
    (!exact && (best.score < minimumConfidence || margin < 0.045))
  )
    return null;

  const correctedTerms = best.source.flatMap((source, index) =>
    source === best.target[index]
      ? []
      : [{ from: source, to: best.target[index] }],
  );
  const resolvedTokens = [...queryTokens];
  resolvedTokens.splice(
    best.start,
    best.target.length,
    ...normalizeCatalogSearchText(best.candidate.name).split(" "),
  );
  return {
    serviceId: best.candidate.id,
    serviceName: best.candidate.name,
    originalQuery,
    resolvedQuery: resolvedTokens.join(" "),
    correctedTerms,
    confidence: Math.round(best.score * 1000) / 1000,
    exact,
  };
}
