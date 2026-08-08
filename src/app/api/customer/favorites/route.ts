import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function context(request: Request) {
  const admin = getSupabaseAdmin();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data, error } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: null };
  if (error || !data.user) rejectRequest("Please sign in to save salons.", 401);
  const normalizedEmail = data.user.email?.trim().toLowerCase() || "";
  const [{ data: identity, error: identityError }, { data: customer, error: customerError }] = await Promise.all([
    admin.from("platform_identities").select("primary_role,status,email_normalized").eq("user_id", data.user.id).maybeSingle(),
    admin.from("customers").select("id").eq("id", data.user.id).maybeSingle(),
  ]);
  if (identityError) throw identityError;
  if (customerError) throw customerError;
  if (!identity || identity.status !== "Active" || identity.primary_role !== "customer" || identity.email_normalized !== normalizedEmail || !customer) {
    rejectRequest("Sign in with a customer account to save salons.", 403);
  }
  return { admin, user: data.user };
}

async function GETHandler(request: Request) {
  let admin: ReturnType<typeof getSupabaseAdmin> | undefined;
  try {
    const auth = await context(request); admin = auth.admin;
    const { data, error } = await admin
      .from("customer_favorites")
      .select("salon:salons(id,name,slug,address_city,address_state,borough,cover_photo_url,rating_overall,review_count,is_closed_override,closed_override_date,time_zone,hours)")
      .eq("customer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const candidates = (data || []).map((item) => item.salon).filter(Boolean);
    const visibility = await Promise.all(candidates.map(async (salon) => {
      const row = salon as unknown as { id?: string };
      const { data: visible, error: visibilityError } = await admin!.rpc("is_marketplace_visible", { target_salon_id: row.id });
      if (visibilityError) throw visibilityError;
      return visible === true ? salon : null;
    }));
    return Response.json({ salons: visibility.filter(Boolean) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "customer_favorites", action: "list", actorRole: "customer", safeMessage: "We couldn't load your saved salons." });
  }
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
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/customer/favorites", "GET"), GETHandler);
