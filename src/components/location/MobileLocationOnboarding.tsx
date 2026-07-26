"use client";

import { useEffect, useState } from "react";
import { LocateFixed, MapPin, X } from "lucide-react";
import { LocationAutocomplete } from "@/components/search/AutocompleteInputs";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import type { CustomerLocation } from "@/lib/location";

const PROMPT_KEY = "girlz-culture-mobile-location-prompt-v1";
const PROMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

type PromptRecord = {
  dismissedAt: number;
  outcome: "device" | "manual" | "dismissed" | "denied";
};

function validPromptRecord(value: string | null) {
  if (!value) return false;
  try {
    const record = JSON.parse(value) as Partial<PromptRecord>;
    return (
      Number.isFinite(record.dismissedAt) &&
      Date.now() - Number(record.dismissedAt) < PROMPT_RETENTION_MS
    );
  } catch {
    return false;
  }
}

function remember(outcome: PromptRecord["outcome"]) {
  try {
    localStorage.setItem(
      PROMPT_KEY,
      JSON.stringify({ dismissedAt: Date.now(), outcome } satisfies PromptRecord),
    );
  } catch {
    // Private browsing may disable storage. The in-memory state still prevents
    // repeated prompts during the current page view.
  }
}

export default function MobileLocationOnboarding() {
  const locationState = useCustomerLocation();
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const [locationText, setLocationText] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!locationState.ready) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (!mobile) return;
    let alreadyHandled = false;
    try {
      alreadyHandled = validPromptRecord(localStorage.getItem(PROMPT_KEY));
    } catch {
      alreadyHandled = false;
    }
    if (!alreadyHandled) {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [locationState.ready]);

  function close(outcome: PromptRecord["outcome"] = "dismissed") {
    remember(outcome);
    setVisible(false);
  }

  async function requestDeviceLocation() {
    setLocating(true);
    const resolved = await locationState.useDeviceLocation();
    setLocating(false);
    if (resolved) {
      close("device");
      return;
    }
    remember("denied");
    setManual(true);
  }

  function useManualLocation(location: CustomerLocation | null) {
    if (!location) return;
    locationState.setLocation(location);
    close("manual");
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-onboarding-title"
      className="fixed inset-0 z-[180] flex items-end bg-ink/55 p-3 backdrop-blur-[2px] md:hidden"
    >
      <section className="w-full rounded-[22px] border border-charcoal/10 bg-white p-5 shadow-[0_24px_70px_rgba(13,17,20,.28)]">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal/10 text-teal">
            <MapPin size={22} aria-hidden="true" />
          </span>
          <button
            type="button"
            aria-label="Close location prompt"
            onClick={() => close()}
            className="grid min-h-11 min-w-11 place-items-center rounded-full text-charcoal/65 hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
          >
            <X size={20} />
          </button>
        </div>
        <h2
          id="location-onboarding-title"
          className="mt-3 font-serif text-[28px] font-semibold leading-tight text-teal"
        >
          Find salons near you
        </h2>
        <p className="mt-2 text-sm leading-6 text-charcoal/70">
          Allow Girlz Culture to use your location to show nearby salons. You
          can also choose a city or ZIP code and change it anytime.
        </p>

        {manual ? (
          <div className="mt-5 rounded-[14px] border border-charcoal/10 px-3">
            <LocationAutocomplete
              value={locationText}
              onChange={setLocationText}
              onResolved={useManualLocation}
              placeholder="Choose city or ZIP code"
              className="w-full"
            />
          </div>
        ) : null}
        {locationState.permissionError ? (
          <p role="alert" className="mt-3 text-xs leading-5 text-red-700">
            {locationState.permissionError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={locating}
            onClick={() => void requestDeviceLocation()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[12px] bg-coral px-5 text-sm font-bold text-white disabled:opacity-60"
          >
            <LocateFixed size={18} aria-hidden="true" />
            {locating ? "Finding your location…" : "Use my location"}
          </button>
          <button
            type="button"
            onClick={() => setManual(true)}
            className="min-h-12 rounded-[12px] border border-teal px-5 text-sm font-bold text-teal"
          >
            Choose city or ZIP code
          </button>
        </div>
        <p className="mt-4 text-center text-[10px] leading-4 text-charcoal/50">
          Your selected area is stored on this device for up to 30 days. Precise
          location is requested only when you choose to share it.
        </p>
      </section>
    </div>
  );
}
