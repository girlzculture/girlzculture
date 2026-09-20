import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const reference='finance-protected-reference';
function fixture({business='A',failure,authError}={}){
  const calls=[];
  const context={salon:{id:business,time_zone:'UTC'},user:{id:`owner-${business}`},isOwner:true,admin:{rpc:async(name,args)=>{calls.push({name,args});return failure?{error:{message:failure}}:{data:{id:'saved-id',verified:true}};}}};
  const load=typescriptLoader(process.cwd(),{
    '@/lib/supabaseAdmin':{requireSalonOwner:async()=>{if(authError)throw Error(authError);return context;}},
    '@/lib/requestSecurity':{enforceRateLimit(){}},
    '@/lib/operationalMonitoring':{routeMonitoringProfile(){return{};},withOperationalMonitoring:(_,handler)=>handler},
    '@/lib/platformErrors':{capturePlatformError:async()=>reference},
    '@/lib/businessFinanceServer':{readBusinessFinances:async(ctx,period)=>{calls.push({readBusiness:ctx.salon.id,period});return {scope:'business',summary:{completed_sales_cents:0}};}},
  });
  const route=load('src/app/api/salon/finances/route.ts');
  const body={action:'sale',request_id:'10000000-0000-4000-8000-000000000001',payload:{kind:'service',name:'Braids',stylist_id:'stylist-A',list_cents:10000,method:'cash',source:'walk_in'}};
  return{calls,body,post:(value=body)=>route.POST(new Request('https://fixture.invalid/api/salon/finances',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})),get:(query='from=2026-09-01&to=2026-09-30')=>route.GET(new Request(`https://fixture.invalid/api/salon/finances?${query}`))};
}
test('mutations derive business and actor from verified session; retries keep the caller request ID',async()=>{
  for(const business of ['A','B']){const f=fixture({business});const response=await f.post();assert.equal(response.status,200);assert.equal((await response.json()).verified,true);assert.equal(f.calls[0].args.p_salon,business);assert.equal(f.calls[0].args.p_user,`owner-${business}`);assert.equal(f.calls[0].args.p_request,f.body.request_id);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
test('body, query and nested foreign business IDs cannot override the authenticated scope',async()=>{
  const f=fixture();for(const body of [{...f.body,salon_id:'B'},{...f.body,payload:{...f.body.payload,salon_id:'B'}},{...f.body,payload:{...f.body.payload,created_by:'owner-B'}}])assert.equal((await f.post(body)).status,400);
  assert.equal((await f.get('from=2026-09-01&to=2026-09-30&salon_id=B')).status,400);assert.equal(f.calls.length,0);
});
test('invalid fractions and non-numeric money cannot be silently rounded by PostgreSQL',async()=>{
  for(const value of [1.005,-1,'100',true]){const f=fixture();assert.equal((await f.post({...f.body,payload:{...f.body.payload,list_cents:value}})).status,400);assert.equal(f.calls.length,0);}
});
test('denied roles and foreign record IDs retain JSON status and exact protected reference',async()=>{
  for(const [failure,status] of [['FINANCE_ACCESS_DENIED',403],['FINANCE_RECORD_NOT_FOUND',404],['FINANCE_REQUEST_CONFLICT',409],['FINANCE_DEPOSIT_UNVERIFIED',409]]){const f=fixture({failure});const response=await f.post();assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,failure);assert.equal(body.request_id,reference);assert.equal(response.headers.get('x-request-id'),reference);}
  assert.equal((await fixture({authError:'Unauthorized'}).get()).status,401);
});
test('entry choices use a separate protected RPC without reading business totals',async()=>{
  const f=fixture();await f.get('options=entry');assert.equal(f.calls[0].name,'business_finance_entry_options');assert.equal(f.calls[0].args.p_salon,'A');
});
