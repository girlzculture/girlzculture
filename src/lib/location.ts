export type Coordinates = { lat: number; lng: number };
export type CustomerLocation = Coordinates & {
  label: string;
  source: "explicit" | "device" | "saved";
  placeId?: string;
};

export const EARTH_RADIUS_MILES = 3958.7613;
export const DEFAULT_NEARBY_RADIUS_MILES = 25;
export const MAX_DISCOVERY_RADIUS_MILES = 100;

export function validCoordinates(value: Partial<Coordinates> | null | undefined): value is Coordinates {
  return Boolean(value)
    && Number.isFinite(value?.lat)
    && Number.isFinite(value?.lng)
    && Number(value?.lat) >= -90 && Number(value?.lat) <= 90
    && Number(value?.lng) >= -180 && Number(value?.lng) <= 180;
}

export function distanceMiles(a: Coordinates, b: Coordinates) {
  if (!validCoordinates(a) || !validCoordinates(b)) return Number.POSITIVE_INFINITY;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.lat - a.lat);
  const longitudeDelta = radians(b.lng - a.lng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function boundingBox(origin: Coordinates, radiusMiles: number) {
  const safeRadius = Math.min(MAX_DISCOVERY_RADIUS_MILES, Math.max(1, radiusMiles));
  const latitudeDelta = safeRadius / 69.0;
  const cosine = Math.max(0.01, Math.cos(origin.lat * Math.PI / 180));
  const longitudeDelta = safeRadius / (69.172 * cosine);
  return {
    minLatitude: origin.lat - latitudeDelta,
    maxLatitude: origin.lat + latitudeDelta,
    minLongitude: origin.lng - longitudeDelta,
    maxLongitude: origin.lng + longitudeDelta,
  };
}

export function normalizeRadius(value: unknown, fallback = DEFAULT_NEARBY_RADIUS_MILES) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_DISCOVERY_RADIUS_MILES, Math.max(1, parsed)) : fallback;
}
