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
  parseApplicationPlanQuery,
  parsePlan,
  parseStoredPlan,
  planFromStripePriceId,
  planRank,
  stripePriceEnv,
} from "../src/lib/plans.ts";

const expected = JSON.parse(readFileSync(new URL("../tests/fixtures/master-build-plan-catalog.json", import.meta.url), "utf8"));
assert.deepEqual(PLAN_ORDER, expected.plans.map(plan => plan.name));
assert.deepEqual(
  PLAN_ORDER.map((name) => SUBSCRIPTION_PLANS[name].monthlyAmountCents),
  [6900, 9900, 9900, 14900, 19900],
);
assert.deepEqual(
  PLAN_ORDER.map((name) => SUBSCRIPTION_PLANS[name].monthlyPrice),
  [69, 99, 99, 149, 199],
);
assert.deepEqual(
  PLAN_ORDER.map((name) => stripePriceEnv(name)),
  ["STRIPE_PRICE_SOLO", "STRIPE_PRICE_SOLO_PRO", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_PREMIUM"],
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
  ["", null],
  ["plan=starter", "Starter"],
  ["plan=growth", "Growth"],
  ["plan=premium", "Premium"],
  ["plan=basic", "Starter"],
  ["plan=unknown", null],
]) {
  const searchParams = new URLSearchParams(query);
  assert.equal(
    parseApplicationPlanQuery(searchParams.get("plan")),
    expected,
    `Salon application query ${query || "(missing plan)"} must select ${expected}`,
  );
}
assert.equal(parseStoredPlan("Basic"), "Basic");
assert.equal(canonicalPlanForStored("Basic"), "Starter");
assert.equal(displayStoredPlan("Basic"), "Basic (legacy)");
assert.equal(planRank("Basic"), 3);

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

assert.equal(PLAN_COMPARISON_ROWS.length, 23);
assert.deepEqual(
  PLAN_COMPARISON_ROWS.map(row => [row.key, row.label, ...PLAN_ORDER.map(plan => row.values[plan])]),
  expected.rows,
  "Every Master Build comparison cell and row identity must match the approved five-plan catalog",
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
assert.match(page, /Choose a plan during your application\. You will not be charged until your business is approved and you subscribe/);
assert.match(page, /Apply first\. Application and approval are available\. New-plan billing activation is not yet verified/);
assert.match(page, /PLAN_COMPARISON_ROWS\.map/);
assert.match(page, /Most Popular/);
assert.doesNotMatch(page, /test.mode|Priority search|Top search|featured rotation/i);

assert.match(
  application,
  /parseApplicationPlanQuery\(searchParams\.get\("plan"\)\)/,
  "Application query parsing must normalize starter/growth/premium and legacy basic",
);
assert.match(application, /next\.set\("plan", SUBSCRIPTION_PLANS\[plan\]\.key\)/);
assert.match(application, /selected_plan:selectedPlan/);
assert.match(application, /PLAN_ORDER\.filter\(name=>isSoloPlan\(name\)===\(form\.operator_type==="solo"\)\)\.map/);
assert.match(application, /href="\/plans" target="_blank"/);
assert.match(
  signup,
  /parseApplicationPlanQuery\(searchParams\.get\("plan"\)\)/,
  "Direct salon signup must preserve an absent plan selection",
);
assert.match(
  page,
  /href=\{`\/business\/signup\?plan=\$\{plan\.key\}`\}/,
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

console.log("Master Build five-plan catalog verification passed.");

await import("./verify-application-plan.mjs");
