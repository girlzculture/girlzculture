import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,business=id(1),actor=id(2),entry=id(3),source=id(4),professional=id(5),customer=id(6),service=id(7);
const args={operation:'waitlist_offer',record_id:entry,changes_json:JSON.stringify({source_booking_id:source,stylist_id:professional})};
function fixture(options={}){
 const calls=[];const context={isOwner:true,salon:{id:business},user:{id:actor},admin:{async rpc(name,p){calls.push({name,p});assert.equal(p.p_salon,business);assert.equal(p.p_actor||p.p_user,actor);
  if(name==='read_business_waitlist')return {data:options.revoked?[]:[{id:entry,style_id:service,stylist_id:professional,customer_name:'Original client',status:'waiting'}]};
  if(name==='business_waitlist_openings')return {data:[{request_id:entry,source_booking_id:source,salon_id:options.foreign?id(99):business,customer_id:customer,style_id:service,stylist_id:professional,appointment_at:'2030-06-10T14:00:00Z',time_zone:'America/New_York',locale:'es'}]};
  if(name==='preview_gc_business_operation')return {data:{salon_id:business,before:{revision:1},payload:{operation:'waitlist_offer',notification_locale:'es',customer_name:'Original client'}}};throw Error(name);
 }}};
 const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/bookingAvailabilityServer':{async bookingAvailability(p){calls.push({name:'availability',p});return {slots:options.unavailable?[]:[{value:'10:00',stylistId:professional}]};}},'@/lib/platformErrors':{capturePlatformError(){throw Error('No provider/log side effect in preparation');}}});
 const helper=load('src/lib/assistantWaitlistServer.ts');return {calls,context,load,read:()=>helper.readAssistantWaitlist(context,{record_id:entry}),prepare:()=>helper.prepareAssistantWaitlist(context,args)};
}
test('waitlist request schema permits only an own opening selection, not notification prose or tenant fields',()=>{
 const {validateTool}=typescriptLoader(process.cwd())('src/lib/gcAssistantCore.ts');assert.equal(validateTool('prepare_booking_progress',args).risk,4);
 for(const extra of ['salon_id','customer_id','copy','confirmed','charge'])assert.throws(()=>validateTool('prepare_booking_progress',{...args,changes_json:JSON.stringify({...JSON.parse(args.changes_json),[extra]:true})}),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('get_appointment_waitlist',{record_id:entry,salon_id:business}),/ASSISTANT_INVALID_INPUT/);
});
test('waitlist preparation reuses actual scoped availability and canonical customer-language copy without sending',async()=>{
 const f=fixture(),result=await f.prepare();assert.deepEqual(f.calls.map(c=>c.name),['read_business_waitlist','business_waitlist_openings','availability','preview_gc_business_operation']);
 assert.match(result.payload.notification_copy.body,/no se ha confirmado/);assert.equal(result.payload.customer_name,'Original client');assert.equal(JSON.stringify(result).includes(customer),false);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[2].p)),{salonId:business,styleId:service,stylistId:professional,customerId:customer,date:'2030-06-10'});
});
test('unavailable opening, inaccessible entry and foreign provider projection fail before preparation or notification',async()=>{
 for(const [options,code]of [[{revoked:true},/ASSISTANT_RECORD_NOT_FOUND/],[{foreign:true},/ASSISTANT_ACCESS_DENIED/],[{unavailable:true},/ASSISTANT_PREVIEW_STALE/]]){const f=fixture(options);await assert.rejects(f.prepare(),code);assert.equal(f.calls.some(c=>c.name==='preview_gc_business_operation'),false);}
});
test('response-loss replay scope checks the request even after its opening has already been offered',async()=>{
 const f=fixture(),scope=f.load('src/lib/assistantProfessionalScope.ts');await scope.assertAssistantProposalScope(f.context,'prepare_booking_progress',args);assert.deepEqual(f.calls.map(c=>c.name),['read_business_waitlist']);
 const denied=fixture({revoked:true});await assert.rejects(scope.assertAssistantProposalScope(denied.context,'prepare_booking_progress',args),/ASSISTANT_ACCESS_DENIED/);
});
test('waitlist reads keep a pending offer but cannot replace an unfinished appointment',()=>{
 const {continuesActiveTask}=typescriptLoader(process.cwd())('src/lib/assistantActiveTask.ts'),plan={task_tool:'prepare_booking_progress',plan:{tool:'get_appointment_waitlist'}};
 assert.equal(continuesActiveTask({tool:'prepare_booking_progress'},plan),true);assert.equal(continuesActiveTask({tool:'prepare_manual_appointment'},plan),false);
});
