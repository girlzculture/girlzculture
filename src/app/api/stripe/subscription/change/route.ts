import { normalizePlan, planFromStripePriceId, planRank, stripePriceEnv } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { stripeGet, stripeRequest } from "@/lib/stripeServer";

type StripeInvoice = {
  id?: string;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  status?: string;
  payment_intent?: { last_payment_error?: { message?: string } } | string | null;
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
  items?: { data?: Array<{ id?: string; quantity?: number; price?: { id?: string }; tax_rates?: Array<string | { id?: string }> }> };
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

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "subscription-plan-change", 8, 10 * 60_000);
    const { admin, salon, isOwner } = await requireSalonOwner(request);
    if (!isOwner) throw new Error("Only the salon owner can change the salon plan.");
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
    if (!stored?.stripe_subscription_id) throw new Error("No active Stripe subscription was found. Start a new subscription instead.");

    const current = await stripeGet<StripeSubscription>(`/subscriptions/${stored.stripe_subscription_id}?expand[]=latest_invoice.payment_intent`);
    if (!["active", "trialing"].includes(String(current.status || "").toLowerCase())) {
      throw new Error("This subscription needs billing attention before its plan can be changed. Open Manage payment method to continue.");
    }
    if (current.cancel_at_period_end) throw new Error("Reactivate the subscription before changing its plan.");
    const item = current.items?.data?.[0];
    if (!item?.id || !item.price?.id) throw new Error("Stripe did not return the current subscription item.");

    const currentPlan = planFromStripePriceId(item.price.id) || normalizePlan(stored.tier || salon.subscription_tier);
    if (item.price.id === priceId) return Response.json({ changed: false, plan, message: `${plan} is already active.` });
    const isUpgrade = planRank(plan) > planRank(currentPlan);
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
      if (!current.current_period_start || !current.current_period_end) throw new Error("Stripe did not return the paid billing period for this subscription.");

      let schedule: StripeSchedule | null = null;
      try {
        schedule = await stripeRequest<StripeSchedule>("/subscription_schedules", {
          from_subscription: current.id,
        }, {
          idempotencyKey: `downgrade-schedule:${current.id}:${item.price.id}:${priceId}:${current.current_period_end}`,
        });
        const scheduleValues: Record<string, string | number | boolean> = {
          end_behavior: "release",
          proration_behavior: "none",
          "phases[0][start_date]": current.current_period_start,
          "phases[0][end_date]": current.current_period_end,
          "phases[0][items][0][price]": item.price.id,
          "phases[0][items][0][quantity]": item.quantity || 1,
          "phases[0][proration_behavior]": "none",
          "phases[1][start_date]": current.current_period_end,
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
          idempotencyKey: `downgrade-phases:${schedule.id}:${item.price.id}:${priceId}:${current.current_period_end}`,
        });
      } catch (scheduleError) {
        if (schedule?.id) {
          await stripeRequest(`/subscription_schedules/${schedule.id}/release`, {}, { idempotencyKey: `release-failed-schedule:${schedule.id}` }).catch((releaseError) => {
            console.error("Failed downgrade schedule cleanup failed", { salonId: salon.id, scheduleId: schedule?.id, releaseError });
          });
        }
        throw scheduleError;
      }

      const effectiveAt = isoFromSeconds(current.current_period_end);
      const { error: updateError } = await admin.from("subscriptions").update({
        stripe_schedule_id: schedule.id,
        scheduled_tier: plan,
        scheduled_price_id: priceId,
        scheduled_change_effective_at: effectiveAt,
        current_period_start: isoFromSeconds(current.current_period_start),
        current_period_end: effectiveAt,
        updated_at: new Date().toISOString(),
      }).eq("salon_id", salon.id);
      if (updateError) throw updateError;

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
      idempotencyKey: `upgrade:${current.id}:${item.price.id}:${priceId}:${current.current_period_end || "current"}`,
    });

    const invoice = await invoiceDetails(updated.latest_invoice);
    const failureReason = typeof invoice?.payment_intent === "object" ? invoice.payment_intent?.last_payment_error?.message : null;
    const upgradePaid = Boolean(invoice && (invoice.status === "paid" || Number(invoice.amount_due || 0) === 0));
    if (updated.pending_update || !upgradePaid) {
      const { error: failureSaveError } = await admin.from("subscriptions").update({
        last_invoice_id: invoice?.id || null,
        last_payment_status: invoice?.status || "failed",
        last_payment_failure: failureReason || "Stripe did not confirm payment for the prorated upgrade invoice.",
        updated_at: new Date().toISOString(),
      }).eq("salon_id", salon.id);
      if (failureSaveError) console.error("Upgrade failure state could not be saved", { salonId: salon.id, failureSaveError });
      return Response.json({
        error: failureReason || "Stripe could not collect the prorated upgrade charge. Your current plan and access remain active.",
        currentPlan,
        invoiceId: invoice?.id || null,
        amountDue: invoice?.amount_due || 0,
        currency: invoice?.currency || "usd",
        requiresPaymentMethod: true,
      }, { status: 409 });
    }

    const status = String(updated.status || current.status || "active");
    const periodStart = isoFromSeconds(updated.current_period_start) || stored.current_period_start;
    const periodEnd = isoFromSeconds(updated.current_period_end) || stored.current_period_end;
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

    console.info("Salon subscription upgrade paid and activated", { salonId: salon.id, subscriptionId: current.id, invoiceId: invoice?.id, from: currentPlan, to: plan, amountPaid: invoice?.amount_paid });
    return Response.json({
      changed: true,
      plan,
      status,
      invoiceId: invoice?.id || null,
      amountPaid: invoice?.amount_paid || 0,
      currency: invoice?.currency || "usd",
      message: `${plan} is active. Stripe successfully collected the prorated invoice amount of ${new Intl.NumberFormat("en-US", { style: "currency", currency: String(invoice?.currency || "usd").toUpperCase() }).format(Number(invoice?.amount_paid || 0) / 100)}.`,
    });
  } catch (error) {
    console.error("Subscription plan change failed", error);
    return errorResponse(error, "Unable to change the subscription plan.");
  }
}
