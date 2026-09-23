import {monitoredNetlifyFailure} from './_monitoring.mjs';
declare const Netlify:{env:{get(key:string):string|undefined}};
export default async function rebooking(request:Request,context:{deploy:{context:string;published:boolean}}){
 if(context.deploy.context!=='production'||!context.deploy.published)return Response.json({disabled:true});
 try{
  const secret=Netlify.env.get('INTERNAL_API_SECRET');if(!secret)throw Error('REBOOKING_WORKER_NOT_CONFIGURED');
  const response=await fetch('https://girlzculture.com/api/salon/rebooking/process',{method:'POST',redirect:'error',headers:{'x-internal-secret':secret},signal:AbortSignal.timeout(40_000)});
  const body=await response.json();if(!response.ok){if(typeof body.request_id==='string'&&/^[0-9a-f-]{36}$/i.test(body.request_id))return Response.json({code:'REBOOKING_UNAVAILABLE',request_id:body.request_id},{status:response.status,headers:{'X-Request-ID':body.request_id}});throw Error('REBOOKING_WORKER_UNAVAILABLE');}
  return Response.json({ok:true});
 }catch{return monitoredNetlifyFailure({request,error:Error('REBOOKING_WORKER_UNAVAILABLE'),feature:'rebooking-reminders',action:'scheduled',safeMessage:'Rebooking reminders need review.'});}
}
export const config={schedule:'*/15 * * * *'};
