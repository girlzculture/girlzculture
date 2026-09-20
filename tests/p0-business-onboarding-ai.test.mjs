import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {parseOnboardingAi}=load('src/lib/businessOnboardingAiProtocol.ts');
const {redactSensitiveText}=loadNodeTypescript(process.cwd(),{'@/i18n/dashboard-source-catalog':{DASHBOARD_SOURCE_MESSAGES:{}}})('src/lib/aiAutomationServer.ts');
const source='Maison Étoile offers Silk press at $125 for 90 minutes. Monday 09:00–17:00. Aisha is a braiding professional. Please ask before bringing guests.';
const suggestion=()=>({identity:[{field:'name',value:'Maison Étoile',quote:'Maison Étoile offers Silk press'}],services:[{name:'Silk press',price_text:'$125',duration_text:'90 minutes',quote:'Silk press at $125 for 90 minutes.'}],hours:[{day_text:'Monday',open:'09:00',close:'17:00',closed_text:null,quote:'Monday 09:00–17:00.'}],team:[{name:'Aisha',bio:'braiding professional',quote:'Aisha is a braiding professional.'}],unresolved:['Please ask before bringing guests.']});
const parse=(value=suggestion(),text=source)=>parseOnboardingAi(JSON.stringify(value),text);

test('AI structures exact multilingual owner facts with evidence and unresolved policy text',()=>{
 const result=parse();assert.equal(result.facts.identity.name,'Maison Étoile');assert.deepEqual(result.facts.services,[{name:'Silk press',price:125,minutes:90,group_id:null}]);assert.deepEqual(result.facts.hours,{Mon:{closed:false,open:'09:00',close:'17:00'}});assert.deepEqual(result.facts.photos,[]);assert.equal(result.facts.policies,null);assert.equal(result.evidence[1].quote,suggestion().services[0].quote);assert.deepEqual(result.unresolved,['Please ask before bringing guests.']);
 for(const name of ['Salón Étoile','星光沙龙']) {const data=suggestion();data.identity[0]={field:'name',value:name,quote:name};assert.equal(parse(data,source+' '+name).facts.identity.name,name);}
});
test('fabricated names, money, quotes, IDs and added application actions fail before a draft can be saved',()=>{
 for(const change of [v=>v.services[0].price_text='$95',v=>v.identity[0].value='Other business',v=>v.services[0].quote='Silk press at $95',v=>v.services[0].group_id='arbitrary',v=>v.publish=true,v=>v.identity.push({field:'phone',value:'123',quote:'123'})]) {const value=suggestion();change(value);assert.throws(()=>parse(value),/UNGROUNDED/);}
});
test('numeric substring and partial-word quotes cannot invent a lower price or truncated name',()=>{
 const value={identity:[],services:[{name:'Braids',price_text:'$125',duration_text:null,quote:'Braids $125'}],hours:[],team:[],unresolved:[]};
 assert.throws(()=>parse(value,'Braids $1250'),/UNGROUNDED/);
 const identity={identity:[{field:'name',value:'Salon',quote:'Salon'}],services:[],hours:[],team:[],unresolved:[]};assert.throws(()=>parse(identity,'Salonica'),/UNGROUNDED/);
});
test('from-prices and duration ranges stay unknown rather than becoming a fixed booking amount',()=>{
 const value={identity:[],services:[{name:'Braids',price_text:'$125',duration_text:'90 minutes',quote:'Braids from $125, 60–90 minutes'}],hours:[],team:[],unresolved:[]};
 const parsed=parse(value,value.services[0].quote);assert.equal(parsed.facts.services[0].price,null);assert.equal(parsed.facts.services[0].minutes,null);
});
test('both range price endpoints and open-ended plus prices remain unknown',()=>{
 for(const [quote,price_text] of [['Braids $100–$125','$125'],['Braids $100–$125','$100'],['Braids $125+','$125']]) {const value={identity:[],services:[{name:'Braids',price_text,duration_text:null,quote}],hours:[],team:[],unresolved:[]};assert.equal(parse(value,quote).facts.services[0].price,null,quote+' '+price_text);}
});
test('unknown currency, redacted values, invented hours, duplicate days and unsafe policy defaults fail closed',()=>{
 for(const change of [v=>v.services[0].price_text='125',v=>v.hours[0].open='09:15',v=>v.hours.push(v.hours[0]),v=>v.policies={cancellation_notice_hours:24},v=>v.identity[0]={field:'name',value:'[REDACTED]',quote:'[REDACTED]'}]) {const value=suggestion();change(value);assert.throws(()=>parse(value,source+' [REDACTED]'),/UNGROUNDED/);}
});
test('explicit durations in hours normalize arithmetically but unknown photos and policies remain empty',()=>{
 const value=suggestion();value.services[0]={...value.services[0],duration_text:'1.5 hours',quote:'Silk press at $125 for 1.5 hours.'};assert.equal(parse(value,source+' '+value.services[0].quote).facts.services[0].minutes,90);
});
function fixture(t,options={}) {
 const state={rpc:[],http:[],ledger:[],...options};
 const admin={rpc:async(name,args)=>{state.rpc.push({name,args});if(name==='p0_business_plan_active')return{data:state.plan!==false,error:null};if(name==='p0_actor_has_permission')return{data:state.permission!==false,error:null};if(name==='reserve_gc_assistant_usage')return state.budget===false?{error:{message:'budget'},data:null}:{error:null,data:'reservation-own'};throw Error('unexpected RPC');},from:table=>{
  if(table==='ai_automation_features')return{select:()=>({eq:()=>({maybeSingle:async()=>({error:null,data:{is_enabled:state.enabled!==false,provider_key:'openai',model_key:state.model||'gpt-5.4-nano',timeout_ms:20000}})})})};
  if(table==='ai_usage_events')return{update:value=>({eq:async(key,id)=>{state.ledger.push({value,key,id});return{error:state.auditFailure?{message:'private db detail'}:null};}})};
  throw Error('unexpected table '+table);
 }};
 const ai=loadNodeTypescript(process.cwd(),{
  '@/lib/aiAutomationServer':{approvedAiModels:()=>['gpt-5.4-nano'],approvedAiProviders:()=>['openai'],aiProviderConfigured:()=>state.configured!==false,redactSensitiveText},
  '@/lib/openAiServer':{openAiApiKey:()=> 'fixture-key-never-a-real-secret',openAiApiUrl:()=> 'https://api.openai.com/v1/chat/completions',openAiChatCompletionText:p=>p.choices[0].message.content,openAiHttpFailure:async()=> 'OPENAI_HTTP_401_AUTHENTICATION'},
 })('src/lib/businessOnboardingAiServer.ts');
 const old=globalThis.fetch;globalThis.fetch=async(url,config)=>{state.http.push({url,config,body:JSON.parse(config.body)});if(state.networkFailure)throw Error('unfiltered credential-like provider detail');if(state.status)return new Response('sensitive raw provider body',{status:state.status});return Response.json({choices:[{finish_reason:state.finish||'stop',message:{content:JSON.stringify(state.output||suggestion())}}]});};t.after(()=>{globalThis.fetch=old;});
 const context={admin,user:{id:'own-user'},salon:{id:'own-business'},isOwner:state.owner!==false};
 return{state,run:(text=source)=>ai.structureOnboardingWithAi(context,text)};
}
test('real provider adapter uses only owner-supplied text, existing model and governed allowance',async t=>{
 const f=fixture(t);const result=await f.run(source+'\nPhone: (212) 555-0198\ncustomer@example.test');assert.equal(result.model,'gpt-5.4-nano');assert.equal(result.facts.identity.phone,'+12125550198');assert.equal(f.state.http.length,1);const call=f.state.http[0];assert.equal(call.url,'https://api.openai.com/v1/chat/completions');assert.equal(call.body.store,false);assert.equal(call.config.redirect,'error');assert.equal(call.body.response_format.json_schema.strict,true);assert.equal(call.body.model,'gpt-5.4-nano');assert.doesNotMatch(call.body.messages[1].content,/555-0198|customer@example/);assert.equal(call.body.messages.length,2);assert.ok(f.state.rpc.some(v=>v.name==='reserve_gc_assistant_usage'&&v.args.p_user==='own-user'&&v.args.p_cost_cents>0));assert.deepEqual(f.state.ledger,[{value:{outcome:'completed',safe_error_code:null},key:'id',id:'reservation-own'}]);assert.equal(result.source_sha256.length,64);
});
test('owner identity and current business permission stop denied requests before reservation/provider access',async t=>{
 for(const options of [{owner:false},{permission:false},{plan:false}]) {const f=fixture(t,options);await assert.rejects(f.run(),/OWNER_REQUIRED|ACCESS_DENIED|PLAN_REQUIRED/);assert.equal(f.state.http.length,0);assert.ok(!f.state.rpc.some(v=>v.name==='reserve_gc_assistant_usage'));}
});
test('disabled, unconfigured or unapproved model cannot call the provider or introduce a fallback model',async t=>{
 for(const options of [{enabled:false},{configured:false},{model:'unapproved-model'}]) {const f=fixture(t,options);await assert.rejects(f.run(),/AI_UNAVAILABLE/);assert.equal(f.state.http.length,0);}
});
test('governed budget refusal prevents provider calls and preserves the existing limits',async t=>{const f=fixture(t,{budget:false});await assert.rejects(f.run(),/AI_BUDGET_LIMIT/);assert.equal(f.state.http.length,0);assert.equal(f.state.ledger.length,0);});
test('provider HTTP failure records only the allowlisted diagnostic and never retries',async t=>{const f=fixture(t,{status:401});await assert.rejects(f.run(),error=>error.message==='ONBOARDING_AI_UNAVAILABLE');assert.equal(f.state.http.length,1);assert.equal(f.state.ledger[0].value.outcome,'failed');assert.equal(f.state.ledger[0].value.safe_error_code,'ONBOARDING_OPENAI_HTTP_401_AUTHENTICATION');assert.doesNotMatch(JSON.stringify(f.state.ledger),/sensitive raw/);});
test('network failure does not expose arbitrary provider detail, and the reservation is retained',async t=>{const f=fixture(t,{networkFailure:true});await assert.rejects(f.run(),error=>error.message==='ONBOARDING_AI_UNAVAILABLE');assert.equal(f.state.http.length,1);assert.equal(f.state.ledger[0].value.outcome,'failed');assert.doesNotMatch(JSON.stringify(f.state.ledger),/credential-like/);});
test('grounding rejection, truncated model output and audit failure cannot claim success',async t=>{
 for(const options of [{output:{...suggestion(),publish:true}},{finish:'length'},{auditFailure:true}]) {const f=fixture(t,options);await assert.rejects(f.run(),/AI_UNGROUNDED|AI_AUDIT_UNAVAILABLE/);assert.equal(f.state.http.length,1);}
});
