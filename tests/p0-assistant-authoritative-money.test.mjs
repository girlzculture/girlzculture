import { migratedAssistantTools } from './helpers/assistant-migration-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const business='a1000000-0000-4000-8000-000000000001',actor='a1000000-0000-4000-8000-000000000002',style='a1000000-0000-4000-8000-000000000003',offer='a1000000-0000-4000-8000-000000000004',booking='a1000000-0000-4000-8000-000000000005',foreign='b1000000-0000-4000-8000-000000000001',professional='a1000000-0000-4000-8000-000000000006',material='a1000000-0000-4000-8000-000000000007';
const plain=value=>JSON.parse(JSON.stringify(value));
const selection={service_id:style,selected_size:null,selected_length:null,selected_addons:[],selected_options:[],selected_material_id:null,promotion_id:offer};
function fixture(options={}) {
 const calls=[],requests=[],history=options.history||[],permissions=new Set(options.denied||[]);
 const rule={id:'rule-version',salon_id:business,rate:10,threshold_amount:null,threshold_rate:null,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365,...options.rule};
 const row={id:booking,salon_id:business,stylist_id:professional,public_reference:'GC-LOCAL',appointment_datetime:'2026-09-10T12:00:00Z',created_at:'2026-09-01T12:00:00Z',service_completed_at:'2026-09-10T13:00:00Z',status:'Completed',booking_origin:'marketplace',payment_mode:'live',estimated_total:80,subtotal_before_promotion:100,deposit_amount:10,deposit_percentage:10,original_deposit_amount:10,deposit_rule_snapshot:{version:'saved-rule',basis:'eligible_service_subtotal_before_discounts',subtotal:100,deposit:10,rate:10},discount_amount:0,promotion_discount_amount:20,promotion_snapshot:{subtotal_before_promotion:100,discount_amount:20,adjusted_total:80,protected_deposit:10},balance_due:70,deposit_status:'Paid',payment_verified_at:'2026-09-01T12:01:00Z',verified_charge:true,refund_amount:0,operating_compensation:{kind:'none',version:null},name:'Saved service',...options.booking};
 const tables={salons:[{id:business,user_id:options.staff?foreign:actor,time_zone:'UTC',subscription_tier:'Premium'}],salon_team_members:[{id:'membership',salon_id:business,user_id:actor,status:'Active',stylist_id:professional}],styles:[{id:style,salon_id:business,name:'Current service',base_price:100,price_display_min:null,archived_at:null,...options.style}],style_materials:[{id:material,style_id:style,name:'Saved material',price:12.50}],salon_promotions:[{id:offer,salon_id:business,title:'Saved 20%',promotion_type:'percentage',discount_value:20,status:'Active',is_active:true,target_scope:'salon',restrictions:{},...options.offer}],business_deposit_rules:[rule],bookings:[row],gc_assistant_requests:history,master_styles:[]};
 const scope={kind:options.own?'own':'business',stylist_id:options.own?professional:null};
 const finance={scope,is_demo:options.demo===true,sales:[],bookings:[row],receipts:options.receipts||[],expenses:[],arrangements:[],obligations:[],compensation_payments:[],stylists:[]};
 const admin={async rpc(name,args){calls.push({rpc:name,args});options.onRpc?.(name,tables,permissions,finance);if(name!=='reserve_gc_assistant_usage')assert.equal(args.p_salon,business);else assert.equal(args.p_user,actor);
  if(name==='p0_actor_has_permission')return {data:!permissions.has(args.p_permission),error:null};
  if(name==='business_finance_scope')return {data:options.noFinance?{kind:'none'}:scope,error:null};
  if(name==='read_business_finance')return {data:finance,error:null};
  if(name==='p0_business_plan_active')return {data:true,error:null};
  if(name==='reserve_gc_assistant_usage')return {data:'fixture-reservation',error:null};
  throw Error(`Forbidden RPC ${name}`);
 },from(table){let filters=[],fields=[],single=false;const q={select(value){fields=value.split(',');if(['salons','styles','style_materials','salon_promotions','bookings','salon_team_members'].includes(table))assert.notEqual(value,'*');return q;},eq(key,value){filters.push([key,value]);return q;},is(key,value){filters.push([key,value]);return q;},in(key,value){filters.push([key,value]);return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},update(){assert.equal(table,'ai_usage_events');return q;},then(resolve,reject){return Promise.resolve().then(()=>{calls.push({table,filters,fields});options.onRead?.(table,tables,permissions);if(table==='ai_automation_features')return {data:{is_enabled:true,provider_key:'openai',model_key:'fixture-model',timeout_ms:20000}};if(table==='ai_usage_events')return{data:null};assert.ok(Object.hasOwn(tables,table),`Forbidden table ${table}`);const result=tables[table].filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):(row[key]??null)===value)).map(row=>fields[0]==='*'?row:Object.fromEntries(fields.map(key=>[key,row[key]??null])));return options.response?.(table,result)||{data:single?result[0]??null:result,error:null};}).then(resolve,reject);}};return q;}};
 const loader=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{},'@/lib/agentConfigurationServer':{agentBehavior:async()=>''},'@/lib/bookingAvailabilityServer':{},'@/lib/contentModerationServer':{},'@/lib/engineConfigServer':{getEngineNumber:async(_key,value)=>value},'@/lib/aiAutomationServer':{approvedAiModels:()=>['fixture-model'],approvedAiProviders:()=>['openai'],aiProviderConfigured:()=>true,redactSensitiveText:value=>value}}, {URLSearchParams,process:{env:{OPENAI_API_KEY:'fixture-only',AI_OWNER_INPUT_USD_PER_MILLION:'1',AI_OWNER_OUTPUT_USD_PER_MILLION:'4'}},fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(options.answerOnly?{reply:'Current calculated amounts.'}:{decision:{clarification:'Which saved appointment should I use?'},language_switch:null})}}]});}});
 const context={admin,user:{id:actor},salon:{id:business,time_zone:'UTC',is_demo:options.demo===true},isOwner:!options.staff,teamMember:options.staff?{id:'membership',stylist_id:professional}:null};
 return {calls,requests,context,tables,finance,permissions,loader,read:async(tool='calculate_service_selection',args=selection)=>{const validated=loader('src/lib/gcAssistantCore.ts').validateTool(tool,args);return loader('src/lib/gcAssistantServer.ts').readAssistantData(context,validated.tool,validated.args);},plan:async()=>loader('src/lib/gcAssistantPlanningServer.ts').planOwnerRequest({context,admin,salonId:business,userId:actor,locale:'en',text:'Explain that saved amount again',timeZone:'UTC',previousRequestIds:history.map(row=>row.id),conversation:[{role:'assistant',text:'OLD_PRIVATE_MONEY'}],answerOnly:options.answerOnly})};
}

test('actual assistant dispatch calculates approved 100/10/20% from own saved facts only',async()=>{
 const f=fixture(),result=await f.read();assert.equal(result.available,true);assert.deepEqual(plain(result.money),{subtotal_cents:10000,discount_cents:2000,total_cents:8000,protected_deposit_cents:1000,remaining_balance_cents:7000});assert.equal(result.deposit_rule_version,'rule-version');assert.equal(result.promotion_eligibility,'selection_matches_unreserved');assert.ok(f.calls.every(c=>!c.rpc||c.rpc==='p0_actor_has_permission'));assert.ok(!f.calls.some(c=>['bookings','promo_codes'].includes(c.table)));
});

test('selection includes required generic and optional legacy/material prices; missing choice asks instead of inventing',async()=>{
 const options={style:{size_options:[{value:'large',price_add:5}],length_options:[{value:'long',price_add:7}],addons:[{value:'trim',label:'Trim',price_add:10}],option_groups:[{id:'finish',label:'Finish',required:true,selection:'single',options:[{value:'gloss',price_add:15,duration_add_minutes:20}]}]}};
 const missing=await fixture(options).read();assert.equal(missing.available,false);assert.equal(missing.reason,'selection_required');assert.equal(missing.required_group_id,'finish');assert.equal(missing.money,null);
 const result=await fixture(options).read('calculate_service_selection',{...selection,selected_size:'large',selected_length:'long',selected_addons:['trim'],selected_options:[{group_id:'finish',values:['gloss']}],selected_material_id:material});assert.equal(result.subtotal_cents,14950);assert.equal(result.money.protected_deposit_cents,1495);assert.equal(result.money.discount_cents,2990);assert.equal(result.money.remaining_balance_cents,10465);
});

test('customer-dependent protection or offer eligibility remains unknown without any customer history lookup',async()=>{
 for(const options of [{rule:{repeat_incident_count:2,repeat_incident_rate:50}},{offer:{restrictions:{new_customers_only:true}}},{offer:{restrictions:{per_customer_limit:1}}}]){const f=fixture(options),result=await f.read();assert.equal(result.reason,'customer_context_required');assert.equal(result.subtotal_cents,10000);assert.equal(result.money,null);assert.ok(!f.calls.some(c=>c.rpc==='own_business_incident_count'||c.table==='bookings'));}
});

test('caps, threshold, rounding, inactive and wrong-target offers reuse canonical rules',async()=>{
 const capped=await fixture({offer:{discount_value:100}}).read();assert.equal(capped.money.discount_cents,9000);assert.equal(capped.money.remaining_balance_cents,0);
 const threshold=await fixture({rule:{threshold_amount:99,threshold_rate:40}}).read();assert.equal(threshold.money.protected_deposit_cents,4000);assert.equal(threshold.money.discount_cents,2000);
 const rounded=await fixture({style:{base_price:99.99},offer:{discount_value:33.33}}).read();assert.equal(rounded.money.discount_cents,3333);assert.equal(rounded.money.protected_deposit_cents,1000);
 for(const offerPatch of [{is_active:false},{target_scope:'services',target_ids:[foreign]}])assert.equal((await fixture({offer:offerPatch}).read()).reason,'promotion_not_applicable');
});

test('schemas reject model prices, identity and history; duplicate groups cannot overwrite selection',async()=>{
 for(const patch of [{subtotal:1},{customer_id:actor},{incident_count:0},{deposit:0}])await assert.rejects(fixture().read('calculate_service_selection',{...selection,...patch}),/ASSISTANT_INVALID_INPUT/);
 await assert.rejects(fixture().read('calculate_service_selection',{...selection,selected_options:[{group_id:'x',values:[]},{group_id:'x',values:[]}]}),/ASSISTANT_INVALID_INPUT/);
});

test('selection denies secondary grants, foreign returned facts and revocation during read before exposure',async()=>{
 for(const permission of ['styles','my_page','promotions']){const f=fixture({denied:[permission]});await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);assert.ok(!f.calls.some(c=>c.table==='styles'));}
 for(const table of ['styles','salon_promotions','style_materials']){const f=fixture({response:(name,rows)=>name===table?{data:{...rows[0],salon_id:foreign,style_id:foreign,id:foreign}}:null});await assert.rejects(f.read('calculate_service_selection',{...selection,selected_material_id:material}),/ASSISTANT_PRICE_UNAVAILABLE/);}
 const f=fixture({onRead:(table,_rows,permissions)=>{if(table==='business_deposit_rules')permissions.add('my_page');}});await assert.rejects(f.read(),/ASSISTANT_ACCESS_DENIED/);
});

test('existing booking returns immutable agreed amounts while current catalog and rules differ',async()=>{
 const f=fixture({style:{base_price:800},rule:{rate:90},offer:{discount_value:80}}),result=await f.read('get_booking_price_details',{booking_id:booking});assert.equal(result.available,true);assert.equal(result.original.subtotal_cents,10000);assert.equal(result.original.discount_cents,2000);assert.equal(result.original.protected_deposit_cents,1000);assert.equal(result.original.remaining_balance_cents,7000);assert.equal(result.current.unpaid_cents,7000);assert.ok(!f.calls.some(c=>['styles','salon_promotions','business_deposit_rules'].includes(c.table)));
});

test('verified receipts and refunds change current position without rewriting original balance',async()=>{
 const receipt={id:'receipt-local',salon_id:business,booking_id:booking,occurred_at:'2026-09-10T13:00:00Z',stage:'balance',method:'cash',amount_cents:7000};
 const result=await fixture({receipts:[receipt],booking:{refund_status:'succeeded',refund_amount:10,refund_completed_at:'2026-09-11T13:00:00Z',verified_refund:true}}).read('get_booking_price_details',{booking_id:booking});assert.equal(result.original.remaining_balance_cents,7000);assert.equal(result.current.available,true);assert.equal(result.current.received_cents,7000);assert.equal(result.current.unpaid_cents,0);
 const unverified=await fixture({booking:{verified_charge:false}}).read('get_booking_price_details',{booking_id:booking});assert.equal(unverified.original.agreed_total_cents,8000);assert.equal(unverified.current.available,false);assert.equal(unverified.current.unpaid_cents,null);
});

test('missing or inconsistent original evidence never reprice; test payments stay excluded',async()=>{
 for(const patch of [{deposit_rule_snapshot:null},{balance_due:80},{promotion_snapshot:{}},{payment_mode:'test'}]){const result=await fixture({booking:patch}).read('get_booking_price_details',{booking_id:booking});assert.equal(result.available,false);assert.equal(result.original,null);assert.equal(result.current,null);}
});

test('booking monetary read enforces finance plus client/booking grants and assigned staff before and after',async()=>{
 for(const options of [{denied:['bookings']},{denied:['client_history']},{noFinance:true},{staff:true,booking:{stylist_id:foreign}},{response:(table,rows)=>table==='bookings'?{data:{...rows[0],salon_id:foreign}}:null}])await assert.rejects(fixture(options).read('get_booking_price_details',{booking_id:booking}),/ASSISTANT_ACCESS_DENIED|ASSISTANT_RECORD_NOT_FOUND/);
 const staff=await fixture({staff:true,own:true}).read('get_booking_price_details',{booking_id:booking});assert.equal(staff.scope,'own_stylist_only');
 const f=fixture({staff:true,onRpc:(name,tables)=>{if(name==='read_business_finance')tables.salon_team_members[0].stylist_id=foreign;}});await assert.rejects(f.read('get_booking_price_details',{booking_id:booking}),/ASSISTANT_ACCESS_DENIED/);
});

test('foreign finance rows and inconsistent readbacks cannot reach a monetary answer',async()=>{
 const f=fixture({onRpc:(name,_tables,_permissions,finance)=>{if(name==='read_business_finance')finance.receipts.push({salon_id:foreign});}});await assert.rejects(f.read('get_booking_price_details',{booking_id:booking}),/ASSISTANT_PRICE_UNAVAILABLE/);
 let count=0;const changed=fixture({onRead:(table,tables)=>{if(table==='bookings'&&++count===2)tables.bookings[0].balance_due=99;}});await assert.rejects(changed.read('get_booking_price_details',{booking_id:booking}),/ASSISTANT_PRICE_UNAVAILABLE/);
});

for(const tool of ['calculate_service_selection','get_booking_price_details'])test(`${tool} actual planner and answer refresh preserve cents, revoke secondary access and discard stale prose`,async()=>{
 const args=tool==='calculate_service_selection'?selection:{booking_id:booking};
 const original=plain(await fixture().read(tool,args));
 for(const answerOnly of [false,true]){
  const history=[{id:'a1000000-0000-4000-8000-000000000099',salon_id:business,requested_by:actor,tool,permission:tool==='calculate_service_selection'?'styles':'bookings',status:'executed',arguments:args,result:{...original,as_of:'2020-01-01T00:00:00.000Z'}}];
  const f=fixture({history,answerOnly});await f.plan();const payload=JSON.stringify(f.requests);assert.match(payload,/7000/);assert.match(payload,/1000/);assert.doesNotMatch(payload,/2020-01-01/);
  const denied=fixture({history,answerOnly,denied:[tool==='calculate_service_selection'?'my_page':'client_history']});if(answerOnly)await assert.rejects(denied.plan(),/ASSISTANT_INVALID_PLAN/);else await denied.plan();assert.doesNotMatch(JSON.stringify(denied.requests),/OLD_PRIVATE_MONEY|saved-rule|remaining_balance_cents/);
 }
});


test('186 preserves every prior audit tool and adds only the two risk-1 money reads',()=>{
 const source=file=>readFileSync(file,'utf8');const names=s=>[...s.match(/check\(tool in \((.*?)\)\)/s)[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
 const previous=source('supabase/migrations/20260919134859_assistant_profile_settings_read.sql'),current=source('supabase/migrations/20260919143452_assistant_authoritative_money_reads.sql');
 assert.deepEqual(new Set(names(current)),new Set([...names(previous),'calculate_service_selection','get_booking_price_details']));
 const core=fixture().loader('src/lib/gcAssistantCore.ts');assert.deepEqual(migratedAssistantTools(),new Set(Object.keys(core.ASSISTANT_TOOLS)));
 assert.match(source('supabase/migrations/20260923075422_master_build_assistant_professional_archive.sql'),/tool = ''prepare_professional_archive'' or/);
 for(const tool of ['calculate_service_selection','get_booking_price_details'])assert.equal(core.ASSISTANT_TOOLS[tool].risk,1);
 assert.doesNotMatch(current,/\bgrant\s|permission_check|create\s+(table|function)/i);
});


test('read presentation preserves exact cents and truthfully distinguishes unavailable current payment in four languages',async()=>{
 const f=fixture(),selected=await f.read(),booked=await f.read('get_booking_price_details',{booking_id:booking});const presentation=f.loader('src/lib/gcAssistantPresentation.ts').presentAssistantResult;
 for(const locale of ['en','fr','es','zh-CN']){
  const money=new Intl.NumberFormat({en:'en-US',fr:'fr-FR',es:'es-ES','zh-CN':'zh-CN'}[locale],{style:'currency',currency:'USD',maximumFractionDigits:2});
  const output=presentation('calculate_service_selection',selected,locale).message;assert.ok(output.includes(money.format(80)));assert.ok(output.includes(money.format(10)));assert.ok(output.includes(money.format(70)));assert.doesNotMatch(output,/\{\w+\}/);
  const original=presentation('get_booking_price_details',{...booked,current:{available:false,unpaid_cents:null}},locale).message;assert.ok(original.includes(money.format(70)));assert.ok(original.includes(f.loader('src/i18n/assistant-money-read-copy.ts').assistantMoneyReadText('unavailable',locale)));
  assert.notEqual(presentation('get_booking_price_details',{available:false},locale).message,presentation('get_booking_price_details',booked,locale).message);
 }
});

test('planner validation cannot select either new read when a required secondary grant is absent',()=>{
 const f=fixture(),parse=f.loader('src/lib/gcAssistantPlannerProtocol.ts').parseOwnerPlannerResponse;
 for(const [tool,args,grants] of [['calculate_service_selection',selection,['styles','promotions']],['calculate_service_selection',selection,['styles','my_page']],['get_booking_price_details',{booking_id:booking},['bookings','earnings']]])assert.throws(()=>parse(JSON.stringify({decision:{tool,args},language_switch:null}),new Set(grants),false),/ASSISTANT_ACCESS_DENIED/);
});

test('shared subtotal preserves valid fallback, round-once and duration semantics and rejects over-cap/ambiguous choices',()=>{
 const calc=fixture().loader('src/lib/bookingServiceSelection.ts').calculateBookingServiceSelection;
 const selected={selected_size:null,selected_length:null,selected_addons:[],selected_options:{},selected_material_id:null};
 assert.equal(calc({base_price:0,price_display_min:25},selected).subtotal,25);
 assert.equal(calc({base_price:0.10,addons:[{value:'one',price_add:0.005},{value:'two',price_add:0.005}]},{...selected,selected_addons:['one','two']}).subtotal,0.11);
 assert.equal(calc({base_price:10,option_groups:[{id:'duration',required:true,options:[{value:'long',price_add:5,duration_add_minutes:30}]}]},{...selected,selected_options:{duration:['long']}}).duration_adjustment_minutes,30);
 assert.throws(()=>calc({base_price:10000.01},selected),/verified/);
 assert.throws(()=>calc({base_price:10,addons:[{value:'a',label:'same',price_add:1},{value:'b',label:'same',price_add:2}]},{...selected,selected_addons:['same']}),/available/);
});


test('missing or invalid saved deposit rates remain unavailable instead of coercing null to zero',async()=>{
 for(const rate of [null,'bad',-1,101]){
  const result=await fixture({booking:{deposit_percentage:rate,deposit_rule_snapshot:{version:'saved-rule',basis:'eligible_service_subtotal_before_discounts',subtotal:100,deposit:10,rate}}}).read('get_booking_price_details',{booking_id:booking});
  assert.equal(result.available,false);assert.equal(result.original,null);assert.equal(result.reason,'original_terms_incomplete');
 }
});


test('explicit legitimate zero deposit rate is preserved in an immutable booking',async()=>{
 const result=await fixture({booking:{deposit_percentage:0,deposit_amount:0,original_deposit_amount:0,balance_due:80,deposit_rule_snapshot:{version:'zero-rule',basis:'eligible_service_subtotal_before_discounts',subtotal:100,deposit:0,rate:0},promotion_snapshot:{subtotal_before_promotion:100,discount_amount:20,adjusted_total:80,protected_deposit:0}}}).read('get_booking_price_details',{booking_id:booking});
 assert.equal(result.available,true);assert.equal(result.original.deposit_rate,0);assert.equal(result.original.protected_deposit_cents,0);assert.equal(result.original.remaining_balance_cents,8000);
});

test('changed authoritative price discards old transcript rather than retaining an earlier financial claim',async()=>{
 const original=plain(await fixture().read());const history=[{id:'a1000000-0000-4000-8000-000000000098',salon_id:business,requested_by:actor,tool:'calculate_service_selection',permission:'styles',status:'executed',arguments:selection,result:original}];
 const f=fixture({history,style:{base_price:120}});await f.plan();const user=JSON.parse(f.requests[0].messages.find(message=>message.role==='user').content);assert.doesNotMatch(JSON.stringify(user),/OLD_PRIVATE_MONEY/);assert.match(JSON.stringify(user),/8400/);assert.doesNotMatch(JSON.stringify(user),/7000/);
});


test('private sample booking terms use marked simulated receipts, never provider proof',async()=>{
 const receipts=[{id:'sample-deposit',salon_id:business,booking_id:booking,occurred_at:'2026-09-01T12:01:00Z',stage:'deposit',method:'other',amount_cents:1000},{id:'sample-balance',salon_id:business,booking_id:booking,occurred_at:'2026-09-10T13:00:00Z',stage:'balance',method:'other',amount_cents:7000}];
 const f=fixture({demo:true,booking:{is_demo:true,payment_mode:'test',verified_charge:false,payment_verified_at:null},receipts});
 const result=await f.read('get_booking_price_details',{booking_id:booking});
 assert.equal(result.available,true);assert.equal(result.sample_data,true);assert.match(result.definition,/not provider charges or evidence of bank settlement/);assert.doesNotMatch(result.definition,/FICTIONAL SAMPLE DATA/);
 assert.equal(result.current.available,true);assert.equal(result.current.received_cents,8000);assert.equal(result.current.unpaid_cents,0);
 for(const options of [{booking:{is_demo:true,payment_mode:'test'},receipts},{demo:true,booking:{payment_mode:'test'},receipts}])assert.equal((await fixture(options).read('get_booking_price_details',{booking_id:booking})).available,false);
});
