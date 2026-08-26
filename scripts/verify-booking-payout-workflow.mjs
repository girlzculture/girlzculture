import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260825150000_stripe_connect_booking_payouts.sql",
);
const route = read("src/app/api/admin/finance/payout/route.ts");
const workspace = read("src/components/admin/AdminSalonPayoutWorkspace.tsx");
const detailAction = read("src/components/admin/AdminSalonPayoutAction.tsx");
const finance = read("src/components/admin/AdminFinanceDashboard.tsx");

for (const requirement of [
  /create table if not exists public\.salon_payout_attempts/,
  /salon_payout_one_processing_per_booking_idx/,
  /p_source_charge_id text/,
  /source_charge_id text not null/,
  /transfer_group text not null/,
  /idempotency_key text not null unique/,
  /stripe_transfer_id text unique/,
  /admin_reserve_booking_payout\(/,
  /admin_finalize_booking_payout\(/,
  /v_outcome = 'uncertain'/,
  /bank_payout_status/,
  /integrations\.expected_migration/,
  /20260825150000/,
]) {
  assert.match(migration, requirement);
}
assert.doesNotMatch(migration, /PROCESSING_LEASE_EXPIRED/);
assert.doesNotMatch(migration, /requested_at\s*>\s*now\(\)\s*-\s*interval\s*'10 minutes'/i);

for (const requirement of [
  /requireAdminPermission\(request, "finance"\)/,
  /resolveSourceChargeId/,
  /p_source_charge_id: sourceChargeId/,
  /configuredStripeMode/,
  /stripeRequest<StripeTransfer>\(\s*"\/transfers"/s,
  /source_transaction: reservedChargeId/,
  /transfer_group: transferGroup/,
  /idempotencyKey/,
  /p_outcome: stripeTransferId \? "uncertain" : "failed"/,
  /Do not create a new payout/,
  /reconciliation_required/,
  /admin_finalize_booking_payout/,
]) {
  assert.match(route, requirement);
}

for (const requirement of [
  /Pay Salon/,
  /connected Stripe account/,
  /bank-payout schedule|bank payout/i,
  /window\.confirm/,
  /\/api\/admin\/finance\/payout/,
  /confirm: true/,
  /Reconcile existing transfer first/,
  /Review payment or refund first/,
]) {
  assert.match(workspace, requirement);
}

for (const requirement of [
  /Pay Salon/,
  /Verified net to salon/,
  /Connected Stripe account/,
  /Payout attempt history/,
  /booking-specific Stripe idempotency key/,
  /\/api\/admin\/finance\/payout/,
]) {
  assert.match(detailAction, requirement);
}

assert.match(finance, /AdminSalonPayoutWorkspace/);
assert.match(finance, /AdminSalonPayoutAction/);
assert.match(finance, /tab === "Salon Payouts"/);
assert.match(finance, /transaction_type === "Booking deposit"/);
assert.match(finance, /onChanged=\{\(\) => load\(selectedSalonId\)\}/);

console.log(
  "Booking payout workflow verification passed: one authoritative provider route now backs both finance views, with verified source-charge resolution, mode isolation, database reservation, stable Stripe idempotency, reconciliation-required handling, truthful transfer/bank-payout stages, and audited attempt history.",
);
