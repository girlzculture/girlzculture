import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function fixture(options={}){
  const calls=[];
  const context={admin:{},user:{id:'owner-A'},salon:{id:'business-A'}};
  const load=typescriptLoader(root,{
    '@/lib/supabaseAdmin':{requireSalonOwner:async()=>{if(options.authError)throw Error(options.authError);return context;}},
    '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
    '@/lib/platformErrors':{capturePlatformError:async()=> 'SAFE-MEMORY-REFERENCE'},
    '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_profile,handler)=>handler},
    '@/lib/assistantMemoryServer':{
      readAssistantMemory:async c=>{assert.equal(c,context);if(options.databaseError)throw Error('private database details');calls.push('read');return null;},
      saveAssistantMemory:async(c,input)=>{assert.equal(c,context);calls.push(input);return {locale:'es'};},
      deleteAssistantMemory:async c=>{assert.equal(c,context);calls.push('delete');},
    },
  },{Error});
  return {route:load('src/app/api/salon/assistant/memory/route.ts'),calls};
}
test('memory API requires role-verified authentication for every operation and returns JSON only',async()=>{
  for(const authError of ['Unauthorized','Forbidden'])for(const method of ['GET','POST','DELETE']){
    const f=fixture({authError});const response=await f.route[method](new Request('https://app.test/api/salon/assistant/memory',{method}));
    assert.equal(response.status,authError==='Unauthorized'?401:403);
    assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(f.calls.length,0);
  }
});
test('memory rejects oversized and malformed JSON without calling its persistence service',async()=>{
  for(const body of ['{', 'x'.repeat(1001)]){
    const f=fixture();const response=await f.route.POST(new Request('https://app.test/api/salon/assistant/memory',{method:'POST',body}));
    assert.ok([400,413].includes(response.status));assert.equal(f.calls.length,0);assert.equal((await response.json()).code,'ASSISTANT_INVALID_INPUT');
  }
});
test('memory backend failures expose only a stable code and the exact protected incident reference',async()=>{
  const f=fixture({databaseError:true});const response=await f.route.GET(new Request('https://app.test/api/salon/assistant/memory'));
  const body=await response.json();assert.equal(response.status,503);assert.equal(body.code,'ASSISTANT_MEMORY_UNAVAILABLE');
  assert.equal(body.request_id,'SAFE-MEMORY-REFERENCE');assert.equal(response.headers.get('x-request-id'),body.request_id);
  assert.ok(!JSON.stringify(body).includes('private database'));
});
test('cleanup is bounded to expired memory on the published Production deployment',async()=>{
  const calls=[];
  const query={delete(options){calls.push(['delete',options]);return query;},lte(key,value){calls.push(['lte',key,value]);return query;},abortSignal(){return Promise.resolve({count:2});}};
  const load=typescriptLoader(root,{
    '@supabase/supabase-js':{createClient:()=>({from(table){calls.push(['table',table]);return query;}})},
    './_monitoring.mjs':{monitoredNetlifyFailure:()=>Response.json({code:'CLEANUP_FAILED'},{status:503})},
  },{Netlify:{env:{get:name=>name==='NEXT_PUBLIC_SUPABASE_URL'?'https://isolated.example.test':'synthetic-key'}}});
  const {default:cleanup,config}=load('netlify/functions/assistant-memory-cleanup.mjs');
  assert.equal(config.schedule,'@daily');
  for(const deploy of [{context:'deploy-preview',published:true},{context:'production',published:false}]){
    assert.equal((await (await cleanup(null,{deploy})).json()).skipped,true);assert.equal(calls.length,0);
  }
  const result=await cleanup(null,{deploy:{context:'production',published:true}});
  assert.equal((await result.json()).deleted,2);
  assert.deepEqual(calls[0],['table','gc_assistant_memory']);
  assert.equal(calls[2][0],'lte');assert.equal(calls[2][1],'expires_at');assert.ok(Number.isFinite(Date.parse(calls[2][2])));
});
