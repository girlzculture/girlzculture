import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { enforceRateLimit } from "@/lib/requestSecurity";

async function GETHandler(request: Request) {
  let admin;
  try {
    enforceRateLimit(request, "admin-market-workspaces", 60, 60_000);
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope !== "content" && scope !== "marketing") rejectRequest("Choose a content or marketing workspace.");
    ({ admin } = await requireAdminPermission(request, scope));
    const result = await admin.from("location_markets").select("id,name,state_code,market_type,parent_market_id,center_latitude,center_longitude,is_active").order("state_code").order("name").range(0, 1000);
    if (result.error) throw result.error;
    return Response.json({ markets: (result.data || []).slice(0, 1000), truncated: (result.data || []).length > 1000 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "content", action: "list-market-workspaces", actorRole: "admin", safeMessage: "Location workspaces could not be loaded." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/market-workspaces", "GET"), GETHandler);
