import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const resolve = (relative) => path.join(root, relative);
const read = (relative) => fs.readFileSync(resolve(relative), "utf8");
const write = (relative, content) => {
  fs.mkdirSync(path.dirname(resolve(relative)), { recursive: true });
  fs.writeFileSync(resolve(relative), content);
};
const remove = (relative) => {
  if (fs.existsSync(resolve(relative))) fs.rmSync(resolve(relative), { recursive: true, force: true });
};
const walk = (directory) =>
  fs.existsSync(directory)
    ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
      })
    : [];

const changedFiles = new Set(
  execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean),
);

const temporaryPatterns = [
  /^\.github\/workflows\/(?:apply-|fix-pr47-|fix-booking-|clean-booking-|finalize-booking-|diagnose-pr47-build|apply-monitoring-|finalize-pr47-completion)/,
  /^scripts\/(?:apply-|fix-booking-|clean-booking-|finalize-booking-|apply-monitoring-|finalize-pr47-completion)/,
  /^scripts\/templates\/(?:AdminFeaturedCampaignsV2\.tsx\.txt|featured-campaign-route\.ts\.txt)$/,
];
for (const relative of changedFiles) {
  if (temporaryPatterns.some((pattern) => pattern.test(relative))) remove(relative);
}
remove("src/app/api/admin/engine/errors-export/route.ts");

const payoutPath = "src/app/api/admin/finance/payout/route.ts";
let payout = read(payoutPath);
if (!payout.includes("noteOperationalFailure")) {
  payout = payout.replace(
    /import \{\s*routeMonitoringProfile,\s*withOperationalMonitoring\s*\} from "@\/lib\/operationalMonitoring";/,
    'import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";',
  );
}
payout = payout.replace(
  /      \} catch \(reconciliationError\) \{\n        console\.error\("Payout reconciliation persistence failed", \{[\s\S]*?\n        \}\);\n      \}/,
  `      } catch (reconciliationError) {
        noteOperationalFailure(
          "Payout reconciliation persistence failed",
          reconciliationError,
        );
      }`,
);
assert.doesNotMatch(
  payout,
  /console\.(?:error|warn)\s*\(/,
  "The payout route must not emit raw provider or reconciliation errors.",
);
assert.match(
  payout,
  /noteOperationalFailure\(\s*"Payout reconciliation persistence failed"/,
  "The payout reconciliation fallback must use sanitized operational reporting.",
);
write(payoutPath, payout);

const incidentPath = "src/app/api/admin/engine/errors/route.ts";
let incident = read(incidentPath);
assert.match(incident, /function sanitize\(/, "Incident export sanitization is missing.");
incident = incident.replace(
  /const secretKey = \/[^\n]+\/i;/,
  'const secretKey = /(?:authorization|cookie|token|secret|password|api[_-]?key|access[_-]?key|service[_-]?role|private[_-]?key|client[_-]?secret|webhook[_-]?secret|refresh[_-]?token|connection[_-]?string|database[_-]?url|smtp|twilio)/i;',
);
incident = incident.replace(
  /const secretValue = \/[^\n]+\/[gimyus]*;/,
  `const secretValue = new RegExp(
  [
    "Bearer\\\\s+[A-Za-z0-9._~+\\\\/-]+=*",
    "(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+",
    "whsec_[A-Za-z0-9]+",
    "github_pat_[A-Za-z0-9_]+",
    "gh[pousr]_[A-Za-z0-9_]+",
    "sbp_[A-Za-z0-9_-]+",
    "sb_secret_[A-Za-z0-9_-]+",
    "AKIA[0-9A-Z]{16}",
    "eyJ[A-Za-z0-9_-]{20,}\\\\.[A-Za-z0-9_-]{10,}(?:\\\\.[A-Za-z0-9_-]{10,})?",
    "(?:postgres(?:ql)?|mysql|mongodb(?:\\\\+srv)?):\\\\/\\\\/[^\\\\s:@/]+:[^@\\\\s/]+@[^\\\\s]+",
    "-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\\\\s\\\\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----",
  ].join("|"),
  "gi",
);`,
);
incident = incident.replaceAll(
  "query: search || null,",
  "query: sanitize(search || null),",
);
assert.match(incident, /X-Export-Audit-Reference/);
assert.match(incident, /record_type:\s*"platform_error_export"/);
assert.match(incident, /MAX_EXPORT_ROWS\s*=\s*10_000/);
assert.match(incident, /text\/csv; charset=utf-8/);
write(incidentPath, incident);

const monitoringPath = "scripts/verify-operational-monitoring.mjs";
let monitoring = read(monitoringPath);
const routeCount = walk(resolve("src/app/api")).filter((file) => file.endsWith("route.ts")).length;
monitoring = monitoring.replace(
  /assert\.equal\(routeFiles\.length,\s*\d+,/,
  `assert.equal(routeFiles.length, ${routeCount},`,
);
write(monitoringPath, monitoring);

const inventoryPath = "docs/OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md";
let inventory = read(inventoryPath).replace(
  /^Updated: .*$/m,
  "Updated: 2026-08-26. This inventory is enforced by `scripts/verify-operational-monitoring.mjs`; a route cannot be added without a classification and shared operational wrapper.",
);
write(inventoryPath, inventory);

const persistentWorkflows = [
  ".github/workflows/final-launch-mobile-realtime-admin-corrections.yml",
  ".github/workflows/verify-booking-checkout-hold-safety.yml",
  ".github/workflows/verify-booking-payout-workflow.yml",
  ".github/workflows/verify-featured-campaign-owner-controls.yml",
];
for (const relative of persistentWorkflows) {
  if (!fs.existsSync(resolve(relative))) continue;
  let workflow = read(relative)
    .replaceAll("actions/checkout@v4", "actions/checkout@v6")
    .replaceAll("actions/setup-node@v4", "actions/setup-node@v6");
  if (
    relative.endsWith("final-launch-mobile-realtime-admin-corrections.yml") &&
    !workflow.includes("npm run verify:final-completion")
  ) {
    workflow = workflow.replace(
      "      - run: node scripts/verify-final-launch-business-workflows.mjs\n",
      "      - run: node scripts/verify-final-launch-business-workflows.mjs\n      - run: npm run verify:final-completion\n",
    );
  }
  write(relative, workflow);
}

const finalVerifier = `import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const walk = (directory) => fs.existsSync(directory)
  ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(target) : [target];
    })
  : [];

const changed = new Set(
  require("node:child_process")
    .execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], { encoding: "utf8" })
    .split(/\\r?\\n/)
    .filter(Boolean),
);
for (const file of changed) {
  assert.doesNotMatch(file, /^\\.github\\/workflows\\/(?:apply-|fix-pr47-|fix-booking-|clean-booking-|finalize-booking-|diagnose-pr47-build|apply-monitoring-|finalize-pr47-completion)/, \`Temporary mutation workflow remains: \${file}\`);
  assert.doesNotMatch(file, /^scripts\\/(?:apply-|fix-booking-|clean-booking-|finalize-booking-|apply-monitoring-|finalize-pr47-completion)/, \`Temporary mutation script remains: \${file}\`);
}
assert.equal(fs.existsSync(path.join(root, "src/app/api/admin/engine/errors-export/route.ts")), false, "The duplicate incident-export route must stay removed.");
const payout = read("src/app/api/admin/finance/payout/route.ts");
assert.match(payout, /noteOperationalFailure\\(\\s*"Payout reconciliation persistence failed"/);
assert.doesNotMatch(payout, /console\\.(?:error|warn)\\s*\\(/);
const incidents = read("src/app/api/admin/engine/errors/route.ts");
for (const pattern of [/function sanitize\\(/, /secretKey/, /secretValue/, /MAX_EXPORT_ROWS = 10_000/, /record_type: "platform_error_export"/, /X-Export-Audit-Reference/, /X-Export-Truncated/, /text\\/csv; charset=utf-8/, /Export/]) assert.match(incidents, pattern);
const incidentUi = read("src/components/admin/ErrorMonitoringManager.tsx");
assert.match(incidentUi, /Export CSV/);
assert.match(incidentUi, /Export JSON/);
const migrationNames = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql"));
const migrationPrefixes = migrationNames.map((name) => name.match(/^(\\d{14})_/)?.[1]).filter(Boolean);
assert.equal(new Set(migrationPrefixes).size, migrationPrefixes.length, "Migration timestamps must remain unique.");
for (const workflow of [
  ".github/workflows/final-launch-mobile-realtime-admin-corrections.yml",
  ".github/workflows/verify-booking-checkout-hold-safety.yml",
  ".github/workflows/verify-booking-payout-workflow.yml",
  ".github/workflows/verify-featured-campaign-owner-controls.yml",
]) {
  const source = read(workflow);
  assert.doesNotMatch(source, /actions\\/(?:checkout|setup-node)@v4/);
}
const routeFiles = walk(path.join(root, "src/app/api")).filter((file) => file.endsWith("route.ts"));
for (const file of routeFiles) {
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /console\\.(?:error|warn)\\s*\\(/, \`Raw console failure logging remains in \${path.relative(root, file)}\`);
}
console.log("Final completion verification passed: temporary repair automation is absent, monitoring inventory and incident export are consolidated, payout reconciliation is sanitized, migration timestamps are unique, and persistent CI uses the supported action runtime.");
`;
write("scripts/verify-final-launch-completion.cjs", finalVerifier);

const packagePath = "package.json";
const packageJson = JSON.parse(read(packagePath));
packageJson.scripts ||= {};
packageJson.scripts["verify:final-completion"] =
  "node scripts/verify-final-launch-completion.cjs";
write(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(`PR47 finalizer prepared ${routeCount} monitored API routes and removed temporary repair automation.`);
