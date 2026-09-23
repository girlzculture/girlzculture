import 'server-only';
import {AssistantError,validateTool} from '@/lib/gcAssistantCore';
import {businessWaitlistOpenings,waitlistOfferCopy} from '@/lib/appointmentWaitlistServer';
import type {requireSalonOwner} from '@/lib/supabaseAdmin';
type Context=Awaited<ReturnType<typeof requireSalonOwner>>;
type Row=Record<string,unknown>;
function failure(error:unknown):never{
 const code=error&&typeof error==='object'&&'message' in error?String(error.message):'';
 if(/ACCESS_DENIED|AUTH_REQUIRED/.test(code))throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 if(/OPENING_CHANGED|REQUEST_CONFLICT|SOURCE_CHANGED|ASSISTANT_PREVIEW_STALE/.test(code))throw new AssistantError('ASSISTANT_PREVIEW_STALE',409);
 if(code==='ASSISTANT_PLAN_REQUIRED')throw new AssistantError(code,403);
 if(code==='ASSISTANT_RECORD_NOT_FOUND')throw new AssistantError(code,404);
 if(code==='ASSISTANT_INVALID_INPUT')throw new AssistantError(code,400);
 throw error;
}
export async function readAssistantWaitlist(context:Context,args:Row){
 validateTool('get_appointment_waitlist',args);
 const result=await context.admin.rpc('read_business_waitlist',{p_salon:context.salon.id,p_user:context.user.id});if(result.error)failure(result.error);
 const requests=(result.data||[]) as Row[],target=args.record_id?requests.find(row=>row.id===args.record_id):null;
 if(args.record_id&&!target)throw new AssistantError('ASSISTANT_RECORD_NOT_FOUND',404);
 let openings:Row[]=[];
 if(target){try{openings=(await businessWaitlistOpenings(context,String(target.id),undefined,true)).openings;}catch(error){failure(error);}}
 return {requests:target?[target]:requests,total:requests.length,list_limit:200,total_is_capped:requests.length===200,openings,offered:false};
}
export async function prepareAssistantWaitlist(context:Context,input:Row){
 const {args}=validateTool('prepare_booking_progress',input),changes=JSON.parse(String(args.changes_json));
 const view=await readAssistantWaitlist(context,{record_id:args.record_id});
 if(!view.openings.some(row=>row.source_booking_id===changes.source_booking_id&&row.stylist_id===changes.stylist_id))throw new AssistantError('ASSISTANT_PREVIEW_STALE',409);
 const result=await context.admin.rpc('preview_gc_business_operation',{p_salon:context.salon.id,p_actor:context.user.id,p_args:args});if(result.error)failure(result.error);
 if(result.data?.salon_id!==context.salon.id)throw new AssistantError('ASSISTANT_ACCESS_DENIED',403);
 const payload=result.data.payload;
 return {before:result.data.before as Row,payload:{...payload,notification_copy:waitlistOfferCopy(String(payload.notification_locale))},notices:[]};
}
