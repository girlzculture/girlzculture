import { createHash, randomUUID } from "node:crypto";
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
  getEngineNumber,
} from "@/lib/engineConfigServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

type ReservedPickup = {
  commerce_intent_id: string;
  reservation_reference: string;
  product_subtotal: number;
  product_discount: number;
  product_total: number;
  deposit_amount: number;
  remaining_balance: number;
  pickup_deadline: string;
  status?: string;
  order_id?: string | null;
};

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function expectedPickupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/PRODUCT_OUT_OF_STOCK/.test(message))
    return {
      error: "This product no longer has enough inventory for that quantity.",
      status: 409,
    };
  if (/PRODUCT_MAX_QUANTITY_EXCEEDED/.test(message))
    return {
      error: "Choose a smaller quantity for this product.",
      status: 409,
    };
  if (/PRODUCT_(UNAVAILABLE|PICKUP_UNAVAILABLE)/.test(message))
    return {
      error: "This product is no longer available for pickup.",
      status: 409,
    };
  if (/PRODUCT_PROMOTION_(UNAVAILABLE|NOT_APPLICABLE)/.test(message))
    return {
      error: "That product offer is no longer available.",
      status: 409,
    };
  if (/PRODUCT_PROMOTION_(LIMIT_REACHED|CUSTOMER_LIMIT_REACHED)/.test(message))
    return {
      error: "That product offer has reached its use limit.",
      status: 409,
    };
  if (/PRODUCT_PROMOTION_NEW_CUSTOMERS_ONLY/.test(message))
    return {
      error: "That offer is available only to new customers.",
      status: 409,
    };
  if (/COMMERCE_IDEMPOTENCY_CLOSED/.test(message))
    return {
      error: "That reservation attempt has closed. Please try again.",
      status: 409,
    };
  if (/valid email/i.test(message))
    return { error: "Enter a valid email address.", status: 400 };
  if (/valid US phone/i.test(message))
    return { error: "Enter a valid US phone number.", status: 400 };
  return null;
}

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  let intentId = "";
  try {
    enforceRateLimit(request, "pickup-reservation", 8, 10 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    rejectBot(body);
    const salonId = cleanText(body.salon_id, 50);
    const productId = cleanText(body.product_id, 50);
    const quantity = Math.floor(Number(body.quantity || 0));
    const guestName = cleanText(body.guest_name, 120);
    const guestEmail = cleanEmail(body.guest_email);
    const guestPhone = cleanUsPhone(body.guest_phone);
    if (
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(salonId) ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(productId) ||
      !guestName ||
      quantity < 1 ||
      quantity > 1000
    ) {
      return Response.json(
        { error: "Enter your contact details and choose a valid quantity." },
        { status: 400 },
      );
    }
    const promotionId = cleanText(body.product_promotion_id, 50);
    if (
      promotionId &&
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(promotionId)
    ) {
      return Response.json(
        { error: "The selected product offer is invalid." },
        { status: 400 },
      );
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
      salon.status !== "Active" ||
      salon.is_discoverable !== true ||
      !["active", "trialing"].includes(
        String(salon.subscription_status || "").toLowerCase(),
      )
    ) {
      return Response.json(
        { error: "This salon is not accepting pickup reservations." },
        { status: 409 },
      );
    }

    const managementToken = cleanText(body.management_token, 100);
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(managementToken)) {
      return Response.json(
        { error: "The reservation session is invalid. Refresh and try again." },
        { status: 400 },
      );
    }
    const [depositPercent, depositMinimum, deadlineHours] = await Promise.all([
      getEngineNumber("commerce.pickup_deposit_percent", 10, 0, 100),
      getEngineNumber("commerce.pickup_deposit_minimum", 5, 0, 1000),
      getEngineNumber("commerce.pickup_deadline_hours", 72, 1, 720),
    ]);
    const idempotencyKey =
      cleanText(body.idempotency_key, 120) || randomUUID();
    await admin.rpc("expire_stale_commerce_checkouts");
    const reservation = await admin.rpc("reserve_product_pickup_checkout", {
      p_salon_id: salonId,
      p_customer_id: authData.user?.id || null,
      p_guest_name: guestName,
      p_guest_email: guestEmail,
      p_guest_phone: guestPhone,
      p_items: [{ product_id: productId, quantity }],
      p_product_promotion_id: promotionId || null,
      p_deposit_percent: depositPercent,
      p_deposit_minimum: depositMinimum,
      p_pickup_deadline_hours: Math.round(deadlineHours),
      p_management_token_hash: hashToken(managementToken),
      p_idempotency_key: idempotencyKey,
    });
    if (reservation.error || !reservation.data) {
      const expected = expectedPickupError(reservation.error);
      if (expected) {
        return Response.json(
          { error: expected.error },
          { status: expected.status },
        );
      }
      throw reservation.error || new Error("PICKUP_RESERVATION_FAILED");
    }
    const reserved = reservation.data as ReservedPickup;
    intentId = reserved.commerce_intent_id;
    const connectedAccount = /^acct_[A-Za-z0-9]+$/.test(
      String(salon.stripe_account_id || ""),
    )
      ? String(salon.stripe_account_id)
      : "";
    const manageUrl = `${siteUrl(request)}/pickup/${encodeURIComponent(managementToken)}`;
    const session = await stripeRequest<{ id?: string; url?: string }>(
      "/checkout/sessions",
      {
        mode: "payment",
        expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": Math.round(
          Number(reserved.deposit_amount || 0) * 100,
        ),
        "line_items[0][price_data][product_data][name]":
          `${salon.name} pickup reservation deposit`,
        "line_items[0][quantity]": 1,
        customer_email: guestEmail,
        success_url: `${manageUrl}?payment=success`,
        cancel_url: `${siteUrl(request)}/salon/${salon.slug}/product/${productId}?payment=cancelled`,
        "metadata[commerce_intent_id]": intentId,
        "metadata[type]": "product_pickup_reservation",
        "metadata[salon_id]": salonId,
        "metadata[connected_account_id]": connectedAccount,
        "payment_intent_data[description]":
          `Pickup reservation ${reserved.reservation_reference} at ${salon.name}`,
        ...(connectedAccount
          ? {
              "payment_intent_data[transfer_data][destination]":
                connectedAccount,
            }
          : {}),
      },
      { idempotencyKey: `pickup-reservation:${intentId}` },
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
      reservation: {
        reference: reserved.reservation_reference,
        product_total: reserved.product_total,
        product_discount: reserved.product_discount,
        deposit_amount: reserved.deposit_amount,
        remaining_balance: reserved.remaining_balance,
        pickup_deadline: reserved.pickup_deadline,
      },
      testMode:
        !process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"),
    });
  } catch (error) {
    if (intentId) {
      await admin.rpc("release_combined_checkout", {
        p_commerce_intent_id: intentId,
        p_status: "Failed",
      });
    }
    const expected = expectedPickupError(error);
    if (expected) {
      return Response.json(
        { error: expected.error },
        { status: expected.status },
      );
    }
    const reference = await capturePlatformError({
      request,
      admin,
      error,
      feature: "pickup-reservations",
      action: "start-pickup-reservation",
      actorRole: authRole(request),
      recordType: "commerce_checkout_intent",
      recordId: intentId || null,
      provider: "stripe",
      safeMessage: "We couldn't start this pickup reservation.",
    });
    return Response.json(
      {
        error: `We couldn't start this pickup reservation. Reference ${reference}.`,
        request_id: reference,
      },
      {
        status: 500,
        headers: { "X-Request-ID": reference },
      },
    );
  }
}

function authRole(request: Request) {
  return request.headers.has("authorization") ? "customer" : "guest";
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/stripe/pickup-reservation", "POST", {
    classification: "provider-backed",
    feature: "pickup-reservations",
    actorRole: "guest-or-customer",
    provider: "stripe",
    safeMessage: "The pickup reservation could not be started.",
  }),
  POSTHandler,
);
