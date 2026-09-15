import "server-only";
import { validCoordinates } from "@/lib/location";

/** Read-only neighborhood resolution using the existing configured maps service.
 * Never substitutes a random business address or an unrelated saved location. */
export async function resolveSearchPlace(query: string) {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key || !query.trim() || query.length > 100) return null;
  const address = /^(?:east |west |central )?harlem(?:,? (?:ny|new york))?$/i.test(query.trim()) ? `${query}, Manhattan, New York, NY` : query;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", key);
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!response.ok) throw new Error("SEARCH_LOCATION_PROVIDER_UNAVAILABLE");
  const body = await response.json();
  if (body.status === "ZERO_RESULTS") return null;
  if (body.status !== "OK") throw new Error("SEARCH_LOCATION_PROVIDER_UNAVAILABLE");
  if (!Array.isArray(body.results) || body.results.length !== 1) return null;
  const result = body.results[0];
  if (result.partial_match || !result.address_components?.some((part: { types: string[]; short_name: string }) => part.types.includes("country") && part.short_name === "US")) return null;
  if (!validCoordinates(result.geometry?.location)) return null;
  return { origin: { lat: result.geometry.location.lat, lng: result.geometry.location.lng }, label: String(result.formatted_address).slice(0, 200) };
}
