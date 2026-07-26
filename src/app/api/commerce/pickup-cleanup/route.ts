import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure } from "@/lib/platformErrors";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && supplied && expected === supplied);
}

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  try {
    if (!authorized(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [checkoutCleanup, pickupCleanup] = await Promise.all([
      admin.rpc("expire_stale_commerce_checkouts"),
      admin.rpc("expire_product_pickup_reservations"),
    ]);
    if (checkoutCleanup.error) throw checkoutCleanup.error;
    if (pickupCleanup.error) throw pickupCleanup.error;
    return Response.json({
      expired_checkout_inventory_released: true,
      pickup_reservations_expired: Number(pickupCleanup.data || 0),
    });
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin,
      error,
      feature: "pickup-reservations",
      action: "expire-pickup-reservations",
      actorRole: "system",
      safeMessage: "Pickup reservation cleanup could not finish.",
    });
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/commerce/pickup-cleanup", "POST", {
    classification: "protected",
    feature: "pickup-reservations",
    actorRole: "system",
    safeMessage: "Pickup reservation cleanup could not finish.",
  }),
  POSTHandler,
);
