import { normalizePlan, stripePriceEnv } from "@/lib/plans";
import { cleanText, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "subscription-checkout", 8, 10 * 60_000);
    const { admin, user, salon } = await requireSalonOwner(request);
    if (salon.status !== "Active") throw new Error("Your salon must be activated by Girlz Culture before subscribing.");
    const body = await request.json() as Record<string, unknown>;
    const plan = normalizePlan(cleanText(body.plan, 20));
    const priceId = process.env[stripePriceEnv(plan)];
    if (!priceId) throw new Error(`${plan} Stripe test price is not configured yet.`);
    const { data: current } = await admin.from("subscriptions").select("stripe_customer_id").eq("salon_id", salon.id).maybeSingle();
    let customerId = current?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripeRequest<{id:string}>("/customers", { email:user.email, name:salon.name, "metadata[salon_id]":salon.id });
      customerId = customer.id;
    }
    const base = siteUrl(request);
    const session = await stripeRequest<{id:string;url:string}>("/checkout/sessions", {
      mode:"subscription", customer:customerId, "line_items[0][price]":priceId, "line_items[0][quantity]":1,
      success_url:`${base}/salon/dashboard/subscription?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${base}/salon/dashboard/subscription?subscription=cancelled`,
      client_reference_id:salon.id, allow_promotion_codes:true,
      "metadata[salon_id]":salon.id, "metadata[plan]":plan,
      "subscription_data[metadata][salon_id]":salon.id, "subscription_data[metadata][plan]":plan,
    });
    await admin.from("subscriptions").upsert({ salon_id:salon.id, tier:plan, status:"checkout_pending", stripe_customer_id:customerId, price_id:priceId, updated_at:new Date().toISOString() }, { onConflict:"salon_id" });
    return Response.json({ url:session.url, testMode:true });
  } catch (error) {
    console.error("Subscription checkout failed", error);
    return errorResponse(error, "Unable to start subscription checkout.");
  }
}
