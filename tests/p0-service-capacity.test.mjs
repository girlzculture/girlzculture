import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const business='a2000000-0000-4000-8000-000000000001',actor='a2000000-0000-4000-8000-000000000002',service='a2000000-0000-4000-8000-000000000003',professional='a2000000-0000-4000-8000-000000000004',foreign='b2000000-0000-4000-8000-000000000001';
const date='2030-09-24';
const args={style_id:service,stylist_id:null,date,days:1,selected_options:[{group_id:'finish',values:['long']}]};
function fixture(options={}) {
 const calls=[],requests=[],denied=new Set(options.denied||[]),history=options.history||[];
 const hours=Object.fromEntries(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>[day,{open:'09:00',close:'19:00'}]));
 const tables={salons:[{id:business,user_id:options.staff?foreign:actor,time_zone:'America/New_York',status:'Active',is_discoverable:true,subscription_status:'active',accepting_bookings:true,hours,booking_settings:{},subscription_tier:'Premium'}],salon_team_members:[{id:'membership',salon_id:business,user_id:actor,status:'Active',stylist_id:professional}],styles:[{id:service,salon_id:business,name:'Own braids',base_price:100,duration_min_hours:1,duration_max_hours:1,buffer_minutes:15,archived_at:null,is_draft:false,option_groups:[{id:'finish',label:'Finish',required:true,selection:'single',options:[{value:'short',label:'Short',price_add:0,duration_add_minutes:0},{value:'long',label:'Long',price_add:0,duration_add_minutes:120}]}],...options.style}],stylists:options.roster||[{id:professional,salon_id:business,name:'Own professional',availability:hours,is_active:true,is_draft:false,assigned_service_ids:[service]}],bookings:options.bookings||[],booking_checkout_intents:options.intents||[],salon_blockouts:options.blockouts||[]};
 tables.gc_assistant_requests=history;tables.master_styles=[];
 const admin={async rpc(name,values){calls.push({rpc:name,values});options.onRpc?.(name,tables,denied);if(name==='reserve_gc_assistant_usage'){assert.equal(values.p_user,actor);return {data:'fixture-usage'};}assert.equal(values.p_salon,business);if(name==='p0_actor_has_permission')return {data:!denied.has(values.p_permission),error:null};if(name==='p0_business_plan_active')return {data:true};throw Error(`Unexpected RPC ${name}`);},from(table){let filters=[],fields=[],one=false;const q={select(value){fields=value.split(',');return q;},eq(key,value){filters.push([key,'eq',value]);return q;},is(key,value){filters.push([key,'eq',value]);return q;},in(key,value){filters.push([key,'in',value]);return q;},order(){return q;},limit(){return q;},update(){assert.equal(table,'ai_usage_events');return q;},lt(key,value){filters.push([key,'lt',value]);return q;},gt(key,value){filters.push([key,'gt',value]);return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},then(resolve,reject){return Promise.resolve().then(()=>{calls.push({table,filters,fields});options.onRead?.(table,tables,denied);if(table==='ai_automation_features')return {data:{is_enabled:true,provider_key:'openai',model_key:'fixture-model',timeout_ms:20000}};if(table==='ai_usage_events')return {data:null};assert.ok(tables[table],`Unexpected table ${table}`);let rows=tables[table].filter(row=>filters.every(([key,op,value])=>op==='in'?value.includes(row[key]):op==='lt'?row[key]<value:op==='gt'?row[key]>value:(row[key]??null)===value)).map(row=>fields[0]==='*'?row:Object.fromEntries(fields.map(key=>[key,row[key]??null])));if(options.response)rows=options.response(table,rows)||rows;return {data:one?rows[0]??null:rows,error:null,count:options.truncated===table?rows.length+1:rows.length};}).then(resolve,reject);}};return q;}};
 const clock=Date.parse(options.now||'2030-09-23T12:00:00Z');class ClockDate extends Date {constructor(...values){super(...(values.length?values:[clock]));}static now(){return clock;}}
 let contributionCalls=0;
 const loader=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,requireSalonOwner:async()=>{if(options.unauthorized)throw Error('Unauthorized');return context;}},'@/lib/contentModerationServer':{},'@/lib/engineConfigServer':{getEngineNumber:async(key,value)=>options.engine?.[key]??value},'@/lib/aiAutomationServer':{approvedAiModels:()=>['fixture-model'],approvedAiProviders:()=>['openai'],aiProviderConfigured:()=>true,redactSensitiveText:value=>value},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_profile,fn)=>fn},'@/lib/platformErrors':{capturePlatformError:async()=>({requestId:'a2000000-0000-4000-8000-000000000099'}),safeFailure:(message,reference,status,extra)=>Response.json({message,request_id:reference.requestId,...extra},{status})},'@/lib/businessServiceContributionServer':{readServiceContribution:async(ctx,from,to)=>{assert.equal(ctx.salon.id,business);assert.equal(from,'2030-08-01');assert.equal(to,'2030-08-28');contributionCalls++;if(options.contributionDenied)throw Error('CONTRIBUTION_ACCESS_DENIED');return {fingerprint:options.contributionChanged&&contributionCalls>1?'changed':'same',recommendations:options.noRecommendation?[]:[{service_id:service,contribution_cents:4000}]};}}},{URLSearchParams,Date:ClockDate,process:{env:{OPENAI_API_KEY:'fixture-only',AI_OWNER_INPUT_USD_PER_MILLION:'1',AI_OWNER_OUTPUT_USD_PER_MILLION:'4'}},fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(options.answerOnly?{reply:'Current selected-service openings.'}:{decision:{clarification:'Which saved option do you want?'},language_switch:null})}}]});}});
 const context={admin,user:{id:actor},salon:{id:business,time_zone:'America/New_York'},isOwner:!options.staff,teamMember:options.staff?{id:'membership',stylist_id:professional}:null};
 return {calls,tables,context,loader,requests,read:(input=args)=>loader('src/lib/gcAssistantServer.ts').readAssistantData(context,'get_availability',input),plan:()=>loader('src/lib/gcAssistantPlanningServer.ts').planOwnerRequest({context,admin,salonId:business,userId:actor,locale:'en',text:'Are those openings still available?',timeZone:'America/New_York',previousRequestIds:history.map(row=>row.id),conversation:[{role:'assistant',text:'OLD_PRIVATE_SLOT'}],answerOnly:options.answerOnly})};
}
test('selected long service duration must not claim late starts that cannot finish before closing',async()=>{
 const f=fixture(),result=await f.read();
 assert.equal(result.duration_minutes,180);
 assert.equal(result.slots.some(slot=>slot.time==='17:30'),false);
 assert.equal(result.slots.some(slot=>slot.time==='15:30'),true);
});
test('service start alternatives obey current checkout lead and advance limits',async()=>{
 const lead=await fixture({now:'2030-09-24T12:00:00Z',engine:{'booking.minimum_lead_minutes':120}}).read();
 assert.equal(lead.slots.some(slot=>slot.time==='09:00'),false);
 const beyond=await fixture({now:'2030-01-01T00:00:00Z'}).read();
 assert.equal(beyond.total,0);
});
test('required options and malformed saved duration are unavailable, never a minimum-only fit',async()=>{
 const missing=await fixture().read({...args,selected_options:[]});assert.equal(missing.available,false);assert.equal(missing.reason,'selection_required');assert.equal(missing.total,null);assert.equal(missing.slots.length,0);assert.equal(missing.option_groups[0].id,'finish');
 const range=await fixture({style:{duration_max_hours:3,option_groups:[]}}).read({...args,selected_options:[]});assert.equal(range.duration_minutes,180);assert.equal(range.duration_basis,'maximum_saved_duration');assert.equal(range.slots.some(s=>s.time==='17:30'),false);
 for(const style of [{duration_min_hours:null},{duration_max_hours:.5},{duration_min_hours:'1'},{option_groups:{bad:true}},{is_draft:true}])await assert.rejects(fixture({style}).read(),/SERVICE_CAPACITY_UNAVAILABLE/);
});
test('strict choices reject unknown IDs, duplicate choices, invalid dates, identities and model durations',async()=>{
 for(const patch of [{duration_minutes:15},{customer_id:actor},{salon_id:foreign},{days:8},{date:'2030-02-30'},{selected_options:[{group_id:'finish',values:['long','long']}]},{selected_options:[{group_id:'finish',values:[]},{group_id:'finish',values:['long']}]}])await assert.rejects(fixture().read({...args,...patch}),/ASSISTANT_INVALID/);
 const unavailable=await fixture().read({...args,selected_options:[{group_id:'foreign',values:['long']}]});assert.equal(unavailable.available,false);assert.equal(unavailable.reason,'selection_unavailable');assert.equal(unavailable.total,null);
 const core=fixture().loader('src/lib/gcAssistantCore.ts');assert.doesNotThrow(()=>core.validateTool('get_availability',{style_id:null,stylist_id:null,date}));assert.throws(()=>core.validateTool('get_availability',{style_id:null,stylist_id:null,date,days:7,selected_options:[]}),/ASSISTANT_INVALID/);
});
test('each required grant and current professional assignment is enforced before and after reads',async()=>{
 for(const permission of ['styles','availability']){const f=fixture({denied:[permission]});await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);assert.equal(f.calls.some(c=>c.table==='styles'),false);}
 await assert.rejects(fixture({staff:true}).read({...args,stylist_id:foreign}),/ASSISTANT_ACCESS_DENIED/);
 const scoped=await fixture({staff:true}).read();assert.ok(scoped.slots.every(slot=>slot.stylist_id===professional));
 const revoked=fixture({onRead:(table,_rows,denied)=>{if(table==='salon_blockouts')denied.add('styles');}});await assert.rejects(revoked.read(),/ASSISTANT_ACCESS_DENIED/);
 const moved=fixture({staff:true,onRead:(table,rows)=>{if(table==='salon_blockouts')rows.salon_team_members[0].stylist_id=foreign;}});await assert.rejects(moved.read(),/ASSISTANT_ACCESS_DENIED/);
});
test('foreign, truncated and changed source evidence fails closed with no cross-business customer query',async()=>{
 for(const table of ['styles','stylists','bookings','booking_checkout_intents','salon_blockouts']){
  const f=fixture({response:(name,rows)=>name===table?[{...(rows[0]||{}),id:foreign,salon_id:foreign}]:null});await assert.rejects(f.read(),/ASSISTANT_RECORD_NOT_FOUND|SCHEDULE_ACCESS_DENIED|SCHEDULE_EVIDENCE_INCOMPLETE/);
 }
 for(const truncated of ['stylists','bookings','booking_checkout_intents','salon_blockouts'])await assert.rejects(fixture({truncated}).read(),/SCHEDULE_EVIDENCE_INCOMPLETE/);
 let count=0;await assert.rejects(fixture({onRead:(table,rows)=>{if(table==='styles'&&++count===3)rows.styles[0].duration_max_hours=5;}}).read(),/SERVICE_CAPACITY_UNAVAILABLE/);
 const f=fixture();await f.read();for(const call of f.calls.filter(c=>['bookings','booking_checkout_intents','salon_blockouts'].includes(c.table))){assert.ok(call.filters.some(([key,,value])=>key==='salon_id'&&value===business));assert.equal(call.filters.some(([key])=>['customer_id','normalized_guest_email'].includes(key)),false);assert.ok(!call.fields.some(key=>/email|phone|name|price|amount/.test(key)));}
});
test('canonical professional assignments, working hours and draft/active state determine actual service fit',async()=>{
 const base=fixture().tables.stylists[0];for(const patch of [{assigned_service_ids:[]},{assigned_service_ids:[foreign]},{is_active:false},{is_draft:true},{availability:{}}]){const result=await fixture({roster:[{...base,...patch}]}).read();assert.equal(result.total,0);}
 const two=await fixture({roster:[base,{...base,id:'a2000000-0000-4000-8000-000000000005',name:'Second'}]}).read();const one=await fixture().read();assert.equal(two.total,one.total*2);assert.match(two.definition,/not additional appointment capacity/);
});
test('own bookings, pending holds and business-wide blocks subtract complete duration plus buffer',async()=>{
 const bookings=[{id:'booking',salon_id:business,stylist_id:professional,status:'Confirmed',appointment_datetime:'2030-09-24T16:00:00.000Z',blocked_until:'2030-09-24T17:00:00.000Z'}];
 const intents=[{id:'hold',salon_id:business,stylist_id:professional,status:'Pending',expires_at:'2030-09-30T12:00:00Z',appointment_datetime:'2030-09-24T19:00:00.000Z',blocked_until:'2030-09-24T20:00:00.000Z'}];
 const blockouts=[{id:'block',salon_id:business,stylist_id:null,starts_at:'2030-09-24T21:00:00.000Z',ends_at:'2030-09-24T23:00:00.000Z'}];
 const result=await fixture({bookings,intents,blockouts}).read();assert.equal(result.total,0);
 const malformed=[{...bookings[0],blocked_until:'invalid'}];await assert.rejects(fixture({bookings:malformed}).read(),/SCHEDULE_EVIDENCE_INCOMPLETE/);
});
test('seven-date result has exact totals and bounded alternatives, with valid calendar destination',async()=>{
 const result=await fixture().read({...args,days:7});assert.equal(result.days.length,7);assert.equal(result.through,'2030-09-30');assert.equal(result.total,result.days.reduce((sum,day)=>sum+day.total,0));assert.equal(result.shown_count,42);assert.equal(result.is_excerpt,true);for(const slot of result.slots){const url=new URL(slot.href,'https://example.invalid');assert.equal(url.pathname,'/salon/dashboard/availability');assert.equal(url.searchParams.get('date'),slot.date);assert.equal(url.searchParams.get('stylist'),professional);}
});
test('planner and answer refresh actual selected availability, keep exact counts and flatten capped starts',async()=>{
 const input={...args,days:7};const previous=await fixture().read(input);
 for(const answerOnly of [false,true]){
  const history=[{id:'a2000000-0000-4000-8000-000000000088',salon_id:business,requested_by:actor,tool:'get_availability',permission:'availability',arguments:input,result:previous}];const f=fixture({history,answerOnly});await f.plan();const user=JSON.parse(f.requests[0].messages[1].content),result=user.authorized_prior_results?.[0]?.result||user.previous_results?.[0]?.result||user;const serialized=JSON.stringify(result);assert.match(serialized,/"shown_count":12/);assert.match(serialized,/"is_excerpt":true/);assert.match(serialized,/"time":"09:00"/);assert.match(serialized,/"duration_minutes":180/);
  const denied=fixture({history,answerOnly,denied:['styles']});if(answerOnly)await assert.rejects(denied.plan(),/ASSISTANT_INVALID_PLAN/);else await denied.plan();assert.doesNotMatch(JSON.stringify(denied.requests),/OLD_PRIVATE_SLOT|Own braids|"time":"09:00"/);
 }
});
test('protected finance route requires fresh historical recommendation, own style grants and JSON-safe failure references',async()=>{
 const url='https://example.invalid/api/salon/service-capacity?'+new URLSearchParams({from:'2030-08-01',to:'2030-08-28',style_id:service,stylist_id:'',date,days:'7',selected_options:JSON.stringify(args.selected_options)});
 for(const [options,status]of [[{},200],[{unauthorized:true},401],[{contributionDenied:true},403],[{denied:['styles']},403],[{noRecommendation:true},409],[{contributionChanged:true},409]]){const f=fixture(options),response=await f.loader('src/app/api/salon/service-capacity/route.ts').GET(new Request(url));assert.equal(response.status,status);const body=await response.json();if(status!==200){assert.equal(body.request_id,'a2000000-0000-4000-8000-000000000099');assert.equal(body.slots,undefined);}else assert.equal(body.duration_minutes,180);}
 const f=fixture();assert.equal((await f.loader('src/app/api/salon/service-capacity/route.ts').GET(new Request(url+'&salon_id='+foreign))).status,400);
});
test('four-locale capacity copy covers every key and preserves placeholders',()=>{
 const rows=fixture().loader('src/i18n/business-service-capacity-copy.ts').SERVICE_CAPACITY_COPY_ROWS;
 for(const row of rows){assert.equal(row.length,4);for(const text of row){assert.ok(text.trim());assert.deepEqual([...text.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort(),[...row[0].matchAll(/\{\w+\}/g)].map(match=>match[0]).sort());}}
});
test('direct assistant presentation asks for missing choices instead of asserting zero availability',()=>{
 const load=fixture().loader,present=load('src/lib/gcAssistantPresentation.ts').presentAssistantResult,copy=load('src/i18n/business-service-capacity-copy.ts').serviceCapacityCopy;
 for(const locale of ['en','fr','es','zh-CN'])assert.equal(present('get_availability',{service_id:service,available:false,reason:'selection_required',slots:[],total:null},locale).message,copy(locale,'Choose the required service options, then check again.'));
});
