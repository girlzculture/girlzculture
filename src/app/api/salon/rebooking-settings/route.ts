import {requireSalonOwner} from '@/lib/supabaseAdmin';
import {rebookingSettingsInput} from '@/lib/businessRebookingReminders';
import {campaignEmailAvailable} from '@/lib/businessCustomerCampaignServer';
import {capturePlatformError} from '@/lib/platformErrors';
import {enforceRateLimit,RateLimitError} from '@/lib/requestSecurity';
import {routeMonitoringProfile,withOperationalMonitoring} from '@/lib/operationalMonitoring';
const headers={'Cache-Control':'private, no-store'};
async function handle(request:Request){let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try{
  context=await requireSalonOwner(request);if(!context.isOwner)throw Error('REBOOKING_ACCESS_DENIED');enforceRateLimit(request,`rebooking-settings:${context.user.id}`,30,60_000);
  if(new URL(request.url).searchParams.size)throw Error('REBOOKING_INVALID');
  const {admin,salon,user}=context,email_available=await campaignEmailAvailable(admin);let revision:number|null=null;
  if(request.method==='POST'){
   const text=await request.text();if(text.length>12_000)throw Error('REBOOKING_INVALID');const v=rebookingSettingsInput(JSON.parse(text));
   if(v.enabled&&!email_available)throw Error('REBOOKING_EMAIL_UNAVAILABLE');
   const save=await admin.rpc('save_business_rebooking_settings',{p_salon:salon.id,p_actor:user.id,p_revision:v.revision,p_enabled:v.enabled,p_days:v.absence_days,p_minimum:v.minimum_visits,p_services:v.service_ids,p_reviewed:v.reviewed});
   if(save.error)throw save.error;revision=v.revision+1;
  }
  const read=await admin.rpc('read_business_rebooking_settings',{p_salon:salon.id,p_actor:user.id});if(read.error)throw read.error;
  if(read.data?.salon_id!==salon.id||revision!==null&&read.data.revision!==revision)throw Error('REBOOKING_READBACK_FAILED');
  return Response.json({settings:{...read.data,email_available},verified:revision!==null},{headers});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:'RATE_LIMITED'},{status:429,headers:{...headers,'Retry-After':String(error.retryAfter)}});
  const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
  const code=['REBOOKING_ACCESS_DENIED','REBOOKING_PLAN_REQUIRED','REBOOKING_STALE','REBOOKING_INVALID','REBOOKING_EMAIL_UNAVAILABLE'].includes(message)?message:error instanceof SyntaxError?'REBOOKING_INVALID':message.startsWith('Unauthorized')?'REBOOKING_AUTH_REQUIRED':'REBOOKING_UNAVAILABLE';
  const status=code==='REBOOKING_AUTH_REQUIRED'?401:code==='REBOOKING_ACCESS_DENIED'||code==='REBOOKING_PLAN_REQUIRED'?403:code==='REBOOKING_STALE'?409:code==='REBOOKING_INVALID'?400:code==='REBOOKING_EMAIL_UNAVAILABLE'?503:500;
  const reference=await capturePlatformError({request,admin:context?.admin,error:Error(code),feature:'rebooking-reminders',action:request.method,actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'Rebooking reminders could not be updated.'});
  return Response.json({code,request_id:reference},{status,headers:{...headers,'X-Request-ID':reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/rebooking-settings','GET'),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/salon/rebooking-settings','POST'),handle);
