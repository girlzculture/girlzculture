import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLAN_COMPARISON_ROWS,
  PLAN_ORDER,
  SUBSCRIPTION_PLANS,
  canonicalPlanForStored,
  displayStoredPlan,
  hasPlanFeature,
  normalizePlan,
  parseOfficialPlan,
  parsePlan,
  parseStoredPlan,
  planFromStripePriceId,
  planRank,
  stripePriceEnv,
} from "../src/lib/plans.ts";

assert.deepEqual(PLAN_ORDER, ["Starter", "Growth", "Premium"]);
assert.deepEqual(
  PLAN_ORDER.map((name) => SUBSCRIPTION_PLANS[name].monthlyAmountCents),
  [5900, 6900, 8900],
);
assert.deepEqual(
  PLAN_ORDER.map((name) => SUBSCRIPTION_PLANS[name].monthlyPrice),
  [59, 69, 89],
);
assert.deepEqual(
  PLAN_ORDER.map((name) => stripePriceEnv(name)),
  ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_PREMIUM"],
);

assert.equal(parsePlan("starter"), "Starter");
assert.equal(parsePlan("BASIC"), "Starter", "Old public Basic links must enter Starter");
assert.equal(parsePlan("essentials"), "Growth");
assert.equal(parsePlan("platinum"), "Premium");
assert.equal(parsePlan("unknown-provider-value"), null, "Strict provider parsing must fail closed");
assert.equal(parseOfficialPlan("starter"), "Starter");
assert.equal(parseOfficialPlan("Growth"), "Growth");
assert.equal(parseOfficialPlan("PREMIUM"), "Premium");
for (const retiredOrUnknown of ["Basic", "essentials", "pro", "platinum", "unknown"]) {
  assert.equal(
    parseOfficialPlan(retiredOrUnknown),
    null,
    `${retiredOrUnknown} must never enter a new billing mutation`,
  );
}
assert.equal(normalizePlan("unknown-public-value"), "Starter");
for (const [query, expected] of [
  ["", "Starter"],
  ["plan=starter", "Starter"],
  ["plan=growth", "Growth"],
  ["plan=premium", "Premium"],
  ["plan=basic", "Starter"],
  ["plan=unknown", "Starter"],
]) {
  const searchParams = new URLSearchParams(query);
  assert.equal(
    normalizePlan(searchParams.get("plan") || "Starter"),
    expected,
    `Salon application query ${query || "(missing plan)"} must select ${expected}`,
  );
}
assert.equal(parseStoredPlan("Basic"), "Basic");
assert.equal(canonicalPlanForStored("Basic"), "Starter");
assert.equal(displayStoredPlan("Basic"), "Basic (legacy)");
assert.equal(planRank("Basic"), 1);

for (const plan of PLAN_ORDER) {
  assert.equal(hasPlanFeature(plan, "promotions"), true);
  assert.equal(hasPlanFeature(plan, "featured_rotation"), false);
  assert.equal(hasPlanFeature(plan, "premium_badge"), false);
  assert.equal(hasPlanFeature(plan, "priority_support"), false);
  assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.marketplaceVisibility, "Standard");
  assert.equal(SUBSCRIPTION_PLANS[plan].entitlements.appointmentCommissionPercent, 0);
}
assert.equal(hasPlanFeature("not-a-plan", "promotions"), false);
assert.equal(hasPlanFeature("Starter", "advanced_analytics"), false);
assert.equal(hasPlanFeature("Growth", "advanced_analytics"), true);
assert.equal(hasPlanFeature("Premium", "advanced_analytics"), true);

assert.equal(PLAN_COMPARISON_ROWS.length, 18);
const expectedComparison = [
  ["Professional salon profile", true, true, true],
  ["Unlimited stylist profiles", true, true, true],
  ["Unlimited appointment bookings", true, true, true],
  ["0% Girlz Culture appointment commission", true, true, true],
  ["Customer deposits", true, true, true],
  ["Booking-specific customer chat", true, true, true],
  ["Appointment reminders", "Standard", "Customizable", "Advanced"],
  ["Marketplace visibility", "Standard", "Standard", "Standard"],
  ["Monthly reporting", "Basic", "Detailed", "Advanced"],
  ["Booking-source tracking", "Summary", "Full", "Full + comparisons"],
  ["Waitlist", "Manual", "Automated", "Automated + targeted"],
  ["Rebooking reminders", "Manual", "Automatic", "Automatic + segmented"],
  ["Customer promotions", "1 active", "Up to 5", "Unlimited, fair use"],
  ["Product listings", "10", "30", "Unlimited, fair use"],
  ["Google Business Profile help", "Guide", "Assisted setup", "Assisted setup + review"],
  ["Advertising discount", "—", "5%", "15%"],
  ["Advertising credit", "—", "$10 quarterly", "$10 monthly"],
  ["Early access to advertising spaces", "—", "—", "48 hours early"],
];
assert.equal(
  expectedComparison.length,
  18,
  "The founder comparison must contain exactly 18 rows",
);
assert.deepEqual(
  PLAN_COMPARISON_ROWS.map((row) => row.key),
  [
    "professional-salon-profile",
    "unlimited-stylist-profiles",
    "unlimited-appointment-bookings",
    "appointment-commission",
    "customer-deposits",
    "booking-chat",
    "appointment-reminders",
    "marketplace-visibility",
    "monthly-reporting",
    "booking-source-tracking",
    "waitlist",
    "rebooking-reminders",
    "customer-promotions",
    "product-listings",
    "google-business-profile-help",
    "advertising-discount",
    "advertising-credit",
    "advertising-early-access",
  ],
  "The 18 comparison identities and order must remain exact",
);
assert.deepEqual(
  PLAN_COMPARISON_ROWS.map((row) => [
    row.label,
    row.values.Starter,
    row.values.Growth,
    row.values.Premium,
  ]),
  expectedComparison,
  "Every founder-approved comparison cell must remain exact and in order",
);

const previous = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  premium: process.env.STRIPE_PRICE_PREMIUM,
  basic: process.env.STRIPE_BASIC_PRICE_ID,
};
process.env.STRIPE_PRICE_STARTER = "price_new_starter";
process.env.STRIPE_PRICE_GROWTH = "price_new_growth";
process.env.STRIPE_PRICE_PREMIUM = "price_new_premium";
process.env.STRIPE_BASIC_PRICE_ID = "price_legacy_basic";
assert.equal(planFromStripePriceId("price_new_starter"), "Starter");
assert.equal(planFromStripePriceId("price_new_growth"), "Growth");
assert.equal(planFromStripePriceId("price_new_premium"), "Premium");
assert.equal(planFromStripePriceId("price_legacy_basic"), "Basic");
assert.equal(planFromStripePriceId("price_unknown"), null);
for (const [key, value] of Object.entries(previous)) {
  const env = key === "starter" ? "STRIPE_PRICE_STARTER" : key === "growth" ? "STRIPE_PRICE_GROWTH" : key === "premium" ? "STRIPE_PRICE_PREMIUM" : "STRIPE_BASIC_PRICE_ID";
  if (value === undefined) delete process.env[env];
  else process.env[env] = value;
}

const page = readFileSync(new URL("../src/app/plans/page.tsx", import.meta.url), "utf8");
const application = readFileSync(
  new URL("../src/components/SalonApplication.tsx", import.meta.url),
  "utf8",
);
const signup = readFileSync(
  new URL("../src/components/SalonSignup.tsx", import.meta.url),
  "utf8",
);
const generatedMessages = readFileSync(
  new URL("../src/i18n/generated-source-messages.ts", import.meta.url),
  "utf8",
);
assert.match(page, /Choose a plan during your application\. You will not be charged until your salon is approved and you subscribe/);
assert.match(page, /Apply first\. After approval, activate your selected plan securely through subscriptions/);
assert.match(page, /PLAN_COMPARISON_ROWS\.map/);
assert.match(page, /Most Popular/);
assert.doesNotMatch(page, /test.mode|Priority search|Top search|featured rotation/i);

assert.match(
  application,
  /normalizePlan\(searchParams\.get\("plan"\) \|\| "Starter"\)/,
  "Application query parsing must normalize starter/growth/premium and legacy basic",
);
assert.match(application, /next\.set\("plan", plan\.toLowerCase\(\)\)/);
assert.match(application, /selected_plan:selectedPlan/);
assert.match(application, /PLAN_ORDER\.map/);
assert.match(application, /href="\/plans" target="_blank"/);
assert.match(
  signup,
  /normalizePlan\(searchParams\.get\("plan"\)\|\|"Starter"\)/,
  "Direct salon signup must default missing plan selections to Starter",
);
assert.match(
  page,
  /href=\{`\/salon\/signup\?plan=\$\{plan\.key\}`\}/,
  "Every plan CTA must carry its explicit starter/growth/premium query selection",
);

const forbiddenPublicBillingCopy =
  /Stripe test mode|test-mode billing|activat(?:e|ing)[^\n.]{0,80}test.mode/i;
assert.doesNotMatch(
  generatedMessages,
  forbiddenPublicBillingCopy,
  "Generated customer-facing localization sources must not retain test-mode billing copy",
);

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const customerFacingFiles = [];
function collectCustomerFacingFiles(directory, segments = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const nextSegments = [...segments, entry.name];
    if (entry.isDirectory()) {
      const relativePath = nextSegments.join("/");
      if (
        relativePath === "app/api" ||
        relativePath === "app/admin" ||
        relativePath === "app/internal" ||
        relativePath === "components/admin" ||
        relativePath === "components/owner" ||
        relativePath === "lib"
      ) continue;
      collectCustomerFacingFiles(join(directory, entry.name), nextSegments);
      continue;
    }
    if (![".ts", ".tsx"].includes(extname(entry.name))) continue;
    if (nextSegments.join("/") === "i18n/generated-source-messages.ts") continue;
    customerFacingFiles.push(join(directory, entry.name));
  }
}
collectCustomerFacingFiles(sourceRoot);
for (const file of customerFacingFiles) {
  assert.doesNotMatch(
    readFileSync(file, "utf8"),
    forbiddenPublicBillingCopy,
    `${relative(sourceRoot, file)} contains customer-facing test-mode billing copy`,
  );
}

console.log("Canonical Starter, Growth, and Premium plan catalog verification passed.");
