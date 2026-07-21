import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const audit = read("docs/PLATFORM_SELF_AUDIT_2026-07-20.md");
const matrix = read("docs/PLATFORM_TEST_MATRIX_2026-07-20.md");

const auditRequirements = [
  "## Implementation ledger",
  "## 1. Configuration surfaces made admin-manageable",
  "### Page-by-page public/customer inventory",
  "### Salon-owner inventory",
  "### Platform-admin inventory",
  "## 2. Hardcoded values moved into Engine",
  "## 3. Hardcoded values intentionally not moved",
  "## 4. Record types and permitted lifecycle operations",
  "## 5. Unsupported operations and reasons",
  "## 6. Authentication/signup/login/invitation paths audited",
  "## 7. Media-upload surfaces",
  "## 8. Numeric-input audit",
  "## 9. Localization coverage and exceptions",
  "## 10. Salon public-visibility gates",
  "## 11. Deployment, migrations, environment and live-test requirements",
];

for (const requirement of auditRequirements) assert.match(audit, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const matrixRequirements = [
  "## Identity and admin security",
  "## Admin salons and activation",
  "## Search and location",
  "## Media",
  "## Localization",
  "## Numeric inputs",
  "## Engine and record management",
  "## Regression and permissions",
  "## Final status summary",
  "anonymous/customer/salon-owner/salon-team/limited-admin/super-admin",
  "TypeScript",
  "Optimized production build",
  "SQL parser/schema verification",
  "RLS matrix",
  "Full accessibility audit",
  "Database migration applied",
  "Live verified",
];

for (const requirement of matrixRequirements) assert.match(matrix, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const allowedStatuses = new Set(["Complete", "Not complete", "Blocked", "Not applicable"]);
const rows = matrix.split("\n").filter((line) => line.startsWith("|") && !line.includes("---"));
let statusRows = 0;
for (const row of rows) {
  const columns = row.split("|").slice(1, -1).map((column) => column.trim());
  const status = columns.at(-2);
  if (!allowedStatuses.has(status)) continue;
  statusRows += 1;
  assert.ok(columns.at(-1), `Missing evidence for matrix row: ${row}`);
  if (status === "Complete") {
    assert.ok(columns.at(-1).length >= 20, `Complete row needs concrete evidence: ${row}`);
  }
}

assert.ok(statusRows >= 60, `Expected at least 60 evidence-backed status rows, found ${statusRows}`);
assert.doesNotMatch(matrix, /\|\s*(Partial|In progress|Pending|Pass|Failed)\s*\|/i);

console.log(`Platform self-audit verification passed (${auditRequirements.length} inventory requirements, ${statusRows} evidence-backed matrix rows).`);
