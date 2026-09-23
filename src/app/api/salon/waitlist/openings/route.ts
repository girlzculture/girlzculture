import {requireSalonPermission} from "@/lib/supabaseAdmin";
import {businessWaitlistOpenings,waitlistFailure,WAITLIST_UUID} from "@/lib/appointmentWaitlistServer";
import {enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
async function handle(request:Request){
 try {
  const context=await requireSalonPermission(request,"bookings");
  enforceRateLimit(request,`business-waitlist:${context.user.id}`,12,60_000);
  if(new URL(request.url).searchParams.size)throw Error("WAITLIST_INVALID_INPUT");
  const text=await request.text();if(text.length>512)throw Error("WAITLIST_INVALID_INPUT");
  const body=JSON.parse(text);
  if(!body||typeof body!=="object"||Array.isArray(body)||!['review','offer'].includes(body.action)||typeof body.request_id!=="string"||!WAITLIST_UUID.test(body.request_id)
   ||Object.keys(body).some(key=>!["action","request_id","source_booking_id"].includes(key))
   ||(body.action==='offer'?typeof body.source_booking_id!=="string"||!WAITLIST_UUID.test(body.source_booking_id):'source_booking_id' in body))throw Error("WAITLIST_INVALID_INPUT");
  const result=await businessWaitlistOpenings(context,body.request_id,body.action==='offer'?body.source_booking_id:undefined);
  return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:"RATE_LIMITED"},{status:429,headers:{"Cache-Control":"private, no-store","Retry-After":String(error.retryAfter)}});return waitlistFailure(request,error);}
}
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/salon/waitlist/openings","POST"),handle);
