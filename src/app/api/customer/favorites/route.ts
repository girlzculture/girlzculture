import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context(request: Request) {
  const admin = getSupabaseAdmin();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data, error } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: null };
  if (error || !data.user) rejectRequest("Please sign in to save salons.", 401);
  return { admin, user: data.user };
}

async function POSTHandler(request: Request) {
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    const auth = await context(request); admin = auth.admin;
    const body = await request.json() as { salon_id?: string };
    if (!UUID.test(body.salon_id || "")) rejectRequest("Choose a valid salon.");
    const { data: visible } = await admin.rpc("is_marketplace_visible", { target_salon_id: body.salon_id });
    if (visible !== true) rejectRequest("This salon is not available to save.");
    const { error } = await admin.from("customer_favorites").upsert({ customer_id: auth.user.id, salon_id: body.salon_id }, { onConflict: "customer_id,salon_id", ignoreDuplicates: true });
    if (error) throw error;
    return Response.json({ saved: true });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "customer_favorites", action: "save", actorRole: "customer", safeMessage: "We couldn't save this salon." });
  }
}

async function DELETEHandler(request: Request) {
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    const auth = await context(request); admin = auth.admin;
    const body = await request.json() as { salon_id?: string };
    if (!UUID.test(body.salon_id || "")) rejectRequest("Choose a valid salon.");
    const { error } = await admin.from("customer_favorites").delete().eq("customer_id", auth.user.id).eq("salon_id", body.salon_id);
    if (error) throw error;
    return Response.json({ saved: false });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "customer_favorites", action: "remove", actorRole: "customer", safeMessage: "We couldn't update this saved salon." });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/customer/favorites", "POST"), POSTHandler);
export const DELETE = withOperationalMonitoring(routeMonitoringProfile("/api/customer/favorites", "DELETE"), DELETEHandler);
