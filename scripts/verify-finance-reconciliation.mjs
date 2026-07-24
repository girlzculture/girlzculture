import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import {
  bookingTransaction,
  filterBookingTransactions,
  financeCsv,
  summarizeBookingTransactions,
} from "../src/lib/financeLedgerCore.ts";
import { verifyStripeEvent } from "../src/lib/stripeServer.ts";

const paidCompleted = bookingTransaction(
  {
    id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-07-20T12:00:00.000Z",
    payment_verified_at: "2026-07-20T12:05:00.000Z",
    appointment_datetime: "2026-07-21T14:00:00.000Z",
    confirmation_code: "GC-PAID",
    guest_name: "=Finance formula",
    salon_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    subtotal_before_promotion: 250,
    promotion_discount_amount: 20,
    discount_amount: 0,
    estimated_total: 230,
    deposit_amount: 23,
    deposit_percentage: 10,
    stripe_processing_fee: 0.97,
    platform_fee: 0,
    net_amount_owed_salon: 22.03,
    balance_due: 207,
    deposit_status: "Paid",
    refund_status: "Not applicable",
    refund_amount: 0,
    payout_status: "Awaiting",
    status: "Completed",
    stripe_charge_id: "ch_test_paid",
    payment_mode: "test",
  },
  {
    name: "The Braid Lounge",
    address_city: "Brooklyn",
    address_state: "NY",
  },
  { name: "Knotless Braids" },
  { name: "Aaliyah J." },
);

const paidUpcoming = bookingTransaction(
  {
    id: "22222222-2222-4222-8222-222222222222",
    created_at: "2026-07-22T10:00:00.000Z",
    payment_verified_at: "2026-07-22T10:01:00.000Z",
    appointment_datetime: "2026-08-04T15:00:00.000Z",
    confirmation_code: "GC-UPCOMING",
    guest_name: "Upcoming customer",
    salon_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    subtotal_before_promotion: 180,
    promotion_discount_amount: 0,
    discount_amount: 0,
    estimated_total: 180,
    deposit_amount: 18,
    deposit_percentage: 10,
    stripe_processing_fee: 0.82,
    platform_fee: 0,
    net_amount_owed_salon: 17.18,
    balance_due: 162,
    deposit_status: "Succeeded",
    refund_status: "Not applicable",
    refund_amount: 0,
    payout_status: "Paid",
    status: "Confirmed",
    stripe_charge_id: "ch_live_upcoming",
    payment_mode: "live",
  },
  {
    name: "Crowned Collective",
    address_city: "Atlanta",
    address_state: "GA",
  },
  { name: "Box Braids" },
  undefined,
);

const pending = bookingTransaction(
  {
    id: "33333333-3333-4333-8333-333333333333",
    created_at: "2026-07-22T11:00:00.000Z",
    appointment_datetime: "2026-08-05T15:00:00.000Z",
    confirmation_code: "GC-PENDING",
    salon_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    estimated_total: 120,
    deposit_amount: 12,
    balance_due: 108,
    deposit_status: "Pending",
    payout_status: "Not configured",
    status: "Requested",
    payment_mode: "test",
  },
  {
    name: "Crowned Collective",
    address_city: "Atlanta",
    address_state: "GA",
  },
);

assert.equal(
  pending.deposit_collected,
  0,
  "Unverified deposits must not be counted as collected revenue.",
);
assert.equal(
  paidUpcoming.deposit_collected,
  18,
  "A verified deposit for a future appointment must remain in the ledger.",
);

const rows = [paidCompleted, paidUpcoming, pending];
const allFilters = {
  from: "",
  to: "",
  state: "all",
  city: "all",
  salon: "all",
  paymentStatus: "all",
  payoutStatus: "all",
  mode: "all",
};

assert.deepEqual(
  filterBookingTransactions(rows, { ...allFilters, state: "NY" }).map(
    (row) => row.confirmation_code,
  ),
  ["GC-PAID"],
  "State filtering must use the salon's structured state.",
);
assert.deepEqual(
  filterBookingTransactions(rows, { ...allFilters, mode: "live" }).map(
    (row) => row.confirmation_code,
  ),
  ["GC-UPCOMING"],
  "Test and live Stripe transactions must be distinguishable.",
);
assert.deepEqual(
  filterBookingTransactions(rows, {
    ...allFilters,
    from: "2026-07-22",
    to: "2026-07-22",
  }).map((row) => row.confirmation_code),
  ["GC-UPCOMING", "GC-PENDING"],
  "Date boundaries must include the entire selected day.",
);

const summary = summarizeBookingTransactions(rows);
assert.deepEqual(summary, {
  adjustedTotal: 530,
  deposits: 41,
  refunds: 0,
  processingFees: 1.79,
  platformFees: 0,
  netOwed: 39.21,
  balanceDue: 477,
  completedBookingValue: 230,
});
assert.equal(
  summary.completedBookingValue,
  paidCompleted.adjusted_total,
  "Completed booking value must exclude future and requested appointments.",
);

const csv = financeCsv(rows);
assert.match(
  csv,
  /"'=Finance formula"/,
  "CSV exports must neutralize spreadsheet formula injection.",
);
assert.doesNotMatch(
  csv.toLowerCase(),
  /email|phone/,
  "Finance exports must not include unnecessary email or phone data.",
);
assert.match(csv, /GC-UPCOMING/);

const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
process.env.STRIPE_WEBHOOK_SECRET = "whsec_finance_verification";
const eventBody = JSON.stringify({
  id: "evt_verified",
  type: "checkout.session.completed",
  created: 1784822400,
  data: { object: { id: "cs_test_verified", livemode: false } },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac(
  "sha256",
  process.env.STRIPE_WEBHOOK_SECRET,
)
  .update(`${timestamp}.${eventBody}`)
  .digest("hex");
assert.equal(
  verifyStripeEvent(eventBody, `t=${timestamp},v1=${signature}`).id,
  "evt_verified",
  "A correctly signed Stripe event must be accepted.",
);
assert.throws(
  () => verifyStripeEvent(eventBody, `t=${timestamp},v1=${"0".repeat(64)}`),
  /Invalid Stripe signature/,
  "A forged Stripe event must be rejected before reconciliation.",
);
if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;

const migration = fs.readFileSync(
  "supabase/migrations/20260723240000_finance_reconciliation.sql",
  "utf8",
);
for (const requirement of [
  /add column if not exists stripe_processing_fee/,
  /add column if not exists platform_fee/,
  /add column if not exists net_amount_owed_salon/,
  /create or replace function public\.begin_stripe_webhook_event/,
  /processing_status in \('Processing','Processed','Failed'\)/,
  /grant execute on function public\.begin_stripe_webhook_event[\s\S]*to service_role/,
  /payments\.platform_fee_percentage/,
]) {
  assert.match(migration, requirement);
}

const webhook = fs.readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
assert.ok(
  webhook.indexOf("verifyStripeEvent(") <
    webhook.indexOf('"begin_stripe_webhook_event"'),
  "Stripe signatures must be verified before an event can enter the ledger.",
);
for (const requirement of [
  /stripe_processing_fee:\s*processingFee/,
  /net_amount_owed_salon:[\s\S]*chargeNet[\s\S]*deposit_amount[\s\S]*processingFee/,
  /payment_mode:\s*session\.livemode\s*\?\s*"live"\s*:\s*"test"/,
  /processing_status:\s*"Failed"/,
  /error_reference:\s*reference/,
]) {
  assert.match(webhook, requirement);
}
assert.doesNotMatch(
  webhook,
  /from\("stripe_webhook_events"\)\s*\.delete\(/,
  "Failed Stripe events must remain in the operational ledger for retry and audit.",
);

const subscriptionChange = fs.readFileSync(
  "src/app/api/stripe/subscription/change/route.ts",
  "utf8",
);
for (const requirement of [
  /\/invoices\/create_preview/,
  /preview_proration_date:\s*prorationDate/,
  /proration_date:\s*prorationDate/,
  /const upgradeConfirmed\s*=/,
]) {
  assert.match(subscriptionChange, requirement);
}
assert.ok(
  subscriptionChange.indexOf("const upgradeConfirmed") <
    subscriptionChange.indexOf(
      'from("subscriptions").update',
      subscriptionChange.indexOf("const upgradeConfirmed"),
    ),
  "Plan features must not activate until Stripe confirms the upgrade.",
);

console.log(
  "Finance reconciliation verification passed: exact ledger math, structured filters, completed-versus-upcoming classification, safe CSV export, signed Stripe event handling, durable webhook retries, and verified subscription-upgrade previews are covered.",
);
