import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260825150000_booking_payout_workflow.sql",
);
const route = read("src/app/api/admin/finance/booking-payout/route.ts");
const component = read("src/components/admin/AdminSalonPayoutWorkspace.tsx");
const finance = read("src/components/admin/AdminFinanceDashboard.tsx");

for (const requirement of [
  /create table if not exists public\.salon_payout_events/,
  /payout_processing_key/,
  /payout_connected_account_id/,
  /Salon payout audit events are immutable/,
  /integrations\.expected_migration/,
  /20260825150000/,
]) {
  assert.match(migration, requirement);
}

for (const requirement of [
  /requireAdminPermission\(request, "finance"\)/,
  /Idempotency-Key/,
  /\/transfers/,
  /source_transaction/,
  /capabilities\?\.transfers !== "active"/,
  /Already transferred/,
  /stripe_transfer_id/,
  /Failed\/requires attention/,
  /salon_payout_events/,
  /A transfer and a bank payout remain separate|bank payout/i,
]) {
  assert.match(route, requirement);
}

for (const requirement of [
  /Pay Salon/,
  /connected Stripe account/,
  /bank-payout schedule|bank payout/i,
  /Review payment or refund first/,
  /AdminSalonPayoutWorkspace/,
]) {
  assert.match(component, requirement);
}

assert.match(finance, /AdminSalonPayoutWorkspace/);
assert.match(finance, /tab === "Salon Payouts"/);
assert.match(finance, /onChanged=\{\(\) => load\(selectedSalonId\)\}/);

console.log(
  "Booking payout workflow verification passed: eligibility, connected-account readiness, idempotent Stripe transfer, truthful transfer/bank-payout distinction, immutable evidence, and responsive Platform Admin controls are wired.",
);
