/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { US_STATES } from "@/lib/usStates";
import { LocationAutocomplete } from "@/components/search/AutocompleteInputs";
import type { CustomerLocation } from "@/lib/location";

type Row = Record<string, any>;
type Summary = {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  offboarded: number;
  address_needs_review: number;
};
type Market = {
  id: string;
  state_code: string;
  name: string;
  market_type: string;
  center_latitude: number;
  center_longitude: number;
};
const emptySummary: Summary = {
  total: 0,
  active: 0,
  pending: 0,
  suspended: 0,
  offboarded: 0,
  address_needs_review: 0,
};

async function authHeaders(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session has expired.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function AdminSalonsManager() {
  const [salons, setSalons] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [market, setMarket] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [rating, setRating] = useState("");
  const [addressReview, setAddressReview] = useState("");
  const [setup, setSetup] = useState("");
  const [subscriptionEligibility, setSubscriptionEligibility] = useState("");
  const [discoverability, setDiscoverability] = useState("");
  const [radius, setRadius] = useState("");
  const [centerText, setCenterText] = useState("");
  const [center, setCenter] = useState<CustomerLocation | null>(null);
  const [sort, setSort] = useState("name");
  const [direction, setDirection] = useState("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [urlHydrated, setUrlHydrated] = useState(false);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const stateMarkets = useMemo(
    () => markets.filter((row) => !state || row.state_code === state),
    [markets, state],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const nextPage = Number(params.get("page") || 1);
      const nextPageSize = Number(params.get("page_size") || 25);
      const lat = Number(params.get("lat"));
      const lng = Number(params.get("lng"));
      const centerLabel = params.get("center") || "";
      setPage(Number.isInteger(nextPage) && nextPage > 0 ? nextPage : 1);
      setPageSize(
        [10, 25, 50, 100].includes(nextPageSize) ? nextPageSize : 25,
      );
      setQ(params.get("q") || "");
      setState(params.get("state") || "");
      setMarket(params.get("market") || "");
      setStatus(params.get("status") || "");
      setPlan(params.get("plan") || "");
      setRating(params.get("rating") || "");
      setAddressReview(params.get("address_review") || "");
      setSetup(params.get("setup") || "");
      setSubscriptionEligibility(
        params.get("subscription_eligibility") || "",
      );
      setDiscoverability(params.get("discoverability") || "");
      setRadius(params.get("radius") || "");
      setSort(params.get("sort") || "name");
      setDirection(params.get("direction") || "asc");
      if (centerLabel && Number.isFinite(lat) && Number.isFinite(lng)) {
        setCenterText(centerLabel);
        setCenter({ label: centerLabel, lat, lng, source: "saved" });
      }
      setUrlHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function load() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    setSalons([]);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort,
        direction,
      });
      if (q) params.set("q", q);
      if (state) params.set("state", state);
      if (market) params.set("market", market);
      if (status) params.set("status", status);
      if (plan) params.set("plan", plan);
      if (rating) params.set("rating", rating);
      if (addressReview) params.set("address_review", addressReview);
      if (setup) params.set("setup", setup);
      if (subscriptionEligibility)
        params.set("subscription_eligibility", subscriptionEligibility);
      if (discoverability)
        params.set("discoverability", discoverability);
      if (radius && center) {
        params.set("radius", radius);
        params.set("lat", String(center.lat));
        params.set("lng", String(center.lng));
        params.set("center", center.label || centerText);
      }
      const response = await fetch(`/api/admin/salons?${params}`, {
        headers: await authHeaders(),
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load salons.");
      if (sequence !== requestSequence.current) return;
      setSalons(Array.isArray(body.salons) ? body.salons : []);
      setTotal(Number(body.total || 0));
      setSummary(body.summary || emptySummary);
      setMarkets(Array.isArray(body.markets) ? body.markets : []);
      window.history.replaceState(null, "", `/admin/salons?${params}`);
    } catch (loadError) {
      if (controller.signal.aborted || sequence !== requestSequence.current)
        return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load salons.",
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!urlHydrated) return;
    const timer = window.setTimeout(() => void load(), q ? 280 : 0);
    return () => window.clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    addressReview,
    center?.lat,
    center?.lng,
    direction,
    market,
    page,
    pageSize,
    plan,
    q,
    radius,
    rating,
    setup,
    sort,
    state,
    status,
    subscriptionEligibility,
    discoverability,
    urlHydrated,
  ]);

  function clear() {
    setQ("");
    setState("");
    setMarket("");
    setStatus("");
    setPlan("");
    setRating("");
    setAddressReview("");
    setSetup("");
    setSubscriptionEligibility("");
    setDiscoverability("");
    setRadius("");
    setCenterText("");
    setCenter(null);
    setSort("name");
    setDirection("asc");
    setPage(1);
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilterChips = [
    q ? { key: "q", label: `Search: ${q}`, clear: () => setQ("") } : null,
    state
      ? { key: "state", label: `State: ${state}`, clear: () => setState("") }
      : null,
    market
      ? {
          key: "market",
          label: `Market: ${markets.find((row) => row.id === market)?.name || "Selected"}`,
          clear: () => setMarket(""),
        }
      : null,
    status
      ? { key: "status", label: `Status: ${status}`, clear: () => setStatus("") }
      : null,
    plan
      ? { key: "plan", label: `Plan: ${plan}`, clear: () => setPlan("") }
      : null,
    rating
      ? { key: "rating", label: `Rating: ${rating}+`, clear: () => setRating("") }
      : null,
    addressReview
      ? {
          key: "address",
          label: addressReview === "true" ? "Address needs review" : "Coordinates verified",
          clear: () => setAddressReview(""),
        }
      : null,
    setup
      ? {
          key: "setup",
          label: setup === "complete" ? "Setup complete" : "Setup incomplete",
          clear: () => setSetup(""),
        }
      : null,
    subscriptionEligibility
      ? {
          key: "subscription",
          label:
            subscriptionEligibility === "eligible"
              ? "Subscription eligible"
              : "Subscription ineligible",
          clear: () => setSubscriptionEligibility(""),
        }
      : null,
    discoverability
      ? {
          key: "discoverability",
          label: discoverability === "true" ? "Discoverable" : "Hidden",
          clear: () => setDiscoverability(""),
        }
      : null,
    radius && center
      ? {
          key: "radius",
          label: `Within ${radius} mi of ${center.label}`,
          clear: () => {
            setRadius("");
            setCenter(null);
            setCenterText("");
          },
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;
  return (
    <div className="space-y-5">
      <section
        aria-label="Salon totals"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        {[
          ["Total", summary.total],
          ["Active", summary.active],
          ["Pending", summary.pending],
          ["Suspended", summary.suspended],
          ["Offboarded", summary.offboarded],
          ["Address Needs Review", summary.address_needs_review],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-[13px] border border-plum/10 bg-white p-4"
          >
            <p className="text-[10px] font-semibold text-ink/60">{label}</p>
            <b className="mt-2 block font-serif text-2xl text-plum">{value}</b>
            <span className="text-[9px] text-ink/50">All salon records</span>
          </article>
        ))}
      </section>
      <section className="rounded-[15px] border border-plum/10 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative sm:col-span-2">
            <span className="sr-only">Search salons</span>
            <Search className="absolute left-3 top-3.5 text-ink/45" size={16} />
            <input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              placeholder="Name, owner/contact, ID, city, state, ZIP, market or borough"
              className="min-h-11 w-full rounded-[9px] border border-plum/15 pl-10 pr-3 text-xs"
            />
          </label>
          <Filter
            label="State"
            value={state}
            onChange={(value) => {
              setState(value);
              setMarket("");
              setPage(1);
            }}
          >
            <option value="">All states</option>
            {US_STATES.map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </Filter>
          <Filter
            label="Market"
            value={market}
            onChange={(value) => {
              setMarket(value);
              setPage(1);
            }}
          >
            <option value="">All markets</option>
            {stateMarkets.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </Filter>
          <Filter
            label="Status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "New",
              "Pending",
              "Approved",
              "Ready for Activation",
              "Active",
              "Needs Attention",
              "Suspended",
              "Offboarded",
            ].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </Filter>
          <Filter
            label="Plan"
            value={plan}
            onChange={(value) => {
              setPlan(value);
              setPage(1);
            }}
          >
            <option value="">All plans</option>
            {["Basic", "Growth", "Premium"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Filter>
          <Filter
            label="Rating"
            value={rating}
            onChange={(value) => {
              setRating(value);
              setPage(1);
            }}
          >
            <option value="">Any rating</option>
            <option value="4">4.0+</option>
            <option value="4.5">4.5+</option>
            <option value="4.8">4.8+</option>
          </Filter>
          <Filter
            label="Address review"
            value={addressReview}
            onChange={(value) => {
              setAddressReview(value);
              setPage(1);
            }}
          >
            <option value="">Any address state</option>
            <option value="true">Needs review</option>
            <option value="false">Verified coordinates</option>
          </Filter>
          <Filter
            label="Setup completion"
            value={setup}
            onChange={(value) => {
              setSetup(value);
              setPage(1);
            }}
          >
            <option value="">Any setup state</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
          </Filter>
          <Filter
            label="Subscription eligibility"
            value={subscriptionEligibility}
            onChange={(value) => {
              setSubscriptionEligibility(value);
              setPage(1);
            }}
          >
            <option value="">Any subscription state</option>
            <option value="eligible">Eligible</option>
            <option value="ineligible">Ineligible</option>
          </Filter>
          <Filter
            label="Public visibility"
            value={discoverability}
            onChange={(value) => {
              setDiscoverability(value);
              setPage(1);
            }}
          >
            <option value="">Any visibility</option>
            <option value="true">Discoverable</option>
            <option value="false">Hidden</option>
          </Filter>
          <div className="sm:col-span-2 xl:col-span-3">
            <span className="mb-1 block text-[10px] font-bold">
              Radius center
            </span>
            <LocationAutocomplete
              value={centerText}
              onChange={(value) => {
                setCenterText(value);
                setCenter(null);
              }}
              onResolved={setCenter}
              placeholder="Choose a city, market, or address"
              className="rounded-[9px] border border-plum/15 px-3"
            />
          </div>
          <Filter
            label="Radius"
            value={radius}
            onChange={(value) => {
              setRadius(value);
              setPage(1);
            }}
          >
            <option value="">No radius</option>
            {[5, 10, 25, 50].map((value) => (
              <option key={value} value={value}>
                {value} miles
              </option>
            ))}
            <option value="100">100 miles</option>
          </Filter>
          <Filter
            label="Sort"
            value={`${sort}:${direction}`}
            onChange={(value) => {
              const [field, nextDirection] = value.split(":");
              setSort(field);
              setDirection(nextDirection);
              setPage(1);
            }}
          >
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="rating:desc">Rating high–low</option>
            <option value="reviews:desc">Most reviews</option>
            <option value="status:asc">Status</option>
            {center ? (
              <option value="distance:asc">Nearest center</option>
            ) : null}
          </Filter>
          <button
            type="button"
            onClick={clear}
            className="min-h-11 rounded-[9px] border border-magenta text-xs font-bold text-magenta"
          >
            Clear filters
          </button>
        </div>
        {activeFilterChips.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink/50">
              Active filters
            </span>
            {activeFilterChips.map((chip) => (
              <button
                type="button"
                key={chip.key}
                onClick={() => {
                  chip.clear();
                  setPage(1);
                }}
                className="inline-flex min-h-9 items-center gap-1 rounded-full bg-blush/65 px-3 text-[10px] font-bold text-plum"
                aria-label={`Remove ${chip.label} filter`}
              >
                {chip.label} <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        {radius && !center ? (
          <p
            role="alert"
            className="mt-3 flex items-center gap-2 text-xs text-red-700"
          >
            <AlertTriangle size={15} />
            Choose a radius center before distance filtering can run.
          </p>
        ) : null}
      </section>
      {error ? (
        <div
          role="alert"
          className="rounded-[14px] border border-red-200 bg-white p-6 text-center"
        >
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-magenta px-4 py-2 text-xs font-bold text-white"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      ) : null}
      <section className="overflow-hidden rounded-[15px] border border-plum/10 bg-white">
        <div className="flex items-center justify-between border-b border-plum/10 p-4">
          <div>
            <h2 className="font-serif text-xl text-plum">Salon operations</h2>
            <p className="text-[10px] text-ink/55">
              {loading ? "Loading…" : `${total} matching records`}
            </p>
          </div>
          <Link
            href="/admin/submissions"
            className="text-xs font-bold text-magenta"
          >
            View applications
          </Link>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-cream/65">
              <tr>
                {[
                  "Salon",
                  "State / Market",
                  "Status",
                  "Plan tier",
                  "Setup / visibility",
                  "Rating",
                  "Reviews",
                  "Actions",
                ].map((header) => (
                  <th className="whitespace-nowrap px-4 py-3" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: Math.min(pageSize, 8) }, (_, index) => (
                    <tr
                      key={`skeleton-${index}`}
                      className="border-t border-plum/10"
                      aria-hidden="true"
                    >
                      {Array.from({ length: 8 }, (__, cell) => (
                        <td key={cell} className="px-4 py-4">
                          <span className="block h-4 animate-pulse rounded bg-blush/70" />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {salons.map((salon) => (
                <tr
                  key={salon.id}
                  className="border-t border-plum/10 hover:bg-blush/15"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          salon.logo_url ||
                          salon.cover_photo_url ||
                          "/images/salon-warm.jpg"
                        }
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                      <span>
                        <b>{salon.name || "Unnamed salon"}</b>
                        <small className="block text-[9px] text-ink/45">
                          {String(salon.id).slice(0, 8)}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {[
                      salon.address_state,
                      salon.market_name || salon.borough || salon.address_city,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Not normalized"}
                    {salon.distance_miles !== null ? (
                      <small className="block text-ink/50">
                        {Number(salon.distance_miles).toFixed(1)} mi from center
                      </small>
                    ) : null}
                    {salon.address_needs_review ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-amber-800">
                        <AlertTriangle size={11} />
                        Needs review
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={salon.status} />
                  </td>
                  <td className="px-4 py-3">
                    {salon.subscription_tier || "Not selected"}
                    <small className="block text-[9px] text-ink/50">
                      {salon.subscription_status || "inactive"}
                    </small>
                  </td>
                  <td className="px-4 py-3">
                    <b>
                      {salon.setup_complete
                        ? "Complete"
                        : `${salon.onboarding_progress || 0}%`}
                    </b>
                    <small className="block text-[9px] text-ink/50">
                      {salon.is_discoverable ? "Discoverable" : "Hidden"}
                    </small>
                  </td>
                  <td className="px-4 py-3">
                    {salon.review_count > 0
                      ? Number(salon.rating_overall).toFixed(1)
                      : "New"}
                  </td>
                  <td className="px-4 py-3">{salon.review_count || 0}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedId(salon.id)}
                      className="rounded-lg border border-magenta px-3 py-2 font-bold text-magenta"
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
              {!salons.length && !loading ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-ink/55">
                    No salon records match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-plum/10 md:hidden">
          {loading
            ? Array.from({ length: 4 }, (_, index) => (
                <article
                  key={`mobile-skeleton-${index}`}
                  className="space-y-3 p-4"
                  aria-hidden="true"
                >
                  <span className="block h-12 animate-pulse rounded-lg bg-blush/70" />
                  <span className="block h-10 animate-pulse rounded-lg bg-blush/50" />
                </article>
              ))
            : null}
          {salons.map((salon) => (
            <article key={salon.id} className="p-4">
              <div className="flex items-center gap-3">
                <img
                  src={
                    salon.logo_url ||
                    salon.cover_photo_url ||
                    "/images/salon-warm.jpg"
                  }
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <div>
                  <h3 className="font-serif text-lg text-plum">{salon.name}</h3>
                  <p className="text-[10px] text-ink/55">
                    {[
                      salon.address_state,
                      salon.market_name || salon.address_city,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <StatusBadge value={salon.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
                <span>
                  Plan
                  <br />
                  <b>{salon.subscription_tier || "—"}</b>
                </span>
                <span>
                  Rating
                  <br />
                  <b>
                    {salon.review_count
                      ? Number(salon.rating_overall).toFixed(1)
                      : "New"}
                  </b>
                </span>
                <span>
                  Reviews
                  <br />
                  <b>{salon.review_count || 0}</b>
                </span>
                <span>
                  Setup / public
                  <br />
                  <b>
                    {salon.setup_complete
                      ? "Complete"
                      : `${salon.onboarding_progress || 0}%`} {" "}
                    · {salon.is_discoverable ? "Live" : "Hidden"}
                  </b>
                </span>
              </div>
              <button
                onClick={() => setSelectedId(salon.id)}
                className="mt-3 min-h-11 w-full rounded-lg border border-magenta font-bold text-magenta"
              >
                View details
              </button>
            </article>
          ))}
          {!salons.length && !loading ? (
            <p className="p-10 text-center text-sm text-ink/55">
              No salon records match these filters.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-plum/10 p-4">
          <label className="text-[10px]">
            Rows{" "}
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="ml-2 rounded border px-2 py-1"
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="grid min-h-10 min-w-10 place-items-center rounded border disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs">
              Page {page} of {pages}
            </span>
            <button
              disabled={loading || page >= pages}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
              className="grid min-h-10 min-w-10 place-items-center rounded border disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {selectedId ? (
        <SalonDetail
          salonId={selectedId}
          close={() => setSelectedId("")}
          refreshed={load}
        />
      ) : null}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-bold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-[9px] border border-plum/15 bg-white px-3 text-xs"
      >
        {children}
      </select>
    </label>
  );
}
function StatusBadge({ value }: { value: string }) {
  const status = String(value || "Pending");
  const classes = /active/i.test(status)
    ? "bg-emerald-50 text-emerald-800"
    : /suspend|offboard/i.test(status)
      ? "bg-red-50 text-red-700"
      : "bg-amber/15 text-amber-800";
  return (
    <span
      className={`ml-auto inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold ${classes}`}
    >
      {status}
    </span>
  );
}

function SalonDetail({
  salonId,
  close,
  refreshed,
}: {
  salonId: string;
  close: () => void;
  refreshed: () => Promise<void>;
}) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [vanitySlug, setVanitySlug] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  async function load() {
    setError("");
    try {
      const response = await fetch(`/api/admin/salons/${salonId}`, {
        headers: await authHeaders(),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to load salon details.");
      setData(body);
      setVanitySlug(
        body.vanity_request?.approved_slug ||
          body.vanity_request?.requested_slug ||
          body.salon?.vanity_slug ||
          "",
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load salon details.",
      );
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(root?.querySelectorAll<HTMLElement>(selector) || []);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [close]);
  async function statusAction(nextStatus: string) {
    const current = String(data?.salon?.status || "");
    const impacts: Record<string, string> = {
      Pending:
        "The salon will be hidden from search and public booking while the owner may continue setup.",
      Approved:
        "The owner can subscribe and finish setup, but the salon remains hidden until every marketplace gate passes.",
      Active:
        "The salon will become public only if every required marketplace gate passes.",
      Suspended:
        "The salon will be hidden and booking disabled; the owner keeps dashboard access with a suspension notice.",
      Offboarded:
        "The salon will be removed from the marketplace and dashboard access will be restricted. Existing bookings will not be deleted.",
    };
    if (
      !window.confirm(
        `Change ${data?.salon?.name} from ${current} to ${nextStatus}?\n\n${impacts[nextStatus]}`,
      )
    )
      return;
    let reason = "";
    if (["Suspended", "Offboarded"].includes(nextStatus)) {
      reason = window.prompt("Internal reason (required):")?.trim() || "";
      if (reason.length < 5) {
        setError("Enter an internal reason of at least 5 characters.");
        return;
      }
    }
    setBusy(nextStatus);
    try {
      const response = await fetch(`/api/admin/salons/${salonId}`, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ action: "status", status: nextStatus, reason }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to update status.");
      await load();
      await refreshed();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update status.",
      );
    } finally {
      setBusy("");
    }
  }
  async function retryGeocode() {
    setBusy("geocode");
    setError("");
    try {
      const response = await fetch(`/api/admin/salons/${salonId}`, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ action: "geocode" }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to verify address.");
      await load();
      await refreshed();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to verify address.",
      );
    } finally {
      setBusy("");
    }
  }
  async function reconcileLifecycle() {
    setBusy("reconcile");
    setError("");
    try {
      const response = await fetch(`/api/admin/salons/${salonId}`, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ action: "reconcile" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to reconcile salon eligibility.");
      await load();
      await refreshed();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to reconcile salon eligibility.");
    } finally {
      setBusy("");
    }
  }
  async function reviewVanity(decision: "approve" | "reject") {
    const request = data?.vanity_request;
    if (!request?.id) {
      setError("There is no vanity URL request to review.");
      return;
    }
    const note =
      decision === "reject"
        ? window.prompt("Optional review note for the salon owner:")?.trim() || ""
        : "";
    if (
      decision === "approve" &&
      !window.confirm(
        `Approve girlzculture.com/${vanitySlug || request.requested_slug} for ${data?.salon?.name}?`,
      )
    )
      return;
    setBusy(`vanity-${decision}`);
    setError("");
    try {
      const response = await fetch(`/api/admin/salons/${salonId}`, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({
          action: "vanity",
          request_id: request.id,
          decision,
          approved_slug: vanitySlug || request.requested_slug,
          note,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to review this public URL.");
      await load();
      await refreshed();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to review this public URL.",
      );
    } finally {
      setBusy("");
    }
  }
  const salon = data?.salon;
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="salon-detail-title"
      className="fixed inset-0 z-[80] bg-ink/45 p-3 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section className="ml-auto h-full w-full max-w-2xl overflow-y-auto rounded-[18px] bg-cream shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-plum/10 bg-white p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-magenta">
              Salon operations
            </p>
            <h2 id="salon-detail-title" className="font-serif text-2xl text-plum">
              {salon?.name || "Loading salon…"}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close salon details"
            className="grid min-h-11 min-w-11 place-items-center rounded-full hover:bg-blush"
          >
            <X />
          </button>
        </header>
        <div className="space-y-4 p-5">
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}
          {salon ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2">
                <Detail label="Status" value={salon.status} />
                <Detail
                  label="Public profile"
                  value={salon.is_discoverable ? "Discoverable" : "Hidden"}
                />
                <Detail
                  label="Plan / subscription"
                  value={`${salon.subscription_tier || "—"} · ${salon.subscription_status || "—"}`}
                />
                <Detail
                  label="Rating"
                  value={
                    salon.review_count
                      ? `${Number(salon.rating_overall).toFixed(1)} from ${salon.review_count} reviews`
                      : "New · 0 reviews"
                  }
                />
              </section>
              {data.lifecycle ? (
                <section className="rounded-[13px] border border-plum/10 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-xl text-plum">Public visibility diagnostic</h3>
                      <p className="mt-1 text-xs leading-5 text-ink/60">
                        {data.lifecycle.is_discoverable
                          ? "This salon passes every required gate and is public."
                          : "This salon is hidden until every required gate below passes and its lifecycle permits activation."}
                      </p>
                    </div>
                    <b className="rounded-full bg-blush px-3 py-1 text-xs text-plum">
                      {Number(data.lifecycle.progress || 0)}%
                    </b>
                  </div>
                  <div className="mt-4 space-y-2">
                    {Object.entries((data.lifecycle.checks || {}) as Record<string, Row>)
                      .filter(([, check]) => check.required === true)
                      .map(([key, check]) => (
                        <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-cream/70 px-3 py-2 text-xs">
                          <span>{check.label || key}</span>
                          <b className={check.passed ? "text-emerald-700" : "text-red-700"}>
                            {check.passed ? "Passed" : "Missing"}
                          </b>
                        </div>
                      ))}
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-ink/50">
                    Approval: {String(data.lifecycle.status || salon.status)} · Subscription: {String(data.lifecycle.subscription_status || "inactive")} · Auto-activation: {data.lifecycle.auto_activation ? "on" : "off"}
                  </p>
                  <p className="mt-2 text-[10px] leading-4 text-ink/60">Setup: {String(data.lifecycle.setup_state || "Unknown")} · Address: {String(data.lifecycle.address_state || "Unknown")} · Publication: {String(data.lifecycle.publication_state || (data.lifecycle.is_discoverable ? "Published" : "Hidden"))}</p>
                  <button type="button" disabled={Boolean(busy)} onClick={()=>void reconcileLifecycle()} className="mt-4 min-h-10 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">{busy==="reconcile"?"Rechecking…":"Recheck lifecycle eligibility"}</button>
                </section>
              ) : null}
              <section className="rounded-[13px] border border-plum/10 bg-white p-4">
                <h3 className="font-serif text-xl text-plum">
                  Business & address
                </h3>
                <p className="mt-2 text-sm">
                  {salon.formatted_address ||
                    [
                      salon.address_street,
                      salon.address_line2,
                      salon.address_city,
                      salon.address_state,
                      salon.address_zip,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs text-ink/60">
                  <MapPin size={14} />
                  {salon.market?.name ||
                    salon.borough ||
                    "Market not assigned"}{" "}
                  · {salon.geocode_status || "pending"}
                </p>
                {salon.geocode_failure_reason ? (
                  <p className="mt-2 rounded-lg bg-[#fff8e8] p-3 text-xs text-amber-900">
                    Internal review note: {salon.geocode_failure_reason}
                  </p>
                ) : null}
                <button
                  disabled={busy === "geocode"}
                  onClick={() => void retryGeocode()}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta disabled:opacity-50"
                >
                  <LocateFixed size={14} />
                  {busy === "geocode" ? "Verifying…" : "Retry geocoding"}
                </button>
              </section>
              <section className="rounded-[13px] border border-plum/10 bg-white p-4">
                <h3 className="font-serif text-xl text-plum">Status actions</h3>
                <p className="mt-1 text-xs leading-5 text-ink/60">
                  {data.future_booking_count || 0} future bookings will remain
                  in place. Review affected appointments separately before
                  contacting customers.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Pending", "Approved", "Active", "Suspended", "Offboarded"]
                    .filter((value) => value !== salon.status)
                    .map((value) => (
                      <button
                        disabled={Boolean(busy) || (value === "Active" && data.lifecycle?.all_required_complete !== true)}
                        onClick={() => void statusAction(value)}
                        key={value}
                        className={`min-h-10 rounded-lg px-4 text-xs font-bold disabled:opacity-40 ${["Suspended", "Offboarded"].includes(value) ? "border border-red-400 text-red-700" : "bg-plum text-white"}`}
                      >
                        Set {value}
                      </button>
                    ))}
                </div>
              </section>
              <section className="rounded-[13px] border border-plum/10 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl text-plum">
                      Public URL & social profiles
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-ink/60">
                      Root-level links publish only after review. Previous
                      approved links remain permanent redirects.
                    </p>
                  </div>
                  {salon.vanity_slug ? (
                    <Link
                      href={`/${salon.vanity_slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-bold text-magenta"
                    >
                      /{salon.vanity_slug} <ExternalLink size={13} />
                    </Link>
                  ) : null}
                </div>
                {data.vanity_request ? (
                  <div className="mt-4 rounded-xl bg-cream p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span>
                        Requested: <b>/{data.vanity_request.requested_slug}</b>
                      </span>
                      <StatusBadge value={data.vanity_request.status} />
                    </div>
                    <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-ink/55">
                      Approved slug
                      <input
                        value={vanitySlug}
                        onChange={(event) => setVanitySlug(event.target.value)}
                        disabled={data.vanity_request.status !== "Pending"}
                        className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 bg-white px-3 text-sm font-normal lowercase disabled:bg-cream"
                      />
                    </label>
                    <div className="mt-3 grid gap-2 text-xs text-ink/65">
                      {data.vanity_request.instagram_url ? (
                        <a
                          href={data.vanity_request.instagram_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-magenta"
                        >
                          Instagram: {data.vanity_request.instagram_url}
                        </a>
                      ) : null}
                      {data.vanity_request.tiktok_url ? (
                        <a
                          href={data.vanity_request.tiktok_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-magenta"
                        >
                          TikTok: {data.vanity_request.tiktok_url}
                        </a>
                      ) : null}
                      {data.vanity_request.google_business_url ? (
                        <a
                          href={data.vanity_request.google_business_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-magenta"
                        >
                          Google Business:{" "}
                          {data.vanity_request.google_business_url}
                        </a>
                      ) : null}
                    </div>
                    {data.vanity_request.status === "Pending" ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void reviewVanity("approve")}
                          className="min-h-10 rounded-lg bg-magenta px-4 text-xs font-bold text-white disabled:opacity-45"
                        >
                          {busy === "vanity-approve"
                            ? "Approving…"
                            : "Approve public URL"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() => void reviewVanity("reject")}
                          className="min-h-10 rounded-lg border border-red-400 px-4 text-xs font-bold text-red-700 disabled:opacity-45"
                        >
                          {busy === "vanity-reject" ? "Rejecting…" : "Reject"}
                        </button>
                      </div>
                    ) : data.vanity_request.review_note ? (
                      <p className="mt-3 text-xs text-ink/60">
                        Review note: {data.vanity_request.review_note}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg bg-cream p-3 text-xs text-ink/55">
                    No salon-owner vanity URL request has been submitted.
                  </p>
                )}
                {Array.isArray(data.vanity_history) &&
                data.vanity_history.length ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink/50">
                      URL history
                    </p>
                    {data.vanity_history.slice(0, 5).map((entry: Row) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap justify-between gap-2 border-l-2 border-magenta pl-3 text-xs"
                      >
                        <span>
                          <b>{entry.action}</b>
                          {entry.previous_slug
                            ? ` /${entry.previous_slug}`
                            : ""}
                          {entry.resulting_slug
                            ? ` → /${entry.resulting_slug}`
                            : ""}
                        </span>
                        <span className="text-ink/45">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
              <section className="rounded-[13px] border border-plum/10 bg-white p-4">
                <h3 className="font-serif text-xl text-plum">References</h3>
                <div className="mt-3 flex flex-wrap gap-3">
                  {salon.slug ? (
                    <Link
                      href={`/salon/${salon.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs font-bold text-magenta"
                    >
                      Public page <ExternalLink size={13} />
                    </Link>
                  ) : null}
                  {data.application?.id ? (
                    <Link
                      href={`/admin/submissions/${data.application.id}`}
                      className="text-xs font-bold text-magenta"
                    >
                      Verification application
                    </Link>
                  ) : null}
                  <Link
                    href={`/admin/finance?salon=${salon.id}`}
                    className="text-xs font-bold text-magenta"
                  >
                    Financial records
                  </Link>
                </div>
              </section>
              <section className="rounded-[13px] border border-plum/10 bg-white p-4">
                <h3 className="font-serif text-xl text-plum">Status history</h3>
                <div className="mt-3 space-y-3">
                  {(data.status_history || []).map((entry: Row) => (
                    <article
                      key={entry.id}
                      className="border-l-2 border-magenta pl-3 text-xs"
                    >
                      <b>
                        {entry.previous_status} → {entry.new_status}
                      </b>
                      <p className="mt-1 text-ink/60">
                        {entry.reason || "No reason required"} ·{" "}
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </article>
                  ))}
                  {!data.status_history?.length ? (
                    <p className="text-xs text-ink/55">
                      No status changes recorded yet.
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          ) : (
            <p>Loading details…</p>
          )}
        </div>
      </section>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-plum/10 bg-white p-4">
      <p className="text-[10px] font-bold text-ink/55">{label}</p>
      <b className="mt-1 block text-sm text-plum">{value}</b>
    </div>
  );
}
