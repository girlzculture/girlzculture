import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STYLE_CATALOG_DEFAULTS,
  filterStyleCatalogItems,
  normalizeStyleCatalogText,
  parseStyleCatalogFilters,
  sanitizeStyleCatalogFilters,
  styleCatalogFiltersToParams,
  styleMatchesCatalogQuery,
} from "../src/lib/styleCatalogCore.ts";

const items = [
  {
    name: "Boho / Goddess Braids",
    category: "African & Afro-Textured",
    count: 17,
    price: 250,
    lengths: ["Shoulder", "Mid-back", "Waist"],
    searchTerms: ["Bohemian braids", "Boho godess brads"],
  },
  {
    name: "Box Braids",
    category: "African & Afro-Textured",
    count: 16,
    price: 150,
    lengths: ["Shoulder", "Mid back"],
    searchTerms: ["Box braid"],
  },
  {
    name: "Silk Press",
    category: "Natural Hair",
    count: 40,
    price: 149.99,
    lengths: ["Shoulder"],
    searchTerms: ["Silk-press"],
  },
  {
    name: "Zoë Twists",
    category: "Twists",
    count: 3,
    price: 250.01,
    lengths: ["Waist"],
    searchTerms: ["Zoe twist"],
  },
  {
    name: "Unknown Price Locs",
    category: "Locs",
    count: 8,
    price: undefined,
    lengths: ["Shoulder"],
  },
];

const defaults = { ...STYLE_CATALOG_DEFAULTS };

assert.equal(
  normalizeStyleCatalogText("  Boho / GODDÉSS—Braids  "),
  "boho goddess braids",
  "punctuation, spacing, case and accents must normalize consistently",
);
assert.equal(
  styleMatchesCatalogQuery(items[0], "bohemian braids"),
  true,
  "approved aliases must match",
);
assert.equal(
  styleMatchesCatalogQuery(items[0], "boho godess brads"),
  true,
  "approved misspellings must match",
);
assert.equal(
  styleMatchesCatalogQuery(items[1], "silk press"),
  false,
  "unrelated services must not match",
);

const filter = (overrides) =>
  filterStyleCatalogItems(items, { ...defaults, ...overrides }).map(
    (item) => item.name,
  );

assert.deepEqual(
  filter({ length: "mid-back" }),
  ["Boho / Goddess Braids", "Box Braids"],
  "length must match any option and normalize equivalent punctuation",
);
assert.deepEqual(
  filter({ category: "natural hair" }),
  ["Silk Press"],
  "category matching must be normalized and exact",
);
assert.deepEqual(
  filter({ price: "under-150" }),
  ["Silk Press"],
  "under-$150 must exclude the $150 boundary and unknown prices",
);
assert.deepEqual(
  filter({ price: "150-250" }),
  ["Boho / Goddess Braids", "Box Braids"],
  "$150-$250 must include both boundaries",
);
assert.deepEqual(
  filter({ price: "over-250" }),
  ["Zoë Twists"],
  "$250+ must mean greater than $250 and exclude unknown prices",
);
assert.deepEqual(
  filter({
    query: "bohemian braids",
    category: "African & Afro-Textured",
    length: "Waist",
    price: "150-250",
  }),
  ["Boho / Goddess Braids"],
  "combined customer filters must use AND semantics",
);
assert.deepEqual(
  filter({ sort: "popularity" }),
  [
    "Silk Press",
    "Boho / Goddess Braids",
    "Box Braids",
    "Unknown Price Locs",
    "Zoë Twists",
  ],
  "popularity must use genuine salon count",
);
assert.deepEqual(
  filter({ sort: "a-z" }),
  [
    "Boho / Goddess Braids",
    "Box Braids",
    "Silk Press",
    "Unknown Price Locs",
    "Zoë Twists",
  ],
  "A-Z must use normalized style names",
);

const parsed = parseStyleCatalogFilters(
  new URLSearchParams(
    "q=boho&category=African+%26+Afro-Textured&length=mid-back&price=150-250&sort=a-z",
  ),
);
assert.deepEqual(parsed, {
  query: "boho",
  category: "African & Afro-Textured",
  length: "mid-back",
  price: "150-250",
  sort: "a-z",
});
assert.deepEqual(
  sanitizeStyleCatalogFilters(
    parsed,
    ["African & Afro-Textured", "Natural Hair"],
    ["Mid-back", "Waist"],
  ),
  { ...parsed, length: "Mid-back" },
  "URL state must resolve to authoritative option labels",
);

const serialized = styleCatalogFiltersToParams(parsed, new URLSearchParams("ref=founder"));
assert.equal(serialized.get("ref"), "founder", "unrelated query values must survive");
assert.equal(serialized.get("price"), "150-250");
assert.equal(serialized.get("sort"), "a-z");
const reset = styleCatalogFiltersToParams(defaults, serialized);
for (const key of ["q", "category", "length", "price", "sort"])
  assert.equal(reset.has(key), false, `reset must clear ${key}`);
assert.equal(reset.get("ref"), "founder");

const migration = readFileSync(
  "supabase/migrations/20260831100000_authoritative_public_style_catalog.sql",
  "utf8",
).toLowerCase();
const stylesPage = readFileSync("src/app/styles/page.tsx", "utf8");
assert.match(migration, /join public\.master_styles managed/);
assert.match(migration, /join public\.service_groups service_group/);
assert.match(migration, /join public\.service_categories category/);
assert.match(migration, /managed\.is_active = true/);
assert.match(migration, /service_group\.is_active = true/);
assert.match(migration, /category\.is_active = true/);
assert.match(migration, /count\(distinct offered\.salon_id\)/);
assert.match(migration, /public\.search_language_rules/);
assert.match(migration, /rule\.is_active = true/);
assert.match(migration, /jsonb_array_elements\(offered\.length_options\)/);
assert.ok(
  migration.lastIndexOf("limit least") > migration.indexOf("catalog as"),
  "the public cap must be applied after offering aggregation",
);
assert.match(migration, /p_offset integer default 0/);
assert.match(migration, /offset greatest\(coalesce\(p_offset, 0\), 0\)/);
assert.match(stylesPage, /for \(let offset = 0; ; offset \+= pageSize\)/);
assert.match(stylesPage, /p_limit:\s*pageSize/);
assert.match(stylesPage, /p_offset:\s*offset/);
assert.match(stylesPage, /if \(page\.length < pageSize\) break/);
assert.doesNotMatch(stylesPage, /p_limit:\s*2000/);
assert.match(stylesPage, /lengths:\s*\(raw\.lengths \|\| \[\]\)/);
assert.match(stylesPage, /searchTerms:\s*\(raw\.search_terms \|\| \[\]\)/);
assert.doesNotMatch(stylesPage, /\.slice\(0,\s*24\)/);
assert.doesNotMatch(stylesPage, /new Map<.*salons/s);

console.log(
  "Founder Browse Styles verification passed: authoritative post-aggregation server catalog, active stable identity, approved vocabulary, complete length sets, exact categories, non-overlapping price boundaries, unknown-price safety, AND filters, deterministic sorting, and URL codecs.",
);
