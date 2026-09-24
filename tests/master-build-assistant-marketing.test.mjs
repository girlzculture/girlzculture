import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const id='20000000-0000-4000-8000-000000000010',foreign='20000000-0000-4000-8000-000000000020';
const load=typescriptLoader(process.cwd()),{validateTool}=load('src/lib/gcAssistantCore.ts');
const copies=Object.fromEntries(['en','fr','es','zh-CN'].map(l=>[l,{title:`Braids ${l}`,body:'Reviewed own service',tags:['#Braids']}]));
const source={photo_urls:['https://example.test/own.jpg'],service_id:id,promotion_id:null,booking_id:null};
const args=(operation,changes,record_id=id)=>({operation,record_id,changes_json:JSON.stringify(changes)});
test('marketing accepts only scoped draft, publication and withdrawal with all four reviewed copies',()=>{
 for(const input of [args('marketing_draft',{source,copies},null),args('marketing_publish',{scheduled_at:'2098-01-01T12:00:00Z',expires_at:'2098-01-02T12:00:00Z'}),args('marketing_cancel',{})]){
  const tool=validateTool('prepare_marketing_change',input);assert.equal(tool.risk,4);assert.equal(tool.permission,'promotions');
  for(const field of ['salon_id','user_id','approved','reviewed','send_email','instagram'])assert.throws(()=>validateTool('prepare_marketing_change',args(input.operation,{...JSON.parse(input.changes_json),[field]:true},input.record_id)),/ASSISTANT_INVALID_INPUT/);
 }
 assert.throws(()=>validateTool('prepare_marketing_change',args('marketing_publish',{scheduled_at:'2098-01-01',expires_at:'2098-01-02'},null)),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('prepare_marketing_change',args('marketing_draft',{source,copies:{en:copies.en}},null)),/ASSISTANT_INVALID_INPUT/);
 assert.throws(()=>validateTool('get_marketing_records',{record_id:id,salon_id:foreign}),/ASSISTANT_INVALID_INPUT/);
});
function fixture({owner=true,foreignResult=false,moderation='allow'}={}){
 const calls=[];const context={isOwner:owner,salon:{id},user:{id:'owner'},admin:{async rpc(name,p){calls.push(name);assert.equal(p.p_salon,id);assert.equal(p.p_actor,'owner');return {data:{salon_id:foreignResult?foreign:id,total:1,before:{},payload:{copies,operation:p.p_args?.operation}}};}}};
 const helper=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(_admin,input){calls.push('moderation');for(const c of Object.values(copies))assert.ok(input.body.includes(c.title));return {outcome:moderation};}}})('src/lib/assistantOperationsServer.ts');
 return {calls,context,read:()=>helper.readAssistantMarketing(context,{record_id:id}),prepare:input=>helper.prepareAssistantOperation(context,input||args('marketing_draft',{source,copies},null))};
}
test('own-business scope is checked before prose moderation and never writes while preparing',async()=>{
 const f=fixture();await f.read();await f.prepare();assert.deepEqual(f.calls,['read_gc_business_marketing','preview_gc_business_operation','moderation']);
 for(const method of ['read','prepare']){const denied=fixture({owner:false});await assert.rejects(denied[method](),/ASSISTANT_ACCESS_DENIED/);assert.equal(denied.calls.length,0);const wrong=fixture({foreignResult:true});await assert.rejects(wrong[method](),/ASSISTANT_ACCESS_DENIED/);assert.equal(wrong.calls.includes('moderation'),false);}
});
test('unavailable moderation and invalid public links fail closed; withdrawal makes no provider call',async()=>{
 await assert.rejects(fixture({moderation:'review'}).prepare(),/ASSISTANT_CONTENT_REVIEW_REQUIRED/);
 const f=fixture();await assert.rejects(f.prepare(args('marketing_draft',{source,copies:{...copies,en:{...copies.en,body:'Visit https://foreign.example'}}},null)),/ASSISTANT_INVALID_INPUT/);assert.equal(f.calls.includes('moderation'),false);
 const cancel=fixture();await cancel.prepare(args('marketing_cancel',{}));assert.deepEqual(cancel.calls,['preview_gc_business_operation']);
});
test('old marketing proposals reauthorize the current business and owner before replay',async()=>{
 const scope=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}})('src/lib/assistantProfessionalScope.ts');
 const f=fixture();await scope.assertAssistantProposalScope(f.context,'prepare_marketing_change',args('marketing_cancel',{}));assert.deepEqual(f.calls,['read_gc_business_marketing']);
 for(const options of [{owner:false},{foreignResult:true}])await assert.rejects(scope.assertAssistantProposalScope(fixture(options).context,'prepare_marketing_change',args('marketing_cancel',{})),/ASSISTANT_ACCESS_DENIED/);
});
test('publication confirmation requires a human review flag and rechecks moderation before writing',async()=>{
 const calls=[],arguments_=args('marketing_publish',{scheduled_at:'2098-01-01T12:00:00Z',expires_at:'2098-01-02T12:00:00Z'}),payload={copies,operation:'marketing_publish'};
 const context={isOwner:true,salon:{id,subscription_status:'active'},user:{id:'owner'},admin:{
  from(table){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:table==='subscriptions'?{status:'active'}:{tool:'prepare_marketing_change',arguments:arguments_,execution_payload:payload}}}};return q;},
  async rpc(name){calls.push(name);if(name==='p0_actor_has_permission')return {data:true};if(name==='read_gc_business_marketing')return {data:{salon_id:id}};if(name==='preview_gc_business_operation')return {data:{salon_id:id,before:{},payload}};if(name==='confirm_gc_assistant_request')return {data:{verified:true,result:{status:'scheduled'}}};throw Error(name);}
 }};
 const server=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/contentModerationServer':{async moderatePublicContent(){calls.push('moderation');return {outcome:'allow'};}}})('src/lib/gcAssistantServer.ts');
 await assert.rejects(server.confirmAssistantTool(context,id,'a'.repeat(64),false),/ASSISTANT_MARKETING_REVIEW_REQUIRED/);assert.equal(calls.includes('confirm_gc_assistant_request'),false);
 calls.length=0;assert.equal((await server.confirmAssistantTool(context,id,'a'.repeat(64),false,true)).verified,true);assert.deepEqual(calls,['p0_actor_has_permission','read_gc_business_marketing','preview_gc_business_operation','moderation','confirm_gc_assistant_request']);
});
test('marketing task reads remain in their active task and preserve all four fallback languages',()=>{
 const {continuesActiveTask}=load('src/lib/assistantActiveTask.ts');assert.equal(continuesActiveTask({tool:'prepare_marketing_change'},{task_tool:'prepare_marketing_change',plan:{tool:'get_marketing_records'}}),true);assert.equal(continuesActiveTask({tool:'prepare_manual_appointment'},{task_tool:'prepare_marketing_change',plan:{tool:'get_marketing_records'}}),false);
 const {presentAssistantResult}=load('src/lib/gcAssistantPresentation.ts');const values=['en','fr','es','zh-CN'].map(locale=>presentAssistantResult('get_marketing_records',{total:3},locale).message);assert.equal(new Set(values).size,4);for(const value of values)assert.match(value,/3/);
});
