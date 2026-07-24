import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  approximateLocationFromHeaders,
  approximateLocationFromProviderPayload,
} from "@/lib/approximateLocationCore";
import { enforceRateLimit } from "@/lib/requestSecurity";

function requestIp(headers: Headers) {
  const value =
    headers.get("x-nf-client-connection-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0] ||
    "";
  const candidate = value.trim();
  return /^[0-9a-f:.]{3,64}$/i.test(candidate) ? candidate : "";
}

async function GETHandler(request: Request) {
  enforceRateLimit(request, "approximate-location", 60, 60_000);
  const headerLocation = approximateLocationFromHeaders(request.headers);
  if (headerLocation) {
    return Response.json(
      { location: headerLocation, precision: "city" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const endpointTemplate = process.env.IP_GEOLOCATION_PROVIDER_URL?.trim();
  const ip = requestIp(request.headers);
  if (!endpointTemplate || !ip) {
    return Response.json(
      { location: null, available: false },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);
  try {
    const endpoint = endpointTemplate.includes("{ip}")
      ? endpointTemplate.replace("{ip}", encodeURIComponent(ip))
      : `${endpointTemplate}${endpointTemplate.includes("?") ? "&" : "?"}ip=${encodeURIComponent(ip)}`;
    const providerResponse = await fetch(endpoint, {
      headers: process.env.IP_GEOLOCATION_API_KEY
        ? {
            Authorization: `Bearer ${process.env.IP_GEOLOCATION_API_KEY}`,
            Accept: "application/json",
          }
        : { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!providerResponse.ok) {
      throw new Error(`IP geolocation provider returned HTTP ${providerResponse.status}.`);
    }
    const payload = (await providerResponse.json()) as Record<string, unknown>;
    const location = approximateLocationFromProviderPayload(payload);
    return Response.json(
      { location, available: Boolean(location), precision: "city" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    noteOperationalFailure("Approximate IP location lookup failed", error);
    return Response.json(
      {
        location: null,
        error:
          "Approximate location is temporarily unavailable. Enter a city or ZIP in search.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/location/resolve", "GET"),
  GETHandler,
);
