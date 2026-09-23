import 'server-only';
import type {requireSalonOwner} from '@/lib/supabaseAdmin';
import {AssistantError,validateTool} from '@/lib/gcAssistantCore';
import {validateDepositRule,type BusinessDepositRule} from '@/lib/businessDepositRules';
import {growthSettingsInput} from '@/lib/businessGrowthSettings';
import {rebookingSettingsInput} from '@/lib/businessRebookingReminders';
import {campaignEmailAvailable} from '@/lib/businessCustomerCampaignServer';
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Row=Record<string,unknown>;
async function call(context:Context,name:string,args:Row){
 if(!context.isOwner)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 const r=await context.admin.rpc(name,{p_salon:context.salon.id,p_actor:context.user.id,...args});
 if(r.error){const code=r.error.message.match(/^ASSISTANT_[A-Z_]+$/)?.[0];if(code)throw new AssistantError(code,code.includes('ACCESS')?403:409);throw r.error;}
 if(r.data?.salon_id!==context.salon.id)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);return r.data;
}
export async function readAssistantControls(context:Context,args:Row){
 validateTool('get_business_controls',args);const read=await call(context,'read_gc_business_controls',{p_section:args.section});
 return {...read,...(args.section==='rebooking'?{email_available:await campaignEmailAvailable(context.admin)}:{})};
}
export async function prepareAssistantControls(context:Context,args:Row){
 validateTool('prepare_business_controls',args);
 const preview=await call(context,'preview_gc_business_controls',{p_args:args}),v=preview.payload.values;
 try{
  if(args.section==='deposits')validateDepositRule({...v,version:preview.before.state.version} as BusinessDepositRule);
  if(args.section==='growth')growthSettingsInput({...v,revision:preview.before.state.revision});
  if(args.section==='rebooking')rebookingSettingsInput({...v,revision:preview.before.state.revision,reviewed:true});
 }catch{throw new AssistantError('ASSISTANT_INVALID_INPUT');}
 // Enabling future contact requires the same live channel prerequisite as the
 // existing Settings control. Confirmation calls prepare again before its RPC.
 if(args.section==='rebooking'&&v.enabled&&!await campaignEmailAvailable(context.admin))throw new AssistantError('ASSISTANT_EMAIL_UNAVAILABLE',503);
 return {before:preview.before,payload:preview.payload,notices:[]};
}
