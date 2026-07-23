import assert from "node:assert/strict";
import fs from "node:fs";
import {
  renderBookingCancellation,
  renderCustomerBookingConfirmation,
  renderSalonBookingConfirmation,
} from "../src/lib/bookingCommunications.ts";

const input = {
  booking: {
    id: "bkg_123",
    confirmation_code: "GC-AB12",
    guest_name: "Janel <Smith>",
    guest_email: "janel@example.com",
    guest_phone: "(404) 555-0198",
    client_notes: "Sensitive scalp",
    selected_size: "Medium",
    selected_length: "Waist",
    selected_addons: ["Boho curls"],
    selected_options: { finish: ["Scalp treatment"] },
    subtotal_before_promotion: 300,
    promotion_discount_amount: 20,
    discount_amount: 10,
    estimated_total: 270,
    deposit_amount: 27,
    balance_due: 243,
    payment_method_label: "Visa ending in 4242",
  },
  salon: {
    name: "The Braid Lounge",
    email: "hello@example.com",
    phone: "(404) 555-0100",
    full_address: "123 Beauty Lane, Atlanta, GA 30303",
    time_zone: "America/New_York",
  },
  style: { name: "Knotless Braids", base_price: 250 },
  stylist: { name: "Aaliyah J." },
  material: { name: "Premium Kanekalon" },
  when: "Friday, July 24, 2026 at 10:00 AM",
  duration: "5 hours",
  depositPercentage: 10,
  manageUrl: "https://girlzculture.com/manage/signed",
  dashboardUrl: "https://girlzculture.com/salon/dashboard/bookings?booking=bkg_123",
  directionsUrl: "https://maps.example/directions",
  receiptUrl: "https://pay.stripe.com/receipts/test",
  policy: "Use the secure link for cancellation or rescheduling.",
  intro: "Your appointment is secured.",
  footer: "Contact support if you did not make this booking.",
};

const customer = renderCustomerBookingConfirmation(input);
const salon = renderSalonBookingConfirmation(input);
const cancellation = renderBookingCancellation({
  ...input,
  audience: "customer",
  cancelledBy: "Salon owner",
  reason: "Stylist unavailable",
  refundStatus: "$27.00 refunded in full",
  nextAction: "No further action is required.",
  browseUrl: "https://girlzculture.com/salons",
});

for (const required of [
  "GC-AB12",
  "bkg_123",
  "The Braid Lounge",
  "123 Beauty Lane, Atlanta, GA 30303",
  "Knotless Braids",
  "Medium",
  "Waist",
  "Boho curls",
  "Scalp treatment",
  "Premium Kanekalon",
  "Aaliyah J.",
  "America/New_York",
  "5 hours",
  "$300.00",
  "-$30.00",
  "$270.00",
  "10%",
  "$27.00",
  "$243.00",
  "Visa ending in 4242",
  "Stripe receipt",
  "Cancellation &amp; rescheduling",
]) {
  assert.match(customer, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.doesNotMatch(salon, /Janel <Smith>/);
assert.match(salon, /Janel &lt;Smith&gt;/);
for (const required of [
  "Janel &lt;Smith&gt;",
  "janel@example.com",
  "Sensitive scalp",
  "Deposit collected",
  "Collect at salon",
]) {
  assert.match(salon, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const required of [
  "Booking cancellation details",
  "Original appointment",
  "Salon owner",
  "Stylist unavailable",
  "$27.00 refunded in full",
  "No further action is required.",
  "Find another salon",
]) {
  assert.match(cancellation, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.ok(
  cancellation.indexOf("Deposit / refund status") <
    cancellation.indexOf("Find another salon"),
  "The complete cancellation breakdown must precede the browse action.",
);

const adminSource = fs.readFileSync("src/lib/supabaseAdmin.ts", "utf8");
const webhookSource = fs.readFileSync(
  "src/app/api/stripe/webhook/route.ts",
  "utf8",
);
assert.match(adminSource, /renderCustomerBookingConfirmation/);
assert.match(adminSource, /renderSalonBookingConfirmation/);
assert.match(adminSource, /renderBookingCancellation/);
assert.match(adminSource, /reply_to/);
assert.match(webhookSource, /stripe_receipt_url/);
assert.match(webhookSource, /expand\[\]=latest_charge/);
assert.match(webhookSource, /payment_method_label/);

console.log(
  "Booking communication verification passed: locked confirmation, financial, receipt, salon, and cancellation details are rendered and wired.",
);
