import {withOperationalMonitoring,routeMonitoringProfile} from '@/lib/operationalMonitoring';
import {requireSalonOwner} from '@/lib/supabaseAdmin';
import {readActiveTask,endActiveTask} from '@/lib/assistantActiveTaskServer';
import {taskSummary} from '@/lib/assistantActiveTask';
import {AssistantError} from '@/lib/gcAssistantCore';
import {monitoredRouteFailure} from '@/lib/platformErrors';
const headers={'Cache-Control':'private, no-store'};
async function handle(request:Request){
 try{
  const context=await requireSalonOwner(request),task=await readActiveTask(context);
  if(request.method==='GET')return Response.json({active_task:taskSummary(task)},{headers});
  const raw=await request.text();if(raw.length>256)throw new AssistantError('ASSISTANT_INVALID_INPUT');
  const input=JSON.parse(raw);
  if(!input||Object.keys(input).some(k=>!['id','revision','confirm'].includes(k))||input.confirm!==true)throw new AssistantError('ASSISTANT_INVALID_INPUT');
  if(task){if(input.id!==task.id||input.revision!==task.revision)throw new AssistantError('ASSISTANT_TASK_CHANGED',409);await endActiveTask(context,task,null);}
  return Response.json({active_task:null,verified:true},{headers});
 }catch(error){
  if(error instanceof SyntaxError)return Response.json({code:'ASSISTANT_INVALID_INPUT'},{status:400,headers});
  if(error instanceof Error&&/Unauthorized|Forbidden/.test(error.message))return Response.json({code:/Unauthorized/.test(error.message)?'AUTH_REQUIRED':'ASSISTANT_ACCESS_DENIED'},{status:/Unauthorized/.test(error.message)?401:403,headers});
  if(error instanceof AssistantError)return Response.json({code:error.code},{status:error.status,headers});
  return monitoredRouteFailure({request,error,feature:'gc-assistant',action:'active-task',actorRole:'salon',safeMessage:'The unfinished task could not be loaded. Try again.'});
 }
}
export const GET=withOperationalMonitoring(routeMonitoringProfile('/api/salon/assistant/task','GET'),handle);
export const DELETE=withOperationalMonitoring(routeMonitoringProfile('/api/salon/assistant/task','DELETE'),handle);
