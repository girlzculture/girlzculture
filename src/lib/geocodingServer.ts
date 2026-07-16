import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { distanceMiles, validCoordinates } from "@/lib/location";

type SalonAddress = {
  id: string;
  address_street?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
  address_fingerprint?: string | null;
  geocode_status?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type GoogleAddressComponent = { long_name: string; short_name: string; types: string[] };
type GoogleResult = {
  formatted_address: string;
  partial_match?: boolean;
  types: string[];
  address_components: GoogleAddressComponent[];
  geometry: { location: { lat: number; lng: number }; location_type: string };
};

function addressText(salon: SalonAddress) {
  return [salon.address_street, salon.address_line2, salon.address_city, salon.address_state, salon.address_zip, "US"]
    .map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

function fingerprint(salon: SalonAddress) {
  return createHash("md5").update([
    salon.address_street, salon.address_line2, salon.address_city,
    salon.address_state, salon.address_zip, salon.address_country || "US",
  ].map((part) => String(part || "").trim().replace(/\s+/g, " ").toLowerCase()).join("|")).digest("hex");
}

function component(result: GoogleResult, type: string, short = false) {
  const item = result.address_components.find((entry) => entry.types.includes(type));
  return item ? (short ? item.short_name : item.long_name) : "";
}

function boroughFor(result: GoogleResult) {
  const direct = component(result, "sublocality_level_1") || component(result, "sublocality");
  if (["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"].includes(direct)) return direct;
  const county = component(result, "administrative_area_level_2");
  return ({ "New York County": "Manhattan", "Kings County": "Brooklyn", "Queens County": "Queens", "Bronx County": "Bronx", "Richmond County": "Staten Island" } as Record<string, string>)[county] || null;
}

function confidenceFailure(results: GoogleResult[]) {
  if (results.length !== 1) return results.length ? "Address returned multiple possible locations." : "Address was not found.";
  const result = results[0];
  if (result.partial_match) return "Address matched only partially.";
  if (!["ROOFTOP", "RANGE_INTERPOLATED"].includes(result.geometry.location_type)) return "Address did not resolve to a precise street location.";
  if (component(result, "country", true) !== "US") return "Address is outside the supported United States launch area.";
  if (!component(result, "street_number") || !component(result, "route")) return "A complete street address is required.";
  return null;
}

export async function geocodeSalonAddress(salonId: string, options: { force?: boolean } = {}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("salons").select("id,address_street,address_line2,address_city,address_state,address_zip,address_country,address_fingerprint,geocode_status,latitude,longitude").eq("id", salonId).single();
  if (error || !data) throw error || new Error("Salon not found.");
  const salon = data as SalonAddress;
  const currentFingerprint = fingerprint(salon);
  if (!options.force && salon.geocode_status === "success" && salon.address_fingerprint === currentFingerprint && validCoordinates({ lat: Number(salon.latitude), lng: Number(salon.longitude) })) {
    return { status: "success" as const, skipped: true };
  }

  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) throw new Error("Server geocoding is not configured.");
  const query = addressText(salon);
  if (!salon.address_street || !salon.address_city || !salon.address_state || !salon.address_zip) {
    await admin.from("salons").update({ geocode_status: "needs_review", address_needs_review: true, geocode_failure_reason: "Structured address is incomplete.", latitude: null, longitude: null, geocoded_at: null }).eq("id", salonId);
    return { status: "needs_review" as const, reason: "Complete every required address field." };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Geocoding provider is temporarily unavailable.");
  const body = await response.json() as { status: string; results?: GoogleResult[]; error_message?: string };
  if (!["OK", "ZERO_RESULTS"].includes(body.status)) {
    console.error("Google geocoding provider error", { salonId, status: body.status });
    throw new Error("Geocoding provider could not process the request.");
  }
  const results = body.results || [];
  const failure = confidenceFailure(results);
  if (failure) {
    await admin.from("salons").update({ geocode_status: "needs_review", address_needs_review: true, geocode_failure_reason: failure, latitude: null, longitude: null, formatted_address: null, geocoded_at: new Date().toISOString(), address_fingerprint: currentFingerprint, market_id: null, borough: null }).eq("id", salonId);
    return { status: "needs_review" as const, reason: "Review the street address and try again." };
  }

  const result = results[0];
  const coordinates = { lat: result.geometry.location.lat, lng: result.geometry.location.lng };
  if (!validCoordinates(coordinates)) throw new Error("Geocoding provider returned invalid coordinates.");
  const state = component(result, "administrative_area_level_1", true);
  const city = component(result, "locality") || component(result, "postal_town") || String(salon.address_city || "");
  const borough = boroughFor(result);
  const { data: markets } = await admin.from("location_markets").select("id,name,slug,center_latitude,center_longitude").eq("state_code", state).eq("is_active", true);
  const preferred = (markets || []).find((market) => market.name === borough)
    || (markets || []).find((market) => market.name.toLowerCase() === city.toLowerCase())
    || [...(markets || [])].sort((a, b) => distanceMiles(coordinates, { lat: Number(a.center_latitude), lng: Number(a.center_longitude) }) - distanceMiles(coordinates, { lat: Number(b.center_latitude), lng: Number(b.center_longitude) }))[0];
  const nearestDistance = preferred ? distanceMiles(coordinates, { lat: Number(preferred.center_latitude), lng: Number(preferred.center_longitude) }) : Number.POSITIVE_INFINITY;
  const marketId = nearestDistance <= 75 ? preferred?.id || null : null;

  const { error: updateError } = await admin.from("salons").update({
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    formatted_address: result.formatted_address,
    address_fingerprint: currentFingerprint,
    geocode_status: "success",
    geocode_failure_reason: null,
    address_needs_review: false,
    geocoded_at: new Date().toISOString(),
    market_id: marketId,
    borough,
  }).eq("id", salonId);
  if (updateError) throw updateError;
  return { status: "success" as const, coordinates, formattedAddress: result.formatted_address, borough, marketId };
}
