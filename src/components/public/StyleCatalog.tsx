"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import {
  STYLE_CATALOG_DEFAULTS,
  filterStyleCatalogItems,
  itemCatalogLengths,
  normalizeStyleCatalogText,
  parseStyleCatalogFilters,
  sameStyleCatalogFilters,
  sanitizeStyleCatalogFilters,
  styleCatalogFiltersToParams,
  type FilterableStyleCatalogItem,
  type StyleCatalogFilters,
} from "@/lib/styleCatalogCore";

export type StyleCatalogItem = FilterableStyleCatalogItem & {
  categorySlug?: string;
  styleId?: string;
  styleSlug?: string;
  image: string;
};

const STYLE_SCROLL_STATE_KEY = "girlz-culture-style-catalog-v2";
const STYLE_STATE_TTL_MS = 30 * 60_000;

type StoredScrollState = {
  savedAt: number;
  url: string;
  scrollY: number;
};

const labelCollator = new Intl.Collator("en", {
  usage: "sort",
  sensitivity: "base",
  numeric: true,
});

function uniqueSortedLabels(values: string[]) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter(
      (value, index, labels) =>
        labels.findIndex(
          (candidate) =>
            normalizeStyleCatalogText(candidate) ===
            normalizeStyleCatalogText(value),
        ) === index,
    )
    .sort(labelCollator.compare);
}

function currentRelativeUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

export default function StyleCatalog({ items }: { items: StyleCatalogItem[] }) {
  const [filters, setFilters] = useState<StyleCatalogFilters>({
    ...STYLE_CATALOG_DEFAULTS,
  });
  const scrollRestored = useRef(false);
  const chips = useMemo(
    () =>
      filterStyleCatalogItems(items, {
        ...STYLE_CATALOG_DEFAULTS,
        sort: "popularity",
      }).slice(0, 5),
    [items],
  );
  const categories = useMemo(
    () => uniqueSortedLabels(items.map((item) => item.category)),
    [items],
  );
  const lengths = useMemo(
    () => uniqueSortedLabels(items.flatMap(itemCatalogLengths)),
    [items],
  );

  const filtersFromLocation = useCallback(
    () =>
      sanitizeStyleCatalogFilters(
        parseStyleCatalogFilters(new URLSearchParams(window.location.search)),
        categories,
        lengths,
      ),
    [categories, lengths],
  );

  useEffect(() => {
    const applyLocation = () => {
      const next = filtersFromLocation();
      setFilters((current) =>
        sameStyleCatalogFilters(current, next) ? current : next,
      );
    };
    applyLocation();
    window.addEventListener("popstate", applyLocation);

    if (!scrollRestored.current) {
      scrollRestored.current = true;
      try {
        const stored = JSON.parse(
          sessionStorage.getItem(STYLE_SCROLL_STATE_KEY) || "null",
        ) as StoredScrollState | null;
        if (
          stored &&
          stored.url === currentRelativeUrl() &&
          Date.now() - Number(stored.savedAt || 0) <= STYLE_STATE_TTL_MS
        ) {
          let secondFrame = 0;
          const firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
              window.scrollTo({
                top: Number(stored.scrollY || 0),
                behavior: "auto",
              });
            });
          });
          return () => {
            window.removeEventListener("popstate", applyLocation);
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame) window.cancelAnimationFrame(secondFrame);
          };
        }
      } catch {
        // URL state remains authoritative when session storage is unavailable.
      }
    }
    return () => window.removeEventListener("popstate", applyLocation);
  }, [filtersFromLocation]);

  const persistScroll = useCallback((scrollY = window.scrollY) => {
    try {
      const state: StoredScrollState = {
        savedAt: Date.now(),
        url: currentRelativeUrl(),
        scrollY,
      };
      sessionStorage.setItem(STYLE_SCROLL_STATE_KEY, JSON.stringify(state));
    } catch {
      // Browser navigation and query parameters still preserve filter state.
    }
  }, []);

  useEffect(() => {
    const save = () => persistScroll();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [persistScroll]);

  function applyFilters(
    next: StyleCatalogFilters,
    historyMode: "push" | "replace" = "push",
  ) {
    setFilters(next);
    const params = styleCatalogFiltersToParams(
      next,
      new URLSearchParams(window.location.search),
    );
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (nextUrl === `${currentRelativeUrl()}${window.location.hash}`) return;
    window.history[historyMode === "push" ? "pushState" : "replaceState"](
      null,
      "",
      nextUrl,
    );
  }

  const filtered = useMemo(
    () => filterStyleCatalogItems(items, filters),
    [filters, items],
  );

  return (
    <div className="min-w-0 max-w-full overflow-hidden" data-style-catalog>
      <div className="min-w-0 max-w-full rounded-[14px] border border-plum/10 bg-white/85 p-3 shadow-[0_10px_32px_rgba(13,17,20,0.08)]">
        <div className="min-w-0 md:grid md:grid-cols-[1.5fr_repeat(4,0.65fr)] md:gap-2">
          <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-[10px] border border-plum/10 px-4">
            <Search size={19} className="text-plum" />
            <span className="sr-only">Search styles</span>
            <input
              value={filters.query}
              onChange={(event) =>
                applyFilters(
                  { ...filters, query: event.target.value },
                  "replace",
                )
              }
              placeholder="Search styles"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div className="mt-2 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:contents [&::-webkit-scrollbar]:hidden">
            <FilterSelect
              label="Category"
              value={filters.category}
              onChange={(category) => applyFilters({ ...filters, category })}
              options={[
                ["", "All categories"],
                ...categories.map((category) => [category, category] as const),
              ]}
            />
            <FilterSelect
              label="Length"
              value={filters.length}
              onChange={(length) => applyFilters({ ...filters, length })}
              options={[
                ["", "Any length"],
                ...lengths.map((length) => [length, length] as const),
              ]}
            />
            <FilterSelect
              label="Price"
              value={filters.price}
              onChange={(price) =>
                applyFilters({
                  ...filters,
                  price: price as StyleCatalogFilters["price"],
                })
              }
              options={[
                ["any", "Any price"],
                ["under-150", "Under $150"],
                ["150-250", "$150–$250"],
                ["over-250", "$250+"],
              ]}
            />
            <FilterSelect
              label="Sort"
              value={filters.sort}
              onChange={(sort) =>
                applyFilters({
                  ...filters,
                  sort: sort as StyleCatalogFilters["sort"],
                })
              }
              options={[
                ["popularity", "Sort: Popularity"],
                ["a-z", "Sort: A–Z"],
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-xs font-semibold text-ink">
          Available styles
        </span>
        {chips.map((chip) => {
          const active =
            normalizeStyleCatalogText(filters.query) ===
            normalizeStyleCatalogText(chip.name);
          return (
            <button
              key={chip.styleId || `${chip.category}:${chip.name}`}
              type="button"
              aria-pressed={active}
              onClick={() => applyFilters({ ...filters, query: chip.name })}
              className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                active
                  ? "border-magenta bg-magenta text-white"
                  : "border-plum/10 bg-white/75 text-ink/75 hover:border-magenta/40"
              }`}
            >
              {chip.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => applyFilters({ ...STYLE_CATALOG_DEFAULTS })}
          className="ml-auto shrink-0 text-xs font-bold text-magenta"
        >
          View all
        </button>
      </div>

      <div className="mt-3 grid min-w-0 max-w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {filtered.map((item) => (
          <Link
            data-style-card
            onClick={() => persistScroll()}
            key={
              item.styleId ||
              `${item.categorySlug || item.category}-${item.name}`
            }
            href={`/salons?style=${encodeURIComponent(item.name)}&style_slug=${encodeURIComponent(item.styleSlug || normalizeStyleCatalogText(item.name).replace(/ /g, "-"))}${item.styleId ? `&style_id=${encodeURIComponent(item.styleId)}` : ""}&category=${encodeURIComponent(item.categorySlug || item.category)}`}
            className="group min-w-0 overflow-hidden rounded-[12px] border border-plum/10 bg-blush/45 shadow-[0_6px_22px_rgba(13,17,20,0.06)] transition hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(13,17,20,0.12)]"
          >
            {item.image ? (
              <div className="aspect-[1.55/1] overflow-hidden bg-cream sm:aspect-[1.65/1]">
                <SafeImage
                  src={item.image}
                  fallbackSrc={item.image}
                  alt={`${item.name} hairstyle`}
                  rendition="thumbnail"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                />
              </div>
            ) : null}
            <div className="px-3 py-3 sm:px-4">
              <h2 className="break-words font-serif text-[15px] font-semibold leading-tight text-ink sm:text-[18px]">
                {item.name}
              </h2>
              <p className="mt-1 text-[10px] font-semibold text-magenta sm:text-xs">
                {item.count} {item.count === 1 ? "salon" : "salons"}
              </p>
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length ? (
        <div className="mt-6 rounded-[14px] border border-dashed border-plum/20 bg-white/65 p-8 text-center text-sm text-ink/65">
          No styles match those filters. Try clearing one.
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
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <label className="relative w-[138px] min-w-[138px] max-w-full shrink-0 overflow-hidden md:w-auto md:min-w-0 md:overflow-visible">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 min-w-0 w-full max-w-full rounded-[10px] border border-plum/10 bg-white px-3 text-xs font-medium text-ink outline-none"
      >
        {options.map(([option, text]) => (
          <option key={option || `${label}-default`} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
