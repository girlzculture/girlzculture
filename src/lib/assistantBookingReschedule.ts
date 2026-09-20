import "server-only";
import type { requireSalonOwner } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/gcAssistantCore";
import { assistantAssignedProfessional } from "@/lib/assistantProfessionalScope";
import { validateCustomerReschedule, deliverCustomerRescheduleProposal } from "@/lib/bookingRescheduleServer";
import { moderatePublicContent } from "@/lib/contentModerationServer";

type Context = Awaited<ReturnType<typeof requireSalonOwner>>;
type Row = Record<string, unknown>;

async function ownBooking(context: Context, id: unknown) {
  const access = await context.admin.rpc("p0_actor_has_permission", { p_salon: context.salon.id, p_user: context.user.id, p_permission: "bookings" });
  if (access.error) throw access.error;
  if (access.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  let query = context.admin.from("bookings").select("*").eq("salon_id", context.salon.id).eq("id", id);
  const assigned = assistantAssignedProfessional(context);
  if (assigned) query = query.eq("stylist_id", assigned);
  const booking = await query.maybeSingle();
  if (booking.error) throw booking.error;
  if (!booking.data) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
  if (booking.data.id !== id || booking.data.salon_id !== context.salon.id || assigned && booking.data.stylist_id !== assigned) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  const professional = await context.admin.rpc("p0_actor_can_manage_professional", { p_salon: context.salon.id, p_actor: context.user.id, p_professional: booking.data.stylist_id });
  if (professional.error) throw professional.error;
  if (professional.data !== true) throw new AssistantError("ASSISTANT_ACCESS_DENIED", 403);
  return booking.data as Row;
}

/** Shared with preparation, replay history and post-confirmation delivery. */
export async function assertAssistantRescheduleScope(context: Context, bookingId: unknown) {
  await ownBooking(context, bookingId);
}

export async function prepareAssistantBookingReschedule(context: Context, args: Row) {
  const booking = await ownBooking(context, args.booking_id);
  if (booking.booking_origin !== "marketplace" || !["confirmed", "pending"].includes(String(booking.status).toLowerCase()) || booking.service_started_at || Date.parse(String(booking.appointment_datetime)) <= Date.now()) throw new AssistantError("ASSISTANT_PREVIEW_STALE", 409);
  const [service, professional] = await Promise.all([
    context.admin.from("styles").select("id,salon_id,name").eq("salon_id", context.salon.id).eq("id", booking.style_id).maybeSingle(),
    booking.stylist_id ? context.admin.from("stylists").select("id,salon_id,name").eq("salon_id", context.salon.id).eq("id", booking.stylist_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (service.error) throw service.error;
  if (professional.error) throw professional.error;
  if (!service.data || service.data.id !== booking.style_id || service.data.salon_id !== context.salon.id || booking.stylist_id && (!professional.data || professional.data.id !== booking.stylist_id || professional.data.salon_id !== context.salon.id)) throw new AssistantError("ASSISTANT_RECORD_NOT_FOUND", 404);
  const moderation = await moderatePublicContent(context.admin, { body: `${args.reason}\n${args.message}` });
  if (!moderation.allowed) throw new AssistantError("ASSISTANT_CONTENT_REVIEW_REQUIRED");
  let validated: Awaited<ReturnType<typeof validateCustomerReschedule>>;
  try {
    validated = await validateCustomerReschedule({ admin: context.admin, booking, salon: context.salon, actorUserId: context.user.id, actorRole: "Salon", reason: args.reason, message: args.message, localOptions: [{ local: `${args.date}T${args.time}`, stylistId: booking.stylist_id }], rootUrl: "" });
  } catch (error) {
    if (error && typeof error === "object" && "message" in error && /available|closed|Choose|duration|rescheduled/.test(String(error.message))) throw new AssistantError("ASSISTANT_AVAILABILITY_CONFLICT", 409);
    throw error;
  }
  const option = validated.verifiedOptions[0];
  if (validated.verifiedOptions.length !== 1 || option.stylist_id !== booking.stylist_id || Date.parse(option.appointment_datetime) === Date.parse(String(booking.appointment_datetime))) throw new AssistantError("ASSISTANT_INVALID_INPUT");
  // Authorization and booking terms may change while availability is being read.
  const current = await ownBooking(context, args.booking_id);
  const snapshot = (row: Row) => ({ booking_id: row.id, public_reference: row.public_reference ?? null, customer_name: row.guest_name ?? null,
    appointment_datetime: new Date(String(row.appointment_datetime)).toISOString(), duration_hours: Number(row.duration_hours), buffer_minutes: Number(row.buffer_minutes ?? 15),
    stylist_id: row.stylist_id ?? null, style_id: row.style_id, status: row.status, service_started_at: row.service_started_at ?? null,
    estimated_total: row.estimated_total == null ? null : Number(row.estimated_total), deposit_amount: row.deposit_amount == null ? null : Number(row.deposit_amount), deposit_status: row.deposit_status ?? null,
    deposit_rule_snapshot: row.deposit_rule_snapshot ?? null });
  const before = snapshot(booking);
  if (JSON.stringify(before) !== JSON.stringify(snapshot(current))) throw new AssistantError("ASSISTANT_PREVIEW_STALE", 409);
  return { before, payload: { customer_name: before.customer_name, public_reference: before.public_reference, service_name: service.data.name,
    professional_name: professional.data?.name ?? null, previous_appointment_datetime: before.appointment_datetime, appointment_datetime: option.appointment_datetime,
    duration_hours: before.duration_hours, buffer_minutes: before.buffer_minutes, stylist_id: before.stylist_id, estimated_total: before.estimated_total, deposit_amount: before.deposit_amount,
    time_zone: validated.timeZone, reason: validated.reason, message: validated.message, expiry_hours: validated.expiryHours }, notices: ["CUSTOMER_ACCEPTANCE_REQUIRED"] };
}

/** Only invoked after the canonical confirmation transaction returned verified. */
export async function deliverAssistantReschedule(context: Context, result: Row, rootUrl: string) {
  const booking = await ownBooking(context, result.booking_id);
  const proposal = await context.admin.from("booking_reschedule_proposals").select("id,salon_id,booking_id,status,message,reason,previous_appointment_datetime,expires_at,created_at,proposed_by_user_id")
    .eq("id", result.proposal_id).eq("salon_id", context.salon.id).eq("booking_id", booking.id).eq("proposed_by_user_id", context.user.id).maybeSingle();
  if (proposal.error) throw proposal.error;
  if (!proposal.data || proposal.data.id !== result.proposal_id || proposal.data.salon_id !== context.salon.id || proposal.data.booking_id !== booking.id || proposal.data.proposed_by_user_id !== context.user.id) throw new AssistantError("ASSISTANT_READBACK_FAILED", 409);
  const savedProposal = proposal.data;
  const options = await context.admin.from("booking_reschedule_options").select("proposal_id,appointment_datetime,duration_hours,stylist_id").eq("proposal_id", proposal.data.id);
  if (options.error) throw options.error;
  if (!Array.isArray(options.data) || options.data.length !== 1 || options.data.some(row => row.proposal_id !== savedProposal.id || row.stylist_id !== booking.stylist_id)) throw new AssistantError("ASSISTANT_READBACK_FAILED", 409);
  const delivery = await deliverCustomerRescheduleProposal({ admin: context.admin, booking, salon: context.salon, proposal: proposal.data,
    verifiedOptions: options.data.map(row => ({ ...row, stylist_name: String(result.professional_name || "") })), rootUrl });
  // Management URLs and tokens stay in the delivery stage, never the assistant.
  return delivery.warnings.map(warning => ({ code: "RESCHEDULE_NOTIFICATION_FAILED", request_id: warning.request_id }));
}
