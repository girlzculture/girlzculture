import { createHash } from "node:crypto";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import {
  cleanText,
  enforceRateLimit,
} from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { stripeRequest } from "@/lib/stripeServer";

type Context = { params: Promise<{ token: string }> };
type Row = Record<string, unknown>;

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function validToken(value: string) {
  return /^[A-Za-z0-9_-]{40,80}$/.test(value);
}

async function resolveReservation(token: string) {
  const admin = getSupabaseAdmin();
  if (!validToken(token)) return { admin, order: null };
  const { data: order, error } = await admin
    .from("product_orders")
    .select(
      "id,public_reference,salon_id,customer_id,guest_name,fulfillment_method,total_amount,deposit_amount,remaining_balance,pickup_deadline,reservation_status,payment_status,refund_status,refund_amount,customer_safe_reason,created_at,stripe_payment_intent_id,stripe_connected_account_id,items:product_order_items(id,product_name,image_url,unit_price,quantity,line_total),salon:salons(id,name,slug,address_street,address_city,address_state,address_zip,phone,email,time_zone)",
    )
    .eq("management_token_hash", tokenHash(token))
    .maybeSingle();
  if (error) throw error;
  return { admin, order: order as Row | null };
}

async function GETHandler(request: Request, context: Context) {
  let admin;
  try {
    enforceRateLimit(request, "pickup-management-read", 40, 10 * 60_000);
    const { token } = await context.params;
    const resolved = await resolveReservation(token);
    admin = resolved.admin;
    if (!resolved.order) {
      return Response.json(
        {
          error:
            "This pickup link is invalid or is no longer available.",
        },
        { status: 404 },
      );
    }
    const { stripe_payment_intent_id, stripe_connected_account_id, ...safe } =
      resolved.order;
    void stripe_payment_intent_id;
    void stripe_connected_account_id;
    return Response.json(
      { reservation: safe },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "pickup-reservations",
      action: "load-guest-pickup-reservation",
      actorRole: "guest",
      safeMessage: "We couldn't load this pickup reservation.",
    });
    return Response.json(
      {
        error: `We couldn't load this pickup reservation. Reference ${reference}.`,
        request_id: reference,
      },
      { status: 500, headers: { "X-Request-ID": reference } },
    );
  }
}

async function POSTHandler(request: Request, context: Context) {
  let admin;
  let orderId: string | null = null;
  let refundId: string | null = null;
  try {
    enforceRateLimit(request, "pickup-management-write", 8, 10 * 60_000);
    const { token } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (cleanText(body.action, 30) !== "cancel") {
      return Response.json(
        { error: "Choose a supported reservation action." },
        { status: 400 },
      );
    }
    const resolved = await resolveReservation(token);
    admin = resolved.admin;
    const order = resolved.order;
    if (!order) {
      return Response.json(
        { error: "This pickup link is invalid or is no longer available." },
        { status: 404 },
      );
    }
    orderId = String(order.id);
    const status = String(order.reservation_status || "");
    if (["Canceled", "Expired", "Refunded"].includes(status)) {
      return Response.json({ reservation: order, alreadyCanceled: true });
    }
    if (status === "Collected") {
      return Response.json(
        { error: "A collected reservation can no longer be canceled." },
        { status: 409 },
      );
    }
    if (!["Reserved", "Ready for pickup"].includes(status)) {
      return Response.json(
        { error: "This reservation is not ready for cancellation." },
        { status: 409 },
      );
    }

    const customerReason =
      cleanText(body.reason, 500) ||
      "The customer canceled the pickup reservation.";
    const refundable =
      status === "Reserved"
        ? Math.max(0, Number(order.deposit_amount || 0))
        : 0;
    let refundStatus = refundable > 0 ? "Refund pending" : "Not required";
    const refundAmount = refundable;

    if (refundable > 0) {
      const { data: created, error: createError } = await admin
        .from("product_order_refunds")
        .insert({
          order_id: orderId,
          salon_id: order.salon_id,
          amount: Number(refundable.toFixed(2)),
          reason: "customer_cancellation",
          notes: customerReason,
          status: "Pending",
          requested_by_role: "guest_customer",
        })
        .select("*")
        .single();
      if (createError) {
        if (createError.code !== "23505") throw createError;
        const { data: existing, error: existingError } = await admin
          .from("product_order_refunds")
          .select("*")
          .eq("order_id", orderId)
          .eq("reason", "customer_cancellation")
          .in("status", ["Pending", "Succeeded"])
          .single();
        if (existingError) throw existingError;
        refundId = existing.id;
      } else {
        refundId = created.id;
      }
      if (!order.stripe_payment_intent_id) {
        throw new Error("PICKUP_REFUND_PAYMENT_EVIDENCE_MISSING");
      }
      const refund = await stripeRequest<{
        id?: string;
        status?: string;
      }>(
        "/refunds",
        {
          payment_intent: String(order.stripe_payment_intent_id),
          amount: Math.round(refundable * 100),
          reverse_transfer: Boolean(order.stripe_connected_account_id),
          "metadata[product_order_id]": orderId,
          "metadata[product_refund_id]": refundId,
          "metadata[refund_reason]": "customer_cancellation",
        },
        { idempotencyKey: `pickup-cancel:${orderId}` },
      );
      if (!refund.id) throw new Error("STRIPE_REFUND_ID_MISSING");
      const providerStatus = String(refund.status || "pending").toLowerCase();
      const normalized =
        providerStatus === "succeeded"
          ? "Succeeded"
          : providerStatus === "failed" || providerStatus === "canceled"
            ? "Failed"
            : "Pending";
      const refundUpdate = await admin
        .from("product_order_refunds")
        .update({
          stripe_refund_id: refund.id,
          stripe_refund_status: providerStatus,
          status: normalized,
          completed_at:
            normalized === "Succeeded" ? new Date().toISOString() : null,
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

    const canceled = await admin.rpc("cancel_product_pickup_reservation", {
      p_order_id: orderId,
      p_actor: "Customer",
      p_customer_reason: customerReason,
      p_internal_reason: null,
      p_refund_status: refundStatus,
      p_refund_amount: refundAmount,
    });
    if (canceled.error) throw canceled.error;
    return Response.json({
      reservation: canceled.data,
      refund_created: refundStatus !== "Not required",
      refund_status: refundStatus,
      policy:
        status === "Reserved"
          ? "The pickup deposit was submitted for refund."
          : "The reservation was already ready for pickup, so the deposit is retained under the pickup policy.",
    });
  } catch (error) {
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "pickup-reservations",
      action: "cancel-guest-pickup-reservation",
      actorRole: "guest",
      recordType: "product_order",
      recordId: orderId,
      provider: "stripe",
      safeMessage: "We couldn't finish canceling this pickup reservation.",
    });
    if (admin && refundId) {
      await admin
        .from("product_order_refunds")
        .update({
          status: "Failed",
          error_reference: reference,
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundId)
        .eq("status", "Pending");
    }
    if (admin && orderId) {
      await admin.rpc("cancel_product_pickup_reservation", {
        p_order_id: orderId,
        p_actor: "Customer",
        p_customer_reason:
          "The customer canceled the pickup reservation.",
        p_internal_reason: `Refund requires attention. Reference ${reference}.`,
        p_refund_status: refundId ? "Failed" : "Not required",
        p_refund_amount: 0,
      });
    }
    return Response.json(
      {
        error: `We couldn't finish canceling this pickup reservation. Reference ${reference}.`,
        request_id: reference,
      },
      { status: 500, headers: { "X-Request-ID": reference } },
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/pickup/[token]", "GET", {
    classification: "provider-backed",
    feature: "pickup-reservations",
    actorRole: "guest",
    safeMessage: "The pickup reservation could not be loaded.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/pickup/[token]", "POST", {
    classification: "provider-backed",
    feature: "pickup-reservations",
    actorRole: "guest",
    provider: "stripe",
    safeMessage: "The pickup reservation could not be canceled.",
  }),
  POSTHandler,
);
