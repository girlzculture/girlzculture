import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import {
  auditGuestBookingAccess,
  revokeGuestBookingToken,
  rotateGuestBookingToken,
  verifyGuestBookingToken,
} from "@/lib/guestBookingAccess";
import { cleanText, enforceRateLimit, publicErrorResponse } from "@/lib/requestSecurity";
import {
  deliverBookingNotifications,
  deliverCancellationNotifications,
  getSupabaseAdmin,
  sendEmail,
  sendSms,
} from "@/lib/supabaseAdmin";
import { capturePlatformError } from "@/lib/platformErrors";

class GuestBookingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function siteRoot(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(request.url).origin ||
    "https://girlzculture.com"
  ).replace(/\/$/, "");
}

async function accessFor(request: Request, token: string) {
  if (!token || token.length > 1200) {
    throw new GuestBookingError(
      "This booking link is invalid or has expired. Request a new secure link.",
      401,
    );
  }
  const admin = getSupabaseAdmin();
  const access = await verifyGuestBookingToken(admin, token);
  if (!access) {
    await auditGuestBookingAccess(admin, request, {
      action: "viewed",
      outcome: "denied",
      metadata: { reason: "invalid_or_expired" },
    });
    throw new GuestBookingError(
      "This booking link is invalid or has expired. Request a new secure link.",
      401,
    );
  }
  return { admin, access };
}

async function loadManagedBooking(
  admin: ReturnType<typeof getSupabaseAdmin>,
  bookingId: string,
) {
  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id,confirmation_code,status,appointment_datetime,duration_hours,estimated_total,deposit_amount,balance_due,deposit_status,refund_status,refund_amount,guest_name,selected_size,selected_length,selected_addons,selected_options,client_notes,salon_id,style_id,stylist_id,cancellation_reason,cancellation_initiated_by",
    )
    .eq("id", bookingId)
    .single();
  if (error || !booking) throw error || new Error("Booking record unavailable.");
  const [salonResult, styleResult, stylistResult, proposalResult] =
    await Promise.all([
      admin
        .from("salons")
        .select(
          "id,name,slug,email,phone,time_zone,user_id,address_street,address_line2,address_city,address_state,address_zip",
        )
        .eq("id", booking.salon_id)
        .single(),
      admin.from("styles").select("id,name").eq("id", booking.style_id).single(),
      booking.stylist_id
        ? admin
            .from("stylists")
            .select("id,name")
            .eq("id", booking.stylist_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from("booking_reschedule_proposals")
        .select(
          "id,message,reason,status,previous_appointment_datetime,expires_at,created_at,responded_at,selected_option_id",
        )
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
  if (salonResult.error) throw salonResult.error;
  if (styleResult.error) throw styleResult.error;
  if (stylistResult.error) throw stylistResult.error;
  if (proposalResult.error) throw proposalResult.error;
  const proposalIds = (proposalResult.data || []).map((row) => row.id);
  const optionResult = proposalIds.length
    ? await admin
        .from("booking_reschedule_options")
        .select("id,proposal_id,appointment_datetime,duration_hours,is_selected")
        .in("proposal_id", proposalIds)
        .order("appointment_datetime")
    : { data: [], error: null };
  if (optionResult.error) throw optionResult.error;
  const proposals = (proposalResult.data || []).map((proposal) => ({
    ...proposal,
    options: (optionResult.data || []).filter(
      (option) => option.proposal_id === proposal.id,
    ),
  }));
  return {
    booking,
    salon: salonResult.data,
    style: styleResult.data,
    stylist: stylistResult.data,
    proposals,
  };
}

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "guest-booking-manage-read", 60, 10 * 60_000);
    const token = new URL(request.url).searchParams.get("token") || "";
    const { admin, access } = await accessFor(request, token);
    const data = await loadManagedBooking(admin, access.bookingId);
    await auditGuestBookingAccess(admin, request, {
      bookingId: access.bookingId,
      tokenId: access.tokenId,
      action: "viewed",
      outcome: "allowed",
    });
    return Response.json({ ...data, access_expires_at: access.expiresAt });
  } catch (error) {
    if (error instanceof GuestBookingError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    noteOperationalFailure("Guest booking management load failed", error);
    return publicErrorResponse(
      error,
      "We could not load this booking. Try again or contact support.",
    );
  }
}

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "guest-booking-manage-action", 12, 10 * 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    const token = cleanText(body.token, 1200);
    const action = cleanText(body.action, 40);
    const { admin, access } = await accessFor(request, token);
    const current = await loadManagedBooking(admin, access.bookingId);
    const status = String(current.booking.status || "").toLowerCase();
    if (["cancelled", "canceled", "completed", "refunded"].includes(status)) {
      throw new GuestBookingError(
        "This booking is no longer eligible for that action.",
      );
    }

    if (action === "cancel") {
      const { data: setting, error: settingError } = await admin
        .from("engine_settings")
        .select("published_value")
        .eq("setting_key", "booking.guest_cancellation_cutoff_hours")
        .eq("status", "Published")
        .maybeSingle();
      if (settingError) throw settingError;
      const configured = Number(setting?.published_value ?? 24);
      const cutoffHours =
        Number.isFinite(configured) && configured >= 0 && configured <= 336
          ? configured
          : 24;
      const appointmentAt = new Date(
        current.booking.appointment_datetime,
      ).getTime();
      if (appointmentAt <= Date.now() + cutoffHours * 60 * 60 * 1000) {
        throw new GuestBookingError(
          `Online cancellation closes ${cutoffHours} hours before the appointment. Contact the salon or support for help.`,
        );
      }
      const reason =
        cleanText(body.reason, 160) || "Customer requested cancellation";
      const { data: cancelled, error: cancelError } = await admin
        .from("bookings")
        .update({
          status: "Cancelled",
          cancellation_initiated_by: "Customer",
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
          refund_status: "Not applicable",
          refund_amount: 0,
        })
        .eq("id", access.bookingId)
        .eq("status", current.booking.status)
        .select("id")
        .maybeSingle();
      if (cancelError) throw cancelError;
      if (!cancelled) {
        throw new GuestBookingError(
          "This booking changed before cancellation completed. Refresh and try again.",
          409,
        );
      }
      const { error: bookingAuditError } = await admin
        .from("booking_audit_log")
        .insert({
          booking_id: access.bookingId,
          actor_user_id: null,
          actor_role: "Guest customer",
          action: "cancelled",
          reason,
          before_data: current.booking,
          after_data: {
            ...current.booking,
            status: "Cancelled",
            cancellation_initiated_by: "Customer",
            cancellation_reason: reason,
          },
        });
      if (bookingAuditError) throw bookingAuditError;
      await revokeGuestBookingToken(admin, access, "Customer cancellation");
      await auditGuestBookingAccess(admin, request, {
        bookingId: access.bookingId,
        tokenId: access.tokenId,
        action: "cancelled",
        outcome: "completed",
      });
      const notification = await deliverCancellationNotifications(
        access.bookingId,
        reason,
      );
      return Response.json({
        ok: true,
        status: "Cancelled",
        warnings: notification.warnings,
      });
    }

    if (action === "accept_reschedule" || action === "decline_reschedule") {
      const proposalId = cleanText(body.proposal_id, 60);
      const optionId = cleanText(body.option_id, 60);
      const { data: proposal, error: proposalError } = await admin
        .from("booking_reschedule_proposals")
        .select("id")
        .eq("id", proposalId)
        .eq("booking_id", access.bookingId)
        .eq("status", "Pending")
        .maybeSingle();
      if (proposalError) throw proposalError;
      if (!proposal) {
        throw new GuestBookingError(
          "This reschedule proposal is no longer available.",
        );
      }
      const response =
        action === "accept_reschedule" ? "accept" : "decline";
      const { data: updated, error: responseError } = await admin.rpc(
        "respond_booking_reschedule",
        {
          p_proposal_id: proposalId,
          p_option_id: response === "accept" ? optionId : null,
          p_response: response,
        },
      );
      if (responseError) {
        if (
          /CONFLICT|UNAVAILABLE|CANNOT_BE_RESCHEDULED/i.test(
            responseError.message,
          )
        ) {
          throw new GuestBookingError(
            response === "accept"
              ? "That time is no longer available. Ask the salon for another option."
              : "This reschedule proposal is no longer available.",
            409,
          );
        }
        throw responseError;
      }
      const rotated = await rotateGuestBookingToken(
        admin,
        access,
        `Reschedule ${response}`,
        siteRoot(request),
      );
      await auditGuestBookingAccess(admin, request, {
        bookingId: access.bookingId,
        tokenId: access.tokenId,
        action:
          response === "accept"
            ? "reschedule_accepted"
            : "reschedule_declined",
        outcome: "completed",
        metadata: { proposal_id: proposalId },
      });
      const warningReferences: string[] = [];
      const responseLabel =
        response === "accept" ? "accepted" : "declined";
      if (current.salon.user_id) {
        const { error: noticeError } = await admin.from("notifications").insert({
          user_id: current.salon.user_id,
          salon_id: current.salon.id,
          booking_id: access.bookingId,
          title: `Customer ${responseLabel} reschedule`,
          body:
            response === "accept"
              ? "The customer accepted a proposed time. The booking and calendar are updated."
              : "The customer declined the proposed times. The original booking remains unchanged.",
          action_url: `/salon/dashboard/bookings?booking=${access.bookingId}`,
          delivery_status: "delivered",
        });
        if (noticeError) {
          warningReferences.push(
            await capturePlatformError({
              request,
              admin,
              error: noticeError,
              feature: "booking-rescheduling",
              action: "notify_salon_in_app",
              actorRole: "guest",
              salonId: String(current.salon.id),
              recordType: "booking",
              recordId: access.bookingId,
              provider: "supabase",
              safeMessage:
                "The response was recorded, but its salon alert could not be saved.",
            }),
          );
        }
      }
      if (response === "accept") {
        const { error: resetError } = await admin
          .from("bookings")
          .update({ notifications_sent_at: null })
          .eq("id", access.bookingId);
        if (resetError) throw resetError;
        const confirmation = await deliverBookingNotifications(access.bookingId, {
          manageUrl: rotated.url,
        });
        warningReferences.push(
          ...(confirmation.warnings || []).map((warning) => warning.request_id),
        );
      } else {
        const declineText = `The customer declined the proposed times for booking ${String(
          current.booking.confirmation_code || access.bookingId,
        )}. The original appointment remains unchanged.`;
        const deliveries = await Promise.allSettled([
          sendEmail(
            String(current.salon.email || ""),
            "Customer declined proposed appointment times",
            `<h1>Reschedule proposal declined</h1><p>${declineText}</p>`,
            "bookings",
          ),
          sendSms(String(current.salon.phone || ""), declineText),
        ]);
        for (const [index, delivery] of deliveries.entries()) {
          if (delivery.status === "fulfilled") continue;
          warningReferences.push(
            await capturePlatformError({
              request,
              admin,
              error: delivery.reason,
              feature: "booking-rescheduling",
              action: index === 0 ? "notify_salon_email" : "notify_salon_sms",
              actorRole: "guest",
              salonId: String(current.salon.id),
              recordType: "booking",
              recordId: access.bookingId,
              provider: index === 0 ? "email" : "sms",
              safeMessage:
                "The response was recorded, but one salon notification could not be delivered.",
            }),
          );
        }
      }
      return Response.json({
        ok: true,
        response,
        booking: updated,
        manage_url: rotated.url,
        warnings: warningReferences.map((reference) => ({
          message: `Your response was saved, but one notification needs attention. Reference ${reference}.`,
          request_id: reference,
        })),
      });
    }
    throw new GuestBookingError("Choose a valid booking action.");
  } catch (error) {
    if (error instanceof GuestBookingError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    noteOperationalFailure("Guest booking management action failed", error);
    return publicErrorResponse(
      error,
      "We could not update this booking. Try again or contact support.",
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/guest/bookings/manage", "GET", {
    classification: "provider-backed",
    feature: "guest-booking-management",
    actorRole: "guest",
    safeMessage: "The secure booking could not be loaded.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/guest/bookings/manage", "POST", {
    classification: "provider-backed",
    feature: "guest-booking-management",
    actorRole: "guest",
    safeMessage: "The secure booking could not be updated.",
  }),
  POSTHandler,
);
