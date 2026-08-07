"use client";

import Link from "next/link";
import { List, LocateFixed, Map, MapPin } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LocationAutocomplete } from "@/components/search/AutocompleteInputs";
import GoogleSalonMap from "@/components/search/GoogleSalonMap";
import MarketplaceSalonCard from "@/components/public/MarketplaceSalonCard";
import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import {
  DEFAULT_NEARBY_RADIUS_MILES,
  validCoordinates,
  type Coordinates,
  type CustomerLocation,
} from "@/lib/location";
import type { PublicSalonResult } from "@/lib/discoveryServer";
import { readApiResponse } from "@/lib/apiResponseClient";

type DecisionSalon = PublicSalonResult & {
  matched_service?: {
    id: string;
    name: string;
    price: number | null;
    original_price: number | null;
  } | null;
  promotion?: {
    id: string;
    title: string;
    label: string | null;
  } | null;
  next_slot?: {
    date: string;
    value: string;
    label: string;
    stylist_name: string | null;
  } | null;
  reliability?: {
    completed_appointments: number;
    cancellation_rate_percent: number;
    label: string;
  };
  sponsored?: false;
};

type SearchResponse = {
  salons?: DecisionSalon[];
  summary?: string;
  question?: string | null;
  needs_location?: boolean;
  location_label?: string | null;
  error?: string;
};

type Filters = {
  radiusMiles: number;
  minimumRating: number;
  maximumPrice: string;
  date: string;
  sort: "distance" | "rating" | "price_low" | "price_high";
  promotionOnly: boolean;
};

type Props = {
  initialSalons: PublicSalonResult[];
  initialTotal: number;
  initialQuery?: string;
  initialLocation?: string;
  initialOrigin?: Coordinates | null;
};

type StoredState = {
  version: 1;
  savedAt: number;
  query: string;
  filters: Filters;
  salons: DecisionSalon[];
  summary: string;
  locationLabel: string;
  view: "list" | "map";
  scrollY: number;
};

const STORAGE_KEY = "girlz-culture-salon-search-v2";
const STORAGE_TTL_MS = 30 * 60_000;
const defaultFilters: Filters = {
  radiusMiles: DEFAULT_NEARBY_RADIUS_MILES,
  minimumRating: 0,
  maximumPrice: "",
  date: "",
  sort: "distance",
  promotionOnly: false,
};

function asDecisionRows(rows: PublicSalonResult[]): DecisionSalon[] {
  return rows.map((row) => ({ ...row, sponsored: false }));
}

function priceValue(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function storedState(): StoredState | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) || "null",
    ) as StoredState | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      Date.now() - Number(parsed.savedAt || 0) > STORAGE_TTL_MS ||
      !Array.isArray(parsed.salons)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function SalonDiscovery({
  initialSalons,
  initialTotal,
  initialQuery = "",
  initialLocation = "",
  initialOrigin = null,
}: Props) {
  const customerLocation = useCustomerLocation();
  const [query, setQuery] = useState(initialQuery);
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [salons, setSalons] = useState<DecisionSalon[]>(
    asDecisionRows(initialSalons),
  );
  const [summary, setSummary] = useState(
    initialTotal
      ? `${initialTotal} ${initialTotal === 1 ? "salon" : "salons"} nearby.`
      : "",
  );
  const [locationLabel, setLocationLabel] = useState(initialLocation);
  const [locationText, setLocationText] = useState("");
  const [locationEditorOpen, setLocationEditorOpen] = useState(!initialOrigin);
  const [ignoreInitialOrigin, setIgnoreInitialOrigin] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const restored = useRef(false);
  const restoredFromStorage = useRef(false);
  const initialIntentHandled = useRef(false);
  const automaticNearbySearch = useRef(false);
  const pendingLocationSearch = useRef(false);
  const pendingScroll = useRef<number | null>(null);

  const origin = useMemo(() => {
    if (
      customerLocation.location &&
      validCoordinates(customerLocation.location)
    ) {
      return {
        lat: customerLocation.location.lat,
        lng: customerLocation.location.lng,
      };
    }
    return !ignoreInitialOrigin &&
      initialOrigin &&
      validCoordinates(initialOrigin)
      ? initialOrigin
      : null;
  }, [customerLocation.location, ignoreInitialOrigin, initialOrigin]);

  const visibleLocation =
    customerLocation.location?.label ||
    locationLabel ||
    initialLocation ||
    (origin ? "Selected location" : "");

  const activeFilterCount = [
    filters.radiusMiles !== DEFAULT_NEARBY_RADIUS_MILES,
    filters.minimumRating > 0,
    Boolean(filters.maximumPrice),
    Boolean(filters.date),
    filters.sort !== "distance",
    filters.promotionOnly,
  ].filter(Boolean).length;

  const persist = useCallback(
    (scrollY = window.scrollY) => {
      try {
        const state: StoredState = {
          version: 1,
          savedAt: Date.now(),
          query,
          filters,
          salons,
          summary,
          locationLabel: visibleLocation,
          view,
          scrollY,
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Search remains usable when browser storage is unavailable.
      }
    }, [filters, query, salons, summary, view, visibleLocation],
  );

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const state = storedState();
    if (!state) return;
    const frame = window.requestAnimationFrame(() => {
      restoredFromStorage.current = true;
      setQuery(state.query);
      setDraftQuery(state.query);
      setFilters(state.filters);
      setDraftFilters(state.filters);
      setSalons(state.salons);
      setSummary(state.summary);
      setLocationLabel(state.locationLabel);
      setView(state.view);
      pendingScroll.current = state.scrollY;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (pendingScroll.current === null) return;
    const position = pendingScroll.current;
    pendingScroll.current = null;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: position, behavior: "auto" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [salons.length]);

  useEffect(() => {
    const save = () => persist();
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      requestController.current?.abort();
    };
  }, [persist]);

  const runSearch = useCallback(
    async (
      nextQuery: string,
      nextFilters: Filters,
      options: { restoreScroll?: boolean } = {},
    ) => {
      const normalizedQuery = nextQuery.trim() || "salons near me";
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/discovery/decision-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            query: normalizedQuery,
            latitude: origin?.lat,
            longitude: origin?.lng,
            filters: {
              radiusMiles: nextFilters.radiusMiles,
              minimumRating: nextFilters.minimumRating || null,
              maximumPrice: priceValue(nextFilters.maximumPrice),
              date: nextFilters.date || null,
              sort: nextFilters.sort,
              promotionOnly: nextFilters.promotionOnly,
            },
            website: "",
          }),
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await readApiResponse(
          response,
          "Search could not be completed.",
        )) as SearchResponse;
        if (!response.ok)
          throw new Error(body.error || "Search could not be completed.");

        const rows = Array.isArray(body.salons) ? body.salons : [];
        setQuery(normalizedQuery);
        setDraftQuery(normalizedQuery);
        setFilters(nextFilters);
        setDraftFilters(nextFilters);
        setSalons(rows);
        setSummary(
          body.summary ||
            (rows.length
              ? `${rows.length} matching salons found.`
              : "No matching salons were found."),
        );
        setLocationLabel(
          body.location_label ||
            customerLocation.location?.label ||
            initialLocation,
        );
        setSelectedSalonId("");
        if (body.needs_location) {
          setLocationEditorOpen(true);
          setError(
            body.question ||
              "Add a city, neighborhood, or ZIP, or use your location.",
          );
        } else {
          setLocationEditorOpen(false);
        }

        const params = new URLSearchParams();
        params.set("q", normalizedQuery);
        if (origin) {
          params.set("lat", String(origin.lat));
          params.set("lng", String(origin.lng));
          if (visibleLocation) params.set("location", visibleLocation);
        }
        if (nextFilters.radiusMiles !== DEFAULT_NEARBY_RADIUS_MILES)
          params.set("radius", String(nextFilters.radiusMiles));
        if (nextFilters.minimumRating)
          params.set("rating", String(nextFilters.minimumRating));
        if (nextFilters.maximumPrice)
          params.set("max_price", nextFilters.maximumPrice);
        if (nextFilters.date) params.set("date", nextFilters.date);
        if (nextFilters.sort !== "distance")
          params.set("sort", nextFilters.sort);
        if (nextFilters.promotionOnly) params.set("offers", "true");
        window.history.replaceState(
          null,
          "",
          `/salons?${params.toString()}`,
        );

        if (!options.restoreScroll) {
          window.requestAnimationFrame(() =>
            document.getElementById("salon-results")?.scrollIntoView({
              block: "start",
              behavior: "smooth",
            }),
          );
        }
      } catch (requestError) {
        if (
          requestError instanceof Error &&
          requestError.name === "AbortError"
        )
          return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Search could not be completed.",
        );
      } finally {
        if (requestController.current === controller) setLoading(false);
      }
    }, [customerLocation.location, initialLocation, origin, visibleLocation],
  );

  useEffect(() => {
    if (
      initialIntentHandled.current ||
      restoredFromStorage.current ||
      !initialQuery.trim() ||
      !customerLocation.ready
    )
      return;
    initialIntentHandled.current = true;
    void runSearch(initialQuery, filters, { restoreScroll: true });
  }, [customerLocation.ready, filters, initialQuery, runSearch]);

  useEffect(() => {
    if (
      automaticNearbySearch.current ||
      initialSalons.length ||
      query.trim() ||
      !customerLocation.ready ||
      !origin
    )
      return;
    automaticNearbySearch.current = true;
    void runSearch("salons near me", filters, { restoreScroll: true });
  }, [
    customerLocation.ready,
    filters,
    initialSalons.length,
    origin,
    query,
    runSearch,
  ]);

  useEffect(() => {
    if (!pendingLocationSearch.current || !origin) return;
    pendingLocationSearch.current = false;
    automaticNearbySearch.current = true;
    void runSearch(draftQuery || query || "salons near me", filters);
  }, [draftQuery, filters, origin, query, runSearch]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(draftQuery, filters);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiltersOpen(false);
    void runSearch(draftQuery || query, draftFilters);
  }

  function clearFilters() {
    setDraftFilters(defaultFilters);
  }

  function resolveLocation(next: CustomerLocation | null) {
    if (!next) return;
    pendingLocationSearch.current = true;
    setIgnoreInitialOrigin(true);
    setLocationLabel(next.label);
    setLocationText("");
    setLocationEditorOpen(false);
    customerLocation.setLocation(next);
  }

  async function requestDeviceLocation() {
    setLocationBusy(true);
    setError("");
    pendingLocationSearch.current = true;
    setIgnoreInitialOrigin(true);
    try {
      const granted = await customerLocation.useDeviceLocation();
      if (!granted) {
        pendingLocationSearch.current = false;
        setLocationEditorOpen(true);
        setError(
          customerLocation.permissionError ||
            "Location was not available. Enter a city or ZIP instead.",
        );
      }
    } finally {
      setLocationBusy(false);
    }
  }

  function changeLocation() {
    pendingLocationSearch.current = false;
    setIgnoreInitialOrigin(true);
    customerLocation.clearLocation();
    setLocationLabel("");
    setLocationText("");
    setLocationEditorOpen(true);
    setSalons([]);
    setSummary("");
    setError("");
    setView("list");
  }

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <form
        onSubmit={submit}
        className="sticky top-16 z-30 bg-cream/95 py-2 backdrop-blur md:static md:bg-transparent md:py-0"
      >
        <div className="flex min-h-12 items-center gap-2 rounded-[12px] border border-plum/15 bg-white p-1.5 shadow-[0_8px_24px_rgba(13,17,20,.06)]">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search salons</span>
            <input
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Search"
              maxLength={600}
              autoComplete="off"
              enterKeyHint="search"
              className="min-h-10 w-full min-w-0 bg-transparent px-3 text-[15px] font-semibold text-ink outline-none placeholder:text-ink/50"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="min-h-10 shrink-0 rounded-[9px] bg-magenta px-4 text-[12px] font-bold text-white disabled:opacity-60 sm:px-6"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {locationEditorOpen || !origin ? (
          <div className="relative z-[70] min-w-0 flex-[1_1_250px] rounded-[9px] bg-white">
            <LocationAutocomplete
              name="discovery_location_query"
              value={locationText}
              onChange={setLocationText}
              onResolved={resolveLocation}
              placeholder="City, neighborhood, or ZIP"
              className="rounded-[9px] border border-plum/15 bg-white px-3"
            />
          </div>
        ) : (
          <p className="flex min-h-9 min-w-0 flex-1 items-center gap-1 text-[11px] font-medium text-ink/70">
            <MapPin aria-hidden="true" size={13} className="shrink-0" />
            <span className="truncate">Near {visibleLocation}</span>
            <button
              type="button"
              onClick={changeLocation}
              className="shrink-0 font-bold text-magenta"
            >
              Change
            </button>
          </p>
        )}

        {(locationEditorOpen || !origin) && (
          <button
            type="button"
            onClick={() => void requestDeviceLocation()}
            disabled={locationBusy}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[8px] border border-magenta bg-white px-3 text-[10px] font-bold text-magenta disabled:opacity-60"
          >
            <LocateFixed aria-hidden="true" size={13} />
            {locationBusy ? "Locating…" : "Use my location"}
          </button>
        )}

        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => {
            setDraftFilters(filters);
            setFiltersOpen(true);
          }}
          className="min-h-9 shrink-0 rounded-[8px] border border-plum/15 bg-white px-3 text-[10px] font-bold text-plum"
        >
          {activeFilterCount ? `Filter (${activeFilterCount})` : "Filter"}
        </button>
      </div>

      {summary ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-[9px] border border-plum/10 bg-white px-3 py-2 text-[11px] font-semibold leading-5 text-plum"
        >
          {summary}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-2 rounded-[9px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold leading-5 text-red-800"
        >
          {error}
        </div>
      ) : null}

      <section id="salon-results" className="scroll-mt-36 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-[24px] font-semibold leading-none text-ink sm:text-[28px]">
              {origin ? "Salons Near You" : "Salons"}
            </h1>
            <p className="mt-1 text-[11px] font-medium text-ink/65">
              Verified marketplace information only.
            </p>
          </div>
          <div className="flex overflow-hidden rounded-[9px] border border-plum/15 bg-white text-[10px] font-bold">
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`inline-flex min-h-9 items-center gap-1 px-3 ${
                view === "list" ? "bg-plum text-white" : "text-plum"
              }`}
            >
              <List aria-hidden="true" size={14} />
              List
            </button>
            <button
              type="button"
              aria-pressed={view === "map"}
              onClick={() => setView("map")}
              className={`inline-flex min-h-9 items-center gap-1 px-3 ${
                view === "map" ? "bg-plum text-white" : "text-plum"
              }`}
            >
              <Map aria-hidden="true" size={14} />
              Map
            </button>
          </div>
        </div>

        {loading && !salons.length ? (
          <div className="mt-3 space-y-3" aria-label="Loading salons">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-40 animate-pulse rounded-[14px] bg-white"
              />
            ))}
          </div>
        ) : view === "map" ? (
          salons.length ? (
            <div className="mt-3">
              <GoogleSalonMap
                salons={salons}
                selectedSalonId={selectedSalonId}
                onSelect={setSelectedSalonId}
              />
            </div>
          ) : (
            <EmptyState />
          )
        ) : salons.length ? (
          <div
            className="mt-3 grid gap-3 lg:grid-cols-2"
            onClickCapture={(event) => {
              if (
                (event.target as HTMLElement).closest(
                  "a[data-salon-navigation]",
                )
              )
                persist();
            }}
          >
            {salons.map((salon) => (
              <MarketplaceSalonCard
                key={salon.id}
                salon={salon}
                variant="list"
                selected={selectedSalonId === salon.id}
                onFocus={setSelectedSalonId}
                onNavigate={() => persist()}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      {filtersOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="salon-filter-title"
          className="fixed inset-0 z-[100] flex items-end bg-charcoal/55 sm:items-center sm:justify-center sm:p-5"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setFiltersOpen(false);
          }}
        >
          <form
            onSubmit={applyFilters}
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-[18px] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[18px] sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="salon-filter-title"
                  className="font-serif text-2xl font-semibold text-plum"
                >
                  Filter
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-ink/60">
                  Choose the details that matter for this booking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="min-h-10 rounded-[8px] border border-plum/15 px-3 text-[10px] font-bold text-plum"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <FilterSelect
                label="Distance"
                value={String(draftFilters.radiusMiles)}
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    radiusMiles: Number(value),
                  }))
                }
                options={[
                  ["5", "Within 5 miles"],
                  ["10", "Within 10 miles"],
                  ["25", "Within 25 miles"],
                  ["50", "Within 50 miles"],
                  ["100", "Within 100 miles"],
                ]}
              />
              <FilterSelect
                label="Rating"
                value={String(draftFilters.minimumRating)}
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    minimumRating: Number(value),
                  }))
                }
                options={[
                  ["0", "Any rating"],
                  ["3.9", "3.9 and above"],
                  ["4", "4.0 and above"],
                  ["4.5", "4.5 and above"],
                  ["4.8", "4.8 and above"],
                ]}
              />
              <FilterSelect
                label="Maximum price"
                value={draftFilters.maximumPrice}
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    maximumPrice: value,
                  }))
                }
                options={[
                  ["", "Any price"],
                  ["60", "$60 or less"],
                  ["80", "$80 or less"],
                  ["100", "$100 or less"],
                  ["150", "$150 or less"],
                  ["250", "$250 or less"],
                ]}
              />
              <FilterSelect
                label="Sort"
                value={draftFilters.sort}
                onChange={(value) =>
                  setDraftFilters((current) => ({
                    ...current,
                    sort: value as Filters["sort"],
                  }))
                }
                options={[
                  ["distance", "Nearest"],
                  ["rating", "Best rated"],
                  ["price_low", "Lowest price"],
                  ["price_high", "Highest price"],
                ]}
              />
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold text-ink">
                  Availability date
                </span>
                <input
                  type="date"
                  value={draftFilters.date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  className="min-h-12 w-full rounded-[9px] border border-plum/15 bg-white px-3 text-[12px] font-semibold text-ink"
                />
              </label>
              <label className="flex min-h-12 items-center gap-3 rounded-[9px] border border-plum/15 px-3 text-[12px] font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={draftFilters.promotionOnly}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      promotionOnly: event.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Active offers only
              </label>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-12 rounded-[9px] border border-magenta bg-white text-[12px] font-bold text-magenta"
              >
                Clear filters
              </button>
              <button
                type="submit"
                className="min-h-12 rounded-[9px] bg-magenta text-[12px] font-bold text-white"
              >
                Apply filters
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-ink">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-[9px] border border-plum/15 bg-white px-3 text-[12px] font-semibold text-ink"
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState() {
  return (
    <div className="mt-3 rounded-[14px] border border-dashed border-plum/20 bg-white p-7 text-center">
      <h2 className="font-serif text-xl font-semibold text-plum">
        No matching salons
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-ink/65">
        Try a wider distance, a higher budget, fewer requirements, or another location.
      </p>
      <Link
        href="/styles"
        className="mt-4 inline-flex min-h-10 items-center rounded-[8px] border border-magenta px-4 text-[11px] font-bold text-magenta"
      >
        Browse styles
      </Link>
    </div>
  );
}
