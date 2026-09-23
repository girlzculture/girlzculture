import {requireSalonOwner} from '@/lib/supabaseAdmin';
import {capturePlatformError} from '@/lib/platformErrors';
import {enforceRateLimit,RateLimitError} from '@/lib/requestSecurity';
import {routeMonitoringProfile,withOperationalMonitoring} from '@/lib/operationalMonitoring';
const headers={'Cache-Control':'private, no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function handle(request:Request){let context:Awaited<ReturnType<typeof requireSalonOwner>>|undefined;
 try{
  context=await requireSalonOwner(request);if(!context.isOwner)throw Error('GOOGLE_HELP_ACCESS_DENIED');enforceRateLimit(request,`google-help:${context.user.id}`,20,60_000);if(new URL(request.url).searchParams.size)throw Error('GOOGLE_HELP_INVALID');
  const {admin,salon,user}=context;let saved:{ticket_id:string;verified:boolean}|null=null;
  if(request.method==='POST'){
   const text=await request.text();if(text.length>2000)throw Error('GOOGLE_HELP_INVALID');const input=JSON.parse(text);
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='fingerprint,id,kind'||!uuid.test(input.id)||!['assisted_setup','profile_review'].includes(input.kind)||typeof input.fingerprint!=='string'||!/^[0-9a-f]{32}$/.test(input.fingerprint))throw Error('GOOGLE_HELP_INVALID');
   const result=await admin.rpc('request_business_google_help',{p_salon:salon.id,p_actor:user.id,p_request:input.id,p_kind:input.kind,p_fingerprint:input.fingerprint});if(result.error)throw result.error;
   saved=result.data;if(!saved?.verified||!uuid.test(saved.ticket_id))throw Error('GOOGLE_HELP_READBACK_FAILED');
  }
  const read=await admin.rpc('read_business_google_help',{p_salon:salon.id,p_actor:user.id});if(read.error)throw read.error;
  if(read.data?.salon_id!==salon.id||saved&&!read.data.requests.some((r:{id:string})=>r.id===saved?.ticket_id))throw Error('GOOGLE_HELP_READBACK_FAILED');
  return Response.json({help:read.data,...(saved?{ticket_id:saved.ticket_id,verified:true}:{})},{headers});
 }catch(error){
  if(error instanceof RateLimitError)return Response.json({code:'RATE_LIMITED'},{status:429,headers:{...headers,'Retry-After':String(error.retryAfter)}});
  const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
  const code=['GOOGLE_HELP_ACCESS_DENIED','GOOGLE_HELP_PLAN_REQUIRED','GOOGLE_HELP_DEMO_DISABLED','GOOGLE_HELP_STALE','GOOGLE_HELP_REQUEST_REUSED','GOOGLE_HELP_INVALID'].includes(message)?message:error instanceof SyntaxError?'GOOGLE_HELP_INVALID':message.startsWith('Unauthorized')?'GOOGLE_HELP_AUTH_REQUIRED':'GOOGLE_HELP_UNAVAILABLE';
  const status=code==='GOOGLE_HELP_AUTH_REQUIRED'?401:code==='GOOGLE_HELP_ACCESS_DENIED'||code==='GOOGLE_HELP_PLAN_REQUIRED'||code==='GOOGLE_HELP_DEMO_DISABLED'?403:code==='GOOGLE_HELP_STALE'||code==='GOOGLE_HELP_REQUEST_REUSED'?409:code==='GOOGLE_HELP_INVALID'?400:500;
  const reference=await capturePlatformError({request,admin:context?.admin,error:Error(code),feature:'google-profile-help',action:request.method,actorId:context?.user.id,actorRole:'salon',salonId:context?.salon.id,safeMessage:'Google setup help could not be loaded.'});return Response.json({code,request_id:reference},{status,headers:{...headers,'X-Request-ID':reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/google-help','GET'),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/salon/google-help','POST'),handle);
