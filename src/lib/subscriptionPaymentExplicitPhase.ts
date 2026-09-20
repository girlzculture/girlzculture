import type { SupabaseClient } from '@supabase/supabase-js';
import { PAYMENT_PHASE_REVIEW_API_VERSION as VERSION, paymentPhaseSourceFingerprint, preparePaymentPhaseReview } from '@/lib/subscriptionPaymentPhaseReview';
import { subscriptionFingerprint, type PaymentScheduleBaseline } from '@/lib/subscriptionPaymentSchedule';

type Row=Record<string,unknown>;
type EmptyIntent=Record<string,'inherit'|'none'>;
export type ExplicitPhaseBaseline=PaymentScheduleBaseline&{kind:'explicit_phases';api_version:typeof VERSION;empty_discounts:EmptyIntent};
export type ExplicitPhasePlan={api_version:typeof VERSION;source_fingerprint:string;expected_fingerprint:string;request_fingerprint:string;request:Record<string,string|number|boolean>;expected_state:Row;target_method:string};
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const fail=(code:string):never=>{throw new Error(`PAYMENT_SCHEDULE_${code}`);};
export function phaseCommercialFingerprint(value:unknown){
 const source=structuredClone(object(value));delete object(source.default_settings).default_payment_method;
 const start=Number(object(source.current_phase).start_date);
 if(!Array.isArray(source.phases))fail('INTENT_INCOMPLETE');
 for(const phase of source.phases as Row[])if(Number(phase.end_date)>start)delete phase.default_payment_method;
 return paymentPhaseSourceFingerprint(source,VERSION);
}
function flatten(value:unknown,prefix='',output:Record<string,string|number|boolean>={}){
 if(value!==null&&typeof value==='object')for(const [key,child]of Object.entries(value))flatten(child,prefix?`${prefix}[${key}]`:key,output);
 else if(typeof value==='string'||typeof value==='number'||typeof value==='boolean')output[prefix]=value;
 else fail('INTENT_UNREPRESENTABLE');
 return output;
}
function review(source:Row,empty:EmptyIntent,customer:string,subscription:string,mode:boolean,target:string,allowUnchanged=false){
 try{return preparePaymentPhaseReview({source,apiVersion:VERSION,customerId:customer,subscriptionId:subscription,livemode:mode,targetMethodId:target,now:Math.floor(Date.now()/1000),allowUnchanged,sourceIntent:{sourceFingerprint:paymentPhaseSourceFingerprint(source,VERSION),emptyDiscounts:empty}});}
 catch(error){if(error instanceof Error&&error.message.startsWith('PAYMENT_PHASE_REVIEW_'))fail('INTENT_UNSUPPORTED');throw error;}
}

/** Only a complete, successful retained phase request can resolve an ambiguous
 * empty discount array. Sparse historical requests are deliberately not guessed. */
export function recoverPhaseIntent(source:Row,values:unknown):EmptyIntent{
 const original=object(values),phases=source.phases as Row[],start=Number(object(source.current_phase).start_date),empty:EmptyIntent={};
 let requestIndex=0;
 for(const [index,phase]of phases.entries()){
  if(Number(phase.end_date)<=start)continue;
  if(String(original[`phases[${requestIndex}][start_date]`])!==String(phase.start_date)||String(original[`phases[${requestIndex}][end_date]`])!==String(phase.end_date))fail('ORIGINAL_INTENT_REQUIRED');
  const add=(path:string,key:string,value:unknown)=>{if(Array.isArray(value)&&value.length===0){const declared=original[key];if(declared!==undefined&&declared!=='')fail('ORIGINAL_INTENT_REQUIRED');empty[path]=declared===''?'none':'inherit';}};
  add(`phases[${index}].discounts`,`phases[${requestIndex}][discounts]`,phase.discounts);
  (phase.items as Row[]).forEach((item,j)=>add(`phases[${index}].items[${j}].discounts`,`phases[${requestIndex}][items][${j}][discounts]`,item.discounts));requestIndex++;
 }
 const mapped=review(source,empty,String(source.customer),String(source.subscription),source.livemode===true,'pm_phase_review_target').request;
 const requests=mapped.phases as Row[];let index=0;
 for(const phase of phases){if(Number(phase.end_date)<=start)continue;if(phase.default_payment_method!==null)requests[index].default_payment_method=phase.default_payment_method as string;index++;}
 const expected=flatten({phases:requests});
 const actual=Object.fromEntries(Object.entries(original).filter(([key])=>key.startsWith('phases[')));
 const normalized=(row:Row)=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,String(v)]));
 if(JSON.stringify(normalized(expected))!==JSON.stringify(normalized(actual)))fail('ORIGINAL_INTENT_REQUIRED');
 return empty;
}

export async function inspectExplicitPhaseSchedule(admin:SupabaseClient,salonId:string,sourceValue:unknown,subscription:Row,customerId:string,livemode:boolean):Promise<ExplicitPhaseBaseline>{
 const source=object(sourceValue),saved=await admin.from('subscription_payment_schedule_intents').select('*').eq('stripe_schedule_id',source.id).eq('salon_id',salonId).maybeSingle();
 if(saved.error)throw saved.error;
 let empty:EmptyIntent|undefined;
 if(saved.data){const record=saved.data;
  if(record.api_version!==VERSION||record.stripe_customer_id!==customerId||record.stripe_subscription_id!==subscription.id||record.livemode!==livemode||phaseCommercialFingerprint(record.source)!==phaseCommercialFingerprint(source))fail('ORIGINAL_INTENT_STALE');
  empty=record.empty_discounts as EmptyIntent;
 }else{
  const history=await admin.from('subscription_mutation_leases').select('request_evidence').eq('salon_id',salonId).eq('stripe_subscription_id',subscription.id).maybeSingle();if(history.error)throw history.error;
  const entries=history.data?.request_evidence;
  if(Array.isArray(entries))for(const value of [...entries].reverse()){
   const entry=object(value);if(entry.path!==`/subscription_schedules/${source.id}`||typeof entry.provider_request_id!=='string'||!/^req_[A-Za-z0-9]+$/.test(entry.provider_request_id))continue;
   empty=recoverPhaseIntent(source,entry.values);break;
  }
 }
 const verifiedEmpty=empty||fail('ORIGINAL_INTENT_REQUIRED');
 review(source,verifiedEmpty,customerId,String(subscription.id),livemode,'pm_phase_review_target');
 // Resubmitting a current-phase one-off item has not yet received provider
 // acceptance. Preserve it by refusing this bounded path, never omit it.
 if((source.phases as Row[]).some(phase=>Number(phase.end_date)>Number(object(source.current_phase).start_date)&&Array.isArray(phase.add_invoice_items)&&phase.add_invoice_items.length))fail('ONE_OFF_ITEM_REVIEW_REQUIRED');
 return{kind:'explicit_phases',api_version:VERSION,schedule:structuredClone(source),fingerprint:phaseCommercialFingerprint(source),subscription_fingerprint:subscriptionFingerprint(subscription),default_method:object(source.default_settings).default_payment_method as string|null,empty_discounts:structuredClone(verifiedEmpty)};
}
export function prepareExplicitPhasePlan(baseline:ExplicitPhaseBaseline,target:string):ExplicitPhasePlan{
 const source=baseline.schedule,result=review(source,baseline.empty_discounts,String(source.customer),String(source.subscription),source.livemode===true,'pm_phase_review_target');
 if(!/^pm_[A-Za-z0-9_]+$/.test(target))fail('METHOD_INVALID');
 const request=result.request as Row,expected=result.expected_state as Row;
 for(const phase of request.phases as Row[])if(phase.default_payment_method!==undefined)phase.default_payment_method=target;
 for(const phase of expected.phases as Row[])if(Number(phase.end_date)>Number(object(source.current_phase).start_date)&&phase.default_payment_method!==null)phase.default_payment_method=target;
 // Leave per-phase nulls inherited. Bind their effective default to this
 // subscription's new method without changing the customer's other agreements.
 request.default_settings={default_payment_method:target};object(expected.default_settings).default_payment_method=target;
 const flat=flatten(request);
 return{api_version:VERSION,source_fingerprint:paymentPhaseSourceFingerprint(source,VERSION),expected_fingerprint:paymentPhaseSourceFingerprint(expected,VERSION),request_fingerprint:paymentPhaseSourceFingerprint(flat,VERSION),request:flat,expected_state:expected,target_method:target};
}
export function assertExplicitPlan(plan:ExplicitPhasePlan,baseline:ExplicitPhaseBaseline,target:string){
 const expected=prepareExplicitPhasePlan(baseline,target);
 if(paymentPhaseSourceFingerprint(plan,VERSION)!==paymentPhaseSourceFingerprint(expected,VERSION))fail('DURABLE_PLAN_CONFLICT');
}
export async function archiveExplicitPhaseResponse(input:{admin:SupabaseClient;salonId:string;actorId:string;subscriptionId:string;leaseId:string;path:string;values:Row;response:unknown;apiVersion?:string}){
 if(!/^\/subscription_schedules\/sub_sched_[A-Za-z0-9_]+$/.test(input.path)||!Object.keys(input.values).some(key=>key.startsWith('phases[')))return;
 if(input.apiVersion!==VERSION)fail('ORIGINAL_INTENT_VERSION_REQUIRED');
 const source=object(input.response),empty:EmptyIntent={};
 if(!Array.isArray(source.phases))fail('ORIGINAL_INTENT_REQUIRED');
 let requestIndex=0;
 for(const [index,phase]of (source.phases as Row[]).entries()){
  if(Number(phase.end_date)<=Number(object(source.current_phase).start_date))continue;
  const prefix=`phases[${requestIndex}]`;
  if(input.values[`${prefix}[start_date]`]!==phase.start_date)fail('ORIGINAL_INTENT_REQUIRED');
  if(input.values[`${prefix}[end_date]`]!==undefined){if(input.values[`${prefix}[end_date]`]!==phase.end_date)fail('ORIGINAL_INTENT_REQUIRED');}
  else if(!Number.isSafeInteger(input.values[`${prefix}[iterations]`])||Number(input.values[`${prefix}[iterations]`])<1)fail('ORIGINAL_INTENT_REQUIRED');
  const add=(path:string,key:string,value:unknown)=>{
   if(!Array.isArray(value))return fail('ORIGINAL_INTENT_REQUIRED');
   if(value.length)return;
   if(Object.keys(input.values).some(field=>field.startsWith(key+'[')))fail('ORIGINAL_INTENT_REQUIRED');
   const declared=input.values[key];if(declared!==undefined&&declared!=='')fail('ORIGINAL_INTENT_REQUIRED');empty[path]=declared===''?'none':'inherit';
  };
  add(`phases[${index}].discounts`,`${prefix}[discounts]`,phase.discounts);
  if(!Array.isArray(phase.items))fail('ORIGINAL_INTENT_REQUIRED');
  (phase.items as Row[]).forEach((item,j)=>add(`phases[${index}].items[${j}].discounts`,`${prefix}[items][${j}][discounts]`,item.discounts));requestIndex++;
 }
 if(Object.keys(input.values).some(key=>{const match=/^phases\[(\d+)\]/.exec(key);return match&&Number(match[1])>=requestIndex;}))fail('ORIGINAL_INTENT_REQUIRED');
 review(source,empty,String(source.customer),String(source.subscription),source.livemode===true,'pm_phase_review_target',true);
 const result=await input.admin.rpc('archive_payment_phase_intent',{p_salon:input.salonId,p_actor:input.actorId,p_subscription:input.subscriptionId,p_lease:input.leaseId,p_source:source,p_empty:empty});
 if(result.error||result.data!==true)throw result.error||new Error('PAYMENT_SCHEDULE_INTENT_ARCHIVE_FAILED');
}
