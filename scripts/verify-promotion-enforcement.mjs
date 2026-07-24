import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bestPromotionForContext,
  calculateSalonPromotion,
} from "../src/lib/salonPromotions.ts";

const now = new Date("2026-07-23T16:00:00.000Z");
const base = {
  id: "promotion-1",
  salon_id: "salon-1",
  title: "Knotless week",
  promotion_type: "percentage",
  discount_value: 20,
  status: "Active",
  is_active: true,
  starts_at: "2026-07-20T00:00:00.000Z",
  ends_at: "2026-07-30T00:00:00.000Z",
  target_scope: "services",
  target_ids: ["style-knotless"],
  restrictions: { minimum_subtotal: 100 },
};

assert.deepEqual(
  calculateSalonPromotion(base, {
    salonId: "salon-1",
    styleId: "style-knotless",
    basePrice: 160,
    selectedAddons: [],
    subtotal: 200,
    now,
  }),
  { eligible: true, discount: 40, total: 160 },
  "The exact targeted service receives the configured percentage discount.",
);
assert.equal(
  calculateSalonPromotion(base, {
    salonId: "salon-1",
    styleId: "style-box",
    basePrice: 160,
    selectedAddons: [],
    subtotal: 200,
    now,
  }).eligible,
  false,
  "A non-targeted service must not receive the discount.",
);
assert.equal(
  calculateSalonPromotion(
    { ...base, target_scope: "products", target_ids: ["product-1"] },
    {
      salonId: "salon-1",
      productId: "product-1",
      basePrice: 20,
      selectedAddons: [],
      subtotal: 20,
      now,
    },
  ).eligible,
  false,
  "Minimum-subtotal restrictions also protect targeted products.",
);
const best = bestPromotionForContext(
  [
    { ...base, discount_value: 10 },
    { ...base, id: "promotion-2", discount_value: 25 },
  ],
  {
    salonId: "salon-1",
    styleId: "style-knotless",
    basePrice: 160,
    selectedAddons: [],
    subtotal: 200,
    now,
  },
);
assert.equal(best?.promotion.id, "promotion-2");
assert.equal(best?.price.total, 150);

const migration = fs.readFileSync(
  "supabase/migrations/20260723290000_promotion_targeting_enforcement.sql",
  "utf8",
);
for (const control of [
  /create table if not exists public\.salon_promotion_redemptions/,
  /for update/,
  /PROMOTION_USAGE_LIMIT_REACHED/,
  /PROMOTION_CUSTOMER_LIMIT_REACHED/,
  /create trigger bookings_finalize_salon_promotion/,
  /promotion_snapshot jsonb not null/,
  /grant execute on function public\.reserve_salon_promotion[\s\S]*to service_role/,
])
  assert.match(migration, control);

const checkout = fs.readFileSync(
  "src/app/api/stripe/booking-checkout/route.ts",
  "utf8",
);
assert.ok(
  checkout.indexOf("calculateSalonPromotion(") <
    checkout.indexOf('admin.rpc("reserve_booking_checkout"'),
  "Server-authoritative promotion math must run before the booking hold.",
);
assert.ok(
  checkout.indexOf('admin.rpc("reserve_booking_checkout"') <
    checkout.indexOf('admin.rpc("reserve_salon_promotion"'),
  "A promotion use is attached to a real booking intent.",
);
for (const control of [
  /subtotal_before_promotion: subtotalBeforeSalonPromotion/,
  /promotion_discount_amount: salonPromotionDiscount/,
  /promotion_snapshot: salonPromotionSnapshot/,
  /salon_promotion_redemption_id/,
  /metadata\[salon_promotion_redemption_id\]/,
])
  assert.match(checkout, control);

console.log(
  "Promotion enforcement verification passed: executable service/product targeting and exact discount math are covered, while server reservation, usage limits, Stripe metadata, and immutable booking evidence controls are present.",
);
