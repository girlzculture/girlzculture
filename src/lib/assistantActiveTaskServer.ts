import 'server-only';
import {randomUUID} from 'node:crypto';
import type {requireSalonOwner} from '@/lib/supabaseAdmin';
import {ASSISTANT_TOOLS,AssistantError} from '@/lib/gcAssistantCore';
import {isActionTool,type AssistantActiveTask} from '@/lib/assistantActiveTask';
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
export async function readActiveTask(context:Context):Promise<AssistantActiveTask|null>{
 const {data,error}=await context.admin.from('gc_assistant_active_tasks').select('id,tool,permission,revision,user_context,request_ids').eq('salon_id',context.salon.id).eq('actor_id',context.user.id).eq('status','active').maybeSingle();
 if(error)throw error;if(!data)return null;
 if(!isActionTool(data.tool)||data.permission!==ASSISTANT_TOOLS[data.tool].permission)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 const permission=await context.admin.rpc('p0_actor_has_permission',{p_salon:context.salon.id,p_user:context.user.id,p_permission:data.permission});
 if(permission.error)throw permission.error;if(permission.data!==true)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 return data as AssistantActiveTask;
}
function taskError(error:{message?:string}|null){if(!error)return;const code=error.message?.match(/ASSISTANT_[A-Z_]+/)?.[0];if(code)throw new AssistantError(code,code==='ASSISTANT_ACCESS_DENIED'?403:409);throw error;}
export async function rememberTask(context:Context,task:AssistantActiveTask|null,tool:unknown,requestId:string,text:string){
 if(!isActionTool(tool))return null;
 const saved=await context.admin.rpc('advance_gc_assistant_task',{p_id:task?.id||randomUUID(),p_salon:context.salon.id,p_actor:context.user.id,p_revision:task?.revision||0,p_tool:tool,p_permission:ASSISTANT_TOOLS[tool].permission,p_request:requestId,p_text:text});
 taskError(saved.error);return saved.data as AssistantActiveTask;
}
export async function endActiveTask(context:Context,task:AssistantActiveTask,completedRequest:string|null){
 const saved=await context.admin.rpc('end_gc_assistant_task',{p_id:task.id,p_salon:context.salon.id,p_actor:context.user.id,p_revision:task.revision,p_completed_request:completedRequest});taskError(saved.error);
 if(saved.data!==true)throw new AssistantError('ASSISTANT_TASK_CHANGED',409);
}
