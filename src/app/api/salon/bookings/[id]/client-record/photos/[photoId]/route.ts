import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { clientFailure, clientHeaders, type ClientContext } from "@/lib/businessClientServer";
import { clientUuid } from "@/lib/businessClientCore";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
async function handle(request: Request, route: { params: Promise<{ id: string; photoId: string }> }) {
  let context: ClientContext | undefined;
  try {
    context = await requireSalonPermission(request, "client_history");
    enforceRateLimit(request, `client-photo-read:${context.user.id}`, 120, 60_000);
    const { id, photoId } = await route.params;
    if (!clientUuid.test(id) || !clientUuid.test(photoId) || new URL(request.url).searchParams.size) throw Error("CLIENT_INVALID");
    const storage = context.admin.storage.from("business-client-work");
    if (request.method === "DELETE") {
      const removed = await context.admin.rpc("record_business_client_photo", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: id, p_photo: photoId, p_caption: "", p_locale: "en", p_remove: true });
      if (removed.error) throw removed.error;
      const path = removed.data?.object_path;
      if (removed.data?.removed !== true || path !== `${context.salon.id}/${id}/${photoId}.webp`) throw Error("CLIENT_NOT_VERIFIED");
      const deleted = await storage.remove([path]);
      if (deleted.error) throw Error("CLIENT_PHOTO_DELETE_FAILED");
      return Response.json({ removed: true, id: photoId }, { headers: clientHeaders });
    }
    const authorized = await context.admin.rpc("read_business_client_photo", { p_salon: context.salon.id, p_actor: context.user.id, p_booking: id, p_photo: photoId });
    if (authorized.error) throw authorized.error;
    if (typeof authorized.data !== "string" || !authorized.data.startsWith(`${context.salon.id}/`) || !authorized.data.endsWith(`/${photoId}.webp`)) throw Error("CLIENT_NOT_VERIFIED");
    const file = await storage.download(authorized.data);
    if (file.error || !file.data) throw Error("CLIENT_PHOTO_UNAVAILABLE");
    return new Response(file.data, { headers: { ...clientHeaders, "Content-Type": "image/webp", "Content-Disposition": "inline" } });
  } catch (error) { return clientFailure(request, error, context); }
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record/photos/[photoId]", "GET"), handle);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/client-record/photos/[photoId]", "DELETE"), handle);
