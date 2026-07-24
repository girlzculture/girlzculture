import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText } from "@/lib/requestSecurity";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { operationalErrorPresentation } from "@/lib/operationalErrorPresentation";

const statuses = new Set(["Open", "Investigating", "Resolved", "Ignored"]);

async function GETHandler(request: Request) {
  let admin;
  try {
    const context = await requireAdminPermission(request, "settings");
    admin = context.admin;
    const params = new URL(request.url).searchParams;
    const status = cleanText(params.get("status"), 30);
    const severity = cleanText(params.get("severity"), 20);
    const feature = cleanText(params.get("feature"), 120);
    const search = cleanText(params.get("q"), 120);
    const searchReference = /^[0-9a-f-]{36}$/i.test(search) ? search : "";
    let occurrenceEventId = "";
    if (searchReference) {
      const occurrence = await admin.from("platform_error_occurrences").select("event_id").eq("reference", searchReference).maybeSingle();
      if (occurrence.error) throw occurrence.error;
      occurrenceEventId = occurrence.data?.event_id || "";
    }
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.max(10, Math.min(100, Number(params.get("page_size") || 30)));
    let query = admin.from("platform_error_events").select("id,reference,fingerprint,severity,status,environment,release,route,action,feature,actor_role,salon_id,technical_message,technical_stack,user_safe_message,metadata,occurrence_count,first_occurred_at,last_occurred_at,assigned_to,admin_notes,resolved_at,created_at,updated_at", { count: "exact" });
    if (statuses.has(status)) query = query.eq("status", status);
    if (["critical", "high", "medium", "low"].includes(severity)) query = query.eq("severity", severity);
    if (feature) query = query.eq("feature", feature);
    if (search) query = query.or(`reference.eq.${searchReference || "00000000-0000-0000-0000-000000000000"},id.eq.${occurrenceEventId || "00000000-0000-0000-0000-000000000000"},technical_message.ilike.%${search.replace(/[%_,()]/g, "") }%,route.ilike.%${search.replace(/[%_,()]/g, "")}%`);
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
    const { admin: client, user } = await requireAdminPermission(request, "settings");
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
