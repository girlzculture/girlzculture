import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const ui = read("src/components/admin/AdminFeaturedCampaigns.tsx");
const route = read("src/app/api/admin/featured-campaigns/route.ts");
const migration = read(
  "supabase/migrations/20260825140000_featured_campaign_owner_controls.sql",
);
const entitlement = read("src/lib/marketingEntitlements.ts");

for (const requirement of [
  /Until I change it/,
  /platform_credit/,
  /complimentary_admin/,
  /Archive|archive/,
  /Restore|restore/,
  /Delete permanently/,
  /statusTabs/,
  /mode=salons/,
  /Published customer pages receive the change automatically/,
  /do not require an[\s\S]*internal reason/i,
  /label="Internal note \(optional\)" name="internal_note"/,
]) {
  assert.match(ui, requirement);
}
assert.doesNotMatch(
  ui,
  /name="internal_note"[^>]*\brequired\b/,
  "Platform-credit and complimentary placements must keep the internal note optional.",
);

for (const requirement of [
  /admin_save_featured_campaign_v2/,
  /admin_manage_featured_campaign/,
  /no_end/,
  /platform_credit/,
  /complimentary_admin/,
  /page_size/,
  /order\("name"/,
  /revalidatePath\("\/"\)/,
]) {
  assert.match(route, requirement);
}

for (const requirement of [
  /alter column ends_at drop not null/,
  /status in \('Draft','Scheduled','Active','Paused','Expired','Archived'\)/,
  /placement_basis in \('paid','platform_credit','complimentary_admin'\)/,
  /admin_save_featured_campaign_v2/,
  /admin_manage_featured_campaign/,
  /campaign_id_snapshot/,
  /deleted_at/,
  /Until I change it|infinity|ends_at is null/i,
  /drop function if exists public\.resolve_homepage_promotion_target\(text, uuid\)/,
]) {
  assert.match(migration, requirement);
}
assert.doesNotMatch(
  migration,
  /set entitlement_id = entitlement_id/,
  "The migration must not contain an ambiguous self-assignment.",
);
assert.match(entitlement, /endsAt: string \| null/);
assert.match(entitlement, /Finite Stripe evidence cannot fund an indefinite campaign/);

console.log(
  "Featured Salon owner controls verification passed: compact searchable selection, indefinite scheduling, lifecycle controls, automatic platform credit, complimentary Admin authority, immutable deletion evidence, and public refresh wiring are present.",
);
