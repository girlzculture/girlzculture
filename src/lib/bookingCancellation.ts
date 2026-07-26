import { cleanText } from "@/lib/requestSecurity";
import { stripeRequest } from "@/lib/stripeServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noteOperationalFailure } from "@/lib/operationalMonitoring";
export {
  cancellationActorLabel,
  CUSTOMER_SAFE_CANCELLATION_REASONS,
  refundCustomerSummary,
  safeCancellationReason,
  type CancellationActor,
} from "@/lib/bookingCancellationCore";

export async function requestBookingDepositRefund(input: {
  admin: SupabaseClient;
  booking: Record<string, unknown>;
  salonId: string;
  actorUserId: string | null;
  initiatedBy: "salon" | "platform" | "customer" | "system";
  internalReason: string;
}) {
  const amount = Math.max(0, Number(input.booking.deposit_amount || 0));
  const paid = /paid|succeeded|complete/i.test(
    String(input.booking.deposit_status || ""),
  );
  if (!paid || amount <= 0) {
    return {
      refundStatus: "Not applicable",
      refundAmount: 0,
      fundingState: String(
        input.booking.refund_funding_state || "Platform-held funds",
      ),
      refundId: "",
      transferReversalId: "",
      transferStatus: "Not transferred",
      payoutStatus: "Not required",
      netAmountOwedSalon: 0,
      recoveryBalanceId: "",
      providerAcceptedAt: null,
      completedAt: null,
    };
  }

  const paymentIntentId = cleanText(input.booking.stripe_payment_id, 160);
  if (!paymentIntentId) {
    throw new Error("PAID_BOOKING_PAYMENT_REFERENCE_MISSING");
  }
  const transferId = cleanText(input.booking.stripe_transfer_id, 160);
  const fundingStateBefore = transferId
    ? "Transferred to salon"
    : String(input.booking.refund_funding_state || "Platform-held funds");
  const { data: operation, error: operationError } = await input.admin
    .from("booking_refund_operations")
    .insert({
      booking_id: input.booking.id,
      salon_id: input.salonId,
      initiated_by_user_id: input.actorUserId,
      initiated_by_role: input.initiatedBy,
      amount,
      funding_state_before: fundingStateBefore,
      stripe_payment_intent_id: paymentIntentId,
      stripe_transfer_id: transferId || null,
      internal_reason: cleanText(input.internalReason, 500) || null,
    })
    .select("id")
    .single();
  if (operationError || !operation) {
    throw operationError || new Error("REFUND_AUDIT_CREATE_FAILED");
  }

  let transferReversalId = "";
  let transferStatus = transferId ? "Reversal pending" : "Not transferred";
  let recoveryBalanceId = "";
  try {
    if (transferId) {
      try {
        const reversal = await stripeRequest<{ id?: string }>(
          `/transfers/${encodeURIComponent(transferId)}/reversals`,
          {
            amount: Math.round(amount * 100),
            "metadata[booking_id]": String(input.booking.id),
            "metadata[refund_operation_id]": String(operation.id),
          },
          { idempotencyKey: `booking-transfer-reversal-${input.booking.id}` },
        );
        if (!reversal.id)
          throw new Error("STRIPE_TRANSFER_REVERSAL_NOT_ACCEPTED");
        transferReversalId = reversal.id;
      } catch (reversalError) {
        noteOperationalFailure("Stripe transfer reversal needs recovery", reversalError);
        const { data: recovery, error: recoveryError } = await input.admin
          .from("salon_recovery_balances")
          .upsert(
            {
              salon_id: input.salonId,
              booking_id: input.booking.id,
              amount,
              currency: "usd",
              status: "Recoverable from future payout",
              reason: "Refund issued after transferred funds could not be reversed immediately.",
              stripe_transfer_id: transferId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "booking_id" },
          )
          .select("id")
          .single();
        if (recoveryError || !recovery)
          throw recoveryError || new Error("RECOVERY_BALANCE_CREATE_FAILED");
        recoveryBalanceId = String(recovery.id);
        transferStatus = "Recoverable from future payout";
      }
    }

    const refund = await stripeRequest<{ id?: string; status?: string }>(
      "/refunds",
      {
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100),
        "metadata[booking_id]": String(input.booking.id),
        "metadata[salon_id]": input.salonId,
        "metadata[refund_operation_id]": String(operation.id),
        "metadata[initiated_by]": input.initiatedBy,
      },
      { idempotencyKey: `booking-deposit-refund-${input.booking.id}` },
    );
    if (!refund.id) throw new Error("STRIPE_REFUND_NOT_ACCEPTED");
    const acceptedAt = new Date().toISOString();
    // Provider acceptance is not final accounting evidence. Stripe webhooks
    // promote this operation to Succeeded/Failed idempotently.
    const status = "Pending";
    const completedAt = null;
    const fundingState = "Platform-held funds";
    const update = await input.admin
      .from("booking_refund_operations")
      .update({
        operation_status: "Provider accepted",
        stripe_transfer_reversal_id: transferReversalId || null,
        stripe_refund_id: refund.id,
        provider_status: refund.status || "pending",
        provider_accepted_at: acceptedAt,
        completed_at: completedAt,
        updated_at: acceptedAt,
      })
      .eq("id", operation.id);
    if (update.error) throw update.error;
    const payoutStatus =
      recoveryBalanceId
          ? "Recoverable from future payout"
          : transferId
            ? "Transfer reversal pending"
            : "Refund pending";
    return {
      refundStatus: status,
      refundAmount: amount,
      fundingState,
      refundId: refund.id,
      transferReversalId,
      transferStatus,
      payoutStatus,
      netAmountOwedSalon: 0,
      recoveryBalanceId,
      providerAcceptedAt: acceptedAt,
      completedAt,
    };
  } catch (error) {
    noteOperationalFailure("Stripe booking refund failed", error);
    await input.admin
      .from("booking_refund_operations")
      .update({
        operation_status: "Failed",
        stripe_transfer_reversal_id: transferReversalId || null,
        safe_failure_code: "PROVIDER_REFUND_FAILED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", operation.id);
    return {
      refundStatus: "Failed",
      refundAmount: 0,
      fundingState: transferId ? "Transferred to salon" : "Failed",
      refundId: "",
      transferReversalId,
      transferStatus,
      payoutStatus: "Failed/requires attention",
      netAmountOwedSalon: 0,
      recoveryBalanceId,
      providerAcceptedAt: null,
      completedAt: null,
    };
  }
}
