type NetlifyGeo = {
  city?: string;
  country?: { code?: string; name?: string };
  latitude?: number;
  longitude?: number;
  subdivision?: { code?: string; name?: string };
  postalCode?: string;
};

type NetlifyEdgeContext = {
  geo?: NetlifyGeo;
};

export default function approximateLocation(
  request: Request,
  context: NetlifyEdgeContext,
) {
  if (request.method !== "GET") return;
  const geo = context.geo;
  const latitude = Number(geo?.latitude);
  const longitude = Number(geo?.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return;
  }
  const label = [geo?.city, geo?.subdivision?.code || geo?.subdivision?.name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");
  if (!label) return;
  return Response.json(
    {
      location: {
        lat: latitude,
        lng: longitude,
        label,
        source: "approximate",
      },
      precision: "city",
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}

export const config = { path: "/api/location/resolve" };
