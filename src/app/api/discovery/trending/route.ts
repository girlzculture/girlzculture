import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, publicErrorResponse } from "@/lib/requestSecurity";
import { MAX_DISCOVERY_RADIUS_MILES, validCoordinates } from "@/lib/location";
import { supabase } from "@/lib/supabase";

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "trending-discovery", 120, 60_000);
    const search = new URL(request.url).searchParams;
    const latitude = search.get("lat");
    const longitude = search.get("lng");
    const origin = {
      lat: latitude === null || latitude === "" ? Number.NaN : Number(latitude),
      lng: longitude === null || longitude === "" ? Number.NaN : Number(longitude),
    };
    if (!validCoordinates(origin)) {
      return Response.json({ error: "Choose a valid location to see Trending Picks." }, { status: 400 });
    }

    const radius = Number(search.get("radius") || 25);
    const limit = Number(search.get("limit") || 12);
    const offset = Number(search.get("offset") || 0);
    if (!Number.isFinite(radius) || radius < 1 || radius > MAX_DISCOVERY_RADIUS_MILES) {
      return Response.json({ error: `Distance must be between 1 and ${MAX_DISCOVERY_RADIUS_MILES} miles.` }, { status: 400 });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return Response.json({ error: "Page size must be between 1 and 50." }, { status: 400 });
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
      return Response.json({ error: "Page offset must be between 0 and 10000." }, { status: 400 });
    }

    const seed = cleanText(search.get("seed"), 100) || new Date().toISOString().slice(0, 13);
    const { data, error } = await supabase.rpc("discover_trending_videos", {
      origin_latitude: origin.lat,
      origin_longitude: origin.lng,
      request_radius_miles: radius,
      rotation_seed: seed,
      result_limit: limit,
      result_offset: offset,
    });
    if (error) throw error;
    const videos = Array.isArray(data) ? data : [];
    return Response.json(
      { videos, total: Number(videos[0]?.total_count || 0) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch (error) {
    noteOperationalFailure("Trending discovery failed", error);
    return publicErrorResponse(error, "Trending Picks could not be loaded.");
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/discovery/trending", "GET"), GETHandler);
