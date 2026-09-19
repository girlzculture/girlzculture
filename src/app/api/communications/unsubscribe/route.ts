import {randomUUID} from "node:crypto";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {verifyCommunicationUnsubscribeToken} from "@/lib/businessCommunicationServer";
import {enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {capturePlatformError} from "@/lib/platformErrors";
import {withOperationalMonitoring,routeMonitoringProfile} from "@/lib/operationalMonitoring";
async function handle(request:Request){
 let admin:ReturnType<typeof getSupabaseAdmin>|undefined;
 try{
  enforceRateLimit(request,"communication-unsubscribe",20,60_000);
  const body=await request.json();const preference=verifyCommunicationUnsubscribeToken(body?.token);if(!preference)throw Error("COMMUNICATION_INVALID");
  admin=getSupabaseAdmin();const result=await admin.rpc("unsubscribe_business_communications",{p_preference:preference,p_request:randomUUID()});if(result.error)throw result.error;
  return Response.json({unsubscribed:true},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const status=error instanceof RateLimitError?429:error instanceof SyntaxError||error instanceof Error&&error.message==="COMMUNICATION_INVALID"?400:500;const reference=await capturePlatformError({request,admin,error,feature:"business-communications",action:"unsubscribe",safeMessage:"Communication opt-out could not be saved."});return Response.json({code:status===429?"COMMUNICATION_RATE_LIMIT":status===400?"COMMUNICATION_INVALID":"COMMUNICATION_UNAVAILABLE",request_id:reference},{status,headers:{"Cache-Control":"no-store","X-Request-ID":reference,...(error instanceof RateLimitError?{"Retry-After":String(error.retryAfter)}:{})}});}
}
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/communications/unsubscribe","POST"),handle);
