import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText } from "@/lib/requestSecurity";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { operationalErrorPresentation } from "@/lib/operationalErrorPresentation";

const statuses = new Set(["Open", "Investigating", "Resolved", "Ignored"]);
const eventSelect = "id,reference,fingerprint,severity,status,environment,release,route,action,feature,actor_role,salon_id,technical_message,technical_stack,user_safe_message,metadata,occurrence_count,first_occurred_at,last_occurred_at,assigned_to,admin_notes,resolved_at,created_at,updated_at";
const MAX_EXPORT_ROWS = 10_000;
const EXPORT_BATCH_SIZE = 500;
const secretKey = /(?:authorization|cookie|token|secret|password|api[_-]?key|service[_-]?role|private[_-]?key|client[_-]?secret|webhook[_-]?secret)/i;
const secretValue = /(?:Bearer\s+[A-Za-z0-9._~+\/-]+=*|sk_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/g;

type ErrorRow = Record<string, unknown>;
type EnrichedExportRow = ErrorRow & {
  presentation: ReturnType<typeof operationalErrorPresentation>;
  affected_business_count: number;
  affected_businesses: ErrorRow[];
  assigned_admin: string;
};

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth limited]";
  if (typeof value === "string") return value.replace(secretValue, "[redacted]");
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => sanitize(item, depth + 1));
  }
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
  const safeValue = sanitize(value);
  let text = safeValue == null
    ? ""
    : typeof safeValue === "string"
      ? safeValue
      : JSON.stringify(safeValue);
  text = text.replace(secretValue, "[redacted]").replace(/\r\n?/g, "\n");
  if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function relatedSalon(value: unknown) {
  if (Array.isArray(value)) return value[0] as ErrorRow | undefined;
  return value && typeof value === "object" ? value as ErrorRow : undefined;
}

function exportFilename(format: "csv" | "json") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `girlz-culture-incidents-${stamp}.${format}`;
}

async function GETHandler(request: Request) {
  let admin;
  try {
    const context = await requireAdminPermission(request, "engine");
    admin = context.admin;
    const params = new URL(request.url).searchParams;
    const status = cleanText(params.get("status"), 30);
    const severity = cleanText(params.get("severity"), 20);
    const feature = cleanText(params.get("feature"), 120);
    const search = cleanText(params.get("q"), 120);
    const requestedEventId = cleanText(params.get("id"), 60);
    const requestedExport = cleanText(params.get("export"), 10).toLowerCase();
    const exportFormat = requestedExport === "csv" || requestedExport === "json"
      ? requestedExport
      : "";
    const eventId = /^[0-9a-f-]{36}$/i.test(requestedEventId) ? requestedEventId : "";
    const searchReference = /^[0-9a-f-]{36}$/i.test(search) ? search : "";
    const safeSearch = search.replace(/[%_,()]/g, "");
    let occurrenceEventId = "";
    if (searchReference) {
      const occurrence = await admin.from("platform_error_occurrences").select("event_id").eq("reference", searchReference).maybeSingle();
      if (occurrence.error) throw occurrence.error;
      occurrenceEventId = occurrence.data?.event_id || "";
    }

    if (exportFormat) {
      let countQuery = admin.from("platform_error_events").select("id", { count: "exact", head: true });
      if (eventId) countQuery = countQuery.eq("id", eventId);
      if (statuses.has(status)) countQuery = countQuery.eq("status", status);
      if (["critical", "high", "medium", "low"].includes(severity)) countQuery = countQuery.eq("severity", severity);
      if (feature) countQuery = countQuery.eq("feature", feature);
      if (search) countQuery = countQuery.or(`reference.eq.${searchReference || "00000000-0000-0000-0000-000000000000"},id.eq.${occurrenceEventId || "00000000-0000-0000-0000-000000000000"},technical_message.ilike.%${safeSearch}%,route.ilike.%${safeSearch}%`);
      const countResult = await countQuery;
      if (countResult.error) throw countResult.error;
      const matchingCount = Number(countResult.count || 0);
      const exportLimit = Math.min(matchingCount, MAX_EXPORT_ROWS);
      const exportRows: ErrorRow[] = [];

      for (let from = 0; from < exportLimit; from += EXPORT_BATCH_SIZE) {
        let exportQuery = admin.from("platform_error_events").select(eventSelect);
        if (eventId) exportQuery = exportQuery.eq("id", eventId);
        if (statuses.has(status)) exportQuery = exportQuery.eq("status", status);
        if (["critical", "high", "medium", "low"].includes(severity)) exportQuery = exportQuery.eq("severity", severity);
        if (feature) exportQuery = exportQuery.eq("feature", feature);
        if (search) exportQuery = exportQuery.or(`reference.eq.${searchReference || "00000000-0000-0000-0000-000000000000"},id.eq.${occurrenceEventId || "00000000-0000-0000-0000-000000000000"},technical_message.ilike.%${safeSearch}%,route.ilike.%${safeSearch}%`);
        const batch = await exportQuery
          .order("last_occurred_at", { ascending: false })
          .range(from, Math.min(exportLimit - 1, from + EXPORT_BATCH_SIZE - 1));
        if (batch.error) throw batch.error;
        exportRows.push(...((batch.data || []) as ErrorRow[]));
        if ((batch.data || []).length < EXPORT_BATCH_SIZE) break;
      }

      const eventIds = exportRows.map((row) => String(row.id || "")).filter(Boolean);
      const affectedRows: ErrorRow[] = [];
      for (let offset = 0; offset < eventIds.length; offset += 200) {
        const ids = eventIds.slice(offset, offset + 200);
        const affected = await admin.from("platform_error_affected_businesses")
          .select("event_id,salon_id,occurrence_count,first_seen_at,last_seen_at,salon:salons(id,name,address_city,address_state,address_zip)")
          .in("event_id", ids)
          .order("last_seen_at", { ascending: false });
        if (affected.error) throw affected.error;
        affectedRows.push(...((affected.data || []) as unknown as ErrorRow[]));
      }
      const assignees = await admin.from("admin_users").select("id,user_id,name,email,status").eq("status", "Active").order("name");
      if (assignees.error) throw assignees.error;

      const affectedByEvent = new Map<string, ErrorRow[]>();
      for (const row of affectedRows) {
        const key = String(row.event_id || "");
        affectedByEvent.set(key, [...(affectedByEvent.get(key) || []), row]);
      }
      const assigneeById = new Map<string, string>();
      for (const row of assignees.data || []) {
        const label = String(row.name || row.email || "Administrator");
        if (row.id) assigneeById.set(String(row.id), label);
        if (row.user_id) assigneeById.set(String(row.user_id), label);
      }
      const enriched: EnrichedExportRow[] = exportRows.map((row): EnrichedExportRow => {
        const safeRow = sanitize(row) as ErrorRow;
        const businesses = affectedByEvent.get(String(row.id || "")) || [];
        const safeBusinesses = sanitize(businesses) as ErrorRow[];
        return {
          ...safeRow,
          presentation: operationalErrorPresentation(safeRow),
          affected_business_count: safeBusinesses.length,
          affected_businesses: safeBusinesses,
          assigned_admin: assigneeById.get(String(row.assigned_to || "")) || "",
        };
      });
      const truncated = matchingCount > MAX_EXPORT_ROWS;
      const exportAuditReference = crypto.randomUUID();
      const exportAudit = await admin.from("record_management_events").insert({
        record_type: "platform_error_export",
        record_id: exportAuditReference,
        record_label: `Incident queue ${exportFormat.toUpperCase()} export`,
        action: "Created",
        dependency_summary: {
          format: exportFormat,
          status: statuses.has(status) ? status : null,
          severity: severity || null,
          feature: feature || null,
          event_id: eventId || null,
          exported_count: enriched.length,
          matching_count: matchingCount,
          truncated,
        },
        reason: "Platform Admin exported authorized incident evidence.",
        acting_user_id: context.user.id,
        acting_scope: "platform_admin",
      });
      if (exportAudit.error) throw exportAudit.error;
      const commonHeaders = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${exportFilename(exportFormat)}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Export-Count": String(enriched.length),
        "X-Export-Total": String(matchingCount),
        "X-Export-Truncated": String(truncated),
        "X-Export-Audit-Reference": exportAuditReference,
      };

      if (exportFormat === "json") {
        return Response.json({
          exported_at: new Date().toISOString(),
          export_reference: exportAuditReference,
          filters: { status: statuses.has(status) ? status : null, severity: severity || null, feature: feature || null, query: search || null, event_id: eventId || null },
          count: enriched.length,
          total_matching: matchingCount,
          truncated,
          incidents: enriched,
        }, { headers: commonHeaders });
      }

      const headers = [
        "Reference",
        "Event ID",
        "Status",
        "Severity",
        "Category",
        "Title",
        "Explanation",
        "Impact",
        "Recommended admin action",
        "Feature",
        "Route",
        "Action",
        "Actor role",
        "Environment",
        "Release",
        "Occurrence count",
        "Affected business count",
        "Affected businesses",
        "First seen",
        "Last seen",
        "Assigned admin",
        "Admin notes",
        "Resolved at",
        "Technical message",
        "Technical stack",
        "Metadata",
      ];
      const rows = enriched.map((row) => {
        const presentation = row.presentation;
        const businesses = row.affected_businesses.map((item) => {
          const salon = relatedSalon(item.salon);
          const location = [salon?.address_city, salon?.address_state, salon?.address_zip].filter(Boolean).join(" ");
          return `${String(salon?.name || item.salon_id || "Salon")}${location ? ` (${location})` : ""} · ${Number(item.occurrence_count || 0)} occurrence(s)`;
        }).join(" | ");
        return [
          row.reference,
          row.id,
          row.status,
          row.severity,
          presentation.category,
          presentation.title,
          presentation.explanation,
          presentation.impact,
          presentation.recommendedAction,
          row.feature,
          row.route || "Scheduled/background",
          row.action,
          row.actor_role,
          row.environment,
          row.release,
          row.occurrence_count,
          row.affected_business_count,
          businesses,
          row.first_occurred_at,
          row.last_occurred_at,
          row.assigned_admin,
          row.admin_notes,
          row.resolved_at,
          row.technical_message,
          row.technical_stack,
          row.metadata,
        ].map(csvCell).join(",");
      });
      return new Response(`\uFEFF${[headers.map(csvCell).join(","), ...rows].join("\r\n")}`, {
        headers: {
          ...commonHeaders,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(10, Math.min(100, Number(params.get("page_size") || 30)));
    let query = admin.from("platform_error_events").select(eventSelect, { count: "exact" });
    if (eventId) query = query.eq("id", eventId);
    if (statuses.has(status)) query = query.eq("status", status);
    if (["critical", "high", "medium", "low"].includes(severity)) query = query.eq("severity", severity);
    if (feature) query = query.eq("feature", feature);
    if (search) query = query.or(`reference.eq.${searchReference || "00000000-0000-0000-0000-000000000000"},id.eq.${occurrenceEventId || "00000000-0000-0000-0000-000000000000"},technical_message.ilike.%${safeSearch}%,route.ilike.%${safeSearch}%`);
    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order("last_occurred_at", { ascending: false }).range(from, from + pageSize - 1);
    if (error) throw error;
    const eventIds = (data || []).map((row) => row.id);
    const [rules, trend, assignees, affected] = await Promise.all([
      admin.from("platform_error_alert_rules").select("*").order("severity"),
      admin.from("platform_error_occurrences").select("occurred_at,event:platform_error_events(severity)").gte("occurred_at", new Date(Date.now() - 14 * 86400000).toISOString()).limit(5000),
      admin.from("admin_users").select("id,user_id,name,email,status").eq("status", "Active").order("name"),
      eventIds.length
        ? admin.from("platform_error_affected_businesses")
          .select("event_id,salon_id,occurrence_count,first_seen_at,last_seen_at,salon:salons(id,name,address_city,address_state,address_zip)")
          .in("event_id", eventIds)
          .order("last_seen_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (rules.error) throw rules.error;
    if (trend.error) throw trend.error;
    if (assignees.error) throw assignees.error;
    if (affected.error) throw affected.error;
    const features = [...new Set((data || []).map((row) => row.feature).filter(Boolean))].sort();
    const trendRows = (trend.data || []).map((rawRow) => {
      const row = rawRow as unknown as { occurred_at: string; event: { severity?: string } | Array<{ severity?: string }> | null };
      return { severity: Array.isArray(row.event) ? row.event[0]?.severity : row.event?.severity, occurred_at: row.occurred_at, occurrence_count: 1 };
    }).filter((row) => row.severity);
    const affectedByEvent = new Map<string, unknown[]>();
    for (const row of affected.data || []) {
      affectedByEvent.set(row.event_id, [
        ...(affectedByEvent.get(row.event_id) || []),
        row,
      ]);
    }
    const enrichedEvents = (data || []).map((row) => {
      const businesses = affectedByEvent.get(row.id) || [];
      return {
        ...row,
        presentation: operationalErrorPresentation(row),
        affected_business_count: businesses.length,
        affected_businesses: businesses,
      };
    });
    return Response.json({ events: enrichedEvents, total: count || 0, page, pageSize, rules: rules.data || [], trend: trendRows, features, assignees: (assignees.data || []).map((row) => ({ id: row.user_id || row.id, name: row.name || row.email, email: row.email })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "engine-error-monitoring", action: "load", actorRole: "admin", safeMessage: "Error monitoring could not be loaded." });
  }
}

async function PATCHHandler(request: Request) {
  let admin;
  try {
    const { admin: client, user } = await requireAdminPermission(request, "engine");
    admin = client;
    const body = await request.json() as Record<string, unknown>;
    const id = cleanText(body.id, 60);
    const status = cleanText(body.status, 30);
    const notes = cleanText(body.notes, 4000);
    const assignedTo = cleanText(body.assigned_to, 60) || null;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !statuses.has(status)) return Response.json({ error: "Choose an error event and a valid status." }, { status: 400 });
    if (assignedTo && !/^[0-9a-f-]{36}$/i.test(assignedTo)) return Response.json({ error: "Choose a valid assignee." }, { status: 400 });
    const patch: Record<string, unknown> = { status, admin_notes: notes || null, assigned_to: assignedTo, updated_at: new Date().toISOString() };
    if (status === "Resolved") Object.assign(patch, { resolved_at: new Date().toISOString(), resolved_by: user.id });
    else Object.assign(patch, { resolved_at: null, resolved_by: null });
    const { data, error } = await admin.from("platform_error_events").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Error event not found." }, { status: 404 });
    return Response.json({ event: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "engine-error-monitoring", action: "update", actorRole: "admin", safeMessage: "The error event could not be updated." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/errors", "GET"), GETHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/engine/errors", "PATCH"), PATCHHandler);