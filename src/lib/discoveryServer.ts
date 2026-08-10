import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canonicalDiscoveryResults,
  type DiscoverySort,
} from "@/lib/discoverySearchCore";
import { normalizeRadius, validCoordinates, type Coordinates } from "@/lib/location";

export type PublicSalonResult = {
  id: string;
  name: string;
  slug: string;
  address_city: string | null;
  address_state: string | null;
  borough: string | null;
  cover_photo_url: string | null;
  verification_status: string | null;
  rating_overall: number;
  review_count: number;
  latitude: number;
  longitude: number;
  starting_price: number | null;
  services: Array<{ id: string; name: string }>;
  distance_miles: number;
  total_count: number;
};

export type DiscoveryQuery = {
  origin: Coordinates;
  radius?: number;
  style?: string;
  /** Stable platform master-style identity. When present, SQL matches it exactly. */
  masterStyleId?: string | null;
  minimumRating?: number | null;
  minimumPrice?: number | null;
  maximumPrice?: number | null;
  sort?: DiscoverySort;
  /** `"all"` invokes the database's explicit no-cap server contract. */
  limit?: number | "all";
  offset?: number;
};

export async function discoverNearbySalons(query: DiscoveryQuery) {
  if (!validCoordinates(query.origin)) return { salons: [] as PublicSalonResult[], total: 0 };
  const allResults = query.limit === "all";
  const requestedLimit = typeof query.limit === "number" ? query.limit : 20;
  const limit = allResults
    ? 0
    : Math.max(1, Math.min(50, Math.round(requestedLimit || 20)));
  const offset = Math.max(0, Math.round(query.offset || 0));
  const supabase = getSupabaseAdmin();
  let resolvedStyle = query.style?.trim() || null;
  if (resolvedStyle) {
    const resolution = await supabase.rpc("resolve_search_service_query", { p_query: resolvedStyle });
    if (resolution.error) throw resolution.error;
    if (resolution.data) resolvedStyle = String(resolution.data);
  }
  const { data, error } = await supabase.rpc("discover_nearby_salons_ranked", {
    origin_latitude: query.origin.lat,
    origin_longitude: query.origin.lng,
    radius_miles: normalizeRadius(query.radius),
    style_query: resolvedStyle,
    master_style_filter: query.masterStyleId || null,
    minimum_rating: query.minimumRating ?? null,
    minimum_price: query.minimumPrice ?? null,
    maximum_price: query.maximumPrice ?? null,
    sort_mode: query.sort || "distance",
    result_limit: limit,
    result_offset: offset,
  });
  if (error) throw error;
  const salons = canonicalDiscoveryResults(
    (Array.isArray(data) ? data : []) as PublicSalonResult[],
    query.sort || "distance",
  );
  return { salons, total: Number(salons[0]?.total_count || 0) };
}
