export type DiscoverySort =
  | "distance"
  | "rating"
  | "price_low"
  | "price_high";

/**
 * Normalize optional numeric search controls without turning an absent value
 * into zero. `Number(null)` is zero, which previously converted "Any price"
 * into a hidden $0 maximum-price filter.
 */
export function boundedSearchNumber(
  value: unknown,
  fallback: number | null,
  minimum: number,
  maximum: number,
) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, parsed))
    : fallback;
}

/** Default discovery is a complete 50-mile search unless the customer narrows it. */
export function decisionSearchRadius(
  explicitRadius: unknown,
  queryRadius: unknown,
) {
  return (
    boundedSearchNumber(explicitRadius, null, 1, 100) ??
    boundedSearchNumber(queryRadius, 50, 1, 100) ??
    50
  );
}

/** Shortest angular longitude separation across the +/-180-degree seam. */
export function wrappedLongitudeDelta(left: number, right: number) {
  const direct = Math.abs(Number(left) - Number(right));
  return Math.min(direct, 360 - direct);
}

/**
 * A stable master-style selection is an identity lookup, never a fuzzy-name
 * lookup or a request for the salon's cheapest unrelated service.
 */
export function stableMasterStyleMatch<
  T extends { master_style_id: string | null },
>(rows: T[], stableServiceId: string | null | undefined): T | null {
  const id = String(stableServiceId || "").trim();
  if (!id) return null;
  return rows.find((row) => row.master_style_id === id) || null;
}

/**
 * Defensively remove duplicate database rows while preserving the complete
 * result set. Organic distance mode is canonical nearest-first; paid tier
 * placement is handled by separately labelled promotion surfaces.
 */
export function canonicalDiscoveryResults<
  T extends { id: string; distance_miles: number },
>(rows: T[], sort: DiscoverySort) {
  const seen = new Set<string>();
  const unique = rows.filter((row) => {
    if (!row.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  if (sort === "distance") {
    unique.sort(
      (left, right) =>
        Number(left.distance_miles) - Number(right.distance_miles) ||
        left.id.localeCompare(right.id),
    );
  }
  return unique;
}
