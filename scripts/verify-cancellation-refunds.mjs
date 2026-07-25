import assert from "node:assert/strict";
import fs from "node:fs";

const core = await import("../src/lib/bookingCancellationCore.ts");

assert.equal(
  core.safeCancellationReason("Walk-in took the slot", "salon"),
  "Appointment availability changed",
);
assert.equal(
  core.safeCancellationReason("", "customer"),
  "Customer requested cancellation",
);
assert.equal(
  core.safeCancellationReason("Stylist is unavailable", "salon"),
  "Stylist is unavailable",
);
assert.equal(core.cancellationActorLabel("Admin"), "Girlz Culture support");
assert.equal(core.providerRefundStatus("pending"), "Pending");
assert.equal(core.providerRefundStatus("succeeded"), "Succeeded");
assert.match(
  core.refundCustomerSummary("Pending", 25, "2026-07-25T12:00:00Z"),
  /accepted.*pending/i,
);
assert.doesNotMatch(
  core.refundCustomerSummary("Pending", 25),
  /business day|bank account|completed/i,
);

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read(
  "supabase/migrations/20260724130000_cancellation_refund_controls.sql",
);
const salonRoute = read("src/app/api/salon/bookings/[id]/cancel/route.ts");
const adminRoute = read("src/app/api/admin/bookings/[id]/route.ts");
const guestRoute = read("src/app/api/guest/bookings/manage/route.ts");
const webhook = read("src/app/api/stripe/webhook/route.ts");
const messages = read("src/lib/supabaseAdmin.ts");
const email = read("src/lib/bookingCommunications.ts");
const checkout = read("src/components/SalonBookingWizard.tsx");

for (const required of [
  "cancellation_internal_reason",
  "cancellation_customer_reason",
  "cancellation_customer_message",
  "cancelled_by",
  "booking_refund_operations",
  "stripe_transfer_reversal_id",
  "booking.customer_cancellation_grace_minutes",
  "booking.customer_cancellation_legal_exceptions",
]) {
  assert.ok(migration.includes(required), `missing migration contract: ${required}`);
}
assert.ok(salonRoute.includes("requestBookingDepositRefund"));
assert.ok(adminRoute.includes('initiatedBy:"platform"'));
assert.ok(guestRoute.includes("refund_grace_applied"));
assert.ok(webhook.includes('"refund.updated"'));
assert.ok(webhook.includes("syncBookingRefund"));
assert.ok(messages.includes("cancellation_customer_reason"));
assert.ok(email.includes('button("Support"'));
assert.ok(checkout.includes("legally required exceptions"));
assert.ok(!salonRoute.includes("Walk-in took the slot"));
assert.ok(!messages.includes("No further action is required"));
assert.ok(!email.includes('row("Next action"'));

console.log(
  "Cancellation and refund verification passed: safe/public reasons, actor attribution, configurable grace disclosure, durable provider audit, Connect transfer reversal, pending-versus-complete status, webhook reconciliation, and compact customer communications are covered.",
);
