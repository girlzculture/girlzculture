import { monitoredRouteFailure } from "@/lib/platformErrors";
import { cleanText } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";

async function diagnostic(request: Request) {
  const context = await requireSalonOwner(request);
  const { data, error } = await context.admin.rpc("salon_publication_diagnostic", { p_salon_id: context.salon.id });
  if (error) throw Object.assign(error, { context });
  return { context, data };
}

export async function GET(request: Request) {
  try {
    const { data } = await diagnostic(request);
    return Response.json({ lifecycle: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return monitoredRouteFailure({ request, error, feature: "salon-lifecycle", action: "load", actorRole: "salon", safeMessage: "We couldn't load publication status." });
  }
}

export async function POST(request: Request) {
  let admin;
  let salonId: string | null = null;
  try {
    const context = await requireSalonOwner(request);
    admin = context.admin;
    salonId = context.salon.id;
    if (!context.isOwner) return Response.json({ error: "Only the salon owner can change publication or closure settings." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    const reason = cleanText(body.reason, 1_000);
    const now = new Date().toISOString();

    if (action === "pause_bookings" || action === "resume_bookings") {
      const { error } = await admin.from("salons").update({ accepting_bookings: action === "resume_bookings" }).eq("id", salonId);
      if (error) throw error;
    } else if (action === "unpublish") {
      if (reason.length < 5) return Response.json({ error: "Add a short reason for temporarily hiding the salon." }, { status: 400 });
      const { error } = await admin.from("salons").update({ owner_unpublished_at: now, owner_unpublished_reason: reason, is_discoverable: false }).eq("id", salonId);
      if (error) throw error;
    } else if (action === "publish") {
      const { error } = await admin.from("salons").update({ owner_unpublished_at: null, owner_unpublished_reason: null }).eq("id", salonId);
      if (error) throw error;
    } else if (action === "request_closure") {
      if (reason.length < 10) return Response.json({ error: "Tell us why you want to close the salon account." }, { status: 400 });
      const [future, bookings, payments, subscriptions] = await Promise.all([
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("salon_id", salonId).gte("appointment_datetime", now).not("status", "in", "(Cancelled,Canceled,Completed)"),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("salon_id", salonId),
        admin.from("bookings").select("id", { count: "exact", head: true }).eq("salon_id", salonId).not("deposit_status", "is", null),
        admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("salon_id", salonId),
      ]);
      const queryError = future.error || bookings.error || payments.error || subscriptions.error;
      if (queryError) throw queryError;
      const dependencySummary = { future_bookings: future.count || 0, booking_history: bookings.count || 0, payment_records: payments.count || 0, subscriptions: subscriptions.count || 0 };
      const { error } = await admin.from("salon_closure_requests").insert({ salon_id: salonId, requested_by: context.user.id, reason, dependency_summary: dependencySummary });
      if (error) throw error;
      await admin.from("salons").update({ closure_requested_at: now, closure_request_reason: reason }).eq("id", salonId);
    } else if (action !== "reconcile") {
      return Response.json({ error: "Choose a supported salon status action." }, { status: 400 });
    }

    const { data, error } = await admin.rpc("reconcile_salon_publication", { p_salon_id: salonId, p_actor_id: context.user.id, p_reason: `Salon owner action: ${action}` });
    if (error) throw error;
    if (action === "publish" && data?.is_discoverable !== true) {
      return Response.json({ lifecycle: data, error: "The salon is no longer hidden by the owner, but it cannot publish until the listed marketplace requirements are complete." }, { status: 409 });
    }
    return Response.json({ lifecycle: data });
  } catch (error) {
    return monitoredRouteFailure({ request, admin, error, feature: "salon-lifecycle", action: "owner-action", actorRole: "salon-owner", salonId, safeMessage: "We couldn't update the salon status." });
  }
}
