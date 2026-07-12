import { enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "billing-portal", 10, 10 * 60_000);
    const { admin, salon } = await requireSalonOwner(request);
    const { data: subscription } = await admin.from("subscriptions").select("stripe_customer_id").eq("salon_id", salon.id).maybeSingle();
    if (!subscription?.stripe_customer_id) throw new Error("No Stripe billing account exists for this salon yet.");
    const session = await stripeRequest<{url:string}>("/billing_portal/sessions", { customer:subscription.stripe_customer_id, return_url:`${siteUrl(request)}/salon/dashboard/subscription` });
    return Response.json({ url:session.url, testMode:true });
  } catch (error) {
    console.error("Billing portal failed", error);
    return errorResponse(error, "Unable to open billing portal.");
  }
}
