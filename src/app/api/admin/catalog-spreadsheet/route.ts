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
  buildCatalogExportWorkbook,
  buildCatalogPreview,
  buildCatalogTemplateWorkbook,
  parseCatalogSpreadsheet,
  type CatalogExistingState,
  type CatalogImportRow,
} from "@/lib/platformCatalogSpreadsheet";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_IMPORT_ROWS = 2_000;

type ExistingCatalog = CatalogExistingState & {
  categories: Array<
    CatalogExistingState["categories"][number] & {
      description?: unknown;
      sort_order?: unknown;
    }
  >;
  groups: Array<
    CatalogExistingState["groups"][number] & { sort_order?: unknown }
  >;
  services: Array<
    CatalogExistingState["services"][number] & { sort_order?: unknown }
  >;
  addons: Array<
    CatalogExistingState["addons"][number] & { sort_order?: unknown }
  >;
};

function text(value: unknown, maximum: number) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function safeRows(value: unknown): CatalogImportRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IMPORT_ROWS) {
    rejectRequest(`Choose a preview containing 1 to ${MAX_IMPORT_ROWS} importable rows.`);
  }
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      rejectRequest(`Import row ${index + 1} is invalid.`);
    }
    const row = raw as Record<string, unknown>;
    const category = text(row.category, 81);
    const serviceGroup = text(row.service_group, 81);
    const serviceName = text(row.service_name, 101);
    const categorySlug = text(row.category_slug, 80);
    const sourceRows = Array.isArray(row.source_rows)
      ? row.source_rows
          .map(Number)
          .filter((number) => Number.isInteger(number) && number > 0)
          .slice(0, 20)
      : [];
    const addons = Array.isArray(row.addons)
      ? [...new Map(
          row.addons
            .map((addon) => text(addon, 81))
            .filter(Boolean)
            .map((addon) => [addon.toLocaleLowerCase("en-US"), addon]),
        ).values()].slice(0, 51)
      : [];
    return {
      source_rows: sourceRows,
      category,
      category_slug: categorySlug,
      service_group: serviceGroup,
      service_name: serviceName,
      addons,
    };
  });
}

async function loadExistingCatalog(admin: SupabaseClient): Promise<ExistingCatalog> {
  const [categories, groups, services, addons] = await Promise.all([
    admin
      .from("service_categories")
      .select("id,name,slug,description,sort_order,is_active,archived_at")
      .order("sort_order")
      .order("name"),
    admin
      .from("service_groups")
      .select("id,category_id,name,sort_order,is_active,archived_at")
      .order("sort_order")
      .order("name"),
    admin
      .from("master_styles")
      .select("id,category_id,service_group_id,name,sort_order,is_active,archived_at")
      .order("sort_order")
      .order("name"),
    admin
      .from("service_addons")
      .select("id,category_id,name,sort_order,is_active,archived_at")
      .order("sort_order")
      .order("name"),
  ]);
  const failure = [categories, groups, services, addons].find((result) => result.error);
  if (failure?.error) throw failure.error;
  return {
    categories: categories.data || [],
    groups: groups.data || [],
    services: services.data || [],
    addons: addons.data || [],
  };
}

function workbookResponse(
  bytes: Awaited<ReturnType<typeof buildCatalogTemplateWorkbook>>,
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

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const mode = new URL(request.url).searchParams.get("mode") || "template";
    if (mode === "template") {
      return workbookResponse(
        await buildCatalogTemplateWorkbook(),
        "girlz-culture-platform-catalog-template.xlsx",
      );
    }
    if (mode === "export") {
      const catalog = await loadExistingCatalog(admin);
      return workbookResponse(
        await buildCatalogExportWorkbook(catalog),
        `girlz-culture-platform-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    }
    rejectRequest("Choose template or export.");
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "service-catalog-spreadsheet",
      action: "download",
      actorRole: "admin",
      safeMessage: "The catalog spreadsheet could not be prepared.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "content");
    monitoringAdmin = admin;
    const existing = await loadExistingCatalog(admin);
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) rejectRequest("Choose an .xlsx or .csv file.");
      const parsed = await parseCatalogSpreadsheet(
        Buffer.from(await file.arrayBuffer()),
        file.name,
        existing,
      ).catch((error) => {
        rejectRequest(
          error instanceof Error ? error.message : "The spreadsheet could not be read.",
        );
      });
      return Response.json(buildCatalogPreview(parsed, existing), {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    if (!contentType.includes("application/json")) {
      rejectRequest("Upload an .xlsx or .csv file, or confirm a catalog preview.");
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action !== "commit") rejectRequest("Confirm the catalog import.");
    const requestedRows = safeRows(body.rows);
    const preview = buildCatalogPreview(
      {
        sheetName: "Confirmed preview",
        ignoredColumns: [],
        rows: requestedRows,
      },
      existing,
    );
    if (preview.summary.skipped) {
      rejectRequest(
        "The catalog changed after preview. Upload the spreadsheet again and review the new conflicts.",
        409,
      );
    }
    const { data, error } = await admin.rpc("admin_import_service_catalog", {
      p_rows: preview.import_rows,
      p_actor_user_id: user.id,
      p_reason: "Platform service catalog spreadsheet import",
    });
    if (error) {
      if (/CATALOG_IMPORT_|already belongs|invalid|required|too long/i.test(error.message)) {
        rejectRequest(error.message.replace(/^CATALOG_IMPORT_[A-Z_]+:\s*/i, ""), 409);
      }
      throw error;
    }
    revalidatePath("/");
    revalidatePath("/styles");
    revalidatePath("/salon/[slug]", "page");
    return Response.json(
      { ok: true, result: data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "service-catalog-spreadsheet",
      action: "preview-or-import",
      actorRole: "admin",
      safeMessage: "The catalog spreadsheet could not be processed.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/catalog-spreadsheet", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/catalog-spreadsheet", "POST"),
  POSTHandler,
);
