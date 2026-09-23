import {requireSalonOwner} from "@/lib/supabaseAdmin";
import {growthSettingsInput} from "@/lib/businessGrowthSettings";
import {capturePlatformError} from "@/lib/platformErrors";
import {enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request){
 let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try {
  context=await requireSalonOwner(request);
  if(!context.isOwner)throw Error("GROWTH_ACCESS_DENIED");
  enforceRateLimit(request,`business-growth:${context.user.id}`,30,60_000);
  if(new URL(request.url).searchParams.size)throw Error("GROWTH_INVALID");
  const {admin,salon,user}=context;
  let savedRevision:number|null=null;
  if(request.method==="POST"){
   const text=await request.text();if(text.length>12_000)throw Error("GROWTH_INVALID");
   const {revision,settings}=growthSettingsInput(JSON.parse(text));
   const saved=await admin.rpc("save_business_growth_settings",{p_salon:salon.id,p_actor:user.id,p_revision:revision,p_settings:settings});
   if(saved.error)throw saved.error;savedRevision=saved.data?.revision;
   if(savedRevision!==revision+1)throw Error("GROWTH_READBACK_FAILED");
  }
  const read=await admin.rpc("read_business_growth_settings",{p_salon:salon.id,p_actor:user.id});
  if(read.error||!read.data||savedRevision!==null&&read.data.revision!==savedRevision)throw read.error||Error("GROWTH_READBACK_FAILED");
  return Response.json({settings:read.data,verified:savedRevision!==null},{headers});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:"RATE_LIMITED"},{status:429,headers:{"Cache-Control":"private, no-store","Retry-After":String(error.retryAfter)}});
  const message=error&&typeof error==="object"&&"message" in error?String(error.message):"";
  const code=["GROWTH_ACCESS_DENIED","GROWTH_PLAN_REQUIRED","GROWTH_STALE","GROWTH_INVALID"].includes(message)?message:error instanceof SyntaxError?"GROWTH_INVALID":message.startsWith("Unauthorized")?"GROWTH_AUTH_REQUIRED":"GROWTH_UNAVAILABLE";
  const status=code==="GROWTH_AUTH_REQUIRED"?401:code==="GROWTH_ACCESS_DENIED"||code==="GROWTH_PLAN_REQUIRED"?403:code==="GROWTH_STALE"?409:code==="GROWTH_INVALID"?400:500;
  const reference=await capturePlatformError({request,admin:context?.admin,error:Error(code),feature:"business-growth",action:request.method,actorId:context?.user.id,actorRole:"salon",salonId:context?.salon.id,safeMessage:"Reminder and waitlist settings could not be updated."});
  return Response.json({code,request_id:reference},{status,headers:{...headers,"X-Request-ID":reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/growth-settings","GET"),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile("/api/salon/growth-settings","POST"),handle);
