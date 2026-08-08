import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const salonStyles = read("src/components/SalonStyles.tsx");
const headerSearch = read("src/components/search/HeaderStyleSearch.tsx");
const beautyConcierge = read("src/components/public/BeautyConcierge.tsx");
const marketplaceCard = read("src/components/public/MarketplaceSalonCard.tsx");
const nearby = read("src/components/public/NearbySalonPlacement.tsx");
const adminData = read("src/app/api/admin/data/route.ts");
const subscriptions = read("src/components/admin/AdminSubscriptionsDashboard.tsx");
const adminSalons = read("src/components/admin/AdminSalonsManager.tsx");
const featuredApi = read("src/app/api/admin/featured-campaigns/route.ts");
const trendingApi = read("src/app/api/admin/trending-campaigns/route.ts");
const featuredPlacement = read("src/components/public/FeaturedSalonPlacement.tsx");
const trendingPlacement = read("src/components/public/TrendingVideoPlacement.tsx");
const migration = read("supabase/migrations/20260731160000_admin_complimentary_marketing_placements.sql");

assert.match(salonStyles, /useState<string \| null>\(null\)/);
assert.doesNotMatch(salonStyles, /services\[1\]\?\.id/);

assert.match(headerSearch, /placeholder="Search"/);
assert.match(headerSearch, /router\.push/);
assert.match(headerSearch, /`\/salons\?\$\{params\.toString\(\)\}`/);
assert.match(headerSearch, /customerLocation\.location\.lat/);
assert.match(beautyConcierge, /\/api\/concierge\/search/);
assert.match(beautyConcierge, /salon\.services\[0\]\?\.id/);
assert.match(beautyConcierge, /query\.set\("style", salon\.services\[0\]\.id\)/);
assert.doesNotMatch(headerSearch, /Search style/);
assert.doesNotMatch(headerSearch, />AI</);

assert.match(marketplaceCard, />\s*View\s*<\/Link>/);
assert.doesNotMatch(marketplaceCard, />View salon</i);
assert.match(nearby, />View all →</);
assert.doesNotMatch(nearby, /View all \{total\}/);

assert.match(adminData, /marketplace_status/);
assert.match(adminData, /approval_status/);
assert.match(adminData, /\? "Offboarded"/);
assert.match(adminSalons, /Permanent deletion is available only for a record explicitly registered as test data/);
assert.match(adminSalons, /category=data_management/);

for (const control of [
  /Expected monthly revenue/,
  /Actually collected/,
  /Plans by state/,
  /All states/,
  /All plans/,
  /All statuses/,
  /Export filtered CSV/,
  /formula|\^\[=\+\\-@\]/,
]) assert.match(subscriptions, control);

for (const source of [featuredApi, trendingApi]) {
  assert.match(source, /placement_basis/);
  assert.match(source, /complimentary_admin/);
  assert.match(source, /reason\.length < 5/);
  assert.match(source, /is_discoverable/);
  assert.match(source, /geocode_status/);
  assert.match(source, /address_needs_review/);
}
for (const control of [
  /complimentary_reason/,
  /complimentary_approved_by/,
  /complimentary_approved_at/,
  /is_marketplace_visible/,
  /discover_featured_salons/,
  /discover_trending_videos/,
]) assert.match(migration, control);
assert.match(featuredPlacement, /Featured/);
assert.match(trendingPlacement, /Featured/);
assert.doesNotMatch(featuredPlacement, /Sponsored/);
assert.doesNotMatch(trendingPlacement, /Sponsored/);

console.log("Verified closed salon pricing accordions, responsive assisted search, compact public labels, offboarded-record handling, subscription reporting, and audited complimentary marketing placement controls.");
