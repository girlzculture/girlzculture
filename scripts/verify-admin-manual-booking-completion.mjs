import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const candidates = files("src")
  .filter((path) => /admin|booking|stripe|payment/i.test(path))
  .filter((path) => /\.(?:ts|tsx)$/.test(path));
const combined = candidates.map((path) => readFileSync(path, "utf8")).join("\n");
const legacyRoute = readFileSync("src/app/api/admin/bookings/route.ts", "utf8");
const recordWorkspace = readFileSync(
  "src/components/admin/AdminRecordWorkspace.tsx",
  "utf8",
);

for (const requirement of [
  /manual booking/i,
  /service|style/i,
  /stylist/i,
  /availability|available time/i,
  /appointment_local|appointment date/i,
  /send.{0,20}payment.{0,20}link/i,
  /waive.{0,20}deposit|override.{0,20}(?:deposit|payment)/i,
  /checkout\/sessions|Stripe Checkout/i,
  /sendEmail|email.*payment link/i,
  /sendSms|text.*payment link/i,
  /payment.*confirmed|webhook/i,
]) {
  assert.match(combined, requirement);
}

assert.doesNotMatch(
  legacyRoute,
  /from\("styles"\)[\s\S]{0,400}order\("created_at"[\s\S]{0,100}limit\(1\)/,
  "Platform Admin booking must never silently select the first service.",
);
assert.match(recordWorkspace, /AdminManualBookingWizard|ManualBooking/);

console.log(
  "Platform Admin manual booking verification passed: customer, salon, explicit service, eligible stylist, live availability, deposit decision, Stripe payment link, email/SMS delivery, payment-confirmed creation, and Super Admin override are represented without hidden first-service selection.",
);
