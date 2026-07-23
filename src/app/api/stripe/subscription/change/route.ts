import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { normalizePlan, planFromStripePriceId, planRank, stripePriceEnv } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse, RateLimitError } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { stripeGet, stripeRequest } from "@/lib/stripeServer";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import type { SupabaseClient } from "@supabase/supabase-js";

type StripeInvoice = {
  id?: string;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  status?: string;
  hosted_invoice_url?: string | null;
  lines?: { data?: Array<{ amount?: number }> };
  payment_intent?: { id?: string; status?: string; last_payment_error?: { message?: string } } | string | null;
};

type StripeSubscription = {
  id: string;
  status?: string;
  customer?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  schedule?: string | { id?: string } | null;
  latest_invoice?: string | StripeInvoice | null;
  pending_update?: Record<string, unknown> | null;
  discounts?: Array<string | { id?: string }>;
  items?: { data?: Array<{ id?: string; quantity?: number; current_period_start?: number; current_period_end?: number; price?: { id?: string }; tax_rates?: Array<string | { id?: string }> }> };
};

type StripeSchedule = { id: string };

function stripeId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}

function isoFromSeconds(value?: number) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function invoiceDetails(value: StripeSubscription["latest_invoice"]) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  return stripeGet<StripeInvoice>(`/invoices/${value}?expand[]=payment_intent`);
}

async function POSTHandler(request: Request) {
  let monitoringAdmin: SupabaseClient | undefined;
  let salonId: string | null = null;
  try {
    enforceRateLimit(request, "subscription-plan-change", 8, 10 * 60_000);
    const context = await requireSalonOwner(request);
    const { admin, salon, isOwner } = context;
    monitoringAdmin = admin;
    salonId = salon.id;
    if (!isOwner) rejectRequest("Only the salon owner can change the salon plan.", 403);
    const body = await request.json() as Record<string, unknown>;
    const plan = normalizePlan(cleanText(body.plan, 20));
    const priceId = process.env[stripePriceEnv(plan)];
    if (!priceId) throw new Error(`${plan} Stripe test price is not configured yet.`);

    const { data: stored, error: storedError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("salon_id", salon.id)
      .maybeSingle();
    if (storedError) throw storedError;
    if (!stored?.stripe_subscription_id) rejectRequest("No active Stripe subscription was found. Start a new subscription instead.", 409);

    const current = await stripeGet<StripeSubscription>(`/subscriptions/${stored.stripe_subscription_id}?expand[]=latest_invoice.payment_intent`);
    if (!["active", "trialing"].includes(String(current.status || "").toLowerCase())) {
      rejectRequest("This subscription needs billing attention before its plan can be changed. Open Manage payment method to continue.", 409);
    }
    if (current.cancel_at_period_end) rejectRequest("Reactivate the subscription before changing its plan.", 409);
    const item = current.items?.data?.[0];
    if (!item?.id || !item.price?.id) throw new Error("Stripe did not return the current subscription item.");
    const currentPeriodStart = current.current_period_start || item.current_period_start;
    const currentPeriodEnd = current.current_period_end || item.current_period_end;

    const currentPlan = planFromStripePriceId(item.price.id) || normalizePlan(stored.tier || salon.subscription_tier);
    if (item.price.id === priceId) return Response.json({ changed: false, plan, message: `${plan} is already active.` });
    const isUpgrade = planRank(plan) > planRank(currentPlan);
    const requestKey = `plan-change:${current.id}:${item.price.id}:${priceId}:${currentPeriodEnd || "current"}`;
    const trackChange = async (values: Record<string, unknown>) => {
      const result = await admin.from("subscription_change_requests").upsert({
        salon_id: salon.id,
        stripe_subscription_id: current.id,
        previous_plan: currentPlan,
        new_plan: plan,
        change_timing: isUpgrade ? "immediate" : "scheduled",
        idempotency_key: requestKey,
        updated_at: new Date().toISOString(),
        ...values,
      }, { onConflict: "idempotency_key" });
      if (result.error) throw result.error;
    };
    const existingScheduleId = stripeId(current.schedule) || stored.stripe_schedule_id || null;

    if (isUpgrade && existingScheduleId) {
      return Response.json({
        error: "A downgrade is already scheduled. Cancel the scheduled change first, then retry the upgrade.",
        currentPlan,
        scheduledPlan: stored.scheduled_tier || null,
      }, { status: 409 });
    }

    if (!isUpgrade) {
      if (existingScheduleId) {
        return Response.json({
          error: "A plan change is already scheduled. Cancel it before scheduling a different downgrade.",
          currentPlan,
          scheduledPlan: stored.scheduled_tier || null,
        }, { status: 409 });
      }
      if (!currentPeriodStart || !currentPeriodEnd) throw new Error("Stripe did not return the paid billing period for this subscription.");

      let schedule: StripeSchedule | null = null;
      try {
        schedule = await stripeRequest<StripeSchedule>("/subscription_schedules", {
          from_subscription: current.id,
        }, {
          idempotencyKey: `downgrade-schedule:${current.id}:${item.price.id}:${priceId}:${currentPeriodEnd}`,
        });
        const scheduleValues: Record<string, string | number | boolean> = {
          end_behavior: "release",
          proration_behavior: "none",
          "phases[0][start_date]": currentPeriodStart,
          "phases[0][end_date]": currentPeriodEnd,
          "phases[0][items][0][price]": item.price.id,
          "phases[0][items][0][quantity]": item.quantity || 1,
          "phases[0][proration_behavior]": "none",
          "phases[1][start_date]": currentPeriodEnd,
          "phases[1][duration][interval]": "month",
          "phases[1][duration][interval_count]": 1,
          "phases[1][items][0][price]": priceId,
          "phases[1][items][0][quantity]": item.quantity || 1,
          "phases[1][proration_behavior]": "none",
          "phases[1][metadata][salon_id]": salon.id,
          "phases[1][metadata][plan]": plan,
          "phases[1][metadata][previous_plan]": currentPlan,
          "phases[1][metadata][change_type]": "downgrade_effective",
          "metadata[salon_id]": salon.id,
          "metadata[previous_plan]": currentPlan,
          "metadata[scheduled_plan]": plan,
        };
        current.discounts?.forEach((discount, index) => {
          const discountId = typeof discount === "string" ? discount : discount.id;
          if (!discountId) return;
          scheduleValues[`phases[0][discounts][${index}][discount]`] = discountId;
          scheduleValues[`phases[1][discounts][${index}][discount]`] = discountId;
        });
        item.tax_rates?.forEach((taxRate, index) => {
          const taxRateId = typeof taxRate === "string" ? taxRate : taxRate.id;
          if (!taxRateId) return;
          scheduleValues[`phases[0][items][0][tax_rates][${index}]`] = taxRateId;
          scheduleValues[`phases[1][items][0][tax_rates][${index}]`] = taxRateId;
        });
        await stripeRequest<StripeSchedule>(`/subscription_schedules/${schedule.id}`, scheduleValues, {
          idempotencyKey: `downgrade-phases:${schedule.id}:${item.price.id}:${priceId}:${currentPeriodEnd}`,
        });
      } catch (scheduleError) {
        if (schedule?.id) {
          await stripeRequest(`/subscription_schedules/${schedule.id}/release`, {}, { idempotencyKey: `release-failed-schedule:${schedule.id}` }).catch((releaseError) => {
            noteOperationalFailure("Failed downgrade schedule cleanup failed", { salonId: salon.id, scheduleId: schedule?.id, releaseError });
          });
        }
        throw scheduleError;
      }

      const effectiveAt = isoFromSeconds(currentPeriodEnd);
      const { error: updateError } = await admin.from("subscriptions").update({
        stripe_schedule_id: schedule.id,
        scheduled_tier: plan,
        scheduled_price_id: priceId,
        scheduled_change_effective_at: effectiveAt,
        current_period_start: isoFromSeconds(currentPeriodStart),
        current_period_end: effectiveAt,
        updated_at: new Date().toISOString(),
      }).eq("salon_id", salon.id);
      if (updateError) throw updateError;
      await trackChange({ status: "Scheduled", effective_at: effectiveAt, event_source: "stripe_schedule", amount_due: 0, amount_collected: 0, amount_pending: 0 });

      console.info("Salon subscription downgrade scheduled", { salonId: salon.id, subscriptionId: current.id, scheduleId: schedule.id, from: currentPlan, to: plan, effectiveAt });
      return Response.json({
        changed: true,
        scheduled: true,
        currentPlan,
        scheduledPlan: plan,
        effectiveAt,
        amountChargedNow: 0,
        currency: "usd",
        message: `${currentPlan} remains active through the paid period. ${plan} is scheduled for the next renewal; nothing was charged, refunded, or credited today.`,
      });
    }

    if (body.confirm !== true) {
      await trackChange({ status: "Awaiting confirmation", event_source: "owner_request", effective_at: null, failure_reason: null });
      return Response.json({
        requiresConfirmation: true,
        currentPlan,
        requestedPlan: plan,
        message: `Confirm the upgrade from ${currentPlan} to ${plan}. Stripe will calculate the unused ${currentPlan} credit, the remaining-period ${plan} charge, and any tax. Access changes only after Stripe reports the resulting invoice paid.`,
      });
    }

    await trackChange({ status: "Processing", event_source: "stripe_api", failure_reason: null });

    const updated = await stripeRequest<StripeSubscription>(`/subscriptions/${current.id}`, {
      "items[0][id]": item.id,
      "items[0][price]": priceId,
      "items[0][quantity]": item.quantity || 1,
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      "expand[0]": "latest_invoice.payment_intent",
      "metadata[salon_id]": salon.id,
      "metadata[plan]": plan,
      "metadata[previous_plan]": currentPlan,
      "metadata[change_type]": "upgrade",
    }, {
      idempotencyKey: `upgrade:${current.id}:${item.price.id}:${priceId}:${currentPeriodEnd || "current"}`,
    });

    const invoice = await invoiceDetails(updated.latest_invoice);
    const failureReason = typeof invoice?.payment_intent === "object" ? invoice.payment_intent?.last_payment_error?.message : null;
    const paymentReference = typeof invoice?.payment_intent === "string" ? invoice.payment_intent : invoice?.payment_intent?.id || null;
    const prorationCredit = (invoice?.lines?.data || []).filter((line) => Number(line.amount || 0) < 0).reduce((sum, line) => sum + Math.abs(Number(line.amount || 0)), 0);
    const prorationCharge = (invoice?.lines?.data || []).filter((line) => Number(line.amount || 0) > 0).reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const invoicePaid = invoice?.status === "paid";
    const expectedAmount = Number(invoice?.amount_due || 0);
    const collectedAmount = Number(invoice?.amount_paid || 0);
    const amountConfirmed = expectedAmount === 0 ? invoicePaid : invoicePaid && collectedAmount >= expectedAmount;
    const updatedPriceId = updated.items?.data?.[0]?.price?.id;
    const upgradeConfirmed = !updated.pending_update
      && ["active", "trialing"].includes(String(updated.status || "").toLowerCase())
      && updatedPriceId === priceId
      && amountConfirmed;
    if (!upgradeConfirmed) {
      const requiresAction = invoice?.status === "open" && Boolean(invoice.hosted_invoice_url);
      await trackChange({
        status: requiresAction ? "Requires action" : "Failed",
        event_source: "stripe_api",
        currency: invoice?.currency || "usd",
        proration_credit: prorationCredit,
        proration_charge: prorationCharge,
        amount_due: expectedAmount,
        amount_collected: collectedAmount,
        amount_pending: Math.max(0, expectedAmount - collectedAmount),
        amount_failed: requiresAction ? 0 : expectedAmount,
        stripe_invoice_id: invoice?.id || null,
        stripe_payment_reference: paymentReference,
        hosted_payment_url: requiresAction ? invoice?.hosted_invoice_url : null,
        failure_reason: failureReason || (requiresAction ? "Customer action is required in Stripe." : "Stripe did not confirm the prorated invoice."),
      });
      const { error: failureSaveError } = await admin.from("subscriptions").update({
        last_invoice_id: invoice?.id || null,
        last_payment_status: invoice?.status || "failed",
        last_payment_failure: failureReason || "Stripe did not confirm payment for the prorated upgrade invoice.",
        updated_at: new Date().toISOString(),
      }).eq("salon_id", salon.id);
      if (failureSaveError) noteOperationalFailure("Upgrade failure state could not be saved", { salonId: salon.id, failureSaveError });
      return Response.json({
        error: failureReason || "Stripe did not confirm the prorated upgrade invoice and replacement subscription item. Your current plan and access remain active.",
        currentPlan,
        invoiceId: invoice?.id || null,
        amountDue: invoice?.amount_due || 0,
        currency: invoice?.currency || "usd",
        requiresPaymentMethod: true,
        requiresAction,
        paymentUrl: requiresAction ? invoice?.hosted_invoice_url : null,
      }, { status: requiresAction ? 202 : 409 });
    }

    const status = String(updated.status || current.status || "active");
    const updatedItem = updated.items?.data?.[0];
    const periodStart = isoFromSeconds(updated.current_period_start || updatedItem?.current_period_start) || stored.current_period_start;
    const periodEnd = isoFromSeconds(updated.current_period_end || updatedItem?.current_period_end) || stored.current_period_end;
    const featuredWeight = plan === "Premium" ? 100 : plan === "Growth" ? 40 : 0;
    const now = new Date().toISOString();
    const { error: subscriptionError } = await admin.from("subscriptions").update({
      tier: plan,
      status,
      price_id: priceId,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: Boolean(updated.cancel_at_period_end),
      last_invoice_id: invoice?.id || null,
      last_payment_status: invoice?.status || "paid",
      last_payment_failure: null,
      scheduled_tier: null,
      scheduled_price_id: null,
      scheduled_change_effective_at: null,
      stripe_schedule_id: null,
      updated_at: now,
    }).eq("salon_id", salon.id);
    if (subscriptionError) throw subscriptionError;
    const { error: salonError } = await admin.from("salons").update({
      subscription_tier: plan,
      subscription_status: status,
      featured_weight: featuredWeight,
    }).eq("id", salon.id);
    if (salonError) throw salonError;
    await trackChange({
      status: "Paid",
      effective_at: now,
      event_source: "stripe_api_verified",
      currency: invoice?.currency || "usd",
      proration_credit: prorationCredit,
      proration_charge: prorationCharge,
      amount_due: expectedAmount,
      amount_collected: collectedAmount,
      amount_pending: 0,
      amount_failed: 0,
      stripe_invoice_id: invoice?.id || null,
      stripe_payment_reference: paymentReference,
      hosted_payment_url: null,
      failure_reason: null,
    });

    console.info("Salon subscription upgrade paid and activated", { salonId: salon.id, subscriptionId: current.id, invoiceId: invoice?.id, from: currentPlan, to: plan, amountPaid: invoice?.amount_paid });
    return Response.json({
      changed: true,
      plan,
      status,
      invoiceId: invoice?.id || null,
      amountPaid: invoice?.amount_paid || 0,
      amountDue: invoice?.amount_due || 0,
      currency: invoice?.currency || "usd",
      paymentConfirmation: { invoiceStatus: invoice?.status || null, subscriptionStatus: status, priceId: updatedPriceId || null },
      message: `${plan} is active. Stripe successfully collected the prorated invoice amount of ${new Intl.NumberFormat("en-US", { style: "currency", currency: String(invoice?.currency || "usd").toUpperCase() }).format(Number(invoice?.amount_paid || 0) / 100)}.`,
    });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(error, error.message);
    return monitoredRouteFailure({ request, admin: monitoringAdmin, error, feature: "subscriptions", action: "change_plan", actorRole: "salon-owner", salonId, safeMessage: "We couldn't change the subscription plan." });
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/subscription/change", "POST"), POSTHandler);
