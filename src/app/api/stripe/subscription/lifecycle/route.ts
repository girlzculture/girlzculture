import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { stripeGet, stripeRequest } from "@/lib/stripeServer";

type StripeSubscription = {
  id: string;
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  schedule?: string | { id?: string } | null;
  items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
};

function stripeId(value: StripeSubscription["schedule"]) {
  return typeof value === "string" ? value : value?.id || null;
}

function isoFromSeconds(value?: number) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "subscription-lifecycle", 10, 10 * 60_000);
    const { admin, salon, isOwner } = await requireSalonOwner(request);
    if (!isOwner) throw new Error("Only the salon owner can manage cancellation and reactivation.");
    const body = await request.json() as Record<string, unknown>;
    const action = cleanText(body.action, 40);
    if (!["cancel_at_period_end", "reactivate", "cancel_scheduled_change"].includes(action)) throw new Error("Choose a valid subscription action.");

    const { data: stored, error: storedError } = await admin.from("subscriptions").select("*").eq("salon_id", salon.id).maybeSingle();
    if (storedError) throw storedError;
    if (!stored?.stripe_subscription_id) throw new Error("No Stripe subscription was found for this salon.");
    const current = await stripeGet<StripeSubscription>(`/subscriptions/${stored.stripe_subscription_id}`);
    const scheduleId = stripeId(current.schedule) || stored.stripe_schedule_id || null;
    const currentItem = current.items?.data?.[0];
    const currentPeriodStart = current.current_period_start || currentItem?.current_period_start;
    const currentPeriodEnd = current.current_period_end || currentItem?.current_period_end;

    if (action === "cancel_scheduled_change") {
      if (!scheduleId || !stored.scheduled_tier) return Response.json({ changed: false, message: "There is no scheduled plan change to cancel." });
      await stripeRequest(`/subscription_schedules/${scheduleId}/release`, {}, { idempotencyKey: `owner-release-schedule:${scheduleId}` });
      const { error: clearError } = await admin.from("subscriptions").update({
        stripe_schedule_id: null,
        scheduled_tier: null,
        scheduled_price_id: null,
        scheduled_change_effective_at: null,
        updated_at: new Date().toISOString(),
      }).eq("salon_id", salon.id);
      if (clearError) throw clearError;
      console.info("Scheduled subscription change cancelled", { salonId: salon.id, subscriptionId: current.id, scheduleId });
      return Response.json({ changed: true, message: "The scheduled downgrade was cancelled. Your current plan will renew as usual." });
    }

    if (action === "cancel_at_period_end") {
      if (!["active", "trialing"].includes(String(current.status || "").toLowerCase())) throw new Error("Only an active subscription can be scheduled for cancellation.");
      if (current.cancel_at_period_end) return Response.json({ changed: false, message: "Cancellation is already scheduled." });
      if (scheduleId) await stripeRequest(`/subscription_schedules/${scheduleId}/release`, {}, { idempotencyKey: `release-before-cancel:${scheduleId}` });
      const updated = await stripeRequest<StripeSubscription>(`/subscriptions/${current.id}`, {
        cancel_at_period_end: true,
        proration_behavior: "none",
        "metadata[cancellation_source]": "salon_owner",
      }, { idempotencyKey: `cancel-at-period-end:${current.id}:${currentPeriodEnd || "current"}` });
      const updatedItem = updated.items?.data?.[0];
      const paidThrough = isoFromSeconds(updated.current_period_end || updatedItem?.current_period_end || currentPeriodEnd);
      const { error: updateError } = await admin.from("subscriptions").update({
        cancel_at_period_end: true,
        cancellation_requested_at: new Date().toISOString(),
        current_period_start: isoFromSeconds(updated.current_period_start || updatedItem?.current_period_start || currentPeriodStart),
        current_period_end: paidThrough,
        stripe_schedule_id: null,
        scheduled_tier: null,
        scheduled_price_id: null,
        scheduled_change_effective_at: null,
        updated_at: new Date().toISOString(),
      }).eq("salon_id", salon.id);
      if (updateError) throw updateError;
      console.info("Subscription cancellation scheduled", { salonId: salon.id, subscriptionId: current.id, paidThrough });
      return Response.json({
        changed: true,
        cancelAtPeriodEnd: true,
        paidThrough,
        message: `Cancellation is scheduled for the end of the paid period. Access remains active through ${paidThrough ? new Date(paidThrough).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "the Stripe billing date"}; you will not be charged again.`,
      });
    }

    if (!current.cancel_at_period_end) return Response.json({ changed: false, message: "This subscription is already set to renew." });
    const updated = await stripeRequest<StripeSubscription>(`/subscriptions/${current.id}`, {
      cancel_at_period_end: false,
      "metadata[cancellation_source]": "",
    }, { idempotencyKey: `reactivate:${current.id}:${currentPeriodEnd || "current"}` });
    const updatedItem = updated.items?.data?.[0];
    const { error: updateError } = await admin.from("subscriptions").update({
      cancel_at_period_end: false,
      cancellation_requested_at: null,
      current_period_start: isoFromSeconds(updated.current_period_start || updatedItem?.current_period_start || currentPeriodStart),
      current_period_end: isoFromSeconds(updated.current_period_end || updatedItem?.current_period_end || currentPeriodEnd),
      ended_at: null,
      updated_at: new Date().toISOString(),
    }).eq("salon_id", salon.id);
    if (updateError) throw updateError;
    console.info("Subscription reactivated", { salonId: salon.id, subscriptionId: current.id });
    return Response.json({ changed: true, cancelAtPeriodEnd: false, message: "Cancellation was reversed. Your current plan will renew on its normal billing date." });
  } catch (error) {
    noteOperationalFailure("Subscription lifecycle action failed", error);
    return errorResponse(error, "Unable to update the subscription.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/subscription/lifecycle", "POST"), POSTHandler);
