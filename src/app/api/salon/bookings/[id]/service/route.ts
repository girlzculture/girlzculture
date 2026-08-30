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
import { issueBookingReviewLink } from "@/lib/reviewAccessServer";
import { NON_DOM_VISUAL_TOKENS } from "@/lib/nonDomVisualTokens.mjs";
import { serverSiteUrl } from "@/lib/siteUrlServer";

const EARLY_REASONS = [
  ["customer_arrived_early", "Customer arrived earlier than scheduled"],
  ["customer_requested_earlier_by_phone", "Customer requested an earlier time by phone"],
  ["customer_requested_earlier_by_message", "Customer requested an earlier time by text or message"],
  ["salon_and_customer_agreed_earlier", "Salon and customer agreed to an earlier time"],
  ["customer_arrived_as_walk_in", "Customer arrived as a walk-in after making the booking"],
  ["appointment_changed_outside_platform", "Appointment time was changed outside the platform"],
  ["other", "Other"],
] as const;
const LATE_REASONS = [
  ["customer_arrived_late", "Customer arrived late"],
  ["salon_running_behind", "Salon was running behind schedule"],
  ["salon_and_customer_agreed_later", "Customer and salon agreed to begin later"],
  ["appointment_changed_outside_platform", "Appointment time was changed outside the platform"],
  ["service_completed_check_in_not_recorded", "Service already took place, but check-in was not recorded"],
  ["technical_problem", "Technical problem prevented check-in"],
  ["staff_forgot_check_in", "Staff forgot to record check-in"],
  ["other", "Other"],
] as const;

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
        "id,salon_id,stylist_id,status,guest_name,guest_email,customer_id,public_reference,confirmation_code,appointment_datetime,checked_in_at,service_started_at,service_completed_at",
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

    const reasonCode = cleanText(body.reason_code, 80).toLowerCase();
    const reasonDetail = cleanText(body.reason_detail, 500);
    const attested = body.attested === true;
    if (action === "check_in") {
      const scheduled = new Date(String(booking.appointment_datetime || ""));
      if (Number.isNaN(scheduled.getTime()))
        throw new ServiceActionError("This appointment time is invalid.", 409);
      const offsetMinutes = Math.floor(
        (Date.now() - scheduled.getTime()) / 60_000,
      );
      const exceptionKind =
        offsetMinutes < -30 ? "early" : offsetMinutes > 60 ? "late" : null;
      if (exceptionKind && (!reasonCode || !attested)) {
        return Response.json(
          {
            error:
              exceptionKind === "early"
                ? "Select why the customer is being checked in early and confirm the information is accurate."
                : "Select why the customer is being checked in late and confirm the information is accurate.",
            code: "CHECK_IN_EXCEPTION_REQUIRED",
            requires_exception: true,
            exception_kind: exceptionKind,
            scheduled_at: scheduled.toISOString(),
            attempted_at: new Date().toISOString(),
            offset_minutes: offsetMinutes,
            standard_window: {
              opens_at: new Date(scheduled.getTime() - 30 * 60_000).toISOString(),
              closes_at: new Date(scheduled.getTime() + 60 * 60_000).toISOString(),
            },
            reasons: (exceptionKind === "early" ? EARLY_REASONS : LATE_REASONS).map(
              ([value, label]) => ({ value, label }),
            ),
          },
          { status: 428 },
        );
      }
    }

    const { data: updated, error: transitionError } = await context.admin.rpc(
      "transition_booking_service_v2",
      {
        p_booking_id: booking.id,
        p_salon_id: context.salon.id,
        p_actor_user_id: context.user.id,
        p_actor_role: context.isOwner
          ? "Salon owner"
          : String(context.teamMember?.role || "Salon team"),
        p_action: action,
        p_reason_code: reasonCode || null,
        p_reason_detail: reasonDetail || null,
        p_attested: attested,
        p_target_status: null,
        p_time_zone: String(
          (context.salon as { time_zone?: unknown }).time_zone ||
            "America/New_York",
        ),
      },
    );
    if (transitionError) {
      if (/EARLY_CHECK_IN_REASON_REQUIRED/i.test(transitionError.message))
        throw new ServiceActionError(
          "Select a valid early check-in reason and confirm the information is accurate.",
          422,
        );
      if (/LATE_CHECK_IN_REASON_REQUIRED/i.test(transitionError.message))
        throw new ServiceActionError(
          "Select a valid late check-in reason and confirm the information is accurate.",
          422,
        );
      if (/CHECK_IN_OTHER_DETAIL_REQUIRED/i.test(transitionError.message))
        throw new ServiceActionError(
          "Add a short explanation when Other is selected.",
          422,
        );
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
      let reviewUrl = "";
      try {
        const root = serverSiteUrl(request);
        reviewUrl = (await issueBookingReviewLink(booking.id, root)).url;
      } catch (reviewLinkError) {
        const warningReference = await capturePlatformError({
          request,
          admin: context.admin,
          error: reviewLinkError,
          feature: "verified-reviews",
          action: "issue_completed_booking_review_link",
          actorRole: context.isOwner ? "salon_owner" : "salon_team",
          actorId: context.user.id,
          salonId: String(context.salon.id),
          recordType: "booking",
          recordId: String(booking.id),
          provider: "supabase",
          safeMessage:
            "The service was completed, but its review invitation needs attention.",
        });
        warnings.push({
          message: `Service completed; the review invitation needs attention. Reference ${warningReference}.`,
          request_id: warningReference,
        });
      }
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
            action_url: reviewUrl || "/account/reviews",
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
            `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:${NON_DOM_VISUAL_TOKENS.primaryText};background:${NON_DOM_VISUAL_TOKENS.lightSurface};border-radius:16px"><h1 style="font-family:Fraunces,Georgia,serif;color:${NON_DOM_VISUAL_TOKENS.primaryText}">Appointment complete</h1><p>Thank you for visiting ${String(context.salon.name || "your salon")}.</p><p>Booking <strong>${reference}</strong> is now complete.</p>${reviewUrl ? `<p><a href="${reviewUrl}" style="display:inline-block;background:${NON_DOM_VISUAL_TOKENS.action};color:${NON_DOM_VISUAL_TOKENS.onAction};padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Leave your verified review</a></p><p style="color:${NON_DOM_VISUAL_TOKENS.mutedText};font-size:13px">This secure link expires in 30 days and can be used once. You do not need an account.</p>` : ""}</div>`,
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
