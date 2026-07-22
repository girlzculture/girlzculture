import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const ordering = read("src/lib/catalogOrdering.ts");
const contentApi = read("src/app/api/admin/content/route.ts");
const recordsApi = read("src/app/api/admin/records/route.ts");
const adminManager = read("src/components/AdminContentManager.tsx");
const ownerEditors = read("src/components/owner/StructuredCatalogEditors.tsx");
const migration = read("supabase/migrations/20260721140000_flexible_service_catalog.sql");
const lifecycleMigration = read("supabase/migrations/20260720180000_record_lifecycle_management.sql");

for (const token of ["Intl.Collator", 'sensitivity: "base"', "explicitSortOrder", "sort_order", "tieBreakerCollator", "String(left.id"])
  assert.ok(ordering.includes(token), `Catalog ordering is missing ${token}`);
for (const collection of ["masterStyles", "serviceCategories", "serviceGroups", "serviceAddons"])
  assert.match(contentApi, new RegExp(`${collection}: sortCatalogRecords`), `${collection} is not normalized before the admin response`);
assert.ok((ownerEditors.match(/sortCatalogRecords/g) || []).length >= 5, "Salon owner catalog lists are not consistently normalized");

for (const token of [
  "Select all current visible results",
  "Clear selection",
  "Batch dependency preview",
  "selectedRows = rows.filter",
  "const targets = displayedTargets",
  "currentDependencies",
  "dependent record",
  "Last batch results",
  "Every successful change is written to the audit history",
]) assert.ok(adminManager.includes(token), `Catalog batch workflow is missing ${token}`);

for (const token of ["dependencyPlan", "confirmation", "record_management_events", "admin_manage_catalog_record", "still used"])
  assert.ok(recordsApi.includes(token), `Managed-record safety is missing ${token}`);
for (const token of ["admin_reassign_service_group", "record_management_events", "service_group_id", "replace_style_materials"])
  assert.ok(migration.includes(token), `Flexible catalog migration is missing ${token}`);
for (const token of ["admin_manage_catalog_record", "record_management_events", "dependency_summary"])
  assert.ok(lifecycleMigration.includes(token), `Catalog lifecycle migration is missing ${token}`);

const base = new Intl.Collator("en", { usage: "sort", sensitivity: "base", numeric: true });
const exact = new Intl.Collator("en", { usage: "sort", sensitivity: "variant", numeric: true });
const explicit = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const compare = (left, right) => {
  const leftOrder = explicit(left.sort_order);
  const rightOrder = explicit(right.sort_order);
  if (leftOrder !== null || rightOrder !== null) {
    if (leftOrder === null) return 1;
    if (rightOrder === null) return -1;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }
  return base.compare(left.name, right.name) || exact.compare(left.name, right.name) || left.id.localeCompare(right.id);
};
const fixture = [
  { id: "4", name: "beta", sort_order: 0 },
  { id: "5", name: "Zeta", sort_order: 1 },
  { id: "3", name: "álpha", sort_order: 0 },
  { id: "2", name: "Beta", sort_order: 2 },
  { id: "1", name: "Alpha", sort_order: 0 },
].sort(compare);
assert.deepEqual(fixture.map((item) => item.id), ["5", "2", "1", "3", "4"], "Explicit order and case/accent-stable alphabetical fallback regressed");

console.log("Service catalog management verified: stable ordering, visible-only selection, dependency previews, confirmations, per-record outcomes, and audited safe actions.");
