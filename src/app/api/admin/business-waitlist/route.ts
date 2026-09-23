import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { businessWaitlistDemand } from "@/lib/businessWaitlistDemand";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

async function handle(request: Request) {
  try {
    const { admin } = await requireAdminPermission(request, "support");
    return Response.json({ categories: await businessWaitlistDemand(admin), measure: "submitted_waitlist_requests" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, error, feature: "business-waitlist", action: "demand", actorRole: "admin", safeMessage: "Waitlist counts could not be loaded." });
  }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/business-waitlist", "GET"), handle);
