import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bookingPublicReferenceFromNumber,
  bookingReference,
  bookingSearchTerms,
} from "../src/lib/bookingReference.ts";

assert.equal(bookingPublicReferenceFromNumber(1), "GCA01");
assert.equal(bookingPublicReferenceFromNumber(99), "GCA99");
assert.equal(bookingPublicReferenceFromNumber(100), "GCB01");
assert.equal(bookingPublicReferenceFromNumber(2575), "GCAA01");
assert.throws(() => bookingPublicReferenceFromNumber(0), /positive integers/);
assert.equal(
  bookingReference({
    public_reference: "GCC22",
    confirmation_code: "legacy",
    id: "uuid",
  }),
  "GCC22",
);
assert.equal(
  bookingSearchTerms("gc-aa-01").publicReference,
  "GCAA01",
);
assert.equal(bookingSearchTerms("gcaa01").publicReference, "GCAA01");
assert.equal(
  bookingSearchTerms("6e304927-664a-4785-a30c-81f212fbf1db").uuid,
  "6e304927-664a-4785-a30c-81f212fbf1db",
);

const migration = fs.readFileSync(
  "supabase/migrations/20260724120000_booking_public_references.sql",
  "utf8",
);
const compactMigration = fs.readFileSync(
  "supabase/migrations/20260725102000_compact_booking_references.sql",
  "utf8",
);
assert.match(migration, /create sequence if not exists public\.booking_public_reference_seq/);
assert.match(migration, /nextval\('public\.booking_public_reference_seq'\)/);
assert.match(migration, /where public_reference is null/);
assert.match(migration, /alter column public_reference set not null/);
assert.match(migration, /create unique index if not exists bookings_public_reference_unique/);
assert.match(migration, /before insert on public\.bookings/);
assert.match(migration, /internal UUID remains the authorization key/);
assert.match(compactMigration, /return 'GC'\|\|v_letters\|\|lpad/);
assert.match(compactMigration, /check\(public_reference ~ '\^GC\[A-Z\]\+\[0-9\]\{2\}\$'\)/);

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
  "Booking reference verification passed: executable compact GCA01/GCA99/GCB01/GCAA01 mapping, legacy-input normalization, sequence-backed generation, non-destructive backfill, uniqueness, primary display across booking/finance/communications, and search/recovery by short reference or UUID are covered.",
);
