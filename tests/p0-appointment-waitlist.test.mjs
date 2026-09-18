import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const user='11000000-0000-4000-8000-000000000001',salon='22000000-0000-4000-8000-000000000001',style='33000000-0000-4000-8000-000000000001',id='44000000-0000-4000-8000-000000000001';
const reference='55000000-0000-4000-8000-000000000001';
function setup({role='customer',authenticated=true,unavailable=false,rpcError=null}={}){
 const calls=[],queries=[],events=[];
 const admin={auth:{getUser:async()=>({data:{user:authenticated?{id:user,email:'fixture@example.test'}:null}})},
  from(table){const q={select(){return q;},eq(key,value){queries.push({table,key,value});return q;},maybeSingle:async()=>({data:table==='platform_identities'?{status:'Active',primary_role:role,email_normalized:'fixture@example.test'}:{time_zone:'America/New_York'}})};return q;},
  async rpc(name,args){calls.push({name,args});if(name==='due_appointment_waitlist')return {data:[{request_id:id,source_booking_id:style,salon_id:salon,style_id:style,customer_id:user,stylist_id:null,appointment_at:'2030-06-10T14:00:00Z',time_zone:'America/New_York',locale:'es'}]};return {data:name==='offer_appointment_waitlist'?id:[],error:rpcError};}};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,requireSalonPermission:async()=>{if(!authenticated)throw Error('Unauthorized');return {admin,user:{id:user},salon:{id:salon}};}},
  '@/lib/requestSecurity':{enforceRateLimit:()=>{}},
  '@/lib/platformErrors':{capturePlatformError:async(event)=>{events.push(event);return reference;}},
  '@/lib/bookingAvailabilityServer':{bookingAvailability:async(args)=>{calls.push({name:'availability',args});return {slots:unavailable?[]:[{value:'10:00',stylistId:style}]};}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},
 });return {load,calls,queries,events};
}
const request=(body,url='/api/customer/waitlist')=>new Request(`http://localhost${url}`,{method:body?'POST':'GET',headers:{authorization:'Bearer fixture','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('customer waitlist binds identity server-side and converts the business time zone',async()=>{
 const f=setup(),route=f.load('src/app/api/customer/waitlist/route.ts');
 const response=await route.POST(request({action:'join',id,salon_id:salon,style_id:style,stylist_id:null,from_local:'2030-06-10T09:00',until_local:'2030-06-10T17:00',locale:'es'}));
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(f.calls[0],{name:'manage_appointment_waitlist',args:{p_customer:user,p_action:'join',p_id:id,p_args:{salon_id:salon,style_id:style,stylist_id:null,starts_after:'2030-06-10T13:00:00.000Z',starts_before:'2030-06-10T21:00:00.000Z',locale:'es'}}});
});
test('foreign identity injection, business roles and signed-out callers never reach customer waitlist data',async()=>{
 for(const [options,body,status] of [[{}, {action:'leave',id,customer_id:style},400],[{role:'salon_owner'},null,403],[{authenticated:false},null,401]]){
  const f=setup(options),route=f.load('src/app/api/customer/waitlist/route.ts');const res=await (body?route.POST:route.GET)(request(body));
  assert.equal(res.status,status);assert.equal(f.calls.length,0);assert.equal((await res.json()).request_id,reference);assert.equal(res.headers.get('x-request-id'),reference);
 }
});
test('owner waitlist uses authenticated business and rejects override query parameters',async()=>{
 const f=setup(),route=f.load('src/app/api/salon/waitlist/route.ts');
 assert.equal((await route.GET(request(null,'/api/salon/waitlist'))).status,200);
 assert.deepEqual(f.calls[0],{name:'read_business_waitlist',args:{p_salon:salon,p_user:user}});
 assert.equal((await route.GET(request(null,`/api/salon/waitlist?salon_id=${style}`))).status,400);assert.equal(f.calls.length,1);
});
test('scheduled matching uses current service/customer availability and localized review-only notification',async()=>{
 const f=setup();assert.deepEqual(await f.load('src/lib/appointmentWaitlistServer.ts').processAppointmentWaitlist(),{checked:1,offered:1,unavailable:0,failed:0});
 assert.deepEqual(f.calls[1].args,{salonId:salon,styleId:style,stylistId:null,customerId:user,date:'2030-06-10'});
 assert.equal(f.calls[2].args.p_stylist,style);assert.match(f.calls[2].args.p_copy.body,/no se ha confirmado/);
 const blocked=setup({unavailable:true});assert.equal((await blocked.load('src/lib/appointmentWaitlistServer.ts').processAppointmentWaitlist()).offered,0);assert.equal(blocked.calls.length,2);
});
test('provider failures return an exact safe incident reference without raw records',async()=>{
 const f=setup({rpcError:{message:'private provider response fixture'}});const res=await f.load('src/app/api/customer/waitlist/route.ts').GET(request());
 assert.equal(res.status,500);assert.deepEqual(await res.json(),{code:'WAITLIST_UNAVAILABLE',request_id:reference});assert.equal(f.events[0].error.message,'WAITLIST_UNAVAILABLE');
});
