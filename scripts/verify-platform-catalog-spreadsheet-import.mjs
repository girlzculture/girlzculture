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
const sourcePath = path.join(root, "src/lib/platformCatalogSpreadsheet.ts");
const routePath = path.join(root, "src/app/api/admin/catalog-spreadsheet/route.ts");
const uiPath = path.join(root, "src/components/AdminContentManager.tsx");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260728210000_platform_catalog_spreadsheet_import.sql",
);
const [source, route, ui, migration] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(uiPath, "utf8"),
  readFile(migrationPath, "utf8"),
]);

for (const [label, content, expressions] of [
  [
    "server parser",
    source,
    [
      /MAX_FILE_BYTES = 5 \* 1024 \* 1024/,
      /MAX_ROWS = 2_000/,
      /buildCatalogPreview/,
      /buildCatalogTemplateWorkbook/,
      /buildCatalogExportWorkbook/,
      /Conflicting service names are skipped/,
    ],
  ],
  [
    "protected route",
    route,
    [
      /requireAdminPermission\(request, "content"\)/,
      /multipart\/form-data/,
      /admin_import_service_catalog/,
      /readable|Uint8Array/i,
      /Cache-Control": "private, no-store"/,
    ],
  ],
  [
    "platform admin UI",
    ui,
    [
      /Spreadsheet import & export/,
      /Download Template/,
      /Export Current Catalog/,
      /Preview Import/,
      /Import .*Valid Row/,
      /Download Error Report/,
      /headers\.delete\("Content-Type"\)/,
      /readApiResponse/,
    ],
  ],
  [
    "atomic migration",
    migration,
    [
      /create or replace function public\.admin_import_service_catalog/,
      /security definer/,
      /permissions->>'content'/,
      /record_management_events/,
      /grant execute .*admin_import_service_catalog[\s\S]*to service_role/,
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
  "spreadsheet migration must be additive",
);
assert.doesNotMatch(
  route,
  /price|duration|image_url|photo_url/,
  "platform catalog route must not import salon pricing, duration, or images",
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
  "spreadsheet module must transpile cleanly",
);
const temporaryModule = path.join(
  tmpdir(),
  `girlz-catalog-spreadsheet-${process.pid}-${Date.now()}.mjs`,
);
await writeFile(temporaryModule, transpiled.outputText);

try {
  const spreadsheetModule = await import(`${pathToFileURL(temporaryModule).href}?v=${Date.now()}`);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Service Catalog");
  sheet.addRow([
    "Category",
    "Service Group",
    "Service Name",
    "Suggested Add-ons",
    "Price Low",
    "Notes",
  ]);
  sheet.addRow(["Hair", "Braids", "Box Braids", "Beads; Color", 100, "Ignored"]);
  sheet.addRow(["Hair", "Braids", "Knotless Braids", "Beads", 120, "Ignored"]);
  sheet.addRow(["Nails", "Manicure", "Classic Manicure", "Gel", 45, "Ignored"]);
  const fixture = Buffer.from(await workbook.xlsx.writeBuffer());
  const existing = { categories: [], groups: [], services: [], addons: [] };
  const parsed = await spreadsheetModule.parseCatalogSpreadsheet(
    fixture,
    "catalog.xlsx",
    existing,
  );
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.ignoredColumns, ["Price Low", "Notes"]);
  const preview = spreadsheetModule.buildCatalogPreview(parsed, existing);
  assert.equal(preview.summary.total, 3);
  assert.equal(preview.summary.create, 3);
  assert.equal(preview.summary.importable, 3);
  assert.equal(preview.summary.skipped, 0);
  assert.deepEqual(preview.import_rows[0].addons, ["Beads", "Color"]);

  const conflictExisting = {
    categories: [
      { id: "category-1", name: "Hair", slug: "hair", is_active: true },
    ],
    groups: [
      {
        id: "group-1",
        category_id: "category-1",
        name: "Locs",
        is_active: true,
      },
    ],
    services: [
      {
        id: "service-1",
        category_id: "category-1",
        service_group_id: "group-1",
        name: "Box Braids",
        is_active: true,
      },
    ],
    addons: [],
  };
  const conflictParsed = await spreadsheetModule.parseCatalogSpreadsheet(
    fixture,
    "catalog.xlsx",
    conflictExisting,
  );
  const conflictPreview = spreadsheetModule.buildCatalogPreview(
    conflictParsed,
    conflictExisting,
  );
  assert.equal(conflictPreview.rows[0].status, "conflict");
  assert.equal(conflictPreview.summary.skipped, 1);

  const templateBytes = await spreadsheetModule.buildCatalogTemplateWorkbook();
  const template = new ExcelJS.Workbook();
  await template.xlsx.load(templateBytes);
  const templateCatalog = template.getWorksheet("Catalog");
  assert.ok(templateCatalog);
  assert.equal(templateCatalog.rowCount, 1, "template must not contain fake data");
  assert.deepEqual(
    templateCatalog.getRow(1).values.slice(1),
    ["Category", "Service Group", "Service Name", "Suggested Add-ons"],
  );

  if (process.argv[2]) {
    const uploadedFixture = await readFile(path.resolve(process.argv[2]));
    const uploaded = await spreadsheetModule.parseCatalogSpreadsheet(
      uploadedFixture,
      path.basename(process.argv[2]),
      existing,
    );
    const uploadedPreview = spreadsheetModule.buildCatalogPreview(uploaded, existing);
    assert.ok(uploadedPreview.summary.total > 0, "uploaded workbook must contain catalog rows");
    console.log(
      `Uploaded workbook preview: ${uploadedPreview.summary.total} normalized rows from "${uploadedPreview.sheet_name}", ${uploadedPreview.ignored_columns.length} safely ignored columns.`,
    );
  }
} finally {
  await unlink(temporaryModule).catch(() => undefined);
}

console.log(
  "Platform catalog spreadsheet verification passed: parser, preview, conflict handling, blank template, protected route, UI, and atomic migration.",
);
