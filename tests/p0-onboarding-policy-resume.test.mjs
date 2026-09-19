import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const selectedId='17400000-0000-4000-8000-000000000011';
const foreignId='17400000-0000-4000-8000-000000000012';
const publishedId='17400000-0000-4000-8000-000000000013';
function fixture() {
  const records=[...Array.from({length:31},(_,i)=>({id:`newer-${i}`,salon_id:'a',published_at:null})),
    {id:selectedId,salon_id:'a',published_at:null,source_locale:'fr',policy:{business_policy_text:'Owned imported policy'}},
    {id:foreignId,salon_id:'b',published_at:null,source_locale:'en',policy:{business_policy_text:'PRIVATE B'}},
    {id:publishedId,salon_id:'a',published_at:'2026-09-18',source_locale:'en',policy:{business_policy_text:'Current published policy'}}];
  const state={queries:0};
  const context={salon:{id:'a',slug:'a',business_policy_revision_id:publishedId},user:{id:'owner-a'},admin:{from(table){
    state.queries++;assert.equal(table,'business_policy_revisions');const predicates=[];let limit=Infinity,single=false;
    const q={select(){return q;},eq(key,value){predicates.push(row=>row[key]===value);return q;},order(){return q;},limit(value){limit=value;return q;},maybeSingle(){single=true;return q;},then(resolve){const rows=records.filter(row=>predicates.every(p=>p(row))).slice(0,limit);return Promise.resolve({data:single?rows[0]||null:rows}).then(resolve);}};return q;
  }}};
  const load=typescriptLoader(process.cwd(),{
    '@/lib/supabaseAdmin':{requireSalonPermission:async()=>context},
    '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
    '@/lib/operationalMonitoring':{withOperationalMonitoring:(_profile,handler)=>handler,routeMonitoringProfile(){}},
    '@/lib/platformErrors':{capturePlatformError:async()=>'POLICY-RESUME-REF',safeFailure:(_msg,id,status=500,details={})=>Response.json({request_id:id,...details},{status})},
  },{Error,SyntaxError});
  const {GET}=load('src/app/api/salon/policies/route.ts');
  return {state,get:id=>GET(new Request(`http://localhost/api/salon/policies?draft=${id}`))};
}
test('onboarding policy resume fetches an older own unpublished draft while preserving current published policy',async()=>{
  const f=fixture();const response=await f.get(selectedId);assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.revisions.find(row=>row.id===selectedId)?.policy.business_policy_text,'Owned imported policy');
  assert.equal(body.current,publishedId);assert.equal(body.revisions.find(row=>row.id===publishedId)?.policy.business_policy_text,'Current published policy');
  assert.doesNotMatch(JSON.stringify(body),/PRIVATE B/);
});
for(const [name,id] of [['foreign',foreignId],['published',publishedId],['missing','17400000-0000-4000-8000-999999999999']])test(`onboarding policy resume rejects ${name} draft without leaking records`,async()=>{
  const response=await fixture().get(id);assert.equal(response.status,404);const body=await response.json();assert.equal(body.code,'POLICY_DRAFT_NOT_FOUND');assert.doesNotMatch(JSON.stringify(body),/PRIVATE B|Owned imported|Current published/);
});
test('onboarding policy resume rejects malformed draft identifier before querying policy history',async()=>{
  const f=fixture();const response=await f.get('not-a-uuid');assert.equal(response.status,400);assert.equal(f.state.queries,0);
});
