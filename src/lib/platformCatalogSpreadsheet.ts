import "server-only";

import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export type CatalogImportRow = {
  source_rows: number[];
  category: string;
  category_slug: string;
  service_group: string;
  service_name: string;
  addons: string[];
};

export type CatalogPreviewStatus =
  | "create"
  | "restore"
  | "unchanged"
  | "conflict"
  | "invalid";

export type CatalogPreviewRow = CatalogImportRow & {
  status: CatalogPreviewStatus;
  messages: string[];
};

type CatalogRecord = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  category_id?: unknown;
  service_group_id?: unknown;
  is_active?: unknown;
  archived_at?: unknown;
};

export type CatalogExistingState = {
  categories: CatalogRecord[];
  groups: CatalogRecord[];
  services: CatalogRecord[];
  addons: CatalogRecord[];
};

export type CatalogSpreadsheetPreview = {
  sheet_name: string;
  ignored_columns: string[];
  rows: CatalogPreviewRow[];
  import_rows: CatalogImportRow[];
  summary: Record<CatalogPreviewStatus, number> & {
    total: number;
    importable: number;
    skipped: number;
  };
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2_000;
const MAX_ADDONS_PER_ROW = 50;
const HEADER_SCAN_ROWS = 25;

const headerAliases = new Map<string, keyof Omit<CatalogImportRow, "source_rows" | "category_slug">>([
  ["category", "category"],
  ["service category", "category"],
  ["category display on site", "category"],
  ["service group", "service_group"],
  ["group", "service_group"],
  ["service name", "service_name"],
  ["service", "service_name"],
  ["suggested add ons", "addons"],
  ["suggested addons", "addons"],
  ["add ons", "addons"],
  ["addons", "addons"],
]);

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function key(value: unknown) {
  return normalized(value).toLocaleLowerCase("en-US");
}

function headerKey(value: unknown) {
  return key(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function catalogSlug(value: string) {
  const slug = normalized(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return slug || "service-category";
}

function cellText(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) return normalized(value.result);
    if ("text" in value) return normalized(value.text);
    if ("richText" in value && Array.isArray(value.richText)) {
      return normalized(value.richText.map((part) => part.text).join(""));
    }
  }
  return normalized(value);
}

function splitAddons(value: string) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value.split(/[;\n]+/)) {
    const addon = normalized(raw);
    const addonKey = key(addon);
    if (!addon || seen.has(addonKey)) continue;
    seen.add(addonKey);
    result.push(addon);
  }
  return result.slice(0, MAX_ADDONS_PER_ROW + 1);
}

async function loadWorkbook(buffer: Buffer, fileName: string) {
  if (!buffer.length) throw new Error("Choose a non-empty Excel or CSV file.");
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error("Catalog spreadsheets must be 5 MB or smaller.");
  }
  const extension = fileName.toLowerCase().split(".").pop();
  const workbook = new ExcelJS.Workbook();
  if (extension === "xlsx") {
    const bytes = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    await workbook.xlsx.load(bytes);
  } else if (extension === "csv") {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    throw new Error("Upload an .xlsx or .csv catalog file.");
  }
  return workbook;
}

function readMappedCell(
  row: ExcelJS.Row,
  columns: Map<
    keyof Omit<CatalogImportRow, "source_rows" | "category_slug">,
    number
  >,
  field: keyof Omit<CatalogImportRow, "source_rows" | "category_slug">,
) {
  const column = columns.get(field);
  return column ? cellText(row.getCell(column).value) : "";
}

function mappedHeader(worksheet: ExcelJS.Worksheet) {
  const maximum = Math.min(worksheet.rowCount, HEADER_SCAN_ROWS);
  for (let rowNumber = 1; rowNumber <= maximum; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = new Map<
      keyof Omit<CatalogImportRow, "source_rows" | "category_slug">,
      number
    >();
    const originalHeaders: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const label = cellText(cell.value);
      if (!label) return;
      originalHeaders.push(label);
      const field = headerAliases.get(headerKey(label));
      if (field && !columns.has(field)) columns.set(field, columnNumber);
    });
    if (columns.has("category")) {
      return { rowNumber, columns, originalHeaders };
    }
  }
  return null;
}

function selectCatalogWorksheet(workbook: ExcelJS.Workbook) {
  const preferred = workbook.worksheets.find((worksheet) =>
    ["catalog", "service catalog"].includes(key(worksheet.name)),
  );
  if (preferred && mappedHeader(preferred)) return preferred;
  return workbook.worksheets.find((worksheet) => mappedHeader(worksheet)) || null;
}

function assignCategorySlugs(
  rows: Omit<CatalogImportRow, "category_slug">[],
  existing: CatalogExistingState,
) {
  const existingByName = new Map(
    existing.categories.map((row) => [key(row.name), normalized(row.slug)]),
  );
  const used = new Map(
    existing.categories
      .map((row) => [normalized(row.slug), key(row.name)] as const)
      .filter(([slug]) => Boolean(slug)),
  );
  const assigned = new Map<string, string>();
  for (const row of rows) {
    const categoryKey = key(row.category);
    if (assigned.has(categoryKey)) continue;
    const existingSlug = existingByName.get(categoryKey);
    if (existingSlug) {
      assigned.set(categoryKey, existingSlug);
      continue;
    }
    const base = catalogSlug(row.category);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate) && used.get(candidate) !== categoryKey) {
      candidate = `${base.slice(0, Math.max(1, 70 - String(suffix).length - 1))}-${suffix}`;
      suffix += 1;
    }
    used.set(candidate, categoryKey);
    assigned.set(categoryKey, candidate);
  }
  return rows.map((row) => ({
    ...row,
    category_slug: assigned.get(key(row.category)) || catalogSlug(row.category),
  }));
}

export async function parseCatalogSpreadsheet(
  buffer: Buffer,
  fileName: string,
  existing: CatalogExistingState,
) {
  const workbook = await loadWorkbook(buffer, fileName);
  const worksheet = selectCatalogWorksheet(workbook);
  if (!worksheet) {
    throw new Error(
      'No catalog table was found. Use a sheet named "Catalog" with a Category column.',
    );
  }
  const header = mappedHeader(worksheet);
  if (!header) throw new Error("The catalog header row could not be found.");
  const ignoredColumns = header.originalHeaders.filter(
    (label) => !headerAliases.has(headerKey(label)),
  );
  const parsed: Array<Omit<CatalogImportRow, "category_slug">> = [];
  for (
    let rowNumber = header.rowNumber + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);
    const category = readMappedCell(row, header.columns, "category");
    const serviceGroup = readMappedCell(row, header.columns, "service_group");
    const serviceName = readMappedCell(row, header.columns, "service_name");
    const addons = splitAddons(readMappedCell(row, header.columns, "addons"));
    if (!category && !serviceGroup && !serviceName && !addons.length) continue;
    if (parsed.length >= MAX_ROWS) {
      throw new Error(`Catalog spreadsheets may contain at most ${MAX_ROWS} data rows.`);
    }
    parsed.push({
      source_rows: [rowNumber],
      category,
      service_group: serviceGroup,
      service_name: serviceName,
      addons,
    });
  }
  if (!parsed.length) throw new Error("The spreadsheet does not contain any catalog rows.");

  const merged = new Map<string, Omit<CatalogImportRow, "category_slug">>();
  for (const row of parsed) {
    const rowKey = [row.category, row.service_group, row.service_name].map(key).join("::");
    const current = merged.get(rowKey);
    if (!current) {
      merged.set(rowKey, row);
      continue;
    }
    const addonMap = new Map(
      [...current.addons, ...row.addons].map((addon) => [key(addon), addon]),
    );
    current.addons = [...addonMap.values()];
    current.source_rows.push(...row.source_rows);
  }
  return {
    sheetName: worksheet.name,
    ignoredColumns,
    rows: assignCategorySlugs([...merged.values()], existing),
  };
}

function isArchived(record: CatalogRecord | undefined) {
  return Boolean(record?.archived_at) || record?.is_active === false;
}

export function buildCatalogPreview(
  input: {
    sheetName: string;
    ignoredColumns: string[];
    rows: CatalogImportRow[];
  },
  existing: CatalogExistingState,
): CatalogSpreadsheetPreview {
  const categoriesByName = new Map(
    existing.categories.map((row) => [key(row.name), row]),
  );
  const groupsById = new Map(existing.groups.map((row) => [normalized(row.id), row]));
  const groupsByPath = new Map(
    existing.groups.map((row) => [
      `${normalized(row.category_id)}::${key(row.name)}`,
      row,
    ]),
  );
  const servicesByName = new Map(
    existing.services.map((row) => [key(row.name), row]),
  );
  const addonsByPath = new Map(
    existing.addons.map((row) => [
      `${normalized(row.category_id)}::${key(row.name)}`,
      row,
    ]),
  );
  const incomingServicePaths = new Map<string, Set<string>>();
  for (const row of input.rows) {
    if (!row.service_name) continue;
    const serviceKey = key(row.service_name);
    const paths = incomingServicePaths.get(serviceKey) || new Set<string>();
    paths.add(`${key(row.category)}::${key(row.service_group)}`);
    incomingServicePaths.set(serviceKey, paths);
  }

  const rows = input.rows.map<CatalogPreviewRow>((row) => {
    const messages: string[] = [];
    const actions = new Set<CatalogPreviewStatus>();
    if (!row.category) messages.push("Category is required.");
    if (row.category.length > 80) messages.push("Category must be 80 characters or fewer.");
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.category_slug) ||
      row.category_slug.length > 80
    ) {
      messages.push("The generated category URL slug is invalid.");
    }
    if (row.service_name && !row.service_group) {
      messages.push("Service Group is required when Service Name is provided.");
    }
    if (row.service_group.length > 80) {
      messages.push("Service Group must be 80 characters or fewer.");
    }
    if (row.service_name.length > 100) {
      messages.push("Service Name must be 100 characters or fewer.");
    }
    if (
      row.service_name &&
      (incomingServicePaths.get(key(row.service_name))?.size || 0) > 1
    ) {
      messages.push(
        `"${row.service_name}" appears under more than one category or service group in this spreadsheet.`,
      );
    }
    if (row.addons.length > MAX_ADDONS_PER_ROW) {
      messages.push(`A row may contain at most ${MAX_ADDONS_PER_ROW} add-ons.`);
    }
    for (const addon of row.addons) {
      if (addon.length > 80) messages.push(`Add-on "${addon}" exceeds 80 characters.`);
    }
    if (messages.length) return { ...row, status: "invalid", messages };

    const category = categoriesByName.get(key(row.category));
    if (!category) actions.add("create");
    else if (isArchived(category)) actions.add("restore");
    else actions.add("unchanged");

    const categoryId = normalized(category?.id);
    const group = row.service_group && categoryId
      ? groupsByPath.get(`${categoryId}::${key(row.service_group)}`)
      : undefined;
    if (row.service_group) {
      if (!group) actions.add("create");
      else if (isArchived(group)) actions.add("restore");
      else actions.add("unchanged");
    }

    if (row.service_name) {
      const service = servicesByName.get(key(row.service_name));
      if (!service) {
        actions.add("create");
      } else {
        const existingGroup = groupsById.get(normalized(service.service_group_id));
        const samePath =
          key(existingGroup?.name) === key(row.service_group) &&
          key(categoriesByName.get(key(row.category))?.name) === key(row.category) &&
          normalized(existingGroup?.category_id) === categoryId;
        if (!samePath) {
          messages.push(
            `"${row.service_name}" already belongs to another category or service group.`,
          );
          actions.add("conflict");
        } else if (isArchived(service)) {
          actions.add("restore");
        } else {
          actions.add("unchanged");
        }
      }
    }

    for (const addon of row.addons) {
      const existingAddon = categoryId
        ? addonsByPath.get(`${categoryId}::${key(addon)}`)
        : undefined;
      if (!existingAddon) actions.add("create");
      else if (isArchived(existingAddon)) actions.add("restore");
      else actions.add("unchanged");
    }

    const status: CatalogPreviewStatus = actions.has("conflict")
      ? "conflict"
      : actions.has("create")
        ? "create"
        : actions.has("restore")
          ? "restore"
          : "unchanged";
    if (!messages.length) {
      messages.push(
        status === "create"
          ? "Creates one or more missing catalog records."
          : status === "restore"
            ? "Restores matching hidden or archived catalog records."
            : "All matching catalog records are already active.",
      );
    }
    return { ...row, status, messages };
  });

  const summary = {
    total: rows.length,
    create: rows.filter((row) => row.status === "create").length,
    restore: rows.filter((row) => row.status === "restore").length,
    unchanged: rows.filter((row) => row.status === "unchanged").length,
    conflict: rows.filter((row) => row.status === "conflict").length,
    invalid: rows.filter((row) => row.status === "invalid").length,
    importable: rows.filter((row) => !["conflict", "invalid"].includes(row.status))
      .length,
    skipped: rows.filter((row) => ["conflict", "invalid"].includes(row.status)).length,
  };
  return {
    sheet_name: input.sheetName,
    ignored_columns: input.ignoredColumns,
    rows,
    import_rows: rows
      .filter((row) => !["conflict", "invalid"].includes(row.status))
      .map((row) => ({
        source_rows: row.source_rows,
        category: row.category,
        category_slug: row.category_slug,
        service_group: row.service_group,
        service_name: row.service_name,
        addons: row.addons,
      })),
    summary,
  };
}

function styleWorkbook(workbook: ExcelJS.Workbook) {
  workbook.creator = "Girlz Culture";
  workbook.company = "Girlz Culture";
  workbook.created = new Date();
}

function styleCatalogSheet(worksheet: ExcelJS.Worksheet) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = "A1:D1";
  worksheet.columns = [
    { header: "Category", key: "category", width: 30 },
    { header: "Service Group", key: "service_group", width: 28 },
    { header: "Service Name", key: "service_name", width: 34 },
    { header: "Suggested Add-ons", key: "addons", width: 56 },
  ];
  const header = worksheet.getRow(1);
  header.height = 26;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008A8A" } };
  header.alignment = { vertical: "middle" };
  worksheet.getColumn(4).alignment = { wrapText: true, vertical: "top" };
}

function addInstructions(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 112 }];
  [
    "Girlz Culture — Platform Service Catalog Import",
    "",
    "Use the Catalog sheet only. Do not add prices, durations, or images.",
    "Required: Category. Service Group is required whenever Service Name is provided.",
    "Suggested Add-ons are optional and must be separated with semicolons.",
    "A category-only row creates the category. A category and group row creates the group.",
    "Import first shows a preview. Nothing is saved until you approve the preview.",
    "Existing matching records are retained; archived matching records are restored.",
    "Conflicting service names are skipped and shown clearly before import.",
  ].forEach((value) => sheet.addRow([value]));
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF0D1114" } };
  sheet.getCell("A3").font = { bold: true, color: { argb: "FF008A8A" } };
  sheet.getColumn(1).alignment = { wrapText: true, vertical: "top" };
}

export async function buildCatalogTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  styleWorkbook(workbook);
  addInstructions(workbook);
  const catalog = workbook.addWorksheet("Catalog");
  styleCatalogSheet(catalog);
  return workbook.xlsx.writeBuffer();
}

export async function buildCatalogExportWorkbook(existing: {
  categories: Array<CatalogRecord & { description?: unknown; sort_order?: unknown }>;
  groups: Array<CatalogRecord & { sort_order?: unknown }>;
  services: Array<CatalogRecord & { sort_order?: unknown }>;
  addons: Array<CatalogRecord & { sort_order?: unknown }>;
}) {
  const workbook = new ExcelJS.Workbook();
  styleWorkbook(workbook);
  addInstructions(workbook);
  const catalog = workbook.addWorksheet("Catalog");
  styleCatalogSheet(catalog);
  const addonsByCategory = new Map<string, string[]>();
  for (const addon of existing.addons.filter((row) => !isArchived(row))) {
    const categoryId = normalized(addon.category_id);
    addonsByCategory.set(categoryId, [
      ...(addonsByCategory.get(categoryId) || []),
      normalized(addon.name),
    ]);
  }
  const activeCategories = existing.categories
    .filter((row) => !isArchived(row))
    .sort((a, b) => normalized(a.name).localeCompare(normalized(b.name)));
  const activeGroups = existing.groups.filter((row) => !isArchived(row));
  const activeServices = existing.services.filter((row) => !isArchived(row));
  for (const category of activeCategories) {
    const categoryId = normalized(category.id);
    const categoryGroups = activeGroups
      .filter((row) => normalized(row.category_id) === categoryId)
      .sort((a, b) => normalized(a.name).localeCompare(normalized(b.name)));
    const categoryAddons = (addonsByCategory.get(categoryId) || [])
      .sort((a, b) => a.localeCompare(b))
      .join("; ");
    if (!categoryGroups.length) {
      catalog.addRow({
        category: normalized(category.name),
        service_group: "",
        service_name: "",
        addons: categoryAddons,
      });
      continue;
    }
    for (const group of categoryGroups) {
      const groupServices = activeServices
        .filter((row) => normalized(row.service_group_id) === normalized(group.id))
        .sort((a, b) => normalized(a.name).localeCompare(normalized(b.name)));
      if (!groupServices.length) {
        catalog.addRow({
          category: normalized(category.name),
          service_group: normalized(group.name),
          service_name: "",
          addons: categoryAddons,
        });
        continue;
      }
      for (const service of groupServices) {
        catalog.addRow({
          category: normalized(category.name),
          service_group: normalized(group.name),
          service_name: normalized(service.name),
          addons: categoryAddons,
        });
      }
    }
  }

  const categoryNames = new Map(
    existing.categories.map((row) => [normalized(row.id), normalized(row.name)]),
  );
  const categories = workbook.addWorksheet("Categories");
  categories.columns = [
    { header: "Category", key: "name", width: 32 },
    { header: "URL Slug", key: "slug", width: 32 },
    { header: "Description", key: "description", width: 70 },
    { header: "Status", key: "status", width: 16 },
  ];
  for (const row of existing.categories) {
    categories.addRow({
      name: normalized(row.name),
      slug: normalized(row.slug),
      description: normalized(row.description),
      status: isArchived(row) ? "Hidden / archived" : "Active",
    });
  }

  const groups = workbook.addWorksheet("Service Groups");
  groups.columns = [
    { header: "Category", key: "category", width: 32 },
    { header: "Service Group", key: "name", width: 32 },
    { header: "Status", key: "status", width: 16 },
  ];
  for (const row of existing.groups) {
    groups.addRow({
      category: categoryNames.get(normalized(row.category_id)) || "",
      name: normalized(row.name),
      status: isArchived(row) ? "Hidden / archived" : "Active",
    });
  }

  const addons = workbook.addWorksheet("Add-ons");
  addons.columns = [
    { header: "Category", key: "category", width: 32 },
    { header: "Add-on", key: "name", width: 38 },
    { header: "Status", key: "status", width: 16 },
  ];
  for (const row of existing.addons) {
    addons.addRow({
      category: categoryNames.get(normalized(row.category_id)) || "",
      name: normalized(row.name),
      status: isArchived(row) ? "Hidden / archived" : "Active",
    });
  }

  for (const sheet of [categories, groups, addons]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = `A1:${sheet.columnCount === 4 ? "D" : "C"}1`;
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008A8A" } };
    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
  }
  return workbook.xlsx.writeBuffer();
}
