import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, join } from "node:path";

const read = (path) => readFileSync(path, "utf8");

const requiredFiles = [
  ".github/workflows/final-launch-release-candidate-validation.yml",
  "src/components/public/AboutStoryDialog.tsx",
  "src/components/PublicContentLiveRefresh.tsx",
  "src/components/site/AutoContentCarousel.tsx",
  "src/components/admin/AdminUserActivityTimeline.tsx",
  "src/app/api/admin/engine/errors/route.ts",
  "src/app/api/admin/bookings/route.ts",
  "src/app/api/stripe/booking-checkout/route.ts",
  "src/app/api/stripe/webhook/route.ts",
  "src/app/api/admin/finance/payout/route.ts",
  "src/app/api/admin/featured-campaigns/route.ts",
  "supabase/migrations/20260825120000_public_content_realtime_and_booking_badges.sql",
  "supabase/migrations/20260825130000_booking_check_in_exception_workflow.sql",
  "supabase/migrations/20260825140000_featured_campaign_owner_controls.sql",
  "supabase/migrations/20260825141000_fix_featured_campaign_owner_controls.sql",
  "supabase/migrations/20260825150000_stripe_connect_booking_payouts.sql",
];

for (const path of requiredFiles) {
  assert.ok(existsSync(path), `Required final-launch file is missing: ${path}`);
}

const forbiddenFiles = [
  "src/app/api/admin/finance/booking-payout/route.ts",
  "supabase/migrations/20260825150000_booking_payout_workflow.sql",
  ".github/workflows/apply-salon-payout-ui.yml",
  ".github/workflows/apply-payout-workflow.yml",
  ".github/workflows/fix-pr47-build.yml",
  ".github/workflows/finalize-pr47-completion.yml",
  "scripts/apply-payout-workflow.mjs",
  "scripts/finalize-booking-payout-route.mjs",
  "scripts/apply-final-payout-safety-fixes.mjs",
  "scripts/finalize-pr47-completion.mjs",
];

for (const path of forbiddenFiles) {
  assert.ok(!existsSync(path), `One-time or duplicate implementation remains: ${path}`);
}

const payoutMigrations = readdirSync("supabase/migrations")
  .filter((name) => name.startsWith("20260825150000_"))
  .sort();
assert.deepEqual(
  payoutMigrations,
  ["20260825150000_stripe_connect_booking_payouts.sql"],
  "Exactly one authoritative 20260825150000 payout migration must remain.",
);

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts?.["verify:final-completion"],
  "node scripts/verify-final-completion.mjs",
  "package.json must expose the permanent final-completion invariant.",
);

const workflow = read(
  ".github/workflows/final-launch-release-candidate-validation.yml",
);
assert.match(workflow, /npm run verify:final-completion/);
assert.match(workflow, /npm run verify:database-clean/);
assert.match(workflow, /npm run verify:monitoring/);
assert.match(workflow, /npx playwright test/);
assert.match(workflow, /npm audit --audit-level=high/);
assert.match(workflow, /sk_test_/);
assert.doesNotMatch(workflow, /sk_live_/);

const npmScripts = [
  ...workflow.matchAll(/npm run ([A-Za-z0-9:_-]+)/g),
].map((match) => match[1]);
for (const script of new Set(npmScripts)) {
  assert.equal(
    typeof packageJson.scripts?.[script],
    "string",
    `Release-candidate workflow references missing npm script: ${script}`,
  );
}

const directScripts = [
  ...workflow.matchAll(/(?:^|\s)(scripts\/[A-Za-z0-9._/-]+\.mjs)/gm),
].map((match) => match[1]);
for (const scriptPath of new Set(directScripts)) {
  assert.ok(
    existsSync(scriptPath),
    `Release-candidate workflow references missing file: ${scriptPath}`,
  );
}

const about = read("src/app/about/page.tsx");
assert.match(about, /AboutStoryDialog/);
assert.doesNotMatch(about, /AboutIntro/);
assert.match(about, /middleCards\.slice\(0, 8\)/);
assert.match(about, /lowerCards\.slice\(0, 8\)/);

const aboutDialog = read("src/components/public/AboutStoryDialog.tsx");
assert.match(aboutDialog, /role="dialog"/);
assert.match(aboutDialog, /aria-modal="true"/);
assert.match(aboutDialog, /event\.key === "Escape"/);
assert.match(aboutDialog, /trigger\?\.focus\(\)/);

const carousel = read("src/components/site/AutoContentCarousel.tsx");
assert.match(carousel, /onPointerEnter=\{\(\) => pause\(\)\}/);
assert.match(carousel, /prefers-reduced-motion/);
assert.match(carousel, /data-auto-state/);
assert.match(carousel, /\[\.\.\.visibleCards, \.\.\.visibleCards\]/);

const liveRefresh = read("src/components/PublicContentLiveRefresh.tsx");
assert.match(liveRefresh, /ACCEPTANCE_MODE/);
assert.match(liveRefresh, /public_change_events/);
assert.match(liveRefresh, /router\.refresh\(\)/);
assert.match(liveRefresh, /supabase\.removeChannel/);

const activity = read("src/components/admin/AdminUserActivityTimeline.tsx");
assert.match(activity, /Security audit/);
assert.match(activity, /literalAction/);
assert.match(activity, /admin_permissions_updated/);

const incidentRoute = read("src/app/api/admin/engine/errors/route.ts");
assert.match(incidentRoute, /requireAdminPermission\(request, "engine"\)/);
assert.match(incidentRoute, /MAX_EXPORT_ROWS = 10_000/);
assert.match(incidentRoute, /function sanitize/);
assert.match(incidentRoute, /function csvCell/);
assert.match(incidentRoute, /X-Export-Audit-Reference/);
assert.match(incidentRoute, /platform_error_affected_businesses/);

const migrationFiles = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort();
assert.ok(migrationFiles.length >= 136, "The complete migration chain is unexpectedly incomplete.");

const workflowFiles = readdirSync(".github/workflows");
const accidentalRepairWorkflows = workflowFiles.filter((name) =>
  /^(?:apply-|fix-pr47-|clean-booking-|finalize-booking-|finalize-pr47-)/.test(
    basename(name),
  ),
);
assert.deepEqual(
  accidentalRepairWorkflows,
  [],
  `Temporary mutation workflows remain: ${accidentalRepairWorkflows.join(", ")}`,
);

const knownVerificationScripts = [
  "verify-final-launch-mobile-realtime-admin-corrections.mjs",
  "verify-final-launch-business-workflows.mjs",
  "verify-admin-manual-booking-completion.mjs",
  "verify-booking-checkout-hold-safety.mjs",
  "verify-booking-payout-workflow.mjs",
  "verify-featured-campaign-owner-controls.mjs",
  "verify-monitoring-usability.mjs",
  "verify-operational-monitoring.mjs",
];
for (const filename of knownVerificationScripts) {
  assert.ok(
    existsSync(join("scripts", filename)),
    `Permanent verification coverage is missing: ${filename}`,
  );
}

console.log(
  `Final completion invariants passed: ${requiredFiles.length} required files, ${migrationFiles.length} migrations, one authoritative payout workflow, no duplicate routes, and no temporary repair workflows.`,
);
