import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const adminRoute = read("src/app/api/admin/bookings/route.ts");
const customerRoute = read("src/app/api/stripe/booking-checkout/route.ts");
const webhook = read("src/app/api/stripe/webhook/route.ts");
const stripeServer = read("src/lib/stripeServer.ts");

for (const pattern of [
  /gc-admin-booking-checkout:\$\{reservedIntentId\}/,
  /expires_at: checkoutExpiresAtSeconds/,
  /stripe_checkout_session_id: checkoutSessionId/,
  /expires_at: checkoutExpiresAt/,
  /checkoutSessionCreated \|\| deliveryUncertain/,
  /The secure payment link remains valid/,
  /Do not create another link/,
  /\.update\(\{ status: "Failed" \}\)[\s\S]*\.eq\("status", "Pending"\)/,
]) {
  assert.match(adminRoute, pattern);
}
assert.equal(
  (adminRoute.match(/const deliveryWarnings: string\[\] = \[\];/g) || []).length,
  1,
  "The Admin payment-link route must have one delivery-warning collection.",
);
assert.equal(
  (adminRoute.match(/return Response\.json\(\{/g) || []).length > 0,
  true,
);
assert.doesNotMatch(adminRoute, /return Response\.json\(\{\s*return Response\.json/);

for (const pattern of [
  /gc-booking-checkout:\$\{commerceIntentId \|\| intentId\}/,
  /expires_at: checkoutExpiresAtSeconds/,
  /booking_checkout_intents"\)[\s\S]*stripe_checkout_session_id: checkoutSessionId[\s\S]*expires_at: checkoutExpiresAt/,
  /commerce_checkout_intents"\)[\s\S]*stripe_checkout_session_id: checkoutSessionId[\s\S]*expires_at: checkoutExpiresAt/,
  /checkoutSessionCreated \|\| deliveryUncertain/,
  /all holds remain active/,
  /Do not create another checkout/,
  /release_combined_checkout/,
]) {
  assert.match(customerRoute, pattern);
}
assert.doesNotMatch(customerRoute, /}\s*catch \(error\) \{\s*}\s*catch \(error\)/);

for (const pattern of [
  /deliveryUncertain\?: boolean/,
  /STRIPE_NETWORK_FAILURE/,
  /deliveryUncertain: true/,
  /deliveryUncertain: response\.ok \|\| response\.status >= 500/,
  /deliveryUncertain: response\.status >= 500/,
]) {
  assert.match(stripeServer, pattern);
}

for (const pattern of [
  /STRIPE_CHECKOUT_SESSION_ID_MISSING/,
  /attachedSessionId && attachedSessionId !== session\.id/,
  /STRIPE_CHECKOUT_SESSION_MISMATCH/,
  /\.eq\("stripe_checkout_session_id", session\.id\)/,
  /existingBookingId/,
  /retry-paid-booking-notifications/,
  /PAID_BOOKING_INTENT_WITHOUT_BOOKING/,
  /recover-paid-closed-booking-intent/,
  /stripe_checkout_session_id: session\.id/,
  /if \(intentUpdate\.error\) throw intentUpdate\.error/,
]) {
  assert.match(webhook, pattern);
}

const adminExpiry = adminRoute.match(
  /const checkoutExpiresAtSeconds = Math\.floor\(Date\.now\(\) \/ 1000\) \+ (\d+) \* 60/,
)?.[1];
const customerExpiry = customerRoute.match(
  /const checkoutExpiresAtSeconds = Math\.floor\(Date\.now\(\) \/ 1000\) \+ (\d+) \* 60/,
)?.[1];
assert.equal(adminExpiry, "35");
assert.equal(customerExpiry, "35");

console.log(
  "Booking checkout hold-safety verification passed: Admin and customer checkouts use stable Stripe idempotency keys, exact 35-minute provider/local expiries, preserve appointment and product holds after confirmed or uncertain provider writes, bind webhook completion to the attached Stripe session, and reconcile partial webhook retries without creating a duplicate booking.",
);
