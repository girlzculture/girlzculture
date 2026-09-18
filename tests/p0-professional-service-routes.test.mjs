import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',sa='10000000-0000-4000-8000-000000000003',sb='10000000-0000-4000-8000-000000000004',pa='10000000-0000-4000-8000-000000000005',pb='10000000-0000-4000-8000-000000000006';
function fixture({business=a,permissions=['stylists','styles']}={}){
 const records={styles:[{id:sa,salon_id:a},{id:sb,salon_id:b}],stylists:[{id:pa,salon_id:a,name:'Awa',assigned_service_ids:null},{id:pb,salon_id:b,name:'Private B',assigned_service_ids:null}]};const writes=[];
 const admin={from(table){const predicates=[];let patch;let single=false;const q={select(){return q;},eq(key,value){predicates.push(row=>row[key]===value);return q;},in(key,values){predicates.push(row=>values.includes(row[key]));return q;},update(values){patch=values;return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},then(resolve,reject){return Promise.resolve().then(()=>{const rows=records[table].filter(row=>predicates.every(p=>p(row)));if(patch){for(const row of rows){writes.push({...patch,id:row.id});Object.assign(row,patch);}}return{data:single?rows[0]||null:rows,error:null};}).then(resolve,reject);}};return q;}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{requireSalonPermission:async(_request,permission)=>{if(!permissions.includes(permission))throw Error('Forbidden');return{admin,salon:{id:business}};}},
  '@/lib/contentModerationServer':{moderatePublicContent:async()=>({allowed:true})},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},
  '@/lib/platformErrors':{capturePlatformError:async()=>{throw Error('Unexpected platform error');},safeFailure:()=>{throw Error('Unexpected platform failure');}},
 },{Error});
 const route=load('src/app/api/salon/records/save/route.ts');
 return{records,writes,run:async(ids,id=pa)=>route.POST(new Request('https://fixture.invalid/api/salon/records/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'stylists',id,salon_id:b,values:{assigned_service_ids:ids}})}))};
}
test('assignment save derives business from authentication and verifies persisted own data for either business',async()=>{
 for(const [business,professional,service] of [[a,pa,sa],[b,pb,sb]]){const f=fixture({business});const response=await f.run([service],professional);assert.equal(response.status,200);const body=await response.json();assert.equal(body.verified,true);assert.equal(body.record.salon_id,business);assert.deepEqual(body.record.assigned_service_ids,[service]);assert.equal(f.writes.length,1);}
});
test('foreign service and professional ids are denied before any write or private record response',async()=>{
 for(const [ids,id] of [[[sb],pa],[[sa],pb]]){const f=fixture();const response=await f.run(ids,id);assert.equal(response.status,400);assert.deepEqual(f.writes,[]);assert.equal((await response.text()).includes('Private B'),false);}
});
test('roles require both catalog and stylist permission for every assignment request, including clearing',async()=>{
 for(const permissions of [[],['styles'],['stylists']])for(const ids of [null,[],[sa]]){const f=fixture({permissions});assert.equal((await f.run(ids)).status,403);assert.deepEqual(f.writes,[]);}
});
