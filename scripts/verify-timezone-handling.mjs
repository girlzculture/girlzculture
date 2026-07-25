import assert from "node:assert/strict";
import fs from "node:fs";

const dateTime = await import("../src/lib/dateTime.ts");

assert.equal(
  dateTime.zonedLocalToUtc(
    "2026-07-25T10:00",
    "America/New_York",
  ).toISOString(),
  "2026-07-25T14:00:00.000Z",
  "A salon wall-clock time must be converted to UTC before storage.",
);
assert.throws(
  () =>
    dateTime.zonedLocalToUtc("2026-03-08T02:30", "America/New_York"),
  /does not exist/i,
  "The spring-forward gap must be rejected.",
);
assert.equal(
  dateTime.zonedLocalToUtc(
    "2026-11-01T01:30",
    "America/New_York",
  ).toISOString(),
  "2026-11-01T05:30:00.000Z",
  "An ambiguous fall-back time must deterministically choose its first occurrence.",
);
assert.match(
  dateTime.formatZonedDateTime(
    "2026-07-25T14:00:00.000Z",
    "America/Los_Angeles",
  ),
  /7:00 AM PDT/,
);
assert.equal(
  dateTime.adminTimeZone("Not/A-Timezone"),
  "America/New_York",
);

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read(
  "supabase/migrations/20260724140000_timezone_preferences.sql",
);
const financeRoute = read("src/app/api/admin/finance/route.ts");
const financeUi = read("src/components/admin/AdminFinanceDashboard.tsx");
const bookingRoute = read("src/app/api/admin/bookings/[id]/route.ts");
const bookingUi = read("src/components/admin/AdminBookingEditor.tsx");
const preferenceRoute = read(
  "src/app/api/admin/preferences/time-zone/route.ts",
);

assert.match(migration, /admin_users[\s\S]*time_zone/);
assert.match(migration, /validate_time_zone_preference/);
assert.match(migration, /localization\.default_admin_time_zone/);
assert.match(
  migration,
  /localization\.default_admin_time_zone[\s\S]*'Published',\s*'standard'/,
  "The timezone setting must use an impact level accepted by the canonical Engine constraint.",
);
assert.doesNotMatch(
  migration,
  /'operational'/,
  "Operational is not a valid Engine impact level.",
);
assert.match(financeRoute, /admin_time_zone/);
assert.match(financeUi, /formatZonedDateTime/);
assert.match(financeUi, /financeCsv\(filtered, data\.admin_time_zone\)/);
assert.match(bookingRoute, /formatZonedDateTime/);
assert.match(bookingUi, /adminTimeZone/);
assert.match(preferenceRoute, /isValidTimeZone/);

console.log(
  "Timezone verification passed: UTC storage conversion, salon rendering, admin preferences, timezone-labelled finance exports, and deterministic DST transition behavior are covered.",
);
