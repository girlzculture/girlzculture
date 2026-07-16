/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, X } from "lucide-react";
import type { CustomerLocation } from "@/lib/location";

let googleMapsPromise: Promise<void> | null = null;
export function loadGoogleMaps() {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Google Maps requires a browser."));
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("Google Maps is not configured."));
  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(
      "girlz-google-maps",
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Google Maps failed to load.")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = "girlz-google-maps";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,marker`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

type SharedProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  name?: string;
};

type SearchSuggestion = {
  kind: "style" | "salon" | "location";
  label: string;
  value?: string;
  subtitle?: string;
  href?: string;
  lat?: number;
  lng?: number;
};
type SearchGroup = {
  kind: SearchSuggestion["kind"];
  label: string;
  items: SearchSuggestion[];
};

export function StyleAutocomplete({
  value,
  onChange,
  onLocation,
  contextQuery = "",
  placeholder = "Search services",
  className = "",
  name = "style",
}: SharedProps & {
  onLocation?: (location: CustomerLocation) => void;
  contextQuery?: string;
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const items = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items.map((item) => ({ ...item, group: group.label })),
      ),
    [groups],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search/suggestions?type=style&q=${encodeURIComponent(value)}`,
          { signal: controller.signal },
        );
        const body = await response.json();
        setGroups(response.ok && Array.isArray(body.groups) ? body.groups : []);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setGroups([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function choose(item: SearchSuggestion) {
    if (item.kind === "salon" && item.href) {
      const separator = item.href.includes("?") ? "&" : "?";
      router.push(
        `${item.href}${contextQuery ? `${separator}${contextQuery}` : ""}`,
      );
    } else if (
      item.kind === "location" &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lng)
    ) {
      const location = {
        label: item.label,
        lat: Number(item.lat),
        lng: Number(item.lng),
        source: "explicit" as const,
      };
      if (onLocation) onLocation(location);
      else
        router.push(
          `/salons?location=${encodeURIComponent(location.label)}&lat=${location.lat}&lng=${location.lng}`,
        );
    } else onChange(item.value || item.label);
    setOpen(false);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(items.length - 1, index + 1));
    }
    if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(items[activeIndex]);
    }
  }
  let itemOffset = 0;
  return (
    <div ref={root} className={`relative ${className}`}>
      <span className="flex min-h-11 items-center gap-2">
        <Search size={18} className="shrink-0 text-magenta" />
        <input
          name={name}
          value={value}
          role="combobox"
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm"
        />
      </span>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-plum/10 bg-white py-1 shadow-2xl"
        >
          {loading ? (
            <p role="status" className="px-4 py-3 text-xs text-ink/60">
              Finding matchesâ€¦
            </p>
          ) : groups.length ? (
            groups.map((group) => {
              const start = itemOffset;
              itemOffset += group.items.length;
              return (
                <section key={group.kind} role="group" aria-label={group.label}>
                  <p className="border-t border-plum/10 px-4 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[.12em] text-plum first:border-t-0">
                    {group.label}
                  </p>
                  {group.items.map((item, index) => {
                    const absoluteIndex = start + index;
                    return (
                      <button
                        id={`${listboxId}-${absoluteIndex}`}
                        role="option"
                        aria-selected={activeIndex === absoluteIndex}
                        key={`${item.kind}-${item.label}`}
                        type="button"
                        onMouseEnter={() => setActiveIndex(absoluteIndex)}
                        onClick={() => choose(item)}
                        className={`block min-h-11 w-full px-4 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-magenta ${activeIndex === absoluteIndex ? "bg-blush/55" : "hover:bg-blush/35"}`}
                      >
                        <span className="block text-xs font-semibold text-ink">
                          {item.label}
                        </span>
                        {item.subtitle ? (
                          <span className="mt-0.5 block text-[10px] text-ink/55">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </section>
              );
            })
          ) : (
            <p role="status" className="px-4 py-3 text-xs text-ink/60">
              No matching styles, salons, or locations.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function LocationAutocomplete({
  value,
  onChange,
  onCoordinates,
  onResolved,
  placeholder = "City, neighborhood, or ZIP",
  className = "",
  name = "location",
}: SharedProps & {
  onCoordinates?: (coordinates: { lat: number; lng: number } | null) => void;
  onResolved?: (location: CustomerLocation | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<
    Array<{ text: string; prediction: any }>
  >([]);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(
    Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef<any>(null);
  const requestSequence = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  useEffect(() => {
    const requestId = ++requestSequence.current;
    const timer = window.setTimeout(
      async () => {
        if (value.trim().length < 2 || !configured) {
          setSuggestions([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          await loadGoogleMaps();
          const places = await (window as any).google.maps.importLibrary(
            "places",
          );
          sessionToken.current ||= new places.AutocompleteSessionToken();
          const result =
            await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: value,
              includedRegionCodes: ["us"],
              language: "en-US",
              region: "us",
              sessionToken: sessionToken.current,
            });
          if (requestId !== requestSequence.current) return;
          setSuggestions(
            (result.suggestions || [])
              .map((item: any) => ({
                text: item.placePrediction?.text?.toString() || "",
                prediction: item.placePrediction,
              }))
              .filter((item: { text: string }) => item.text)
              .slice(0, 6),
          );
          setActiveIndex(-1);
        } catch (error) {
          if (requestId === requestSequence.current) {
            console.error("Places autocomplete failed", error);
            setConfigured(false);
            setSuggestions([]);
          }
        } finally {
          if (requestId === requestSequence.current) setLoading(false);
        }
      },
      value.trim().length < 2 ? 0 : 220,
    );
    return () => window.clearTimeout(timer);
  }, [configured, value]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  async function choose(item: { text: string; prediction: any }) {
    onChange(item.text);
    setOpen(false);
    setSuggestions([]);
    try {
      const place = item.prediction.toPlace();
      await place.fetchFields({
        fields: ["location", "formattedAddress", "displayName", "id"],
      });
      const coordinates = place.location
        ? { lat: place.location.lat(), lng: place.location.lng() }
        : null;
      const label = String(
        place.formattedAddress || place.displayName || item.text,
      );
      if (coordinates) {
        onChange(label);
        onCoordinates?.(coordinates);
        onResolved?.({
          ...coordinates,
          label,
          source: "explicit",
          placeId: String(place.id || "") || undefined,
        });
      } else {
        onCoordinates?.(null);
        onResolved?.(null);
      }
      sessionToken.current = null;
    } catch (error) {
      console.error("Place details failed", error);
      onCoordinates?.(null);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void choose(suggestions[activeIndex]);
    }
  }
  function clear() {
    requestSequence.current += 1;
    onChange("");
    onCoordinates?.(null);
    onResolved?.(null);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }
  return (
    <div ref={root} className={`relative ${className}`}>
      <span className="flex min-h-11 items-center gap-2">
        <MapPin size={18} className="shrink-0 text-magenta" />
        <input
          name={name}
          value={value}
          role="combobox"
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
          }
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            onCoordinates?.(null);
            onResolved?.(null);
            setOpen(true);
          }}
          autoComplete="off"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none sm:text-sm"
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear location"
            className="grid min-h-9 min-w-9 place-items-center rounded-full text-ink/55 hover:bg-blush/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta"
          >
            <X size={15} />
          </button>
        ) : null}
      </span>
      {open && value.trim().length >= 2 ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-plum/10 bg-white py-1 shadow-2xl"
        >
          <p className="px-4 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[.12em] text-plum">
            Locations
          </p>
          {loading ? (
            <p role="status" className="px-4 py-3 text-xs text-ink/60">
              Finding locations…
            </p>
          ) : suggestions.length ? (
            suggestions.map((suggestion, index) => (
              <button
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                key={suggestion.text}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void choose(suggestion)}
                className={`block min-h-11 w-full px-4 py-3 text-left text-xs focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-magenta ${activeIndex === index ? "bg-blush/55" : "hover:bg-blush/40"}`}
              >
                {suggestion.text}
              </button>
            ))
          ) : (
            <p role="status" className="px-4 py-3 text-xs text-ink/60">
              {configured
                ? "No matching U.S. locations."
                : "Location suggestions require Google Maps setup."}
            </p>
          )}
          <p className="border-t border-plum/10 px-4 py-2 text-right text-[10px] text-ink/60">
            Suggestions by Google
          </p>
        </div>
      ) : null}
    </div>
  );
}
