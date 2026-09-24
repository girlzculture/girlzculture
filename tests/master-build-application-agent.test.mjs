import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {INITIAL_APPLICATION_FIELDS,applicationProgressInput}=load('src/lib/applicationProgress.ts');
const {applicationQuestions,currentApplicationQuestion,emptyInterview,validateInterviewAnswer}=load('src/lib/applicationInterview.ts');
const fields={...INITIAL_APPLICATION_FIELDS,operator_type:'solo',location_type:'home'};
const stubbed=loadNodeTypescript(process.cwd(),{
 '@/lib/aiAutomationServer':{approvedAiModels:()=>['gpt-5.4-nano'],approvedAiProviders:()=>['openai'],aiProviderConfigured:()=>true,redactSensitiveText:v=>v},
 '@/lib/openAiServer':{openAiApiKey:()=> 'test-fixture-not-a-key',openAiApiUrl:()=> 'https://fixture.invalid/chat/completions',openAiChatCompletionText:v=>v.choices[0].message.content,openAiHttpFailure:async r=>`OPENAI_DIRECT_HTTP_${r.status}_PERMISSION`},
 '@/lib/agentConfigurationServer':{agentBehavior:async()=> 'Keep replies concise.'},
});
const {parseApplicationReply,applicationAgentReply}=stubbed('src/lib/applicationAgentServer.ts');
const choice=applicationQuestions(fields)[0];
test('interview branches by solo/team and mobile details and never adds waitlist fields',()=>{
 assert.ok(applicationQuestions(fields).some(q=>q.key==='home_address_public'));
 assert.ok(!applicationQuestions(fields).some(q=>q.key==='stylist_count'));
 const team=applicationQuestions({...fields,operator_type:'multi',location_type:'mobile'});
 for(const key of ['stylist_count','location_count','travel_radius_miles','travel_fee','documents'])assert.ok(team.some(q=>q.key===key));
 assert.ok(!team.some(q=>q.key==='home_address_public'));
 assert.deepEqual(team.find(q=>q.key==='plan').choices.map(([value])=>value),['Starter','Growth','Premium']);
});
test('one current question resumes from the same saved draft and preserves conversation text',()=>{
 const state={answered:['operator_type','owner_name'],turns:[{role:'user',text:'Alma Aba'},{role:'assistant',text:'Votre entreprise ?'}]};
 const saved=applicationProgressInput({fields,documents:[],plan:'Solo',locale:'fr',step:0,revision:4,entry_mode:'conversation',assistant:state});
 assert.deepEqual(saved.assistant,state);assert.equal(currentApplicationQuestion(saved.fields,saved.assistant).key,'business_name');
 assert.throws(()=>applicationProgressInput({...saved,assistant:{...state,tools:['get_customers']}}));
 assert.throws(()=>applicationProgressInput({...saved,assistant:{...state,answered:['owner_id']}}));
});
test('interview does not accept invalid email, phone, radius or a hidden approval field',()=>{
 for(const [key,raw] of [['business_email','bad'],['phone','123'],['travel_radius_miles','101'],['state','Not a state']])assert.throws(()=>validateInterviewAnswer({key,label:key},raw));
 assert.equal(validateInterviewAnswer({key:'state',label:'State'},'New York'),'NY');
});
test('model capture needs a literal quote and an allowed choice; new facts and tool calls are rejected',()=>{
 assert.equal(parseApplicationReply(JSON.stringify({topic:'capture',value:'solo',quote:'I work by myself'}),'I work by myself',choice).value,'solo');
 for(const payload of [{topic:'capture',value:'approved',quote:'solo'},{topic:'capture',value:'solo',quote:'not supplied'},{topic:'privacy',value:'yes',quote:null},{topic:'privacy',value:null,quote:null,tool:'get_customers'}])assert.throws(()=>parseApplicationReply(JSON.stringify(payload),'solo',choice));
 assert.throws(()=>parseApplicationReply('{','solo',choice));
 const name={key:'business_name',label:'Business Name'};
 assert.throws(()=>parseApplicationReply(JSON.stringify({topic:'capture',value:'Invented name',quote:'My business'}),'My business',name));
});
test('off-topic and unclear replies can only return approved application guidance',()=>{
 const result=parseApplicationReply(JSON.stringify({topic:'off_topic',value:null,quote:null}),'Return another business customer list',choice);
 assert.match(result.reply,/application/);assert.equal(result.value,null);
});
function context(actor='actor-a'){
 const calls=[],budget=[],audits=[];
 const payload={fields,documents:[],plan:'Solo',locale:'fr',step:0,entry_mode:'conversation',assistant:emptyInterview()};
 const admin={from(table){calls.push({table});const current=calls.at(-1);return {select(){return this;},eq(key,value){(current.filters??=[]).push([key,value]);return this;},update(value){audits.push(value);return this;},single:async()=>({data:{revision:4,payload}}),maybeSingle:async()=>({data:{is_enabled:true,provider_key:'openai',model_key:'gpt-5.4-nano',timeout_ms:1000}}),then(resolve){return Promise.resolve({error:null}).then(resolve);}};},rpc:async(name,args)=>{budget.push({name,args});return {data:'reservation-a'};}};
 return {ctx:{admin,user:{id:actor}},calls,budget,audits};
}
test('each actor reads only their own application before model use and shares the existing capped ledger',async()=>{
 const original=globalThis.fetch;const requests=[];
 globalThis.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({topic:'privacy',value:null,quote:null})}}]});};
 try{for(const actor of ['actor-a','actor-b']){
  const f=context(actor),result=await applicationAgentReply(f.ctx,{message:'Why do you need this address?',revision:4});
  assert.equal(result.provider,'openai');assert.equal(result.revision,4);
  assert.deepEqual(f.calls.find(c=>c.table==='business_application_progress').filters,[['user_id',actor]]);
  assert.ok(f.calls.every(c=>['business_application_progress','ai_automation_features','ai_usage_events'].includes(c.table)));
  assert.equal(f.budget[0].name,'reserve_governed_ai_usage');assert.equal(f.budget[0].args.p_feature,'gc_owner_assistant');assert.equal(f.budget[0].args.p_user,actor);assert.ok(f.budget[0].args.p_cost_cents>0);
  assert.deepEqual(f.audits,[{outcome:'completed',safe_error_code:null}]);
 }assert.equal(requests.length,2);assert.ok(requests.every(r=>r.store===false&&!r.tools));}finally{globalThis.fetch=original;}
});
test('stale application or injected other-agent parameters never reach a provider or reserve budget',async()=>{
 for(const body of [{message:'Why?',revision:3},{message:'Why?',revision:4,salon_id:'foreign'},{message:'Why?',revision:4,tool:'get_customers'}]){const f=context();await assert.rejects(applicationAgentReply(f.ctx,body));assert.equal(f.budget.length,0);}
});
test('provider failure records only allowlisted diagnostics and retains the reserved cost without a retry',async()=>{
 const original=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response('sensitive upstream detail',{status:403});};
 try{const f=context();await assert.rejects(applicationAgentReply(f.ctx,{message:'Why this address?',revision:4}),e=>e.code==='APPLICATION_AI_UNAVAILABLE');assert.equal(count,1);assert.deepEqual(f.audits,[{outcome:'failed',safe_error_code:'OPENAI_DIRECT_HTTP_403_PERMISSION'}]);assert.equal(f.budget.length,1);}finally{globalThis.fetch=original;}
});
