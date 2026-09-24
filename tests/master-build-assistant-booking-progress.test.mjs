import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd()),{validateTool}=load('src/lib/gcAssistantCore.ts'),id='11000000-0000-4000-8000-000000000001';
const input=(operation,changes)=>({operation,record_id:id,changes_json:JSON.stringify(changes)});
const service={action:'check_in',reason_code:null,reason_detail:null,attested:true};
test('booking progress is a reviewed booking action with exact schemas and explicit attestation',()=>{
 for(const action of ['check_in','start','complete']){const r=validateTool('prepare_booking_progress',input('booking_service',{...service,action}));assert.equal(r.permission,'bookings');assert.equal(r.risk,4);}
 for(const action of ['confirm','void','reinstate'])validateTool('prepare_booking_progress',input('booking_attendance',{action,kind:action==='confirm'?'no_show':null,reason:'Verified own appointment'}));
 for(const patch of [{action:'admin_correct'},{attested:false},{attested:'true'},{salon_id:id},{refund:true},{reason_code:4}])assert.throws(()=>validateTool('prepare_booking_progress',input('booking_service',{...service,...patch})),/ASSISTANT_INVALID_INPUT/);
 for(const changes of [{action:'confirm',kind:null,reason:'Verified'},{action:'void',kind:'no_show',reason:'Correction'},{action:'confirm',kind:'risk_score',reason:'Invented'},{action:'confirm',kind:'no_show',reason:''}])assert.throws(()=>validateTool('prepare_booking_progress',input('booking_attendance',changes)),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('prepare_booking_progress',{...input('booking_service',service),record_id:null}),/ASSISTANT_INVALID_INPUT/);
});
test('booking tool stays inside booking permissions and active task reads',()=>{
 const {ownerPlannerSchema}=load('src/lib/gcAssistantPlannerProtocol.ts'),{continuesActiveTask}=load('src/lib/assistantActiveTask.ts');
 assert.match(JSON.stringify(ownerPlannerSchema(new Set(['bookings']),false)),/prepare_booking_progress/);assert.doesNotMatch(JSON.stringify(ownerPlannerSchema(new Set(['products']),false)),/prepare_booking_progress/);
 assert.equal(continuesActiveTask({tool:'prepare_booking_progress'},{task_tool:'prepare_booking_progress',plan:{tool:'get_bookings'}}),true);
 assert.equal(continuesActiveTask({tool:'prepare_booking_progress'},{task_tool:'prepare_finance_record',plan:{tool:'get_earnings_summary'}}),false);
});
test('preparation calls only own-business preview and rejects foreign or denied results',async()=>{
 for(const denied of [false,'foreign','error']){
  const calls=[];const fn=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{moderatePublicContent(){throw Error('Unexpected moderation');}}})('src/lib/assistantOperationsServer.ts');
  const ctx={salon:{id},user:{id:'actor'},admin:{async rpc(name,args){calls.push(name);assert.equal(name,'preview_gc_business_operation');assert.equal(args.p_salon,id);assert.equal(args.p_actor,'actor');return {error:denied==='error'?{message:'ASSISTANT_ACCESS_DENIED'}:null,data:{salon_id:denied==='foreign'?'foreign':id,before:{status:'Confirmed'},payload:{changes:service}}};}}};
  if(denied)await assert.rejects(fn.prepareAssistantOperation(ctx,input('booking_service',service)),/ASSISTANT_ACCESS_DENIED/);else assert.equal((await fn.prepareAssistantOperation(ctx,input('booking_service',service))).payload.changes.action,'check_in');
  assert.deepEqual(calls,['preview_gc_business_operation']);
 }
});
test('historical proposals recheck own booking and current professional assignment before model access',async()=>{
 const {assertAssistantProposalScope}=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}})('src/lib/assistantProfessionalScope.ts');
 for(const [assigned,exists] of [[null,true],['assigned',true],['reassigned',false],[null,false]]){
  const filters=[];const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},async maybeSingle(){return {data:exists?{id}:null,error:null};}};
  const ctx={isOwner:!assigned,salon:{id},user:{id:'actor'},teamMember:assigned?{stylist_id:assigned}:null,admin:{from(table){assert.equal(table,'bookings');return query;}}};
  if(exists)await assertAssistantProposalScope(ctx,'prepare_booking_progress',input('booking_service',service));else await assert.rejects(assertAssistantProposalScope(ctx,'prepare_booking_progress',input('booking_service',service)),/ASSISTANT_ACCESS_DENIED/);
  assert.deepEqual(filters,[['salon_id',id],['id',id],...(assigned?[['stylist_id',assigned]]:[])]);
 }
});
