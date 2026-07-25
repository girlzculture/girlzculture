import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";

const TRANSITIONS: Record<string, string[]> = {
  New: ["Preparing"],
  Preparing: ["Ready for Pickup", "Shipped"],
  "Ready for Pickup": ["Delivered"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

async function GETHandler(request: Request) {
  let admin;
  let salonId: string | null = null;
  try {
    const context = await requireSalonPermission(request, "products");
    admin = context.admin;
    salonId = context.salon.id;
    const { data, error } = await admin
      .from("product_orders")
      .select(
        "*,items:product_order_items(*),refunds:product_order_refunds(*),events:product_order_events(*)",
      )
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return Response.json(
      { orders: data || [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "product-commerce",
      action: "load-salon-orders",
      actorRole: "salon",
      salonId,
      safeMessage: "We couldn't load product orders.",
    });
    return safeFailure("We couldn't load product orders.", reference);
  }
}

async function POSTHandler(request: Request) {
  let admin;
  let salonId: string | null = null;
  let orderId: string | null = null;
  try {
    const context = await requireSalonPermission(request, "products");
    admin = context.admin;
    salonId = context.salon.id;
    const body = (await request.json()) as Record<string, unknown>;
    orderId = cleanText(body.order_id, 50);
    const nextStatus = cleanText(body.fulfillment_status, 40);
    if (!orderId || !nextStatus)
      return Response.json(
        { error: "Choose an order and fulfillment status." },
        { status: 400 },
      );
    const { data: current, error: currentError } = await admin
      .from("product_orders")
      .select("*")
      .eq("id", orderId)
      .eq("salon_id", salonId)
      .single();
    if (currentError) throw currentError;
    if (!(TRANSITIONS[String(current.fulfillment_status)] || []).includes(nextStatus))
      return Response.json(
        {
          error: `This order cannot move from ${String(current.fulfillment_status)} to ${nextStatus}.`,
        },
        { status: 409 },
      );
    if (
      nextStatus === "Ready for Pickup" &&
      current.fulfillment_method !== "Pickup"
    )
      return Response.json(
        { error: "Only pickup orders can be marked ready for pickup." },
        { status: 400 },
      );
    if (nextStatus === "Shipped" && current.fulfillment_method !== "Shipping")
      return Response.json(
        { error: "Only shipping orders can be marked shipped." },
        { status: 400 },
      );
    const carrier = cleanText(body.carrier, 80) || null;
    const trackingNumber = cleanText(body.tracking_number, 120) || null;
    if (nextStatus === "Shipped" && (!carrier || !trackingNumber))
      return Response.json(
        { error: "Enter the carrier and tracking number before marking shipped." },
        { status: 400 },
      );
    const note = cleanText(body.note, 500) || null;
    const update = await admin
      .from("product_orders")
      .update({
        fulfillment_status: nextStatus,
        carrier,
        tracking_number: trackingNumber,
        fulfillment_note: note,
        fulfilled_at: nextStatus === "Delivered" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("salon_id", salonId)
      .eq("fulfillment_status", current.fulfillment_status)
      .select("*,items:product_order_items(*)")
      .single();
    if (update.error) throw update.error;
    const event = await admin.from("product_order_events").insert({
      order_id: orderId,
      salon_id: salonId,
      event_type: "fulfillment_status_changed",
      previous_status: current.fulfillment_status,
      new_status: nextStatus,
      note,
      actor_id: context.user.id,
      actor_role: context.isOwner ? "salon_owner" : "salon_team",
      metadata: { carrier, tracking_number: trackingNumber },
    });
    if (event.error) throw event.error;
    return Response.json({ order: update.data });
  } catch (error) {
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "product-commerce",
      action: "update-fulfillment",
      actorRole: "salon",
      salonId,
      recordType: "product_order",
      recordId: orderId,
      safeMessage: "We couldn't update this order.",
    });
    return safeFailure("We couldn't update this order.", reference);
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/product-orders", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/product-orders", "POST"),
  POSTHandler,
);
