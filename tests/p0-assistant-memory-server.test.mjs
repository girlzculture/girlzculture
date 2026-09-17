import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
const {readAssistantMemory,saveAssistantMemory,deleteAssistantMemory} = typescriptLoader(root)('src/lib/assistantMemoryServer.ts');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture(options={}) {
  const requests=options.requests || [{id,salon_id:'business-A',requested_by:'actor-A',tool:'get_services_and_prices',permission:'styles',risk_class:1,failure_code:null}];
  let memory=options.memory || null; const calls=[];
  const admin={
    async rpc(name,args) { calls.push({name,args}); return {data:name==='p0_business_plan_active'?options.plan!==false:!(options.denied||[]).includes(args.p_permission)}; },
    from(table) {
      const filters=[]; let mutation; let single=false;
      const query={select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},in(k,v){filters.push(r=>v.includes(r[k]));return query;},gt(k,v){filters.push(r=>r[k]>v);return query;},limit(){return query;},
        maybeSingle(){single=true;return query;},single(){single=true;return query;},upsert(row){mutation=row;return query;},delete(){mutation='delete';return query;},
        then(resolve,reject){return Promise.resolve().then(()=>{
          calls.push({table,mutation});
          if(table==='gc_assistant_requests') return {data:requests.filter(r=>filters.every(f=>f(r)))};
          assert.equal(table,'gc_assistant_memory');
          if(mutation==='delete'){if(memory&&filters.every(f=>f(memory)))memory=null;return {data:null};}
          if(mutation)memory=structuredClone(mutation);
          const rows=memory&&filters.every(f=>f(memory))?[memory]:[];
          return {data:single?(rows[0]||null):rows};
        }).then(resolve,reject);},
      };return query;
    },
  };
  return {context:{admin,user:{id:'actor-A'},salon:{id:'business-A'}},calls,get memory(){return memory;}};
}
const input={consent:true,locale:'es',request_ids:[id]};
const saved={salon_id:'business-A',requested_by:'actor-A',request_ids:[id],locale:'es',saved_at:'2026-09-17T00:00:00Z',expires_at:'2099-01-01T00:00:00Z'};
test('explicit save and a new session restore only references and locale, with a 30-day expiry',async()=>{
  const f=fixture(); const result=await saveAssistantMemory(f.context,input);
  assert.equal(result.locale,'es'); assert.deepEqual(Array.from(result.request_ids),[id]);
  assert.equal(Date.parse(result.expires_at)-Date.parse(result.saved_at),30*86400000);
  assert.deepEqual(Object.keys(f.memory).sort(),['expires_at','locale','request_ids','requested_by','salon_id','saved_at']);
  const restored=await readAssistantMemory(f.context);
  assert.deepEqual(Array.from(restored.request_ids),[id]);
});
test('other-actor and other-business request IDs cannot be saved or restored',async()=>{
  for(const scope of [{requested_by:'actor-B'},{salon_id:'business-B'}]){
    const f=fixture({requests:[{id,salon_id:'business-A',requested_by:'actor-A',tool:'get_services_and_prices',permission:'styles',risk_class:1,...scope}]});
    await assert.rejects(saveAssistantMemory(f.context,input),/ASSISTANT_MEMORY_NO_SAFE_CONTEXT/);assert.equal(f.memory,null);
    const hidden=fixture({memory:{...saved,...scope}});assert.equal(await readAssistantMemory(hidden.context),null);
  }
});
test('restoration rechecks permissions and expiry rather than replaying stored private content',async()=>{
  const revoked=fixture({memory:saved,denied:['styles']});
  assert.deepEqual(Array.from((await readAssistantMemory(revoked.context)).request_ids),[]);
  const expired=fixture({memory:{...saved,expires_at:'2000-01-01T00:00:00Z'}});
  assert.equal(await readAssistantMemory(expired.context),null);
});
test('customer context and proposals are excluded even when mixed with a safe topic',async()=>{
  const f=fixture({requests:[{id,salon_id:'business-A',requested_by:'actor-A',tool:'get_services_and_prices',permission:'styles',risk_class:1},{id:other,salon_id:'business-A',requested_by:'actor-A',tool:'get_booking_messages',permission:'bookings',risk_class:1}]});
  const result=await saveAssistantMemory(f.context,{...input,request_ids:[id,other]});
  assert.deepEqual(Array.from(result.request_ids),[id]);
});
test('deletion stays available after plan expiry and only removes the current actor bookmark',async()=>{
  const f=fixture({memory:saved,plan:false});await deleteAssistantMemory(f.context);
  assert.equal(f.memory,null);assert.equal(f.calls.some(c=>c.name),false);
  const otherActor=fixture({memory:{...saved,requested_by:'actor-B'},plan:false});await deleteAssistantMemory(otherActor.context);
  assert.ok(otherActor.memory);
});
