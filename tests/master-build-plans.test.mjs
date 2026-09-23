import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_ORDER, SUBSCRIPTION_PLANS, parseApplicationPlan, restrictivePlanForLimits } from "../src/lib/plans.ts";

test("the current catalog has five exact prices and equal core access", () => {
  assert.deepEqual(PLAN_ORDER, ["Solo", "Solo Pro", "Starter", "Growth", "Premium"]);
  assert.deepEqual(PLAN_ORDER.map(name => SUBSCRIPTION_PLANS[name].monthlyAmountCents), [6900, 9900, 9900, 14900, 19900]);
  for (const plan of PLAN_ORDER) {
    const entitlement = SUBSCRIPTION_PLANS[plan].entitlements;
    assert.equal(entitlement.appointmentCommissionPercent, 0);
    assert.equal(entitlement.marketplaceVisibility, "Standard");
    for (const key of ["customerDeposits", "bookingSpecificCustomerChat", "unlimitedAppointmentBookings", "gcAssistant", "finances", "clientCards"]) assert.equal(entitlement[key], true, `${plan}: ${key}`);
  }
});
test("solo limits distinguish one calendar from team capacity", () => {
  for (const plan of ["Solo", "Solo Pro"]) {
    assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.bookableCalendars, 1);
    assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.unlimitedStylistProfiles, false);
    assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.teamPayouts, false);
  }
  for (const plan of ["Starter", "Growth", "Premium"]) {
    assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.bookableCalendars, null);
    assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.teamPayouts, true);
  }
});
test("Solo Pro matches the specified allowances and advertising benefits", () => {
  const entitlements = SUBSCRIPTION_PLANS["Solo Pro"].entitlements;
  assert.equal(entitlements.customerPromotions.limit, 3);
  assert.equal(entitlements.productListings.limit, 30);
  assert.equal(entitlements.monthlyReporting, "Detailed");
  assert.equal(entitlements.advertising.discountPercent, 5);
  assert.deepEqual(entitlements.advertising.credit, { amountCents: 1000, cadence: "quarterly" });
  assert.equal(parseApplicationPlan("solo-pro"), "Solo Pro");
});
test("moving from Solo Pro to Starter cannot evade pending inventory limits", () => {
  assert.equal(restrictivePlanForLimits("Solo Pro", "Starter"), "Starter");
  assert.equal(restrictivePlanForLimits("Growth", "Solo Pro"), "Solo Pro");
});
