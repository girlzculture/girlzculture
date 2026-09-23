import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const id='11000000-0000-4000-8000-000000000001',business='22000000-0000-4000-8000-000000000001',other='33000000-0000-4000-8000-000000000001',requestId='44000000-0000-4000-8000-000000000001',source='55000000-0000-4000-8000-000000000001';
const settings={revision:0,reminder_hours:null,waitlist_service_ids:[],waitlist_professional_ids:[]};
const core=loadNodeTypescript(process.cwd())('src/lib/businessGrowthSettings.ts');
test('growth settings strictly validate hours, exact fields and owned id shapes',()=>{
 assert.deepEqual(core.growthSettingsInput({...settings,reminder_hours:[3,48]}).settings.reminder_hours,[48,3]);
 for(const value of [null,[],{...settings,salon_id:other},{...settings,reminder_hours:[1,1]},{...settings,reminder_hours:[]},{...settings,reminder_hours:[337]},{...settings,reminder_hours:[1.5]},{...settings,reminder_hours:['24']},{...settings,waitlist_service_ids:['bad']},{...settings,waitlist_professional_ids:[id,id]},{...settings,revision:-1}])assert.throws(()=>core.growthSettingsInput(value),/GROWTH_INVALID/);
});
function setup({owner=true,changedReadback=false,saveError=null,unavailable=false,foreign=false,existing=false}={}){
 const calls=[],events=[];let saved={...settings};
 const candidate={request_id:requestId,source_booking_id:source,salon_id:foreign?other:business,customer_id:other,style_id:id,stylist_id:null,appointment_at:'2030-06-10T14:00:00Z',time_zone:'America/New_York',locale:'es',offer_id:existing?id:null};
 const admin={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='save_business_growth_settings'){if(saveError)return {error:{message:saveError}};saved={...args.p_settings,revision:args.p_revision+1};return {data:saved};}
  if(name==='read_business_growth_settings')return {data:{...saved,revision:saved.revision+(changedReadback?1:0)}};
  if(name==='business_waitlist_openings')return {data:[candidate]};
  if(name==='offer_business_waitlist')return {data:id};
  throw Error('Unexpected RPC '+name);
 }};
 const context={admin,isOwner:owner,user:{id},salon:{id:business,user_id:id}};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>context,requireSalonPermission:async()=>context},
  '@/lib/platformErrors':{capturePlatformError:async e=>{events.push(e);return 'EXACT-GROWTH-REFERENCE';}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handle)=>handle},
  '@/lib/bookingAvailabilityServer':{bookingAvailability:async args=>{calls.push({name:'availability',args});return {slots:unavailable?[]:[{value:'10:00',stylistId:id}]};}},
 });return {load,calls,events};
}
const request=(body,url='/api/salon/growth-settings')=>new Request('https://fixture.test'+url,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});
test('growth save binds actor and business, requires an independent matching readback',async()=>{
 const f=setup(),route=f.load('src/app/api/salon/growth-settings/route.ts');const response=await route.POST(request({...settings,reminder_hours:[48,3]}));assert.equal(response.status,200);assert.equal((await response.json()).verified,true);
 assert.deepEqual(f.calls.map(row=>row.name),['save_business_growth_settings','read_business_growth_settings']);assert.equal(f.calls[0].args.p_salon,business);assert.equal(f.calls[0].args.p_actor,id);
 const stale=setup({changedReadback:true});const failed=await stale.load('src/app/api/salon/growth-settings/route.ts').POST(request(settings));assert.equal(failed.status,500);assert.equal((await failed.json()).request_id,'EXACT-GROWTH-REFERENCE');
});
test('staff and caller-supplied business cannot change automation controls',async()=>{
 for(const [options,input,status]of [[{owner:false},settings,403],[{}, {...settings,salon_id:other},400]]){const f=setup(options);const response=await f.load('src/app/api/salon/growth-settings/route.ts').POST(request(input));assert.equal(response.status,status);assert.equal(f.calls.length,0);}
});
test('stale settings and downgraded plans preserve specific safe errors',async()=>{
 for(const [saveError,status]of [['GROWTH_STALE',409],['GROWTH_PLAN_REQUIRED',403],['sensitive provider body',500]]){const f=setup({saveError});const response=await f.load('src/app/api/salon/growth-settings/route.ts').POST(request(settings));assert.equal(response.status,status);assert.ok(!(await response.text()).includes('sensitive'));assert.equal(f.events[0].error.message,saveError==='sensitive provider body'?'GROWTH_UNAVAILABLE':saveError);}
});
test('manual waitlist review uses fresh availability but never sends an offer or exposes client identity',async()=>{
 const f=setup(),route=f.load('src/app/api/salon/waitlist/openings/route.ts');const response=await route.POST(request({action:'review',request_id:requestId},'/api/salon/waitlist/openings'));assert.equal(response.status,200);
 const result=await response.json();assert.deepEqual(result,{offered:false,openings:[{source_booking_id:source,appointment_at:'2030-06-10T14:00:00Z',time_zone:'America/New_York'}]});assert.deepEqual(f.calls.map(row=>row.name),['business_waitlist_openings','availability']);
 assert.deepEqual(f.calls[1].args,{salonId:business,styleId:id,stylistId:null,customerId:other,date:'2030-06-10'});
});
test('explicit manual offer rechecks availability, scope and localized fixed copy',async()=>{
 const f=setup();const response=await f.load('src/app/api/salon/waitlist/openings/route.ts').POST(request({action:'offer',request_id:requestId,source_booking_id:source},'/api/salon/waitlist/openings'));assert.equal(response.status,200);assert.equal((await response.json()).offered,true);const saved=f.calls.find(row=>row.name==='offer_business_waitlist');assert.equal(saved.args.p_salon,business);assert.equal(saved.args.p_actor,id);assert.equal(saved.args.p_stylist,id);assert.match(saved.args.p_copy.body,/no se ha confirmado/);
});
test('response loss reads back existing offer without another dispatch',async()=>{
 const f=setup({existing:true});const response=await f.load('src/app/api/salon/waitlist/openings/route.ts').POST(request({action:'offer',request_id:requestId,source_booking_id:source},'/api/salon/waitlist/openings'));assert.equal(response.status,200);assert.equal((await response.json()).offer_id,id);assert.deepEqual(f.calls.map(row=>row.name),['business_waitlist_openings']);
});
test('changed opening, foreign tenant response and caller override cannot send',async()=>{
 for(const [options,extra,status]of [[{unavailable:true},{},409],[{foreign:true},{},403],[{}, {salon_id:other},400]]){const f=setup(options);const response=await f.load('src/app/api/salon/waitlist/openings/route.ts').POST(request({action:'offer',request_id:requestId,source_booking_id:source,...extra},'/api/salon/waitlist/openings'));assert.equal(response.status,status);assert.equal(f.calls.filter(row=>row.name==='offer_business_waitlist').length,0);}
});
