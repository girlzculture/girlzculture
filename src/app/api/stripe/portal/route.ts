import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest, stripeFailureDiagnostics } from "@/lib/stripeServer";
import { capturePlatformError, UserSafeRequestError } from "@/lib/platformErrors";

async function POSTHandler(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  try {
    enforceRateLimit(request, "billing-portal", 10, 10 * 60_000);
    context = await requireSalonOwner(request);
    const { admin, salon, isOwner } = context;
    if (!isOwner) throw new UserSafeRequestError("Only the business owner can manage billing.",403);
    const { data: subscription, error } = await admin.from("subscriptions").select("stripe_customer_id").eq("salon_id", salon.id).maybeSingle();
    if (error) throw error;
    if (!subscription?.stripe_customer_id) throw new UserSafeRequestError("No billing account exists for this business yet.",409);
    const session = await stripeRequest<{url:string}>("/billing_portal/sessions", { customer:subscription.stripe_customer_id, return_url:`${siteUrl(request)}/salon/dashboard/subscription` });
    return Response.json({ url: session.url },{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    if(error instanceof RateLimitError) return Response.json({error:"Please wait before trying again."},{status:429,headers:{"Retry-After":String(error.retryAfter),"Cache-Control":"private, no-store"}});
    const status=error instanceof UserSafeRequestError?error.status:error instanceof Error&&error.message==="Unauthorized"?401:error instanceof Error&&error.message==="Forbidden"?403:502;
    const message=error instanceof UserSafeRequestError?error.message:"Unable to open billing payment settings.";
    const reference=await capturePlatformError({request,admin:context?.admin,error,feature:"subscription-billing",action:"payment-method-portal",actorRole:"salon",actorId:context?.user.id,salonId:context?.salon.id,provider:"stripe",safeMessage:message,metadata:{provider_diagnostics:stripeFailureDiagnostics(error)}});
    return Response.json({error:message,request_id:reference},{status,headers:{"Cache-Control":"private, no-store","X-Request-ID":reference}});
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/portal", "POST"), POSTHandler);
