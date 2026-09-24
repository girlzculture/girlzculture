import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';

function fixture({sample=true,policy={id:'published-a',salon_id:'business-a',policy:{business_policy_text:'Own published terms'},version:2,source_locale:'en',published_at:'2026-09-24'},current='published-a'}={}){
 const queries=[];
 const context={salon:{id:'business-a',is_demo:sample,business_policy_revision_id:current},user:{id:'owner-a'},isOwner:true,admin:{from(table){
  const filters=[];let single=false;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},is(){return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},then(resolve){queries.push({table,filters});return Promise.resolve({data:single?policy:[],error:null}).then(resolve);}};return q;
 }}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonPermission:async(_r,p)=>{assert.equal(p,'my_page');return context;}},
  '@/lib/operationalMonitoring':{withOperationalMonitoring:(_p,h)=>h,routeMonitoringProfile(){}},
  '@/lib/platformErrors':{rejectRequest(_m,status){throw Object.assign(new Error('REJECTED'),{status});},monitoredRouteFailure:async({error})=>Response.json({code:'DEMO_PREVIEW_UNAVAILABLE'},{status:error.status||500})},
 },{Error});
 return {queries,get:()=>load('src/app/api/salon/demo-page/route.ts').GET(new Request('https://example.test/api/salon/demo-page'))};
}
test('private demo preview projects only its current published policy and scopes every read',async()=>{
 const f=fixture();const response=await f.get();assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.policy.policy.business_policy_text,'Own published terms');
 assert.equal(body.policy.version,2);assert.equal(body.policy.salon_id,undefined);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 for(const q of f.queries)assert.ok(q.filters.some(([k,v])=>k==='salon_id'&&v==='business-a'));
 assert.ok(f.queries.find(q=>q.table==='business_policy_revisions').filters.some(([k,v])=>k==='id'&&v==='published-a'));
});
test('private demo preview rejects a real business and does not query sample records',async()=>{
 const f=fixture({sample:false});assert.equal((await f.get()).status,404);assert.equal(f.queries.length,0);
});
for(const policy of [null,{salon_id:'business-b',published_at:'2026-09-24',policy:{business_policy_text:'PRIVATE B'}},{salon_id:'business-a',published_at:null,policy:{business_policy_text:'UNPUBLISHED DRAFT'}}])test(`private demo preview fails closed on missing, foreign or draft current policy ${JSON.stringify(policy?.salon_id)}`,async()=>{
 const response=await fixture({policy}).get();assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/PRIVATE B|UNPUBLISHED/);
});
test('a demo without a published policy does not invent one',async()=>{
 const f=fixture({current:null});assert.equal((await (await f.get()).json()).policy,null);assert.ok(f.queries.every(q=>q.table!=='business_policy_revisions'));
});
