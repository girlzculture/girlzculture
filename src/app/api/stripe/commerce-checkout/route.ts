import { randomUUID } from "node:crypto";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import {
  cleanEmail,
  cleanText,
  cleanUsPhone,
  enforceRateLimit,
  rejectBot,
} from "@/lib/requestSecurity";
import {
  completeCommerceCheckout,
  estimateStripeCommerceTax,
} from "@/lib/commerceCheckoutServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

type CartItem = { product_id: string; quantity: number };
type Reservation = {
  commerce_intent_id: string;
  product_subtotal: number;
  product_discount: number;
  tax_amount: number;
  shipping_amount: number;
  product_total: number;
  total_charged: number;
  status?: string;
  order_id?: string | null;
};

function expectedCommerceError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/PRODUCT_OUT_OF_STOCK/.test(message))
    return { message: "One of these products no longer has enough stock.", status: 409 };
  if (/PRODUCT_MAX_QUANTITY_EXCEEDED/.test(message))
    return { message: "Your cart exceeds this salon's per-order quantity limit.", status: 409 };
  if (/PRODUCT_(UNAVAILABLE|PICKUP_UNAVAILABLE|SHIPPING_UNAVAILABLE)/.test(message))
    return { message: "One of these products is no longer available for the selected fulfillment method.", status: 409 };
  if (/PRODUCT_PROMOTION_(UNAVAILABLE|NOT_APPLICABLE)/.test(message))
    return { message: "This product offer is no longer available for the selected cart.", status: 409 };
  if (/PRODUCT_PROMOTION_(LIMIT_REACHED|CUSTOMER_LIMIT_REACHED)/.test(message))
    return { message: "This product offer has reached its redemption limit.", status: 409 };
  if (/PRODUCT_PROMOTION_NEW_CUSTOMERS_ONLY/.test(message))
    return { message: "This product offer is available to new customers only.", status: 409 };
  if (/CART_EMPTY|Your cart is empty/.test(message))
    return { message: "Your cart is empty.", status: 400 };
  if (/COMMERCE_IDEMPOTENCY_CLOSED/.test(message))
    return { message: "That checkout attempt is closed. Please try again.", status: 409 };
  if (/FULFILLMENT_METHOD_INVALID/.test(message))
    return { message: "Choose pickup or shipping.", status: 400 };
  if (/Enter your contact details/.test(message))
    return { message: "Enter your contact details.", status: 400 };
  if (/valid email/i.test(message))
    return { message: "Enter a valid email address.", status: 400 };
  if (/valid US phone/i.test(message))
    return { message: "Enter a valid US phone number.", status: 400 };
  if (/complete US shipping address/.test(message))
    return { message: "Enter a complete US shipping address.", status: 400 };
  return null;
}

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  let intentId = "";
  try {
    enforceRateLimit(request, "commerce-checkout", 8, 10 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    rejectBot(body);
    const salonId = cleanText(body.salon_id, 50);
    const guestName = cleanText(body.guest_name, 120);
    const guestEmail = cleanEmail(body.guest_email);
    const guestPhone = cleanUsPhone(body.guest_phone, false);
    if (!salonId || !guestName) throw new Error("Enter your contact details.");
    const fulfillment =
      body.fulfillment_method === "Shipping" ? "Shipping" : "Pickup";
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items: CartItem[] = rawItems
      .slice(0, 25)
      .map((item) => {
        const row =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        return {
          product_id: cleanText(row.product_id, 50),
          quantity: Math.floor(Number(row.quantity || 0)),
        };
      })
      .filter(
        (item) =>
          /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(item.product_id) &&
          item.quantity > 0 &&
          item.quantity <= 1000,
      );
    if (!items.length) throw new Error("Your cart is empty.");
    const shippingRaw =
      body.shipping_address &&
      typeof body.shipping_address === "object" &&
      !Array.isArray(body.shipping_address)
        ? (body.shipping_address as Record<string, unknown>)
        : {};
    const shippingAddress =
      fulfillment === "Shipping"
        ? {
            line1: cleanText(shippingRaw.line1, 160),
            line2: cleanText(shippingRaw.line2, 160),
            city: cleanText(shippingRaw.city, 100),
            state: cleanText(shippingRaw.state, 2).toUpperCase(),
            postal_code: cleanText(shippingRaw.postal_code, 10),
            country: "US",
          }
        : {};
    if (
      fulfillment === "Shipping" &&
      (!shippingAddress.line1 ||
        !shippingAddress.city ||
        !/^[A-Z]{2}$/.test(shippingAddress.state) ||
        !/^\d{5}(?:-\d{4})?$/.test(shippingAddress.postal_code))
    ) {
      throw new Error("Enter a complete US shipping address.");
    }
    const token = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    const { data: authData } = token
      ? await admin.auth.getUser(token)
      : { data: { user: null } };
    const { data: salon, error: salonError } = await admin
      .from("salons")
      .select(
        "id,name,slug,status,is_discoverable,subscription_status,stripe_account_id,address_street,address_city,address_state,address_zip",
      )
      .eq("id", salonId)
      .single();
    if (salonError) throw salonError;
    if (
      !salon ||
      salon.status !== "Active" ||
      salon.is_discoverable !== true ||
      !["active", "trialing"].includes(
        String(salon.subscription_status || "").toLowerCase(),
      )
    ) {
      return Response.json(
        { error: "This salon is not accepting online product orders." },
        { status: 409 },
      );
    }
    const idempotencyKey =
      cleanText(body.idempotency_key, 120) || randomUUID();
    const productPromotionId = cleanText(
      body.product_promotion_id,
      50,
    );
    if (
      productPromotionId &&
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(productPromotionId)
    ) {
      return Response.json(
        { error: "The selected product offer is invalid." },
        { status: 400 },
      );
    }
    await admin.rpc("expire_stale_commerce_checkouts");
    const reservation = await admin.rpc("reserve_combined_checkout", {
      p_salon_id: salonId,
      p_customer_id: authData.user?.id || null,
      p_guest_name: guestName,
      p_guest_email: guestEmail,
      p_guest_phone: guestPhone || null,
      p_fulfillment_method: fulfillment,
      p_shipping_address: shippingAddress,
      p_items: items,
      p_booking: null,
      p_product_promotion_id: productPromotionId || null,
      p_tax_amount: 0,
      p_idempotency_key: idempotencyKey,
    });
    if (reservation.error || !reservation.data) {
      const expected = expectedCommerceError(reservation.error);
      if (expected)
        return Response.json(
          { error: expected.message },
          { status: expected.status },
        );
      throw reservation.error || new Error("COMMERCE_RESERVATION_FAILED");
    }
    let reserved = reservation.data as Reservation;
    intentId = reserved.commerce_intent_id;
    if (reserved.status === "Paid" && reserved.order_id) {
      const { data: order } = await admin
        .from("product_orders")
        .select(
          "public_reference,payment_status,fulfillment_status,total_amount,fulfillment_method",
        )
        .eq("id", reserved.order_id)
        .single();
      return Response.json({
        order_id: reserved.order_id,
        order,
        noPaymentRequired: true,
        alreadyCompleted: true,
        testMode: true,
      });
    }
    const tax = await estimateStripeCommerceTax({
      taxableAmount: Math.max(
        0,
        Number(reserved.product_subtotal || 0) -
          Number(reserved.product_discount || 0),
      ),
      shippingAmount: Number(reserved.shipping_amount || 0),
      address:
        fulfillment === "Shipping"
          ? shippingAddress
          : {
              line1: String(salon.address_street || ""),
              city: String(salon.address_city || ""),
              state: String(salon.address_state || ""),
              postal_code: String(salon.address_zip || ""),
              country: "US",
            },
      reference: intentId,
    });
    const taxUpdate = await admin.rpc("apply_commerce_checkout_tax", {
      p_commerce_intent_id: intentId,
      p_tax_amount: tax.taxAmount,
      p_stripe_tax_calculation_id: tax.calculationId || null,
    });
    if (taxUpdate.error || !taxUpdate.data)
      throw taxUpdate.error || new Error("COMMERCE_TAX_UPDATE_FAILED");
    reserved = taxUpdate.data as Reservation;
    if (Number(reserved.total_charged) <= 0) {
      const completion = await completeCommerceCheckout(
        {
          id: `no_payment_required:${intentId}`,
          payment_status: "no_payment_required",
          livemode: false,
          metadata: {
            type: "product_checkout",
            commerce_intent_id: intentId,
            salon_id: salonId,
          },
        },
        request,
      );
      const { data: order } = completion?.orderId
        ? await admin
            .from("product_orders")
            .select(
              "public_reference,payment_status,fulfillment_status,total_amount,fulfillment_method",
            )
            .eq("id", completion.orderId)
            .single()
        : { data: null };
      return Response.json({
        order_id: completion?.orderId,
        order,
        noPaymentRequired: true,
        testMode: true,
      });
    }
    const connectedAccount = /^acct_[A-Za-z0-9]+$/.test(
      String(salon.stripe_account_id || ""),
    )
      ? String(salon.stripe_account_id)
      : "";
    const values: Record<
      string,
      string | number | boolean | null | undefined
    > = {
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": Math.round(
        Number(reserved.total_charged) * 100,
      ),
      "line_items[0][price_data][product_data][name]":
        `${salon.name} product order`,
      "line_items[0][quantity]": 1,
      customer_email: guestEmail,
      success_url: `${siteUrl(request)}/salon/${salon.slug}/checkout?commerce_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl(request)}/salon/${salon.slug}/checkout?payment=cancelled`,
      "metadata[commerce_intent_id]": intentId,
      "metadata[type]": "product_checkout",
      "metadata[salon_id]": salonId,
      "metadata[connected_account_id]": connectedAccount,
      "payment_intent_data[description]": `Product order from ${salon.name}`,
      ...(connectedAccount
        ? {
            "payment_intent_data[transfer_data][destination]":
              connectedAccount,
          }
        : {}),
    };
    const session = await stripeRequest<{ id: string; url: string }>(
      "/checkout/sessions",
      values,
      { idempotencyKey: `commerce:${intentId}` },
    );
    if (!session.id || !session.url)
      throw new Error("STRIPE_CHECKOUT_SESSION_MISSING");
    const saved = await admin
      .from("commerce_checkout_intents")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", intentId)
      .eq("status", "Pending");
    if (saved.error) throw saved.error;
    return Response.json({
      url: session.url,
      totals: reserved,
      testMode: true,
    });
  } catch (error) {
    if (intentId)
      await admin.rpc("release_combined_checkout", {
        p_commerce_intent_id: intentId,
        p_status: "Failed",
      });
    const expected = expectedCommerceError(error);
    if (expected)
      return Response.json(
        { error: expected.message },
        { status: expected.status },
      );
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "product-commerce",
      action: "start-product-checkout",
      actorRole: "customer",
      recordType: "commerce_checkout_intent",
      recordId: intentId || null,
      provider: "stripe",
      safeMessage: "We couldn't start secure product checkout.",
    });
    return Response.json(
      {
        error: `We couldn't start secure product checkout. Reference ${reference}.`,
        request_id: reference,
      },
      { status: 500 },
    );
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/stripe/commerce-checkout", "POST", {
    classification: "provider-backed",
    feature: "product-commerce",
    actorRole: "customer",
    provider: "stripe",
    safeMessage: "Secure product checkout could not be started.",
  }),
  POSTHandler,
);
