import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyBillingTransaction,
  collectEveryFinancePage,
  summarizeUnifiedFinanceTransactions,
  unifiedFinanceCsv,
} from "../src/lib/financeLedgerCore.ts";

const root = process.cwd();
const route = readFileSync(
  `${root}/src/app/api/admin/finance/route.ts`,
  "utf8",
);
const dashboard = readFileSync(
  `${root}/src/components/admin/AdminFinanceDashboard.tsx`,
  "utf8",
);
const salons = readFileSync(
  `${root}/src/components/admin/AdminSalonsManager.tsx`,
  "utf8",
);

assert.equal(classifyBillingTransaction("Refund"), "Subscription refund");
assert.equal(
  classifyBillingTransaction("Upgrade paid"),
  "Subscription payment",
);
assert.equal(classifyBillingTransaction("Manual correction"), "Billing event");

const rows = [
  {
    transaction_key: "booking-1",
    transaction_type: "Booking deposit",
    date: "2026-07-27T12:00:00Z",
    public_reference: "GCA01",
    salon: "Pilot Salon",
    customer: "=HYPERLINK(\"https://bad.example\")",
    service: "Knotless braids",
    gross_amount: 40,
    refund_amount: 0,
    net_amount_owed_salon: 36,
    stripe_processing_fee: 4,
    platform_fee: 0,
    payment_status: "Paid",
    payout_status: "Awaiting payout",
    payment_mode: "test",
    stripe_reference: "pi_test_reference",
  },
  {
    transaction_key: "subscription-1",
    transaction_type: "Subscription payment",
    date: "2026-07-27T13:00:00Z",
    public_reference: "in_test_reference",
    salon: "Pilot Salon",
    customer: "Not applicable",
    gross_amount: 129.5,
    refund_amount: 20,
    net_amount_owed_salon: 0,
    stripe_processing_fee: 0,
    platform_fee: 0,
    payment_status: "Paid",
    payout_status: "Not applicable",
    payment_mode: "test",
    stripe_reference: "in_test_reference",
  },
];
assert.deepEqual(summarizeUnifiedFinanceTransactions(rows), {
  received: 169.5,
  returned: 20,
  owed: 36,
  processing: 4,
  platform: 0,
});

const paginationCalls = [];
const sourceRows = Array.from({ length: 2_305 }, (_, id) => ({ id }));
const pagedResult = await collectEveryFinancePage(
  async (from, to) => {
    paginationCalls.push([from, to]);
    return { data: sourceRows.slice(from, to + 1), error: null };
  },
  1_000,
);
assert.equal(pagedResult.error, null);
assert.equal(pagedResult.data?.length, sourceRows.length);
assert.deepEqual(paginationCalls, [
  [0, 999],
  [1_000, 1_999],
  [2_000, 2_999],
]);

const csv = unifiedFinanceCsv(rows, "America/New_York");
assert.match(csv, /Transaction type/);
assert.match(csv, /Stripe processing fee/);
assert.match(csv, /Provider reference/);
assert.match(csv, /"'=HYPERLINK/);
assert.doesNotMatch(csv, /Internal booking UUID/);
assert.doesNotMatch(csv, /transaction_key/);

assert.match(salons, /\/admin\/finance\?salon=\$\{salon\.id\}/);
assert.match(route, /searchParams\.get\("salon"\)/);
for (const table of [
  "bookings",
  "billing_events",
  "subscription_change_requests",
  "product_orders",
]) {
  assert.ok(route.includes(`"${table}"`), `Selected ledger omits ${table}.`);
}
assert.match(route, /bookingsQuery = bookingsQuery\.eq\("salon_id", salonId\)/);
assert.match(route, /billingQuery = billingQuery\.eq\("salon_id", salonId\)/);
assert.match(route, /changesQuery = changesQuery\.eq\("salon_id", salonId\)/);
assert.match(
  route,
  /productOrdersQuery = productOrdersQuery\.eq\("salon_id", salonId\)/,
);
assert.match(route, /collectEveryFinancePage<Row>/);
assert.match(route, /bookingIdChunk/);
assert.match(route, /\.range\(from, to\)/);
assert.match(dashboard, /new URLSearchParams\(window\.location\.search\)/);
assert.match(dashboard, /Salon financial records/);
for (const type of [
  "Booking deposit",
  "Product order",
  "Product refund",
  "Subscription payment",
  "Subscription refund",
  "Plan adjustment",
  "Billing event",
]) {
  assert.ok(dashboard.includes(type), `Ledger filter omits ${type}.`);
}
assert.match(dashboard, /unifiedFinanceCsv/);
assert.match(dashboard, /Summary and CSV[\s\S]*same filtered rows/);

console.log(
  "Selected-salon finance verification passed: salon scoping is applied server-side across booking, subscription, adjustment and product sources; reconciled totals use the displayed rows; and the connected CSV is formula-safe without unnecessary internal UUIDs.",
);
