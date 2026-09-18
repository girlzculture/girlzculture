import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function fixture(team = false) {
 const tables={bookings:Array.from({length:1002},(_,i)=>({id:`own-${i}`,salon_id:'A',stylist_id:i===1001?'other':'assigned',guest_name:`Client ${i}`,created_at:'2030-01-01'})).concat({id:'foreign',salon_id:'B',stylist_id:'assigned',guest_name:'FOREIGN_PRIVATE'}),notifications:[{id:'n1',salon_id:'A',user_id:team?'staff':'owner',booking_id:'own-0'},{id:'n2',salon_id:'A',user_id:team?'staff':'owner',booking_id:'own-1001'},{id:'n3',salon_id:'A',user_id:'other',booking_id:'own-0'}],salon_blockouts:[]};
 const calls=[];
 const admin={from(table){let from=0,to=999;const filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},order(){return q;},range(a,b){from=a;to=b;return q;},then(ok,fail){calls.push({table,from,to});return Promise.resolve({data:(tables[table]||[]).filter(r=>filters.every(f=>f(r))).slice(from,to+1),error:null}).then(ok,fail);}};return q;}};
 const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>({admin,salon:{id:'A'},user:{id:team?'staff':'owner'},isOwner:!team,teamMember:team?{stylist_id:'assigned',permissions:{bookings:true}}:null})},'@/lib/platformErrors':{monitoredRouteFailure:async()=>Response.json({error:'fixture failure'},{status:500})},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,fn)=>fn}});
 return {calls,run:()=>load('src/app/api/salon/workspace/route.ts').GET(new Request('https://fixture.invalid/workspace'))};
}
test('workspace loads all authorized bookings beyond the provider page cap before calculating dashboard totals',async()=>{
 const f=fixture();const response=await f.run();assert.equal(response.status,200);const body=await response.json();assert.equal(body.records.bookings.length,1002);assert.equal(body.records.bookings.some(r=>r.salon_id==='B'),false);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('assigned workspace excludes other staff bookings and their notices before the browser',async()=>{
 const f=fixture(true);const response=await f.run();assert.equal(response.status,200);const body=await response.json();assert.equal(body.records.bookings.length,1001);assert.equal(body.records.bookings.some(r=>r.stylist_id!=='assigned'),false);assert.deepEqual(body.records.notifications.map(r=>r.id),['n1']);assert.equal(f.calls.some(c=>c.table==='billing_events'),false);
});
