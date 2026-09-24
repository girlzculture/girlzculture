import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const op='10000000-0000-4000-8000-000000000001';
function fixture({business='A',owner=true,rowBusiness=business,count=2,queryError=false,authError}={}){
 const calls=[],rule={id:op,salon_id:rowBusiness,rate:10,threshold_amount:null,threshold_rate:null,repeat_incident_count:2,repeat_incident_rate:40,incident_window_days:365};
 const admin={from(table){const filters={};const q={};for(const method of ['select','order','limit'])q[method]=()=>q;q.eq=(key,value)=>{filters[key]=value;return q;};q.maybeSingle=async()=>{calls.push({table,filters});return{data:rule,error:queryError?Error('provider unavailable'):null};};return q;},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='own_business_incident_count'?count:{...rule,...args.p_rule},error:null};}};
 const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>{if(authError)throw Error(authError);return{admin,salon:{id:business},isOwner:owner,user:{id:`owner-${business}`}};}},'@/lib/engineConfigServer':{getEngineNumber:async()=>10},'@/lib/requestSecurity':{enforceRateLimit(){}},'@/lib/platformErrors':{capturePlatformError:async()=>op},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h}});
 const route=load('src/app/api/salon/deposit-rules/route.ts'),server=load('src/lib/businessDepositServer.ts');
 const {id,salon_id,...value}=rule;void id;void salon_id;
 const body={request_id:op,expected_version:null,rule:value};
 return{calls,body,terms:user=>server.readBookingDepositTerms(admin,business,100,user),get:(query='')=>route.GET(new Request('https://fixture.invalid/api/salon/deposit-rules'+query)),post:(value=body)=>route.POST(new Request('https://fixture.invalid/api/salon/deposit-rules',{method:'POST',body:JSON.stringify(value)}))};
}
test('only own business verified incidents can raise a deposit; unverified guest input never becomes a subject lookup',async()=>{
 for(const business of ['A','B']){const f=fixture({business});assert.equal((await f.terms({id:'customer',email:'verified@example.test',email_confirmed_at:'today'})).deposit,40);const rpc=f.calls.find(c=>c.name);assert.equal(rpc.args.p_salon,business);assert.equal(rpc.args.p_customer,'customer');assert.equal(rpc.args.p_verified_email,'verified@example.test');}
 const f=fixture();assert.equal((await f.terms(null)).deposit,10);assert.ok(!f.calls.some(c=>c.name));
 const unverified=fixture();await unverified.terms({id:'customer',email:'typed@example.test'});assert.equal(unverified.calls.find(c=>c.name).args.p_verified_email,null);
});
test('scope mismatch, unknown counts and database failure never become a lower fallback deposit',async()=>{
 for(const options of [{rowBusiness:'B'},{queryError:true},{count:null},{count:-1},{count:1.5}])await assert.rejects(()=>fixture(options).terms({id:'customer'}));
});
test('deposit API keeps owner-only scope and rejects foreign business or rule keys before writes',async()=>{
 assert.equal((await fixture({owner:false}).post()).status,403);assert.equal((await fixture({authError:'Unauthorized'}).get()).status,401);
 const f=fixture();for(const body of [{...f.body,salon_id:'B'},{...f.body,rule:{...f.body.rule,created_by:'owner-B'}}])assert.equal((await f.post(body)).status,400);
 assert.equal((await f.get('?salon_id=B')).status,400);assert.equal(f.calls.length,0);
 const response=await f.post();assert.equal(response.status,200);assert.equal(f.calls[0].args.p_salon,'A');assert.equal(f.calls[0].args.p_user,'owner-A');assert.equal(f.calls[0].args.p_request,op);
});

test('deposit API enforces the eighty percent boundary before RPC and accepts zero and thirty percent',async()=>{
 for(const rate of [0,30,80]){
  const f=fixture();const value={...f.body,rule:{...f.body.rule,rate,repeat_incident_count:null,repeat_incident_rate:null}};
  assert.equal((await f.post(value)).status,200);assert.equal(f.calls[0].args.p_rule.rate,rate);
 }
 for(const patch of [{rate:80.01},{rate:100},{threshold_amount:100,threshold_rate:80.01},{repeat_incident_rate:80.01}]){
  const f=fixture();assert.equal((await f.post({...f.body,rule:{...f.body.rule,...patch}})).status,400);assert.equal(f.calls.length,0);
 }
});
