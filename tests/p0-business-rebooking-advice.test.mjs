import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const salon='22000000-0000-4000-8000-000000000001',other='22000000-0000-4000-8000-000000000002',owner='33000000-0000-4000-8000-000000000001',staff='33000000-0000-4000-8000-000000000002',professional='44000000-0000-4000-8000-000000000001',colleague='44000000-0000-4000-8000-000000000002';
const now=Date.parse('2026-09-19T16:00:00Z'),zone='America/New_York';
const id=n=>'55000000-0000-4000-8000-'+String(n).padStart(12,'0');
const group=n=>String(n).padStart(32,'0');
const booking=(n,key,date,extra={})=>({id:id(n),salon_id:salon,stylist_id:professional,group_key:group(key),client_name:'Saved client '+key,appointment_datetime:date+'T15:00:00Z',service_completed_at:null,status:'Completed',unlinked_guest:false,...extra});
const visits=(key,last='2026-08-08',start=key*10)=>[booking(start,key,'2026-02-01'),booking(start+1,key,'2026-04-01'),booking(start+2,key,last)];
const evidence=rows=>({salon_id:salon,as_of:new Date(now).toISOString(),time_zone:zone,scope:'business',stylist_id:null,from:'2025-09-19',through:'2026-09-19',complete:true,records:rows,record_count:rows.length});
const core=()=>loadNodeTypescript(process.cwd())('src/lib/businessRebookingAdvice.ts');

test('six-week candidate uses the saved group, completed visits and calendar-day boundary with an exact existing client-record link',()=>{
 const rows=[...visits(1),...visits(2,'2026-08-09'),...visits(3,'2026-08-07'),booking(99,3,'2026-09-25',{status:'Confirmed'})];
 const result=core().businessRebookingAdvice(salon,evidence(rows));
 assert.equal(result.available,true);assert.equal(result.absent_count,1);assert.equal(result.recent_or_booked_count,2);assert.equal(result.candidates[0].completed_visits,3);assert.equal(result.candidates[0].days_since_visit,42);assert.equal(result.candidates[0].last_visit,'2026-08-08');assert.equal(result.candidates[0].href,'/salon/dashboard/bookings/'+id(12));
 assert.equal(result.window_days,365);assert.equal(result.minimum_visits,3);assert.equal(result.absence_days,42);
});
test('equal names never merge unlinked guests and linked guests share only the canonical saved group',()=>{
 const separate=[1,2,3].map(n=>booking(n,n,'2026-07-01',{client_name:'Sarah',unlinked_guest:true}));
 const empty=core().businessRebookingAdvice(salon,evidence(separate));assert.equal(empty.absent_count,0);assert.equal(empty.unlinked_guest_visits,3);
 const linked=core().businessRebookingAdvice(salon,evidence(separate.map(row=>({...row,group_key:group(8),unlinked_guest:false}))));assert.equal(linked.absent_count,1);assert.equal(linked.candidates[0].completed_visits,3);
});
test('future pending and active in-service appointments suppress nudges while cancellations and no-shows never count as completed visits',()=>{
 const rows=[...visits(1),booking(19,1,'2026-12-01',{status:'Pending'}),...visits(2),booking(29,2,'2026-09-19',{status:'In Progress'}),...visits(3),booking(39,3,'2026-09-25',{status:'Cancelled'}),booking(40,4,'2026-06-01',{status:'No Show'}),booking(41,4,'2026-07-01',{status:'Cancelled'})];
 const result=core().businessRebookingAdvice(salon,evidence(rows));assert.equal(result.absent_count,1);assert.equal(result.candidates[0].client_name,'Saved client 3');assert.equal(result.regular_count,3);
});
test('calendar-day absence across DST is independent of elapsed 24-hour periods',()=>{
 const e=evidence(visits(1,'2026-10-01'));e.as_of='2026-11-12T05:30:00Z';e.from='2025-11-12';e.through='2026-11-12';
 const result=core().businessRebookingAdvice(salon,e);assert.equal(result.candidates[0].days_since_visit,42);assert.equal(result.absent_count,1);
});
test('actual recorded completion date supersedes a scheduled old appointment and future completion evidence remains unavailable',()=>{
 const rows=visits(1);rows[2].service_completed_at='2026-09-17T15:00:00Z';assert.equal(core().businessRebookingAdvice(salon,evidence(rows)).absent_count,0);
 rows[2].service_completed_at='2026-09-21T15:00:00Z';assert.throws(()=>core().businessRebookingAdvice(salon,evidence(rows)),/REBOOKING_INCOMPLETE/);
});
test('scope, duplicate identities and malformed source facts fail closed; capped evidence never becomes a zero count',()=>{
 for(const mutate of [e=>e.records.push({...e.records[0],id:id(999),salon_id:other}),e=>e.records.push({...e.records[0]}),e=>e.records[0].appointment_datetime='not-a-date',e=>e.records[0].group_key='',e=>e.records[0].status='Unknown',e=>e.records[0].salon_id=null]){const e=evidence(visits(1));mutate(e);assert.throws(()=>core().businessRebookingAdvice(salon,e),/REBOOKING_(ACCESS_DENIED|INCOMPLETE)/);}
 const capped=core().businessRebookingAdvice(salon,{...evidence([]),complete:false,record_count:5001});assert.equal(capped.available,false);assert.equal(capped.absent_count,null);assert.deepEqual(capped.candidates,[]);
});
test('assigned-professional evidence is explicit and cannot contain another professional',()=>{
 const e={...evidence(visits(1)),scope:'assigned_professional',stylist_id:professional};const result=core().businessRebookingAdvice(salon,e);assert.equal(result.scope,'assigned_professional');
 e.records.push(booking(99,7,'2026-06-01',{stylist_id:colleague}));e.record_count=e.records.length;assert.throws(()=>core().businessRebookingAdvice(salon,e),/ACCESS_DENIED/);
});
test('bounded assistant projection retains full counts and limitations but never client identities or contact fields',()=>{
 const e=evidence(Array.from({length:24},(_,i)=>visits(i+1)).flat());const result=core().businessRebookingAdvice(salon,e);assert.equal(result.absent_count,24);assert.equal(result.candidates.length,20);assert.equal(result.is_excerpt,true);
 const summary=core().businessRebookingAdviceSummary(result);assert.equal(summary.absent_count,24);assert.doesNotMatch(JSON.stringify(summary),/Saved client|55000000|group_key|customer_id|email|phone/);assert.equal(summary.href,'/salon/dashboard/bookings#returning-clients');
});

function fixture({isOwner=true,assigned=null,denyAt=0,reassigned=false,foreign=false,incomplete=false,sourceFailure=false}={}){
 let checks=0,sourceReads=0;const calls=[];const scopeEvidence={...evidence(visits(1)),scope:assigned?'assigned_professional':'business',stylist_id:assigned};
 const context={salon:{id:salon,user_id:owner,time_zone:zone},user:{id:isOwner?owner:staff},isOwner,teamMember:isOwner?null:{stylist_id:assigned},admin:{
  async rpc(name,args){calls.push([name,args]);if(name==='p0_actor_has_permission'){checks++;return{data:checks!==denyAt,error:null};}assert.equal(name,'read_business_rebooking_evidence');sourceReads++;return sourceFailure?{data:null,error:{message:'PRIVATE_DATABASE_DETAIL'}}:{data:{...scopeEvidence,salon_id:foreign?other:salon,complete:!incomplete},error:null};},
  from(table){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},gte(){return q;},lt(){return q;},order(){return q;},range:async()=>({data:[],error:null}),async maybeSingle(){calls.push([table,filters]);return{data:table==='salons'?context.salon:{salon_id:salon,user_id:staff,status:'Active',stylist_id:reassigned&&sourceReads?colleague:assigned},error:null};}};return q;}
 }};
 const loader=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/platformErrors':{capturePlatformError:async captured=>{calls.push(['incident',captured]);return id(900);},safeFailure:(error,request_id,status,extra)=>Response.json({error,request_id,...extra},{status,headers:{'Cache-Control':'private, no-store','X-Request-ID':request_id}})},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,h)=>h}});
 return{context,calls,loader,sourceReads:()=>sourceReads,read:()=>loader('src/lib/businessRebookingAdviceServer.ts').readBusinessRebookingAdvice(context)};
}
test('server derives actual business and identity scope, requires both grants and refreshes authority after source reads',async()=>{
 const f=fixture();const result=await f.read();assert.equal(result.absent_count,1);assert.equal(f.sourceReads(),1);
 const permissions=f.calls.filter(([name])=>name==='p0_actor_has_permission');assert.deepEqual(permissions.map(([,args])=>args.p_permission),['bookings','client_history','bookings','client_history']);for(const[,args]of permissions){assert.equal(args.p_salon,salon);assert.equal(args.p_user,owner);}
 assert.deepEqual(f.calls.find(([name])=>name==='read_business_rebooking_evidence')[1],{p_salon:salon,p_actor:owner});
});
test('loss of either permission before or during read, foreign result and staff reassignment release no cohort',async()=>{
 for(const denyAt of [1,2,3,4]){const f=fixture({denyAt});await assert.rejects(f.read(),/ACCESS_DENIED/);if(denyAt<3)assert.equal(f.sourceReads(),0);}
 await assert.rejects(fixture({foreign:true}).read(),/ACCESS_DENIED/);await assert.rejects(fixture({isOwner:false,assigned:professional,reassigned:true}).read(),/ACCESS_DENIED/);
 assert.equal((await fixture({isOwner:false,assigned:professional}).read()).scope,'assigned_professional');
});
test('route rejects business/date overrides before reading and returns private JSON with the exact protected incident reference',async()=>{
 const f=fixture(),get=f.loader('src/app/api/salon/rebooking-advice/route.ts').GET;
 const response=await get(new Request('https://fixture.invalid/api/salon/rebooking-advice?salon_id='+other));assert.equal(response.status,400);assert.equal(f.sourceReads(),0);assert.equal(response.headers.get('cache-control'),'private, no-store');
 const denied=fixture({denyAt:1});const result=await denied.loader('src/app/api/salon/rebooking-advice/route.ts').GET(new Request('https://fixture.invalid'));assert.equal(result.status,403);assert.equal((await result.json()).code,'REBOOKING_ACCESS_DENIED');
 const failed=fixture({sourceFailure:true}),unavailable=await failed.loader('src/app/api/salon/rebooking-advice/route.ts').GET(new Request('https://fixture.invalid'));assert.equal(unavailable.status,503);const body=await unavailable.json();assert.equal(body.request_id,id(900));assert.equal(unavailable.headers.get('X-Request-ID'),id(900));assert.equal(unavailable.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(JSON.stringify(body),/PRIVATE_DATABASE_DETAIL/);assert.equal(failed.calls.find(([name])=>name==='incident')[1].error.message,'REBOOKING_UNAVAILABLE');
});
test('all four client-advice translations preserve the exact keys and interpolation tokens',()=>{
 const messages=loadNodeTypescript(process.cwd())('src/i18n/business-rebooking-copy.ts').BUSINESS_REBOOKING_COPY;
 assert.deepEqual(Object.keys(messages),['en','fr','es','zh-CN']);const tokens=value=>[...value.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort();
 for(const locale of ['fr','es','zh-CN']){assert.deepEqual(Object.keys(messages[locale]).sort(),Object.keys(messages.en).sort());for(const key of Object.keys(messages.en)){assert.ok(messages[locale][key].trim());assert.deepEqual(tokens(messages[locale][key]),tokens(messages.en[key]),locale+':'+key);}}
});
test('actual owner summary exposes only aggregate rebooking evidence and withholds its read when a secondary grant is absent',async()=>{
 for(const denied of [null,'bookings','client_history']){
  const f=fixture(),rpc=f.context.admin.rpc;
  f.context.admin.rpc=async(name,args)=>name==='p0_actor_has_permission'&&(['availability','styles','stylists'].includes(args.p_permission)||args.p_permission===denied)?{data:false,error:null}:rpc(name,args);
  const summary=await f.loader('src/lib/ownerReadServer.ts').readOwnerOperation(f.context,'get_business_summary',{start:'2026-08-01T00:00:00Z',end:'2026-08-08T00:00:00Z'});
  if(denied){assert.equal(summary.rebooking_advice,null);assert.equal(f.sourceReads(),0);}else{assert.equal(summary.rebooking_advice.absent_count,1);assert.equal(summary.rebooking_advice.from,'2025-09-19');assert.equal(summary.rebooking_advice.through,'2026-09-19');assert.equal(f.sourceReads(),1);assert.doesNotMatch(JSON.stringify(summary.rebooking_advice),/Saved client|55000000|group_key|customer_id|email|phone/);}
 }
});
