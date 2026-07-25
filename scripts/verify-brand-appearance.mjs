import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import {
  copyBrandUploadBytes,
  inspectBrandAssetBinary,
  normalizeBrandFocalPoint,
  stripBrandAssetVersion,
  versionBrandAssetUrl,
} from "../src/lib/brandAssetCore.ts";

const shared =
  typeof SharedArrayBuffer === "function"
    ? new SharedArrayBuffer(24)
    : new ArrayBuffer(24);
const sharedView = new Uint8Array(shared);
sharedView.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ordinary = copyBrandUploadBytes(shared);
assert.ok(ordinary.buffer instanceof ArrayBuffer);
assert.notEqual(ordinary.buffer, shared);
assert.equal(inspectBrandAssetBinary(shared).mimeType, "image/png");
const realPng = await sharp({
  create: {
    width: 640,
    height: 180,
    channels: 4,
    background: { r: 198, g: 90, b: 58, alpha: 0.8 },
  },
})
  .png()
  .toBuffer();
const realWebp = await sharp(realPng).webp({ quality: 88 }).toBuffer();
assert.equal(inspectBrandAssetBinary(realPng).mimeType, "image/png");
assert.equal(inspectBrandAssetBinary(realWebp).mimeType, "image/webp");
assert.deepEqual(
  {
    width: (await sharp(Buffer.from(copyBrandUploadBytes(realPng))).metadata())
      .width,
    height: (await sharp(Buffer.from(copyBrandUploadBytes(realPng))).metadata())
      .height,
  },
  { width: 640, height: 180 },
);
const safeSvg = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180"><path d="M0 0"/></svg>',
);
assert.equal(inspectBrandAssetBinary(safeSvg).mimeType, "image/svg+xml");
assert.throws(
  () =>
    inspectBrandAssetBinary(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ),
  /unsupported active or external content/,
);
const ico = new Uint8Array(22);
ico.set([0, 0, 1, 0, 1, 0, 64, 64]);
assert.deepEqual(
  {
    type: inspectBrandAssetBinary(ico).mimeType,
    width: inspectBrandAssetBinary(ico).width,
  },
  { type: "image/x-icon", width: 64 },
);

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
const completionMigration = read(
  "supabase/migrations/20260724160000_brand_engine_binary_and_theme.sql",
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
for (const control of [
  /draft_reviewed_at/,
  /placement_description/,
  /branding\.heading_font/,
  /Playfair Display/,
  /Montserrat/,
  /#C65A3A/,
  /#B88A44/,
  /#281F16/,
])
  assert.match(completionMigration, control);

const route = read("src/app/api/admin/engine/brand-assets/route.ts");
for (const control of [
  /requireAdminPermission\(request, "settings"\)/,
  /limitInputPixels/,
  /inspectBrandAssetBinary/,
  /Buffer\.from\(Uint8Array\.from\(transformed\)\)/,
  /brand_asset_draft_reviewed/,
  /Review this draft on every device preview/,
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
  /Mark reviewed/,
  /Required workflow/,
  /Published theme propagation/,
])
  assert.match(manager, control);

const layout = read("src/app/layout.tsx");
assert.match(layout, /getPublishedBrandAssets/);
assert.match(layout, /social_share_image/);
assert.match(layout, /favicon/);
const manifest = read("src/app/manifest.ts");
assert.match(manifest, /app_icon/);
assert.match(manifest, /getEngineBrandTheme/);
const chrome = read("src/components/site/PublicChrome.tsx");
assert.match(chrome, /primary_header_logo/);
assert.match(chrome, /light_logo/);
const communications = read("src/lib/bookingCommunications.ts");
assert.match(communications, /emailLogoUrl/);
assert.match(communications, /\^https/);
assert.match(communications, /emailTheme/);
assert.match(communications, /theme\.cta/);

console.log(
  "Brand appearance verification passed: SharedArrayBuffer bytes are copied to ordinary memory; PNG, safe SVG, and ICO signatures execute; governed review/versioning, responsive previews, Engine theme propagation, public chrome, PWA/social metadata, and email branding are covered.",
);
