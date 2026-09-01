import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { parseOfficialPlan } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse, RateLimitError } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { siteUrl, stripeGet, stripeRequest } from "@/lib/stripeServer";
import { isSubscriptionPriceValidationError } from "@/lib/subscriptionPriceCore";
import { verifiedSubscriptionPrice } from "@/lib/subscriptionPriceServer";
import {
  capturePlatformError,
  monitoredRouteFailure,
  rejectRequest,
  safeFailure,
} from "@/lib/platformErrors";
import {
  salonCanStartSubscriptionCheckout,
  subscriptionCheckoutBlockMessage,
} from "@/lib/salonLifecycleCore";
import {
  classifySubscriptionCheckoutSession,
  hasStripeCheckoutCreationWindow,
  subscriptionCustomerIdempotencyKey,
  subscriptionSessionIdempotencyKey,
} from "@/lib/subscriptionCheckoutCore";
import type { SupabaseClient } from "@supabase/supabase-js";

type CheckoutAttempt = {
  attempt_id: string;
  requested_plan: string;
  price_id: string;
  status: "reserved" | "session_created" | "completed" | "expired" | "failed";
  expires_at: string;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  promo_redemption_id: string | null;
  promo_code: string;
  stripe_coupon_id: string;
  reused: boolean;
  request_conflict: boolean;
  provider_reconciliation_required: boolean;
};

type StripeCheckoutSession = {
  id?: string;
  url?: string | null;
  status?: string | null;
  client_reference_id?: string | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, unknown> | null;
};

function requiredText(value: unknown, field: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`SUBSCRIPTION_CHECKOUT_ATTEMPT_${field}_MISSING`);
  return text;
}

function parseAttempt(value: unknown): CheckoutAttempt {
  const row = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const status = requiredText(row.status, "STATUS") as CheckoutAttempt["status"];
  if (!["reserved", "session_created", "completed", "expired", "failed"].includes(status)) {
    throw new Error("SUBSCRIPTION_CHECKOUT_ATTEMPT_STATUS_INVALID");
  }
  const expiresAt = requiredText(row.expires_at, "EXPIRY");
  if (!Number.isFinite(new Date(expiresAt).getTime())) {
    throw new Error("SUBSCRIPTION_CHECKOUT_ATTEMPT_EXPIRY_INVALID");
  }
  return {
    attempt_id: requiredText(row.attempt_id, "ID"),
    requested_plan: requiredText(row.requested_plan, "PLAN"),
    price_id: requiredText(row.price_id, "PRICE_ID"),
    status,
    expires_at: expiresAt,
    stripe_customer_id: String(row.stripe_customer_id || "").trim() || null,
    stripe_checkout_session_id:
      String(row.stripe_checkout_session_id || "").trim() || null,
    promo_redemption_id:
      String(row.promo_redemption_id || "").trim() || null,
    promo_code: String(row.promo_code || "").trim(),
    stripe_coupon_id: String(row.stripe_coupon_id || "").trim(),
    reused: row.reused === true,
    request_conflict: row.request_conflict === true,
    provider_reconciliation_required:
      row.provider_reconciliation_required === true,
  };
}

function expectedPromoReservationError(message: string) {
  if (/PROMO_NOT_STARTED/.test(message)) return "This code is not active yet.";
  if (/PROMO_EXPIRED/.test(message)) return "This code has expired.";
  if (/PROMO_LIMIT_REACHED/.test(message)) return "This code has reached its usage limit.";
  if (/PROMO_NOT_APPLICABLE/.test(message)) return "This code cannot be used for this checkout.";
  if (/PROMO_INVALID/.test(message)) return "That promo code is not valid.";
  return "";
}

async function reserveCheckoutAttempt(
  admin: SupabaseClient,
  values: {
    salonId: string;
    actorId: string;
    plan: string;
    priceId: string;
    promoCode: string;
  },
) {
  const { data, error } = await admin.rpc(
    "reserve_subscription_checkout_attempt",
    {
      p_salon_id: values.salonId,
      p_plan: values.plan,
      p_price_id: values.priceId,
      p_promo_code: values.promoCode,
      p_user_id: values.actorId,
    },
  );
  if (error) {
    const expected = expectedPromoReservationError(error.message || "");
    if (expected) rejectRequest(expected, 409);
    throw error;
  }
  return parseAttempt(data);
}

function pendingSubscriptionValues(
  salonId: string,
  plan: string,
  customerId: string,
  priceId: string,
) {
  return {
    salon_id: salonId,
    tier: plan,
    status: "checkout_pending",
    stripe_customer_id: customerId,
    price_id: priceId,
    stripe_schedule_id: null,
    scheduled_tier: null,
    scheduled_price_id: null,
    scheduled_change_effective_at: null,
    cancel_at_period_end: false,
    cancellation_requested_at: null,
    ended_at: null,
    last_payment_failure: null,
    updated_at: new Date().toISOString(),
  };
}

function stripeObjectId(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id || "").trim();
  }
  return "";
}

async function persistPendingCheckout(
  admin: SupabaseClient,
  values: {
    attemptId?: string;
    salonId: string;
    plan: string;
    customerId: string;
    priceId: string;
    sessionId: string;
  },
) {
  const failures: unknown[] = [];
  if (values.attemptId) {
    const linkedAttempt = await admin.rpc(
      "link_subscription_checkout_attempt",
      {
        p_attempt_id: values.attemptId,
        p_stripe_customer_id: values.customerId,
        p_stripe_checkout_session_id: values.sessionId,
      },
    );
    if (linkedAttempt.error) failures.push(linkedAttempt.error);
    else if (linkedAttempt.data !== true) {
      failures.push(new Error("SUBSCRIPTION_CHECKOUT_ATTEMPT_LINK_REJECTED"));
    }
  }
  const pendingSubscription = await admin.from("subscriptions").upsert(
    pendingSubscriptionValues(
      values.salonId,
      values.plan,
      values.customerId,
      values.priceId,
    ),
    { onConflict: "salon_id" },
  );
  if (pendingSubscription.error) failures.push(pendingSubscription.error);
  return failures;
}

async function checkoutReadyResponse(values: {
  request: Request;
  admin: SupabaseClient;
  localWriteErrors: unknown[];
  sessionId: string;
  sessionUrl: string;
  actorId: string;
  salonId: string;
  reused: boolean;
}) {
  if (!values.localWriteErrors.length) {
    return Response.json(
      { url: values.sessionUrl, reused: values.reused },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  // Stripe already owns a durable Checkout Session. Do not turn this into a
  // blind retry that can create a duplicate provider session. Preserve its
  // usable URL and surface one correlated Engine reconciliation event.
  const reconciliationError = new Error(
    "SUBSCRIPTION_CHECKOUT_LOCAL_RECONCILIATION_REQUIRED",
    { cause: values.localWriteErrors[0] },
  );
  const reference = await capturePlatformError({
    request: values.request,
    admin: values.admin,
    error: reconciliationError,
    feature: "subscriptions",
    action: "link_created_checkout_session",
    actorRole: "salon-owner",
    actorId: values.actorId,
    salonId: values.salonId,
    recordType: "stripe_checkout_session",
    recordId: values.sessionId,
    provider: "supabase",
    safeMessage:
      "Stripe checkout was created, but its local subscription record needs reconciliation.",
    metadata: {
      local_write_failure_count: values.localWriteErrors.length,
      local_write_failure_codes: values.localWriteErrors.map((failure) =>
        String(
          failure && typeof failure === "object" && "code" in failure
            ? (failure as { code?: unknown }).code || "UNKNOWN"
            : "UNKNOWN",
        ).slice(0, 80),
      ),
      reused_checkout_session: values.reused,
    },
  });
  return Response.json(
    {
      url: values.sessionUrl,
      reconciliation_required: true,
      warning:
        "Checkout is ready, but the local subscription record needs reconciliation.",
      reference,
      request_id: reference,
      reused: values.reused,
    },
    {
      status: 202,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-ID": reference,
      },
    },
  );
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let salonId: string | null = null;
  let actorId: string | null = null;
  try {
    enforceRateLimit(request, "subscription-checkout", 8, 10 * 60_000);
    const { admin, user, salon, isOwner } = await requireSalonOwner(request);
    monitoringAdmin = admin;
    salonId = salon.id;
    actorId = user.id;
    if (!isOwner) rejectRequest("Only the salon owner can manage the salon subscription.", 403);
    const { data: application, error: applicationError } = await admin
      .from("salon_applications")
      .select("status")
      .eq("salon_id", salon.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!salonCanStartSubscriptionCheckout(salon, application?.status)) {
      return Response.json(
        {
          error: subscriptionCheckoutBlockMessage(salon, application?.status),
          code: "SUBSCRIPTION_REQUIRES_APPROVAL",
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const body = await request.json() as Record<string, unknown>;
    const plan = parseOfficialPlan(cleanText(body.plan, 20));
    if (!plan) rejectRequest("Choose Starter, Growth, or Premium.");
    // Fail closed before creating a customer, reserving a promotion, or
    // starting Checkout if the configured Stripe catalog drifts from ours.
    const { priceId } = await verifiedSubscriptionPrice(plan);
    const promoCode = cleanText(body.promo_code, 40);
    const { data: current, error: currentError } = await admin.from("subscriptions").select("stripe_customer_id,stripe_subscription_id,status").eq("salon_id", salon.id).maybeSingle();
    if (currentError) throw currentError;
    let terminalSubscriptionId = "";
    if (current?.stripe_subscription_id) {
      const live = await stripeGet<{ status?: string }>(`/subscriptions/${current.stripe_subscription_id}`);
      const liveStatus = String(live.status || "").toLowerCase();
      if (["active", "trialing"].includes(liveStatus)) {
        return Response.json({ error: "This salon already has an active subscription. Change the existing plan instead of starting another subscription." }, { status: 409 });
      }
      if (["past_due", "unpaid", "incomplete", "paused"].includes(liveStatus)) {
        return Response.json({ error: "The existing subscription needs billing attention. Open Manage billing instead of creating a second subscription." }, { status: 409 });
      }
      if (["canceled", "incomplete_expired"].includes(liveStatus)) {
        terminalSubscriptionId = current.stripe_subscription_id;
      }
    }
    if (terminalSubscriptionId) {
      const released = await admin.rpc(
        "release_completed_subscription_checkout_attempt",
        {
          p_salon_id: salon.id,
          p_stripe_subscription_id: terminalSubscriptionId,
        },
      );
      if (released.error) throw released.error;
    }
    let attempt = await reserveCheckoutAttempt(admin, {
      salonId: salon.id,
      actorId: user.id,
      plan,
      priceId,
      promoCode,
    });

    if (attempt.stripe_checkout_session_id) {
      const existingSession = await stripeGet<StripeCheckoutSession>(
        `/checkout/sessions/${encodeURIComponent(attempt.stripe_checkout_session_id)}`,
      );
      const existingState = classifySubscriptionCheckoutSession(
        existingSession,
        salon.id,
        attempt.requested_plan,
      );
      if (existingState === "identity_mismatch") {
        throw new Error("SUBSCRIPTION_CHECKOUT_SESSION_IDENTITY_MISMATCH");
      }
      if (existingState === "complete") {
        return Response.json(
          {
            code: "SUBSCRIPTION_CHECKOUT_FINALIZING",
            message:
              "Checkout is complete. Your subscription is being activated; refresh this page shortly.",
          },
          {
            status: 202,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
      if (existingState === "expired") {
        const expired = await admin.rpc(
          "expire_subscription_checkout_attempt",
          {
            p_attempt_id: attempt.attempt_id,
            p_stripe_checkout_session_id:
              attempt.stripe_checkout_session_id,
          },
        );
        if (expired.error) throw expired.error;
        if (expired.data !== true) {
          throw new Error("SUBSCRIPTION_CHECKOUT_ATTEMPT_EXPIRY_REJECTED");
        }
        attempt = await reserveCheckoutAttempt(admin, {
          salonId: salon.id,
          actorId: user.id,
          plan,
          priceId,
          promoCode,
        });
        if (
          attempt.stripe_checkout_session_id ||
          attempt.request_conflict
        ) {
          throw new Error("SUBSCRIPTION_CHECKOUT_ATTEMPT_ROTATION_INVALID");
        }
      } else if (existingState === "open") {
        if (attempt.request_conflict) {
          return Response.json(
            {
              error:
                "Another subscription checkout is already open for this salon. Finish it or wait for it to expire before choosing a different plan or promotion.",
              code: "SUBSCRIPTION_CHECKOUT_REQUEST_CONFLICT",
            },
            {
              status: 409,
              headers: { "Cache-Control": "private, no-store" },
            },
          );
        }
        const sessionId = requiredText(existingSession.id, "SESSION_ID");
        const sessionUrl = requiredText(existingSession.url, "SESSION_URL");
        const providerCustomerId = stripeObjectId(existingSession.customer);
        const attemptCustomerId = requiredText(
          attempt.stripe_customer_id,
          "CUSTOMER_ID",
        );
        if (
          !providerCustomerId ||
          providerCustomerId !== attemptCustomerId ||
          (current?.stripe_customer_id &&
            current.stripe_customer_id !== providerCustomerId)
        ) {
          throw new Error("SUBSCRIPTION_CHECKOUT_CUSTOMER_IDENTITY_MISMATCH");
        }
        const localWriteErrors = await persistPendingCheckout(admin, {
          salonId: salon.id,
          plan,
          customerId: providerCustomerId,
          priceId,
          sessionId,
        });
        return checkoutReadyResponse({
          request,
          admin,
          localWriteErrors,
          sessionId,
          sessionUrl,
          actorId: user.id,
          salonId: salon.id,
          reused: true,
        });
      } else {
        throw new Error("SUBSCRIPTION_CHECKOUT_SESSION_STATE_INVALID");
      }
    }

    if (attempt.request_conflict) {
      return Response.json(
        {
          error:
            "Another subscription checkout is already being prepared for this salon. Retry the original choice or wait for it to expire.",
          code: "SUBSCRIPTION_CHECKOUT_REQUEST_CONFLICT",
        },
        {
          status: 409,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    if (!hasStripeCheckoutCreationWindow(attempt.expires_at)) {
      return Response.json(
        {
          error:
            "This checkout request is too close to expiring. Wait for it to expire, then try again.",
          code: "SUBSCRIPTION_CHECKOUT_ATTEMPT_EXPIRING",
        },
        {
          status: 409,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    let customerId = String(current?.stripe_customer_id || "").trim();
    if (!customerId) {
      const customer = await stripeRequest<{ id?: string }>(
        "/customers",
        { "metadata[salon_id]": salon.id },
        { idempotencyKey: subscriptionCustomerIdempotencyKey(salon.id) },
      );
      customerId = requiredText(customer.id, "CUSTOMER_ID");
    }

    const expiresAt = Math.floor(new Date(attempt.expires_at).getTime() / 1_000);
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1_000)) {
      throw new Error("SUBSCRIPTION_CHECKOUT_ATTEMPT_ALREADY_EXPIRED");
    }
    const base = siteUrl(request);
    const session = await stripeRequest<StripeCheckoutSession>(
      "/checkout/sessions",
      {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": 1,
        success_url: `${base}/salon/dashboard/subscription?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/salon/dashboard/subscription?subscription=cancelled`,
        client_reference_id: salon.id,
        allow_promotion_codes: !attempt.promo_redemption_id,
        expires_at: expiresAt,
        "metadata[salon_id]": salon.id,
        "metadata[plan]": plan,
        "metadata[checkout_attempt_id]": attempt.attempt_id,
        "metadata[promo_redemption_id]": attempt.promo_redemption_id || "",
        "metadata[promo_code]": attempt.promo_code,
        "subscription_data[metadata][salon_id]": salon.id,
        "subscription_data[metadata][plan]": plan,
        "subscription_data[metadata][checkout_attempt_id]": attempt.attempt_id,
        ...(attempt.stripe_coupon_id
          ? { "discounts[0][coupon]": attempt.stripe_coupon_id }
          : {}),
      },
      { idempotencyKey: subscriptionSessionIdempotencyKey(attempt.attempt_id) },
    );
    const sessionId = requiredText(session.id, "SESSION_ID");
    const sessionUrl = requiredText(session.url, "SESSION_URL");
    const localWriteErrors = await persistPendingCheckout(admin, {
      attemptId: attempt.attempt_id,
      salonId: salon.id,
      plan,
      customerId,
      priceId,
      sessionId,
    });
    return checkoutReadyResponse({
      request,
      admin,
      localWriteErrors,
      sessionId,
      sessionUrl,
      actorId: user.id,
      salonId: salon.id,
      reused: attempt.reused,
    });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(error, error.message);
    if (isSubscriptionPriceValidationError(error)) {
      const reference = await capturePlatformError({
        request,
        admin: monitoringAdmin,
        error,
        feature: "subscriptions",
        action: "validate_checkout_price",
        actorRole: "salon-owner",
        actorId,
        salonId,
        provider: "stripe",
        safeMessage: "Subscription billing is temporarily unavailable.",
        metadata: { subscription_price_validation_reason: error.reason },
      });
      return safeFailure(
        "Subscription billing is temporarily unavailable.",
        reference,
        503,
        { code: error.code },
      );
    }
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "subscriptions",
      action: "start_checkout",
      actorRole: "salon-owner",
      actorId,
      salonId,
      provider: error && typeof error === "object" && (error as { provider?: unknown }).provider === "stripe"
        ? "stripe"
        : null,
      safeMessage: "We couldn't start subscription checkout.",
    });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/subscription/checkout", "POST"), POSTHandler);
