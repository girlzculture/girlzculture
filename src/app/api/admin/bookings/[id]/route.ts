import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import {
  formatZonedDateTime,
  salonTimeZone,
  zonedLocalToUtc,
} from "@/lib/dateTime";
import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { deliverCancellationNotifications, requireAdminPermission, sendEmail, sendSms } from "@/lib/supabaseAdmin";
import { createCustomerApprovedReschedule } from "@/lib/bookingRescheduleServer";
import {
  requestBookingDepositRefund,
  safeCancellationReason,
} from "@/lib/bookingCancellation";

async function contextFor(request: Request, id: string) {
  const context = await requireAdminPermission(request, "bookings");
  const { data: booking, error } = await context.admin.from("bookings").select("*").eq("id", id).single();
  if (error || !booking) throw new Error("Booking not found.");
  const [{ data: salon }, { data: styles }, { data: stylists }, { data: audit }] = await Promise.all([
    context.admin.from("salons").select("id,name,time_zone,email,phone,user_id").eq("id", booking.salon_id).single(),
    context.admin.from("styles").select("id,name,duration_min_hours,buffer_minutes").eq("salon_id", booking.salon_id).order("name"),
    context.admin.from("stylists").select("id,name").eq("salon_id", booking.salon_id).eq("is_active", true).order("name"),
    context.admin.from("booking_audit_log").select("id,action,reason,actor_role,created_at").eq("booking_id", id).order("created_at", { ascending: false }).limit(25),
  ]);
  if (!salon) throw new Error("Booking salon not found.");
  return { ...context, booking, salon, styles: styles || [], stylists: stylists || [], audit: audit || [] };
}

async function GETHandler(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const { id } = await route.params; const { booking, salon, styles, stylists, audit, adminUser } = await contextFor(request, id); return Response.json({ booking, salon, styles, stylists, audit, admin_time_zone: String((adminUser as {time_zone?:string}).time_zone || "America/New_York") }); }
  catch (error) { return errorResponse(error, "Unable to load booking."); }
}

async function PATCHHandler(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await route.params; const ctx = await contextFor(request, id); const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30); const reason = cleanText(body.reason, 500);
    if (!reason) throw new Error("Add a reason for the audit trail and customer notification.");
    if (action === "cancel") return await cancelBooking(ctx, {
      internalReason: reason,
      customerReason: safeCancellationReason(body.customer_reason, "admin"),
      customerMessage: cleanText(body.customer_message, 500),
    });
    if (action === "correct_service_state") {
      const targetStatus=cleanText(body.status,30);
      if(!["Confirmed","Ready","In Progress","Completed","Cancelled"].includes(targetStatus))throw new Error("Choose a valid corrected service state.");
      const {data:corrected,error:correctionError}=await ctx.admin.rpc("transition_booking_service",{
        p_booking_id:ctx.booking.id,
        p_salon_id:ctx.salon.id,
        p_actor_user_id:ctx.user.id,
        p_actor_role:`Platform admin: ${String((ctx.adminUser as {role?:string}).role||"Admin")}`,
        p_action:"admin_correct",
        p_reason:reason,
        p_target_status:targetStatus,
      });
      if(correctionError)throw correctionError;
      return Response.json({booking:corrected});
    }
    if (action === "propose_reschedule") {
      const result=await createCustomerApprovedReschedule({
        admin:ctx.admin,
        request,
        booking:ctx.booking,
        salon:ctx.salon,
        actorUserId:ctx.user.id,
        actorRole:String((ctx.adminUser as {role?:string}).role||"Platform admin"),
        reason,
        message:body.message,
        localOptions:body.options,
        rootUrl:(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,""),
      });
      return Response.json({booking:ctx.booking,...result});
    }
    const patch: Record<string, unknown> = {};
    if (body.guest_name !== undefined) patch.guest_name = cleanText(body.guest_name, 120);
    if (body.guest_email !== undefined) patch.guest_email = cleanEmail(body.guest_email);
    if (body.guest_phone !== undefined) patch.guest_phone = cleanUsPhone(body.guest_phone, true);
    if (body.stylist_id !== undefined) { const stylistId = cleanText(body.stylist_id, 50) || null; if (stylistId && !ctx.stylists.some((stylist) => stylist.id === stylistId)) throw new Error("Choose a stylist from this salon."); patch.stylist_id = stylistId; }
    let auditAction = "modified";
    if (body.appointment_local) {
      const local = cleanText(body.appointment_local, 20); const [date, time] = local.split("T"); if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) throw new Error("Choose a valid appointment date and time.");
      const styleId = cleanText(body.style_id, 50) || ctx.booking.style_id; const stylistId = String(patch.stylist_id ?? ctx.booking.stylist_id ?? "") || null;
      const availability = await bookingAvailability({ salonId: ctx.booking.salon_id, styleId, stylistId, customerId: ctx.booking.customer_id, guestEmail: String(patch.guest_email || ctx.booking.guest_email || ""), date, excludeBookingId: ctx.booking.id });
      const slot = availability.slots.find((candidate) => candidate.value === time && (!stylistId || candidate.stylistId === stylistId)); if (!slot) throw new Error(availability.reason || "That time is no longer available.");
      const style = ctx.styles.find((candidate) => candidate.id === styleId); const start = zonedLocalToUtc(`${date}T${time}`, salonTimeZone(ctx.salon.time_zone)); const minutes = Math.round(Number(style?.duration_min_hours || ctx.booking.duration_hours || 1) * 60) + Number(style?.buffer_minutes || 0);
      patch.appointment_datetime = start.toISOString(); patch.blocked_until = new Date(start.getTime() + minutes * 60_000).toISOString(); patch.style_id = styleId; patch.duration_hours = Number(style?.duration_min_hours || ctx.booking.duration_hours || 1); auditAction = "rescheduled";
    }
    if (!Object.keys(patch).length) throw new Error("No booking changes were submitted.");
    const { data: updated, error } = await ctx.admin.from("bookings").update(patch).eq("id", id).select("*").single(); if (error) throw error;
    await ctx.admin.from("booking_audit_log").insert({ booking_id: id, actor_user_id: ctx.user.id, actor_role: String((ctx.adminUser as { role?: string }).role || "Admin"), action: auditAction, reason: `Admin intervention: ${reason}`, before_data: ctx.booking, after_data: updated });
    const when = formatZonedDateTime(
      updated.appointment_datetime,
      salonTimeZone(ctx.salon.time_zone),
    );
    const text = `Girlz Culture updated your booking at ${ctx.salon.name} to ${when}. Reason: ${reason}`;
    const salonText = `Girlz Culture updated ${String(updated.guest_name || "a customer's")} booking to ${when}. Reason: ${reason}`;
    await Promise.all([
      sendEmail(String(updated.guest_email || ""), "Your Girlz Culture booking was updated", `<p>${text}</p>`, "bookings"),
      sendSms(String(updated.guest_phone || ""), text),
      sendEmail(String(ctx.salon.email || ""), "A Girlz Culture booking was updated", `<p>${salonText}</p>`, "bookings"),
      sendSms(String(ctx.salon.phone || ""), salonText),
    ]);
    const inApp = [{ user_id: ctx.salon.user_id, salon_id: ctx.salon.id, booking_id: updated.id, title: "Booking updated by platform support", body: salonText, action_url: `/salon/dashboard/bookings?booking=${updated.id}`, delivery_status: "delivered" }];
    if (updated.customer_id) inApp.push({ user_id: updated.customer_id, salon_id: ctx.salon.id, booking_id: updated.id, title: "Your booking was updated", body: text, action_url: "/account?tab=upcoming", delivery_status: "delivered" });
    await ctx.admin.from("notifications").insert(inApp);
    return Response.json({ booking: updated });
  } catch (error) { noteOperationalFailure("Admin booking update failed", error); return errorResponse(error, "Unable to update booking."); }
}

async function cancelBooking(
  ctx: Awaited<ReturnType<typeof contextFor>>,
  input: {
    internalReason: string;
    customerReason: string;
    customerMessage: string;
  },
) {
  const booking = ctx.booking; if (["cancelled","canceled"].includes(String(booking.status).toLowerCase())) return Response.json({ booking, already_cancelled: true });
  const now=new Date().toISOString();
  const refund=await requestBookingDepositRefund({
    admin:ctx.admin,
    booking,
    salonId:ctx.salon.id,
    actorUserId:ctx.user.id,
    initiatedBy:"platform",
    internalReason:input.internalReason,
  });
  const patch = {
    status: "Cancelled",
    cancelled_by:"admin",
    cancellation_initiated_by: "Admin",
    cancellation_reason:input.customerReason,
    cancellation_internal_reason:input.internalReason,
    cancellation_customer_reason:input.customerReason,
    cancellation_customer_message:input.customerMessage||null,
    cancelled_at:now,
    refund_status:refund.refundStatus,
    refund_amount:refund.refundAmount,
    refund_funding_state:refund.fundingState,
    refund_eligibility_status:"Eligible - platform cancellation",
    refund_policy_outcome:"Full deposit refund requested",
    refund_initiated_by:"platform",
    refund_requested_at:refund.refundId?now:null,
    refund_provider_accepted_at:refund.providerAcceptedAt,
    refund_completed_at:refund.completedAt,
    stripe_refund_id:refund.refundId||null,
    stripe_transfer_reversal_id:refund.transferReversalId||null,
    transfer_status:refund.transferStatus,
    payout_status:refund.payoutStatus,
    net_amount_owed_salon:refund.netAmountOwedSalon,
    deposit_status:refund.refundStatus==="Succeeded"?"Refunded":refund.refundStatus==="Pending"?"Refund pending":booking.deposit_status,
  };
  const { data: cancelled, error } = await ctx.admin.from("bookings").update(patch).eq("id", booking.id).select("*").single(); if (error) throw error;
  await ctx.admin.from("booking_audit_log").insert({ booking_id: booking.id, actor_user_id: ctx.user.id, actor_role: String((ctx.adminUser as { role?: string }).role || "Admin"), action: "cancelled", reason:input.internalReason, before_data: booking, after_data: cancelled });
  if (refund.refundId) await ctx.admin.from("booking_audit_log").insert({ booking_id: booking.id, actor_user_id: ctx.user.id, actor_role: String((ctx.adminUser as { role?: string }).role || "Admin"), action: "refunded", reason: `Stripe refund ${refund.refundStatus.toLowerCase()} after provider acceptance. Internal reason: ${input.internalReason}`, before_data: booking, after_data: cancelled });
  const customerMessage = `Your booking at ${ctx.salon.name} was cancelled. Reason: ${input.customerReason}.`;
  const salonMessage = `${String(booking.guest_name || "A customer's")} booking was cancelled by platform support. Internal reason: ${input.internalReason}.`;
  const inApp = [{ user_id: ctx.salon.user_id, salon_id: ctx.salon.id, booking_id: booking.id, title: "Booking cancelled by platform support", body: salonMessage, action_url: `/salon/dashboard/bookings?booking=${booking.id}`, delivery_status: "delivered" }];
  if (booking.customer_id) inApp.push({ user_id: booking.customer_id, salon_id: ctx.salon.id, booking_id: booking.id, title: "Your booking was cancelled", body: customerMessage, action_url: "/account?tab=past", delivery_status: "delivered" });
  await ctx.admin.from("notifications").insert(inApp);
  const notificationResult=await deliverCancellationNotifications(booking.id);
  return Response.json({ booking: cancelled, refund_status:refund.refundStatus, warnings:notificationResult.warnings });
}
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/bookings/[id]", "GET"), GETHandler);
export const PATCH = withOperationalMonitoring(routeMonitoringProfile("/api/admin/bookings/[id]", "PATCH"), PATCHHandler);
