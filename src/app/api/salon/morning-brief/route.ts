import {requireSalonOwner} from "@/lib/supabaseAdmin";
import {readMorningBrief} from "@/lib/businessMorningBriefServer";
import {enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {capturePlatformError} from "@/lib/platformErrors";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
async function handle(request:Request){
 let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try{
  context=await requireSalonOwner(request);
  if(!context.isOwner)throw Error("Forbidden");
  if(new URL(request.url).searchParams.size)return Response.json({code:"BRIEF_INVALID_INPUT"},{status:400,headers:{"Cache-Control":"private, no-store"}});
  enforceRateLimit(request,`morning-brief:${context.user.id}`,30,60_000);
  return Response.json(await readMorningBrief(request,context),{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:"BRIEF_RATE_LIMITED"},{status:429,headers:{"Cache-Control":"private, no-store","Retry-After":String(error.retryAfter)}});
  const message=error instanceof Error?error.message:"",status=/Unauthorized/.test(message)?401:/Forbidden/.test(message)?403:500;
  const reference=await capturePlatformError({request,admin:context?.admin,error:new Error("BRIEF_UNAVAILABLE"),feature:"business-morning-brief",action:"read",actorRole:"salon",actorId:context?.user.id,salonId:context?.salon.id,safeMessage:"Morning brief could not be loaded.",severity:status>=500?"high":"low"});
  return Response.json({code:"BRIEF_UNAVAILABLE",request_id:reference},{status,headers:{"Cache-Control":"private, no-store","X-Request-ID":reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile("/api/salon/morning-brief","GET"),handle);
