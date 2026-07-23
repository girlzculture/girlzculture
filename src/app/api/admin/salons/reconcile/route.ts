import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

async function run(request: Request, execute: boolean) {
  let admin;
  try {
    const context = await requireAdminPermission(request, "salons");
    admin = context.admin;
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 100);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 100;
    const { data, error } = await admin.rpc("admin_reconcile_salon_publication", { p_acting_admin_id: context.user.id, p_execute: execute, p_result_limit: limit });
    if (error) throw error;
    return Response.json({ mode: execute ? "execute" : "preview", items: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "admin-salons", action: execute ? "reconcile-execute" : "reconcile-preview", actorRole: "admin", safeMessage: "Salon reconciliation could not be completed." });
  }
}

async function GETHandler(request: Request) { return run(request, false); }
async function POSTHandler(request: Request) { return run(request, true); }
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/salons/reconcile", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/salons/reconcile", "POST"), POSTHandler);
