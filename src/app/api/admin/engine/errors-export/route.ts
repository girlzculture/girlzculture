import type { SupabaseClient } from "@supabase/supabase-js";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { operationalErrorPresentation } from "@/lib/operationalErrorPresentation";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const statuses = new Set(["Open", "Investigating", "Resolved", "Ignored"]);
const severities = new Set(["critical", "high", "medium", "low"]);
const secretKey = /(?:authorization|cookie|token|secret|password|api[_-]?key|service[_-]?role|private[_-]?key|client[_-]?secret|webhook[_-]?secret)/i;
const secretValue = /(?:Bearer\s+[A-Za-z0-9._~+\/-]+=*|sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/g;

type Row = Record<string, unknown>;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth limited]";
  if (typeof value === "string") return value.replace(secretValue, "[redacted]");
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 500)
        .map(([key, item]) => [
          key,
          secretKey.test(key) ? "[redacted]" : sanitize(item, depth + 1),
        ]),
    );
  }
  return value;
}

function csvCell(value: unknown) {
  let text =
    typeof value === "string" ? value : JSON.stringify(value ?? "");
  text = text.replace(secretValue, "[redacted]");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

async function collectRows(
  admin: SupabaseClient,
  filters: {
    status: string;
    severity: string;
    feature: string;
    search: string;
    environment: string;
    release: string;
    from: string;
    to: string;
  },
) {
  const pageSize = 1_000;
  const cap = 10_000;
  const rows: Row[] = [];
  let total = 0;
  for (let from = 0; from < cap; from += pageSize) {
    let query = admin
      .from("platform_error_events")
      .select(
        "id,reference,fingerprint,severity,status,environment,release,route,action,feature,actor_role,salon_id,technical_message,technical_stack,user_safe_message,metadata,occurrence_count,first_occurred_at,last_occurred_at,assigned_to,admin_notes,resolved_at,created_at,updated_at",
        { count: from === 0 ? "exact" : undefined },
      );
    if (statuses.has(filters.status)) query = query.eq("status", filters.status);
    if (severities.has(filters.severity)) query = query.eq("severity", filters.severity);
    if (filters.feature) query = query.eq("feature", filters.feature);
    if (filters.environment) query = query.eq("environment", filters.environment);
    if (filters.release) query = query.eq("release", filters.release);
    if (filters.from) query = query.gte("last_occurred_at", filters.from);
    if (filters.to) query = query.lte("last_occurred_at", filters.to);
    if (filters.search) {
      const safe = filters.search.replace(/[%_,()]/g, "");
      const uuid = /^[0-9a-f-]{36}$/i.test(filters.search)
        ? filters.search
        : "00000000-0000-0000-0000-000000000000";
      query = query.or(
        `reference.eq.${uuid},id.eq.${uuid},technical_message.ilike.%${safe}%,route.ilike.%${safe}%,action.ilike.%${safe}%`,
      );
    }
    const result = await query
      .order("last_occurred_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    if (from === 0) total = result.count || 0;
    rows.push(...((result.data || []) as Row[]));
    if ((result.data || []).length < pageSize) break;
  }
  return { rows, total, truncated: total > rows.length };
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin, user } = await requireAdminPermission(request, "engine");
    monitoringAdmin = admin;
    const params = new URL(request.url).searchParams;
    const format = cleanText(params.get("format") || params.get("export"), 10).toLowerCase();
    if (!new Set(["csv", "json"]).has(format)) {
      rejectRequest("Choose CSV or JSON export format.");
    }
    const filters = {
      status: cleanText(params.get("status"), 30),
      severity: cleanText(params.get("severity"), 20),
      feature: cleanText(params.get("feature"), 120),
      search: cleanText(params.get("q"), 120),
      environment: cleanText(params.get("environment"), 60),
      release: cleanText(params.get("release"), 120),
      from: cleanText(params.get("from"), 40),
      to: cleanText(params.get("to"), 40),
    };
    const exported = await collectRows(admin, filters);
    const rows = exported.rows.map((row) => {
      const presentation = operationalErrorPresentation(row);
      return {
        reference: row.reference,
        event_id: row.id,
        status: row.status,
        severity: row.severity,
        category: presentation.category,
        title: presentation.title,
        explanation: presentation.explanation,
        impact: presentation.impact,
        recommended_admin_action: presentation.recommendedAction,
        feature: row.feature,
        route: row.route,
        action: row.action,
        actor_role: row.actor_role,
        environment: row.environment,
        release: row.release,
        occurrence_count: row.occurrence_count,
        first_seen: row.first_occurred_at,
        last_seen: row.last_occurred_at,
        assigned_to: row.assigned_to,
        admin_notes: sanitize(row.admin_notes),
        resolved_at: row.resolved_at,
        technical_message: sanitize(row.technical_message),
        technical_stack: sanitize(row.technical_stack),
        metadata: sanitize(row.metadata),
      };
    });

    const exportId = crypto.randomUUID();
    const audit = await admin.from("record_management_events").insert({
      record_type: "platform_error_export",
      record_id: exportId,
      record_label: `Incident queue ${format.toUpperCase()} export`,
      action: "Created",
      dependency_summary: {
        format,
        filters,
        exported_count: rows.length,
        matching_count: exported.total,
        truncated: exported.truncated,
      },
      reason: "Platform Admin exported authorized incident evidence.",
      acting_user_id: user.id,
      acting_scope: "platform_admin",
    });
    if (audit.error) throw audit.error;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `girlz-culture-incidents-${cleanText(filters.environment, 30) || "all-environments"}-${timestamp}.${format}`;
    const commonHeaders = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Count": String(rows.length),
      "X-Export-Total": String(exported.total),
      "X-Export-Truncated": String(exported.truncated),
      "X-Export-Audit-Reference": exportId,
    };

    if (format === "json") {
      return new Response(
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            export_reference: exportId,
            filters,
            exported_count: rows.length,
            matching_count: exported.total,
            truncated: exported.truncated,
            incidents: rows,
          },
          null,
          2,
        ),
        {
          headers: {
            ...commonHeaders,
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );
    }

    const columns = Object.keys(rows[0] || {
      reference: "",
      event_id: "",
      status: "",
      severity: "",
      category: "",
      title: "",
      explanation: "",
      impact: "",
      recommended_admin_action: "",
      feature: "",
      route: "",
      action: "",
      actor_role: "",
      environment: "",
      release: "",
      occurrence_count: "",
      first_seen: "",
      last_seen: "",
      assigned_to: "",
      admin_notes: "",
      resolved_at: "",
      technical_message: "",
      technical_stack: "",
      metadata: "",
    });
    const csv = [
      columns.map(csvCell).join(","),
      ...rows.map((row) =>
        columns.map((column) => csvCell((row as Row)[column])).join(","),
      ),
    ].join("\r\n");
    return new Response(`\uFEFF${csv}`, {
      headers: {
        ...commonHeaders,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "engine-error-monitoring",
      action: "export",
      actorRole: "admin",
      safeMessage: "The incident queue export could not be created.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/engine/errors-export", "GET"),
  GETHandler,
);
