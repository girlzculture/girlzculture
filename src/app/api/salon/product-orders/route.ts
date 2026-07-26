import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError, safeFailure } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireSalonPermission, sendEmail } from "@/lib/supabaseAdmin";
import { stripeRequest } from "@/lib/stripeServer";

const TRANSITIONS: Record<string, string[]> = {
  New: ["Preparing"],
  Preparing: ["Ready for Pickup", "Shipped"],
  "Ready for Pickup": ["Delivered"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};
const RESERVATION_TRANSITIONS: Record<string, string[]> = {
  Reserved: ["Ready for pickup", "Canceled", "Not collected"],
  "Ready for pickup": ["Collected", "Canceled", "Not collected"],
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
  let cancellationRefundId: string | null = null;
  let cancellationAmount = 0;
  let cancellationInProgress = false;
  let cancellationNote: string | null = null;
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
    const reservationStatus = String(current.reservation_status || "");
    const permitted = reservationStatus
      ? RESERVATION_TRANSITIONS[reservationStatus] || []
      : TRANSITIONS[String(current.fulfillment_status)] || [];
    if (!permitted.includes(nextStatus))
      return Response.json(
        {
          error: `This order cannot move from ${String(current.fulfillment_status)} to ${nextStatus}.`,
        },
        { status: 409 },
      );
    if (reservationStatus) {
      let savedOrder;
      if (nextStatus === "Canceled") {
        const amount = Math.max(0, Number(current.deposit_amount || 0));
        cancellationInProgress = true;
        cancellationAmount = amount;
        cancellationNote = cleanText(body.note, 1000) || null;
        let refundStatus = amount > 0 ? "Refund pending" : "Not required";
        let refundId: string | null = null;
        if (amount > 0) {
          const prior = await admin
            .from("product_order_refunds")
            .select("*")
            .eq("order_id", orderId)
            .eq("reason", "salon_unable_to_fulfill")
            .in("status", ["Pending", "Succeeded"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prior.error) throw prior.error;
          if (prior.data) {
            refundId = prior.data.id;
          } else {
            const created = await admin
              .from("product_order_refunds")
              .insert({
                order_id: orderId,
                salon_id: salonId,
                amount,
                reason: "salon_unable_to_fulfill",
                notes: "Salon canceled the pickup reservation.",
                status: "Pending",
                requested_by: context.user.id,
                requested_by_role: context.isOwner
                  ? "salon_owner"
                  : "salon_team",
              })
              .select("*")
              .single();
            if (created.error) throw created.error;
            refundId = created.data.id;
          }
          cancellationRefundId = refundId;
          if (!current.stripe_payment_intent_id) {
            throw new Error("PICKUP_REFUND_PAYMENT_EVIDENCE_MISSING");
          }
          const refund = await stripeRequest<{
            id?: string;
            status?: string;
          }>(
            "/refunds",
            {
              payment_intent: current.stripe_payment_intent_id,
              amount: Math.round(amount * 100),
              reverse_transfer: Boolean(
                current.stripe_connected_account_id,
              ),
              "metadata[product_order_id]": orderId,
              "metadata[product_refund_id]": refundId,
              "metadata[refund_reason]": "salon_unable_to_fulfill",
            },
            { idempotencyKey: `pickup-salon-cancel:${orderId}` },
          );
          if (!refund.id) throw new Error("STRIPE_REFUND_ID_MISSING");
          const providerStatus = String(
            refund.status || "pending",
          ).toLowerCase();
          const normalized =
            providerStatus === "succeeded"
              ? "Succeeded"
              : providerStatus === "failed" ||
                  providerStatus === "canceled"
                ? "Failed"
                : "Pending";
          const refundUpdate = await admin
            .from("product_order_refunds")
            .update({
              stripe_refund_id: refund.id,
              stripe_refund_status: providerStatus,
              status: normalized,
              completed_at:
                normalized === "Succeeded"
                  ? new Date().toISOString()
                  : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", refundId);
          if (refundUpdate.error) throw refundUpdate.error;
          refundStatus =
            normalized === "Succeeded"
              ? "Refunded"
              : normalized === "Failed"
                ? "Failed"
                : "Refund pending";
        }
        const canceled = await admin.rpc(
          "cancel_product_pickup_reservation",
          {
            p_order_id: orderId,
            p_actor: "Salon",
            p_customer_reason:
              "The salon could not fulfill this pickup reservation.",
            p_internal_reason: cleanText(body.note, 1000) || null,
            p_refund_status: refundStatus,
            p_refund_amount: amount,
          },
        );
        if (canceled.error) throw canceled.error;
        savedOrder = canceled.data;
      } else {
        const advanced = await admin.rpc(
          "advance_product_pickup_reservation",
          {
            p_order_id: orderId,
            p_next_status: nextStatus,
            p_actor_id: context.user.id,
            p_actor_role: context.isOwner ? "salon_owner" : "salon_team",
            p_note: cleanText(body.note, 500) || null,
          },
        );
        if (advanced.error) throw advanced.error;
        savedOrder = advanced.data;
      }
      const { data: refreshed, error: refreshError } = await admin
        .from("product_orders")
        .select("*,items:product_order_items(*)")
        .eq("id", orderId)
        .single();
      if (refreshError) throw refreshError;
      const warningReferences: string[] = [];
      if (
        nextStatus === "Ready for pickup" &&
        current.guest_email
      ) {
        try {
          await sendEmail(
            String(current.guest_email),
            `Pickup reservation ${String(current.public_reference)} is ready`,
            `<h1>Your pickup reservation is ready</h1><p>${String(current.public_reference)} is ready for collection at ${String(context.salon.name)}. The remaining balance is $${Number(current.remaining_balance || 0).toFixed(2)}.</p>`,
            "bookings",
          );
        } catch (notificationError) {
          warningReferences.push(
            await capturePlatformError({
              request,
              admin,
              error: notificationError,
              feature: "pickup-reservations",
              action: "notify-pickup-ready",
              actorRole: "provider",
              salonId,
              recordType: "product_order",
              recordId: orderId,
              provider: "transactional-notifications",
              safeMessage:
                "The reservation was updated, but its email needs attention.",
            }),
          );
        }
      }
      void savedOrder;
      return Response.json({
        order: refreshed,
        warnings: warningReferences.map((reference) => ({
          message: `The status was saved, but a notification needs attention. Reference ${reference}.`,
          request_id: reference,
        })),
      });
    }
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
    if (cancellationInProgress && admin && orderId) {
      if (cancellationRefundId) {
        await admin
          .from("product_order_refunds")
          .update({
            status: "Failed",
            stripe_refund_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", cancellationRefundId)
          .eq("status", "Pending");
      }
      const released = await admin.rpc(
        "cancel_product_pickup_reservation",
        {
          p_order_id: orderId,
          p_actor: "Salon",
          p_customer_reason:
            "The salon could not fulfill this pickup reservation.",
          p_internal_reason: `${cancellationNote ? `${cancellationNote} ` : ""}Refund requires attention. Reference ${reference}.`,
          p_refund_status:
            cancellationAmount > 0 ? "Failed" : "Not required",
          p_refund_amount: 0,
        },
      );
      if (!released.error) {
        const refreshed = await admin
          .from("product_orders")
          .select("*,items:product_order_items(*)")
          .eq("id", orderId)
          .single();
        return Response.json({
          order: refreshed.data || released.data,
          warnings: [
            {
              message: `The reservation was canceled and inventory was released, but the refund needs attention. Reference ${reference}.`,
              request_id: reference,
            },
          ],
        });
      }
    }
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
