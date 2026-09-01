"use client";

import Link from "next/link";
import { List, LocateFixed, Map as MapIcon, MapPin } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useEffectEvent,
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
    maximum_displayed_price: number | null;
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
  empty_reason?: SearchEmptyReason | null;
  partial_search?: boolean;
  warning?: string | null;
  pagination?: {
    page?: number;
    page_size?: number;
    has_more_results?: boolean;
  };
  error?: string;
};

type SearchEmptyReason =
  | "location_required"
  | "location_unresolved"
  | "no_salons_in_radius"
  | "service_unavailable_nearby"
  | "rating_unavailable"
  | "budget_unavailable"
  | "opening_unavailable"
  | "promotion_unavailable"
  | "technical_search_failure"
  | "no_exact_match";

export type DiscoveryFilters = {
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
  initialStyleId?: string;
  initialServiceIntent?: boolean;
  initialLocation?: string;
  initialOrigin?: Coordinates | null;
  initialFilters?: DiscoveryFilters;
  initialView?: "list" | "map";
};

type StoredState = {
  version: 2;
  savedAt: number;
  query: string;
  filters: DiscoveryFilters;
  serviceId: string;
  origin: Coordinates | null;
  salons: DecisionSalon[];
  summary: string;
  locationLabel: string;
  view: "list" | "map";
  scrollY: number;
  page?: number;
  hasMore?: boolean;
};

const STORAGE_KEY = "girlz-culture-salon-search-v2";
const STORAGE_TTL_MS = 30 * 60_000;
const defaultFilters: DiscoveryFilters = {
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

function authoritativeServiceRows(rows: DecisionSalon[]) {
  return rows.filter((row) => Boolean(row.matched_service?.id));
}

function priceValue(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function filtersFromUrl(params: URLSearchParams): DiscoveryFilters {
  const radius = Number(params.get("radius"));
  const rating = Number(params.get("rating"));
  const sortValue = params.get("sort") || "distance";
  const sort = new Set(["distance", "rating", "price_low", "price_high"]).has(sortValue)
    ? sortValue as DiscoveryFilters["sort"]
    : "distance";
  return {
    radiusMiles: Number.isFinite(radius) && radius > 0
      ? Math.max(1, Math.min(100, radius))
      : DEFAULT_NEARBY_RADIUS_MILES,
    minimumRating: Number.isFinite(rating)
      ? Math.max(0, Math.min(5, rating))
      : 0,
    maximumPrice: params.get("max_price") || "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "")
      ? params.get("date") || ""
      : "",
    sort,
    promotionOnly: params.get("offers") === "true",
  };
}

function sameCoordinates(
  left: Coordinates | null | undefined,
  right: Coordinates | null | undefined,
) {
  if (!left || !right) return !left && !right;
  return Math.abs(left.lat - right.lat) < 0.000001 &&
    Math.abs(left.lng - right.lng) < 0.000001;
}

function sameFilters(left: DiscoveryFilters, right: DiscoveryFilters) {
  return left.radiusMiles === right.radiusMiles &&
    left.minimumRating === right.minimumRating &&
    left.maximumPrice === right.maximumPrice &&
    left.date === right.date &&
    left.sort === right.sort &&
    left.promotionOnly === right.promotionOnly;
}

function storedState(): StoredState | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) || "null",
    ) as StoredState | null;
    if (
      !parsed ||
      parsed.version !== 2 ||
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
  initialStyleId = "",
  initialServiceIntent = Boolean(initialStyleId),
  initialLocation = "",
  initialOrigin = null,
  initialFilters = defaultFilters,
  initialView = "list",
}: Props) {
  const startingFilters = useMemo(
    () => ({
      ...defaultFilters,
      ...initialFilters,
    }),
    [initialFilters],
  );
  const initialDecisionRows = useMemo(() => {
    const rows = asDecisionRows(initialSalons);
    return initialServiceIntent ? authoritativeServiceRows(rows) : rows;
  }, [initialSalons, initialServiceIntent]);
  const customerLocation = useCustomerLocation();
  const [query, setQuery] = useState(initialQuery);
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [serviceId, setServiceId] = useState(initialStyleId);
  const [filters, setFilters] = useState<DiscoveryFilters>(startingFilters);
  const [draftFilters, setDraftFilters] = useState<DiscoveryFilters>(startingFilters);
  const [salons, setSalons] = useState<DecisionSalon[]>(initialDecisionRows);
  const [summary, setSummary] = useState(
    initialTotal
      ? `${initialTotal} ${initialTotal === 1 ? "salon" : "salons"} nearby.`
      : "",
  );
  const [searchWarning, setSearchWarning] = useState("");
  const [locationLabel, setLocationLabel] = useState(initialLocation);
  const [locationText, setLocationText] = useState("");
  const [locationEditorOpen, setLocationEditorOpen] = useState(!initialOrigin);
  const [ignoreInitialOrigin, setIgnoreInitialOrigin] = useState(false);
  const [view, setView] = useState<"list" | "map">(initialView);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(
    initialServiceIntent && initialDecisionRows.length !== initialSalons.length,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(
    initialTotal > initialSalons.length,
  );
  const [locationBusy, setLocationBusy] = useState(false);
  const [error, setError] = useState("");
  const [emptyReason, setEmptyReason] = useState<SearchEmptyReason | null>(null);
  const [selectedSalonId, setSelectedSalonId] = useState("");
  const [scrollRestoreRevision, setScrollRestoreRevision] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const restoredFromStorage = useRef(false);
  const restorationChecked = useRef(false);
  const initialIntentHandled = useRef(false);
  const automaticNearbySearch = useRef(false);
  const pendingLocationSearch = useRef(false);
  const pendingScroll = useRef<number | null>(null);

  const origin = useMemo(() => {
    if (
      !ignoreInitialOrigin &&
      initialOrigin &&
      validCoordinates(initialOrigin)
    ) {
      return initialOrigin;
    }
    if (
      customerLocation.location &&
      validCoordinates(customerLocation.location)
    ) {
      return {
        lat: customerLocation.location.lat,
        lng: customerLocation.location.lng,
      };
    }
    return null;
  }, [customerLocation.location, ignoreInitialOrigin, initialOrigin]);

  const usingInitialOrigin = Boolean(
    !ignoreInitialOrigin &&
      initialOrigin &&
      validCoordinates(initialOrigin),
  );
  const visibleLocation = usingInitialOrigin
    ? initialLocation || locationLabel || "Selected location"
    : customerLocation.location?.label ||
      locationLabel ||
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
    (scrollY = window.scrollY, nextView = view) => {
      try {
        const state: StoredState = {
          version: 2,
          savedAt: Date.now(),
          query,
          filters,
          serviceId,
          origin,
          salons,
          summary,
          locationLabel: visibleLocation,
          view: nextView,
          scrollY,
          page: currentPage,
          hasMore,
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Search remains usable when browser storage is unavailable.
      }
    }, [currentPage, filters, hasMore, origin, query, salons, serviceId, summary, view, visibleLocation],
  );

  useEffect(() => {
    if (restorationChecked.current) return;
    restorationChecked.current = true;
    const state = storedState();
    if (!state) return;
    const hasExplicitRequest = Boolean(
      initialQuery ||
      initialStyleId ||
      initialLocation ||
      initialOrigin ||
      initialView !== "list" ||
      !sameFilters(startingFilters, defaultFilters)
    );
    if (
      hasExplicitRequest &&
      (state.query.trim().toLocaleLowerCase() !== initialQuery.trim().toLocaleLowerCase() ||
        state.serviceId !== initialStyleId ||
        !sameCoordinates(state.origin, initialOrigin) ||
        !sameFilters(state.filters, startingFilters) ||
        state.view !== initialView)
    ) return;
    // Set this guard before applying restored state. React runs the remaining
    // mount effects in the same flush; without the synchronous guard,
    // the initial/automatic search effects can start a request that overwrites
    // the restored result set, URL and pending scroll position.
    restoredFromStorage.current = true;
    requestController.current?.abort();
    // Defer the React updates while leaving the guards synchronous. A
    // microtask is not cancelled by Strict Mode's development effect replay,
    // so restoration remains deterministic in both dev and production.
    const restoredRows = state.serviceId
      ? authoritativeServiceRows(state.salons)
      : state.salons;
    if (state.serviceId && restoredRows.length !== state.salons.length) {
      restoredFromStorage.current = false;
      return;
    }
    queueMicrotask(() => {
      setQuery(state.query);
      setDraftQuery(state.query);
      setServiceId(state.serviceId);
      setFilters(state.filters);
      setDraftFilters(state.filters);
      setSalons(restoredRows);
      setLoading(false);
      setSummary(state.summary);
      setLocationLabel(state.locationLabel);
      setView(state.view);
      setCurrentPage(Math.max(1, Number(state.page || 1)));
      setHasMore(Boolean(state.hasMore));
      pendingScroll.current = state.scrollY;
      setScrollRestoreRevision((revision) => revision + 1);
    });
  }, [
    initialLocation,
    initialOrigin,
    initialQuery,
    initialStyleId,
    initialView,
    startingFilters,
  ]);

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
  }, [salons.length, scrollRestoreRevision]);

  const persistOnPageHide = useEffectEvent(() => persist());

  useEffect(() => {
    const save = () => persistOnPageHide();
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
    };
  }, []);

  useEffect(() => () => requestController.current?.abort(), []);

  const runSearch = useCallback(
    async (
      nextQuery: string,
      nextFilters: DiscoveryFilters,
      options: {
        restoreScroll?: boolean;
        history?: "push" | "replace" | "none";
        originOverride?: Coordinates | null;
        serviceIdOverride?: string;
        viewOverride?: "list" | "map";
        locationLabelOverride?: string;
        page?: number;
        append?: boolean;
        requireMatchedService?: boolean;
      } = {},
    ) => {
      const normalizedQuery = nextQuery.trim() || "salons near me";
      const searchOrigin = options.originOverride === undefined
        ? origin
        : options.originOverride;
      const searchServiceId = options.serviceIdOverride ?? serviceId;
      const searchView = options.viewOverride ?? view;
      const searchLocationLabel = options.locationLabelOverride ?? visibleLocation;
      const requestedPage = Math.max(1, Math.floor(Number(options.page) || 1));
      const requireMatchedService = options.requireMatchedService ?? Boolean(searchServiceId);
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      if (options.append) {
        setLoading(false);
        setLoadingMore(true);
      } else {
        setLoadingMore(false);
        setLoading(true);
        setHasMore(false);
        // A replacement query owns the results area as soon as it starts.
        // Keeping the previous cards visible here can misrepresent them as
        // matches for the new query or filters, especially if the request
        // later fails. Append pagination is the only search allowed to retain
        // the existing result set.
        setSalons([]);
        setSummary("");
        setEmptyReason(null);
        setSelectedSalonId("");
        setCurrentPage(1);
      }
      setError("");
      setSearchWarning("");
      try {
        const response = await fetch("/api/discovery/decision-search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            query: normalizedQuery,
            latitude: searchOrigin?.lat,
            longitude: searchOrigin?.lng,
            filters: {
              serviceId: searchServiceId || null,
              radiusMiles: nextFilters.radiusMiles,
              minimumRating: nextFilters.minimumRating || null,
              maximumPrice: priceValue(nextFilters.maximumPrice),
              date: nextFilters.date || null,
              sort: nextFilters.sort,
              promotionOnly: nextFilters.promotionOnly,
              page: requestedPage,
              pageSize: 48,
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

        const responseRows = Array.isArray(body.salons) ? body.salons : [];
        const rows = requireMatchedService
          ? authoritativeServiceRows(responseRows)
          : responseRows;
        setQuery(normalizedQuery);
        setDraftQuery(normalizedQuery);
        setFilters(nextFilters);
        setDraftFilters(nextFilters);
        setSalons((current) => {
          if (!options.append) return rows;
          return [
            ...new Map(
              [...current, ...rows].map((salon) => [salon.id, salon]),
            ).values(),
          ];
        });
        setCurrentPage(
          Math.max(1, Number(body.pagination?.page || requestedPage)),
        );
        setHasMore(Boolean(body.pagination?.has_more_results));
        setEmptyReason(rows.length ? null : body.empty_reason || "no_exact_match");
        setSummary(
          body.summary ||
            (rows.length
              ? `${rows.length} matching salons found.`
              : "No matching salons were found."),
        );
        setSearchWarning(body.warning || "");
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
        params.set(searchServiceId ? "style" : "q", normalizedQuery);
        if (searchServiceId) params.set("style_id", searchServiceId);
        if (searchOrigin) {
          params.set("lat", String(searchOrigin.lat));
          params.set("lng", String(searchOrigin.lng));
          if (searchLocationLabel) params.set("location", searchLocationLabel);
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
        if (searchView === "map") params.set("view", "map");
        if (!options.append && options.history !== "none") {
          const method = options.history === "replace" ? "replaceState" : "pushState";
          window.history[method](null, "", `/salons?${params.toString()}`);
        }

        if (!options.append && !options.restoreScroll) {
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
        setSearchWarning("");
        setEmptyReason(null);
      } finally {
        if (requestController.current === controller) {
          if (options.append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    }, [customerLocation.location, initialLocation, origin, serviceId, view, visibleLocation],
  );

  // Keep browser-history observation mounted for the lifetime of the page.
  // Effect Events see the latest location/search state without leaving a
  // listener gap while List/Map or a filter transition changes runSearch.
  const restoreFromHistory = useEffectEvent(() => {
    const params = new URLSearchParams(window.location.search);
    const nextServiceId = params.get("style_id") || "";
    const nextQuery = params.get(nextServiceId ? "style" : "q") || "salons near me";
    const nextFilters = filtersFromUrl(params);
    const nextView = params.get("view") === "map" ? "map" : "list";
    const nextLocationLabel = params.get("location") || "";
    const nextHasExplicitServiceIntent = Boolean(nextServiceId || params.has("style"));
    const candidateOrigin = {
      lat: Number(params.get("lat")),
      lng: Number(params.get("lng")),
    };
    const nextOrigin = params.has("lat") && params.has("lng") && validCoordinates(candidateOrigin)
      ? candidateOrigin
      : origin;

    setQuery(nextQuery);
    setDraftQuery(nextQuery);
    setServiceId(nextServiceId);
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    setView(nextView);
    if (nextLocationLabel) setLocationLabel(nextLocationLabel);
    if (nextOrigin && validCoordinates(nextOrigin)) {
      setIgnoreInitialOrigin(true);
      customerLocation.setLocation({
        ...nextOrigin,
        label: nextLocationLabel || visibleLocation || "Selected location",
        source: "explicit",
      });
    }
    void runSearch(nextQuery, nextFilters, {
      restoreScroll: true,
      history: "none",
      originOverride: nextOrigin,
      serviceIdOverride: nextServiceId,
      viewOverride: nextView,
      locationLabelOverride: nextLocationLabel || visibleLocation,
      requireMatchedService: nextHasExplicitServiceIntent,
    });
  });

  useEffect(() => {
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  useEffect(() => {
    if (
      initialIntentHandled.current ||
      !restorationChecked.current ||
      restoredFromStorage.current ||
      !(initialQuery.trim() || initialStyleId || !sameFilters(startingFilters, defaultFilters)) ||
      !customerLocation.ready
    )
      return;
    initialIntentHandled.current = true;
    void runSearch(initialQuery || "salons near me", filters, {
      restoreScroll: true,
      history: "replace",
      requireMatchedService: initialServiceIntent,
    });
  }, [customerLocation.ready, filters, initialQuery, initialServiceIntent, initialStyleId, runSearch, startingFilters]);

  useEffect(() => {
    if (
      automaticNearbySearch.current ||
      !restorationChecked.current ||
      restoredFromStorage.current ||
      initialSalons.length ||
      query.trim() ||
      !customerLocation.ready ||
      !origin
    )
      return;
    automaticNearbySearch.current = true;
    void runSearch("salons near me", filters, { restoreScroll: true, history: "replace" });
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
    setFilters(defaultFilters);
    setFiltersOpen(false);
    const params = new URLSearchParams(window.location.search);
    for (const key of ["radius", "rating", "max_price", "date", "sort", "offers"]) {
      params.delete(key);
    }
    window.history.pushState(
      null,
      "",
      `/salons${params.size ? `?${params.toString()}` : ""}`,
    );
    void runSearch(draftQuery || query, defaultFilters, { history: "none" });
  }

  function changeView(nextView: "list" | "map") {
    setView(nextView);
    persist(window.scrollY, nextView);
    const params = new URLSearchParams(window.location.search);
    if (nextView === "map") params.set("view", "map");
    else params.delete("view");
    window.history.pushState(null, "", `/salons${params.size ? `?${params}` : ""}`);
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
    setEmptyReason(null);
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
    setSearchWarning("");
    setError("");
    setView("list");
    setCurrentPage(1);
    setHasMore(false);
  }

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <div
        data-discovery-search-sticky
        className="sticky top-[env(safe-area-inset-top)] z-[85] -mx-3 bg-cream/95 px-3 py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12 xl:static xl:mx-0 xl:bg-transparent xl:px-0 xl:py-0"
      >
        <form onSubmit={submit}>
          <div className="flex min-h-12 items-center gap-2 rounded-[12px] border border-plum/15 bg-white p-1.5 shadow-[0_8px_24px_rgba(13,17,20,.06)]">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search salons</span>
              <input
                value={draftQuery}
                onChange={(event) => {
                  setDraftQuery(event.target.value);
                  setServiceId("");
                }}
                placeholder="Search"
                maxLength={600}
                autoComplete="off"
                enterKeyHint="search"
                className="gc-placeholder-light min-h-10 w-full min-w-0 bg-transparent px-3 text-[15px] font-semibold text-ink outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="min-h-10 shrink-0 rounded-[9px] bg-magenta px-4 text-[12px] font-bold text-white gc-disabled-control sm:px-6"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        <div
          data-discovery-sticky-controls
          className="mt-2 flex flex-wrap items-center gap-2"
        >
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
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[8px] border border-magenta bg-white px-3 text-[10px] font-bold text-magenta gc-disabled-control"
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
      </div>

      {summary ? <p role="status" aria-live="polite" className="sr-only">{`Search updated: ${salons.length} matching ${salons.length === 1 ? "salon" : "salons"}.`}</p> : null}
      {searchWarning ? (
        <div role="status" className="mt-2 rounded-[9px] border border-amber/40 bg-amber/10 px-3 py-2 text-[11px] font-semibold leading-5 text-plum">
          {searchWarning}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-2 rounded-[9px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold leading-5 gc-text-danger"
        >
          {error}
        </div>
      ) : null}

      <section id="salon-results" className="scroll-mt-36 pt-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-[24px] font-semibold leading-none text-ink sm:text-[28px]">
              {origin ? "Salons Near You" : "Salons"}
            </h1>
            <p className="mt-1 text-[11px] font-medium text-ink/65">
              Current salon profiles and booking-based reviews.
            </p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-[9px] border border-plum/15 bg-white text-[10px] font-bold">
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => changeView("list")}
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
              onClick={() => changeView("map")}
              className={`inline-flex min-h-9 items-center gap-1 px-3 ${
                view === "map" ? "bg-plum text-white" : "text-plum"
              }`}
            >
              <MapIcon aria-hidden="true" size={14} />
              Map
            </button>
          </div>
        </div>

        {loading && !salons.length ? (
          <div role="status" aria-live="polite" className="mt-3 space-y-3" aria-label="Loading salons">
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
            <EmptyState reason={emptyReason} />
          )
        ) : salons.length ? (
          <div
            className="mt-3 grid gap-3"
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
          <EmptyState reason={emptyReason} />
        )}
        {salons.length && hasMore ? (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() =>
                void runSearch(query || draftQuery, filters, {
                  append: true,
                  history: "none",
                  restoreScroll: true,
                  page: currentPage + 1,
                })
              }
              className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-teal bg-white px-6 text-[11px] font-bold text-teal transition hover:bg-teal hover:text-white gc-disabled-control"
            >
              {loadingMore ? "Loading more salons..." : "Load more salons"}
            </button>
          </div>
        ) : null}
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
                    sort: value as DiscoveryFilters["sort"],
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

function EmptyState({ reason }: { reason: SearchEmptyReason | null }) {
  const copy: Record<SearchEmptyReason, { title: string; body: string }> = {
    location_required: {
      title: "Choose a search area",
      body: "Add a city, neighborhood, or ZIP, or use your current location.",
    },
    location_unresolved: {
      title: "Check the location you entered",
      body: "We could not match that city or ZIP. Choose a supported suggestion or correct the location before searching again.",
    },
    no_salons_in_radius: {
      title: "No salons inside this distance",
      body: "Widen the distance or choose another location.",
    },
    service_unavailable_nearby: {
      title: "That service is not available nearby yet",
      body: "Try a wider distance or browse related services without changing the service you requested.",
    },
    rating_unavailable: {
      title: "No salons meet that rating nearby",
      body: "Try a wider distance or a lower minimum rating.",
    },
    budget_unavailable: {
      title: "No matching service is inside that budget",
      body: "Raise the budget, widen the distance, or check current salon offers.",
    },
    opening_unavailable: {
      title: "No matching opening on that date",
      body: "Choose another day or remove the time requirement.",
    },
    promotion_unavailable: {
      title: "No active offer matches this search",
      body: "Remove the offers-only filter or try another service.",
    },
    technical_search_failure: {
      title: "Availability could not be verified",
      body: "Nearby service matches exist, but the live calendar check did not complete. Try again; no opening has been guessed.",
    },
    no_exact_match: {
      title: "No exact marketplace match",
      body: "Try a wider distance or remove one requirement.",
    },
  };
  const message = copy[reason || "no_exact_match"];
  return (
    <div className="mt-3 rounded-[14px] border border-dashed border-plum/20 bg-white p-7 text-center">
      <h2 className="font-serif text-xl font-semibold text-plum">
        {message.title}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-[12px] leading-6 text-ink/65">
        {message.body}
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
