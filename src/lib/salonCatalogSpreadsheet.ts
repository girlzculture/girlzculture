import "server-only";

import ExcelJS from "exceljs";
import { Readable } from "node:stream";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SalonSpreadsheetKind = "services" | "products";

export type SalonCatalogReference = {
  categories: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; category_id: string; name: string }>;
  services: Array<{
    id: string;
    category_id: string;
    service_group_id: string;
    name: string;
  }>;
  addons: Array<{ id: string; category_id: string; name: string }>;
};

export type ServiceAddonImport = {
  name: string;
  price: number;
};

export type SalonServiceImportRow = {
  source_row: number;
  record_id: string;
  category: string;
  service_group: string;
  platform_service: string;
  customer_name: string;
  description: string;
  duration_min_hours: number;
  duration_max_hours: number;
  base_price: number;
  maximum_price: number;
  cleanup_buffer_minutes: number;
  addons: ServiceAddonImport[];
};

export type SalonProductImportRow = {
  source_row: number;
  record_id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  sale_price: number | null;
  product_status: "Draft" | "Active" | "Archived";
  track_inventory: boolean;
  inventory_quantity: number;
  low_stock_threshold: number;
  pickup_enabled: boolean;
  pickup_prep_minutes: number;
  shipping_enabled: boolean;
  shipping_price: number;
  weight_ounces: number | null;
  shipping_profile: string;
  dimension_length: number | null;
  dimension_width: number | null;
  dimension_height: number | null;
  tax_category:
    | "general_tangible_goods"
    | "hair_care_products"
    | "beauty_accessories";
  max_quantity_per_order: number;
  is_visible: boolean;
};

export type SpreadsheetValidationError = {
  row: number;
  messages: string[];
};

export function resolveSalonServiceCatalogRows(
  rows: SalonServiceImportRow[],
  reference: SalonCatalogReference,
) {
  const errors: SpreadsheetValidationError[] = [];
  const categories = new Map(
    reference.categories.map((row) => [normalizedKey(row.name), row]),
  );
  const groups = new Map(
    reference.groups.map((row) => [
      `${row.category_id}::${normalizedKey(row.name)}`,
      row,
    ]),
  );
  const services = new Map(
    reference.services.map((row) => [
      `${row.category_id}::${row.service_group_id}::${normalizedKey(row.name)}`,
      row,
    ]),
  );
  const addons = new Map(
    reference.addons.map((row) => [
      `${row.category_id}::${normalizedKey(row.name)}`,
      row,
    ]),
  );
  const resolved = rows.map((row) => {
    const messages: string[] = [];
    const category = categories.get(normalizedKey(row.category));
    if (!category) {
      messages.push(
        `Category "${row.category}" is not active in the platform catalog.`,
      );
    }
    const group = category
      ? groups.get(`${category.id}::${normalizedKey(row.service_group)}`)
      : undefined;
    if (category && !group) {
      messages.push(
        `Service Group "${row.service_group}" does not belong to "${row.category}".`,
      );
    }
    const master =
      category && group && row.platform_service
        ? services.get(
            `${category.id}::${group.id}::${normalizedKey(row.platform_service)}`,
          )
        : undefined;
    if (row.platform_service && !master) {
      messages.push(
        `Platform Service Name "${row.platform_service}" does not match the selected category and group.`,
      );
    }
    const resolvedAddons = row.addons.map((addon) => {
      const match = category
        ? addons.get(`${category.id}::${normalizedKey(addon.name)}`)
        : undefined;
      if (!match) {
        messages.push(
          `Add-on "${addon.name}" is not available for "${row.category}".`,
        );
      }
      return { label: match?.name || addon.name, price_add: addon.price };
    });
    if (messages.length) errors.push({ row: row.source_row, messages });
    return {
      record_id: row.record_id,
      category_id: category?.id || "",
      service_group_id: group?.id || "",
      master_style_id: master?.id || "",
      name: row.customer_name,
      description: row.description,
      duration_min_hours: row.duration_min_hours,
      duration_max_hours: row.duration_max_hours,
      buffer_minutes: row.cleanup_buffer_minutes,
      base_price: row.base_price,
      price_display_max: row.maximum_price,
      addons: resolvedAddons,
    };
  });
  return { rows: resolved, errors };
}

type ServiceExportRow = SalonServiceImportRow;
type ProductExportRow = SalonProductImportRow;

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedKey(value: unknown) {
  return normalized(value).toLocaleLowerCase("en-US");
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

function headerKey(value: unknown) {
  return normalized(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numericValue(value: string) {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : Number.NaN;
}

function booleanValue(
  value: string,
  fallback: boolean,
): { value: boolean; valid: boolean } {
  if (!value) return { value: fallback, valid: true };
  const key = normalizedKey(value);
  if (["yes", "true", "1", "on", "enabled"].includes(key)) {
    return { value: true, valid: true };
  }
  if (["no", "false", "0", "off", "disabled"].includes(key)) {
    return { value: false, valid: true };
  }
  return { value: fallback, valid: false };
}

function workbookBuffer(bytes: Buffer) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function loadWorkbook(buffer: Buffer, fileName: string) {
  if (!buffer.length) throw new Error("Choose a non-empty Excel or CSV file.");
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error("Salon spreadsheets must be 5 MB or smaller.");
  }
  const extension = fileName.toLowerCase().split(".").pop();
  const workbook = new ExcelJS.Workbook();
  if (extension === "xlsx") {
    await workbook.xlsx.load(workbookBuffer(buffer));
  } else if (extension === "csv") {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    throw new Error("Upload an .xlsx or .csv file.");
  }
  return workbook;
}

function findHeader(
  worksheet: ExcelJS.Worksheet,
  aliases: Map<string, string>,
  requiredField: string,
) {
  const maximum = Math.min(worksheet.rowCount, 12);
  for (let rowNumber = 1; rowNumber <= maximum; rowNumber += 1) {
    const columns = new Map<string, number>();
    worksheet.getRow(rowNumber).eachCell(
      { includeEmpty: false },
      (cell, columnNumber) => {
        const field = aliases.get(headerKey(cell.value));
        if (field && !columns.has(field)) columns.set(field, columnNumber);
      },
    );
    if (columns.has(requiredField)) return { rowNumber, columns };
  }
  return null;
}

function chooseWorksheet(
  workbook: ExcelJS.Workbook,
  preferredNames: string[],
  aliases: Map<string, string>,
  requiredField: string,
) {
  const preferred = workbook.worksheets.find((sheet) =>
    preferredNames.includes(normalizedKey(sheet.name)),
  );
  if (preferred && findHeader(preferred, aliases, requiredField)) return preferred;
  return (
    workbook.worksheets.find((sheet) =>
      Boolean(findHeader(sheet, aliases, requiredField)),
    ) || null
  );
}

function mappedCell(
  row: ExcelJS.Row,
  columns: Map<string, number>,
  field: string,
) {
  const column = columns.get(field);
  return column ? cellText(row.getCell(column).value) : "";
}

function parseAddons(value: string) {
  const result: ServiceAddonImport[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(/[;\n]+/)) {
    const entry = normalized(raw);
    if (!entry) continue;
    const [nameValue, priceValue = "0"] = entry.split("|", 2);
    const name = normalized(nameValue);
    const key = normalizedKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({
      name,
      price: numericValue(priceValue) ?? 0,
    });
  }
  return result;
}

const serviceAliases = new Map<string, string>([
  ["record id", "record_id"],
  ["service id", "record_id"],
  ["category", "category"],
  ["top level category", "category"],
  ["service group", "service_group"],
  ["platform service name", "platform_service"],
  ["specific service name", "platform_service"],
  ["service name", "platform_service"],
  ["customer facing name", "customer_name"],
  ["service name customers will see", "customer_name"],
  ["description", "description"],
  ["minimum duration hours", "duration_min_hours"],
  ["duration minimum hours", "duration_min_hours"],
  ["maximum duration hours", "duration_max_hours"],
  ["duration maximum hours", "duration_max_hours"],
  ["base price usd", "base_price"],
  ["base price", "base_price"],
  ["maximum displayed price usd", "maximum_price"],
  ["maximum displayed price", "maximum_price"],
  ["cleanup buffer minutes", "cleanup_buffer_minutes"],
  ["cleanup buffer", "cleanup_buffer_minutes"],
  ["add ons name price name price", "addons"],
  ["add ons", "addons"],
  ["addons", "addons"],
]);

const productAliases = new Map<string, string>([
  ["record id", "record_id"],
  ["product id", "record_id"],
  ["product name", "name"],
  ["name", "name"],
  ["sku", "sku"],
  ["description", "description"],
  ["regular price usd", "price"],
  ["regular price", "price"],
  ["price", "price"],
  ["sale price usd", "sale_price"],
  ["sale price", "sale_price"],
  ["status", "product_status"],
  ["track inventory", "track_inventory"],
  ["quantity available", "inventory_quantity"],
  ["inventory quantity", "inventory_quantity"],
  ["low stock alert at", "low_stock_threshold"],
  ["low stock threshold", "low_stock_threshold"],
  ["pickup enabled", "pickup_enabled"],
  ["pickup preparation minutes", "pickup_prep_minutes"],
  ["preparation time minutes", "pickup_prep_minutes"],
  ["shipping enabled", "shipping_enabled"],
  ["shipping price usd", "shipping_price"],
  ["shipping price", "shipping_price"],
  ["weight ounces", "weight_ounces"],
  ["shipping profile", "shipping_profile"],
  ["package length inches", "dimension_length"],
  ["package length in", "dimension_length"],
  ["package width inches", "dimension_width"],
  ["package width in", "dimension_width"],
  ["package height inches", "dimension_height"],
  ["package height in", "dimension_height"],
  ["tax category", "tax_category"],
  ["maximum quantity per order", "max_quantity_per_order"],
  ["visible on public page", "is_visible"],
  ["visible", "is_visible"],
]);

function validateUuid(value: string, messages: string[]) {
  if (value && !UUID_PATTERN.test(value)) {
    messages.push("Record ID must be a valid exported Girlz Culture ID.");
  }
}

function validateRange(
  value: number | null,
  label: string,
  minimum: number,
  maximum: number,
  messages: string[],
  required = true,
) {
  if (value === null) {
    if (required) messages.push(`${label} is required.`);
    return;
  }
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    messages.push(`${label} must be between ${minimum} and ${maximum}.`);
  }
}

export async function parseSalonServiceSpreadsheet(
  buffer: Buffer,
  fileName: string,
) {
  const workbook = await loadWorkbook(buffer, fileName);
  const sheet = chooseWorksheet(
    workbook,
    ["services", "styles and pricing"],
    serviceAliases,
    "category",
  );
  if (!sheet) {
    throw new Error(
      'No service table was found. Use a sheet named "Services" with a Category column.',
    );
  }
  const header = findHeader(sheet, serviceAliases, "category");
  if (!header) throw new Error("The Services header row could not be found.");

  const rows: SalonServiceImportRow[] = [];
  const errors: SpreadsheetValidationError[] = [];
  const duplicateKeys = new Map<string, number>();
  for (
    let rowNumber = header.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const raw = {
      record_id: mappedCell(row, header.columns, "record_id"),
      category: mappedCell(row, header.columns, "category"),
      service_group: mappedCell(row, header.columns, "service_group"),
      platform_service: mappedCell(row, header.columns, "platform_service"),
      customer_name: mappedCell(row, header.columns, "customer_name"),
      description: mappedCell(row, header.columns, "description"),
      duration_min_hours: mappedCell(
        row,
        header.columns,
        "duration_min_hours",
      ),
      duration_max_hours: mappedCell(
        row,
        header.columns,
        "duration_max_hours",
      ),
      base_price: mappedCell(row, header.columns, "base_price"),
      maximum_price: mappedCell(row, header.columns, "maximum_price"),
      cleanup_buffer_minutes: mappedCell(
        row,
        header.columns,
        "cleanup_buffer_minutes",
      ),
      addons: mappedCell(row, header.columns, "addons"),
    };
    if (!Object.values(raw).some(Boolean)) continue;
    if (rows.length + errors.length >= MAX_ROWS) {
      throw new Error(`Service spreadsheets may contain at most ${MAX_ROWS} rows.`);
    }

    const messages: string[] = [];
    validateUuid(raw.record_id, messages);
    if (!raw.category) messages.push("Category is required.");
    if (raw.category.length > 80) {
      messages.push("Category must be 80 characters or fewer.");
    }
    if (!raw.service_group) messages.push("Service Group is required.");
    if (raw.service_group.length > 80) {
      messages.push("Service Group must be 80 characters or fewer.");
    }
    if (raw.platform_service.length > 100) {
      messages.push("Platform Service Name must be 100 characters or fewer.");
    }
    const customerName =
      raw.customer_name || raw.platform_service || raw.service_group;
    if (!customerName) {
      messages.push("Customer-Facing Name is required.");
    } else if (customerName.length > 120) {
      messages.push("Customer-Facing Name must be 120 characters or fewer.");
    }
    if (raw.description.length > 500) {
      messages.push("Description must be 500 characters or fewer.");
    }

    const durationMin = numericValue(raw.duration_min_hours);
    const durationMax = numericValue(raw.duration_max_hours);
    const basePrice = numericValue(raw.base_price);
    const maximumPrice = numericValue(raw.maximum_price) ?? basePrice;
    const bufferMinutes = numericValue(raw.cleanup_buffer_minutes) ?? 15;
    validateRange(durationMin, "Minimum duration", 0.25, 24, messages);
    validateRange(durationMax, "Maximum duration", 0.25, 24, messages);
    for (const [label, duration] of [
      ["Minimum duration", durationMin],
      ["Maximum duration", durationMax],
    ] as const) {
      if (
        duration !== null &&
        Number.isFinite(duration) &&
        !Number.isInteger(duration * 4)
      ) {
        messages.push(`${label} must use quarter-hour increments.`);
      }
    }
    if (
      durationMin !== null &&
      durationMax !== null &&
      Number.isFinite(durationMin) &&
      Number.isFinite(durationMax) &&
      durationMax < durationMin
    ) {
      messages.push("Maximum duration cannot be shorter than minimum duration.");
    }
    validateRange(basePrice, "Base price", 0, 10_000, messages);
    validateRange(maximumPrice, "Maximum displayed price", 0, 10_000, messages);
    if (
      basePrice !== null &&
      maximumPrice !== null &&
      Number.isFinite(basePrice) &&
      Number.isFinite(maximumPrice) &&
      maximumPrice < basePrice
    ) {
      messages.push("Maximum displayed price cannot be lower than base price.");
    }
    if (![0, 15, 30, 45, 60].includes(bufferMinutes)) {
      messages.push("Cleanup buffer must be 0, 15, 30, 45, or 60 minutes.");
    }

    const addons = parseAddons(raw.addons);
    if (addons.length > 50) messages.push("A service may have at most 50 add-ons.");
    for (const addon of addons) {
      if (addon.name.length > 80) {
        messages.push(`Add-on "${addon.name}" must be 80 characters or fewer.`);
      }
      validateRange(
        addon.price,
        `Price for add-on "${addon.name}"`,
        0,
        10_000,
        messages,
      );
    }
    const duplicateKey = raw.record_id
      ? `id:${normalizedKey(raw.record_id)}`
      : [
          raw.category,
          raw.service_group,
          raw.platform_service,
          customerName,
        ]
          .map(normalizedKey)
          .join("::");
    const earlierRow = duplicateKeys.get(duplicateKey);
    if (earlierRow) {
      messages.push(`This service duplicates spreadsheet row ${earlierRow}.`);
    } else {
      duplicateKeys.set(duplicateKey, rowNumber);
    }

    if (messages.length) {
      errors.push({ row: rowNumber, messages });
      continue;
    }
    rows.push({
      source_row: rowNumber,
      record_id: raw.record_id,
      category: raw.category,
      service_group: raw.service_group,
      platform_service: raw.platform_service,
      customer_name: customerName,
      description: raw.description,
      duration_min_hours: durationMin as number,
      duration_max_hours: durationMax as number,
      base_price: basePrice as number,
      maximum_price: maximumPrice as number,
      cleanup_buffer_minutes: bufferMinutes as number,
      addons,
    });
  }
  if (!rows.length && !errors.length) {
    throw new Error("The Services sheet does not contain any data rows.");
  }
  return { sheet_name: sheet.name, rows, errors };
}

export async function parseSalonProductSpreadsheet(
  buffer: Buffer,
  fileName: string,
) {
  const workbook = await loadWorkbook(buffer, fileName);
  const sheet = chooseWorksheet(
    workbook,
    ["products"],
    productAliases,
    "name",
  );
  if (!sheet) {
    throw new Error(
      'No product table was found. Use a sheet named "Products" with a Product Name column.',
    );
  }
  const header = findHeader(sheet, productAliases, "name");
  if (!header) throw new Error("The Products header row could not be found.");

  const rows: SalonProductImportRow[] = [];
  const errors: SpreadsheetValidationError[] = [];
  const duplicateKeys = new Map<string, number>();
  for (
    let rowNumber = header.rowNumber + 1;
    rowNumber <= sheet.rowCount;
    rowNumber += 1
  ) {
    const row = sheet.getRow(rowNumber);
    const field = (name: string) => mappedCell(row, header.columns, name);
    const values = [
      "record_id",
      "name",
      "sku",
      "description",
      "price",
      "sale_price",
      "product_status",
      "track_inventory",
      "inventory_quantity",
      "low_stock_threshold",
      "pickup_enabled",
      "pickup_prep_minutes",
      "shipping_enabled",
      "shipping_price",
      "weight_ounces",
      "shipping_profile",
      "dimension_length",
      "dimension_width",
      "dimension_height",
      "tax_category",
      "max_quantity_per_order",
      "is_visible",
    ] as const;
    const raw = Object.fromEntries(values.map((name) => [name, field(name)])) as
      Record<(typeof values)[number], string>;
    if (!Object.values(raw).some(Boolean)) continue;
    if (rows.length + errors.length >= MAX_ROWS) {
      throw new Error(`Product spreadsheets may contain at most ${MAX_ROWS} rows.`);
    }

    const messages: string[] = [];
    validateUuid(raw.record_id, messages);
    if (!raw.name) messages.push("Product Name is required.");
    if (raw.name.length > 120) {
      messages.push("Product Name must be 120 characters or fewer.");
    }
    if (raw.sku.length > 80) messages.push("SKU must be 80 characters or fewer.");
    if (raw.description.length > 1_000) {
      messages.push("Description must be 1,000 characters or fewer.");
    }
    const price = numericValue(raw.price);
    const salePrice = numericValue(raw.sale_price);
    validateRange(price, "Regular price", 0, 10_000, messages);
    validateRange(salePrice, "Sale price", 0, price ?? 10_000, messages, false);
    const statusKey = normalizedKey(raw.product_status || "Draft");
    const statusMap = new Map<string, SalonProductImportRow["product_status"]>([
      ["draft", "Draft"],
      ["active", "Active"],
      ["archived", "Archived"],
    ]);
    const productStatus = statusMap.get(statusKey);
    if (!productStatus) messages.push("Status must be Draft, Active, or Archived.");

    const trackInventory = booleanValue(raw.track_inventory, false);
    const pickupEnabled = booleanValue(raw.pickup_enabled, false);
    const shippingEnabled = booleanValue(raw.shipping_enabled, false);
    const visible = booleanValue(raw.is_visible, true);
    for (const [label, value] of [
      ["Track Inventory", trackInventory],
      ["Pickup Enabled", pickupEnabled],
      ["Shipping Enabled", shippingEnabled],
      ["Visible on Public Page", visible],
    ] as const) {
      if (!value.valid) messages.push(`${label} must be Yes or No.`);
    }

    const inventory = numericValue(raw.inventory_quantity) ?? 0;
    const lowStock = numericValue(raw.low_stock_threshold) ?? 5;
    const pickupMinutes = numericValue(raw.pickup_prep_minutes) ?? 60;
    const shippingPrice = numericValue(raw.shipping_price) ?? 0;
    const weight = numericValue(raw.weight_ounces);
    const length = numericValue(raw.dimension_length);
    const width = numericValue(raw.dimension_width);
    const height = numericValue(raw.dimension_height);
    const maxQuantity = numericValue(raw.max_quantity_per_order) ?? 10;
    validateRange(inventory, "Quantity available", 0, 1_000_000, messages);
    validateRange(lowStock, "Low-stock alert", 0, 1_000_000, messages);
    validateRange(
      pickupMinutes,
      "Pickup preparation time",
      0,
      43_200,
      messages,
    );
    validateRange(shippingPrice, "Shipping price", 0, 100_000, messages);
    validateRange(weight, "Weight", 0.01, 100_000, messages, false);
    validateRange(length, "Package length", 0.01, 1_000, messages, false);
    validateRange(width, "Package width", 0.01, 1_000, messages, false);
    validateRange(height, "Package height", 0.01, 1_000, messages, false);
    validateRange(
      maxQuantity,
      "Maximum quantity per order",
      1,
      1_000,
      messages,
    );
    for (const [label, value] of [
      ["Quantity available", inventory],
      ["Low-stock alert", lowStock],
      ["Pickup preparation time", pickupMinutes],
      ["Maximum quantity per order", maxQuantity],
    ] as const) {
      if (Number.isFinite(value) && !Number.isInteger(value)) {
        messages.push(`${label} must be a whole number.`);
      }
    }
    const taxCategory =
      normalizedKey(raw.tax_category) || "general_tangible_goods";
    const taxCategories = new Set([
      "general_tangible_goods",
      "hair_care_products",
      "beauty_accessories",
    ]);
    if (!taxCategories.has(taxCategory)) {
      messages.push(
        "Tax Category must be general_tangible_goods, hair_care_products, or beauty_accessories.",
      );
    }
    if (
      productStatus === "Active" &&
      visible.value &&
      !pickupEnabled.value &&
      !shippingEnabled.value
    ) {
      messages.push(
        "An active visible product must enable pickup or shipping.",
      );
    }

    const duplicateKey = raw.record_id
      ? `id:${normalizedKey(raw.record_id)}`
      : raw.sku
        ? `sku:${normalizedKey(raw.sku)}`
        : `name:${normalizedKey(raw.name)}`;
    const earlierRow = duplicateKeys.get(duplicateKey);
    if (earlierRow) {
      messages.push(`This product duplicates spreadsheet row ${earlierRow}.`);
    } else {
      duplicateKeys.set(duplicateKey, rowNumber);
    }

    if (messages.length) {
      errors.push({ row: rowNumber, messages });
      continue;
    }
    rows.push({
      source_row: rowNumber,
      record_id: raw.record_id,
      name: raw.name,
      sku: raw.sku,
      description: raw.description,
      price: price as number,
      sale_price: salePrice,
      product_status: productStatus as SalonProductImportRow["product_status"],
      track_inventory: trackInventory.value,
      inventory_quantity: inventory,
      low_stock_threshold: lowStock,
      pickup_enabled: pickupEnabled.value,
      pickup_prep_minutes: pickupMinutes,
      shipping_enabled: shippingEnabled.value,
      shipping_price: shippingPrice,
      weight_ounces: weight,
      shipping_profile: raw.shipping_profile,
      dimension_length: length,
      dimension_width: width,
      dimension_height: height,
      tax_category: taxCategory as SalonProductImportRow["tax_category"],
      max_quantity_per_order: maxQuantity,
      is_visible: visible.value,
    });
  }
  if (!rows.length && !errors.length) {
    throw new Error("The Products sheet does not contain any data rows.");
  }
  return { sheet_name: sheet.name, rows, errors };
}

function styleWorkbook(workbook: ExcelJS.Workbook) {
  workbook.creator = "Girlz Culture";
  workbook.company = "Girlz Culture";
  workbook.created = new Date();
}

function styleTableSheet(
  sheet: ExcelJS.Worksheet,
  headers: Array<{ header: string; key: string; width: number }>,
) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns = headers;
  sheet.autoFilter = `A1:${sheet.getColumn(headers.length).letter}1`;
  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF008A8A" },
  };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });
}

const serviceHeaders = [
  { header: "Record ID", key: "record_id", width: 38 },
  { header: "Category", key: "category", width: 28 },
  { header: "Service Group", key: "service_group", width: 28 },
  { header: "Platform Service Name", key: "platform_service", width: 32 },
  { header: "Customer-Facing Name", key: "customer_name", width: 32 },
  { header: "Description", key: "description", width: 55 },
  {
    header: "Minimum Duration (Hours)",
    key: "duration_min_hours",
    width: 22,
  },
  {
    header: "Maximum Duration (Hours)",
    key: "duration_max_hours",
    width: 22,
  },
  { header: "Base Price (USD)", key: "base_price", width: 18 },
  {
    header: "Maximum Displayed Price (USD)",
    key: "maximum_price",
    width: 25,
  },
  {
    header: "Cleanup Buffer (Minutes)",
    key: "cleanup_buffer_minutes",
    width: 23,
  },
  {
    header: "Add-ons (Name|Price; Name|Price)",
    key: "addons",
    width: 50,
  },
];

const productHeaders = [
  { header: "Record ID", key: "record_id", width: 38 },
  { header: "Product Name", key: "name", width: 30 },
  { header: "SKU", key: "sku", width: 20 },
  { header: "Description", key: "description", width: 55 },
  { header: "Regular Price (USD)", key: "price", width: 20 },
  { header: "Sale Price (USD)", key: "sale_price", width: 18 },
  { header: "Status", key: "product_status", width: 14 },
  { header: "Track Inventory", key: "track_inventory", width: 18 },
  { header: "Quantity Available", key: "inventory_quantity", width: 18 },
  { header: "Low-Stock Alert At", key: "low_stock_threshold", width: 18 },
  { header: "Pickup Enabled", key: "pickup_enabled", width: 17 },
  {
    header: "Pickup Preparation (Minutes)",
    key: "pickup_prep_minutes",
    width: 25,
  },
  { header: "Shipping Enabled", key: "shipping_enabled", width: 18 },
  { header: "Shipping Price (USD)", key: "shipping_price", width: 20 },
  { header: "Weight (Ounces)", key: "weight_ounces", width: 17 },
  { header: "Shipping Profile", key: "shipping_profile", width: 24 },
  { header: "Package Length (Inches)", key: "dimension_length", width: 23 },
  { header: "Package Width (Inches)", key: "dimension_width", width: 23 },
  { header: "Package Height (Inches)", key: "dimension_height", width: 23 },
  { header: "Tax Category", key: "tax_category", width: 27 },
  {
    header: "Maximum Quantity Per Order",
    key: "max_quantity_per_order",
    width: 25,
  },
  { header: "Visible on Public Page", key: "is_visible", width: 23 },
];

function addInstructionSheet(
  workbook: ExcelJS.Workbook,
  kind: SalonSpreadsheetKind,
) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.columns = [{ width: 118 }];
  const values =
    kind === "services"
      ? [
          "Girlz Culture — Salon Styles & Pricing Import",
          "",
          "Enter one service per row on the Services sheet.",
          "Category and Service Group must exactly match the Platform Catalog reference sheet.",
          "Platform Service Name is optional. Leave it blank when selling the entire service group.",
          "Record ID is optional for new services. Keep exported Record IDs when updating existing services.",
          "Add-ons must come from the platform catalog. Enter each as Name|Price and separate multiple add-ons with semicolons.",
          "Example: Beads|15; Hair Included|35",
          "Images, materials, size options, and length options are managed separately and are never erased by this import.",
          "Choose the file in Styles & Pricing and click Import & Save. If any row is invalid, nothing is saved.",
        ]
      : [
          "Girlz Culture — Salon Products Import",
          "",
          "Enter one product per row on the Products sheet.",
          "Record ID is optional for new products. Keep exported Record IDs when updating existing products.",
          "Use Yes or No for inventory, pickup, shipping, and visibility columns.",
          "An Active product shown publicly must enable Pickup or Shipping.",
          "Images are managed separately and are never erased by this import.",
          "Choose the file in Products and click Import & Save. If any row is invalid, nothing is saved.",
        ];
  values.forEach((value) => sheet.addRow([value]));
  sheet.getCell("A1").font = {
    bold: true,
    size: 16,
    color: { argb: "FF0D1114" },
  };
  sheet.getCell("A3").font = { bold: true, color: { argb: "FF008A8A" } };
  sheet.getColumn(1).alignment = { wrapText: true, vertical: "top" };
}

function addPlatformReference(
  workbook: ExcelJS.Workbook,
  reference: SalonCatalogReference,
) {
  const sheet = workbook.addWorksheet("Platform Catalog");
  styleTableSheet(sheet, [
    { header: "Category", key: "category", width: 30 },
    { header: "Service Group", key: "service_group", width: 30 },
    { header: "Platform Service Name", key: "service", width: 35 },
    { header: "Available Add-ons", key: "addons", width: 52 },
  ]);
  const categoryNames = new Map(
    reference.categories.map((row) => [row.id, row.name]),
  );
  const groupNames = new Map(
    reference.groups.map((row) => [row.id, row.name]),
  );
  const addonsByCategory = new Map<string, string[]>();
  for (const addon of reference.addons) {
    addonsByCategory.set(addon.category_id, [
      ...(addonsByCategory.get(addon.category_id) || []),
      addon.name,
    ]);
  }
  const serviceIds = new Set<string>();
  for (const service of reference.services) {
    serviceIds.add(service.service_group_id);
    sheet.addRow({
      category: categoryNames.get(service.category_id) || "",
      service_group: groupNames.get(service.service_group_id) || "",
      service: service.name,
      addons: (addonsByCategory.get(service.category_id) || []).join("; "),
    });
  }
  for (const group of reference.groups) {
    if (serviceIds.has(group.id)) continue;
    sheet.addRow({
      category: categoryNames.get(group.category_id) || "",
      service_group: group.name,
      service: "",
      addons: (addonsByCategory.get(group.category_id) || []).join("; "),
    });
  }
}

function addProductValidations(sheet: ExcelJS.Worksheet) {
  const lastRow = MAX_ROWS + 1;
  const validations = (
    sheet as ExcelJS.Worksheet & {
      dataValidations: {
        add: (range: string, rule: ExcelJS.DataValidation) => void;
      };
    }
  ).dataValidations;
  validations.add(`G2:G${lastRow}`, {
    type: "list",
    allowBlank: false,
    formulae: ['"Draft,Active,Archived"'],
  });
  for (const column of ["H", "K", "M", "V"]) {
    validations.add(`${column}2:${column}${lastRow}`, {
      type: "list",
      allowBlank: false,
      formulae: ['"Yes,No"'],
    });
  }
  validations.add(`T2:T${lastRow}`, {
    type: "list",
    allowBlank: false,
    formulae: [
      '"general_tangible_goods,hair_care_products,beauty_accessories"',
    ],
  });
}

function addServiceValidations(sheet: ExcelJS.Worksheet) {
  const lastRow = MAX_ROWS + 1;
  const validations = (
    sheet as ExcelJS.Worksheet & {
      dataValidations: {
        add: (range: string, rule: ExcelJS.DataValidation) => void;
      };
    }
  ).dataValidations;
  validations.add(`K2:K${lastRow}`, {
    type: "list",
    allowBlank: true,
    formulae: ['"0,15,30,45,60"'],
  });
}

export async function buildSalonServiceTemplateWorkbook(
  reference: SalonCatalogReference,
) {
  const workbook = new ExcelJS.Workbook();
  styleWorkbook(workbook);
  addInstructionSheet(workbook, "services");
  const sheet = workbook.addWorksheet("Services");
  styleTableSheet(sheet, serviceHeaders);
  addServiceValidations(sheet);
  addPlatformReference(workbook, reference);
  return workbook.xlsx.writeBuffer();
}

export async function buildSalonProductTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  styleWorkbook(workbook);
  addInstructionSheet(workbook, "products");
  const sheet = workbook.addWorksheet("Products");
  styleTableSheet(sheet, productHeaders);
  addProductValidations(sheet);
  return workbook.xlsx.writeBuffer();
}

function formattedAddons(addons: ServiceAddonImport[]) {
  return addons.map((addon) => `${addon.name}|${addon.price}`).join("; ");
}

export async function buildSalonServiceExportWorkbook(
  reference: SalonCatalogReference,
  rows: ServiceExportRow[],
) {
  const workbook = new ExcelJS.Workbook();
  styleWorkbook(workbook);
  addInstructionSheet(workbook, "services");
  const sheet = workbook.addWorksheet("Services");
  styleTableSheet(sheet, serviceHeaders);
  for (const row of rows) {
    sheet.addRow({
      ...row,
      addons: formattedAddons(row.addons),
    });
  }
  addServiceValidations(sheet);
  addPlatformReference(workbook, reference);
  return workbook.xlsx.writeBuffer();
}

export async function buildSalonProductExportWorkbook(
  rows: ProductExportRow[],
) {
  const workbook = new ExcelJS.Workbook();
  styleWorkbook(workbook);
  addInstructionSheet(workbook, "products");
  const sheet = workbook.addWorksheet("Products");
  styleTableSheet(sheet, productHeaders);
  for (const row of rows) {
    sheet.addRow({
      ...row,
      track_inventory: row.track_inventory ? "Yes" : "No",
      pickup_enabled: row.pickup_enabled ? "Yes" : "No",
      shipping_enabled: row.shipping_enabled ? "Yes" : "No",
      is_visible: row.is_visible ? "Yes" : "No",
    });
  }
  addProductValidations(sheet);
  return workbook.xlsx.writeBuffer();
}
