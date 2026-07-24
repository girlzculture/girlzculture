import type { CustomerLocation } from "@/lib/location";

function validCoordinates(value: { lat: number; lng: number }) {
  return (
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    Number.isFinite(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

function cleanLabelPart(value: unknown) {
  return String(value || "")
    .replace(/[^\p{L}\p{N} .'-]/gu, "")
    .trim()
    .slice(0, 80);
}

export function approximateLocationFromHeaders(
  headers: Headers,
): CustomerLocation | null {
  const candidates = [
    {
      lat: headers.get("x-vercel-ip-latitude"),
      lng: headers.get("x-vercel-ip-longitude"),
      city: headers.get("x-vercel-ip-city"),
      region: headers.get("x-vercel-ip-country-region"),
    },
    {
      lat: headers.get("cf-iplatitude"),
      lng: headers.get("cf-iplongitude"),
      city: headers.get("cf-ipcity"),
      region: headers.get("cf-region-code"),
    },
    {
      lat: headers.get("x-girlz-geo-latitude"),
      lng: headers.get("x-girlz-geo-longitude"),
      city: headers.get("x-girlz-geo-city"),
      region: headers.get("x-girlz-geo-region"),
    },
  ];
  for (const candidate of candidates) {
    const coordinates = {
      lat: Number(candidate.lat),
      lng: Number(candidate.lng),
    };
    const label = [candidate.city, candidate.region]
      .map(cleanLabelPart)
      .filter(Boolean)
      .join(", ");
    if (
      candidate.lat &&
      candidate.lng &&
      label &&
      validCoordinates(coordinates)
    ) {
      return { ...coordinates, label, source: "approximate" };
    }
  }
  return null;
}

export function approximateLocationFromProviderPayload(
  payload: Record<string, unknown>,
): CustomerLocation | null {
  const coordinates = {
    lat: Number(payload.latitude ?? payload.lat),
    lng: Number(payload.longitude ?? payload.lon ?? payload.lng),
  };
  const label = [
    payload.city,
    payload.region_code ?? payload.region ?? payload.state_code,
  ]
    .map(cleanLabelPart)
    .filter(Boolean)
    .join(", ");
  return label && validCoordinates(coordinates)
    ? { ...coordinates, label, source: "approximate" }
    : null;
}
