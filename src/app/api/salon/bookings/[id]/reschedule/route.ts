import {
  noteOperationalFailure,
  routeMonitoringProfile,
  withOperationalMonitoring,
} from "@/lib/operationalMonitoring";
import { createCustomerApprovedReschedule } from "@/lib/bookingRescheduleServer";
import { bookingAvailability } from "@/lib/bookingAvailabilityServer";
import {
  enforceRateLimit,
  publicErrorResponse,
} from "@/lib/requestSecurity";
import { requireSalonPermission } from "@/lib/supabaseAdmin";
import { serverSiteUrl } from "@/lib/siteUrlServer";

class RescheduleInputError extends Error {}

async function contextFor(request: Request, bookingId: string) {
  const context = await requireSalonPermission(request, "bookings");
  const { data: booking, error } = await context.admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("salon_id", context.salon.id)
    .maybeSingle();
  if (error) throw error;
  if (!booking) throw new RescheduleInputError("Booking not found.");
  if (
    context.teamMember?.stylist_id &&
    booking.stylist_id !== context.teamMember.stylist_id
  ) {
    throw new RescheduleInputError(
      "Stylists can propose changes only for their own appointments.",
    );
  }
  return { ...context, booking };
}

async function GETHandler(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await route.params;
    const { admin, booking, salon } = await contextFor(request, id);
    const date = new URL(request.url).searchParams.get("date");
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new RescheduleInputError("Choose a valid date.");
      }
      const availability = await bookingAvailability({
        salonId: String(booking.salon_id),
        styleId: String(booking.style_id),
        customerId: booking.customer_id ? String(booking.customer_id) : null,
        guestEmail: String(booking.guest_email || ""),
        date,
        excludeBookingId: String(booking.id),
        includeAllStylists: true,
      });
      return Response.json({
        date,
        time_zone: salon.time_zone,
        slots: availability.slots,
        reason: availability.reason,
      });
    }
    const { data: proposals, error } = await admin
      .from("booking_reschedule_proposals")
      .select(
        "id,status,message,reason,previous_appointment_datetime,selected_option_id,responded_at,expires_at,created_at",
      )
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    const ids = (proposals || []).map((proposal) => proposal.id);
    const optionResult = ids.length
      ? await admin
          .from("booking_reschedule_options")
          .select(
            "id,proposal_id,appointment_datetime,duration_hours,stylist_id,is_selected,stylist:stylists(name)",
          )
          .in("proposal_id", ids)
          .order("appointment_datetime")
      : { data: [], error: null };
    if (optionResult.error) throw optionResult.error;
    return Response.json({
      proposals: (proposals || []).map((proposal) => ({
        ...proposal,
        options: (optionResult.data || []).filter(
          (option) => option.proposal_id === proposal.id,
        ),
      })),
    });
  } catch (error) {
    if (error instanceof RescheduleInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    noteOperationalFailure("Salon reschedule proposal load failed", error);
    return publicErrorResponse(
      error,
      "Unable to load reschedule proposals.",
    );
  }
}

async function POSTHandler(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(request, "salon-reschedule-proposal", 15, 10 * 60_000);
    const { id } = await route.params;
    const context = await contextFor(request, id);
    const body = (await request.json()) as Record<string, unknown>;
    try {
      const result = await createCustomerApprovedReschedule({
        admin: context.admin,
        request,
        booking: context.booking,
        salon: context.salon,
        actorUserId: context.user.id,
        actorRole: context.isOwner
          ? "Salon owner"
          : String(context.teamMember?.role || "Salon team"),
        reason: body.reason,
        message: body.message,
        localOptions: body.options,
        rootUrl: serverSiteUrl(request),
      });
      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        /^(Add |Choose |This booking|No open times|The salon is closed|\d{4}-\d{2}-\d{2}T)/i.test(
          message,
        )
      ) {
        throw new RescheduleInputError(message);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof RescheduleInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    noteOperationalFailure("Salon reschedule proposal failed", error);
    return publicErrorResponse(
      error,
      "Unable to propose new appointment times.",
    );
  }
}

export const GET = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/bookings/[id]/reschedule", "GET", {
    classification: "provider-backed",
    feature: "booking-rescheduling",
    actorRole: "salon",
    safeMessage: "Reschedule proposals could not be loaded.",
  }),
  GETHandler,
);
export const POST = withOperationalMonitoring(
  routeMonitoringProfile("/api/salon/bookings/[id]/reschedule", "POST", {
    classification: "provider-backed",
    feature: "booking-rescheduling",
    actorRole: "salon",
    safeMessage: "New appointment times could not be proposed.",
  }),
  POSTHandler,
);
