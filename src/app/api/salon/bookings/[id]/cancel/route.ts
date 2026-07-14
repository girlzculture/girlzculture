import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { deliverCancellationNotifications, requireSalonPermission } from "@/lib/supabaseAdmin";
import { stripeRequest } from "@/lib/stripeServer";

const reasons = new Set(["Fully booked", "Walk-in took the slot", "Stylist unavailable", "Salon closed", "Other"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    enforceRateLimit(request, "salon-booking-cancel", 20, 10 * 60_000);
    const { id } = await context.params;
    const { admin, user, salon, teamMember } = await requireSalonPermission(request, "bookings");
    const body = await request.json() as Record<string, unknown>;
    const reason = cleanText(body.reason, 80);
    const detail = cleanText(body.detail, 300);
    if (!reasons.has(reason)) throw new Error("Choose a cancellation reason.");
    if (reason === "Other" && !detail) throw new Error("Add a short explanation for Other.");
    const { data: booking, error: bookingError } = await admin.from("bookings").select("*").eq("id", id).eq("salon_id", salon.id).maybeSingle();
    if (bookingError || !booking) throw new Error("Booking not found.");
    if (teamMember?.stylist_id && booking.stylist_id !== teamMember.stylist_id) throw new Error("Stylists can only cancel their own appointments.");
    if (String(booking.status).toLowerCase() === "cancelled") return Response.json({ ok: true, booking, already_cancelled: true });
    if (["completed", "refunded"].includes(String(booking.status).toLowerCase())) throw new Error("This booking can no longer be cancelled.");

    const depositAmount = Math.max(0, Number(booking.deposit_amount || 0));
    const paymentId = cleanText(booking.stripe_payment_id, 120);
    let refundId = "";
    let refundStatus = "Not applicable";
    if (depositAmount > 0 && /paid|succeeded/i.test(String(booking.deposit_status || ""))) {
      if (!paymentId) throw new Error("This paid booking has no Stripe payment id. Contact platform support before cancelling so the customer is not left without a refund.");
      const refund = await stripeRequest<{ id: string; status?: string }>("/refunds", {
        payment_intent: paymentId,
        amount: Math.round(depositAmount * 100),
        "metadata[booking_id]": booking.id,
        "metadata[cancelled_by]": "salon",
        "metadata[cancellation_reason]": reason,
      }, { idempotencyKey: `salon-cancel-${booking.id}` });
      if (!refund.id) throw new Error("Stripe did not confirm the refund. The booking remains active.");
      refundId = refund.id;
      refundStatus = "Succeeded";
    }

    const cancelledAt = new Date();
    const appointmentAt = new Date(String(booking.appointment_datetime));
    const noticeMinutes = Math.floor((appointmentAt.getTime() - cancelledAt.getTime()) / 60_000);
    const patch = {
      status: "Cancelled",
      cancellation_initiated_by: "Salon",
      cancellation_reason: reason,
      cancellation_detail: detail || null,
      cancelled_at: cancelledAt.toISOString(),
      cancellation_notice_minutes: noticeMinutes,
      refund_status: refundStatus,
      refund_amount: refundStatus === "Succeeded" ? depositAmount : 0,
      stripe_refund_id: refundId || null,
      deposit_status: refundStatus === "Succeeded" ? "Refunded" : booking.deposit_status,
    };
    const { data: cancelled, error: updateError } = await admin.from("bookings").update(patch).eq("id", booking.id).eq("salon_id", salon.id).select("*").single();
    if (updateError) throw updateError;
    const { error: auditError } = await admin.from("salon_booking_cancellations").upsert({
      booking_id: booking.id,
      salon_id: salon.id,
      reason,
      detail: detail || null,
      notice_minutes: noticeMinutes,
      refund_amount: refundStatus === "Succeeded" ? depositAmount : 0,
      stripe_refund_id: refundId || null,
      created_by_user_id: user.id,
    }, { onConflict: "booking_id" });
    if (auditError) console.error("Salon cancellation audit write failed", { bookingId: booking.id, auditError });
    const refundMessage = refundStatus === "Succeeded" ? `Your $${depositAmount.toFixed(2)} deposit was refunded in full.` : "No deposit refund was due.";
    if (booking.customer_id) await admin.from("notifications").insert({ user_id: booking.customer_id, salon_id: salon.id, booking_id: booking.id, title: "Appointment cancelled by salon", body: `${salon.name} cancelled your appointment. Reason: ${reason}. ${refundMessage}`, action_url: "/account?tab=past", delivery_status: "delivered" });
    await admin.from("notifications").insert({ user_id: user.id, salon_id: salon.id, booking_id: booking.id, title: "Booking cancelled", body: `You cancelled this booking. Reason: ${reason}.`, action_url: `/salon/dashboard/bookings?booking=${booking.id}`, delivery_status: "delivered" });
    const notificationResult = await deliverCancellationNotifications(booking.id, reason).catch((notificationError) => {
      console.error("Customer cancellation notification failed", { bookingId: booking.id, notificationError });
      return { deliveries: [] };
    });
    return Response.json({ ok: true, booking: cancelled, refund_status: refundStatus, notifications: notificationResult.deliveries });
  } catch (error) {
    console.error("Salon booking cancellation failed", error);
    return errorResponse(error, "Unable to cancel this booking.");
  }
}
