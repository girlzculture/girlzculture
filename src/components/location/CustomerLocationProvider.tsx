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

export default function CustomerLocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<CustomerLocation | null>(null);
  const [ready, setReady] = useState(false);
  const [permissionError, setPermissionError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const query = new URLSearchParams(window.location.search);
        const fromUrl: CustomerLocation = { lat: Number(query.get("lat")), lng: Number(query.get("lng")), label: String(query.get("location") || "").trim(), source: "explicit" };
        if (fromUrl.label && validCoordinates(fromUrl)) {
          setLocationState(fromUrl);
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
          setReady(true);
          return;
        }
        const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null") as CustomerLocation | null;
        if (parsed && validCoordinates(parsed) && parsed.label && ["explicit", "device", "saved"].includes(parsed.source)) setLocationState(parsed);
      } catch { sessionStorage.removeItem(STORAGE_KEY); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLocation = useCallback((next: CustomerLocation) => {
    if (!validCoordinates(next) || !next.label.trim()) return;
    const safe = { ...next, label: next.label.trim().slice(0, 160) };
    setLocationState(safe);
    setPermissionError("");
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  }, []);

  const clearLocation = useCallback(() => {
    setLocationState(null);
    setPermissionError("");
    sessionStorage.removeItem(STORAGE_KEY);
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
