import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const id='18000000-0000-4000-8000-000000000021';
function fixture({failConfirm=false,failDelivery=false,deliveryWarnings=[]}={}){
 const calls=[],incidents=[];const context={admin:{},user:{id:'owner'},salon:{id:'own-business'}};let core;
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},
  '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
  '@/lib/operationalMonitoring':{withOperationalMonitoring:(_profile,handler)=>handler,routeMonitoringProfile(){}},
  '@/lib/platformErrors':{capturePlatformError:async input=>{incidents.push(input);return id;},safeFailure:()=>Response.json({code:'ERROR'},{status:500})},
  '@/lib/gcAssistantPlanningServer':{planOwnerRequest:async()=>({plan:{tool:'prepare_booking_reschedule_proposal',args:{}},response_locale:'en'})},
  '@/lib/gcAssistantServer':{executeAssistantTool:async()=>{calls.push('draft');return {preview_required:true,request:{id}};},confirmAssistantTool:async()=>{calls.push('confirm');if(failConfirm)throw new core.AssistantError('ASSISTANT_READBACK_FAILED',409);return {verified:true,tool:'prepare_booking_reschedule_proposal',result:{proposal_id:id,booking_id:id,status:'Pending'}};}},
  '@/lib/assistantBookingReschedule':{deliverAssistantReschedule:async(c,result)=>{assert.equal(c,context);assert.equal(result.proposal_id,id);assert.equal(calls.at(-1),'confirm');calls.push('delivery');if(failDelivery)throw Error('PRIVATE provider failure');return deliveryWarnings;}},
 });core=load('src/lib/gcAssistantCore.ts');const route=load('src/app/api/salon/assistant/route.ts');
 return {calls,incidents,request:body=>route.POST(new Request('https://girlzculture.example/api/salon/assistant',{method:'POST',body:JSON.stringify({request_id:id,locale:'en',...body})}))};
}
test('planning and preview route do not invoke customer delivery',async()=>{
 const f=fixture();const response=await f.request({action:'plan',text:'Move Sarah to 3 PM',previous_request_ids:[]});assert.equal(response.status,200);assert.deepEqual(f.calls,['draft']);
});
test('verified confirmation alone invokes the existing delivery stage and exposes no management URL',async()=>{
 const f=fixture({deliveryWarnings:[{code:'RESCHEDULE_NOTIFICATION_FAILED',request_id:id}]});const response=await f.request({action:'confirm',digest:'a'.repeat(64),confirm:true,policy_reviewed:false});const body=await response.json();assert.equal(response.status,200);assert.equal(body.verified,true);assert.deepEqual(f.calls,['confirm','delivery']);assert.equal(body.warnings[0].request_id,id);assert.doesNotMatch(JSON.stringify(body),/token|manageUrl|PRIVATE/);
});
test('failed durable readback sends nothing and preserves the exact protected incident reference',async()=>{
 const f=fixture({failConfirm:true});const response=await f.request({action:'confirm',digest:'a'.repeat(64),confirm:true,policy_reviewed:false});assert.equal(response.status,409);assert.deepEqual(f.calls,['confirm']);const body=await response.json();assert.equal(body.code,'ASSISTANT_READBACK_FAILED');assert.equal(body.request_id,id);assert.equal(response.headers.get('X-Request-ID'),id);
});
test('notification failure preserves verified pending proposal with truthful warning and exact incident',async()=>{
 const f=fixture({failDelivery:true});const response=await f.request({action:'confirm',digest:'a'.repeat(64),confirm:true,policy_reviewed:false});const body=await response.json();assert.equal(response.status,200);assert.equal(body.verified,true);assert.equal(body.result.status,'Pending');assert.equal(body.warnings[0].code,'RESCHEDULE_NOTIFICATION_FAILED');assert.equal(body.warnings[0].request_id,id);assert.equal(f.incidents[0].action,'assistant-reschedule-notification');assert.doesNotMatch(JSON.stringify(body),/PRIVATE|token|manageUrl/);
});
