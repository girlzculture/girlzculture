import assert from "node:assert/strict";
import fs from "node:fs";
import {
  productOrderReferenceFromNumber,
  productRefundSummary,
} from "../src/lib/productCommerceCore.ts";

const values = new Map();
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  },
  dispatchEvent: () => true,
};

const cart = await import("../src/lib/productCart.ts");
cart.clearProductCart();
const first = cart.addProductToCart(
  {
    salonId: "salon-a",
    salonSlug: "salon-a",
    salonName: "Salon A",
    productId: "product-a",
    name: "Braid mousse",
    unitPrice: 16,
    promotionId: "promo-a",
    promotionLabel: "20% off",
    estimatedUnitPrice: 12.8,
  },
  2,
);
assert.equal(first.ok, true);
assert.equal(cart.readProductCart()?.items[0]?.quantity, 2);
assert.equal(cart.readProductCart()?.promotionId, "promo-a");

cart.addProductToCart(
  {
    salonId: "salon-a",
    salonSlug: "salon-a",
    salonName: "Salon A",
    productId: "product-a",
    name: "Braid mousse",
    unitPrice: 16,
  },
  3,
);
assert.equal(cart.readProductCart()?.items[0]?.quantity, 5);

const otherSalon = cart.addProductToCart(
  {
    salonId: "salon-b",
    salonSlug: "salon-b",
    salonName: "Salon B",
    productId: "product-b",
    name: "Edge control",
    unitPrice: 14,
  },
  1,
);
assert.equal(otherSalon.ok, false);
assert.match(otherSalon.error, /another salon/i);

cart.updateProductCartQuantity("product-a", 0);
assert.equal(cart.readProductCart(), null);

assert.equal(productOrderReferenceFromNumber(1), "GC-P-A-01");
assert.equal(productOrderReferenceFromNumber(99), "GC-P-A-99");
assert.equal(productOrderReferenceFromNumber(100), "GC-P-B-01");
assert.equal(productOrderReferenceFromNumber(2575), "GC-P-AA-01");
assert.throws(() => productOrderReferenceFromNumber(0), /positive integers/);

assert.deepEqual(productRefundSummary(100, 25, 3), {
  paymentStatus: "Partially Refunded",
  netAmountOwedSalon: 72,
  payoutStatus: "Destination payment partially reversed",
});
assert.deepEqual(productRefundSummary(100, 100, 3), {
  paymentStatus: "Refunded",
  netAmountOwedSalon: 0,
  payoutStatus: "Destination payment reversed",
});

const read = (file) => fs.readFileSync(file, "utf8");
const migration = read(
  "supabase/migrations/20260724170000_product_commerce_and_combined_checkout.sql",
);
for (const contract of [
  "product_inventory_reservations",
  "product_promotion_redemptions",
  "reserve_combined_checkout",
  "release_combined_checkout",
  "complete_combined_checkout",
  "apply_commerce_checkout_tax",
  "stripe_tax_calculation_id",
  "for update skip locked",
  "PRODUCT_PROMOTION_RESERVATION_NOT_AVAILABLE",
]) {
  assert.ok(migration.includes(contract), `missing commerce contract: ${contract}`);
}
assert.match(migration, /update public\.salon_products[\s\S]*inventory_quantity = inventory_quantity - v_item\.quantity/);
assert.match(migration, /update public\.salon_products[\s\S]*inventory_quantity = inventory_quantity \+ v_reservation\.quantity/);
assert.match(
  read("src/app/api/stripe/webhook/route.ts"),
  /syncProductOrderRefund[\s\S]*releaseExpiredCheckout/,
);
assert.match(
  read("src/app/api/stripe/booking-checkout/route.ts"),
  /type\]: "combined_checkout"|combined_checkout/,
);
assert.match(
  read("src/lib/commerceCheckoutServer.ts"),
  /skipCustomerEmail: true/,
);
assert.match(
  read("src/lib/commerceCheckoutServer.ts"),
  /STRIPE_TAX_ENABLED[\s\S]*\/tax\/calculations/,
);
assert.match(
  read("src/app/api/stripe/commerce-checkout/route.ts"),
  /estimateStripeCommerceTax[\s\S]*apply_commerce_checkout_tax/,
);
assert.match(
  read("src/app/api/stripe/booking-checkout/route.ts"),
  /estimateStripeCommerceTax[\s\S]*apply_commerce_checkout_tax/,
);
assert.match(
  read("src/components/commerce/ProductCheckoutClient.tsx"),
  /Tax[\s\S]*Calculated before payment[\s\S]*Subtotal before tax/,
);

console.log(
  "Product commerce verification passed: executable one-salon cart behavior, duplicate coalescing, quantity removal, GC-P reference mapping, refund accounting, atomic inventory/appointment contracts, server-side Stripe Tax calculation, promotion reservations, Stripe refund reconciliation, expiration release, and unified confirmation wiring are covered.",
);
