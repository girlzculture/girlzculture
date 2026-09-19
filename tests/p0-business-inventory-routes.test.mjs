import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const reference='protected-stock-reference';
function fixture(business='A',failure){
 const calls=[],events=[];
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonPermission:async(_req,permission)=>{
   assert.equal(permission,'products');
   return {salon:{id:business},user:{id:`owner-${business}`},admin:{rpc:async(name,args)=>{calls.push({name,args});return failure?{error:{message:failure}}:{data:{verified:true}};}}};
  }},
  '@/lib/requestSecurity':{enforceRateLimit(){}},'@/lib/operationalMonitoring':{routeMonitoringProfile(){return{};},withOperationalMonitoring:(_,handler)=>handler},
  '@/lib/platformErrors':{capturePlatformError:async event=>{events.push(event);return reference;}},
 });
 const route=load('src/app/api/salon/inventory/route.ts');const body={action:'restock',request_id:'10000000-0000-4000-8000-000000000001',payload:{product_id:'10000000-0000-4000-8000-000000000002',quantity:2,expected_revision:1}};
 return{calls,events,body,post:(value=body)=>route.POST(new Request('https://fixture.invalid/api/salon/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})),get:(query='')=>route.GET(new Request('https://fixture.invalid/api/salon/inventory'+query))};
}
test('stock reads, follow-ups and writes derive both business and actor from the session',async()=>{
 for(const business of ['A','B']){const f=fixture(business);await f.get();await f.get();const response=await f.post();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(f.calls.length,3);for(const call of f.calls){assert.equal(call.args.p_salon,business);assert.equal(call.args.p_user,`owner-${business}`);}assert.equal(f.calls[2].args.p_request,f.body.request_id);}
});
test('foreign business, actor, unknown fields and fractional counts are rejected before RPC',async()=>{
 const f=fixture();for(const value of [{...f.body,salon_id:'B'},{...f.body,payload:{...f.body.payload,salon_id:'B'}},{...f.body,payload:{...f.body.payload,actor_id:'B'}},{...f.body,payload:{...f.body.payload,quantity:1.5}},{...f.body,payload:{...f.body.payload,quantity:-1}}])assert.equal((await f.post(value)).status,400);
 assert.equal((await f.get('?salon_id=B')).status,400);assert.equal(f.calls.length,0);
});
test('stock conflicts and permission changes return JSON and the exact Engine reference without raw SQL',async()=>{
 for(const [code,status] of [['STOCK_REVISION_CONFLICT',409],['STOCK_INSUFFICIENT',409],['STOCK_RECORD_NOT_FOUND',404],['STOCK_ACCESS_DENIED',403],['STOCK_FINANCE_PERMISSION_REQUIRED',403]]){const f=fixture('A',code);const response=await f.post();assert.equal(response.status,status);assert.deepEqual(await response.json(),{code,request_id:reference});assert.equal(response.headers.get('x-request-id'),reference);}
 const f=fixture('A','private record detail in database error');const response=await f.post();assert.equal(response.status,500);assert.equal(f.events[0].error.message,'STOCK_UNAVAILABLE');assert.equal(JSON.stringify(await response.json()).includes('private record'),false);
});
