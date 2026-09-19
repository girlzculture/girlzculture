import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';

function fixture({stalePhase=false,failedReadback=false,changedSubscription=false}={}){
 const actual={id:'sub_fixture',status:'active',cancel_at_period_end:false,current_period_start:1700000000,current_period_end:1800000000,schedule:null,customer:'cus_fixture',items:{data:[{id:'si_fixture',price:{id:'price_premium'},quantity:1}]}};
 const stored={stripe_subscription_id:actual.id,price_id:'price_premium',tier:'Premium'},schedules=new Map(),cache=new Map(),posts=[],intents=[],writes=[],records=[];let generation=0,held=false,phaseWritten=false;
 const admin={async rpc(name,args){if(name==='acquire_subscription_mutation'){if(held)return{error:{message:'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED'}};held=true;}if(name==='release_subscription_mutation')held=false;if(name==='record_subscription_mutation_request')intents.push(args.p_intent);return{data:true};},from(table){const q={select(){return q;},eq(){return q;},is(){return q;},or(){return q;},maybeSingle:async()=>({data:table==='subscriptions'?stored:null}),update(value){if(table==='subscriptions'){writes.push(value);Object.assign(stored,value);}return q;},upsert(value){records.push(value);return q;},then(resolve){return Promise.resolve({error:null,count:0}).then(resolve);}};return q;}};
 const provider={stripeFailureDiagnostics:()=>null,stripeGet:async path=>{
  if(phaseWritten&&failedReadback)throw Error('FIXTURE_READBACK_UNAVAILABLE');
  if(path.startsWith('/subscriptions/'))return structuredClone(actual);
  if(path.startsWith('/subscription_schedules/'))return structuredClone(schedules.get(path.split('/')[2]));
  throw Error(`Unexpected fixture GET ${path}`);
 },stripeRequest:async(path,values,options)=>{
  const key=options.idempotencyKey;posts.push({path,key,cached:cache.has(key),values});if(cache.has(key))return structuredClone(cache.get(key));let result;
  if(path==='/subscription_schedules'){
   assert.equal(values.from_subscription,actual.id);const id=`sub_sched_fixture_${++generation}`;result={id,status:'active',subscription:actual.id,customer:actual.customer,released_subscription:null,phases:[]};schedules.set(id,result);actual.schedule=id;
  }else if(path.startsWith('/subscription_schedules/')){
   const schedule=schedules.get(path.split('/')[2]);assert(schedule);
   if(path.endsWith('/release')){assert.equal(schedule.status,'active');schedule.status='released';schedule.subscription=null;schedule.released_subscription=actual.id;actual.schedule=null;}
   else{
    assert.equal(schedule.status,'active','released schedules cannot accept phases');phaseWritten=true;
    if(!stalePhase){for(const[key,value]of Object.entries(values)){
     if(key==='proration_behavior'||key.includes('[duration]'))continue;const parts=key.split(/[\[\]]/).filter(Boolean);let cursor=schedule;
     for(let i=0;i<parts.length-1;i++){const part=parts[i];cursor[part]??=/^\d+$/.test(parts[i+1])?[]:{};cursor=cursor[part];}cursor[parts.at(-1)]=value;
    }schedule.phases[1].end_date=1802678400;}
    if(changedSubscription)actual.items.data[0].quantity=2;
   }result=schedule;
  }else throw Error(`Unexpected fixture POST ${path}`);
  cache.set(key,structuredClone(result));return structuredClone(result);
 }};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,h)=>h,noteOperationalFailure:()=>{}},
  '@/lib/requestSecurity':{cleanText:value=>value,enforceRateLimit:()=>{},errorResponse:err=>Response.json({error:err.message},{status:500}),RateLimitError:class extends Error{}},
  '@/lib/supabaseAdmin':{requireSalonOwner:async()=>({admin,salon:{id:'business_fixture'},user:{id:'owner_fixture'},isOwner:true})},
  '@/lib/stripeServer':provider,'@/lib/subscriptionPriceServer':{verifiedSubscriptionPrice:async()=>({priceId:'price_growth'})},
  '@/lib/platformErrors':{UserSafeRequestError:class extends Error{},rejectRequest:message=>{throw Error(message);},capturePlatformError:async()=> 'DOWNGRADE-READBACK',safeFailure:(message,reference,status,extra)=>Response.json({error:message,request_id:reference,...extra},{status}),monitoredRouteFailure:({error})=>Response.json({error:error.message},{status:500})},
 });
 const change=load('src/app/api/stripe/subscription/change/route.ts'),lifecycle=load('src/app/api/stripe/subscription/lifecycle/route.ts');
 const call=async(route,body)=>{const response=await route.POST(new Request('https://fixture.invalid/api/stripe/subscription/test',{method:'POST',body:JSON.stringify(body)}));return{status:response.status,...await response.json()};};
 return{actual,stored,schedules,posts,intents,writes,records,isHeld:()=>held,change:()=>call(change,{plan:'Growth'}),cancel:()=>call(lifecycle,{action:'cancel_scheduled_change'})};
}
test('downgrade cancellation then the same downgrade creates a fresh verified schedule with durable per-intent keys',async()=>{
 const f=fixture();const first=await f.change();assert.equal(first.status,200);assert.equal(first.scheduled,true);assert.equal(f.actual.schedule,'sub_sched_fixture_1');
 assert.equal((await f.cancel()).status,200);assert.equal(f.actual.schedule,null);assert.equal(f.schedules.get('sub_sched_fixture_1').status,'released');
 const second=await f.change();assert.equal(second.status,200);assert.equal(second.scheduled,true);assert.equal(f.actual.schedule,'sub_sched_fixture_2');assert.equal(f.stored.stripe_schedule_id,f.actual.schedule);assert.equal(f.schedules.get(f.actual.schedule).phases[1].items[0].price,'price_growth');
 assert.equal(f.actual.items.data[0].price.id,'price_premium');assert.equal(first.amountChargedNow,0);assert.equal(second.amountChargedNow,0);assert.equal(f.isHeld(),false);
 assert.equal(new Set(f.posts.map(row=>row.key)).size,f.posts.length);assert.deepEqual(f.posts.map(row=>row.key),f.intents.map(row=>row.idempotency_key));assert.equal(new Set(f.records.map(row=>row.idempotency_key)).size,2);
 assert(f.posts.every(row=>row.path.startsWith('/subscription_schedules')),'no direct invoice/payment/subscription purchase');
});
for(const failure of ['stalePhase','failedReadback','changedSubscription'])test(`downgrade ${failure} cannot persist or claim an unverified scheduled plan`,async()=>{
 const f=fixture({[failure]:true}),result=await f.change();assert.equal(result.status,409);assert.equal(result.code,'SUBSCRIPTION_MUTATION_REVIEW_REQUIRED');assert.equal(result.request_id,'DOWNGRADE-READBACK');assert.deepEqual(f.writes,[]);assert.deepEqual(f.records,[]);assert.equal(f.isHeld(),true);
 const count=f.posts.length;assert.equal((await f.change()).status,409);assert.equal(f.posts.length,count,'no new generation after uncertain result');
 assert.equal(f.posts.filter(row=>row.path.endsWith('/release')).length,0,'do not compensate an unavailable or mismatched authoritative agreement');
});
