import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { stripeRequest } from "@/lib/stripeServer";
import { productRefundSummary } from "@/lib/productCommerceCore";

const REASONS = new Set([
  "non_delivery",
  "damaged_or_wrong",
  "duplicate_charge",
  "fraud",
  "salon_unable_to_fulfill",
]);

type StripeRefund = { id?: string; status?: string };

async function POSTHandler(request: Request) {
  let admin;
  let orderId: string | null = null;
  let refundId: string | null = null;
  let stripeRefundId: string | null = null;
  try {
    const context = await requireAdminPermission(request, "finance");
    admin = context.admin;
    const body = (await request.json()) as Record<string, unknown>;
    orderId = cleanText(body.order_id, 50);
    const reason = cleanText(body.reason, 50);
    const notes = cleanText(body.notes, 500) || null;
    const amount = Number(body.amount);
    if (!orderId || !REASONS.has(reason))
      return Response.json(
        { error: "Choose an order and supported refund reason." },
        { status: 400 },
      );
    if (!Number.isFinite(amount) || amount <= 0)
      return Response.json(
        { error: "Enter a positive refund amount." },
        { status: 400 },
      );
    const { data: order, error: orderError } = await admin
      .from("product_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (orderError) throw orderError;
    if (!order.stripe_payment_intent_id)
      return Response.json(
        { error: "This order has no refundable Stripe payment." },
        { status: 409 },
      );
    const prior = await admin
      .from("product_order_refunds")
      .select("amount,status")
      .eq("order_id", orderId)
      .in("status", ["Pending", "Succeeded"]);
    if (prior.error) throw prior.error;
    const alreadyRefunded = (prior.data || []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const refundable = Math.max(
      0,
      Number(order.total_amount || 0) - alreadyRefunded,
    );
    if (amount > refundable + 0.0001)
      return Response.json(
        {
          error: `The maximum refundable amount is $${refundable.toFixed(2)}.`,
        },
        { status: 409 },
      );
    const created = await admin
      .from("product_order_refunds")
      .insert({
        order_id: orderId,
        salon_id: order.salon_id,
        amount: Number(amount.toFixed(2)),
        reason,
        notes,
        status: "Pending",
        requested_by: context.user.id,
        requested_by_role: "platform_admin",
      })
      .select("*")
      .single();
    if (created.error) throw created.error;
    refundId = created.data.id;
    const refund = await stripeRequest<StripeRefund>(
      "/refunds",
      {
        payment_intent: order.stripe_payment_intent_id,
        amount: Math.round(amount * 100),
        reverse_transfer: Boolean(order.stripe_connected_account_id),
        "metadata[product_order_id]": orderId,
        "metadata[product_refund_id]": refundId,
        "metadata[refund_reason]": reason,
      },
      { idempotencyKey: `product-refund:${refundId}` },
    );
    if (!refund.id) throw new Error("STRIPE_REFUND_ID_MISSING");
    stripeRefundId = refund.id;
    const providerStatus = String(refund.status || "pending").toLowerCase();
    const normalized =
      providerStatus === "succeeded"
        ? "Succeeded"
        : providerStatus === "failed" || providerStatus === "canceled"
          ? "Failed"
          : "Pending";
    const saved = await admin
      .from("product_order_refunds")
      .update({
        stripe_refund_id: refund.id,
        stripe_refund_status: providerStatus,
        status: normalized,
        completed_at:
          normalized === "Succeeded" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId)
      .select("*")
      .single();
    if (saved.error) throw saved.error;
    const totalSuccessful = alreadyRefunded +
      (normalized === "Succeeded" ? amount : 0);
    const refundSummary = productRefundSummary(
      Number(order.total_amount || 0),
      totalSuccessful,
      Number(order.stripe_processing_fee || 0),
    );
    const orderUpdate = await admin
      .from("product_orders")
      .update({
        payment_status:
          normalized === "Succeeded"
            ? refundSummary.paymentStatus
            : order.payment_status,
        net_amount_owed_salon:
          normalized === "Succeeded"
            ? refundSummary.netAmountOwedSalon
            : order.net_amount_owed_salon,
        payout_status:
          normalized === "Succeeded"
            ? refundSummary.payoutStatus
            : order.payout_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (orderUpdate.error) throw orderUpdate.error;
    const event = await admin.from("product_order_events").insert({
      order_id: orderId,
      salon_id: order.salon_id,
      event_type: "refund_requested",
      actor_id: context.user.id,
      actor_role: "platform_admin",
      note: notes,
      metadata: {
        refund_id: refundId,
        amount: Number(amount.toFixed(2)),
        reason,
        provider_status: providerStatus,
      },
    });
    if (event.error) throw event.error;
    return Response.json({ refund: saved.data });
  } catch (error) {
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "product-commerce",
      action: "refund-product-order",
      actorRole: "admin",
      recordType: "product_order",
      recordId: orderId,
      provider: "stripe",
      safeMessage: "We couldn't complete this product refund.",
    });
    if (admin && refundId)
      await admin
        .from("product_order_refunds")
        .update({
          status: stripeRefundId ? "Pending" : "Failed",
          stripe_refund_id: stripeRefundId,
          error_reference: reference,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundId);
    return Response.json(
      {
        error: `We couldn't complete this product refund. Reference ${reference}.`,
        request_id: reference,
      },
      { status: 500 },
    );
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/finance/product-refund", "POST", {
    classification: "provider-backed",
    feature: "product-commerce",
    actorRole: "admin",
    provider: "stripe",
    safeMessage: "The product refund could not be processed.",
  }),
  POSTHandler,
);
