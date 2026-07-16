import { normalizePlan, stripePriceEnv, SUBSCRIPTION_PLANS } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { siteUrl, stripeGet, stripeRequest } from "@/lib/stripeServer";
import { previewPromoCode, reservePromoCode } from "@/lib/promoCodes";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "subscription-checkout", 8, 10 * 60_000);
    const { admin, user, salon, isOwner } = await requireSalonOwner(request);
    if (!isOwner) throw new Error("Only the salon owner can manage the salon subscription.");
    if (salon.status !== "Active") throw new Error("Your salon must be activated by Girlz Culture before subscribing.");
    const body = await request.json() as Record<string, unknown>;
    const plan = normalizePlan(cleanText(body.plan, 20));
    const promoCode = cleanText(body.promo_code, 40);
    if (promoCode) await previewPromoCode(promoCode, "subscription", SUBSCRIPTION_PLANS[plan].monthlyPrice);
    const priceId = process.env[stripePriceEnv(plan)];
    if (!priceId) throw new Error(`${plan} Stripe test price is not configured yet.`);
    const { data: current } = await admin.from("subscriptions").select("stripe_customer_id,stripe_subscription_id,status").eq("salon_id", salon.id).maybeSingle();
    if (current?.stripe_subscription_id) {
      const live = await stripeGet<{ status?: string }>(`/subscriptions/${current.stripe_subscription_id}`);
      if (["active", "trialing"].includes(String(live.status || "").toLowerCase())) {
        return Response.json({ error: "This salon already has an active subscription. Change the existing plan instead of starting another subscription." }, { status: 409 });
      }
      if (["past_due", "unpaid", "incomplete", "paused"].includes(String(live.status || "").toLowerCase())) {
        return Response.json({ error: "The existing subscription needs billing attention. Open Manage billing instead of creating a second subscription." }, { status: 409 });
      }
    }
    let customerId = current?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripeRequest<{id:string}>("/customers", { email:user.email, name:salon.name, "metadata[salon_id]":salon.id });
      customerId = customer.id;
    }
    const promoReservation = promoCode ? await reservePromoCode(promoCode, "subscription", { userId: user.id, salonId: salon.id }) : null;
    const base = siteUrl(request);
    const session = await stripeRequest<{id:string;url:string}>("/checkout/sessions", {
      mode:"subscription", customer:customerId, "line_items[0][price]":priceId, "line_items[0][quantity]":1,
      success_url:`${base}/salon/dashboard/subscription?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${base}/salon/dashboard/subscription?subscription=cancelled`,
      client_reference_id:salon.id, allow_promotion_codes:!promoReservation,
      "metadata[salon_id]":salon.id, "metadata[plan]":plan,
      "metadata[promo_redemption_id]":promoReservation?.redemption_id||"", "metadata[promo_code]":promoReservation?.code||"",
      "subscription_data[metadata][salon_id]":salon.id, "subscription_data[metadata][plan]":plan,
      ...(promoReservation?.stripe_coupon_id?{"discounts[0][coupon]":promoReservation.stripe_coupon_id}:{}),
    });
    if(promoReservation?.redemption_id)await admin.from("promo_code_redemptions").update({stripe_checkout_session_id:session.id}).eq("id",promoReservation.redemption_id);
    await admin.from("subscriptions").upsert({ salon_id:salon.id, tier:plan, status:"checkout_pending", stripe_customer_id:customerId, price_id:priceId, stripe_schedule_id:null, scheduled_tier:null, scheduled_price_id:null, scheduled_change_effective_at:null, cancel_at_period_end:false, cancellation_requested_at:null, ended_at:null, last_payment_failure:null, updated_at:new Date().toISOString() }, { onConflict:"salon_id" });
    return Response.json({ url:session.url, testMode:true });
  } catch (error) {
    console.error("Subscription checkout failed", error);
    return errorResponse(error, "Unable to start subscription checkout.");
  }
}
