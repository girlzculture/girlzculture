import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const loadTsModule = async (path) => {
  const source = read(path);
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
};
const slots = await loadTsModule("src/lib/contentSlotCore.ts");
const fuzzy = await loadTsModule("src/lib/catalogFuzzySearchCore.ts");
const legacyHero = { id: "legacy-home-promo", type: "community_carousel", title: "Founder promotions", cards: [{ id: "gif-1", media_url: "/promo.gif", href: "/salons" }] };
const canonical = slots.canonicalHomeHeroSection(legacyHero);
assert.equal(canonical.id, "home-hero-promotion-carousel");
assert.equal(canonical.type, "promo_rail");
assert.equal(canonical.presentation_layout, "community_carousel");
assert.equal(canonical.cards[0].id, "gif-1", "layout normalization must retain cards");
assert.equal(slots.heroPresentationLayout({ id: "home-hero-promotion-carousel", type: "promo_rail", presentation_layout: "banner" }), "banner");
const candidates = [
  { id: "dominican", name: "Dominican Blowout", terms: ["Dominican blow out"] },
  { id: "knotless", name: "Knotless Braids", terms: ["Knotless Braid"] },
  { id: "afro", name: "Afro Textured Hair", terms: ["Afro"] },
];
for (const query of ["Fominican Blowout", "Domincan Blowout", "Dominican Blowuot", "Dominicann Blowout"]) {
  const result = fuzzy.resolveCatalogCorrection(query, candidates);
  assert.equal(result?.serviceId, "dominican", `${query} should resolve to Dominican Blowout`);
  assert.ok((result?.confidence || 0) >= 0.86);
}
assert.equal(fuzzy.resolveCatalogCorrection("knotles braids near me", candidates)?.serviceId, "knotless");
assert.equal(fuzzy.resolveCatalogCorrection("knotless braid", candidates)?.serviceId, "knotless");
assert.notEqual(fuzzy.resolveCatalogCorrection("affordable salons near me", candidates)?.serviceId, "afro", "affordable must never resolve to Afro through prefix or short-token matching");
const home = read("src/app/page.tsx");
const about = read("src/app/about/page.tsx");
const publicSections = read("src/components/site/PublicContentSections.tsx");
const focusedEditor = read("src/components/admin/AdminPromotionSectionWorkspace.tsx");
const catalog = read("src/components/admin/AdminServiceCatalogWorkspace.tsx");
const contentRoute = read("src/app/admin/content/[recordId]/page.tsx");
const contentLanding = read("src/app/admin/content/page.tsx");
const keyboard = read("src/components/NativeSearchKeyboardBridge.tsx");
const searchComposer = read("src/components/site/SearchComposer.tsx");
const headerSearch = read("src/components/search/HeaderStyleSearch.tsx");
const rootLayout = read("src/app/layout.tsx");
const searchRoute = read("src/app/api/discovery/decision-search/route.ts");
const focusedApi = read("src/app/admin/content-sections/route.ts");
const migration = read("supabase/migrations/20260811120000_content_slot_reconciliation.sql");
assert.match(home, /findHomeHeroSection/);
assert.match(home, /heroPresentationLayout/);
assert.match(home, /promotionLayout === "promo_rail"/);
assert.match(home, /PublicContentSections sections=\{\[presentable\]\}/);
assert.match(publicSections, /type === "community_carousel"/);
assert.match(publicSections, /AutoContentCarousel/);
assert.match(about, /ABOUT_CAROUSEL_ONE_EDITORIAL_FALLBACKS/);
assert.match(about, /resolvedLegacyLower/);
assert.match(about, /ABOUT_CAROUSEL_TWO_ID/);
assert.match(focusedEditor, /Changing layout never deletes these cards/);
assert.match(focusedEditor, /presentation_layout/);
assert.match(focusedEditor, /Published and verified/);
assert.match(focusedApi, /admin_save_content_record/);
assert.match(focusedApi, /get_public_content_page/);
assert.match(focusedApi, /CONTENT_REVISION_CONFLICT/);
assert.match(catalog, /Categories/);
assert.match(catalog, /Service Groups/);
assert.match(catalog, /Service Names/);
assert.match(catalog, /Add-ons/);
assert.match(catalog, /Import & Export/);
assert.match(contentRoute, /recordId === "service-catalog"/);
assert.match(contentLanding, /open-service-catalog/);
assert.match(keyboard, /form\.requestSubmit\(\)/);
assert.match(keyboard, /event\.defaultPrevented/);
assert.match(keyboard, /event\.isComposing/);
assert.match(rootLayout, /NativeSearchKeyboardBridge/);
assert.match(searchComposer, /role="search"/);
assert.match(headerSearch, /type="search"/);
assert.match(headerSearch, /inputMode="search"/);
assert.match(searchRoute, /resolveCatalogCorrection/);
assert.match(searchRoute, /Showing results for/);
assert.match(searchRoute, /stable_service_id/);
assert.match(migration, /normalize_home_hero_sections/);
assert.match(migration, /reconcile_about_child_sections/);
assert.match(migration, /section_card_count\(existing_section\) > 0/);
console.log("Content slot, publication, catalog, typo-search, and keyboard hotfix verification passed.");
