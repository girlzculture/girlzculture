import { discoverNearbySalons } from "@/lib/discoveryServer";
import { MAX_DISCOVERY_RADIUS_MILES, validCoordinates } from "@/lib/location";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";

const SORTS = new Set(["distance", "rating", "price_low", "price_high"]);

function optionalNumber(value: string | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    enforceRateLimit(request, "public-discovery", 120, 60_000);
    const search = new URL(request.url).searchParams;
    const origin = { lat: Number(search.get("lat")), lng: Number(search.get("lng")) };
    if (!validCoordinates(origin)) return Response.json({ error: "Choose a valid location before searching nearby." }, { status: 400 });
    const radius = Number(search.get("radius") || 25);
    if (!Number.isFinite(radius) || radius < 1 || radius > MAX_DISCOVERY_RADIUS_MILES) return Response.json({ error: `Distance must be between 1 and ${MAX_DISCOVERY_RADIUS_MILES} miles.` }, { status: 400 });
    const sort = cleanText(search.get("sort"), 20) || "distance";
    if (!SORTS.has(sort)) return Response.json({ error: "Choose a valid sort order." }, { status: 400 });
    const minimumRating = optionalNumber(search.get("rating"));
    if (minimumRating !== null && (minimumRating < 0 || minimumRating > 5)) return Response.json({ error: "Rating must be between 0 and 5." }, { status: 400 });
    const result = await discoverNearbySalons({
      origin,
      radius,
      style: cleanText(search.get("style"), 100),
      minimumRating,
      minimumPrice: optionalNumber(search.get("min_price")),
      maximumPrice: optionalNumber(search.get("max_price")),
      sort: sort as "distance" | "rating" | "price_low" | "price_high",
      limit: Number(search.get("limit") || 20),
      offset: Number(search.get("offset") || 0),
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (error) {
    console.error("Public salon discovery failed", error);
    return Response.json({ error: "Nearby salons could not be loaded. Please try again." }, { status: 500 });
  }
}
