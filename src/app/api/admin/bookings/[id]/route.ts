import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { cleanEmail, cleanText, cleanUsPhone, errorResponse } from "@/lib/requestSecurity";
import { deliverCancellationNotifications, requireAdminPermission, sendEmail, sendSms } from "@/lib/supabaseAdmin";
import { stripeRequest } from "@/lib/stripeServer";

async function contextFor(request: Request, id: string) {
  const context = await requireAdminPermission(request, "bookings");
  const { data: booking, error } = await context.admin.from("bookings").select("*").eq("id", id).single();
  if (error || !booking) throw new Error("Booking not found.");
  const [{ data: salon }, { data: styles }, { data: stylists }, { data: audit }] = await Promise.all([
    context.admin.from("salons").select("id,name,time_zone,email,phone").eq("id", booking.salon_id).single(),
    context.admin.from("styles").select("id,name,duration_min_hours,buffer_minutes").eq("salon_id", booking.salon_id).order("name"),
    context.admin.from("stylists").select("id,name").eq("salon_id", booking.salon_id).eq("is_active", true).order("name"),
    context.admin.from("booking_audit_log").select("id,action,reason,actor_role,created_at").eq("booking_id", id).order("created_at", { ascending: false }).limit(25),
  ]);
  if (!salon) throw new Error("Booking salon not found.");
  return { ...context, booking, salon, styles: styles || [], stylists: stylists || [], audit: audit || [] };
}

export async function GET(request: Request, route: RouteContext<"/api/admin/bookings/[id]">) {
  try { const { id } = await route.params; const { booking, salon, styles, stylists, audit } = await contextFor(request, id); return Response.json({ booking, salon, styles, stylists, audit }); }
  catch (error) { return errorResponse(error, "Unable to load booking."); }
}

export async function PATCH(request: Request, route: RouteContext<"/api/admin/bookings/[id]">) {
  try {
    const { id } = await route.params; const ctx = await contextFor(request, id); const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 30); const reason = cleanText(body.reason, 500);
    if (!reason) throw new Error("Add a reason for the audit trail and customer notification.");
    if (action === "cancel") return await cancelBooking(ctx, reason);
    const patch: Record<string, unknown> = {};
    if (body.guest_name !== undefined) patch.guest_name = cleanText(body.guest_name, 120);
    if (body.guest_email !== undefined) patch.guest_email = cleanEmail(body.guest_email);
    if (body.guest_phone !== undefined) patch.guest_phone = cleanUsPhone(body.guest_phone, true);
    if (body.status !== undefined) { const status = cleanText(body.status, 30); if (!["Confirmed","Completed","Requested"].includes(status)) throw new Error("Choose a valid status."); patch.status = status; }
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
    await ctx.admin.from("booking_audit_log").insert({ booking_id: id, actor_user_id: ctx.user.id, actor_role: String((ctx.adminUser as { role?: string }).role || "Admin"), action: auditAction, reason, before_data: ctx.booking, after_data: updated });
    const when = new Date(updated.appointment_datetime).toLocaleString("en-US", { timeZone: salonTimeZone(ctx.salon.time_zone), dateStyle: "medium", timeStyle: "short" });
    const text = `Girlz Culture updated your booking at ${ctx.salon.name} to ${when}. Reason: ${reason}`;
    await Promise.all([sendEmail(String(updated.guest_email || ""), "Your Girlz Culture booking was updated", `<p>${text}</p>`), sendSms(String(updated.guest_phone || ""), text)]);
    return Response.json({ booking: updated });
  } catch (error) { console.error("Admin booking update failed", error); return errorResponse(error, "Unable to update booking."); }
}

async function cancelBooking(ctx: Awaited<ReturnType<typeof contextFor>>, reason: string) {
  const booking = ctx.booking; if (["cancelled","canceled"].includes(String(booking.status).toLowerCase())) return Response.json({ booking, already_cancelled: true });
  const deposit = Math.max(0, Number(booking.deposit_amount || 0)); let refundId = ""; let refundStatus = "Not applicable";
  if (deposit > 0 && /paid|succeeded/i.test(String(booking.deposit_status || ""))) {
    const paymentId = cleanText(booking.stripe_payment_id, 120); if (!paymentId) throw new Error("Paid booking has no Stripe payment id; cancellation was stopped to protect the customer refund.");
    const refund = await stripeRequest<{id:string}>("/refunds", { payment_intent: paymentId, amount: Math.round(deposit * 100), "metadata[booking_id]": booking.id, "metadata[cancelled_by]": "platform_admin", "metadata[cancellation_reason]": reason }, { idempotencyKey: `admin-cancel-${booking.id}` });
    if (!refund.id) throw new Error("Stripe did not confirm the refund. The booking remains active."); refundId = refund.id; refundStatus = "Succeeded";
  }
  const patch = { status: "Cancelled", cancellation_initiated_by: "Admin", cancellation_reason: reason, cancelled_at: new Date().toISOString(), refund_status: refundStatus, refund_amount: refundStatus === "Succeeded" ? deposit : 0, stripe_refund_id: refundId || null, deposit_status: refundStatus === "Succeeded" ? "Refunded" : booking.deposit_status };
  const { data: cancelled, error } = await ctx.admin.from("bookings").update(patch).eq("id", booking.id).select("*").single(); if (error) throw error;
  await ctx.admin.from("booking_audit_log").insert({ booking_id: booking.id, actor_user_id: ctx.user.id, actor_role: String((ctx.adminUser as { role?: string }).role || "Admin"), action: "cancelled", reason, before_data: booking, after_data: cancelled });
  await deliverCancellationNotifications(booking.id, reason);
  return Response.json({ booking: cancelled, refund_status: refundStatus });
}
