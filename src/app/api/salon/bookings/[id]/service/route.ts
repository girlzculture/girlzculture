import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  cleanText,
  enforceRateLimit,
  publicErrorResponse,
} from "@/lib/requestSecurity";
import { capturePlatformError } from "@/lib/platformErrors";
import { requireSalonPermission, sendEmail } from "@/lib/supabaseAdmin";

class ServiceActionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function POSTHandler(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(request, "salon-booking-service", 30, 10 * 60_000);
    const { id } = await route.params;
    const context = await requireSalonPermission(request, "bookings");
    const body = (await request.json()) as Record<string, unknown>;
    const action = cleanText(body.action, 30);
    if (!["check_in", "start", "complete"].includes(action)) {
      throw new ServiceActionError("Choose a valid service action.");
    }
    if (action === "complete" && body.confirmed !== true) {
      throw new ServiceActionError(
        "Confirm that the service is complete before finishing the appointment.",
      );
    }
    const { data: booking, error: bookingError } = await context.admin
      .from("bookings")
      .select(
        "id,salon_id,stylist_id,status,guest_name,guest_email,customer_id,public_reference,confirmation_code",
      )
      .eq("id", id)
      .eq("salon_id", context.salon.id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) throw new ServiceActionError("Booking not found.", 404);
    if (
      context.teamMember?.stylist_id &&
      booking.stylist_id !== context.teamMember.stylist_id
    ) {
      throw new ServiceActionError(
        "Stylists can update only their own appointments.",
        403,
      );
    }
    const { data: updated, error: transitionError } = await context.admin.rpc(
      "transition_booking_service",
      {
        p_booking_id: booking.id,
        p_salon_id: context.salon.id,
        p_actor_user_id: context.user.id,
        p_actor_role: context.isOwner
          ? "Salon owner"
          : String(context.teamMember?.role || "Salon team"),
        p_action: action,
        p_reason:
          action === "complete"
            ? "Salon confirmed that the scheduled service was completed."
            : null,
        p_target_status: null,
      },
    );
    if (transitionError) {
      const safe =
        action === "check_in"
          ? "This booking is not ready for check-in."
          : action === "start"
            ? "Check the customer in before starting the service."
            : "Only an in-progress service can be completed.";
      if (/BOOKING_NOT_READY|SERVICE_ACTION_INVALID/i.test(transitionError.message)) {
        throw new ServiceActionError(safe, 409);
      }
      throw transitionError;
    }
    const warnings: Array<{ message: string; request_id: string }> = [];
    if (action === "complete") {
      const reference = String(
        (updated as Record<string, unknown>)?.public_reference ||
          booking.confirmation_code ||
          booking.id,
      );
      if (booking.customer_id) {
        const { error: notificationError } = await context.admin
          .from("notifications")
          .insert({
            user_id: booking.customer_id,
            salon_id: context.salon.id,
            booking_id: booking.id,
            recipient_role: "customer",
            category: "bookings",
            severity: "success",
            dedupe_key: `service-completed:${booking.id}`,
            title: "Your appointment is complete",
            body: `Booking ${reference} is complete. You can now leave a verified review.`,
            action_url: "/account/reviews",
            delivery_status: "delivered",
          });
        if (notificationError) {
          const reference = await capturePlatformError({
            request,
            admin: context.admin,
            error: notificationError,
            feature: "booking-service-lifecycle",
            action: "notify_customer_completion_in_app",
            actorRole: context.isOwner ? "salon_owner" : "salon_team",
            actorId: context.user.id,
            salonId: String(context.salon.id),
            recordType: "booking",
            recordId: String(booking.id),
            provider: "supabase",
            safeMessage:
              "The service was completed, but one customer notification needs attention.",
          });
          warnings.push({
            message: `Service completed; one notification needs attention. Reference ${reference}.`,
            request_id: reference,
          });
        }
      }
      if (booking.guest_email) {
        try {
          await sendEmail(
            String(booking.guest_email),
            "Your Girlz Culture appointment is complete",
            `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1A1220"><h1 style="font-family:Georgia,serif;color:#5B1A6B">Appointment complete</h1><p>Thank you for visiting ${String(context.salon.name || "your salon")}.</p><p>Booking <strong>${reference}</strong> is now complete. If you have a Girlz Culture account, you can leave a verified review from your bookings.</p></div>`,
            "bookings",
          );
        } catch (emailError) {
          const warningReference = await capturePlatformError({
            request,
            admin: context.admin,
            error: emailError,
            feature: "booking-service-lifecycle",
            action: "notify_customer_completion_email",
            actorRole: context.isOwner ? "salon_owner" : "salon_team",
            actorId: context.user.id,
            salonId: String(context.salon.id),
            recordType: "booking",
            recordId: String(booking.id),
            provider: "email",
            safeMessage:
              "The service was completed, but the completion email could not be delivered.",
          });
          warnings.push({
            message: `Service completed; the email needs attention. Reference ${warningReference}.`,
            request_id: warningReference,
          });
        }
      }
    }
    return Response.json({ booking: updated, warnings });
  } catch (error) {
    if (error instanceof ServiceActionError) {
      return Response.json(
        { error: error.message },
        { status: error.status },
      );
    }
    noteOperationalFailure("Salon service lifecycle action failed", error);
    return publicErrorResponse(
      error,
      "The service status could not be updated.",
    );
  }
}

export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/bookings/[id]/service", "POST", {
    classification: "protected",
    feature: "booking-service-lifecycle",
    actorRole: "salon",
    safeMessage: "The service status could not be updated.",
  }),
  POSTHandler,
);
