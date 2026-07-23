import { readFileSync } from "node:fs";

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error("Usage: node scripts/verify-production-baseline-dump.mjs <schema-dump.sql>");
  process.exit(1);
}

const dump = readFileSync(dumpPath, "utf8");
const expectedColumns = {
  salons: [
    "id", "name", "slug", "description", "phone", "email", "address_street",
    "address_city", "address_state", "address_zip", "neighborhood", "latitude",
    "longitude", "hours", "cover_photo_url", "gallery_photos", "status",
    "verification_status", "subscription_tier", "stripe_account_id", "badges",
    "rating_overall", "review_count", "capacity", "languages", "date_joined",
    "created_at",
  ],
  stylists: ["id", "salon_id", "name", "specialties", "bio", "photos", "is_active", "created_at"],
  styles: [
    "id", "salon_id", "name", "category", "description", "duration_min_hours",
    "duration_max_hours", "base_price", "size_options", "length_options",
    "addons", "hair_included", "photos", "price_display_min",
    "price_display_max", "created_at",
  ],
  style_materials: [
    "id", "style_id", "name", "price", "longevity", "quality_note",
    "is_bring_your_own", "created_at",
  ],
  customers: [
    "id", "name", "email", "phone", "saved_salons", "reliability_status",
    "no_show_count", "created_at",
  ],
  bookings: [
    "id", "customer_id", "salon_id", "stylist_id", "style_id", "selected_size",
    "selected_length", "selected_material_id", "selected_addons",
    "appointment_datetime", "duration_hours", "estimated_total",
    "deposit_amount", "deposit_status", "balance_due", "confirmation_code",
    "status", "stripe_payment_id", "created_at",
  ],
  reviews: [
    "id", "booking_id", "customer_id", "salon_id", "stylist_id",
    "rating_overall", "rating_price_accuracy", "rating_punctuality",
    "rating_quality", "rating_cleanliness", "would_return", "written_review",
    "result_photos", "salon_reply", "dispute_status", "created_at",
  ],
  subscriptions: [
    "id", "salon_id", "tier", "status", "billing_start",
    "stripe_subscription_id", "created_at",
  ],
  availability: [
    "id", "salon_id", "stylist_id", "day_of_week", "start_time", "end_time",
    "is_blocked", "created_at",
  ],
  admin_users: ["id", "name", "email", "role", "created_at"],
  complaints_log: [
    "id", "salon_id", "customer_id", "booking_id", "type", "description",
    "status", "created_at",
  ],
};

const failures = [];
for (const [table, columns] of Object.entries(expectedColumns)) {
  const tableMatch = dump.match(
    new RegExp(`CREATE TABLE public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"),
  );
  if (!tableMatch) {
    failures.push(`public.${table}: table definition not found`);
    continue;
  }
  for (const column of columns) {
    if (!new RegExp(`^\\s{4}${column}\\s+`, "mi").test(tableMatch[1])) {
      failures.push(`public.${table}.${column}: baseline column not found`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Production baseline preflight verified all 11 tables and 130 prerequisite columns.");
