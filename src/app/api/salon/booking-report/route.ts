import {requireSalonOwner} from "@/lib/supabaseAdmin";
import {bookingReportMonth} from "@/lib/businessBookingReport";
import {capturePlatformError} from "@/lib/platformErrors";
import {enforceRateLimit,RateLimitError} from "@/lib/requestSecurity";
import {routeMonitoringProfile,withOperationalMonitoring} from "@/lib/operationalMonitoring";
const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request){let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try{
  context=await requireSalonOwner(request);enforceRateLimit(request,`booking-report:${context.user.id}`,30,60_000);
  const query=new URL(request.url).searchParams;if(query.size!==1||!query.has("month"))throw Error("REPORT_INVALID_MONTH");
  const month=bookingReportMonth(query.get("month"));
  const {data,error}=await context.admin.rpc("read_business_booking_report",{p_salon:context.salon.id,p_actor:context.user.id,p_month:month});
  if(error)throw error;
  if(!data||data.salon_id!==context.salon.id||data.month!==month||!['basic','detailed','advanced'].includes(data.level))throw Error("REPORT_SCOPE_MISMATCH");
  return Response.json({report:data},{headers});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:"RATE_LIMITED"},{status:429,headers:{...headers,"Retry-After":String(error.retryAfter)}});
  const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
  const code=['REPORT_INVALID_MONTH','REPORT_ACCESS_DENIED'].includes(message)?message:message.startsWith('Unauthorized')?'REPORT_AUTH_REQUIRED':'REPORT_UNAVAILABLE';
  const status=code==='REPORT_INVALID_MONTH'?400:code==='REPORT_ACCESS_DENIED'?403:code==='REPORT_AUTH_REQUIRED'?401:500;
  const reference=await capturePlatformError({request,admin:context?.admin,error:Error(code),feature:'business-booking-report',action:'read',actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'The appointment report could not be loaded.'});
  return Response.json({code,request_id:reference},{status,headers:{...headers,'X-Request-ID':reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/booking-report','GET'),handle);
