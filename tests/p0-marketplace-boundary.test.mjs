import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { randomUUID, createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
function loadModule(file, dependencies, env = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: dependencies, Response, Request, URL, Set, process: { env } });
  return exports;
}

for (const path of ['booking-checkout', 'commerce-checkout', 'pickup-reservation']) {
  test(`${path} rejects a registered test business even with marketplace live`, async () => {
    let stripeCalls = 0;
    const queries = [];
    const salonId = '22000000-0000-4000-8000-000000000001';
    const productId = '33000000-0000-4000-8000-000000000006';
    const admin = { from(table) {
      assert.equal(table, 'test_data_registry', 'Demo rejection must precede booking, payment and catalog work');
      const filters = []; queries.push({ table, filters });
      return { select(value) { assert.equal(value, 'id'); return this; }, eq(...args) { filters.push(args); return this; }, async limit(value) { assert.equal(value, 1); return { data: [{ id: 'registered-demo' }], error: null }; } };
    } };
    const dependencies = name => {
      if (name === 'node:crypto') return { randomUUID, createHash };
      if (name === '@/lib/marketplaceLaunchCore') return loadModule('src/lib/marketplaceLaunchCore.ts', () => { throw new Error('Unexpected launch dependency'); }, { CUSTOMER_MARKETPLACE_LIVE: 'true' });
      if (name === '@/lib/marketplaceEligibilityServer') return loadModule('src/lib/marketplaceEligibilityServer.ts', value => { assert.equal(value, 'server-only'); return {}; });
      if (name === '@/lib/operationalMonitoring') return { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile: () => ({}), noteOperationalFailure() {} };
      if (name === '@/lib/requestSecurity') return { cleanText: value => String(value || '').trim(), cleanEmail: value => value, cleanUsPhone: value => value, enforceRateLimit() {}, rejectBot() {} };
      if (name === '@/lib/supabaseAdmin') return { getSupabaseAdmin: () => admin };
      if (name === '@/lib/stripeServer') return { stripeRequest() { stripeCalls++; throw new Error('Demo must not reach Stripe'); } };
      return new Proxy({}, { get: () => () => { throw new Error(`Unexpected provider dependency ${name}`); } });
    };
    const route = loadModule(`src/app/api/stripe/${path}/route.ts`, dependencies);
    const response = await route.POST(new Request(`https://girlzculture.test/api/stripe/${path}`, { method: 'POST', body: JSON.stringify({ salon_id: salonId, style_id: productId, product_id: productId, quantity: 1, guest_name: 'Fixture customer', guest_email: 'fixture@example.test', guest_phone: '+13055550123', items: [{ product_id: productId, quantity: 1 }] }) }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'BUSINESS_NOT_AVAILABLE');
    assert.equal(stripeCalls, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(queries)), [{ table: 'test_data_registry', filters: [['record_type', 'salon'], ['record_id', salonId]] }]);
  });
}

test('live marketplace eligibility preserves genuine businesses and fails closed on registry lookup errors', async () => {
  const helper = loadModule('src/lib/marketplaceEligibilityServer.ts', name => { assert.equal(name, 'server-only'); return {}; });
  const fixture = result => ({ from: () => ({ select() { return this; }, eq() { return this; }, limit: async () => result }) });
  assert.equal(await helper.rejectRegisteredTestCheckout(fixture({ data: [], error: null }), 'genuine-fixture'), null);
  await assert.rejects(helper.rejectRegisteredTestCheckout(fixture({ data: null, error: { message: 'fixture unavailable' } }), 'genuine-fixture'), /MARKETPLACE_ELIGIBILITY_UNAVAILABLE/);
});

test('a replaced business policy blocks checkout before any payment or booking work', async () => {
  let stripeCalls = 0;
  const route = loadModule('src/app/api/stripe/booking-checkout/route.ts', name => {
    if (name === 'node:crypto') return { randomUUID, createHash };
    if (name === '@/lib/marketplaceLaunchCore') return { customerMarketplaceLive: () => true };
    if (name === '@/lib/marketplaceEligibilityServer') return { rejectRegisteredTestCheckout: async () => null };
    if (name === '@/lib/businessPolicyServer') return { currentBusinessPolicy: async () => ({ id: 'published-version-2' }) };
    if (name === '@/lib/operationalMonitoring') return { withOperationalMonitoring: (_profile, handler) => handler, routeMonitoringProfile: () => ({}), noteOperationalFailure() {} };
    if (name === '@/lib/requestSecurity') return { cleanText: value => String(value || '').trim(), enforceRateLimit() {}, rejectBot() {} };
    if (name === '@/lib/supabaseAdmin') return { getSupabaseAdmin: () => ({}) };
    if (name === '@/lib/stripeServer') return { stripeRequest() { stripeCalls++; throw Error('Stale policy reached payment'); } };
    return new Proxy({}, { get: () => () => { throw Error('Stale policy reached a downstream dependency'); } });
  });
  const response = await route.POST(new Request('http://localhost/api/stripe/booking-checkout', { method: 'POST', body: JSON.stringify({ salon_id: 'fixture-business', style_id: 'fixture-service', business_policy_revision_id: 'published-version-1' }) }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'BUSINESS_POLICY_CHANGED');
  assert.equal(stripeCalls, 0);
});

test('marketplace checkout requires separate explicit acknowledgements before payment dependencies',async()=>{
  for (const acknowledgements of [{},{platform_policy_acknowledged:true},{business_policy_acknowledged:true}]) {
    let downstream=0;
    const route=loadModule('src/app/api/stripe/booking-checkout/route.ts',name=>{
      if(name==='node:crypto')return{randomUUID,createHash};
      if(name==='@/lib/marketplaceLaunchCore')return{customerMarketplaceLive:()=>true};
      if(name==='@/lib/marketplaceEligibilityServer')return{rejectRegisteredTestCheckout:async()=>null};
      if(name==='@/lib/businessPolicyServer')return{currentBusinessPolicy:async()=>({id:'revision'})};
      if(name==='@/lib/operationalMonitoring')return{withOperationalMonitoring:(_p,h)=>h,routeMonitoringProfile:()=>({}),noteOperationalFailure(){}};
      if(name==='@/lib/requestSecurity')return{cleanText:v=>String(v||'').trim(),enforceRateLimit(){},rejectBot(){}};
      if(name==='@/lib/supabaseAdmin')return{getSupabaseAdmin:()=>({})};
      return new Proxy({},{get:()=>()=>{downstream++;throw Error('Unaccepted policies reached downstream');}});
    });
    const response=await route.POST(new Request('http://localhost/api/stripe/booking-checkout',{method:'POST',body:JSON.stringify({salon_id:'business',style_id:'service',business_policy_revision_id:'revision',...acknowledgements})}));
    assert.equal(response.status,400);assert.equal((await response.json()).code,'BOOKING_POLICY_ACKNOWLEDGEMENT_REQUIRED');assert.equal(downstream,0);
  }
});

// With the retired presentation gate removed, real eligibility must still fail closed.
for (const path of ['booking-checkout', 'commerce-checkout', 'pickup-reservation']) test(path+' registry outage cannot reach Stripe', async()=>{
  let stripeCalls=0;
  const route=loadModule('src/app/api/stripe/'+path+'/route.ts',name=>{
    if(name==='node:crypto')return{randomUUID,createHash};
    if(name==='@/lib/operationalMonitoring')return{withOperationalMonitoring:(_p,h)=>h,routeMonitoringProfile:()=>({}),noteOperationalFailure(){}};
    if(name==='@/lib/requestSecurity')return{cleanText:v=>String(v||'').trim(),cleanEmail:v=>v,cleanUsPhone:v=>v,enforceRateLimit(){},rejectBot(){},errorResponse:()=>Response.json({error:'Unable to start secure checkout.'},{status:500})};
    if(name==='@/lib/supabaseAdmin')return{getSupabaseAdmin:()=>({})};
    if(name==='@/lib/marketplaceEligibilityServer')return{rejectRegisteredTestCheckout:async()=>{throw Error('MARKETPLACE_ELIGIBILITY_UNAVAILABLE')}};
    if(name==='@/lib/platformErrors')return{capturePlatformError:async()=> 'registry-outage-reference'};
    if(name==='@/lib/stripeServer')return{stripeRequest(){stripeCalls++;throw Error('Registry failure reached Stripe')}};
    return new Proxy({},{get:()=>()=>{throw Error('Unexpected downstream '+name)}});
  });
  const result=await route.POST(new Request('https://girlzculture.test/api/stripe/'+path,{method:'POST',body:JSON.stringify({salon_id:'22000000-0000-4000-8000-000000000001',style_id:'33000000-0000-4000-8000-000000000006',product_id:'33000000-0000-4000-8000-000000000006',guest_name:'Fixture',guest_email:'fixture@example.test',quantity:1,items:[{product_id:'33000000-0000-4000-8000-000000000006',quantity:1}]})}));
  assert.ok(result.status>=400);assert.match(result.headers.get('content-type'),/application\/json/);assert.equal(stripeCalls,0);
});
