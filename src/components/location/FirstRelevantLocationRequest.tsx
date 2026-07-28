"use client";

import { useEffect } from "react";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";

export const AUTOMATIC_LOCATION_REQUEST_KEY =
  "girlz-culture-location-native-request-v1";
const MOBILE_PROMPT_KEY = "girlz-culture-mobile-location-prompt-v1";

type RequestRecord = {
  attemptedAt: number;
  outcome: "granted" | "denied" | "unavailable" | "prompted";
};

function remember(outcome: RequestRecord["outcome"]) {
  try {
    localStorage.setItem(
      AUTOMATIC_LOCATION_REQUEST_KEY,
      JSON.stringify({ attemptedAt: Date.now(), outcome } satisfies RequestRecord),
    );
    localStorage.setItem(
      MOBILE_PROMPT_KEY,
      JSON.stringify({ dismissedAt: Date.now(), outcome }),
    );
  } catch {
    // The in-memory provider still avoids repeated calls during this page view.
  }
}

function alreadyRequested() {
  try {
    return Boolean(localStorage.getItem(AUTOMATIC_LOCATION_REQUEST_KEY));
  } catch {
    return false;
  }
}

/**
 * Mount this only on marketplace-discovery entry points. The browser receives
 * one native geolocation request on the first relevant visit. A denial is
 * respected and never retried automatically; approximate and manual location
 * controls remain available.
 */
export default function FirstRelevantLocationRequest() {
  const location = useCustomerLocation();

  useEffect(() => {
    if (!location.ready || alreadyRequested()) return;
    let active = true;

    async function requestOnce() {
      if (location.location?.source === "device") {
        remember("granted");
        return;
      }
      if (!("geolocation" in navigator)) {
        remember("unavailable");
        return;
      }
      if ("permissions" in navigator) {
        try {
          const permission = await navigator.permissions.query({
            name: "geolocation",
          });
          if (permission.state === "denied") {
            remember("denied");
            return;
          }
        } catch {
          // Browsers without a compatible Permissions API still support a
          // single native geolocation request below.
        }
      }

      // Persist the attempt before opening the native prompt so route changes
      // or concurrent discovery components cannot create a second request.
      remember("prompted");
      const granted = await location.useDeviceLocation();
      if (active) remember(granted ? "granted" : "denied");
    }

    void requestOnce();
    return () => {
      active = false;
    };
  }, [location]);

  return null;
}
