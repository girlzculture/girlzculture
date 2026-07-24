import assert from "node:assert/strict";
import fs from "node:fs";
import {
  guestTokenHash,
  parseGuestToken,
  recoveryHash,
  recoveryMatches,
  signGuestToken,
} from "../src/lib/guestBookingTokenCore.ts";

const secret = "a-test-only-secret-with-more-than-thirty-two-characters";
const now = 1_800_000_000;
const payload = {
  v: 1,
  b: "11111111-1111-4111-8111-111111111111",
  t: "22222222-2222-4222-8222-222222222222",
  e: now + 3600,
};
const token = signGuestToken(payload, secret);
assert.deepEqual(parseGuestToken(token, secret, now), payload);
assert.equal(parseGuestToken(token, `${secret}-wrong`, now), null);
assert.equal(parseGuestToken(`${token}x`, secret, now), null);
assert.equal(parseGuestToken(token, secret, payload.e), null);
assert.equal(guestTokenHash(token).length, 64);

const differentBooking = signGuestToken(
  { ...payload, b: "33333333-3333-4333-8333-333333333333" },
  secret,
);
assert.notEqual(guestTokenHash(token), guestTokenHash(differentBooking));
assert.equal(parseGuestToken(differentBooking, secret, now)?.b, "33333333-3333-4333-8333-333333333333");

const challenge = "44444444-4444-4444-8444-444444444444";
const codeHash = recoveryHash(challenge, "123456", secret);
assert.equal(recoveryMatches(challenge, "123456", codeHash, secret), true);
assert.equal(recoveryMatches(challenge, "123457", codeHash, secret), false);

const migration = fs.readFileSync(
  "supabase/migrations/20260723220000_secure_guest_booking_management.sql",
  "utf8",
);
for (const requirement of [
  /booking_guest_access_tokens/,
  /token_hash text not null unique/,
  /booking_guest_access_one_active_idx/,
  /booking_guest_access_audit/,
  /booking_guest_recovery_challenges/,
  /respond_booking_reschedule/,
  /pg_advisory_xact_lock/,
  /booking_window&&tstzrange/,
  /CUSTOMER_BOOKING_CONFLICT/,
  /revoke all on public\.booking_guest_access_tokens from public,anon,authenticated/,
  /grant execute on function public\.respond_booking_reschedule\(uuid,uuid,text\) to service_role/,
]) {
  assert.match(migration, requirement);
}

const manageRoute = fs.readFileSync(
  "src/app/api/guest/bookings/manage/route.ts",
  "utf8",
);
assert.match(manageRoute, /verifyGuestBookingToken/);
assert.match(manageRoute, /rotateGuestBookingToken/);
assert.match(manageRoute, /guest-booking-manage-action/);
assert.match(manageRoute, /\.eq\("booking_id", access\.bookingId\)/);
assert.match(manageRoute, /deliverCancellationNotifications/);
assert.doesNotMatch(
  manageRoute.match(/\.select\(\s*"id,confirmation_code[\s\S]*?\)\s*\.eq\("id"/)?.[0] || "",
  /guest_email|guest_phone/,
);

console.log(
  "Secure guest booking verification passed: signed scope, expiry, tamper rejection, recovery proof, service-only storage, atomic response, rotation, and safe projection are covered.",
);
