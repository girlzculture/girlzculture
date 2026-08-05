import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSmsResetDestination } from "../src/lib/passwordResetIdentityCore.ts";

const attackerPhone = "+1 (646) 555-0199";
const canonicalPhone = "+12125550100";

assert.deepEqual(
  resolveSmsResetDestination(
    {
      phone: null,
      phone_confirmed_at: null,
      // An untrusted metadata number must never become a recovery destination.
      user_metadata: { phone: attackerPhone },
    },
    attackerPhone,
  ),
  { eligible: false, canonicalPhone: "" },
  "an attacker number must not become the destination when auth has no phone",
);
assert.deepEqual(
  resolveSmsResetDestination(
    { phone: canonicalPhone, phone_confirmed_at: null },
    canonicalPhone,
  ),
  { eligible: false, canonicalPhone: "" },
  "an unconfirmed auth phone must not receive recovery codes",
);
assert.deepEqual(
  resolveSmsResetDestination(
    { phone: canonicalPhone, phone_confirmed_at: "2026-08-04T12:00:00.000Z" },
    attackerPhone,
  ),
  { eligible: false, canonicalPhone: "" },
  "a caller phone mismatch must not receive a recovery code",
);
assert.deepEqual(
  resolveSmsResetDestination(
    { phone: canonicalPhone, phone_confirmed_at: "2026-08-04T12:00:00.000Z" },
    "+1 (212) 555-0100",
  ),
  { eligible: true, canonicalPhone },
  "a matching caller value must resolve to the stored canonical auth phone",
);

const requestRoute = readFileSync(
  "src/app/api/auth/password-reset/request/route.ts",
  "utf8",
);
const verifyRoute = readFileSync(
  "src/app/api/auth/password-reset/verify/route.ts",
  "utf8",
);
const completeRoute = readFileSync(
  "src/app/api/auth/password-reset/complete/route.ts",
  "utf8",
);

assert.match(requestRoute, /resolveSmsResetDestination\(user, body\.phone\)/);
assert.match(requestRoute, /sendSms\(canonicalPhone,/);
assert.match(requestRoute, /email: canonicalEmail, phone: canonicalPhone \|\| null/);
assert.doesNotMatch(requestRoute, /user_metadata\?\.phone/);
assert.doesNotMatch(requestRoute, /body\.phone \|\|/);
assert.doesNotMatch(requestRoute, /sendSms\([^c]/);
assert.equal(
  (requestRoute.match(/genericResetResponse\(/g) || []).length >= 5,
  true,
  "unknown, ineligible, successful, and provider-failure outcomes must share one response shape",
);
assert.doesNotMatch(requestRoute, /phone number does not match/i);
assert.doesNotMatch(requestRoute, /A reset code was sent by/);

for (const route of [verifyRoute, completeRoute]) {
  assert.doesNotMatch(route, /body\.(?:phone|email|user_id)/);
  assert.match(route, /password_reset_codes/);
}
assert.match(verifyRoute, /\.eq\("id", requestId\)/);
assert.match(completeRoute, /updateUserById\(row\.user_id/);
assert.match(completeRoute, /row\.ticket_hash !== resetHash\(ticket\)/);

console.log(
  "Verified password-reset request, verification, and completion boundaries: SMS requires the confirmed canonical auth phone, caller input is comparison-only, public request responses are enumeration-safe, and the verified reset row remains bound to its auth user.",
);
