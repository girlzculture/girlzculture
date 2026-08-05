import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read(
  "supabase/migrations/20260803160000_launch_owner_controls_and_ux.sql",
);
const records = read("src/app/api/admin/records/route.ts");
const password = read("src/components/PasswordRecovery.tsx");
const application = read("src/components/SalonApplication.tsx");
const submitted = read("src/app/salon/application-submitted/page.tsx");
const trending = read("src/app/api/admin/trending-campaigns/route.ts");
const crop = read("src/components/ImageUpload.tsx");
const map = read("src/components/search/GoogleSalonMap.tsx");
const promo = read("src/components/public/HomepagePromoRail.tsx");
const promoCore = read("src/lib/homePromotionCore.ts");
const promoApi = read("src/app/api/admin/content/route.ts");
const promoAdmin = read("src/components/AdminContentManager.tsx");
const actionToast = read("src/components/ActionToast.tsx");

assert.match(migration, /create table if not exists public\.password_reset_codes/);
assert.match(migration, /notify pgrst, 'reload schema'/);
assert.match(migration, /admin_delete_salon_application/);
assert.match(migration, /publication_override_audits_retained/);
assert.match(migration, /on delete set null/);
assert.match(records, /salon_application:[\s\S]*actions:\["archive","delete"\]/);
assert.match(records, /admin_delete_salon_application/);

assert.doesNotMatch(password, /Customer login|Salon login|Admin login/);
assert.doesNotMatch(password, /works for customer/i);
assert.match(application, /Number of stylists[\s\S]*min=\{1\}[\s\S]*max=\{500\}/);
assert.match(submitted, /within 2–4 business days/);

for (const message of [
  /missing its saved playback URL/,
  /missing its storage path/,
  /Enter a description for this Trending Picks video/,
  /saved video must be an MP4 or WebM/,
]) assert.match(trending, message);
assert.match(trending, /status === "Draft" && !entitlementSource && !entitlementReference/);
assert.match(trending, /A draft is editorial work, not a claim that payment has occurred/);

assert.match(crop, /Position image left\/right/);
assert.match(crop, /Position image up\/down/);
assert.match(crop, /label="Move image left"/);
assert.match(crop, /label="Move image up"/);
assert.match(crop, /transformForCropPointer/);
assert.match(crop, /nudgeImageCrop/);

assert.match(map, /configuredMapId === "DEMO_MAP_ID" \? ""/);
assert.match(map, /window\.location\.assign\(`\/salon\//);
assert.match(map, /From \$/);
assert.match(map, /rating_overall/);
assert.match(map, /class SalonOverlay/);

assert.match(promo, /selectLocalPromotionCards/);
assert.match(promoCore, /distanceMiles/);
assert.match(promoCore, /radius_miles/);
assert.match(promoCore, /MAX_HOMEPAGE_PROMOTION_COUNT/);
assert.match(promoApi, /location_markets/);
assert.match(promoApi, /between 8 and 200 cards/);
assert.match(promoApi, /display_limit/);
assert.match(promoAdmin, /Audience market/);
assert.match(promoAdmin, /Audience radius \(miles\)/);
assert.match(promoAdmin, /Cards shown per customer/);
assert.match(actionToast, /fixed inset-x-4 bottom-24/);
assert.match(actionToast, /ACTION_TOAST_SUCCESS_DURATION_MS/);
assert.match(actionToast, /Copy reference/);
assert.doesNotMatch(actionToast, /addEventListener\("pointerdown"/);

console.log(
  "Verified application deletion, password recovery repair, precise Trending Picks validation, independent crop controls, navigable map markers, and regional 20-card promotion targeting.",
);
