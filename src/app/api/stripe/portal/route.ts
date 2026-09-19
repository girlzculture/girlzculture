import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { enforceRateLimit, RateLimitError } from "@/lib/requestSecurity";
import { requireSalonOwner } from "@/lib/supabaseAdmin";
import { stripeFailureDiagnostics } from "@/lib/stripeServer";
import { capturePlatformError, UserSafeRequestError } from "@/lib/platformErrors";
import { beginSubscriptionPaymentMethod, cancelSubscriptionPaymentMethod, completeSubscriptionPaymentMethod, subscriptionPaymentMethodStatus } from "@/lib/subscriptionPaymentMethodServer";

async function handle(request: Request) {
  let context: Awaited<ReturnType<typeof requireSalonOwner>> | undefined;
  try {
    enforceRateLimit(request, request.method === "GET" ? "billing-method-read" : "billing-portal", request.method === "GET" ? 60 : 20, 10 * 60_000);
    context = await requireSalonOwner(request);
    const { admin, salon, isOwner,user } = context;
    if (!isOwner) throw new UserSafeRequestError("Only the business owner can manage billing.",403);
    let result: unknown;
    if (request.method === "GET") result=await subscriptionPaymentMethodStatus(admin,salon.id);
    else {
      let body: Record<string,unknown>;
      try { const raw=await request.text(); body=raw ? JSON.parse(raw) : {}; if (!body || typeof body!=="object" || Array.isArray(body)) throw new Error(); }
      catch { throw new UserSafeRequestError("The payment settings request is invalid.",400); }
      const action=body.action || "begin";
      if (action === "begin") result=await beginSubscriptionPaymentMethod({admin,salonId:salon.id,actorId:user.id,request});
      else if (action === "complete" && typeof body.session_id === "string") result=await completeSubscriptionPaymentMethod(admin,body.session_id,salon.id);
      else if (action === "cancel" && typeof body.attempt_id === "string") result=await cancelSubscriptionPaymentMethod(admin,salon.id,body.attempt_id);
      else throw new UserSafeRequestError("Choose a valid payment settings action.",400);
    }
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    if(error instanceof RateLimitError) return Response.json({error:"Please wait before trying again."},{status:429,headers:{"Retry-After":String(error.retryAfter),"Cache-Control":"private, no-store"}});
    const status=error instanceof UserSafeRequestError?error.status:error instanceof Error&&error.message==="Unauthorized"?401:error instanceof Error&&error.message==="Forbidden"?403:502;
    const message=error instanceof UserSafeRequestError?error.message:"Unable to verify billing payment settings. Please try again shortly.";
    const reference=await capturePlatformError({request,admin:context?.admin,error,feature:"subscription-billing",action:"payment-method-portal",actorRole:"salon",actorId:context?.user.id,salonId:context?.salon.id,provider:"stripe",safeMessage:message,metadata:{provider_diagnostics:stripeFailureDiagnostics(error)}});
    return Response.json({error:message,request_id:reference},{status,headers:{"Cache-Control":"private, no-store","X-Request-ID":reference}});
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/portal", "POST"), handle);
export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/portal", "GET"), handle);
