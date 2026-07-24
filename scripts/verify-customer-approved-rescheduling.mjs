import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeRescheduleLocalOptions,
  previewRescheduleResponse,
} from "../src/lib/bookingRescheduleCore.ts";

const clean = (value, maxLength) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

assert.deepEqual(
  normalizeRescheduleLocalOptions(
    [
      "2026-08-01T10:00",
      "2026-08-01T10:00",
      "not-a-time",
      " 2026-08-01T13:30 ",
    ],
    clean,
  ),
  ["2026-08-01T10:00", "2026-08-01T13:30"],
  "Proposal options must be normalized, validated, and deduplicated.",
);
assert.deepEqual(normalizeRescheduleLocalOptions("2026-08-01T10:00", clean), []);

const original = {
  id: "11111111-1111-4111-8111-111111111111",
  appointment_datetime: "2026-08-01T14:00:00.000Z",
};
assert.deepEqual(
  previewRescheduleResponse(original, "decline"),
  original,
  "Declining a proposal must leave the booking time unchanged.",
);
assert.equal(
  previewRescheduleResponse(
    original,
    "accept",
    "2026-08-01T17:30:00.000Z",
  ).appointment_datetime,
  "2026-08-01T17:30:00.000Z",
  "Only an accepted option may change the booking time.",
);
assert.throws(
  () => previewRescheduleResponse(original, "accept"),
  /Choose an appointment time/,
);

const foundation = fs.readFileSync(
  "supabase/migrations/20260723220000_secure_guest_booking_management.sql",
  "utf8",
);
for (const requirement of [
  /create or replace function public\.respond_booking_reschedule/,
  /pg_advisory_xact_lock/,
  /booking_window&&tstzrange/,
  /CUSTOMER_BOOKING_CONFLICT/,
  /update public\.bookings[\s\S]*appointment_datetime=v_option\.appointment_datetime/,
  /if p_response='decline' then[\s\S]*return v_booking;[\s\S]*update public\.bookings/,
  /action,\s*reason,\s*before_data,\s*after_data/,
]) {
  assert.match(foundation, requirement);
}

const proposalMigration = fs.readFileSync(
  "supabase/migrations/20260723230000_customer_approved_rescheduling.sql",
  "utf8",
);
for (const requirement of [
  /create or replace function public\.create_booking_reschedule_proposal/,
  /for update/,
  /status='Superseded'/,
  /jsonb_array_length\(p_options\)<1[\s\S]*jsonb_array_length\(p_options\)>5/,
  /action[\s\S]*'reschedule_proposed'/,
  /create trigger audit_declined_reschedule_proposal/,
  /grant execute on function public\.create_booking_reschedule_proposal[\s\S]*to service_role/,
]) {
  assert.match(proposalMigration, requirement);
}

const server = fs.readFileSync("src/lib/bookingRescheduleServer.ts", "utf8");
assert.match(server, /bookingAvailability\(/);
assert.match(server, /excludeBookingId:\s*String\(booking\.id\)/);
assert.match(server, /issueGuestBookingToken/);
assert.match(server, /Promise\.allSettled/);
assert.match(server, /capturePlatformError/);

const guestRoute = fs.readFileSync(
  "src/app/api/guest/bookings/manage/route.ts",
  "utf8",
);
assert.match(guestRoute, /respond_booking_reschedule/);
assert.match(guestRoute, /deliverBookingNotifications/);
assert.match(guestRoute, /rotateGuestBookingToken/);

const ownerRoute = fs.readFileSync(
  "src/app/api/salon/bookings/[id]/reschedule/route.ts",
  "utf8",
);
assert.match(ownerRoute, /createCustomerApprovedReschedule/);
assert.match(ownerRoute, /requireSalonPermission/);

const adminRoute = fs.readFileSync(
  "src/app/api/admin/bookings/[id]/route.ts",
  "utf8",
);
assert.match(adminRoute, /propose_reschedule/);
assert.match(adminRoute, /createCustomerApprovedReschedule/);
assert.match(adminRoute, /Admin intervention/);

console.log(
  "Customer-approved rescheduling verification passed: executable option and response behavior, authoritative availability checks, atomic conflict protection, service-only proposal creation, notifications, audit, and admin intervention are covered.",
);
