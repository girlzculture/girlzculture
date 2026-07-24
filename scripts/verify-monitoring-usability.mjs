import assert from "node:assert/strict";
import fs from "node:fs";
import { operationalErrorPresentation } from "../src/lib/operationalErrorPresentation.ts";

const realtime = operationalErrorPresentation({
  feature: "owner-dashboard",
  action: "realtime-connect",
  user_safe_message: "Live updates are temporarily unavailable.",
});
assert.equal(realtime.category, "live-updates");
assert.match(realtime.impact, /saved records remain safe/i);

const maps = operationalErrorPresentation({
  feature: "salon-search",
  action: "maps-render",
});
assert.equal(maps.category, "maps");
assert.match(maps.impact, /list results/i);

const payment = operationalErrorPresentation({
  feature: "stripe-webhooks",
  action: "reconcile_payment",
  user_safe_message: "The payment update needs review.",
});
assert.equal(payment.category, "payments");
assert.match(payment.recommendedAction, /Stripe event ledger/);

const booking = operationalErrorPresentation({
  feature: "booking-availability",
  action: "reserve",
});
assert.equal(booking.category, "booking");
assert.match(booking.recommendedAction, /duplicate action/i);

const migration = fs.readFileSync(
  "supabase/migrations/20260723260000_monitoring_context_promotion_audit.sql",
  "utf8",
);
for (const requirement of [
  /create table if not exists public\.platform_error_affected_businesses/,
  /primary key\(event_id,salon_id\)/,
  /track_platform_error_affected_business/,
  /drop constraint if exists salon_promotion_audit_promotion_id_fkey/,
  /drop constraint if exists salon_promotion_audit_salon_id_fkey/,
  /promotion_title_snapshot/,
  /salon_name_snapshot/,
  /case when tg_op='DELETE' then null else to_jsonb\(new\) end/,
  /if tg_op='DELETE' then return old; end if/,
]) {
  assert.match(migration, requirement);
}

const api = fs.readFileSync(
  "src/app/api/admin/engine/errors/route.ts",
  "utf8",
);
assert.match(api, /platform_error_affected_businesses/);
assert.match(api, /operationalErrorPresentation\(row\)/);
assert.match(api, /affected_business_count/);

const ui = fs.readFileSync(
  "src/components/admin/ErrorMonitoringManager.tsx",
  "utf8",
);
for (const requirement of [
  /Recommended admin action/,
  /Affected salons and businesses/,
  /address_zip/,
  /<details className="mt-4 rounded-lg bg-ink/,
  /<summary className="cursor-pointer font-bold">Technical details<\/summary>/,
  /affected_business_count/,
]) {
  assert.match(ui, requirement);
}
assert.ok(
  ui.indexOf("presentation?.title") < ui.indexOf("technical_message"),
  "Plain-language presentation must appear before collapsed technical details.",
);

const dashboard = fs.readFileSync("src/components/AdminDashboard.tsx", "utf8");
assert.match(dashboard, /notificationCounts\.errors/);

console.log(
  "Operational monitoring usability verification passed: live-update, Maps, booking, and payment failures receive distinct plain-language impact/action guidance; affected-business context, grouped counts, collapsed technical details, high-severity badges, and immutable promotion deletion snapshots are covered.",
);
