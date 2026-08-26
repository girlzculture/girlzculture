import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, path) {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`Missing expected source in ${path}: ${before.slice(0, 180)}`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected one source match in ${path}: ${before.slice(0, 180)}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const monitoringPath = "scripts/verify-operational-monitoring.mjs";
let monitoring = readFileSync(monitoringPath, "utf8");
monitoring = replaceOnce(
  monitoring,
  'assert.equal(routeFiles.length, 121, "Update the monitoring inventory when API routes are added or removed.");',
  'assert.equal(routeFiles.length, 124, "Update the monitoring inventory when API routes are added or removed.");',
  monitoringPath,
);
writeFileSync(monitoringPath, monitoring);

const inventoryPath = "docs/OPERATIONAL_MONITORING_ROUTE_INVENTORY_2026-07-23.md";
let inventory = readFileSync(inventoryPath, "utf8");
inventory = replaceOnce(
  inventory,
  "Updated: 2026-08-07.",
  "Updated: 2026-08-26.",
  inventoryPath,
);
inventory = replaceOnce(
  inventory,
  "| `/api/admin/finance` | GET | protected | Covered |\n| `/api/admin/finance/product-refund` | POST | provider-backed | Covered |",
  "| `/api/admin/finance` | GET | protected | Covered |\n| `/api/admin/finance/payout` | GET, POST | provider-backed | Covered |\n| `/api/admin/finance/product-refund` | POST | provider-backed | Covered |",
  inventoryPath,
);
inventory = replaceOnce(
  inventory,
  "| `/api/admin/team` | GET, POST, PATCH, DELETE | provider-backed | Covered |\n| `/api/admin/test-data` | GET, POST | protected | Covered |",
  "| `/api/admin/team` | GET, POST, PATCH, DELETE | provider-backed | Covered |\n| `/api/admin/team/[id]/activity` | GET | protected | Covered |\n| `/api/admin/test-data` | GET, POST | protected | Covered |",
  inventoryPath,
);
inventory = replaceOnce(
  inventory,
  "| `/api/salon/application` | POST | provider-backed | Covered |",
  "| `/api/salon/actionable-booking-count` | GET | protected | Covered |\n| `/api/salon/application` | POST | provider-backed | Covered |",
  inventoryPath,
);
writeFileSync(inventoryPath, inventory);

const payoutPath = "src/app/api/admin/finance/payout/route.ts";
let payout = readFileSync(payoutPath, "utf8");
payout = replaceOnce(
  payout,
  'import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";',
  'import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";',
  payoutPath,
);
payout = replaceOnce(
  payout,
  `        console.error("Payout reconciliation persistence failed", {\n          bookingId,\n          attemptId,\n          transferId: stripeTransferId || null,\n          message:\n            reconciliationError instanceof Error\n              ? reconciliationError.message.slice(0, 300)\n              : "Unknown reconciliation failure",\n        });`,
  `        noteOperationalFailure(\n          "Payout reconciliation persistence failed",\n          reconciliationError,\n        );`,
  payoutPath,
);
writeFileSync(payoutPath, payout);

const errorsPath = "src/app/api/admin/engine/errors/route.ts";
let errors = readFileSync(errorsPath, "utf8");
errors = replaceOnce(
  errors,
  `const MAX_EXPORT_ROWS = 10_000;\nconst EXPORT_BATCH_SIZE = 500;\n\ntype ErrorRow = Record<string, unknown>;`,
  `const MAX_EXPORT_ROWS = 10_000;\nconst EXPORT_BATCH_SIZE = 500;\nconst secretKey = /(?:authorization|cookie|token|secret|password|api[_-]?key|service[_-]?role|private[_-]?key|client[_-]?secret|webhook[_-]?secret)/i;\nconst secretValue = /(?:Bearer\\s+[A-Za-z0-9._~+\\/-]+=*|sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,})/g;\n\ntype ErrorRow = Record<string, unknown>;`,
  errorsPath,
);
errors = replaceOnce(
  errors,
  `function csvCell(value: unknown) {\n  let text = value == null\n    ? ""\n    : typeof value === "string"\n      ? value\n      : JSON.stringify(value);\n  text = text.replace(/\\r\\n?/g, "\\n");`,
  `function sanitize(value: unknown, depth = 0): unknown {\n  if (depth > 8) return "[depth limited]";\n  if (typeof value === "string") return value.replace(secretValue, "[redacted]");\n  if (Array.isArray(value)) {\n    return value.slice(0, 500).map((item) => sanitize(item, depth + 1));\n  }\n  if (value && typeof value === "object") {\n    return Object.fromEntries(\n      Object.entries(value as Record<string, unknown>)\n        .slice(0, 500)\n        .map(([key, item]) => [\n          key,\n          secretKey.test(key) ? "[redacted]" : sanitize(item, depth + 1),\n        ]),\n    );\n  }\n  return value;\n}\n\nfunction csvCell(value: unknown) {\n  const safeValue = sanitize(value);\n  let text = safeValue == null\n    ? ""\n    : typeof safeValue === "string"\n      ? safeValue\n      : JSON.stringify(safeValue);\n  text = text.replace(secretValue, "[redacted]").replace(/\\r\\n?/g, "\\n");`,
  errorsPath,
);
errors = replaceOnce(
  errors,
  `      const enriched: EnrichedExportRow[] = exportRows.map((row): EnrichedExportRow => {\n        const businesses = affectedByEvent.get(String(row.id || "")) || [];\n        return {\n          ...row,\n          presentation: operationalErrorPresentation(row),\n          affected_business_count: businesses.length,\n          affected_businesses: businesses,\n          assigned_admin: assigneeById.get(String(row.assigned_to || "")) || "",\n        };\n      });\n      const truncated = matchingCount > MAX_EXPORT_ROWS;\n      const commonHeaders = {`,
  `      const enriched: EnrichedExportRow[] = exportRows.map((row): EnrichedExportRow => {\n        const safeRow = sanitize(row) as ErrorRow;\n        const businesses = affectedByEvent.get(String(row.id || "")) || [];\n        const safeBusinesses = sanitize(businesses) as ErrorRow[];\n        return {\n          ...safeRow,\n          presentation: operationalErrorPresentation(safeRow),\n          affected_business_count: safeBusinesses.length,\n          affected_businesses: safeBusinesses,\n          assigned_admin: assigneeById.get(String(row.assigned_to || "")) || "",\n        };\n      });\n      const truncated = matchingCount > MAX_EXPORT_ROWS;\n      const exportAuditReference = crypto.randomUUID();\n      const exportAudit = await admin.from("record_management_events").insert({\n        record_type: "platform_error_export",\n        record_id: exportAuditReference,\n        record_label: \`Incident queue \${exportFormat.toUpperCase()} export\`,\n        action: "Created",\n        dependency_summary: {\n          format: exportFormat,\n          status: statuses.has(status) ? status : null,\n          severity: severity || null,\n          feature: feature || null,\n          event_id: eventId || null,\n          exported_count: enriched.length,\n          matching_count: matchingCount,\n          truncated,\n        },\n        reason: "Platform Admin exported authorized incident evidence.",\n        acting_user_id: context.user.id,\n        acting_scope: "platform_admin",\n      });\n      if (exportAudit.error) throw exportAudit.error;\n      const commonHeaders = {`,
  errorsPath,
);
errors = replaceOnce(
  errors,
  `        "X-Export-Truncated": String(truncated),\n      };`,
  `        "X-Export-Truncated": String(truncated),\n        "X-Export-Audit-Reference": exportAuditReference,\n      };`,
  errorsPath,
);
errors = replaceOnce(
  errors,
  `          exported_at: new Date().toISOString(),\n          filters:`,
  `          exported_at: new Date().toISOString(),\n          export_reference: exportAuditReference,\n          filters:`,
  errorsPath,
);
writeFileSync(errorsPath, errors);

console.log("Monitoring inventory and incident export hardening applied.");
