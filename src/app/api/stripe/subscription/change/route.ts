import { normalizePlan, planRank, stripePriceEnv } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { stripeGet, stripeRequest } from "@/lib/stripeServer";

type StripeSubscription = {
  id: string;
  status?: string;
  customer?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  pending_update?: Record<string, unknown> | null;
  items?: { data?: Array<{ id?: string; quantity?: number; price?: { id?: string } }> };
};

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

    const current = await stripeGet<StripeSubscription>(`/subscriptions/${stored.stripe_subscription_id}`);
    if (!["active", "trialing"].includes(String(current.status || "").toLowerCase())) {
      throw new Error("This subscription needs billing attention before its plan can be changed. Open Manage billing to continue.");
    }
    const item = current.items?.data?.[0];
    if (!item?.id || !item.price?.id) throw new Error("Stripe did not return the current subscription item.");
    if (item.price.id === priceId) return Response.json({ changed: false, plan, message: `${plan} is already active.` });

    const currentPlan = normalizePlan(stored.tier || salon.subscription_tier);
    const isUpgrade = planRank(plan) > planRank(currentPlan);
    const updated = await stripeRequest<StripeSubscription>(`/subscriptions/${current.id}`, {
      "items[0][id]": item.id,
      "items[0][price]": priceId,
      "items[0][quantity]": item.quantity || 1,
      proration_behavior: isUpgrade ? "always_invoice" : "create_prorations",
      payment_behavior: "pending_if_incomplete",
      "metadata[salon_id]": salon.id,
      "metadata[plan]": plan,
    }, {
      idempotencyKey: `plan-change:${current.id}:${item.price.id}:${priceId}:${current.current_period_end || "current"}`,
    });

    if (updated.pending_update) {
      return Response.json({
        error: "Stripe could not collect the prorated upgrade charge. Your current plan remains active; update the payment method and try again.",
        currentPlan,
        requiresPaymentMethod: true,
      }, { status: 409 });
    }

    const status = String(updated.status || current.status || "active");
    const periodEnd = updated.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : stored.current_period_end;
    const featuredWeight = plan === "Premium" ? 100 : plan === "Growth" ? 40 : 0;
    const now = new Date().toISOString();
    const { error: subscriptionError } = await admin.from("subscriptions").update({
      tier: plan,
      status,
      price_id: priceId,
      current_period_end: periodEnd,
      cancel_at_period_end: Boolean(updated.cancel_at_period_end),
      updated_at: now,
    }).eq("salon_id", salon.id);
    if (subscriptionError) throw subscriptionError;
    const { error: salonError } = await admin.from("salons").update({
      subscription_tier: plan,
      subscription_status: status,
      featured_weight: featuredWeight,
    }).eq("id", salon.id);
    if (salonError) throw salonError;

    console.info("Salon subscription plan changed", { salonId: salon.id, subscriptionId: current.id, from: currentPlan, to: plan, isUpgrade });
    return Response.json({
      changed: true,
      plan,
      status,
      prorated: true,
      message: isUpgrade
        ? `${plan} is active. Stripe invoiced only the prorated difference for the rest of this billing period.`
        : `${plan} is active. Stripe applied the downgrade proration to the subscription.`,
    });
  } catch (error) {
    console.error("Subscription plan change failed", error);
    return errorResponse(error, "Unable to change the subscription plan.");
  }
}
