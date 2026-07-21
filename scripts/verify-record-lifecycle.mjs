import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const migration=read("supabase/migrations/20260720180000_record_lifecycle_management.sql");
const api=read("src/app/api/admin/records/route.ts");
const ownerApi=read("src/app/api/salon/records/route.ts");
const manager=read("src/components/admin/RecordLifecycleManager.tsx");
const content=read("src/app/api/admin/content/route.ts");

for(const type of ["service_category","service_group","service_addon","master_style","blog_post","content_page","salon","salon_application","stylist","style","salon_product","salon_promotion","promo_code","customer","booking","review","support_ticket","featured_campaign","trending_campaign","location_market","newsletter_subscriber"]){assert.match(api,new RegExp(`${type}:`));}
for(const action of ["Archived","Reassigned","Deleted","Cancelled","Offboarded","Anonymized"]){assert.match(migration,new RegExp(`'${action}'`));}
assert.match(migration,/record_management_events/);
assert.match(migration,/security definer/);
assert.match(migration,/Promo codes with redemption history must be archived/);
assert.match(api,/Type “\$\{record\.label\}” exactly to confirm/);
assert.match(api,/must be retained/);
assert.match(manager,/Dependency preview/);
assert.match(manager,/Financial, booking, refund, dispute, subscription, and audit history is retained/);
assert.match(ownerApi,/has history, so it was hidden and archived safely/);
assert.match(content,/admin_manage_catalog_record/);
assert.doesNotMatch(content,/admin\.from\(table\)\.delete/);

console.log("Record lifecycle verification passed (21 managed record types).")
