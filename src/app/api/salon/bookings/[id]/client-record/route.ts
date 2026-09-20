import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { clientFailure, clientHeaders, readBusinessClientCard, type ClientContext } from "@/lib/businessClientServer";
import { validateClientSave } from "@/lib/businessClientCore";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function handle(request: Request, route: { params: Promise<{ id: string }> }) {
  let context: ClientContext | undefined;
  try {
    context = await requireSalonPermission(request, "client_history");
    enforceRateLimit(request, `client-card:${context.user.id}`, 60, 60_000);
    if (new URL(request.url).searchParams.size) throw Error("CLIENT_INVALID");
    const { id } = await route.params;
    if (request.method === "GET") return Response.json({ card: await readBusinessClientCard(context, id) }, { headers: clientHeaders });
    const input = validateClientSave(await request.json());
    // Scope/field permissions are checked again atomically inside the RPC.
    const current = await readBusinessClientCard(context, id);
    if (!current.permissions.client_edit) throw Error("CLIENT_ACCESS_DENIED");
    const saved = await context.admin.rpc("save_business_client_card", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: id, p_request: input.request_id, p_revision: input.revision, p_locale: input.locale, p_patch: input.patch });
    if (saved.error) throw saved.error;
    if (saved.data?.verified !== true || !Number.isInteger(saved.data.revision)) throw Error("CLIENT_NOT_VERIFIED");
    const card = await readBusinessClientCard(context, id);
    if (card.card_id !== saved.data.card_id || card.revision < saved.data.revision) throw Error("CLIENT_NOT_VERIFIED");
    return Response.json({ verified: true, card }, { headers: clientHeaders });
  } catch (error) { return clientFailure(request, error, context); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record", "GET"), handle);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record", "POST"), handle);
