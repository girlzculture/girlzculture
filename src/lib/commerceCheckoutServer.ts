import { capturePlatformError } from "@/lib/platformErrors";
import {
  deliverBookingNotifications,
  getSupabaseAdmin,
  sendEmail,
} from "@/lib/supabaseAdmin";
import { stripeGet, stripeRequest } from "@/lib/stripeServer";
import { formatZonedDateTime } from "@/lib/dateTime";

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
  amount?: number;
  fee?: number;
  net?: number;
  card?: { brand?: string; last4?: string };
  type?: string;
};

type CommerceTaxAddress = {
  line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export async function estimateStripeCommerceTax(input: {
  taxableAmount: number;
  shippingAmount: number;
  address: CommerceTaxAddress;
  reference: string;
}) {
  if (process.env.STRIPE_TAX_ENABLED !== "true") {
    return {
      taxAmount: 0,
      calculationId: "",
      configured: false,
    };
  }
  const taxableCents = Math.max(
    0,
    Math.round(Number(input.taxableAmount || 0) * 100),
  );
  const shippingCents = Math.max(
    0,
    Math.round(Number(input.shippingAmount || 0) * 100),
  );
  if (!taxableCents) {
    return {
      taxAmount: 0,
      calculationId: "",
      configured: true,
    };
  }
  const country = String(input.address.country || "US").toUpperCase();
  const postalCode = String(input.address.postal_code || "").trim();
  if (country === "US" && !/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
    throw Object.assign(new Error("TAX_ADDRESS_INCOMPLETE"), {
      provider: "stripe",
    });
  }
  const calculation = await stripeRequest<{
    id?: string;
    tax_amount_exclusive?: number;
  }>(
    "/tax/calculations",
    {
      currency: "usd",
      "customer_details[address][country]": country,
      "customer_details[address][postal_code]": postalCode,
      "customer_details[address][state]":
        String(input.address.state || "").toUpperCase(),
      "customer_details[address][city]": input.address.city || "",
      "customer_details[address][line1]": input.address.line1 || "",
      "customer_details[address_source]": "shipping",
      "line_items[0][amount]": taxableCents,
      "line_items[0][reference]": input.reference.slice(0, 80),
      "line_items[0][tax_code]": "txcd_99999999",
      ...(shippingCents
        ? { "shipping_cost[amount]": shippingCents }
        : {}),
    },
    { idempotencyKey: `tax:${input.reference}` },
  );
  return {
    taxAmount: Math.max(
      0,
      Number(calculation.tax_amount_exclusive || 0) / 100,
    ),
    calculationId: String(calculation.id || ""),
    configured: true,
  };
}

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

async function deliverOrderReceipt(
  orderId: string,
  request: Request,
  bookingId?: string | null,
) {
  const admin = getSupabaseAdmin();
  const [{ data: order }, { data: items }] = await Promise.all([
    admin
      .from("product_orders")
      .select(
        "id,public_reference,salon_id,guest_name,guest_email,fulfillment_method,subtotal,discount_amount,tax_amount,shipping_amount,total_amount,booking_id",
      )
      .eq("id", orderId)
      .single(),
    admin
      .from("product_order_items")
      .select("product_name,quantity,line_total")
      .eq("order_id", orderId)
      .order("created_at"),
  ]);
  if (!order) return;
  const { data: salon } = await admin
    .from("salons")
    .select("name,email,time_zone")
    .eq("id", order.salon_id)
    .single();
  const resolvedBookingId = bookingId || order.booking_id;
  const { data: booking } = resolvedBookingId
    ? await admin
        .from("bookings")
        .select(
          "public_reference,confirmation_code,appointment_datetime,estimated_total,deposit_amount,balance_due,styles(name)",
        )
        .eq("id", resolvedBookingId)
        .maybeSingle()
    : { data: null };
  const lines = (items || [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name)} — $${Number(item.line_total || 0).toFixed(2)}</li>`,
    )
    .join("");
  const productSummary = `<h2>Product order ${escapeHtml(order.public_reference)}</h2><p>${escapeHtml(String(order.fulfillment_method))}</p><ul>${lines}</ul><p>Subtotal: $${Number(order.subtotal || 0).toFixed(2)}<br/>Discount: -$${Number(order.discount_amount || 0).toFixed(2)}<br/>Tax: $${Number(order.tax_amount || 0).toFixed(2)}<br/>Shipping: $${Number(order.shipping_amount || 0).toFixed(2)}<br/><strong>Products paid: $${Number(order.total_amount || 0).toFixed(2)}</strong></p>`;
  const styles = booking?.styles as
    | { name?: string | null }
    | Array<{ name?: string | null }>
    | null
    | undefined;
  const serviceName = Array.isArray(styles)
    ? styles[0]?.name
    : styles?.name;
  const appointmentSummary = booking
    ? `<h2>Appointment ${escapeHtml(booking.public_reference || booking.confirmation_code)}</h2><p>${escapeHtml(serviceName || "Salon appointment")}<br/>${escapeHtml(formatZonedDateTime(booking.appointment_datetime, String(salon?.time_zone || "America/New_York")))}<br/>Appointment price: $${Number(booking.estimated_total || 0).toFixed(2)}<br/>Deposit paid now: $${Number(booking.deposit_amount || 0).toFixed(2)}<br/>Remaining at salon: $${Number(booking.balance_due || 0).toFixed(2)}</p>`
    : "";
  const summary = `<h1>Your Girlz Culture checkout is confirmed</h1><p>Hello ${escapeHtml(order.guest_name)},</p><p>${escapeHtml(salon?.name || "Your salon")} received your order${booking ? " and appointment" : ""}.</p>${productSummary}${appointmentSummary}`;
  const salonSummary = `<h1>New product order</h1><p>Order ${escapeHtml(order.public_reference)} from ${escapeHtml(order.guest_name)}.</p><ul>${lines}</ul><p><strong>Total: $${Number(order.total_amount || 0).toFixed(2)}</strong></p>`;
  const deliveries = [
    sendEmail(
      String(order.guest_email || ""),
      `Your Girlz Culture order ${String(order.public_reference || "")}`,
      summary,
      "bookings",
    ),
    salon?.email
      ? sendEmail(
          String(salon.email),
          `New product order ${String(order.public_reference || "")}`,
          salonSummary,
          "bookings",
        )
      : Promise.resolve({ skipped: true }),
  ];
  const results = await Promise.allSettled(deliveries);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) {
    await capturePlatformError({
      request,
      admin,
      error: failure.reason,
      feature: "product-commerce",
      action: "deliver-order-receipt",
      actorRole: "provider",
      salonId: String(order.salon_id),
      recordType: "product_order",
      recordId: orderId,
      provider: "transactional-notifications",
      safeMessage:
        "The order was confirmed, but one receipt could not be delivered.",
    });
  }
}

export async function completeCommerceCheckout(
  session: StripeObject,
  request: Request,
) {
  if (
    !["product_checkout", "combined_checkout"].includes(
      String(session.metadata?.type || ""),
    ) ||
    !["paid", "no_payment_required"].includes(
      String(session.payment_status || ""),
    )
  ) {
    return null;
  }
  const commerceIntentId = String(
    session.metadata?.commerce_intent_id || "",
  ).trim();
  if (!commerceIntentId) return null;
  const admin = getSupabaseAdmin();
  const { data: current, error: currentError } = await admin
    .from("commerce_checkout_intents")
    .select("id,status,order_id,booking_id,salon_id")
    .eq("id", commerceIntentId)
    .single();
  if (currentError) throw currentError;
  if (current.status === "Paid") {
    return { orderId: current.order_id, bookingId: current.booking_id };
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

  const completion = await admin.rpc("complete_combined_checkout", {
    p_commerce_intent_id: commerceIntentId,
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
    booking_id?: string;
  } | null;
  if (!result?.order_id) {
    throw new Error("COMMERCE_COMPLETION_MISSING_ORDER");
  }
  if (result.booking_id) {
    try {
      await deliverBookingNotifications(result.booking_id, {
        skipCustomerEmail: true,
      });
    } catch (error) {
      await capturePlatformError({
        request,
        admin,
        error,
        feature: "product-commerce",
        action: "deliver-combined-booking-notifications",
        actorRole: "provider",
        salonId: String(current.salon_id),
        recordType: "booking",
        recordId: result.booking_id,
        provider: "transactional-notifications",
        safeMessage:
          "The combined checkout was confirmed, but one booking notification could not be delivered.",
      });
    }
  }
  await deliverOrderReceipt(result.order_id, request, result.booking_id);
  return { orderId: result.order_id, bookingId: result.booking_id || null };
}
