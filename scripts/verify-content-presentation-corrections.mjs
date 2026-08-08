import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const coreSource = read("src/lib/homePromotionCore.ts");
const locationUrl = pathToFileURL(`${process.cwd()}/src/lib/location.ts`).href;
const compiledCore = ts.transpileModule(coreSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace('from "@/lib/location"', `from "${locationUrl}"`);
const core = await import(`data:text/javascript;base64,${Buffer.from(compiledCore).toString("base64")}`);
const navigationCoreSource = read("src/lib/navigationVisibilityCore.ts");
const compiledNavigationCore = ts.transpileModule(navigationCoreSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const navigationCore = await import(`data:text/javascript;base64,${Buffer.from(compiledNavigationCore).toString("base64")}`);
const buildPhaseCoreSource = read("src/lib/buildPhaseCore.ts");
const compiledBuildPhaseCore = ts.transpileModule(buildPhaseCoreSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const buildPhaseCore = await import(`data:text/javascript;base64,${Buffer.from(compiledBuildPhaseCore).toString("base64")}`);

assert.equal(buildPhaseCore.isStaticBuildPhase({ NEXT_PHASE: "phase-production-build" }), true);
assert.equal(buildPhaseCore.isStaticBuildPhase({ npm_lifecycle_event: "build" }), true);
assert.equal(buildPhaseCore.isStaticBuildPhase({ NEXT_PHASE: "phase-production-server" }), false);
assert.equal(buildPhaseCore.isStaticBuildPhase({ npm_lifecycle_event: "start" }), false);

const now = Date.parse("2026-08-07T18:00:00Z");
const saved = Array.from({ length: 8 }, (_, index) => ({
  id: `saved-${index + 1}`,
  content_type: "image",
  title: `Saved ${index + 1}`,
  body: `Saved promotion ${index + 1} details.`,
  media_url: `/saved-${index + 1}.jpg`,
  href: `/saved-${index + 1}`,
  cta_label: "Explore",
  alt_text: `Saved promotion ${index + 1}`,
  status: "Active",
}));

const sixSaved = core.homepagePromotionPreview(saved.slice(0, 6), now, 8);
assert.equal(sixSaved.saved.length, 6);
assert.equal(sixSaved.fallbackCount, 2);
assert.equal(sixSaved.effective.length, 8);
assert.deepEqual(sixSaved.effective.slice(0, 6).map((card) => card.id), saved.slice(0, 6).map((card) => card.id));

const eightSaved = core.homepagePromotionPreview(saved, now, 8);
assert.equal(eightSaved.saved.length, 8);
assert.equal(eightSaved.fallbackCount, 0);
assert.deepEqual(eightSaved.effective.map((card) => card.id), saved.map((card) => card.id));

const canonicalSeed = core.HOMEPAGE_EDITORIAL_FALLBACKS[0];
const customizedSeed = { ...canonicalSeed, title: "Founder-selected nearby salons" };
assert.equal(core.homepagePromotionPreview([canonicalSeed], now, 8).saved.length, 0, "an untouched canonical seed is presentation-only");
assert.equal(core.homepagePromotionPreview([customizedSeed], now, 8).saved.length, 1, "a customized seed must remain saved Admin content");
for (const [field, value] of [
  ["body", "Founder-authored body"],
  ["cta_label", "See nearby choices"],
  ["alt_text", "Founder-authored accessible description"],
  ["status", "Draft"],
  ["starts_at", "2026-08-08T15:00:00.000Z"],
  ["ends_at", "2026-08-18T15:00:00.000Z"],
  ["priority", 75],
]) {
  assert.equal(
    core.homepagePromotionPreview([{ ...canonicalSeed, [field]: value }], now, 8).saved.length,
    1,
    `a canonical seed customized through ${field} must remain saved Admin content`,
  );
}
assert.equal(core.homepagePromotionPreview([{ ...saved[0], status: "Draft" }, ...saved.slice(1, 6)], now, 8).eligible.length, 5);
const incompleteActive = { ...saved[0], media_url: "", cta_label: "" };
assert.equal(core.isHomepagePromotionCardComplete(incompleteActive), false);
assert.equal(core.homepagePromotionPreview([incompleteActive], now, 8).eligible.length, 0, "an incomplete Active card must not consume a public slot");
assert.equal(core.homepagePromotionPreview([incompleteActive], now, 8).fallbackCount, 8, "a complete editorial fallback must replace an incomplete Active card");
assert.equal(core.isHomepagePromotionCardComplete(saved[0]), true);
assert.equal(core.isExplicitlyGlobalPromotionCard(saved[0]), true);
assert.equal(core.isExplicitlyGlobalPromotionCard({ ...saved[0], market_id: "target-market" }), false);
assert.equal(core.isExplicitlyGlobalPromotionCard({ ...saved[0], target_latitude: 40.8, target_longitude: -73.9 }), false);

const navigationFallback = [{ item_key: "default", is_enabled: true, archived_at: null }];
assert.deepEqual(navigationCore.resolveConfiguredNavigation([], navigationFallback), navigationFallback, "an unconfigured navigation surface uses bootstrap defaults");
assert.deepEqual(navigationCore.resolveConfiguredNavigation([
  { item_key: "disabled", is_enabled: false, archived_at: null },
  { item_key: "archived", is_enabled: true, archived_at: "2026-08-08T00:00:00.000Z" },
], navigationFallback), [], "an intentionally empty configured surface must not resurrect defaults");
assert.deepEqual(navigationCore.resolveConfiguredNavigation([
  { item_key: "enabled", is_enabled: true, archived_at: null },
  { item_key: "disabled", is_enabled: false, archived_at: null },
], navigationFallback).map((item) => item.item_key), ["enabled"]);

const about = read("src/app/about/page.tsx");
const carousel = read("src/components/site/AutoContentCarousel.tsx");
const footer = read("src/components/site/PublicChrome.tsx");
const admin = read("src/components/AdminContentManager.tsx");
const content = read("src/lib/content.ts");
const platformErrors = read("src/lib/platformErrors.ts");
const contentApi = read("src/app/api/admin/content/route.ts");
const promotionServer = read("src/lib/homepagePromotionServer.ts");
const homepageRail = read("src/components/public/HomepagePromoRail.tsx");
const navigationAdmin = read("src/components/admin/NavigationMenuManager.tsx");
const migration = read("supabase/migrations/20260807210000_content_presentation_and_mobile_legal.sql");

assert.doesNotMatch(about, /Transparency[\s\S]*Celebrating Braiding Culture/);
assert.match(about, /AboutIntro/);
assert.match(about, /about-promo-carousel/);
assert.match(about, /resolvePublishedContentCards/);
assert.match(carousel, /prefers-reduced-motion/);
assert.match(carousel, /onPointerDown=\{pause\}/);
assert.match(carousel, /uniquePromotionCards/);
assert.match(carousel, /if \(!ready\) return unique\.filter\(isExplicitlyGlobalPromotionCard\)/);
assert.doesNotMatch(carousel, /\.\.\.cards\s*,\s*\.\.\.cards/);
assert.match(footer, /Legal & Policies/);
assert.match(footer, /find\(\(item\) => item\.item_key === "legal-policies"\)/);
assert.match(footer, /\{mobileLegalItem \? <Link/);
assert.doesNotMatch(footer, /mobileLegalItem[^\n]*\|\| defaultFooter/);
assert.match(footer, /env\(safe-area-inset-bottom\)/);
assert.match(admin, /Saved source pool/);
assert.match(navigationAdmin, /Footer group order & previews/);
assert.match(admin, /grid items-start gap-4 xl:grid-cols-2/);
assert.match(admin, /additionalLegalSlugs/);
assert.match(content, /row\.page_group === "Legal"/);
assert.match(content, /rpc\("get_public_navigation_surface"/);
assert.match(content, /payload\?\.configured !== true/);
assert.doesNotMatch(content, /from\("navigation_items"\)/);
assert.match(content, /Array\.isArray\(payload\.items\)/);
assert.match(platformErrors, /context\.admin && !isStaticBuildPhase\(\)/);
assert.match(contentApi, /Active homepage promotion/);
assert.match(contentApi, /isHomepagePromotionCardComplete/);
assert.match(promotionServer, /published\.filter\(isHomepagePromotionCardComplete\)/);
assert.match(homepageRail, /cards: cards\.filter\(isHomepagePromotionCardComplete\)/);
assert.match(migration, /continue;/);
assert.match(migration, /editorial_fallback\":false/);
for (const field of ["body", "cta_label", "alt_text", "status", "starts_at", "ends_at", "priority"]) {
  assert.match(migration, new RegExp(`v_card ->> '${field}'`), `seed removal must compare ${field}`);
}
assert.match(migration, /about-promo-carousel/);
assert.match(migration, /about-community-carousel/);
assert.match(migration, /select exists\([\s\S]*item\.value ->> 'id' = 'about-promo-carousel'/);
assert.match(migration, /not v_has_lower[\s\S]*not v_claimed_legacy_lower/);
assert.match(migration, /on conflict\(surface,item_key\) do update/);
assert.match(migration, /existing\.href is distinct from excluded\.href/);
assert.match(migration, /is_enabled = true/);
assert.match(migration, /archived_at = null/);
assert.match(migration, /get_public_navigation_surface/);
assert.match(migration, /'configured', count\(\*\) > 0/);
assert.match(migration, /filter \(where item\.is_enabled and item\.archived_at is null\)/);
assert.match(migration, /revoke all on function public\.get_public_navigation_surface\(text\) from public/);
assert.match(migration, /grant execute on function public\.get_public_navigation_surface\(text\) to anon, authenticated, service_role/);

const homepage = read("src/app/page.tsx");
assert.match(homepage, /HOMEPAGE_EDITORIAL_FALLBACKS/);
assert.doesNotMatch(homepage, /DEFAULT_PROMOTION_CARDS/);
assert.doesNotMatch(homepage, /pilot-nearby/);

console.log("Content presentation verification passed: saved homepage cards precede exact fallback counts; canonical seeds stay outside the editor; About, compact footer, legal hub, and self-sizing Admin controls are wired.");
