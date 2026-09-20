import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const booking='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002',requestId='10000000-0000-4000-8000-000000000003',reference='10000000-0000-4000-8000-000000000004';
function fixture({isOwner=true,failure,business='A'}={}){
 const calls=[],events=[];
 const admin={rpc:async(name,args)=>{
  calls.push({name,args});assert.equal(args.p_salon,business);assert.equal(args.p_actor,`owner-${business}`);assert.equal(args.p_booking,booking);
  if(failure)return{error:{message:failure}};
  if(name==='read_business_client_links')return{data:{revision:4,links:[],candidates:[{booking_id:target,name:'Own client'}]}};
  if(name==='change_business_client_link')return{data:{verified:true}};
  if(name==='read_business_client_card')return{data:{booking_id:booking,revision:1,permissions:Object.fromEntries(['client_history','client_formulas','client_notes','client_cautions','client_photos','client_spend','client_edit'].map(k=>[k,true])),visits:[],photos:[]}};
  throw Error(name);
 }};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonPermission:async(_,permission)=>{assert.equal(permission,'client_history');return{admin,salon:{id:business},user:{id:`owner-${business}`},isOwner};}},
  '@/lib/requestSecurity':{enforceRateLimit(){}},
  '@/lib/platformErrors':{capturePlatformError:async data=>{events.push(data);return reference;}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h},
 });
 const route=load('src/app/api/salon/bookings/[id]/client-record/links/route.ts');
 const run=(body,query='')=>route[body?'POST':'GET'](new Request(`https://example.test/links${query}`,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})}),{params:Promise.resolve({id:booking})});
 return{run,calls,events,body:{request_id:requestId,revision:4,action:'link',target}};
}
test('client-link search/write derives own business and actor and rechecks saved card',async()=>{
 for(const business of ['A','B']){const f=fixture({business});const search=await f.run(undefined,'?q=Jane');assert.equal(search.status,200);assert.equal(search.headers.get('cache-control'),'private, no-store');assert.equal(f.calls[0].args.p_search,'Jane');assert.equal((await f.run(f.body)).status,200);assert.deepEqual(f.calls.map(c=>c.name),['read_business_client_links','change_business_client_link','read_business_client_card']);}
});
test('staff and forged identity/business/query fields fail before link retrieval or mutation',async()=>{
 const staff=fixture({isOwner:false});assert.equal((await staff.run()).status,403);assert.equal((await staff.run(staff.body)).status,403);assert.equal(staff.calls.length,0);
 for(const patch of [{salon_id:'B'},{customer_id:'B'},{actor_id:'B'},{revision:-1},{action:'merge'},{target:'not-uuid'}]){const f=fixture();assert.equal((await f.run({...f.body,...patch})).status,400);assert.equal(f.calls.length,0);}
 for(const query of ['?salon_id=B','?q=A&q=B','?q='+('x'.repeat(121))]){const f=fixture();assert.equal((await f.run(undefined,query)).status,400);assert.equal(f.calls.length,0);}
});
test('link conflicts/foreign records/private failures return exact safe Engine references',async()=>{
 for(const [failure,status] of [['CLIENT_CHANGED',409],['CLIENT_IDENTITY_CONFLICT',409],['CLIENT_NOT_FOUND',404],['CLIENT_ALREADY_LINKED',409],['private customer email and secret SQL text',500]]){
  const f=fixture({failure});const response=await f.run(f.body);const body=await response.json();assert.equal(response.status,status);assert.equal(body.request_id,reference);assert.equal(response.headers.get('x-request-id'),reference);assert.equal(f.events[0].error.message,body.code);assert.doesNotMatch(JSON.stringify(body),/secret SQL|customer email/);
 }
});
