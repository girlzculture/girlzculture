import { requireBusinessApplicant } from "@/lib/businessApplicantServer";
import { readApplicationRequest } from "@/lib/applicationRequest";
import { applicationProgressInput, ApplicationProgressError } from "@/lib/applicationProgress";
import { enforceRateLimit } from "@/lib/requestSecurity";
import { monitoredRouteFailure, rejectRequest } from "@/lib/platformErrors";
import { routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";

const headers={"Cache-Control":"private, no-store"};
async function handle(request:Request) {
 let context:Awaited<ReturnType<typeof requireBusinessApplicant>>|undefined;
 try {
  context=await requireBusinessApplicant(request);
  enforceRateLimit(request,`application-progress:${context.user.id}`,90,60000);
  const {admin,user}=context;
  if(request.method==='GET'){
   const read=await admin.from('business_application_progress').select('revision,payload,updated_at,submitted_application_id').eq('user_id',user.id).maybeSingle();
   if(read.error)throw read.error;
   return Response.json({draft:read.data},{headers});
  }
  const input=applicationProgressInput(await readApplicationRequest(request));
  if(input.documents.some(path=>!path.startsWith(`${user.id}/documents/`)))rejectRequest('Upload documents using your own application.',403);
  const {revision,...payload}=input;
  const saved=await admin.rpc('save_business_application_progress',{p_actor:user.id,p_revision:revision,p_payload:payload});
  if(saved.error){if(saved.error.message==='APPLICATION_DRAFT_STALE')return Response.json({code:'APPLICATION_DRAFT_STALE',error:'This draft changed on another device. Your edits are still here. Reload the saved draft before continuing.'},{status:409,headers});throw saved.error;}
  const read=await admin.from('business_application_progress').select('revision,payload,updated_at,submitted_application_id').eq('user_id',user.id).single();
  if(read.error || read.data?.revision!==saved.data?.revision)throw read.error || new Error('APPLICATION_DRAFT_READBACK_FAILED');
  return Response.json({draft:read.data,verified:true},{headers});
 }catch(error){
  if(error instanceof ApplicationProgressError)return Response.json({code:error.code,error:error.message},{status:400,headers});
  return monitoredRouteFailure({request,admin:context?.admin,error,feature:'business-application',action:request.method==='GET'?'resume':'save-progress',actorId:context?.user.id,actorRole:'salon',safeMessage:'Application progress could not be saved. Your edits remain on this page.'});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/business/application/progress','GET'),handle);
export const POST=withOperationalMonitoring(routeMonitoringProfile('/api/business/application/progress','POST'),handle);
