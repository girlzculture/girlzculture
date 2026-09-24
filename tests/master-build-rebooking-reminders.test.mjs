import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const owner='11000000-0000-4000-8000-000000000001',business='22000000-0000-4000-8000-000000000001',customer='33000000-0000-4000-8000-000000000001',booking='44000000-0000-4000-8000-000000000001',attempt='55000000-0000-4000-8000-000000000001',reference='66000000-0000-4000-8000-000000000001';
const input={revision:0,enabled:true,absence_days:42,minimum_visits:1,service_ids:[],reviewed:true};
function fixture({isOwner=true,available=true,saveError=null,stale=false,foreign=false,locale='fr',provider='accepted',claim=true,finishError=false}={}){
 const calls=[],sends=[],events=[];let revision=0;const admin={rpc:async(name,args)=>{calls.push({name,args});
  if(name==='save_business_rebooking_settings'){if(saveError)return {error:{message:saveError}};revision=args.p_revision+1;return {data:{revision}};}
  if(name==='read_business_rebooking_settings')return {data:{salon_id:foreign?customer:business,revision:revision+(stale?1:0)}};
  if(name==='due_business_rebooking_reminders')return {data:[{salon_id:business,customer_id:customer,booking_id:booking}]};
  if(name==='claim_business_rebooking_reminder')return {data:claim?{salon_id:foreign?customer:business,attempt_id:attempt,preference_id:customer,locale,destination:'client@example.test',business_name:'Own <Business>',booking_path:'/salon/owned-business/book'}:null};
  if(name==='finish_business_rebooking_reminder')return {error:finishError?{message:'RAW sensitive DB'}:null};
  throw Error('unexpected RPC '+name);
 }};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,requireSalonOwner:async()=>({admin,isOwner,user:{id:owner},salon:{id:business}}),sendEmail:async(...args)=>{sends.push(args);if(provider==='throws')throw Error('RAW KEY OR BODY');if(provider==='skipped')return {skipped:true};return {id:'provider-accepted'};}},
  '@/lib/businessCustomerCampaignServer':{campaignEmailAvailable:async()=>available},'@/lib/businessCommunicationServer':{communicationUnsubscribeToken:id=>'fixture-opt-out-'+id},
  '@/lib/platformErrors':{capturePlatformError:async e=>{events.push(e);return reference;}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h},
 });
 return {calls,sends,events,route:load('src/app/api/salon/rebooking-settings/route.ts'),worker:load('src/lib/businessRebookingRemindersServer.ts'),core:load('src/lib/businessRebookingReminders.ts')};
}
const request=(body=input,query='')=>new Request('https://fixture.test/api/salon/rebooking-settings'+query,{method:'POST',body:JSON.stringify(body)});
test('rebooking settings enforce exact shape and typed bounded fields',()=>{
 const f=fixture();assert.deepEqual(f.core.rebookingSettingsInput(input),input);
 for(const value of [null,[],{...input,salon_id:customer},{...input,revision:-1},{...input,absence_days:29},{...input,absence_days:181},{...input,enabled:'true'},{...input,minimum_visits:21},{...input,service_ids:[booking,booking]},{...input,reviewed:'yes'}])assert.throws(()=>f.core.rebookingSettingsInput(value),/REBOOKING_INVALID/);
});
test('owner save binds actor and business and verifies authoritative new revision',async()=>{
 const f=fixture(),r=await f.route.POST(request());assert.equal(r.status,200);assert.equal((await r.json()).verified,true);
 assert.deepEqual(f.calls[0],{name:'save_business_rebooking_settings',args:{p_salon:business,p_actor:owner,p_revision:0,p_enabled:true,p_days:42,p_minimum:1,p_services:[],p_reviewed:true}});assert.equal(f.calls[1].name,'read_business_rebooking_settings');assert.equal(r.headers.get('Cache-Control'),'private, no-store');
});
test('staff and supplied business scope fail before a private write',async()=>{
 for(const [opts,q,status] of [[{isOwner:false},'',403],[{},'?salon_id='+customer,400]]){const f=fixture(opts),r=await f.route.POST(request(input,q));assert.equal(r.status,status);assert.equal(f.calls.length,0);}
});
test('unavailable email prevents activation but permits disabling',async()=>{
 const f=fixture({available:false});assert.equal((await f.route.POST(request())).status,503);assert.equal(f.calls.length,0);assert.equal((await f.route.POST(request({...input,enabled:false,reviewed:false}))).status,200);
});
test('stale save, wrong business, and changed readback never claim verification',async()=>{
 for(const [opts,status]of [[{saveError:'REBOOKING_STALE'},409],[{stale:true},500],[{foreign:true},500]]){const f=fixture(opts),r=await f.route.POST(request());assert.equal(r.status,status);const body=await r.json();assert.equal(body.request_id,reference);assert.equal(r.headers.get('X-Request-ID'),reference);assert.equal(body.verified,undefined);}
});
for(const locale of ['en','fr','es','zh-CN'])test(`delivery uses approved ${locale} copy with own booking and opt-out links`,async()=>{
 const f=fixture({locale}),result=await f.worker.processBusinessRebookingReminders();assert.equal(result.accepted,1);assert.equal(f.sends.length,1);const [to,title,html,kind,options]=f.sends[0];assert.equal(to,'client@example.test');assert.equal(title,f.core.REBOOKING_COPY[locale].title);assert.ok(html.includes(f.core.REBOOKING_COPY[locale].body));assert.ok(html.includes('https://girlzculture.com/salon/owned-business/book'));assert.ok(html.includes('communications/unsubscribe?token='));assert.equal(kind,'account');assert.equal(options.idempotencyKey,'business-rebooking:'+attempt);assert.ok(options.signal instanceof AbortSignal);assert.equal(f.calls.at(-1).args.p_status,'accepted');
});
test('disabled provider and rejected claim make no transport call',async()=>{
 for(const opts of [{available:false},{claim:false}]){const f=fixture(opts);await f.worker.processBusinessRebookingReminders();assert.equal(f.sends.length,0);if(!opts.available&&opts.available!==undefined)assert.equal(f.calls.length,0);}
});
test('uncertain or skipped transport is recorded once with no retry or raw diagnostic',async()=>{
 for(const provider of ['throws','skipped']){const f=fixture({provider}),result=await f.worker.processBusinessRebookingReminders();assert.equal(result.uncertain,1);assert.equal(f.sends.length,1);assert.equal(f.events[0].error.message,'REBOOKING_OUTCOME_UNCERTAIN_NO_RETRY');assert.deepEqual(f.calls.at(-1).args,{p_salon:business,p_attempt:attempt,p_status:'uncertain',p_reference:reference});assert.ok(!JSON.stringify(f.events).includes('RAW'));}
});
test('claim with foreign business never reaches provider',async()=>{
 const f=fixture({foreign:true});await assert.rejects(f.worker.processBusinessRebookingReminders(),/REBOOKING_CLAIM_INVALID/);assert.equal(f.sends.length,0);
});
test('unsupported locale is not silently sent in English',async()=>{
 const f=fixture({locale:'wo'}),result=await f.worker.processBusinessRebookingReminders();assert.equal(f.sends.length,0);assert.equal(result.uncertain,1);
});
test('failed outcome persistence is visible and does not resend',async()=>{
 const f=fixture({finishError:true});await assert.rejects(f.worker.processBusinessRebookingReminders(),/REBOOKING_OUTCOME_NOT_RECORDED/);assert.equal(f.sends.length,1);
});
test('scheduled worker cannot run on held or preview deployments and preserves upstream incident',async()=>{
 const originalFetch=globalThis.fetch;const calls=[];
 const load=loadNodeTypescript(process.cwd(),{'./_monitoring.mjs':{monitoredNetlifyFailure:async()=>Response.json({incident:true},{status:500})}}),fn=load('netlify/functions/business-rebooking-reminders.ts').default;
 globalThis.Netlify={env:{get:()=> 'fixture-internal'}};
 globalThis.fetch=async(...args)=>{calls.push(args);return Response.json({request_id:reference},{status:500});};
 try{
  for(const deploy of [{context:'deploy-preview',published:true},{context:'production',published:false}])assert.equal((await(await fn(new Request('https://fixture.test'),{deploy})).json()).disabled,true);
  assert.equal(calls.length,0);const r=await fn(new Request('https://fixture.test'),{deploy:{context:'production',published:true}});assert.equal(r.status,500);assert.equal(r.headers.get('X-Request-ID'),reference);assert.equal(calls.length,1);assert.equal(calls[0][1].redirect,'error');
 }finally{globalThis.fetch=originalFetch;delete globalThis.Netlify;}
});
