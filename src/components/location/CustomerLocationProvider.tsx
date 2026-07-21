"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CustomerLocation } from "@/lib/location";
import { validCoordinates } from "@/lib/location";

type LocationContextValue = {
  location: CustomerLocation | null;
  ready: boolean;
  permissionError: string;
  setLocation: (location: CustomerLocation) => void;
  clearLocation: () => void;
  useDeviceLocation: () => Promise<void>;
};

const STORAGE_KEY = "girlz-culture-customer-location-v1";
const CustomerLocationContext = createContext<LocationContextValue | null>(null);

function readStoredLocation() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as CustomerLocation | null;
  } catch {
    return null;
  }
}

function persistLocation(location: CustomerLocation) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(location)); } catch { /* Storage can be unavailable in hardened browsers. */ }
}

function removeStoredLocation() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Keep in-memory location usable without storage. */ }
}

export default function CustomerLocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<CustomerLocation | null>(null);
  const [ready, setReady] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  useEffect(() => {
    function restoreLocation() {
      const query = new URLSearchParams(window.location.search);
      const rawLatitude = query.get("lat");
      const rawLongitude = query.get("lng");
      const fromUrl: CustomerLocation | null = rawLatitude?.trim() && rawLongitude?.trim()
        ? { lat: Number(rawLatitude), lng: Number(rawLongitude), label: String(query.get("location") || "").trim(), source: "explicit" }
        : null;
      if (fromUrl?.label && validCoordinates(fromUrl)) {
        setLocationState(fromUrl);
        persistLocation(fromUrl);
        setReady(true);
        return;
      }
      const parsed = readStoredLocation();
      setLocationState(parsed && validCoordinates(parsed) && parsed.label && ["explicit", "device", "saved"].includes(parsed.source) ? parsed : null);
      setReady(true);
    }
    const timer = window.setTimeout(restoreLocation, 0);
    window.addEventListener("popstate", restoreLocation);
    window.addEventListener("pageshow", restoreLocation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", restoreLocation);
      window.removeEventListener("pageshow", restoreLocation);
    };
  }, []);

  const setLocation = useCallback((next: CustomerLocation) => {
    if (!validCoordinates(next) || !next.label.trim()) return;
    const safe = { ...next, label: next.label.trim().slice(0, 160) };
    setLocationState(safe);
    setPermissionError("");
    persistLocation(safe);
  }, []);

  const clearLocation = useCallback(() => {
    setLocationState(null);
    setPermissionError("");
    removeStoredLocation();
  }, []);

  const useDeviceLocation = useCallback(async () => {
    setPermissionError("");
    if (!("geolocation" in navigator)) { setPermissionError("Location is unavailable in this browser. Enter a city or ZIP instead."); return; }
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude, label: "Current location", source: "device" });
        resolve();
      }, (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Enter a city or ZIP instead."
          : error.code === error.TIMEOUT
            ? "Location took too long. Enter a city or ZIP instead."
            : "We could not determine your location. Enter a city or ZIP instead.";
        setPermissionError(message);
        resolve();
      }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 10 * 60_000 });
    });
  }, [setLocation]);

  const value = useMemo(() => ({ location, ready, permissionError, setLocation, clearLocation, useDeviceLocation }), [clearLocation, location, permissionError, ready, setLocation, useDeviceLocation]);
  return <CustomerLocationContext.Provider value={value}>{children}</CustomerLocationContext.Provider>;
}

export function useCustomerLocation() {
  const value = useContext(CustomerLocationContext);
  if (!value) throw new Error("useCustomerLocation must be used within CustomerLocationProvider.");
  return value;
}
