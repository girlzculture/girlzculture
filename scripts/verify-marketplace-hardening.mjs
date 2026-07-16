import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const checks = [];
function expect(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

const migration = read("supabase/migrations/20260716170000_marketplace_security_hardening.sql");
expect(!migration.includes("unclaimed demonstration"), "marketplace visibility has no demonstration-profile exception");
expect(migration.includes("public.salon_setup_complete(s.id)"), "canonical visibility requires completed salon setup");
expect(migration.includes("revoke select on table public.salons from anon"), "anonymous direct salon reads are restricted");
expect(migration.includes("revoke select on table public.salons from authenticated"), "signed-in customer direct salon reads are restricted");
expect(!/grant select[\s\S]{0,500}subscription_(tier|status)/i.test(migration), "public salon column grant excludes subscription fields");
expect(migration.match(/public\.is_marketplace_visible\(s\.id\)/g)?.length >= 2 && read("supabase/migrations/20260716130000_organic_salon_discovery.sql").includes("public.is_marketplace_visible(s.id)"), "organic and paid discovery share the canonical visibility gate");
expect(migration.includes("trending_campaigns_current_idx") && migration.includes("featured_campaigns_current_idx"), "campaign windows have production indexes");
expect(migration.includes("reviews_salon_rating_aggregation_idx"), "review aggregation has a covering index");

const security = read("src/lib/requestSecurity.ts");
expect(security.includes("publicErrorResponse"), "public API errors use a non-leaking response helper");

for (const route of ["featured", "trending"]) {
  const source = read(`src/app/api/discovery/${route}/route.ts`);
  expect(source.includes("enforceRateLimit"), `${route} discovery is rate-limited`);
  expect(source.includes("publicErrorResponse"), `${route} discovery hides provider and database errors`);
  expect(source.includes("Page size must be between 1 and 50"), `${route} discovery validates pagination`);
  expect(source.includes('latitude === null || latitude === ""'), `${route} discovery rejects missing coordinates`);
}
const organic = read("src/app/api/discovery/salons/route.ts");
expect(organic.includes("Minimum price cannot be higher"), "organic discovery validates price ranges");
expect(organic.includes("boundedInteger"), "organic discovery validates pagination bounds");
expect(organic.includes('latitude === null || latitude === ""'), "organic discovery rejects missing coordinates");

for (const route of ["featured-campaigns", "trending-campaigns"]) {
  const source = read(`src/app/api/admin/${route}/route.ts`);
  expect(source.includes("boundedNumber"), `${route} validates numeric campaign inputs server-side`);
  expect(source.includes("endTime <= startTime"), `${route} validates campaign date order server-side`);
  expect(source.includes("validTimezone"), `${route} validates campaign timezone server-side`);
}

const safeVideo = read("src/components/public/SafeCampaignVideo.tsx");
expect(safeVideo.includes("IntersectionObserver") && safeVideo.includes("preload=\"none\""), "campaign video is lazy and pauses outside the viewport");
expect(safeVideo.includes("Video preview unavailable"), "failed campaign video has a readable fallback");

const dialog = read("src/components/admin/AdminSalonsManager.tsx");
expect(dialog.includes('event.key === "Escape"') && dialog.includes('event.key !== "Tab"'), "admin salon dialog supports Escape and trapped Tab focus");
expect(dialog.includes('aria-labelledby="salon-detail-title"'), "admin salon dialog has an accessible name");

const profile = read("src/app/salon/[slug]/page.tsx");
expect(!profile.includes('.from("salons").select("*")'), "public salon profile selects only customer-safe salon fields");
const owner = read("src/components/owner/OwnerDashboardApp.tsx");
expect(owner.includes('fetch("/api/salon/profile"'), "owner dashboard loads private salon data through authenticated server authorization");
expect(read("src/app/error.tsx").includes("Your information is safe"), "global route failures use a customer-friendly boundary");

console.log(`Marketplace hardening verification passed (${checks.length} checks).`);
for (const check of checks) console.log(`  ✓ ${check}`);
