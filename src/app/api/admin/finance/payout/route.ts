import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import {
  capturePlatformError,
  monitoredRouteFailure,
  rejectRequest,
} from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";
import { stripeGet, stripeRequest } from "@/lib/stripeServer";

type Row = Record<string, unknown>;
type StripeAccount = {
  id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  capabilities?: { transfers?: string };
  requirements?: {
    currently_due?: string[];
    past_due?: string[];
    disabled_reason?: string | null;
  };
};
type StripeTransfer = {
  id?: string;
  amount?: number;
  currency?: string;
  destination?: string;
  created?: number;
  reversed?: boolean;
};
type StripePaymentIntent = {
  id?: string;
  latest_charge?: string | null;
};
type StripeCheckoutSession = {
  id?: string;
  payment_intent?: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTED_ACCOUNT = /^acct_[A-Za-z0-9]+$/;
const CHARGE = /^ch_[A-Za-z0-9]+$/;
const PAYMENT_INTENT = /^pi_[A-Za-z0-9]+$/;
const CHECKOUT_SESSION = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const TRANSFER = /^tr_[A-Za-z0-9]+$/;

function accountSummary(account: StripeAccount | null) {
  const currentlyDue = account?.requirements?.currently_due || [];
  const pastDue = account?.requirements?.past_due || [];
  const transferActive = account?.capabilities?.transfers === "active";
  const ready = Boolean(
    account?.id &&
      account.details_submitted &&
      account.payouts_enabled &&
      transferActive &&
      !currentlyDue.length &&
      !pastDue.length &&
      !account.requirements?.disabled_reason,
  );
  return {
    id: account?.id || null,
    details_submitted: Boolean(account?.details_submitted),
    charges_enabled: Boolean(account?.charges_enabled),
    payouts_enabled: Boolean(account?.payouts_enabled),
    transfers_capability: account?.capabilities?.transfers || "inactive",
    currently_due: currentlyDue,
    past_due: pastDue,
    disabled_reason: account?.requirements?.disabled_reason || null,
    ready_to_receive: ready,
  };
}

function configuredStripeMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

function payoutEligibility(
  booking: Row,
  account: ReturnType<typeof accountSummary>,
  sourceChargeId: string,
) {
  const reasons: string[] = [];
  if (!/^(paid|succeeded)$/i.test(String(booking.deposit_status || ""))) {
    reasons.push("The booking deposit is not recorded as paid.");
  }
  if (!booking.payment_verified_at) {
    reasons.push("Stripe payment verification is missing.");
  }
  if (!CHARGE.test(sourceChargeId)) {
    reasons.push("The source Stripe charge is unavailable.");
  }
  if (Number(booking.net_amount_owed_salon || 0) <= 0) {
    reasons.push("No verified amount is currently owed to the salon.");
  }
  if (/pending|succeeded|refunded/i.test(String(booking.refund_status || ""))) {
    reasons.push("A refund is pending or already completed.");
  }
  if (booking.stripe_transfer_id) {
    reasons.push("This booking was already transferred to the salon.");
  }
  if (!account.id) {
    reasons.push("The salon has not connected a Stripe account.");
  } else if (!account.ready_to_receive) {
    reasons.push(
      "The connected Stripe account is not fully ready for transfers and bank payouts.",
    );
  }
  return { can_pay: reasons.length === 0, reasons };
}

async function loadBooking(
  admin: Awaited<ReturnType<typeof requireAdminPermission>>["admin"],
  bookingId: string,
) {
  const result = await admin
    .from("bookings")
    .select(
      "id,public_reference,confirmation_code,salon_id,customer_id,guest_name,guest_email,status,deposit_status,deposit_amount,refund_status,refund_amount,stripe_payment_id,stripe_checkout_session_id,stripe_charge_id,stripe_transfer_id,stripe_transfer_reversal_id,stripe_processing_fee,platform_fee,net_amount_owed_salon,payout_status,transfer_status,bank_payout_status,payment_mode,payment_verified_at,transfer_submitted_at,payout_completed_at,created_at,salon:salons(id,name,email,phone,stripe_account_id,address_city,address_state)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) rejectRequest("Booking not found.");
  return result.data as Row;
}

async function resolveSourceChargeId(booking: Row) {
  const direct = cleanText(booking.stripe_charge_id, 90);
  if (CHARGE.test(direct)) return direct;

  let paymentIntentId = cleanText(booking.stripe_payment_id, 90);
  if (!PAYMENT_INTENT.test(paymentIntentId)) {
    const checkoutId = cleanText(booking.stripe_checkout_session_id, 100);
    if (CHECKOUT_SESSION.test(checkoutId)) {
      const session = await stripeGet<StripeCheckoutSession>(
        `/checkout/sessions/${encodeURIComponent(checkoutId)}`,
      );
      paymentIntentId = cleanText(session.payment_intent, 90);
    }
  }

  if (PAYMENT_INTENT.test(paymentIntentId)) {
    const intent = await stripeGet<StripePaymentIntent>(
      `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    );
    const latestCharge = cleanText(intent.latest_charge, 90);
    if (CHARGE.test(latestCharge)) return latestCharge;
  }

  return "";
}

async function GETHandler(request: Request) {
  let monitoringAdmin;
  try {
    const { admin } = await requireAdminPermission(request, "finance");
    monitoringAdmin = admin;
    const bookingId = cleanText(
      new URL(request.url).searchParams.get("booking"),
      60,
    );
    if (!UUID.test(bookingId)) rejectRequest("Choose a valid booking transaction.");

    const booking = await loadBooking(admin, bookingId);
    const salon = booking.salon as Row | null;
    const connectedAccountId = cleanText(salon?.stripe_account_id, 80);
    let providerAccount: StripeAccount | null = null;
    let sourceChargeId = "";
    const providerWarnings: string[] = [];

    if (CONNECTED_ACCOUNT.test(connectedAccountId)) {
      try {
        providerAccount = await stripeGet<StripeAccount>(
          `/accounts/${encodeURIComponent(connectedAccountId)}`,
        );
      } catch (error) {
        const reference = await capturePlatformError({
          request,
          admin,
          error,
          feature: "finance-payouts",
          action: "load-connected-account",
          actorRole: "admin",
          salonId: String(booking.salon_id || "") || null,
          recordType: "booking",
          recordId: bookingId,
          provider: "stripe",
          safeMessage:
            "The booking is safe, but Stripe account readiness could not be checked.",
        });
        providerWarnings.push(
          `Stripe account readiness could not be checked. Reference ${reference}.`,
        );
      }
    }

    try {
      sourceChargeId = await resolveSourceChargeId(booking);
    } catch (error) {
      const reference = await capturePlatformError({
        request,
        admin,
        error,
        feature: "finance-payouts",
        action: "resolve-source-charge",
        actorRole: "admin",
        salonId: String(booking.salon_id || "") || null,
        recordType: "booking",
        recordId: bookingId,
        provider: "stripe",
        safeMessage:
          "The booking is safe, but its Stripe charge could not be verified.",
      });
      providerWarnings.push(
        `The Stripe charge could not be verified. Reference ${reference}.`,
      );
    }

    const account = accountSummary(providerAccount);
    const eligibility = payoutEligibility(booking, account, sourceChargeId);
    const attempts = await admin
      .from("salon_payout_attempts")
      .select("*")
      .eq("booking_id", bookingId)
      .order("attempt_number", { ascending: false });
    if (attempts.error) throw attempts.error;

    return Response.json(
      {
        booking,
        account,
        eligibility,
        attempts: attempts.data || [],
        source_charge_verified: CHARGE.test(sourceChargeId),
        provider_warning: providerWarnings.length
          ? providerWarnings.join(" ")
          : null,
        transfer_explanation:
          "Pay Salon releases the verified net amount to the salon's connected Stripe balance. Stripe then pays the salon's bank according to that connected account's payout schedule.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "finance-payouts",
      action: "load",
      actorRole: "admin",
      safeMessage: "The salon payout record could not be loaded.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin;
  let attemptId = "";
  let bookingId = "";
  let actorId = "";
  let stripeTransferId = "";
  try {
    const { admin, user } = await requireAdminPermission(request, "finance");
    monitoringAdmin = admin;
    actorId = user.id;
    const body = (await request.json()) as Record<string, unknown>;
    bookingId = cleanText(body.booking_id, 60);
    if (!UUID.test(bookingId)) rejectRequest("Choose a valid booking transaction.");
    if (body.confirm !== true) {
      rejectRequest(
        "Confirm that you reviewed the payout amount and connected salon account.",
      );
    }

    const booking = await loadBooking(admin, bookingId);
    const salon = booking.salon as Row | null;
    const connectedAccountId = cleanText(salon?.stripe_account_id, 80);
    if (!CONNECTED_ACCOUNT.test(connectedAccountId)) {
      rejectRequest("The salon has not connected a valid Stripe account.");
    }

    const providerMode = configuredStripeMode();
    const paymentMode = String(booking.payment_mode || "test").toLowerCase();
    if (providerMode === "unknown") {
      throw new Error("Stripe is not configured for this environment.");
    }
    if (paymentMode === "live" && providerMode !== "live") {
      rejectRequest("A live payment cannot be transferred with a Stripe test key.");
    }
    if (paymentMode !== "live" && providerMode === "live") {
      rejectRequest("A test payment cannot be transferred with a Stripe live key.");
    }

    const sourceChargeId = await resolveSourceChargeId(booking);
    const providerAccount = await stripeGet<StripeAccount>(
      `/accounts/${encodeURIComponent(connectedAccountId)}`,
    );
    const account = accountSummary(providerAccount);
    const eligibility = payoutEligibility(booking, account, sourceChargeId);
    if (!eligibility.can_pay) {
      rejectRequest(
        eligibility.reasons[0] || "This transaction is not ready for payout.",
      );
    }

    const reservation = await admin.rpc("admin_reserve_booking_payout", {
      p_actor_user_id: user.id,
      p_booking_id: bookingId,
      p_source_charge_id: sourceChargeId,
    });
    if (reservation.error || !reservation.data) {
      throw reservation.error || new Error("The payout could not be reserved.");
    }

    const reserved = reservation.data as Row;
    attemptId = String(reserved.attempt_id || "");
    const amountCents = Math.round(Number(reserved.amount || 0) * 100);
    const reservedAccountId = cleanText(reserved.connected_account_id, 80);
    const reservedChargeId = cleanText(reserved.source_charge_id, 90);
    const transferGroup = cleanText(reserved.transfer_group, 120);
    const idempotencyKey = cleanText(reserved.idempotency_key, 255);
    if (
      !attemptId ||
      amountCents <= 0 ||
      reservedAccountId !== connectedAccountId ||
      reservedChargeId !== sourceChargeId ||
      !transferGroup ||
      !idempotencyKey
    ) {
      throw new Error("The reserved payout evidence is invalid.");
    }

    const transfer = await stripeRequest<StripeTransfer>(
      "/transfers",
      {
        amount: amountCents,
        currency: String(reserved.currency || "usd"),
        destination: reservedAccountId,
        source_transaction: reservedChargeId,
        transfer_group: transferGroup,
        "metadata[booking_id]": bookingId,
        "metadata[salon_id]": String(reserved.salon_id || ""),
        "metadata[payout_attempt_id]": attemptId,
        "metadata[initiated_by_admin]": user.id,
      },
      { idempotencyKey },
    );
    if (!TRANSFER.test(String(transfer.id || ""))) {
      throw new Error("Stripe did not return a transfer confirmation.");
    }
    stripeTransferId = String(transfer.id);

    const finalized = await admin.rpc("admin_finalize_booking_payout", {
      p_actor_user_id: user.id,
      p_attempt_id: attemptId,
      p_outcome: "transferred",
      p_stripe_transfer_id: stripeTransferId,
      p_provider_status: transfer.reversed ? "reversed" : "succeeded",
      p_failure_reference: null,
      p_failure_code: null,
    });
    if (finalized.error) throw finalized.error;

    const readback = await loadBooking(admin, bookingId);
    return Response.json({
      ok: true,
      transfer: {
        id: stripeTransferId,
        amount: Number(transfer.amount || amountCents) / 100,
        currency: transfer.currency || "usd",
        destination: transfer.destination || connectedAccountId,
        created_at: transfer.created
          ? new Date(transfer.created * 1000).toISOString()
          : new Date().toISOString(),
      },
      booking: readback,
      message:
        "The verified amount was transferred to the salon's connected Stripe balance. The salon's bank payout remains governed by its Stripe payout schedule.",
    });
  } catch (error) {
    const reference = monitoringAdmin
      ? await capturePlatformError({
          request,
          admin: monitoringAdmin,
          error,
          feature: "finance-payouts",
          action: "transfer-booking-funds",
          actorRole: "admin",
          recordType: "booking",
          recordId: bookingId || null,
          provider: "stripe",
          safeMessage:
            "The salon transfer was not completed. No second transfer should be attempted until the incident is reviewed.",
        })
      : null;

    if (attemptId && monitoringAdmin && actorId) {
      try {
        await monitoringAdmin.rpc("admin_finalize_booking_payout", {
          p_actor_user_id: actorId,
          p_attempt_id: attemptId,
          p_outcome: stripeTransferId ? "uncertain" : "failed",
          p_stripe_transfer_id: stripeTransferId || null,
          p_provider_status: stripeTransferId
            ? "reconciliation_required"
            : "failed",
          p_failure_reference: reference,
          p_failure_code:
            error instanceof Error
              ? error.message.slice(0, 120)
              : "PAYOUT_FAILED",
        });
      } catch (reconciliationError) {
        console.error("Payout reconciliation persistence failed", {
          bookingId,
          attemptId,
          transferId: stripeTransferId || null,
          message:
            reconciliationError instanceof Error
              ? reconciliationError.message.slice(0, 300)
              : "Unknown reconciliation failure",
        });
      }
    }

    return Response.json(
      {
        error: stripeTransferId
          ? reference
            ? `Stripe returned transfer ${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout. Review reference ${reference}.`
            : `Stripe returned transfer ${stripeTransferId}, but the local payout record needs reconciliation. Do not create a new payout.`
          : reference
            ? `The salon transfer was not completed. Review reference ${reference} before retrying.`
            : "The salon transfer was not completed.",
        reference,
        transfer_id: stripeTransferId || null,
        reconciliation_required: Boolean(stripeTransferId),
      },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/finance/payout", "GET", {
    classification: "provider-backed",
    feature: "finance-payouts",
    actorRole: "admin",
    provider: "stripe",
    safeMessage: "The salon payout record could not be loaded.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/finance/payout", "POST", {
    classification: "provider-backed",
    feature: "finance-payouts",
    actorRole: "admin",
    provider: "stripe",
    safeMessage: "The salon transfer could not be completed.",
  }),
  POSTHandler,
);
