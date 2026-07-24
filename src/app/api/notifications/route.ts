import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { getSupabaseAdmin, requireAdmin, requireSalonOwner } from "@/lib/supabaseAdmin";

type Scope = "admin" | "salon";

async function context(request: Request, scope: Scope) {
  if (scope === "admin") {
    const adminContext = await requireAdmin(request);
    return {
      admin: adminContext.admin,
      userId: adminContext.user.id,
      salonId: null,
      role: "admin",
    };
  }
  const salonContext = await requireSalonOwner(request);
  return {
    admin: salonContext.admin,
    userId: salonContext.user.id,
    salonId: salonContext.salon.id,
    role: "salon",
  };
}

function scopeFrom(request: Request) {
  const value = cleanText(new URL(request.url).searchParams.get("scope"), 20);
  if (value !== "admin" && value !== "salon") rejectRequest("Choose a valid notification area.", 400);
  return value as Scope;
}

async function GETHandler(request: Request) {
  let admin = getSupabaseAdmin();
  try {
    const scope = scopeFrom(request);
    const identity = await context(request, scope);
    admin = identity.admin;
    let query = admin
      .from("notifications")
      .select("id,title,body,action_url,read_at,created_at,last_seen_at,occurrence_count,category,severity,recipient_role")
      .eq("recipient_role", identity.role)
      .order("last_seen_at", { ascending: false })
      .limit(100);
    if (scope === "admin") query = query.eq("user_id", identity.userId);
    else {
      query = query
        .eq("salon_id", identity.salonId)
        .or(`user_id.eq.${identity.userId},user_id.is.null`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const notifications = data || [];
    const counts = notifications.reduce<Record<string, number>>((result, row) => {
      if (!row.read_at) result[row.category] = (result[row.category] || 0) + 1;
      return result;
    }, {});
    return Response.json({
      notifications,
      counts,
      unread: Object.values(counts).reduce((sum, value) => sum + value, 0),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({
      request, admin, error, feature: "dashboard-notifications",
      action: "list", actorRole: "authenticated",
      safeMessage: "We couldn't load notifications.",
    });
  }
}

async function POSTHandler(request: Request) {
  let admin = getSupabaseAdmin();
  try {
    const scope = scopeFrom(request);
    const identity = await context(request, scope);
    admin = identity.admin;
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 20);
    const now = new Date().toISOString();
    let query = admin
      .from("notifications")
      .update({ read_at: now })
      .eq("recipient_role", identity.role);
    if (scope === "admin") query = query.eq("user_id", identity.userId);
    else {
      query = query
        .eq("salon_id", identity.salonId)
        .or(`user_id.eq.${identity.userId},user_id.is.null`);
    }
    if (action === "read") {
      const id = cleanText(body.id, 60);
      if (!/^[0-9a-f-]{36}$/i.test(id)) rejectRequest("Choose a notification.", 400);
      query = query.eq("id", id);
    } else if (action === "read_all") {
      query = query.is("read_at", null);
    } else {
      rejectRequest("Choose a valid notification action.", 400);
    }
    const { error } = await query;
    if (error) throw error;
    return Response.json({ ok: true, read_at: now });
  } catch (error) {
    return monitoredRouteFailure({
      request, admin, error, feature: "dashboard-notifications",
      action: "mark-read", actorRole: "authenticated",
      safeMessage: "We couldn't update notifications.",
    });
  }
}

export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/notifications", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/notifications", "POST"), POSTHandler);
