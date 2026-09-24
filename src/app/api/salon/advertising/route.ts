import {requireSalonOwner} from '@/lib/supabaseAdmin';
import {capturePlatformError} from '@/lib/platformErrors';
import {enforceRateLimit,RateLimitError} from '@/lib/requestSecurity';
import {routeMonitoringProfile,withOperationalMonitoring} from '@/lib/operationalMonitoring';
const headers={'Cache-Control':'private, no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function handle(request:Request){let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try{
  context=await requireSalonOwner(request);if(!context.isOwner)throw Error('AD_ACCESS_DENIED');enforceRateLimit(request,`advertising:${context.user.id}`,30,60_000);if(new URL(request.url).searchParams.size)throw Error('AD_INVALID');
  const {admin,salon,user}=context;let saved:{id:string;verified:boolean}|null=null;let action='';
  if(request.method==='POST'){
   const text=await request.text();if(text.length>2000)throw Error('AD_INVALID');const input=JSON.parse(text);
   if(!input||typeof input!=='object'||Array.isArray(input)||!uuid.test(input.id))throw Error('AD_INVALID');action=input.action;
   let result;
   if(action==='reserve'&&Object.keys(input).sort().join(',')==='action,fingerprint,id,space_id'&&uuid.test(input.space_id)&&typeof input.fingerprint==='string'&&/^[0-9a-f]{32}$/.test(input.fingerprint))result=await admin.rpc('reserve_business_ad_space',{p_salon:salon.id,p_actor:user.id,p_request:input.id,p_space:input.space_id,p_fingerprint:input.fingerprint});
   else if(action==='cancel'&&Object.keys(input).sort().join(',')==='action,id')result=await admin.rpc('cancel_business_ad_reservation',{p_salon:salon.id,p_actor:user.id,p_request:input.id});
   else throw Error('AD_INVALID');
   if(result.error)throw result.error;saved=result.data;if(!saved?.verified||!uuid.test(saved.id))throw Error('AD_READBACK_FAILED');
  }
  const read=await admin.rpc('read_business_ad_spaces',{p_salon:salon.id,p_actor:user.id});if(read.error)throw read.error;
  if(read.data?.salon_id!==salon.id||saved&&!read.data.reservations.some((r:{id:string;status:string})=>r.id===saved?.id&&(action!=='cancel'||r.status==='cancelled')))throw Error('AD_READBACK_FAILED');
  return Response.json({ads:read.data,...(saved?{id:saved.id,verified:true}:{})},{headers});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:'RATE_LIMITED'},{status:429,headers:{...headers,'Retry-After':String(error.retryAfter)}});
  const message=error&&typeof error==='object'&&'message'in error?String(error.message):'';
  const code=['AD_ACCESS_DENIED','AD_BUSINESS_NOT_ELIGIBLE','AD_QUOTE_CHANGED','AD_REQUEST_REUSED','AD_INVALID','AD_NOT_AVAILABLE','AD_ALREADY_RESERVED','AD_ALREADY_FULFILLED','AD_NOT_FOUND'].includes(message)?message:error instanceof SyntaxError?'AD_INVALID':message.startsWith('Forbidden')?'AD_ACCESS_DENIED':message.startsWith('Unauthorized')?'AD_AUTH_REQUIRED':'AD_UNAVAILABLE';
  const status=code==='AD_AUTH_REQUIRED'?401:code==='AD_ACCESS_DENIED'||code==='AD_BUSINESS_NOT_ELIGIBLE'?403:code==='AD_INVALID'?400:code==='AD_UNAVAILABLE'?500:409;
  const reference=await capturePlatformError({request,admin:context?.admin,error:Error(code),feature:'advertising',action:request.method,actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'Advertising details could not be loaded.'});return Response.json({code,request_id:reference},{status,headers:{...headers,'X-Request-ID':reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/advertising','GET'),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/salon/advertising','POST'),handle);
