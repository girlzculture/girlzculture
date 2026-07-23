import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

async function POSTHandler(request: Request) {
  try {
    enforceRateLimit(request, "billing-portal", 10, 10 * 60_000);
    const { admin, salon, isOwner } = await requireSalonOwner(request);
    if (!isOwner) throw new Error("Only the salon owner can manage billing.");
    const { data: subscription } = await admin.from("subscriptions").select("stripe_customer_id").eq("salon_id", salon.id).maybeSingle();
    if (!subscription?.stripe_customer_id) throw new Error("No Stripe billing account exists for this salon yet.");
    const session = await stripeRequest<{url:string}>("/billing_portal/sessions", { customer:subscription.stripe_customer_id, return_url:`${siteUrl(request)}/salon/dashboard/subscription` });
    return Response.json({ url:session.url, testMode:true });
  } catch (error) {
    noteOperationalFailure("Billing portal failed", error);
    return errorResponse(error, "Unable to open billing portal.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/portal", "POST"), POSTHandler);
