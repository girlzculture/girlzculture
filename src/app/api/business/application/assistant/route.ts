import {requireBusinessApplicant} from '@/lib/businessApplicantServer';
import {applicationAgentReply,ApplicationAgentError} from '@/lib/applicationAgentServer';
import {readApplicationRequest} from '@/lib/applicationRequest';
import {ApplicationProgressError} from '@/lib/applicationProgress';
import {enforceRateLimit} from '@/lib/requestSecurity';
import {monitoredRouteFailure,capturePlatformError,safeFailure} from '@/lib/platformErrors';
import {routeMonitoringProfile,withOperationalMonitoring} from '@/lib/operationalMonitoring';
async function handler(request:Request){
 let context:Awaited<ReturnType<typeof requireBusinessApplicant>>|undefined;
 try{context=await requireBusinessApplicant(request);enforceRateLimit(request,`application-assistant:${context.user.id}`,12,60000);return Response.json(await applicationAgentReply(context,await readApplicationRequest(request,10000)),{headers:{'Cache-Control':'private, no-store'}});}
 catch(error){
  if(error instanceof ApplicationProgressError)return Response.json({code:error.code,error:error.message},{status:400});
  const message=error instanceof ApplicationAgentError&&error.code==='APPLICATION_DRAFT_STALE'?'Your application changed. Reload the saved draft before asking again.':'The application assistant could not respond. Your draft is safe; retry or continue with the form.';
  const event={request,admin:context?.admin,error,feature:'application-assistant',action:'reply',actorId:context?.user.id,actorRole:'salon',safeMessage:message};
  if(error instanceof ApplicationAgentError){const reference=await capturePlatformError(event);return safeFailure(message,reference,error.status,{code:error.code});}
  return monitoredRouteFailure(event);
 }
}
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/business/application/assistant','POST'),handler);
