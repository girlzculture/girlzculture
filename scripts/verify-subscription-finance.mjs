import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

function requireMatch(label, text, pattern) {
  if (!pattern.test(text)) failures.push(`${label}: expected ${pattern}`);
}

const lifecycleMigration = read("supabase/migrations/20260715180000_subscription_lifecycle.sql");
const ledgerMigration = read("supabase/migrations/20260715190000_billing_event_ledger.sql");
const storageMigration = read("supabase/migrations/20260715200000_storage_policy_qualification.sql");
const changeRoute = read("src/app/api/stripe/subscription/change/route.ts");
const lifecycleRoute = read("src/app/api/stripe/subscription/lifecycle/route.ts");
const webhookRoute = read("src/app/api/stripe/webhook/route.ts");
const salonApplication = read("src/components/SalonApplication.tsx");
const adminSalonRoute = read("src/app/api/admin/salons/route.ts");

requireMatch("subscription lifecycle columns", lifecycleMigration, /scheduled_change_effective_at/);
requireMatch("upgrade waits for payment", changeRoute, /payment_behavior:\s*"pending_if_incomplete"/);
requireMatch("upgrade invoices immediately", changeRoute, /proration_behavior:\s*"always_invoice"/);
const failedUpgradeBranch = changeRoute.slice(
  changeRoute.indexOf("if (!upgradeConfirmed)"),
  changeRoute.indexOf("const status = String(updated.status"),
);
requireMatch("failed upgrade returns the existing plan", failedUpgradeBranch, /currentPlan/);
requireMatch("requires-action payment stays pending", failedUpgradeBranch, /requiresAction/);
requireMatch("hosted payment URL is returned", failedUpgradeBranch, /paymentUrl/);
if (/\btier\s*:/.test(failedUpgradeBranch)) failures.push("failed upgrade must not write a replacement tier");
requireMatch("downgrade uses a schedule", changeRoute, /subscription_schedules/);
requireMatch("downgrade has no proration", changeRoute, /proration_behavior:\s*"none"/);
requireMatch("downgrade charges zero now", changeRoute, /amountChargedNow:\s*0/);
requireMatch("period-end cancellation", lifecycleRoute, /cancel_at_period_end:\s*true/);
requireMatch("reactivation", lifecycleRoute, /cancel_at_period_end:\s*false/);
requireMatch("modern Stripe item periods", changeRoute, /item\.current_period_end/);

requireMatch("ledger idempotency", ledgerMigration, /stripe_event_id text not null unique/i);
requireMatch("ledger state snapshot", ledgerMigration, /\bstate text/);
requireMatch("ledger admin read policy", ledgerMigration, /for select[\s\S]*public\.is_admin\(\)/i);
for (const eventType of [
  "New subscription",
  "Upgrade",
  "Upgrade payment failed",
  "Downgrade scheduled",
  "Downgrade became effective",
  "Cancellation scheduled",
  "Reactivation",
  "Renewal payment",
  "Renewal failed",
  "Subscription ended",
  "Refund",
  "Credit",
]) {
  requireMatch(`webhook event ${eventType}`, webhookRoute, new RegExp(eventType));
}

const subscriptionSync = webhookRoute.slice(
  webhookRoute.indexOf("function planFromObject"),
  webhookRoute.indexOf("async function billingContext"),
);
requireMatch("webhook preserves stored Basic identity", subscriptionSync, /parseStoredPlan\(object\.metadata\?\.plan\)/);
requireMatch("webhook treats a provider Price ID as authoritative", subscriptionSync, /if \(priceId\) return planFromStripePriceId\(priceId\)/);
requireMatch("webhook rejects unknown plan mappings", subscriptionSync, /STRIPE_SUBSCRIPTION_PLAN_UNRECOGNIZED/);
if (/normalizePlan\(/.test(subscriptionSync)) failures.push("webhook subscription sync must not normalize unknown provider values to Starter");
if (/featured_weight/.test(subscriptionSync)) failures.push("webhook subscription sync must not write organic or featured placement weights");

for (const [plan, amount] of [["Starter", 59], ["Growth", 69], ["Premium", 89]]) {
  requireMatch(`application includes ${plan}`, salonApplication, new RegExp(`PLAN_ORDER|${plan}`));
  requireMatch(`canonical plan catalog price ${amount}`, read("src/lib/plans.ts"), new RegExp(`monthlyAmountCents:\\s*${amount}00`));
}
requireMatch("application persists plan in URL", salonApplication, /next\.set\("plan", plan\.toLowerCase\(\)\)/);
requireMatch("application displays whole-dollar catalog price", salonApplication, /plan\.monthlyAmountCents \/ 100/);
requireMatch("admin accepts Starter", adminSalonRoute, /ALLOWED_PLANS[^\n]*"Starter"/);
requireMatch("admin preserves legacy Basic filter", adminSalonRoute, /ALLOWED_PLANS[^\n]*"Basic"/);

const folderCalls = [...storageMigration.matchAll(/storage\.foldername\(([^)]+)\)/g)].map((match) => match[1].trim());
if (folderCalls.length === 0) failures.push("storage policies: no storage.foldername calls found");
for (const call of folderCalls) {
  if (call !== "storage.objects.name" && call !== "objects.name") {
    failures.push(`storage policies: unqualified folder argument ${call}`);
  }
}
requireMatch("stylist upload policy", storageMigration, /stylist_media_owner_write/);
requireMatch("style upload policy", storageMigration, /style_media_owner_write/);
requireMatch("storage policy assertion", storageMigration, /was not created with objects\.name qualification/i);

if (failures.length) {
  console.error("Subscription, finance, and storage verification failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Verified subscription lifecycle, billing ledger, webhook event coverage, and ${folderCalls.length} qualified storage path checks.`);
