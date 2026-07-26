"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CustomerLocation } from "@/lib/location";
import {
  createStoredCustomerLocation,
  DEFAULT_LOCATION_RETENTION_DAYS,
  DEFAULT_NEARBY_RADIUS_MILES,
  normalizeLocationRetentionDays,
  normalizeRadius,
  parseStoredCustomerLocation,
  validCustomerLocation,
  validCoordinates,
} from "@/lib/location";

type LocationContextValue = {
  location: CustomerLocation | null;
  ready: boolean;
  radiusMiles: number;
  retentionDays: number;
  permissionError: string;
  setLocation: (location: CustomerLocation) => void;
  clearLocation: () => void;
  useDeviceLocation: () => Promise<boolean>;
};

export const CUSTOMER_LOCATION_STORAGE_KEY =
  "girlz-culture-customer-location-v1";
const CustomerLocationContext = createContext<LocationContextValue | null>(null);

function storedLocationValue() {
  try {
    return (
      localStorage.getItem(CUSTOMER_LOCATION_STORAGE_KEY) ||
      sessionStorage.getItem(CUSTOMER_LOCATION_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

function readStoredLocation(retentionDays = DEFAULT_LOCATION_RETENTION_DAYS) {
  const stored = parseStoredCustomerLocation(storedLocationValue(), {
    legacyRetentionDays: retentionDays,
  });
  if (!stored) {
    removeStoredLocation();
    return null;
  }
  return stored;
}

function persistLocation(
  location: CustomerLocation,
  retentionDays = DEFAULT_LOCATION_RETENTION_DAYS,
) {
  const serialized = JSON.stringify(
    createStoredCustomerLocation(location, retentionDays),
  );
  try {
    localStorage.setItem(CUSTOMER_LOCATION_STORAGE_KEY, serialized);
    sessionStorage.setItem(CUSTOMER_LOCATION_STORAGE_KEY, serialized);
  } catch {
    // Storage can be unavailable in hardened browsers.
  }
}

function removeStoredLocation() {
  try {
    localStorage.removeItem(CUSTOMER_LOCATION_STORAGE_KEY);
    sessionStorage.removeItem(CUSTOMER_LOCATION_STORAGE_KEY);
  } catch {
    // Keep in-memory location usable without storage.
  }
}

function locationFromUrl() {
  const query = new URLSearchParams(window.location.search);
  const rawLatitude = query.get("lat");
  const rawLongitude = query.get("lng");
  if (!rawLatitude?.trim() || !rawLongitude?.trim()) return null;
  const location: CustomerLocation = {
    lat: Number(rawLatitude),
    lng: Number(rawLongitude),
    label: String(query.get("location") || "").trim(),
    source: "explicit",
  };
  return location.label && validCoordinates(location) ? location : null;
}

function devicePosition() {
  return new Promise<CustomerLocation>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "Current location",
          source: "device",
        }),
      reject,
      {
        enableHighAccuracy: false,
        timeout: 7_000,
        maximumAge: 10 * 60_000,
      },
    );
  });
}

export default function CustomerLocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<CustomerLocation | null>(null);
  const [ready, setReady] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(
    DEFAULT_NEARBY_RADIUS_MILES,
  );
  const [retentionDays, setRetentionDays] = useState(
    DEFAULT_LOCATION_RETENTION_DAYS,
  );
  const [permissionError, setPermissionError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadLocationConfig() {
      try {
        const configResponse = await fetch(
          "/api/config?keys=search.default_radius_miles,search.location_retention_days",
          { cache: "no-store", signal: controller.signal },
        );
        if (configResponse.ok) {
          const body = (await configResponse.json()) as {
            config?: Record<string, unknown>;
          };
          if (active) {
            setRadiusMiles(
              normalizeRadius(
                body.config?.["search.default_radius_miles"],
                DEFAULT_NEARBY_RADIUS_MILES,
              ),
            );
            setRetentionDays(
              normalizeLocationRetentionDays(
                body.config?.["search.location_retention_days"],
              ),
            );
          }
        }
      } catch {
        // Discovery retains the safe launch radius when config is unavailable.
      }
    }

    async function bootstrapLocation() {
      const explicit = locationFromUrl();
      if (explicit) {
        if (active) setLocationState(explicit);
        persistLocation(explicit, retentionDays);
        if (active) setReady(true);
        return;
      }

      const stored = readStoredLocation(retentionDays);
      if (stored) {
        if (active) {
          setLocationState(stored.location);
          setReady(true);
        }
        return;
      }

      if ("geolocation" in navigator && "permissions" in navigator) {
        try {
          const permission = await navigator.permissions.query({
            name: "geolocation",
          });
          if (permission.state === "granted") {
            const precise = await devicePosition();
            if (active) setLocationState(precise);
            persistLocation(precise, retentionDays);
            if (active) setReady(true);
            return;
          }
        } catch {
          // Permission APIs vary by browser. Approximate IP resolution is the
          // no-prompt fallback and does not request browser location access.
        }
      }

      try {
        const response = await fetch("/api/location/resolve", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          location?: CustomerLocation | null;
        };
        const approximate = body.location || null;
        if (response.ok && validCustomerLocation(approximate)) {
          if (active) setLocationState(approximate);
          persistLocation(approximate, retentionDays);
        }
      } catch {
        // A location is helpful, not required. Main search controls remain the
        // truthful fallback when the edge/provider cannot resolve a visitor.
      } finally {
        if (active) setReady(true);
      }
    }

    void loadLocationConfig();
    const timer = window.setTimeout(() => void bootstrapLocation(), 0);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMER_LOCATION_STORAGE_KEY) return;
      const next = readStoredLocation(retentionDays);
      if (active) setLocationState(next?.location || null);
    };
    const syncNavigationLocation = () => {
      const explicit = locationFromUrl();
      if (explicit) {
        setLocationState(explicit);
        persistLocation(explicit, retentionDays);
        return;
      }
      const stored = readStoredLocation(retentionDays);
      setLocationState(stored?.location || null);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("popstate", syncNavigationLocation);
    window.addEventListener("pageshow", syncNavigationLocation);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("popstate", syncNavigationLocation);
      window.removeEventListener("pageshow", syncNavigationLocation);
    };
  }, [retentionDays]);

  const setLocation = useCallback((next: CustomerLocation) => {
    if (!validCoordinates(next) || !next.label.trim()) return;
    const safe = { ...next, label: next.label.trim().slice(0, 160) };
    setLocationState(safe);
    setPermissionError("");
    persistLocation(safe, retentionDays);
  }, [retentionDays]);

  const clearLocation = useCallback(() => {
    setLocationState(null);
    setPermissionError("");
    removeStoredLocation();
  }, []);

  const useDeviceLocation = useCallback(async () => {
    setPermissionError("");
    if (!("geolocation" in navigator)) {
      setPermissionError(
        "Location is unavailable in this browser. Enter a city or ZIP instead.",
      );
      return false;
    }
    try {
      setLocation(await devicePosition());
      return true;
    } catch (error) {
      const positionError = error as GeolocationPositionError;
      const message =
        positionError.code === positionError.PERMISSION_DENIED
          ? "Location permission was denied. Enter a city or ZIP instead."
          : positionError.code === positionError.TIMEOUT
            ? "Location took too long. Enter a city or ZIP instead."
            : "We could not determine your location. Enter a city or ZIP instead.";
      setPermissionError(message);
      return false;
    }
  }, [setLocation]);

  const value = useMemo(
    () => ({
      location,
      ready,
      radiusMiles,
      retentionDays,
      permissionError,
      setLocation,
      clearLocation,
      useDeviceLocation,
    }),
    [
      clearLocation,
      location,
      permissionError,
      radiusMiles,
      retentionDays,
      ready,
      setLocation,
      useDeviceLocation,
    ],
  );
  return <CustomerLocationContext.Provider value={value}>{children}</CustomerLocationContext.Provider>;
}

export function useCustomerLocation() {
  const value = useContext(CustomerLocationContext);
  if (!value) throw new Error("useCustomerLocation must be used within CustomerLocationProvider.");
  return value;
}
