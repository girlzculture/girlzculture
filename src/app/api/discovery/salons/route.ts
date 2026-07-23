import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { discoverNearbySalons } from "@/lib/discoveryServer";
import { MAX_DISCOVERY_RADIUS_MILES, validCoordinates } from "@/lib/location";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";

const SORTS = new Set(["distance", "rating", "price_low", "price_high"]);

function optionalNumber(value: string | null, label: string) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number, label: string) {
  const parsed = value === null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "public-discovery", 120, 60_000);
    const search = new URL(request.url).searchParams;
    const latitude = search.get("lat");
    const longitude = search.get("lng");
    const origin = {
      lat: latitude === null || latitude === "" ? Number.NaN : Number(latitude),
      lng: longitude === null || longitude === "" ? Number.NaN : Number(longitude),
    };
    if (!validCoordinates(origin)) return Response.json({ error: "Choose a valid location before searching nearby." }, { status: 400 });
    const radius = Number(search.get("radius") || 25);
    if (!Number.isFinite(radius) || radius < 1 || radius > MAX_DISCOVERY_RADIUS_MILES) return Response.json({ error: `Distance must be between 1 and ${MAX_DISCOVERY_RADIUS_MILES} miles.` }, { status: 400 });
    const sort = cleanText(search.get("sort"), 20) || "distance";
    if (!SORTS.has(sort)) return Response.json({ error: "Choose a valid sort order." }, { status: 400 });
    const minimumRating = optionalNumber(search.get("rating"), "Rating");
    if (minimumRating !== null && (minimumRating < 0 || minimumRating > 5)) return Response.json({ error: "Rating must be between 0 and 5." }, { status: 400 });
    const minimumPrice = optionalNumber(search.get("min_price"), "Minimum price");
    const maximumPrice = optionalNumber(search.get("max_price"), "Maximum price");
    if (minimumPrice !== null && minimumPrice < 0 || maximumPrice !== null && maximumPrice < 0) {
      return Response.json({ error: "Prices cannot be negative." }, { status: 400 });
    }
    if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) {
      return Response.json({ error: "Minimum price cannot be higher than maximum price." }, { status: 400 });
    }
    const result = await discoverNearbySalons({
      origin,
      radius,
      style: cleanText(search.get("style"), 100),
      minimumRating,
      minimumPrice,
      maximumPrice,
      sort: sort as "distance" | "rating" | "price_low" | "price_high",
      limit: boundedInteger(search.get("limit"), 20, 1, 50, "Page size"),
      offset: boundedInteger(search.get("offset"), 0, 0, 10_000, "Page offset"),
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch (error) {
    noteOperationalFailure("Public salon discovery failed", error);
    const message = error instanceof Error && /must|cannot|between|negative/i.test(error.message)
      ? error.message
      : "Nearby salons could not be loaded. Please try again.";
    return Response.json({ error: message }, { status: message.includes("could not") ? 500 : 400 });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/discovery/salons", "GET"), GETHandler);
