import "server-only";
import { supabase } from "@/lib/supabase";
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
  minimumRating?: number | null;
  minimumPrice?: number | null;
  maximumPrice?: number | null;
  sort?: "distance" | "rating" | "price_low" | "price_high";
  limit?: number;
  offset?: number;
};

export async function discoverNearbySalons(query: DiscoveryQuery) {
  if (!validCoordinates(query.origin)) return { salons: [] as PublicSalonResult[], total: 0 };
  const limit = Math.max(1, Math.min(50, Math.round(query.limit || 20)));
  const offset = Math.max(0, Math.round(query.offset || 0));
  let resolvedStyle = query.style?.trim() || null;
  if (resolvedStyle) {
    const resolution = await supabase.rpc("resolve_search_service_query", { p_query: resolvedStyle });
    if (!resolution.error && resolution.data) resolvedStyle = String(resolution.data);
  }
  const { data, error } = await supabase.rpc("discover_nearby_salons", {
    origin_latitude: query.origin.lat,
    origin_longitude: query.origin.lng,
    radius_miles: normalizeRadius(query.radius),
    style_query: resolvedStyle,
    minimum_rating: query.minimumRating ?? null,
    minimum_price: query.minimumPrice ?? null,
    maximum_price: query.maximumPrice ?? null,
    sort_mode: query.sort || "distance",
    result_limit: limit,
    result_offset: offset,
  });
  if (error) throw error;
  const salons = (Array.isArray(data) ? data : []) as PublicSalonResult[];
  return { salons, total: Number(salons[0]?.total_count || 0) };
}
