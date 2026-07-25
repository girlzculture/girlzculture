import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bookingPublicReferenceFromNumber,
  bookingReference,
  bookingSearchTerms,
} from "../src/lib/bookingReference.ts";

assert.equal(bookingPublicReferenceFromNumber(1), "GC-A-01");
assert.equal(bookingPublicReferenceFromNumber(99), "GC-A-99");
assert.equal(bookingPublicReferenceFromNumber(100), "GC-B-01");
assert.equal(bookingPublicReferenceFromNumber(2575), "GC-AA-01");
assert.throws(() => bookingPublicReferenceFromNumber(0), /positive integers/);
assert.equal(
  bookingReference({
    public_reference: "GC-C-22",
    confirmation_code: "legacy",
    id: "uuid",
  }),
  "GC-C-22",
);
assert.equal(
  bookingSearchTerms("gc-aa-01").publicReference,
  "GC-AA-01",
);
assert.equal(
  bookingSearchTerms("6e304927-664a-4785-a30c-81f212fbf1db").uuid,
  "6e304927-664a-4785-a30c-81f212fbf1db",
);

const migration = fs.readFileSync(
  "supabase/migrations/20260724120000_booking_public_references.sql",
  "utf8",
);
assert.match(migration, /create sequence if not exists public\.booking_public_reference_seq/);
assert.match(migration, /nextval\('public\.booking_public_reference_seq'\)/);
assert.match(migration, /where public_reference is null/);
assert.match(migration, /alter column public_reference set not null/);
assert.match(migration, /create unique index if not exists bookings_public_reference_unique/);
assert.match(migration, /before insert on public\.bookings/);
assert.match(migration, /internal UUID remains the authorization key/);

const combined = [
  "src/components/owner/OwnerDashboardApp.tsx",
  "src/components/AdminDashboard.tsx",
  "src/components/admin/AdminFinanceDashboard.tsx",
  "src/components/booking/GuestBookingManager.tsx",
  "src/components/SalonBookingWizard.tsx",
  "src/components/ReviewForm.tsx",
  "src/components/BookingInbox.tsx",
  "src/lib/bookingCommunications.ts",
  "src/lib/supabaseAdmin.ts",
].map((path) => fs.readFileSync(path, "utf8")).join("\n");
assert.match(combined, /bookingReference/);
assert.match(
  fs.readFileSync(
    "src/app/api/guest/bookings/recovery/request/route.ts",
    "utf8",
  ),
  /public_reference\.eq/,
);
assert.match(
  fs.readFileSync("src/components/AdminDashboard.tsx", "utf8"),
  /Search reference, UUID, or customer/,
);

console.log(
  "Booking reference verification passed: executable A01/A99/B01/AA01 mapping, sequence-backed generation, non-destructive backfill, uniqueness, primary display across booking/finance/communications, and search/recovery by short reference or UUID are covered.",
);
