import {requireAdminPermission} from '@/lib/supabaseAdmin';
import {capturePlatformError} from '@/lib/platformErrors';
import {routeMonitoringProfile,withOperationalMonitoring} from '@/lib/operationalMonitoring';
const headers={'Cache-Control':'private, no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function handle(request:Request){let context:Awaited<ReturnType<typeof requireAdminPermission>>|undefined;
 try{
  context=await requireAdminPermission(request,'marketing');if(new URL(request.url).searchParams.size)throw Error('AD_INVALID');let action='read',input:Record<string,unknown>={};
  if(request.method==='POST'){
   const text=await request.text();if(text.length>3000)throw Error('AD_INVALID');const body=JSON.parse(text);
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='action,input'||!body.input||typeof body.input!=='object'||Array.isArray(body.input)||!uuid.test(body.input.id))throw Error('AD_INVALID');
   action=body.action;input=body.input;const keys=Object.keys(input).sort().join(',');
   if(action==='create'){
    if(keys!=='capacity,ends_at,id,opens_at,price_cents,radius_miles,starts_at,title'||typeof input.title!=='string'||input.title.trim().length<3||input.title.length>100||!Number.isSafeInteger(input.price_cents)||Number(input.price_cents)<1||Number(input.price_cents)>1000000||!Number.isInteger(input.capacity)||Number(input.capacity)<1||Number(input.capacity)>100||typeof input.radius_miles!=='number'||!Number.isFinite(input.radius_miles)||input.radius_miles<1||input.radius_miles>250||['opens_at','starts_at','ends_at'].some(k=>typeof input[k]!=='string'||!Number.isFinite(Date.parse(String(input[k])))))throw Error('AD_INVALID');
   }else if(action==='close'){if(keys!=='id')throw Error('AD_INVALID');}
   else if(action==='fulfill'){if(keys!=='id,invoice_reference,payment_verified,received_cents'||typeof input.invoice_reference!=='string'||input.invoice_reference.length>160||typeof input.payment_verified!=='boolean'||!Number.isSafeInteger(input.received_cents)||Number(input.received_cents)<0)throw Error('AD_INVALID');}
   else throw Error('AD_INVALID');
  }
  const {admin,user}=context;const result=await admin.rpc('admin_ad_spaces',{p_actor:user.id,p_action:action,p_input:input});if(result.error)throw result.error;
  let data=result.data;
  if(action!=='read'){
   const read=await admin.rpc('admin_ad_spaces',{p_actor:user.id,p_action:'read',p_input:{}});if(read.error)throw read.error;data=read.data;
   if(action==='fulfill'?!data?.reservations.some((r:{id:string;status:string;campaign_id:string})=>r.id===input.id&&r.status==='fulfilled'&&r.campaign_id):!data?.spaces.some((s:{id:string;active:boolean})=>s.id===input.id&&(action!=='close'||s.active===false)))throw Error('AD_READBACK_FAILED');
  }
  return Response.json({ads:data,verified:action!=='read'},{headers});
 }catch(error){const message=error&&typeof error==='object'&&'message'in error?String(error.message):'';const code=['AD_ACCESS_DENIED','AD_INVALID','AD_EARLY_ACCESS_REQUIRED','AD_REQUEST_REUSED','AD_NOT_FOUND','AD_NOT_AVAILABLE','AD_INVOICE_REQUIRED','AD_INVOICE_REUSED','AD_BUSINESS_NOT_ELIGIBLE'].includes(message)?message:error instanceof SyntaxError?'AD_INVALID':message.startsWith('Unauthorized')?'AD_AUTH_REQUIRED':message.startsWith('Forbidden')?'AD_ACCESS_DENIED':'AD_UNAVAILABLE';
  const reference=await capturePlatformError({request,admin:context?.admin,error:Error(code),feature:'advertising',action:request.method,actorId:context?.user.id,actorRole:'admin',safeMessage:'Advertising changes could not be confirmed.'});
  return Response.json({code,request_id:reference},{status:code==='AD_AUTH_REQUIRED'?401:code==='AD_ACCESS_DENIED'?403:code==='AD_INVALID'?400:code==='AD_UNAVAILABLE'?500:409,headers:{...headers,'X-Request-ID':reference}});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/admin/ad-spaces','GET'),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/admin/ad-spaces','POST'),handle);
