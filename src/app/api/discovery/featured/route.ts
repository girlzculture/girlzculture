import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, publicErrorResponse } from "@/lib/requestSecurity";
import { MAX_DISCOVERY_RADIUS_MILES, validCoordinates } from "@/lib/location";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PublicSalonResult } from "@/lib/discoveryServer";

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "featured-discovery", 120, 60_000);
    const search = new URL(request.url).searchParams;
    const latitude = search.get("lat");
    const longitude = search.get("lng");
    const origin = {
      lat: latitude === null || latitude === "" ? Number.NaN : Number(latitude),
      lng: longitude === null || longitude === "" ? Number.NaN : Number(longitude),
    };
    if (!validCoordinates(origin)) return Response.json({ error: "Choose a valid location to see featured salons." }, { status: 400 });
    const requestedRadius = search.get("radius");
    const radius = requestedRadius
      ? Number(requestedRadius)
      : await getEngineNumber(
          "search.default_radius_miles",
          50,
          1,
          MAX_DISCOVERY_RADIUS_MILES,
        );
    const limit = Number(search.get("limit") || 12);
    const offset = Number(search.get("offset") || 0);
    if (!Number.isFinite(radius) || radius < 1 || radius > MAX_DISCOVERY_RADIUS_MILES) return Response.json({ error: `Distance must be between 1 and ${MAX_DISCOVERY_RADIUS_MILES} miles.` }, { status: 400 });
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return Response.json({ error: "Page size must be between 1 and 50." }, { status: 400 });
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) return Response.json({ error: "Page offset must be between 0 and 10000." }, { status: 400 });
    const seed = cleanText(search.get("seed"), 100) || new Date().toISOString().slice(0, 13);
    const supabase = getSupabaseAdmin();
    const [{ data, error }, { data: settings }] = await Promise.all([
      supabase.rpc("discover_featured_salons", { origin_latitude: origin.lat, origin_longitude: origin.lng, request_radius_miles: radius, rotation_seed: seed, result_limit: limit, result_offset: offset }),
      supabase.from("homepage_sections").select("empty_title,empty_body,empty_href").eq("section_key", "featured_salons").maybeSingle(),
    ]);
    if (error) throw error;
    // The monitored service-role transport records this optional settings
    // failure; the successful response will carry its warning reference.
    const salons = (Array.isArray(data) ? data : []) as PublicSalonResult[];
    return Response.json({ salons, total: Number(salons[0]?.total_count || 0), promo: { title: settings?.empty_title || "Own a business? Get featured here.", body: settings?.empty_body || "Put your salon in front of nearby clients with a featured placement.", href: settings?.empty_href || "/partner" } }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    noteOperationalFailure("Featured discovery failed", error);
    return publicErrorResponse(error, "Featured salons could not be loaded.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/discovery/featured", "GET"), GETHandler);
