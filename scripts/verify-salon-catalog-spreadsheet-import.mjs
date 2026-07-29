import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import ts from "typescript";

const root = process.cwd();
const require = createRequire(import.meta.url);
const sourcePath = path.join(root, "src/lib/salonCatalogSpreadsheet.ts");
const routePath = path.join(
  root,
  "src/app/api/salon/catalog-spreadsheet/route.ts",
);
const panelPath = path.join(
  root,
  "src/components/owner/SalonSpreadsheetPanel.tsx",
);
const serviceUiPath = path.join(
  root,
  "src/components/owner/StructuredCatalogEditors.tsx",
);
const ownerUiPath = path.join(
  root,
  "src/components/owner/OwnerDashboardApp.tsx",
);
const migrationPath = path.join(
  root,
  "supabase/migrations/20260729140000_salon_catalog_spreadsheet_imports.sql",
);

const [source, route, panel, serviceUi, ownerUi, migration] =
  await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(panelPath, "utf8"),
    readFile(serviceUiPath, "utf8"),
    readFile(ownerUiPath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);

for (const [label, content, expressions] of [
  [
    "server parser",
    source,
    [
      /MAX_FILE_BYTES = 5 \* 1024 \* 1024/,
      /MAX_ROWS = 1_000/,
      /parseSalonServiceSpreadsheet/,
      /parseSalonProductSpreadsheet/,
      /resolveSalonServiceCatalogRows/,
      /buildSalonServiceTemplateWorkbook/,
      /buildSalonProductTemplateWorkbook/,
      /Images .* never erased by this import/,
    ],
  ],
  [
    "protected route",
    route,
    [
      /requireSalonPermission/,
      /kind === "services" \? "styles" : "products"/,
      /multipart\/form-data/,
      /file\.size > MAX_SPREADSHEET_BYTES/,
      /import_salon_services_spreadsheet/,
      /import_salon_products_spreadsheet/,
      /validationResponse/,
      /Cache-Control": "private, no-store"/,
      /withOperationalMonitoring/,
    ],
  ],
  [
    "salon owner controls",
    panel,
    [
      /Download Template/,
      /Export Current/,
      /Import &amp; Save/,
      /getSessionForScope\("salon"\)/,
      /readApiResponse/,
      /validation_errors/,
    ],
  ],
  [
    "styles and products integration",
    `${serviceUi}\n${ownerUi}`,
    [
      /SalonSpreadsheetPanel/,
      /kind="services"/,
      /kind="products"/,
      /c\.setStyles\(records\)/,
      /c\.setProducts\(records as Row\[\]\)/,
    ],
  ],
  [
    "transactional migration",
    migration,
    [
      /create table if not exists public\.salon_spreadsheet_imports/,
      /create or replace function public\.import_salon_services_spreadsheet/,
      /create or replace function public\.import_salon_products_spreadsheet/,
      /security definer/,
      /pg_advisory_xact_lock/,
      /style\.salon_id = p_salon_id/,
      /product\.salon_id = p_salon_id/,
      /grant execute on function public\.import_salon_services_spreadsheet[\s\S]*to service_role/,
      /grant execute on function public\.import_salon_products_spreadsheet[\s\S]*to service_role/,
    ],
  ],
]) {
  for (const expression of expressions) {
    assert.match(content, expression, `${label} is missing ${expression}`);
  }
}

assert.doesNotMatch(
  migration,
  /\b(?:truncate|drop table)\b/i,
  "salon spreadsheet migration must be additive",
);
assert.doesNotMatch(
  migration,
  /\b(?:photo_url|images|photos)\s*=/i,
  "spreadsheet updates must not replace existing media",
);
assert.doesNotMatch(
  panel,
  /Preview Import/,
  "salon spreadsheet UI must provide a direct Import & Save action",
);

const excelEntry = pathToFileURL(require.resolve("exceljs")).href;
const executableSource = source
  .replace('import "server-only";', "")
  .replace(
    'import ExcelJS from "exceljs";',
    `import ExcelJS from ${JSON.stringify(excelEntry)};`,
  );
const transpiled = ts.transpileModule(executableSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    esModuleInterop: true,
  },
  fileName: sourcePath,
  reportDiagnostics: true,
});
assert.equal(
  transpiled.diagnostics?.length || 0,
  0,
  "salon spreadsheet module must transpile cleanly",
);
const temporaryModule = path.join(
  tmpdir(),
  `girlz-salon-spreadsheet-${process.pid}-${Date.now()}.mjs`,
);
await writeFile(temporaryModule, transpiled.outputText);

try {
  const spreadsheet = await import(
    `${pathToFileURL(temporaryModule).href}?v=${Date.now()}`
  );
  const serviceWorkbook = new ExcelJS.Workbook();
  const services = serviceWorkbook.addWorksheet("Services");
  services.addRow([
    "Record ID",
    "Category",
    "Service Group",
    "Platform Service Name",
    "Customer-Facing Name",
    "Description",
    "Minimum Duration (Hours)",
    "Maximum Duration (Hours)",
    "Base Price (USD)",
    "Maximum Displayed Price (USD)",
    "Cleanup Buffer (Minutes)",
    "Add-ons (Name|Price; Name|Price)",
  ]);
  services.addRow([
    "",
    "Braids",
    "Knotless Braids",
    "Boho Knotless Braids",
    "Boho Knotless Braids",
    "Soft knotless braids with boho curls.",
    3,
    5,
    180,
    260,
    15,
    "Hair Included|35; Beads|15",
  ]);
  const parsedServices = await spreadsheet.parseSalonServiceSpreadsheet(
    Buffer.from(await serviceWorkbook.xlsx.writeBuffer()),
    "services.xlsx",
  );
  assert.equal(parsedServices.errors.length, 0);
  assert.equal(parsedServices.rows.length, 1);
  assert.deepEqual(parsedServices.rows[0].addons, [
    { name: "Hair Included", price: 35 },
    { name: "Beads", price: 15 },
  ]);

  services.addRow([
    "",
    "Braids",
    "Knotless Braids",
    "",
    "Invalid Service Settings",
    "x".repeat(501),
    1.1,
    2,
    100,
    150,
    10,
    "",
  ]);
  const invalidServices = await spreadsheet.parseSalonServiceSpreadsheet(
    Buffer.from(await serviceWorkbook.xlsx.writeBuffer()),
    "services.xlsx",
  );
  assert.equal(invalidServices.rows.length, 1);
  assert.equal(invalidServices.errors.length, 1);
  assert.match(
    invalidServices.errors[0].messages.join(" "),
    /500 characters or fewer/,
  );
  assert.match(
    invalidServices.errors[0].messages.join(" "),
    /quarter-hour increments/,
  );
  assert.match(
    invalidServices.errors[0].messages.join(" "),
    /0, 15, 30, 45, or 60/,
  );
  services.spliceRows(3, 1);

  const reference = {
    categories: [{ id: "category-1", name: "Braids" }],
    groups: [
      {
        id: "group-1",
        category_id: "category-1",
        name: "Knotless Braids",
      },
    ],
    services: [
      {
        id: "service-1",
        category_id: "category-1",
        service_group_id: "group-1",
        name: "Boho Knotless Braids",
      },
    ],
    addons: [
      { id: "addon-1", category_id: "category-1", name: "Hair Included" },
      { id: "addon-2", category_id: "category-1", name: "Beads" },
    ],
  };
  const resolved = spreadsheet.resolveSalonServiceCatalogRows(
    parsedServices.rows,
    reference,
  );
  assert.equal(resolved.errors.length, 0);
  assert.equal(resolved.rows[0].category_id, "category-1");
  assert.equal(resolved.rows[0].service_group_id, "group-1");
  assert.equal(resolved.rows[0].master_style_id, "service-1");

  const mismatched = spreadsheet.resolveSalonServiceCatalogRows(
    [
      {
        ...parsedServices.rows[0],
        source_row: 7,
        service_group: "Locs",
        addons: [{ name: "Not In Catalog", price: 10 }],
      },
    ],
    reference,
  );
  assert.equal(mismatched.errors.length, 1);
  assert.match(mismatched.errors[0].messages.join(" "), /does not belong/);
  assert.match(mismatched.errors[0].messages.join(" "), /not available/);

  const productWorkbook = new ExcelJS.Workbook();
  const products = productWorkbook.addWorksheet("Products");
  products.addRow([
    "Record ID",
    "Product Name",
    "SKU",
    "Description",
    "Regular Price (USD)",
    "Sale Price (USD)",
    "Status",
    "Track Inventory",
    "Quantity Available",
    "Low-Stock Alert At",
    "Pickup Enabled",
    "Pickup Preparation (Minutes)",
    "Shipping Enabled",
    "Shipping Price (USD)",
    "Weight (Ounces)",
    "Shipping Profile",
    "Package Length (Inches)",
    "Package Width (Inches)",
    "Package Height (Inches)",
    "Tax Category",
    "Maximum Quantity Per Order",
    "Visible on Public Page",
  ]);
  products.addRow([
    "",
    "Braiding Gel",
    "GEL-001",
    "Strong-hold braiding gel.",
    18,
    15,
    "Active",
    "Yes",
    12,
    3,
    "Yes",
    60,
    "No",
    0,
    8,
    "",
    4,
    4,
    3,
    "hair_care_products",
    4,
    "Yes",
  ]);
  const parsedProducts = await spreadsheet.parseSalonProductSpreadsheet(
    Buffer.from(await productWorkbook.xlsx.writeBuffer()),
    "products.xlsx",
  );
  assert.equal(parsedProducts.errors.length, 0);
  assert.equal(parsedProducts.rows.length, 1);
  assert.equal(parsedProducts.rows[0].pickup_enabled, true);
  assert.equal(parsedProducts.rows[0].track_inventory, true);

  products.addRow([
    "",
    "Invalid Active Product",
    "BAD-001",
    "",
    20,
    "",
    "Active",
    "No",
    0,
    0,
    "No",
    60,
    "No",
    0,
    "",
    "",
    "",
    "",
    "",
    "general_tangible_goods",
    1,
    "Yes",
  ]);
  const invalidProducts = await spreadsheet.parseSalonProductSpreadsheet(
    Buffer.from(await productWorkbook.xlsx.writeBuffer()),
    "products.xlsx",
  );
  assert.equal(invalidProducts.rows.length, 1);
  assert.equal(invalidProducts.errors.length, 1);
  assert.match(
    invalidProducts.errors[0].messages.join(" "),
    /must enable pickup or shipping/,
  );

  const serviceTemplate = new ExcelJS.Workbook();
  await serviceTemplate.xlsx.load(
    await spreadsheet.buildSalonServiceTemplateWorkbook(reference),
  );
  assert.ok(serviceTemplate.getWorksheet("Instructions"));
  assert.ok(serviceTemplate.getWorksheet("Services"));
  assert.ok(serviceTemplate.getWorksheet("Platform Catalog"));
  assert.equal(serviceTemplate.getWorksheet("Services").rowCount, 1);

  const productTemplate = new ExcelJS.Workbook();
  await productTemplate.xlsx.load(
    await spreadsheet.buildSalonProductTemplateWorkbook(),
  );
  assert.ok(productTemplate.getWorksheet("Instructions"));
  assert.ok(productTemplate.getWorksheet("Products"));
  assert.equal(productTemplate.getWorksheet("Products").rowCount, 1);

  const serviceExport = new ExcelJS.Workbook();
  await serviceExport.xlsx.load(
    await spreadsheet.buildSalonServiceExportWorkbook(
      reference,
      parsedServices.rows,
    ),
  );
  assert.equal(serviceExport.getWorksheet("Services").rowCount, 2);

  const productExport = new ExcelJS.Workbook();
  await productExport.xlsx.load(
    await spreadsheet.buildSalonProductExportWorkbook(parsedProducts.rows),
  );
  assert.equal(productExport.getWorksheet("Products").rowCount, 2);
} finally {
  await unlink(temporaryModule).catch(() => undefined);
}

console.log(
  "Salon spreadsheet verification passed: service/product parsing, catalog resolution, invalid-row blocking, templates, exports, direct Import & Save controls, role protection, media preservation, audit, and transactional RPCs.",
);
