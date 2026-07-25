import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { deliverCancellationNotifications, requireSalonPermission } from "@/lib/supabaseAdmin";
import { getEngineList } from "@/lib/engineConfigServer";
import {
  requestBookingDepositRefund,
  safeCancellationReason,
} from "@/lib/bookingCancellation";

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceRateLimit(request, "salon-booking-cancel", 20, 10 * 60_000);
    const { id } = await context.params;
    const { admin, user, salon, teamMember } = await requireSalonPermission(request, "bookings");
    const body = await request.json() as Record<string, unknown>;
    const internalReason = cleanText(body.internal_reason || body.reason, 120);
    const internalDetail = cleanText(body.internal_detail || body.detail, 500);
    const customerReason = safeCancellationReason(body.customer_reason, "salon");
    const customerMessage = cleanText(body.customer_message, 500);
    const reasons=new Set(await getEngineList("quality.cancellation_reasons",["Customer requested cancellation","Stylist unavailable","Salon closure","Scheduling conflict","Service issue","Payment issue","Other"],40));
    if (!reasons.has(internalReason)) throw new Error("Choose an internal cancellation reason.");
    if (internalReason === "Other" && !internalDetail) throw new Error("Add a short internal explanation for Other.");
    const { data: booking, error: bookingError } = await admin.from("bookings").select("*").eq("id", id).eq("salon_id", salon.id).maybeSingle();
    if (bookingError || !booking) throw new Error("Booking not found.");
    if (teamMember?.stylist_id && booking.stylist_id !== teamMember.stylist_id) throw new Error("Stylists can only cancel their own appointments.");
    if (String(booking.status).toLowerCase() === "cancelled") return Response.json({ ok: true, booking, already_cancelled: true });
    if (["completed", "refunded"].includes(String(booking.status).toLowerCase())) throw new Error("This booking can no longer be cancelled.");

    const refund = await requestBookingDepositRefund({
      admin,
      booking,
      salonId: salon.id,
      actorUserId: user.id,
      initiatedBy: "salon",
      internalReason: [internalReason, internalDetail].filter(Boolean).join(": "),
    });

    const cancelledAt = new Date();
    const appointmentAt = new Date(String(booking.appointment_datetime));
    const noticeMinutes = Math.floor((appointmentAt.getTime() - cancelledAt.getTime()) / 60_000);
    const patch = {
      status: "Cancelled",
      cancelled_by: "salon",
      cancellation_initiated_by: "Salon",
      cancellation_reason: customerReason,
      cancellation_detail: internalDetail || null,
      cancellation_internal_reason: [internalReason, internalDetail].filter(Boolean).join(": "),
      cancellation_customer_reason: customerReason,
      cancellation_customer_message: customerMessage || null,
      cancelled_at: cancelledAt.toISOString(),
      cancellation_notice_minutes: noticeMinutes,
      refund_status: refund.refundStatus,
      refund_amount: refund.refundAmount,
      refund_funding_state: refund.fundingState,
      refund_initiated_by: "salon",
      refund_requested_at: refund.refundId ? cancelledAt.toISOString() : null,
      refund_provider_accepted_at: refund.providerAcceptedAt,
      refund_completed_at: refund.completedAt,
      stripe_refund_id: refund.refundId || null,
      stripe_transfer_reversal_id: refund.transferReversalId || null,
      deposit_status: refund.refundStatus === "Succeeded" ? "Refunded" : refund.refundStatus === "Pending" ? "Refund pending" : booking.deposit_status,
    };
    const { data: cancelled, error: updateError } = await admin.from("bookings").update(patch).eq("id", booking.id).eq("salon_id", salon.id).select("*").single();
    if (updateError) throw updateError;
    const { error: auditError } = await admin.from("salon_booking_cancellations").upsert({
      booking_id: booking.id,
      salon_id: salon.id,
      reason: internalReason,
      detail: internalDetail || null,
      notice_minutes: noticeMinutes,
      refund_amount: refund.refundAmount,
      stripe_refund_id: refund.refundId || null,
      created_by_user_id: user.id,
    }, { onConflict: "booking_id" });
    if (auditError) noteOperationalFailure("Salon cancellation audit write failed", { bookingId: booking.id, auditError });
    if (booking.customer_id) await admin.from("notifications").insert({ user_id: booking.customer_id, salon_id: salon.id, booking_id: booking.id, recipient_role:"customer",category:"bookings",severity:"warning",dedupe_key:`booking-cancelled:${booking.id}:customer`, title: "Appointment cancelled by salon", body: `${salon.name} cancelled your appointment. Reason: ${customerReason}.`, action_url: "/account?tab=past", delivery_status: "delivered" });
    await admin.from("notifications").insert({ user_id: user.id, salon_id: salon.id, booking_id: booking.id, recipient_role:"salon",category:"bookings",severity:"warning",dedupe_key:`booking-cancelled:${booking.id}:salon`, title: "Booking cancelled", body: `You cancelled this booking. Internal reason: ${internalReason}.`, action_url: `/salon/dashboard/bookings?booking=${booking.id}`, delivery_status: "delivered" });
    const notificationResult = await deliverCancellationNotifications(booking.id).catch((notificationError) => {
      noteOperationalFailure("Customer cancellation notification failed", { bookingId: booking.id, notificationError });
      return { deliveries: [], warnings: [] };
    });
    return Response.json({ ok: true, booking: cancelled, refund_status: refund.refundStatus, notifications: notificationResult.deliveries, warnings: notificationResult.warnings });
  } catch (error) {
    noteOperationalFailure("Salon booking cancellation failed", error);
    return errorResponse(error, "Unable to cancel this booking.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/salon/bookings/[id]/cancel", "POST"), POSTHandler);
