import type { SupabaseClient } from "@supabase/supabase-js";
import {
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireAdminPermission } from "@/lib/supabaseAdmin";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTED_ACCOUNT = /^acct_[A-Za-z0-9]+$/;
const CHARGE = /^ch_[A-Za-z0-9]+$/;
const PAYMENT_INTENT = /^pi_[A-Za-z0-9]+$/;
const CHECKOUT_SESSION = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

type StripeFailure = Error & {
  stripeCode?: string;
  declineCode?: string;
  httpStatus?: number;
};

type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  capabilities?: Record<string, string>;
  requirements?: {
    currently_due?: string[];
    disabled_reason?: string | null;
  };
  settings?: {
    payouts?: {
      schedule?: {
        interval?: string;
        weekly_anchor?: string;
        monthly_anchor?: number;
      };
    };
  };
};

type StripeTransfer = {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  created: number;
  reversed?: boolean;
  source_transaction?: string | null;
};

type StripeCharge = {
  id: string;
  transfer?: string | null;
  payment_intent?: string | null;
};

type StripePaymentIntent = {
  id: string;
  latest_charge?: string | null;
};

type StripeCheckoutSession = {
  id: string;
  payment_intent?: string | null;
};

function stripeSecret() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!/^sk_(?:test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY_NOT_CONFIGURED");
  }
  return key;
}

function stripeMode(key = stripeSecret()) {
  return key.startsWith("sk_live_") ? "live" : "test";
}

async function stripeGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${stripeSecret()}` },
    cache: "no-store",
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const provider = (body.error || {}) as Record<string, unknown>;
    const error = new Error(
      String(provider.message || `STRIPE_HTTP_${response.status}`),
    ) as StripeFailure;
    error.stripeCode = String(provider.code || provider.type || "stripe_error");
    error.declineCode = String(provider.decline_code || "");
    error.httpStatus = response.status;
    throw error;
  }
  return body as T;
}

async function stripePost<T>(
  path: string,
  values: Record<string, string>,
  idempotencyKey: string,
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecret()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey.slice(0, 255),
    },
    body: new URLSearchParams(values),
    cache: "no-store",
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const provider = (body.error || {}) as Record<string, unknown>;
    const error = new Error(
      String(provider.message || `STRIPE_HTTP_${response.status}`),
    ) as StripeFailure;
    error.stripeCode = String(provider.code || provider.type || "stripe_error");
    error.declineCode = String(provider.decline_code || "");
    error.httpStatus = response.status;
    throw error;
  }
  return body as T;
}

function safeFailure(error: unknown) {
  const failure = error as StripeFailure;
  const raw = error instanceof Error ? error.message : "Stripe transfer failed.";
  return {
    code: cleanText(
      failure.stripeCode || failure.declineCode || "transfer_failed",
      120,
    ),
    message: cleanText(raw, 500),
  };
}

async function bookingContext(admin: SupabaseClient, bookingId: string) {
  const bookingResult = await admin
    .from("bookings")
    .select(
      "id,salon_id,public_reference,confirmation_code,status,deposit_status,deposit_amount,refund_status,refund_amount,net_amount_owed_salon,payout_status,transfer_status,stripe_transfer_id,stripe_transfer_reversal_id,stripe_charge_id,stripe_payment_id,stripe_checkout_session_id,payment_mode,payout_processing_key,payout_requested_at,payout_completed_at,payout_failed_at,payout_failure_code,payout_failure_message,payout_connected_account_id",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingResult.error) throw bookingResult.error;
  if (!bookingResult.data) rejectRequest("Booking not found.");
  const salonResult = await admin
    .from("salons")
    .select("id,name,stripe_account_id")
    .eq("id", bookingResult.data.salon_id)
    .maybeSingle();
  if (salonResult.error) throw salonResult.error;
  if (!salonResult.data) rejectRequest("The salon linked to this booking was not found.");
  return { booking: bookingResult.data, salon: salonResult.data };
}

function payoutEligibility(
  booking: Record<string, unknown>,
  salon: Record<string, unknown>,
) {
  const deposit = Number(booking.deposit_amount || 0);
  const refund = Number(booking.refund_amount || 0);
  const net = Number(booking.net_amount_owed_salon || 0);
  const depositStatus = String(booking.deposit_status || "").toLowerCase();
  const refundStatus = String(booking.refund_status || "").toLowerCase();
  const accountId = String(salon.stripe_account_id || "");
  const reasons: string[] = [];
  if (!/paid|succeeded|complete/.test(depositStatus)) {
    reasons.push("The booking deposit has not been confirmed as paid.");
  }
  if (!(deposit > 0)) reasons.push("This booking has no collected deposit.");
  if (!(net > 0)) reasons.push("No positive amount is currently owed to the salon.");
  if (/pending|dispute|failed|requires attention/.test(refundStatus)) {
    reasons.push("A refund or dispute must be reconciled before payout.");
  }
  if (refund + 0.0001 >= deposit && deposit > 0) {
    reasons.push("The collected deposit has already been fully refunded.");
  }
  if (booking.stripe_transfer_reversal_id) {
    reasons.push("A previous transfer was reversed and requires review.");
  }
  if (!CONNECTED_ACCOUNT.test(accountId)) {
    reasons.push("The salon does not have a valid connected Stripe account.");
  }
  return {
    eligible: reasons.length === 0,
    reasons,
    amount: Math.round(net * 100) / 100,
    amountMinor: Math.round(net * 100),
    connectedAccountId: accountId,
  };
}

async function sourceChargeId(booking: Record<string, unknown>) {
  const direct = String(booking.stripe_charge_id || "");
  if (CHARGE.test(direct)) return direct;
  const paymentIntentId = String(booking.stripe_payment_id || "");
  if (PAYMENT_INTENT.test(paymentIntentId)) {
    const intent = await stripeGet<StripePaymentIntent>(
      `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
    );
    if (intent.latest_charge && CHARGE.test(intent.latest_charge)) {
      return intent.latest_charge;
    }
  }
  const checkoutId = String(booking.stripe_checkout_session_id || "");
  if (CHECKOUT_SESSION.test(checkoutId)) {
    const session = await stripeGet<StripeCheckoutSession>(
      `/checkout/sessions/${encodeURIComponent(checkoutId)}`,
    );
    if (session.payment_intent && PAYMENT_INTENT.test(session.payment_intent)) {
      const intent = await stripeGet<StripePaymentIntent>(
        `/payment_intents/${encodeURIComponent(session.payment_intent)}`,
      );
      if (intent.latest_charge && CHARGE.test(intent.latest_charge)) {
        return intent.latest_charge;
      }
    }
  }
  return "";
}

async function recordEvent(
  admin: SupabaseClient,
  values: Record<string, unknown>,
) {
  const result = await admin.from("salon_payout_events").insert(values);
  if (result.error && result.error.code !== "23505") throw result.error;
}

async function GETHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  try {
    const { admin } = await requireAdminPermission(request, "finance");
    monitoringAdmin = admin;
    const bookingId = cleanText(
      new URL(request.url).searchParams.get("booking_id"),
      60,
    );
    if (!UUID.test(bookingId)) rejectRequest("Choose a valid booking.");
    const { booking, salon } = await bookingContext(admin, bookingId);
    const eligibility = payoutEligibility(booking, salon);
    let account: StripeAccount | null = null;
    if (CONNECTED_ACCOUNT.test(eligibility.connectedAccountId)) {
      account = await stripeGet<StripeAccount>(
        `/accounts/${encodeURIComponent(eligibility.connectedAccountId)}`,
      );
      if (account.capabilities?.transfers !== "active") {
        eligibility.eligible = false;
        eligibility.reasons.push(
          "The connected account cannot receive transfers yet.",
        );
      }
    }
    return Response.json(
      {
        booking_id: booking.id,
        salon: { id: salon.id, name: salon.name },
        transfer_id: booking.stripe_transfer_id || null,
        payout_status: booking.payout_status || "Not configured",
        transfer_status: booking.transfer_status || "Not transferred",
        amount: eligibility.amount,
        currency: "usd",
        eligible: eligibility.eligible,
        reasons: eligibility.reasons,
        connected_account: account
          ? {
              id: account.id,
              transfers_enabled: account.capabilities?.transfers === "active",
              payouts_enabled: account.payouts_enabled === true,
              details_submitted: account.details_submitted === true,
              currently_due: account.requirements?.currently_due || [],
              disabled_reason: account.requirements?.disabled_reason || null,
              payout_schedule: account.settings?.payouts?.schedule || null,
            }
          : null,
        provider_mode: stripeMode(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "booking-payouts",
      action: "readiness",
      actorRole: "admin",
      safeMessage: "The salon payout readiness check could not be completed.",
    });
  }
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let bookingId = "";
  let lockKey = "";
  try {
    const { admin, user } = await requireAdminPermission(request, "finance");
    monitoringAdmin = admin;
    const body = (await request.json()) as Record<string, unknown>;
    bookingId = cleanText(body.booking_id, 60);
    if (!UUID.test(bookingId)) rejectRequest("Choose a valid booking.");

    const { booking, salon } = await bookingContext(admin, bookingId);
    if (booking.stripe_transfer_id) {
      return Response.json({
        ok: true,
        already_transferred: true,
        transfer_id: booking.stripe_transfer_id,
        payout_status: booking.payout_status,
        transfer_status: booking.transfer_status,
      });
    }

    const eligibility = payoutEligibility(booking, salon);
    if (!eligibility.eligible) rejectRequest(eligibility.reasons.join(" "));
    const keyMode = stripeMode();
    const bookingMode = String(booking.payment_mode || "test").toLowerCase();
    if (bookingMode === "live" && keyMode !== "live") {
      rejectRequest("A live payment cannot be transferred with a Stripe test key.");
    }
    if (bookingMode !== "live" && keyMode === "live") {
      rejectRequest("A test payment cannot be transferred with a Stripe live key.");
    }

    const account = await stripeGet<StripeAccount>(
      `/accounts/${encodeURIComponent(eligibility.connectedAccountId)}`,
    );
    if (account.capabilities?.transfers !== "active") {
      rejectRequest(
        "The salon's connected Stripe account cannot receive transfers yet.",
      );
    }

    const chargeId = await sourceChargeId(booking);
    if (chargeId) {
      const charge = await stripeGet<StripeCharge>(
        `/charges/${encodeURIComponent(chargeId)}`,
      );
      if (charge.transfer) {
        const reconciledAt = new Date().toISOString();
        const update = await admin
          .from("bookings")
          .update({
            stripe_transfer_id: charge.transfer,
            transfer_status: "Transferred to salon",
            payout_status: "Transferred to salon",
            payout_completed_at: reconciledAt,
            payout_connected_account_id: eligibility.connectedAccountId,
            payout_failure_code: null,
            payout_failure_message: null,
            payout_failed_at: null,
          })
          .eq("id", bookingId);
        if (update.error) throw update.error;
        await recordEvent(admin, {
          booking_id: bookingId,
          salon_id: booking.salon_id,
          event_type: "Already transferred",
          amount_minor: eligibility.amountMinor,
          currency: "usd",
          stripe_connected_account_id: eligibility.connectedAccountId,
          stripe_transfer_id: charge.transfer,
          stripe_source_transaction_id: chargeId,
          idempotency_key: `gc_booking_payout_reconcile_${bookingId}_${charge.transfer}`,
          provider_status: "succeeded",
          evidence: { source: "stripe_charge_transfer", mode: keyMode },
          acting_admin_id: user.id,
        });
        return Response.json({
          ok: true,
          already_transferred: true,
          reconciled: true,
          transfer_id: charge.transfer,
          payout_status: "Transferred to salon",
          transfer_status: "Transferred to salon",
        });
      }
    }

    lockKey = `gc_booking_payout_${bookingId}_${eligibility.amountMinor}`;
    const lock = await admin
      .from("bookings")
      .update({
        payout_status: "Processing",
        payout_requested_at: new Date().toISOString(),
        payout_processing_key: lockKey,
        payout_initiated_by: user.id,
        payout_connected_account_id: eligibility.connectedAccountId,
        payout_failure_code: null,
        payout_failure_message: null,
        payout_failed_at: null,
      })
      .eq("id", bookingId)
      .is("stripe_transfer_id", null)
      .neq("payout_status", "Processing")
      .select("id,payout_status,stripe_transfer_id")
      .maybeSingle();
    if (lock.error) throw lock.error;
    if (!lock.data) {
      const current = await bookingContext(admin, bookingId);
      if (current.booking.stripe_transfer_id) {
        return Response.json({
          ok: true,
          already_transferred: true,
          transfer_id: current.booking.stripe_transfer_id,
          payout_status: current.booking.payout_status,
          transfer_status: current.booking.transfer_status,
        });
      }
      return Response.json(
        {
          error:
            "This payout is already being processed. Refresh the transaction before trying again.",
        },
        { status: 409 },
      );
    }

    await recordEvent(admin, {
      booking_id: bookingId,
      salon_id: booking.salon_id,
      event_type: "Requested",
      amount_minor: eligibility.amountMinor,
      currency: "usd",
      stripe_connected_account_id: eligibility.connectedAccountId,
      stripe_source_transaction_id: chargeId || null,
      idempotency_key: lockKey,
      provider_status: "processing",
      evidence: {
        public_reference:
          booking.public_reference || booking.confirmation_code || null,
        mode: keyMode,
      },
      acting_admin_id: user.id,
    });

    const transferValues: Record<string, string> = {
      amount: String(eligibility.amountMinor),
      currency: "usd",
      destination: eligibility.connectedAccountId,
      description: `Girlz Culture booking ${String(
        booking.public_reference || booking.confirmation_code || bookingId,
      ).slice(0, 120)}`,
      "metadata[booking_id]": bookingId,
      "metadata[salon_id]": String(booking.salon_id),
      "metadata[public_reference]": String(
        booking.public_reference || booking.confirmation_code || "",
      ).slice(0, 120),
    };
    if (chargeId) transferValues.source_transaction = chargeId;

    const transfer = await stripePost<StripeTransfer>(
      "/transfers",
      transferValues,
      lockKey,
    );
    if (!transfer.id || transfer.amount !== eligibility.amountMinor) {
      throw new Error("STRIPE_TRANSFER_RESPONSE_INCOMPLETE");
    }

    const completedAt = new Date().toISOString();
    const saved = await admin
      .from("bookings")
      .update({
        stripe_transfer_id: transfer.id,
        transfer_status: transfer.reversed
          ? "Transfer reversed"
          : "Transferred to salon",
        payout_status: transfer.reversed
          ? "Transfer reversed"
          : "Transferred to salon",
        payout_completed_at: completedAt,
        payout_failed_at: null,
        payout_failure_code: null,
        payout_failure_message: null,
        payout_connected_account_id: eligibility.connectedAccountId,
      })
      .eq("id", bookingId)
      .eq("payout_processing_key", lockKey)
      .select(
        "id,public_reference,payout_status,transfer_status,stripe_transfer_id,payout_completed_at",
      )
      .maybeSingle();
    if (saved.error || !saved.data) {
      throw saved.error || new Error("TRANSFER_SUCCEEDED_RECONCILIATION_REQUIRED");
    }

    await recordEvent(admin, {
      booking_id: bookingId,
      salon_id: booking.salon_id,
      event_type: transfer.reversed
        ? "Transfer reversed"
        : "Transferred to salon",
      amount_minor: transfer.amount,
      currency: transfer.currency,
      stripe_connected_account_id: eligibility.connectedAccountId,
      stripe_transfer_id: transfer.id,
      stripe_source_transaction_id:
        transfer.source_transaction || chargeId || null,
      idempotency_key: lockKey,
      provider_status: transfer.reversed ? "reversed" : "succeeded",
      evidence: {
        stripe_created: transfer.created,
        mode: keyMode,
        bank_payout_status: "Managed by the connected account's Stripe schedule",
      },
      acting_admin_id: user.id,
    });

    return Response.json({
      ok: true,
      booking: saved.data,
      transfer: {
        id: transfer.id,
        amount: transfer.amount / 100,
        currency: transfer.currency,
        destination: transfer.destination,
        status: transfer.reversed ? "reversed" : "succeeded",
      },
      bank_payout:
        "Stripe will move the connected-account balance to the salon's bank according to that account's payout schedule.",
      provider_mode: keyMode,
    });
  } catch (error) {
    const failure = safeFailure(error);
    if (monitoringAdmin && bookingId && lockKey) {
      try {
        const context = await bookingContext(monitoringAdmin, bookingId);
        await monitoringAdmin
          .from("bookings")
          .update({
            payout_status: "Failed/requires attention",
            payout_failed_at: new Date().toISOString(),
            payout_failure_code: failure.code,
            payout_failure_message: failure.message,
          })
          .eq("id", bookingId)
          .eq("payout_processing_key", lockKey)
          .is("stripe_transfer_id", null);
        await recordEvent(monitoringAdmin, {
          booking_id: bookingId,
          salon_id: context.booking.salon_id,
          event_type: "Transfer failed",
          amount_minor: Math.max(
            0,
            Math.round(Number(context.booking.net_amount_owed_salon || 0) * 100),
          ),
          currency: "usd",
          stripe_connected_account_id:
            context.salon.stripe_account_id || null,
          idempotency_key: lockKey,
          provider_status: "failed",
          failure_code: failure.code,
          failure_message: failure.message,
          evidence: { retry_safe_with_same_idempotency_key: true },
          acting_admin_id: context.booking.payout_initiated_by || null,
        });
      } catch {
        // The primary monitored error still carries the booking and route context.
      }
    }
    return monitoredRouteFailure({
      request,
      admin: monitoringAdmin,
      error,
      feature: "booking-payouts",
      action: "release_to_connected_account",
      actorRole: "admin",
      recordType: "booking",
      recordId: bookingId || null,
      safeMessage:
        "The salon transfer was not completed. Review the payment, refund, connected-account, and Stripe balance evidence before retrying.",
    });
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/finance/booking-payout", "GET"),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/admin/finance/booking-payout", "POST"),
  POSTHandler,
);
