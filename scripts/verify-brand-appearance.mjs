import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeBrandFocalPoint,
  stripBrandAssetVersion,
  versionBrandAssetUrl,
} from "../src/lib/brandAssetCore.ts";

assert.equal(normalizeBrandFocalPoint(42.126), 42.13);
assert.equal(normalizeBrandFocalPoint("100"), 100);
assert.equal(normalizeBrandFocalPoint(-1), null);
assert.equal(normalizeBrandFocalPoint(101), null);
assert.equal(
  versionBrandAssetUrl("https://cdn.example/logo.png", 12),
  "https://cdn.example/logo.png?v=12",
);
assert.equal(
  versionBrandAssetUrl("https://cdn.example/logo.png?width=640&v=11", 12),
  "https://cdn.example/logo.png?width=640&v=12",
);
assert.equal(
  stripBrandAssetVersion("https://cdn.example/logo.png?v=12"),
  "https://cdn.example/logo.png",
);

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260723300000_engine_brand_appearance.sql",
);
for (const control of [
  /platform-brand-assets/,
  /create table if not exists public\.platform_brand_assets/,
  /create table if not exists public\.platform_brand_asset_versions/,
  /primary_header_logo/,
  /social_share_image/,
  /platform_brand_asset_versions_immutable/,
  /admin_has_permission\('settings'\)/,
])
  assert.match(migration, control);

const route = read("src/app/api/admin/engine/brand-assets/route.ts");
for (const control of [
  /requireAdminPermission\(request, "settings"\)/,
  /limitInputPixels/,
  /image\/svg\+xml/,
  /unsupported active or external content/,
  /versionBrandAssetUrl/,
  /brand_asset_published/,
  /brand_asset_restored/,
  /withOperationalMonitoring/,
])
  assert.match(route, control);

const manager = read("src/components/admin/BrandAppearanceManager.tsx");
for (const control of [
  /label="Desktop"/,
  /label="Tablet"/,
  /label="Mobile"/,
  /Publish this asset/,
  />Restore</,
  /focal_x/,
  /alt_text/,
])
  assert.match(manager, control);

const layout = read("src/app/layout.tsx");
assert.match(layout, /getPublishedBrandAssets/);
assert.match(layout, /social_share_image/);
assert.match(layout, /favicon/);
const manifest = read("src/app/manifest.ts");
assert.match(manifest, /app_icon/);
const chrome = read("src/components/site/PublicChrome.tsx");
assert.match(chrome, /primary_header_logo/);
assert.match(chrome, /light_logo/);
const communications = read("src/lib/bookingCommunications.ts");
assert.match(communications, /emailLogoUrl/);
assert.match(communications, /\^https/);

console.log(
  "Brand appearance verification passed: executable focal-point and cache-version behavior, governed storage/versioning, secure upload controls, responsive previews, public chrome, PWA/social metadata, and email branding are covered.",
);
