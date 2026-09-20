import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { clientFailure, clientHeaders, readBusinessClientCard, type ClientContext } from "@/lib/businessClientServer";
import { clientUuid, validateClientLink } from "@/lib/businessClientCore";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function handle(request: Request, route: { params: Promise<{ id: string }> }) {
  let context: ClientContext | undefined;
  try {
    context = await requireSalonPermission(request, "client_history");
    if (!context.isOwner) throw Error("CLIENT_ACCESS_DENIED");
    enforceRateLimit(request, `client-links:${context.user.id}`, 60, 60_000);
    const { id } = await route.params;
    const query = new URL(request.url).searchParams;
    if (!clientUuid.test(id) || [...query.keys()].some(key => key !== "q") || query.getAll("q").length > 1 || (query.get("q") || "").length > 120 || request.method === "POST" && query.size) throw Error("CLIENT_INVALID");
    if (request.method === "GET") {
      const result = await context.admin.rpc("read_business_client_links", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: id, p_search: query.get("q") || "" });
      if (result.error) throw result.error;
      if (!Number.isInteger(result.data?.revision) || !Array.isArray(result.data?.candidates) || !Array.isArray(result.data?.links)) throw Error("CLIENT_NOT_VERIFIED");
      return Response.json(result.data, { headers: clientHeaders });
    }
    const input = validateClientLink(await request.json());
    const result = await context.admin.rpc("change_business_client_link", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: id, p_request: input.request_id, p_revision: input.revision, p_action: input.action, p_target: input.target });
    if (result.error) throw result.error;
    if (result.data?.verified !== true) throw Error("CLIENT_NOT_VERIFIED");
    // Read current permissions and current association after the atomic write.
    return Response.json({ verified: true, card: await readBusinessClientCard(context, id) }, { headers: clientHeaders });
  } catch (error) { return clientFailure(request, error, context); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record/links", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record/links", "POST"), handle);
