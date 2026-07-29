import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  monitoredRouteFailure,
  rejectRequest,
} from "@/lib/platformErrors";
import {
  buildSalonProductExportWorkbook,
  buildSalonProductTemplateWorkbook,
  buildSalonServiceExportWorkbook,
  buildSalonServiceTemplateWorkbook,
  parseSalonProductSpreadsheet,
  parseSalonServiceSpreadsheet,
  resolveSalonServiceCatalogRows,
  type SalonCatalogReference,
  type SalonSpreadsheetKind,
  type SpreadsheetValidationError,
} from "@/lib/salonCatalogSpreadsheet";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function importKind(value: string | null): SalonSpreadsheetKind {
  if (value === "services" || value === "products") return value;
  rejectRequest("Choose the Services or Products spreadsheet.");
}

function workbookResponse(
  bytes: Awaited<ReturnType<typeof buildSalonServiceTemplateWorkbook>>,
  fileName: string,
) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

async function loadPlatformCatalog(admin: SupabaseClient) {
  const [categories, groups, services, addons] = await Promise.all([
    admin
      .from("service_categories")
      .select("id,name,is_active,archived_at")
      .order("name"),
    admin
      .from("service_groups")
      .select("id,category_id,name,is_active,archived_at")
      .order("name"),
    admin
      .from("master_styles")
      .select(
        "id,category_id,service_group_id,name,is_active,archived_at",
      )
      .order("name"),
    admin
      .from("service_addons")
      .select("id,category_id,name,is_active,archived_at")
      .order("name"),
  ]);
  const failure = [categories, groups, services, addons].find(
    (result) => result.error,
  );
  if (failure?.error) throw failure.error;
  const active = <T extends { is_active?: boolean; archived_at?: unknown }>(
    rows: T[],
  ) => rows.filter((row) => row.is_active !== false && !row.archived_at);
  const all = {
    categories: categories.data || [],
    groups: groups.data || [],
    services: services.data || [],
    addons: addons.data || [],
  };
  const reference: SalonCatalogReference = {
    categories: active(all.categories).map((row) => ({
      id: String(row.id),
      name: String(row.name),
    })),
    groups: active(all.groups).map((row) => ({
      id: String(row.id),
      category_id: String(row.category_id),
      name: String(row.name),
    })),
    services: active(all.services).map((row) => ({
      id: String(row.id),
      category_id: String(row.category_id),
      service_group_id: String(row.service_group_id),
      name: String(row.name),
    })),
    addons: active(all.addons).map((row) => ({
      id: String(row.id),
      category_id: String(row.category_id),
      name: String(row.name),
    })),
  };
  return { reference, all };
}

function addonRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (typeof raw === "string") return { name: raw, price: 0 };
      const row =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      return {
        name: normalized(row.label || row.name || row.value),
        price: Number(row.price_add ?? row.price ?? 0),
      };
    })
    .filter((row) => row.name);
}

function dimensions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function serviceExportRows(
  admin: SupabaseClient,
  salonId: string,
  catalog: Awaited<ReturnType<typeof loadPlatformCatalog>>["all"],
) {
  const { data, error } = await admin
    .from("styles")
    .select(
      "id,category_id,service_group_id,master_style_id,name,description,duration_min_hours,duration_max_hours,base_price,price_display_max,buffer_minutes,addons,archived_at",
    )
    .eq("salon_id", salonId)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  const categoryNames = new Map(
    catalog.categories.map((row) => [String(row.id), String(row.name)]),
  );
  const groupNames = new Map(
    catalog.groups.map((row) => [String(row.id), String(row.name)]),
  );
  const serviceNames = new Map(
    catalog.services.map((row) => [String(row.id), String(row.name)]),
  );
  return (data || []).map((row) => ({
    source_row: 0,
    record_id: String(row.id),
    category: categoryNames.get(String(row.category_id)) || "",
    service_group: groupNames.get(String(row.service_group_id)) || "",
    platform_service: serviceNames.get(String(row.master_style_id)) || "",
    customer_name: String(row.name || ""),
    description: String(row.description || ""),
    duration_min_hours: Number(row.duration_min_hours || 0),
    duration_max_hours: Number(row.duration_max_hours || 0),
    base_price: Number(row.base_price || 0),
    maximum_price: Number(row.price_display_max ?? row.base_price ?? 0),
    cleanup_buffer_minutes: Number(row.buffer_minutes || 0),
    addons: addonRows(row.addons),
  }));
}

async function productExportRows(admin: SupabaseClient, salonId: string) {
  const { data, error } = await admin
    .from("salon_products")
    .select(
      "id,name,sku,description,price,sale_price,product_status,track_inventory,inventory_quantity,low_stock_threshold,pickup_enabled,pickup_prep_minutes,shipping_enabled,shipping_price,weight_ounces,shipping_profile,dimensions,tax_category,max_quantity_per_order,is_visible,archived_at",
    )
    .eq("salon_id", salonId)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data || []).map((row) => {
    const size = dimensions(row.dimensions);
    return {
      source_row: 0,
      record_id: String(row.id),
      name: String(row.name || ""),
      sku: String(row.sku || ""),
      description: String(row.description || ""),
      price: Number(row.price || 0),
      sale_price:
        row.sale_price === null || row.sale_price === undefined
          ? null
          : Number(row.sale_price),
      product_status: String(row.product_status || "Draft") as
        | "Draft"
        | "Active"
        | "Archived",
      track_inventory: row.track_inventory === true,
      inventory_quantity: Number(row.inventory_quantity || 0),
      low_stock_threshold: Number(row.low_stock_threshold || 0),
      pickup_enabled: row.pickup_enabled === true,
      pickup_prep_minutes: Number(row.pickup_prep_minutes || 0),
      shipping_enabled: row.shipping_enabled === true,
      shipping_price: Number(row.shipping_price || 0),
      weight_ounces:
        row.weight_ounces === null || row.weight_ounces === undefined
          ? null
          : Number(row.weight_ounces),
      shipping_profile: String(row.shipping_profile || ""),
      dimension_length:
        size.length === null || size.length === undefined
          ? null
          : Number(size.length),
      dimension_width:
        size.width === null || size.width === undefined
          ? null
          : Number(size.width),
      dimension_height:
        size.height === null || size.height === undefined
          ? null
          : Number(size.height),
      tax_category: String(
        row.tax_category || "general_tangible_goods",
      ) as
        | "general_tangible_goods"
        | "hair_care_products"
        | "beauty_accessories",
      max_quantity_per_order: Number(row.max_quantity_per_order || 10),
      is_visible: row.is_visible !== false,
    };
  });
}

function validationResponse(errors: SpreadsheetValidationError[]) {
  return Response.json(
    {
      error: `Nothing was saved. Fix ${errors.length} spreadsheet row${
        errors.length === 1 ? "" : "s"
      } and import the file again.`,
      validation_errors: errors,
    },
    { status: 400, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let salonId: string | null = null;
  try {
    const url = new URL(request.url);
    const kind = importKind(url.searchParams.get("kind"));
    const mode = url.searchParams.get("mode") || "template";
    const context = await requireSalonPermission(
      request,
      kind === "services" ? "styles" : "products",
    );
    monitoringAdmin = context.admin;
    salonId = context.salon.id;
    if (kind === "services") {
      const catalog = await loadPlatformCatalog(context.admin);
      if (mode === "template") {
        return workbookResponse(
          await buildSalonServiceTemplateWorkbook(catalog.reference),
          "girlz-culture-salon-services-template.xlsx",
        );
      }
      if (mode === "export") {
        return workbookResponse(
          await buildSalonServiceExportWorkbook(
            catalog.reference,
            await serviceExportRows(
              context.admin,
              context.salon.id,
              catalog.all,
            ),
          ),
          `girlz-culture-salon-services-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx`,
        );
      }
    } else {
      if (mode === "template") {
        return workbookResponse(
          await buildSalonProductTemplateWorkbook(),
          "girlz-culture-salon-products-template.xlsx",
        );
      }
      if (mode === "export") {
        return workbookResponse(
          await buildSalonProductExportWorkbook(
            await productExportRows(context.admin, context.salon.id),
          ),
          `girlz-culture-salon-products-${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx`,
        );
      }
    }
    rejectRequest("Choose template or export.");
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "salon-catalog-spreadsheet",
      action: "download",
      actorRole: "salon",
      salonId,
      safeMessage: "The salon spreadsheet could not be prepared.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let salonId: string | null = null;
  try {
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.includes("multipart/form-data")) {
      rejectRequest("Choose an .xlsx or .csv file.");
    }
    const form = await request.formData();
    const kind = importKind(normalized(form.get("kind")));
    const file = form.get("file");
    if (!(file instanceof File)) rejectRequest("Choose an .xlsx or .csv file.");
    if (!file.size) rejectRequest("Choose a non-empty .xlsx or .csv file.");
    if (file.size > MAX_SPREADSHEET_BYTES) {
      rejectRequest("Salon spreadsheets must be 5 MB or smaller.");
    }
    const context = await requireSalonPermission(
      request,
      kind === "services" ? "styles" : "products",
    );
    monitoringAdmin = context.admin;
    salonId = context.salon.id;
    const bytes = Buffer.from(await file.arrayBuffer());

    let rpcName:
      | "import_salon_services_spreadsheet"
      | "import_salon_products_spreadsheet";
    let rows: Array<Record<string, unknown>>;
    if (kind === "services") {
      const parsed = await parseSalonServiceSpreadsheet(bytes, file.name);
      if (parsed.errors.length) return validationResponse(parsed.errors);
      const catalog = await loadPlatformCatalog(context.admin);
      const resolved = resolveSalonServiceCatalogRows(
        parsed.rows,
        catalog.reference,
      );
      if (resolved.errors.length) return validationResponse(resolved.errors);
      rows = resolved.rows as Array<Record<string, unknown>>;
      rpcName = "import_salon_services_spreadsheet";
    } else {
      const parsed = await parseSalonProductSpreadsheet(bytes, file.name);
      if (parsed.errors.length) return validationResponse(parsed.errors);
      rows = parsed.rows as Array<Record<string, unknown>>;
      rpcName = "import_salon_products_spreadsheet";
    }

    const result = await context.admin.rpc(rpcName, {
      p_salon_id: salonId,
      p_actor_user_id: context.user.id,
      p_file_name: file.name.slice(0, 255),
      p_rows: rows,
    });
    if (result.error) {
      if (/SALON_IMPORT_|invalid|required|constraint/i.test(result.error.message)) {
        rejectRequest(
          result.error.message
            .replace(/^SALON_IMPORT_[A-Z_]+:\s*/i, "")
            .replace(/^SALON_IMPORT_[A-Z_]+$/i, "The spreadsheet data is no longer valid."),
          409,
        );
      }
      throw result.error;
    }
    const records =
      kind === "services"
        ? await context.admin
            .from("styles")
            .select("*")
            .eq("salon_id", salonId)
            .is("archived_at", null)
            .order("name")
        : await context.admin
            .from("salon_products")
            .select("*")
            .eq("salon_id", salonId)
            .is("archived_at", null)
            .order("name");
    if (records.error) throw records.error;
    revalidatePath("/salon/dashboard/styles");
    revalidatePath("/salon/dashboard/products");
    revalidatePath("/salon/[slug]", "page");
    return Response.json(
      {
        ok: true,
        kind,
        result: result.data,
        records: records.data || [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "salon-catalog-spreadsheet",
      action: "import-and-save",
      actorRole: "salon",
      salonId,
      safeMessage: "The salon spreadsheet could not be imported.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/catalog-spreadsheet", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/catalog-spreadsheet", "POST"),
  POSTHandler,
);
