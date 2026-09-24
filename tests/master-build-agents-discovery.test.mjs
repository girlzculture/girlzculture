import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {parseSearchTimeWindow,validateSearchTimeWindow,searchSlotMatches}=load('src/lib/searchTimeWindow.ts');
const {parseDecisionSearchIntent,publicBusinessFilters}=load('src/lib/decisionSearchIntentCore.ts');
test('explicit clock windows in all four languages preserve exact minutes',()=>{
 for(const text of ['between 9am and 3pm','de 9h à 15h','entre 9:00 y 15:00','从9点到15点'])assert.deepEqual(parseSearchTimeWindow(text),{start:'09:00',end:'15:00'});
 assert.deepEqual(parseSearchTimeWindow('from 9:15am to 3:30pm'),{start:'09:15',end:'15:30'});
 for(const text of ['between 9 and 3','from 13pm to 15pm','from 15:00 to 09:00'])assert.equal(parseSearchTimeWindow(text),null);
 assert.throws(()=>validateSearchTimeWindow('09:99','15:00'));
});
test('availability filtering requires the entire service within the requested window and honors translated period filters',()=>{
 const window={start:'09:00',end:'15:00'};
 assert.equal(searchSlotMatches('08:45','any',window,60),false);
 assert.equal(searchSlotMatches('14:30','any',window,60),false);
 assert.equal(searchSlotMatches('14:00','any',window,60),true);
 assert.equal(searchSlotMatches('13:00','morning',null,30),false);
 const parsed=parseDecisionSearchIntent('Find hair braiding businesses in Harlem open between 9am and 3pm',[],{});
 assert.deepEqual(parsed.timeWindow,window);
 const translated=parseDecisionSearchIntent('Tresses disponibles',[],{timePeriod:'afternoon',startTime:'13:15',endTime:'16:45'});
 assert.equal(translated.timePeriod,'afternoon');assert.deepEqual(translated.timeWindow,{start:'13:15',end:'16:45'});
});
test('Engine behavior reads only published keys for the chosen agent and rejects unsafe values',async()=>{
 const {agentBehavior}=load('src/lib/agentConfigurationServer.ts');
 for(const agent of ['business','customer','application']){
  const filters=[];const admin={from(table){assert.equal(table,'engine_settings');return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},in(k,v){filters.push([k,v]);return this;},abortSignal:async()=>({data:[{setting_key:`agents.${agent}.instructions`,published_value:'Brief, friendly answers.'}]})};}};
  assert.match(await agentBehavior(admin,agent),/Brief, friendly answers/);
  assert.deepEqual(filters,[['status','Published'],['setting_key',[`agents.${agent}.instructions`,`agents.${agent}.tool_guidance`,`agents.${agent}.routing`]]]);
 }
});
test('public concierge propagates explicit time windows and authoritative deposit quotes without reading private records',async()=>{
 const tables=[],searches=[];
 const admin={from(table){tables.push(table);const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve){
  const data=table==='ai_automation_features'?{is_enabled:false}:table==='engine_settings'?{published_value:false}:table==='master_styles'?[{id:'master-braids',name:'Braids'}]:table==='location_markets'?[{name:'Harlem',state_code:'NY',center_latitude:40.81,center_longitude:-73.94}]:[];
  return Promise.resolve({data}).then(resolve);
 }};return q;}};
 const isolated=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin},
  '@/lib/engineConfigServer':{getEngineNumber:async(k,v)=>v},
  '@/lib/aiAutomationServer':{approvedAiModels:()=>[],approvedAiProviders:()=>[],aiProviderConfigured:()=>false},
  '@/lib/decisionSearchServer':{runDecisionSearch:async input=>{searches.push(input);return {salons:[{id:'public-business',starting_price:200,deposit_amount:75,next_slot:null}],summary:'Verified public result'};}},
 });
 const {runBeautyConcierge,conciergeClarification,deterministicConciergeIntent,parseConciergeIntent}=isolated('src/lib/beautyConciergeServer.ts');
 const result=await runBeautyConcierge({prompt:'Find braiding in Harlem between 9am and 3pm',language:'en',origin:null});
 assert.equal(result.salons[0].deposit_amount,75);assert.deepEqual([searches[0].filters.startTime,searches[0].filters.endTime],['09:00','15:00']);
 assert.ok(tables.every(t=>['ai_automation_features','engine_settings','master_styles','search_language_rules','location_markets'].includes(t)));
 assert.match(conciergeClarification('zh-CN','location'),/城市/);
 const mobile=await runBeautyConcierge({prompt:'braids from an independent professional at my home in Harlem',language:'en',origin:null});
 assert.equal(searches.at(-1).filters.independentOnly,true);assert.equal(searches.at(-1).filters.travelsOnly,true);
 await runBeautyConcierge({prompt:'include teams; not just mobile',language:'en',origin:{lat:40.81,lng:-73.94},previousIntent:mobile.intent});
 assert.equal(searches.at(-1).filters.independentOnly,false);assert.equal(searches.at(-1).filters.travelsOnly,false);
 const legacy=deterministicConciergeIntent('braids','en');delete legacy.independent_only;delete legacy.travels_only;
 assert.equal(parseConciergeIntent(legacy).travels_only,false,'prior search context remains compatible');
 assert.throws(()=>parseConciergeIntent({...legacy,travels_only:'false'}),/AI_INTENT_INVALID/);

 for(const [language,prompt]of [['en','Find businesses in Harlem'],['fr','Trouve des établissements à Harlem'],['es','Busca negocios en Harlem'],['zh-CN','查找哈莱姆的商家']]){
  const found=await runBeautyConcierge({prompt,language,origin:{lat:40.81,lng:-73.94}});
  assert.equal(found.clarification,null,language+' must not demand a service for business browsing');
  assert.equal(found.salons[0].id,'public-business');
  assert.equal(searches.at(-1).query,'','filter prose must not become an invented service name');
 }
 const follow=await runBeautyConcierge({prompt:'any price',language:'en',origin:{lat:40.81,lng:-73.94},previousIntent:{...mobile.intent,maximum_price:80}});
 assert.equal(follow.intent.maximum_price,null);
 assert.equal(searches.at(-1).query,'Braids','only the retained service is re-parsed; never the follow-up instruction');

});

test('independent and mobile criteria work in four languages and clear explicitly',()=>{
 for(const text of ['independent professional at my home','professionnelle indépendante à domicile','profesional independiente a domicilio','独立专业人士上门服务']){
  const flags=publicBusinessFilters(text);assert.equal(flags.independent,true,text);assert.equal(flags.travels,true,text);
 }
 for(const text of ['include teams; not just mobile','avec des équipes; pas seulement à domicile','incluye equipos; no solo a domicilio','包括团队，不限上门']){
  const flags=publicBusinessFilters(text);assert.equal(flags.clearIndependent,true,text);assert.equal(flags.clearTravels,true,text);
 }
});
