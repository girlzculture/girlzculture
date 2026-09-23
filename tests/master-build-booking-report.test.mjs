import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const actor='11000000-0000-4000-8000-000000000001',business='22000000-0000-4000-8000-000000000001',foreign='33000000-0000-4000-8000-000000000001';
function fixture({reportBusiness=business,error=null,authenticated=true}={}){
 const calls=[],events=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:{salon_id:reportBusiness,month:args.p_month,level:'basic'},error:error?{message:error}:null};}};
 const load=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>{if(!authenticated)throw Error('Unauthorized');return {admin,user:{id:actor},salon:{id:business}};}},'@/lib/platformErrors':{capturePlatformError:async e=>{events.push(e);return '11000000-0000-4000-8000-000000000099';}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h}});
 return {load,calls,events,route:load('src/app/api/salon/booking-report/route.ts')};
}
const req=query=>new Request('https://fixture.test/api/salon/booking-report?'+query);
test('monthly report uses authenticated actor and tenant with a single canonical month',async()=>{
 const f=fixture();const response=await f.route.GET(req('month=2026-09'));assert.equal(response.status,200);assert.deepEqual(f.calls,[{name:'read_business_booking_report',args:{p_salon:business,p_actor:actor,p_month:'2026-09-01'}}]);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('month and identity overrides fail before any private read',async()=>{
 for(const query of ['','month=2026-13','month=2026-02-31','month=2026-09&month=2026-08','month=2026-09&salon_id='+foreign,'month=2026-09&level=advanced']){const f=fixture();const r=await f.route.GET(req(query));assert.equal(r.status,400,query);assert.equal(f.calls.length,0);}
});
test('foreign report projection is discarded with exact protected reference',async()=>{
 const f=fixture({reportBusiness:foreign});const r=await f.route.GET(req('month=2026-09'));assert.equal(r.status,500);const body=await r.json();assert.equal(body.code,'REPORT_UNAVAILABLE');assert.equal(body.request_id,r.headers.get('X-Request-ID'));assert.equal(f.events[0].salonId,business);assert.ok(!JSON.stringify(body).includes(foreign));
});
test('fresh denied permission and authentication have distinct JSON failures',async()=>{
 for(const [options,status]of [[{error:'REPORT_ACCESS_DENIED'},403],[{authenticated:false},401]]){const f=fixture(options),r=await f.route.GET(req('month=2026-09'));assert.equal(r.status,status);assert.match(r.headers.get('Content-Type'),/json/);if(!options.authenticated&&!options.error)assert.equal(f.calls.length,0);}
});
test('database diagnostics cannot expose row contents or provider bodies',async()=>{
 const f=fixture({error:'PRIVATE CUSTOMER credential raw body'});const r=await f.route.GET(req('month=2026-09'));assert.equal(r.status,500);assert.ok(!(await r.text()).includes('PRIVATE'));assert.equal(f.events[0].error.message,'REPORT_UNAVAILABLE');
});
