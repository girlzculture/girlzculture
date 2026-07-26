import "server-only";

import { capturePlatformError } from "@/lib/platformErrors";
import { formatZonedDateTime } from "@/lib/dateTime";
import { getSupabaseAdmin, sendEmail } from "@/lib/supabaseAdmin";
import { siteUrl, stripeGet } from "@/lib/stripeServer";

type StripeObject = {
  id?: string;
  payment_status?: string;
  payment_intent?: string | StripeObject;
  livemode?: boolean;
  metadata?: Record<string, string>;
  latest_charge?: string | StripeObject;
  balance_transaction?: string | StripeObject;
  transfer?: string | StripeObject;
  receipt_url?: string;
  payment_method?: string | StripeObject;
  fee?: number;
  card?: { brand?: string; last4?: string };
  type?: string;
};

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id || "") || null;
  }
  return null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function deliverPickupConfirmation(orderId: string, request: Request) {
  const admin = getSupabaseAdmin();
  const [{ data: order, error: orderError }, { data: items, error: itemError }] =
    await Promise.all([
      admin
        .from("product_orders")
        .select(
          "id,public_reference,salon_id,customer_id,guest_name,guest_email,deposit_amount,remaining_balance,pickup_deadline,management_token_hash",
        )
        .eq("id", orderId)
        .single(),
      admin
        .from("product_order_items")
        .select("product_name,quantity,line_total")
        .eq("order_id", orderId)
        .order("created_at"),
    ]);
  if (orderError) throw orderError;
  if (itemError) throw itemError;
  const { data: salon, error: salonError } = await admin
    .from("salons")
    .select(
      "name,email,user_id,address_street,address_city,address_state,address_zip,time_zone",
    )
    .eq("id", order.salon_id)
    .single();
  if (salonError) throw salonError;

  const productLines = (items || [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name)} — $${Number(item.line_total || 0).toFixed(2)}</li>`,
    )
    .join("");
  const address = [
    salon.address_street,
    [salon.address_city, salon.address_state, salon.address_zip]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const deadline = formatZonedDateTime(
    order.pickup_deadline,
    salon.time_zone || "America/New_York",
  );
  const customerHtml = `<h1>Your pickup reservation is confirmed</h1>
    <p>Hello ${escapeHtml(order.guest_name)},</p>
    <p>${escapeHtml(salon.name)} has received reservation ${escapeHtml(order.public_reference)}.</p>
    <ul>${productLines}</ul>
    <p><strong>Deposit paid:</strong> $${Number(order.deposit_amount || 0).toFixed(2)}<br/>
    <strong>Remaining balance at pickup:</strong> $${Number(order.remaining_balance || 0).toFixed(2)}<br/>
    <strong>Pickup by:</strong> ${escapeHtml(deadline)}<br/>
    <strong>Pickup address:</strong> ${escapeHtml(address)}</p>
    <p>The salon will notify you when the order is ready. Bring your reservation reference when collecting it.</p>`;
  const salonHtml = `<h1>New pickup reservation</h1>
    <p>${escapeHtml(order.guest_name)} reserved ${escapeHtml(order.public_reference)}.</p>
    <ul>${productLines}</ul>
    <p>Deposit: $${Number(order.deposit_amount || 0).toFixed(2)}<br/>
    Balance due at pickup: $${Number(order.remaining_balance || 0).toFixed(2)}<br/>
    Collection deadline: ${escapeHtml(deadline)}</p>`;

  const notification = await admin.from("notifications").insert({
    user_id: salon.user_id || null,
    salon_id: order.salon_id,
    channel: "in_app",
    title: "New pickup reservation",
    body: `${order.public_reference}: ${order.guest_name} reserved ${(items || []).length} product item${(items || []).length === 1 ? "" : "s"}.`,
    delivery_status: "delivered",
  });
  if (notification.error) throw notification.error;
  const deliveries = await Promise.allSettled([
    sendEmail(
      String(order.guest_email || ""),
      `Pickup reservation ${String(order.public_reference || "")}`,
      customerHtml,
      "bookings",
    ),
    salon.email
      ? sendEmail(
          String(salon.email),
          `New pickup reservation ${String(order.public_reference || "")}`,
          salonHtml,
          "bookings",
        )
      : Promise.resolve({ skipped: true }),
  ]);
  const failed = deliveries.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) {
    await capturePlatformError({
      request,
      admin,
      error: failed.reason,
      feature: "pickup-reservations",
      action: "deliver-pickup-confirmation",
      actorRole: "provider",
      salonId: String(order.salon_id),
      recordType: "product_order",
      recordId: orderId,
      provider: "transactional-notifications",
      safeMessage:
        "The pickup reservation was confirmed, but a notification needs attention.",
    });
  }
}

export async function completePickupReservation(
  session: StripeObject,
  request: Request,
) {
  if (
    session.metadata?.type !== "product_pickup_reservation" ||
    !["paid", "no_payment_required"].includes(
      String(session.payment_status || ""),
    )
  ) {
    return null;
  }
  const intentId = String(
    session.metadata?.commerce_intent_id || "",
  ).trim();
  if (!intentId) return null;
  const admin = getSupabaseAdmin();
  const { data: current, error: currentError } = await admin
    .from("commerce_checkout_intents")
    .select("id,status,order_id,salon_id,checkout_purpose")
    .eq("id", intentId)
    .single();
  if (currentError) throw currentError;
  if (current.checkout_purpose !== "pickup_reservation") return null;
  if (current.status === "Paid" && current.order_id) {
    return { orderId: current.order_id, alreadyCompleted: true };
  }

  const paymentIntentId = stripeId(session.payment_intent);
  let chargeId = "";
  let receiptUrl = "";
  let transferId = "";
  let processingFee = 0;
  let paymentMethodLabel = "No payment required";
  if (String(session.payment_status) === "paid" && paymentIntentId) {
    const paymentIntent = await stripeGet<StripeObject>(
      `/payment_intents/${paymentIntentId}?expand[]=latest_charge.balance_transaction&expand[]=payment_method`,
    );
    const charge =
      paymentIntent.latest_charge &&
      typeof paymentIntent.latest_charge === "object"
        ? paymentIntent.latest_charge
        : null;
    chargeId = stripeId(paymentIntent.latest_charge) || "";
    receiptUrl = String(charge?.receipt_url || "");
    transferId = stripeId(charge?.transfer) || "";
    const balance =
      charge?.balance_transaction &&
      typeof charge.balance_transaction === "object"
        ? charge.balance_transaction
        : null;
    processingFee = Math.max(0, Number(balance?.fee || 0) / 100);
    const method =
      paymentIntent.payment_method &&
      typeof paymentIntent.payment_method === "object"
        ? paymentIntent.payment_method
        : null;
    const brand = String(method?.card?.brand || "").trim();
    const last4 = String(method?.card?.last4 || "").trim();
    paymentMethodLabel =
      brand && last4
        ? `${brand[0].toUpperCase()}${brand.slice(1)} ending in ${last4}`
        : String(method?.type || "Secure card payment").replaceAll("_", " ");
  }

  const completion = await admin.rpc("complete_product_pickup_reservation", {
    p_commerce_intent_id: intentId,
    p_payment: {
      checkout_session_id: session.id || null,
      payment_intent_id: paymentIntentId,
      charge_id: chargeId || null,
      receipt_url: receiptUrl || null,
      connected_account_id:
        session.metadata?.connected_account_id || null,
      transfer_id: transferId || null,
      processing_fee: processingFee,
      payment_method_label: paymentMethodLabel,
      payment_mode: session.livemode ? "live" : "test",
    },
  });
  if (completion.error) throw completion.error;
  const result = completion.data as {
    order_id?: string;
    already_completed?: boolean;
  } | null;
  if (!result?.order_id) {
    throw new Error("PICKUP_RESERVATION_COMPLETION_MISSING_ORDER");
  }
  if (!result.already_completed) {
    await deliverPickupConfirmation(result.order_id, request);
  }
  return {
    orderId: result.order_id,
    alreadyCompleted: Boolean(result.already_completed),
  };
}

export function pickupManagementUrl(request: Request, token: string) {
  return `${siteUrl(request)}/pickup/${encodeURIComponent(token)}`;
}
