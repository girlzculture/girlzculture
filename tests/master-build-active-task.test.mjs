import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {continuesActiveTask,taskSummary}=load('src/lib/assistantActiveTask.ts');
const {ownerPlannerSchema,parseOwnerPlannerResponse}=load('src/lib/gcAssistantPlannerProtocol.ts');
const {readActiveTask,rememberTask,endActiveTask}=load('src/lib/assistantActiveTaskServer.ts');
const active={id:'task-a',tool:'prepare_manual_appointment',permission:'bookings',revision:3,user_context:[{request_id:'first',text:'Create a walk-in for Alma Aba, Thursday September 24, 3:30 PM, any stylist, any service'}],request_ids:['first','read-1']};
test('active walk-in permits only preparation and its explicit read dependencies',()=>{
 for(const tool of ['get_services_and_prices','get_professionals','get_availability','get_calendar_gaps','get_bookings','prepare_manual_appointment'])assert.equal(continuesActiveTask(active,{task_tool:active.tool,plan:{tool}}),true,tool);
 for(const plan of [{task_tool:null,plan:{tool:'get_earnings_summary'}},{task_tool:active.tool,plan:{tool:'get_earnings_summary'}},{task_tool:'prepare_professional_draft',plan:{tool:'get_professionals'}},{task_tool:active.tool,navigate:'earnings'}])assert.equal(continuesActiveTask(active,plan),false);
 assert.equal(continuesActiveTask(active,{task_tool:active.tool,clarification:'Which day?'}),true);
});
test('task summary keeps exact original time and any choices without exposing internal history',()=>{
 assert.deepEqual(taskSummary(active),{id:active.id,tool:active.tool,revision:3,label:active.user_context[0].text});
});
test('tracked planner envelope requires an authorized action target and preserves ordinary protocol strictness',()=>{
 const grants=new Set(['bookings','styles']);const schema=ownerPlannerSchema(grants,false,true);assert.ok(schema.required.includes('task_tool'));
 const wire={language_switch:null,task_tool:'prepare_manual_appointment',decision:{clarification:'Which phone number should I use?'}};
 assert.equal(parseOwnerPlannerResponse(JSON.stringify(wire),grants,false,true).task_tool,'prepare_manual_appointment');
 for(const patch of [{task_tool:'get_bookings'},{task_tool:'prepare_professional_archive'},{task_tool:undefined},{unexpected:true}])assert.throws(()=>parseOwnerPlannerResponse(JSON.stringify({...wire,...patch}),grants,false,true));
 assert.throws(()=>parseOwnerPlannerResponse(JSON.stringify(wire),grants,false));
});
function context({data=active,allowed=true}={}){
 const calls=[];const ctx={salon:{id:'business-a'},user:{id:'owner-a'},admin:{from(table){assert.equal(table,'gc_assistant_active_tasks');return{select(){return this;},eq(...args){calls.push(args);return this;},maybeSingle:async()=>({data,error:null})};},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='p0_actor_has_permission'?allowed:name==='end_gc_assistant_task'?true:active};}}};return{ctx,calls};
}
test('unfinished task is fetched only for the authenticated tenant and actor, with a fresh permission check',async()=>{
 const f=context();assert.equal((await readActiveTask(f.ctx)).id,active.id);assert.deepEqual(f.calls.slice(0,3),[['salon_id','business-a'],['actor_id','owner-a'],['status','active']]);assert.equal(f.calls[3].args.p_permission,'bookings');
 await assert.rejects(()=>readActiveTask(context({allowed:false}).ctx),/ASSISTANT_ACCESS_DENIED/);
 await assert.rejects(()=>readActiveTask(context({data:{...active,permission:'overview'}}).ctx),/ASSISTANT_ACCESS_DENIED/);
});
test('task progress and explicit cancellation carry server scope and the current revision',async()=>{
 const f=context();await rememberTask(f.ctx,active,active.tool,'next','Keep exactly 3:30 PM.');const save=f.calls[0];assert.equal(save.name,'advance_gc_assistant_task');assert.equal(save.args.p_salon,'business-a');assert.equal(save.args.p_actor,'owner-a');assert.equal(save.args.p_revision,3);assert.equal(save.args.p_text,'Keep exactly 3:30 PM.');
 await endActiveTask(f.ctx,active,null);assert.deepEqual(f.calls[1],{name:'end_gc_assistant_task',args:{p_id:'task-a',p_salon:'business-a',p_actor:'owner-a',p_revision:3,p_completed_request:null}});
});


import {typescriptLoader} from './helpers/load-typescript.mjs';
const requestId='33000000-0000-4000-8000-000000000001';
function routeFixture(planned,task=active){
 const calls=[];const ctx={user:{id:'owner-a',user_metadata:{}},salon:{id:'business-a',time_zone:'America/New_York'},admin:{}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>ctx},
  '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
  '@/lib/assistantActiveTaskServer':{readActiveTask:async()=>task,rememberTask:async(...args)=>{calls.push({save:args});return task;},endActiveTask:async(...args)=>{calls.push({end:args});}},
  '@/lib/gcAssistantPlanningServer':{planOwnerRequest:async input=>{calls.push({plan:input});return input.answerOnly?{reply:'The authorized fact.'}:planned;}},
  '@/lib/gcAssistantServer':{executeAssistantTool:async(context,input)=>{calls.push({execute:input,context});return{request:{id:requestId}};},confirmAssistantTool:async()=>({tool:active.tool,verified:true})},
  '@/lib/platformErrors':{capturePlatformError:async()=> 'SAFE-TASK-REFERENCE',safeFailure:()=>Response.json({code:'FAIL'},{status:503})},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_profile,handler)=>handler},
 });
 const route=load('src/app/api/salon/assistant/route.ts');
 return{calls,async send(body={}){const response=await route.POST(new Request('https://app.test/api/salon/assistant',{method:'POST',body:JSON.stringify({action:'plan',request_id:requestId,locale:'en',text:'Show my finances',previous_request_ids:[],task_tracking:true,...body})}));return{status:response.status,body:await response.json()};}};
}

test('unrelated finance request cannot execute or overwrite an unfinished booking, including a falsely matching task marker',async()=>{
 for(const task_tool of [null,active.tool]){
  const f=routeFixture({task_tool,plan:{tool:'get_earnings_summary',args:{}}});const result=await f.send();
  assert.equal(result.status,200);assert.equal(result.body.task_switch_required,true);assert.equal(result.body.active_task.label,active.user_context[0].text);
  assert.equal(f.calls.filter(c=>c.execute||c.save).length,0);
 }
 const quick=routeFixture({});const result=await quick.send({action:'tool',text:undefined,previous_request_ids:undefined,tool:'get_earnings_summary',args:{}});
 assert.equal(result.body.task_switch_required,true);assert.equal(quick.calls.length,0);
});

test('related clarification retains the original server task and the authenticated context',async()=>{
 const f=routeFixture({task_tool:active.tool,clarification:'Keep 3:30 PM; which contact number?'});
 const result=await f.send({text:'Keep 3:30 PM'});assert.equal(result.status,200);assert.equal(result.body.active_task.id,active.id);
 assert.equal(f.calls[0].plan.activeTask,active);assert.equal(f.calls[0].plan.salonId,'business-a');assert.equal(f.calls[0].plan.userId,'owner-a');
 assert.equal(f.calls[1].save[1],active);assert.equal(f.calls[1].save[4],'Keep 3:30 PM');
 assert.equal(f.calls.filter(c=>c.execute).length,0);
});

test('only a confirmed request belonging to the active task completes it',async()=>{
 const current={...active,user_context:[{request_id:requestId,text:'Original appointment'}]};
 const own=routeFixture({},current);await own.send({action:'confirm',text:undefined,previous_request_ids:undefined,confirm:true,policy_reviewed:true,digest:'a'.repeat(64)});assert.equal(own.calls.filter(c=>c.end).length,1);
 const other=routeFixture({});await other.send({action:'confirm',text:undefined,previous_request_ids:undefined,confirm:true,policy_reviewed:true,digest:'a'.repeat(64)});assert.equal(other.calls.filter(c=>c.end).length,0);
});
