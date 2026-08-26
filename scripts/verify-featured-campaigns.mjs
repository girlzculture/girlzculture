import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/20260716150000_featured_salon_campaigns.sql");
const ownerControls=read("supabase/migrations/20260825140000_featured_campaign_owner_controls.sql");
const ambiguityFix=read("supabase/migrations/20260825141000_fix_featured_campaign_owner_controls.sql");
const publicApi=read("src/app/api/discovery/featured/route.ts");
const adminApi=read("src/app/api/admin/featured-campaigns/route.ts");
const placement=read("src/components/public/FeaturedSalonPlacement.tsx");
const admin=read("src/components/admin/AdminFeaturedCampaigns.tsx");
const home=read("src/app/page.tsx");
const complimentaryMigration=read("supabase/migrations/20260731160000_admin_complimentary_marketing_placements.sql");
const entitlement=read("src/lib/marketingEntitlements.ts");

assert.match(migration,/marketing_entitlements/);
assert.match(migration,/featured_campaigns_no_overlap/);
assert.match(migration,/discover_featured_salons/);
assert.match(ownerControls,/alter column ends_at drop not null/);
assert.match(ownerControls,/coalesce\(ends_at, 'infinity'::timestamptz\)/);
assert.match(ownerControls,/status in \('Draft','Scheduled','Active','Paused','Expired','Archived'\)/);
assert.match(ownerControls,/placement_basis in \('paid','platform_credit','complimentary_admin'\)/);
assert.match(ownerControls,/admin_save_featured_campaign_v2/);
assert.match(ownerControls,/admin_manage_featured_campaign/);
assert.match(ownerControls,/normalized_action = 'archive'/);
assert.match(ownerControls,/normalized_action = 'restore'/);
assert.match(ownerControls,/normalized_action = 'delete'/);
assert.match(ownerControls,/campaign_id_snapshot/);
assert.match(ownerControls,/salon_name_snapshot/);
assert.match(ownerControls,/ends_at is null or campaign\.ends_at>now\(\)/);
assert.match(ownerControls,/drop function if exists public\.resolve_homepage_promotion_target\(text, uuid\)/);
assert.match(ambiguityFix,/#variable_conflict error/);
assert.match(ambiguityFix,/v_entitlement_id/);
assert.doesNotMatch(ambiguityFix,/set entitlement_id = entitlement_id/);
assert.match(ambiguityFix,/published_value='"20260825141000"'/);
assert.match(entitlement,/endsAt\?: string \| null/);
assert.match(entitlement,/if \(!endsAt && credit\.valid_until\)/);
assert.match(entitlement,/if \(!endsAt && evidence\.metadata\?\.campaign_valid_until\)/);
assert.match(publicApi,/limit > 50/);
assert.match(adminApi,/requireAdminPermission\(request, "marketing"\)/);
assert.match(adminApi,/expire_featured_campaigns/);
assert.match(adminApi,/admin_save_featured_campaign_v2/);
assert.match(adminApi,/admin_manage_featured_campaign/);
assert.match(adminApi,/revalidatePath\("\/"\)/);
assert.match(adminApi,/placementBasis === "paid"/);
assert.match(adminApi,/indefinite/);
assert.match(adminApi,/const mode = cleanText\(params\.get\("mode"\), 30\)/);
assert.match(adminApi,/if \(mode === "salons"\)/);
assert.match(adminApi,/order\("name"/);
assert.match(complimentaryMigration,/placement_basis/);
assert.match(placement,/Featured/);
assert.doesNotMatch(placement,/Sponsored/);
assert.match(placement,/maxCards=12/);
assert.match(home,/homepage\.featured_card_count/);
assert.match(placement,/Own a business\? Get featured here/);
assert.doesNotMatch(placement,/subscription_tier|Premium|Growth|Basic/);
for (const requirement of [
  /Create Featured Salon campaign/,
  /Create campaign/,
  /Eligible salon/,
  /mode=salons/,
  /Until I change it/,
  /Platform credit/,
  /Complimentary Admin placement/,
  /Archive/,
  /Restore as draft/,
  /Delete permanently/,
  /No reference or internal reason is required/,
]) assert.match(admin,requirement);
assert.match(home,/FeaturedSalonPlacement/);
console.log("Featured Salon campaign verification passed: indefinite windows, searchable salon selection, platform credit and complimentary authority, archive/restore/delete, immutable deletion evidence, and public revalidation are covered.");