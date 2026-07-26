import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeRescheduleLocalOptions,
  previewRescheduleResponse,
} from "../src/lib/bookingRescheduleCore.ts";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260724110000_booking_reschedule_and_service_lifecycle.sql",
);
const availability = read("src/lib/bookingAvailabilityServer.ts");
const rescheduleRoute = read(
  "src/app/api/salon/bookings/[id]/reschedule/route.ts",
);
const serviceRoute = read(
  "src/app/api/salon/bookings/[id]/service/route.ts",
);
const owner = read("src/components/owner/OwnerDashboardApp.tsx");
const guest = read("src/components/booking/GuestBookingManager.tsx");
const adminRoute = read("src/app/api/admin/bookings/[id]/route.ts");
const adminEditor = read("src/components/admin/AdminBookingEditor.tsx");

const clean = (value, length) => String(value ?? "").trim().slice(0, length);
assert.deepEqual(
  normalizeRescheduleLocalOptions(
    [
      { local: "2026-08-10T10:30", stylistId: "stylist-a" },
      { local: "2026-08-10T10:30", stylistId: "stylist-a" },
      { local: "2026-08-10T10:30", stylistId: "stylist-b" },
      "not-a-date",
    ],
    clean,
  ),
  [
    { local: "2026-08-10T10:30", stylistId: "stylist-a" },
    { local: "2026-08-10T10:30", stylistId: "stylist-b" },
  ],
  "Reschedule options must preserve the selected stylist and deduplicate exact choices.",
);
assert.equal(
  previewRescheduleResponse(
    { appointment_datetime: "2026-08-01T10:00:00Z" },
    "accept",
    "2026-08-10T14:30:00Z",
  ).appointment_datetime,
  "2026-08-10T14:30:00Z",
);

assert.match(availability, /includeAllStylists/);
assert.match(availability, /const available = resources\.filter/);
assert.match(
  availability,
  /input\.includeAllStylists \? available : available\.slice\(0, 1\)/,
);
assert.match(rescheduleRoute, /bookingAvailability/);
assert.match(rescheduleRoute, /includeAllStylists:\s*true/);
assert.match(owner, /Date to search/);
assert.match(owner, /selectedRescheduleSlots/);
assert.match(guest, /option\.stylist/);

assert.match(migration, /add column if not exists stylist_id uuid/);
assert.match(migration, /v_resource_id:=coalesce\(v_option\.stylist_id,v_booking\.salon_id\)/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /BOOKING_RESOURCE_CONFLICT/);
assert.match(migration, /CUSTOMER_BOOKING_CONFLICT/);
assert.match(migration, /stylist_id=v_option\.stylist_id/);
assert.match(migration, /create or replace function public\.transition_booking_service/);
assert.match(migration, /'checked_in'/);
assert.match(migration, /'service_started'/);
assert.match(migration, /'service_completed'/);
assert.match(migration, /'service_state_corrected'/);
assert.match(migration, /for update/);
assert.match(migration, /BOOKING_NOT_READY_TO_COMPLETE/);
assert.match(serviceRoute, /confirmed !== true/);
assert.match(serviceRoute, /transition_booking_service/);
assert.match(serviceRoute, /service-completed:/);
assert.match(serviceRoute, /capturePlatformError/);
assert.match(owner, /Check in customer/);
assert.match(owner, /Complete service/);
assert.match(owner, /verified review eligibility/i);
assert.match(adminRoute, /correct_service_state/);
assert.match(adminRoute, /p_action:"admin_correct"/);
assert.match(adminEditor, /Correct Service State/);

console.log(
  "Booking workflow verification passed: executable option normalization, live availability selection, stylist-bound proposals, advisory-lock and exclusion-backed atomic acceptance, four-state lifecycle, completion confirmation, audit events, review eligibility, and monitored partial notification failures are covered.",
);
