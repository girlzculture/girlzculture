import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { cleanText, enforceRateLimit } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function boundedLimit(value: string | null) {
  const parsed = Number(value || DEFAULT_LIMIT);
  return Number.isInteger(parsed)
    ? Math.max(1, Math.min(MAX_LIMIT, parsed))
    : DEFAULT_LIMIT;
}

function decodeCursor(value: string | null) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { offset?: unknown };
    const offset = Number(parsed.offset || 0);
    return Number.isInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString(
    "base64url",
  );
}

function safeSearchTerm(value: string) {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

async function GETHandler(request: Request) {
  let monitoringAdmin;
  try {
    enforceRateLimit(request, "admin-submissions-list", 120, 60_000);
    const { admin, adminUser } = await requireAdminPermission(
      request,
      "submissions",
    );
    monitoringAdmin = admin;
    const params = new URL(request.url).searchParams;
    const view = params.get("view") === "archived" ? "archived" : "active";
    const queryText = safeSearchTerm(cleanText(params.get("q"), 120));
    const limit = boundedLimit(params.get("limit"));
    const offset = decodeCursor(params.get("cursor"));

    let query = admin
      .from("salon_applications")
      .select(
        "id,salon_id,business_name,business_email,owner_name,phone,street_address,address_line2,city,state,zip_code,status,rejection_reason,selected_plan,submitted_at,updated_at,archived_at,archive_reason,salon:salons(id,name,status,address_street,address_line2,address_city,address_state,address_zip,subscription_tier,subscription_status,is_discoverable,deleted_at)",
      )
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit);

    query =
      view === "archived"
        ? query.not("archived_at", "is", null)
        : query.is("archived_at", null);
    if (queryText) {
      const pattern = `%${queryText}%`;
      query = query.or(
        [
          `business_name.ilike.${pattern}`,
          `business_email.ilike.${pattern}`,
          `owner_name.ilike.${pattern}`,
          `city.ilike.${pattern}`,
          `state.ilike.${pattern}`,
          `zip_code.ilike.${pattern}`,
        ].join(","),
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const hasMore = rows.length > limit;
    const applications = hasMore ? rows.slice(0, limit) : rows;
    return Response.json(
      {
        applications,
        view,
        next_cursor: hasMore ? encodeCursor(offset + limit) : null,
        is_super_admin: Boolean(
          (adminUser as { is_super_admin?: boolean }).is_super_admin,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "submissions",
      action: "list-authoritative-submissions",
      actorRole: "admin",
      safeMessage: "We couldn't load salon applications.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/submissions", "GET", {
    classification: "protected",
    feature: "submissions",
    actorRole: "admin",
    safeMessage: "We couldn't load salon applications.",
  }),
  GETHandler,
);
