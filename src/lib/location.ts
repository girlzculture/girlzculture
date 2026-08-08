export type Coordinates = { lat: number; lng: number };
export type CustomerLocation = Coordinates & {
  label: string;
  source: "explicit" | "device" | "saved" | "approximate";
  placeId?: string;
};

export const EARTH_RADIUS_MILES = 3958.7613;
export const DEFAULT_NEARBY_RADIUS_MILES = 50;
export const MAX_DISCOVERY_RADIUS_MILES = 100;
export const DEFAULT_LOCATION_RETENTION_DAYS = 30;
export const MAX_LOCATION_RETENTION_DAYS = 365;

export type StoredCustomerLocation = {
  location: CustomerLocation;
  savedAt: number;
  expiresAt: number;
  version: 2;
};

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

/**
 * One customer-facing distance formatter for homepage cards, discovery,
 * profiles and grounded concierge results. The database remains authoritative
 * for discovery distance_miles; this only controls truthful presentation.
 */
export function formatDistanceMiles(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Distance unavailable";
  }
  const miles = Number(value);
  if (!Number.isFinite(miles) || miles < 0) return "Distance unavailable";
  if (miles < 0.1) return "Under 0.1 mile away";
  const rounded = Math.round(miles * 10) / 10;
  const amount = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1);
  return `${amount} ${rounded === 1 ? "mile" : "miles"} away`;
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
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(MAX_DISCOVERY_RADIUS_MILES, Math.max(1, parsed)) : fallback;
}

export function normalizeLocationRetentionDays(
  value: unknown,
  fallback = DEFAULT_LOCATION_RETENTION_DAYS,
) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(MAX_LOCATION_RETENTION_DAYS, Math.max(1, Math.round(parsed)))
    : fallback;
}

export function validCustomerLocation(
  value: CustomerLocation | null | undefined,
): value is CustomerLocation {
  return Boolean(
    value &&
      validCoordinates(value) &&
      value.label?.trim() &&
      ["explicit", "device", "saved", "approximate"].includes(value.source),
  );
}

export function createStoredCustomerLocation(
  location: CustomerLocation,
  retentionDays = DEFAULT_LOCATION_RETENTION_DAYS,
  now = Date.now(),
): StoredCustomerLocation {
  const safeDays = normalizeLocationRetentionDays(retentionDays);
  return {
    location,
    savedAt: now,
    expiresAt: now + safeDays * 24 * 60 * 60 * 1_000,
    version: 2,
  };
}

export function parseStoredCustomerLocation(
  serialized: string | null,
  options: {
    now?: number;
    legacyRetentionDays?: number;
  } = {},
): StoredCustomerLocation | null {
  if (!serialized) return null;
  const now = options.now ?? Date.now();
  try {
    const parsed = JSON.parse(serialized) as
      | StoredCustomerLocation
      | CustomerLocation
      | null;
    if (!parsed) return null;

    if ("location" in parsed) {
      if (
        parsed.version !== 2 ||
        !validCustomerLocation(parsed.location) ||
        !Number.isFinite(parsed.savedAt) ||
        !Number.isFinite(parsed.expiresAt) ||
        parsed.expiresAt <= now
      ) {
        return null;
      }
      return parsed;
    }

    if (!validCustomerLocation(parsed)) return null;
    return createStoredCustomerLocation(
      parsed,
      options.legacyRetentionDays,
      now,
    );
  } catch {
    return null;
  }
}
