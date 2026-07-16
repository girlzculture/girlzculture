import { cleanText, errorResponse } from "@/lib/requestSecurity";
import { normalizeRadius, validCoordinates } from "@/lib/location";
import { supabase } from "@/lib/supabase";
import type { PublicSalonResult } from "@/lib/discoveryServer";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const origin = { lat: Number(search.get("lat")), lng: Number(search.get("lng")) };
    if (!validCoordinates(origin)) throw new Error("Choose a valid location to see featured salons.");
    const limit = Math.max(1, Math.min(50, Math.round(Number(search.get("limit") || 12))));
    const offset = Math.max(0, Math.round(Number(search.get("offset") || 0)));
    const seed = cleanText(search.get("seed"), 100) || new Date().toISOString().slice(0, 13);
    const [{ data, error }, { data: settings }] = await Promise.all([
      supabase.rpc("discover_featured_salons", { origin_latitude: origin.lat, origin_longitude: origin.lng, request_radius_miles: normalizeRadius(search.get("radius")), rotation_seed: seed, result_limit: limit, result_offset: offset }),
      supabase.from("homepage_sections").select("empty_title,empty_body,empty_href").eq("section_key", "featured_salons").maybeSingle(),
    ]);
    if (error) throw error;
    const salons = (Array.isArray(data) ? data : []) as PublicSalonResult[];
    return Response.json({ salons, total: Number(salons[0]?.total_count || 0), promo: { title: settings?.empty_title || "Own a business? Get featured here.", body: settings?.empty_body || "Put your salon in front of nearby clients with a featured placement.", href: settings?.empty_href || "/partner" } }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Featured discovery failed", error);
    return errorResponse(error, "Featured salons could not be loaded.");
  }
}
