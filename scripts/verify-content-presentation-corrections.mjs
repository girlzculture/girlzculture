import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const moduleDataUrl = (source, aliases = new Map()) => {
  const rewriteAliases = (context) => {
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const replacement = aliases.get(node.moduleSpecifier.text);
        if (replacement && ts.isImportDeclaration(node)) {
          return ts.factory.updateImportDeclaration(
            node,
            node.modifiers,
            node.importClause,
            ts.factory.createStringLiteral(replacement),
            node.attributes,
          );
        }
        if (replacement && ts.isExportDeclaration(node)) {
          return ts.factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            ts.factory.createStringLiteral(replacement),
            node.attributes,
          );
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (sourceFile) => ts.visitNode(sourceFile, visit);
  };

  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: aliases.size > 0 ? { before: [rewriteAliases] } : undefined,
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
};

const promotionScheduleCoreUrl = moduleDataUrl(read("src/lib/promotionScheduleCore.ts"));
const coreDependencies = new Map([
  ["@/lib/location", moduleDataUrl(read("src/lib/location.ts"))],
  ["@/lib/promotionScheduleCore", promotionScheduleCoreUrl],
  ["./promotionScheduleCore", promotionScheduleCoreUrl],
]);
const coreSource = read("src/lib/homePromotionCore.ts");
const core = await import(moduleDataUrl(coreSource, coreDependencies));
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
const publicationCoreSource = read("src/lib/contentPublicationCore.ts");
const compiledPublicationCore = ts.transpileModule(publicationCoreSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const publicationCore = await import(`data:text/javascript;base64,${Buffer.from(compiledPublicationCore).toString("base64")}`);

assert.equal(buildPhaseCore.isStaticBuildPhase({ NEXT_PHASE: "phase-production-build" }), true);
assert.equal(buildPhaseCore.isStaticBuildPhase({ npm_lifecycle_event: "build" }), true);
assert.equal(buildPhaseCore.isStaticBuildPhase({ NEXT_PHASE: "phase-production-server" }), false);
assert.equal(buildPhaseCore.isStaticBuildPhase({ npm_lifecycle_event: "start" }), false);

const now = Date.parse("2026-08-07T18:00:00Z");
const publishedA = { title: "Published A" };
const scheduledB = { title: "Scheduled B" };
const dueSchedule = {
  publication_state: "Published",
  published_payload: publishedA,
  published_at: "2026-08-06T12:00:00.000Z",
  scheduled_payload: scheduledB,
  scheduled_publish_at: "2026-08-07T12:00:00.000Z",
  is_enabled: true,
};
assert.deepEqual(
  publicationCore.retainedPublishedVersion(dueSchedule, now),
  {
    payload: scheduledB,
    publishedAt: "2026-08-07T12:00:00.000Z",
    source: "scheduled",
  },
  "a due scheduled snapshot must become the retained public version before scheduling its replacement",
);
assert.deepEqual(
  publicationCore.retainedPublishedVersion({
    ...dueSchedule,
    scheduled_publish_at: "2026-08-08T12:00:00.000Z",
  }, now),
  {
    payload: publishedA,
    publishedAt: "2026-08-06T12:00:00.000Z",
    source: "published",
  },
  "a future scheduled snapshot must leave the current published snapshot live",
);
assert.equal(
  publicationCore.retainedPublishedVersion({ ...dueSchedule, is_enabled: false }, now),
  null,
  "hidden content must not be promoted as a retained public version",
);
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
const publicationMigration = read("supabase/migrations/20260808120000_content_publication_workflow.sql");
const catalogAuditMigration = read("supabase/migrations/20260809180000_atomic_content_catalog_audit.sql");
const cleanDatabaseRunner = read("scripts/verify-clean-database.mjs");
const recordLifecycleApi = read("src/app/api/admin/records/route.ts");

assert.doesNotMatch(about, /Transparency[\s\S]*Celebrating Braiding Culture/);
assert.match(about, /AboutIntro/);
assert.match(about, /about-promo-carousel/);
assert.match(about, /resolvePublishedContentCards/);
assert.match(about, /getContentPage\("about-carousel-one"/);
assert.match(about, /getContentPage\("about-carousel-two"/);
assert.doesNotMatch(about, /independentMiddle[^\n]*\|\| middleSource/);
assert.match(carousel, /prefers-reduced-motion/);
assert.match(carousel, /onPointerDown=\{pauseForPointerInteraction\}/);
assert.match(carousel, /onWheel=\{pauseForWheelInteraction\}/);
assert.match(carousel, /onFocusCapture=\{\(\) => pause\(\)\}/);
assert.doesNotMatch(carousel, /hovered\.current|focused\.current/);
assert.match(carousel, /uniquePromotionCards/);
assert.match(carousel, /if \(!ready\) return unique\.filter\(isExplicitlyGlobalPromotionCard\)/);
assert.doesNotMatch(carousel, /\.\.\.cards\s*,\s*\.\.\.cards/);
assert.match(footer, /Legal & Policies/);
assert.match(footer, /find\(\(item\) => item\.item_key === "legal-policies"\)/);
assert.match(footer, /\{mobileLegalItem \? <Link/);
assert.doesNotMatch(footer, /mobileLegalItem[^\n]*\|\| defaultFooter/);
assert.match(footer, /env\(safe-area-inset-bottom\)/);
assert.match(admin, /Saved source pool/);
assert.match(admin, /function resolvedPublicSnapshot/);
assert.match(admin, /Public: \{publiclyVisible \? "Visible" : "Not visible"\}/);
assert.match(admin, /Draft: \{draftState\.visible \? "Visible" : "Hidden"\}/);
assert.match(navigationAdmin, /Footer group order & previews/);
assert.match(admin, /grid items-start gap-4 xl:grid-cols-2/);
assert.match(admin, /additionalLegalSlugs/);
assert.match(content, /row\.page_group === "Legal"/);
assert.match(content, /rpc\("get_public_navigation_surface"/);
assert.match(content, /payload\?\.configured !== true/);
assert.doesNotMatch(content, /from\("navigation_items"\)/);
assert.match(content, /Array\.isArray\(payload\.items\)/);
assert.match(content, /function resolvedContentPage\(value: unknown\)/);
assert.match(content, /Array\.isArray\(value\)/);
assert.match(content, /return resolvedContentPage\(data\)/);
assert.doesNotMatch(content, /\(data as ContentPage \| null\) \|\| fallback/);
assert.match(platformErrors, /context\.admin && !isStaticBuildPhase\(\)/);
assert.match(contentApi, /Active homepage promotion/);
assert.match(contentApi, /isHomepagePromotionCardComplete/);
assert.match(contentApi, /expected_updated_at/);
assert.match(contentApi, /verifyPublicProjection/);
assert.match(contentApi, /Saved page public-projection verification failed/);
assert.match(contentApi, /Saved blog public-projection verification failed/);
assert.match(contentApi, /noteOperationalFailure\([\s\S]*verificationError/);
assert.match(publicationMigration, /Draft saved/);
assert.match(contentApi, /dueScheduledIsPublic/);
assert.match(promotionServer, /published\.filter\(isHomepagePromotionCardComplete\)/);
assert.match(homepageRail, /cards: cards\.filter\(isHomepagePromotionCardComplete\)/);
assert.match(homepageRail, /onFocus=\{pauseForInteraction\}/);
assert.doesNotMatch(homepageRail, /onFocus=\{\(\) => setInteractionPaused\(true\)\}/);
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
assert.match(publicationMigration, /content_pages_archive_publication_guard/);
assert.match(publicationMigration, /blog_posts_archive_publication_guard/);
assert.match(publicationMigration, /new\.publication_state := 'Archived'/);
assert.match(publicationMigration, /new\.scheduled_payload := null/);
assert.match(publicationMigration, /jsonb_typeof\(parent\.sections\) = 'array'/);
assert.match(publicationMigration, /grant execute on function public\.get_public_content_page\(text\) to anon, authenticated, service_role/);
assert.doesNotMatch(publicationMigration, /\(resolved\.payload ->> 'published_at'\)::timestamptz/);
assert.doesNotMatch(publicationMigration, /\(resolved\.payload ->> 'featured'\)::boolean/);
assert.match(recordLifecycleApi, /publication_state: "Archived"/);
assert.match(recordLifecycleApi, /publication_state: "Hidden"/);
assert.match(recordLifecycleApi, /admin\.rpc\("admin_save_content_record"/);
const contentLifecycleBranch = recordLifecycleApi.match(
  /if \(\s*\(type === "content_page" \|\| type === "blog_post"\)[\s\S]*?\n\s*}\s*\n\s*if \(action === "restore"\)/,
)?.[0];
assert.ok(
  contentLifecycleBranch,
  "Content archive/restore lifecycle branch was not found.",
);
assert.doesNotMatch(
  contentLifecycleBranch,
  /\.from\(resource\.table\)|record_management_events/,
  "Content archive/restore must stay inside the atomic content RPC rather than direct table/audit writes.",
);
assert.match(contentApi, /retainedPublishedVersion\(current\)/);
assert.match(contentApi, /published_payload: retainedPublicVersion\.payload/);
assert.match(contentApi, /admin\.rpc\("admin_save_content_record"/);
assert.doesNotMatch(contentApi, /\.from\("content_pages"\)\.upsert/);
assert.doesNotMatch(contentApi, /\.from\("blog_posts"\)\.upsert/);
assert.match(publicationMigration, /create or replace function public\.admin_save_content_record/);
assert.match(publicationMigration, /CONTENT_REVISION_CONFLICT/);
assert.match(publicationMigration, /insert into public\.record_management_events/);
assert.match(publicationMigration, /revoke all on function public\.admin_save_content_record[\s\S]*from public, anon, authenticated/);
assert.match(publicationMigration, /grant execute on function public\.admin_save_content_record[\s\S]*to service_role/);
assert.match(contentApi, /admin\.rpc\("admin_save_content_catalog_record"/);
assert.doesNotMatch(contentApi, /auditContentChange/);
assert.doesNotMatch(contentApi, /admin\.from\("master_styles"\)\.update/);
assert.doesNotMatch(contentApi, /admin\.from\("service_categories"\)\.update/);
assert.doesNotMatch(contentApi, /admin\.from\(table\)\.(?:insert|update)/);
assert.match(catalogAuditMigration, /create or replace function public\.admin_save_content_catalog_record/);
for (const recordType of ["master_style", "service_category", "service_group", "service_addon"]) {
  assert.match(catalogAuditMigration, new RegExp(`'${recordType}'`));
}
assert.match(catalogAuditMigration, /insert into public\.record_management_events/);
assert.match(catalogAuditMigration, /revoke all on function public\.admin_save_content_catalog_record[\s\S]*from public, anon, authenticated/);
assert.match(catalogAuditMigration, /grant execute on function public\.admin_save_content_catalog_record[\s\S]*to service_role/);
assert.match(cleanDatabaseRunner, /object-valued-sections/);
assert.match(cleanDatabaseRunner, /Object-valued legacy About sections were not migrated safely/);
const cleanDatabaseAssertions = read("scripts/sql/verify-clean-database.sql");
assert.match(cleanDatabaseAssertions, /Content save did not atomically persist its audit event/);
assert.match(cleanDatabaseAssertions, /Content mutation survived a failed audit transaction/);
assert.match(cleanDatabaseAssertions, /Catalog save did not atomically persist its audit event/);
assert.match(cleanDatabaseAssertions, /Catalog mutation survived a failed audit transaction/);

const homepage = read("src/app/page.tsx");
assert.match(homepage, /HOMEPAGE_EDITORIAL_FALLBACKS/);
assert.doesNotMatch(homepage, /DEFAULT_PROMOTION_CARDS/);
assert.doesNotMatch(homepage, /pilot-nearby/);

console.log("Content presentation verification passed: saved homepage cards precede exact fallback counts; canonical seeds stay outside the editor; About, compact footer, legal hub, and self-sizing Admin controls are wired.");
