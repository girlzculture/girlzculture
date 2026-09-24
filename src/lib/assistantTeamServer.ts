import 'server-only';
import type {requireSalonOwner} from '@/lib/supabaseAdmin';
import {AssistantError,validateTool} from '@/lib/gcAssistantCore';
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Row=Record<string,unknown>;
async function call(context:Context,name:string,args:Row){
 if(!context.isOwner)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 const r=await context.admin.rpc(name,{p_salon:context.salon.id,p_actor:context.user.id,...args});
 if(r.error){const code=r.error.message.match(/^ASSISTANT_[A-Z_]+$/)?.[0];if(code)throw new AssistantError(code,code.includes('ACCESS')?403:409);throw r.error;}
 if(r.data?.salon_id!==context.salon.id)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);return r.data;
}
export async function readAssistantTeam(context:Context){return call(context,'read_gc_team_controls',{});}
export async function prepareAssistantTeam(context:Context,args:Row){validateTool('prepare_team_controls',args);const r=await call(context,'preview_gc_team_change',{p_args:args});return {before:r.before as Row,payload:r.payload as Row,notices:[]};}
