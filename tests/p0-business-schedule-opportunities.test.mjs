import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const a='22000000-0000-4000-8000-000000000001',b='22000000-0000-4000-8000-000000000002',p='33000000-0000-4000-8000-000000000001',q='33000000-0000-4000-8000-000000000002';
const now=Date.parse('2026-09-21T12:00:00Z'),zone='America/New_York';
const hours=()=>Object.fromEntries(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>[day,{open:'09:00',close:'17:00',closed:day!=='Mon'}]));
const load=()=>loadNodeTypescript(process.cwd());
const evidence=()=>({salon:{id:a,user_id:'owner',time_zone:zone,hours:hours()},style:{},roster:[{id:p,salon_id:a,name:'Professional A',is_active:true,availability:hours()}],bookings:[],intents:[],blockouts:[],customerBusy:[],timeZone:zone});
const booking=(id,start,end,extra={})=>({id,salon_id:a,stylist_id:p,appointment_datetime:`2026-09-21T${start}:00Z`,blocked_until:`2026-09-21T${end}:00Z`,status:'Confirmed',...extra});
const core=()=>load()('src/lib/businessScheduleOpportunities.ts');

test('capacity subtracts overlaps exactly once, distinguishes holds, blockouts and bookings, and returns an exact review action',()=>{
 const e=evidence();e.bookings=[booking('a','13:00','15:00'),booking('b','14:00','16:00')];
 e.intents=[booking('hold','15:00','17:00',{status:'Pending',expires_at:'2026-09-21T14:00:00Z'}),booking('expired','18:00','19:00',{status:'Pending',expires_at:'2026-09-21T11:00:00Z'})];
 e.blockouts=[{id:'block',salon_id:a,stylist_id:p,starts_at:'2026-09-21T13:00:00Z',ends_at:'2026-09-21T14:00:00Z'}];
 const r=core().businessScheduleOpportunities(a,e,now),day=r.records[0];
 assert.equal(r.records.length,7);assert.equal(day.scheduled_minutes,480);assert.equal(day.blocked_minutes,60);assert.equal(day.capacity_minutes,420);assert.equal(day.booked_minutes,120);assert.equal(day.held_minutes,60);assert.equal(day.free_minutes,240);assert.equal(day.booked_percent,28.6);
 assert.deepEqual(day.gaps,[{start:'2026-09-21T17:00:00.000Z',end:'2026-09-21T21:00:00.000Z'}]);
 assert.equal(day.href,`/salon/dashboard/availability?date=2026-09-21&stylist=${p}`);assert.equal(r.to,'2026-09-27');assert.equal(r.booked_percent,28.6);
});
test('closures, inactive professionals and cancelled bookings do not masquerade as booked capacity',()=>{
 const e=evidence();e.roster.push({id:q,salon_id:a,name:'Inactive',is_active:false,availability:hours()});e.bookings=[booking('cancel','13:00','21:00',{status:'Cancelled'})];
 let r=core().businessScheduleOpportunities(a,e,now);assert.equal(r.free_minutes,480);assert.equal(r.professional_count,1);assert.equal(r.booked_minutes,0);
 e.salon.is_closed_override=true;e.salon.closed_override_date='2026-09-21';r=core().businessScheduleOpportunities(a,e,now);assert.equal(r.capacity_minutes,0);assert.equal(r.booked_percent,null);assert.deepEqual(r.opportunities,[]);
});
test('draft-only roster supplies no recommendation capacity or fallback professional; missing active hours remains unavailable',()=>{
 const e=evidence();e.roster[0].is_draft=true;
 const r=core().businessScheduleOpportunities(a,e,now);assert.equal(r.professional_count,0);assert.equal(r.capacity_minutes,0);assert.deepEqual(r.opportunities,[]);
 e.roster[0].is_draft=false;e.roster[0].availability={};assert.throws(()=>core().businessScheduleOpportunities(a,e,now),/HOURS_UNAVAILABLE/);
 const noRoster=evidence();noRoster.roster=[];const business=core().businessScheduleOpportunities(a,noRoster,now);assert.equal(business.professional_count,0);assert.equal(business.capacity_minutes,480);assert.equal(business.records[0].professional_id,null);
});
test('remaining today is clipped to current minute and DST uses actual configured local intervals',()=>{
 let r=core().businessScheduleOpportunities(a,evidence(),Date.parse('2026-09-21T14:30:30Z'));assert.equal(r.capacity_minutes,389);
 const e=evidence(),h=Object.fromEntries(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=>[day,{open:'00:00',close:'04:00',closed:day!=='Sun'}]));e.salon.hours=h;e.roster[0].availability=h;
 r=core().businessScheduleOpportunities(a,e,Date.parse('2026-11-01T04:00:00Z'));assert.equal(r.records[0].capacity_minutes,300);assert.equal(r.from,'2026-11-01');assert.equal(r.to,'2026-11-07');
});
test('assigned staff see only their professional; all-business closure applies to each resource without cross-business records',()=>{
 const e=evidence();e.roster.push({id:q,salon_id:a,name:'Other colleague',is_active:true,availability:hours()});e.bookings=[booking('other','13:00','21:00',{stylist_id:q})];
 const r=core().businessScheduleOpportunities(a,e,now,p);assert.equal(r.scope,'assigned_professional');assert.equal(r.capacity_minutes,480);assert.doesNotMatch(JSON.stringify(r),/Other colleague/);assert.ok(r.records.every(row=>row.professional_id===p));
 e.bookings.push(booking('foreign','13:00','14:00',{salon_id:b}));assert.throws(()=>core().businessScheduleOpportunities(a,e,now,p),/ACCESS_DENIED/);
});
test('missing/invalid hours, unknown assignment and malformed occupancy fail closed rather than invent free capacity',()=>{
 const e=evidence();delete e.roster[0].availability.Mon;assert.throws(()=>core().businessScheduleOpportunities(a,e,now),/HOURS_UNAVAILABLE/);
 e.roster[0].availability=hours();e.salon.hours.Mon.open='25:00';assert.throws(()=>core().businessScheduleOpportunities(a,e,now),/HOURS_UNAVAILABLE/);
 assert.throws(()=>core().businessScheduleOpportunities(a,evidence(),now,q),/ACCESS_DENIED/);
 const invalid=evidence();invalid.bookings=[booking('invalid','13:00','12:00')];assert.throws(()=>core().businessScheduleOpportunities(a,invalid,now),/INCOMPLETE/);
 assert.equal(core().scheduleDate('2026-02-30'),false);assert.throws(()=>core().scheduleReviewHref('2026-09-21','https://foreign.test'),/INVALID_SELECTION/);
});
function fixture({isOwner=true,assigned=null,denyAt=0,changed=false}={}){
 const e=evidence(),calls=[];let permissions=0,reads=0;
 const context={salon:e.salon,user:{id:isOwner?'owner':'staff'},isOwner,teamMember:isOwner?null:{stylist_id:assigned},admin:{
  rpc:async(name,args)=>{calls.push([name,args]);permissions++;return{data:permissions!==denyAt,error:null};},
  from(table){const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},async maybeSingle(){calls.push([table,filters]);if(table==='salons')return{data:e.salon,error:null};return{data:{salon_id:a,user_id:'staff',status:'Active',stylist_id:changed&&permissions>1?q:assigned},error:null};}};return query;}
 }};
 const loader=loadNodeTypescript(process.cwd(),{'@/lib/bookingAvailabilityServer':{loadCalendarOpportunityEvidence:async(id,date)=>{reads++;assert.equal(id,a);assert.equal(date,'2026-09-21');return e;}},'@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/platformErrors':{capturePlatformError:async()=> '55000000-0000-4000-8000-000000000001',safeFailure:(error,request_id,status,extra)=>Response.json({error,request_id,...extra},{status})},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,h)=>h}});
 return{context,e,calls,loader,reads:()=>reads,read:()=>loader('src/lib/businessScheduleOpportunitiesServer.ts').readBusinessScheduleOpportunities(context,now)};
}
test('server derives business/window and repeats fresh availability authority around the evidence read',async()=>{
 const f=fixture();const r=await f.read();assert.equal(r.from,'2026-09-21');assert.equal(f.reads(),1);assert.equal(f.calls.filter(row=>row[0]==='p0_actor_has_permission').length,2);
 for(const [name,args]of f.calls.filter(row=>row[0]==='p0_actor_has_permission')){assert.equal(args.p_salon,a);assert.equal(args.p_user,'owner');assert.equal(args.p_permission,'availability');}
});
test('denied/revoked permission and changed professional assignment suppress the result',async()=>{
 const denied=fixture({denyAt:1});await assert.rejects(denied.read(),/ACCESS_DENIED/);assert.equal(denied.reads(),0);
 await assert.rejects(fixture({denyAt:2}).read(),/ACCESS_DENIED/);
 await assert.rejects(fixture({isOwner:false,assigned:p,changed:true}).read(),/ACCESS_DENIED/);
 const own=await fixture({isOwner:false,assigned:p}).read();assert.equal(own.scope,'assigned_professional');
});
test('canonical evidence reader rejects truncated or missing-count records and scopes every database query',async()=>{
 const e=evidence(),queries=[];let truncated=false,missing=false;
 const tables={salons:e.salon,stylists:e.roster,bookings:[],booking_checkout_intents:[],salon_blockouts:[]};
 const admin={from(table){const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},is(){return query;},lt(){return query;},gt(){return query;},single(){return query;},then(resolve){queries.push([table,filters]);const data=tables[table];return Promise.resolve({data,error:null,count:missing?null:truncated&&table==='bookings'?1001:Array.isArray(data)?data.length:null}).then(resolve);}};return query;}};
 const fn=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin}})('src/lib/bookingAvailabilityServer.ts').loadCalendarOpportunityEvidence;
 const value=await fn(a,'2026-09-21');assert.equal(value.salon.id,a);assert.equal(queries.length,5);for(const [table,filters]of queries)assert.ok(filters.some(([k,v])=>k===(table==='salons'?'id':'salon_id')&&v===a));
 truncated=true;await assert.rejects(fn(a,'2026-09-21'),/INCOMPLETE/);truncated=false;missing=true;await assert.rejects(fn(a,'2026-09-21'),/INCOMPLETE/);
});
test('route refuses date/business overrides before reading and preserves private no-store JSON denial',async()=>{
 const f=fixture();const get=f.loader('src/app/api/salon/schedule-opportunities/route.ts').GET;
 const override=await get(new Request(`https://girlzculture.com/api/salon/schedule-opportunities?salon_id=${b}`));assert.equal(override.status,400);assert.equal(f.reads(),0);assert.equal(override.headers.get('cache-control'),'private, no-store');
 const denied=fixture({denyAt:1});const response=await denied.loader('src/app/api/salon/schedule-opportunities/route.ts').GET(new Request('https://girlzculture.com/api/salon/schedule-opportunities'));assert.equal(response.status,403);assert.equal((await response.json()).code,'SCHEDULE_ACCESS_DENIED');
});
test('unexpected source failure returns the exact protected reference without database details',async()=>{
 const reference='55000000-0000-4000-8000-000000000001';let logged;
 const route=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>fixture().context},'@/lib/businessScheduleOpportunitiesServer':{readBusinessScheduleOpportunities:async()=>{throw Error('PRIVATE database failure');}},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/platformErrors':{capturePlatformError:async input=>{logged=input;return reference;},safeFailure:(error,request_id,status,extra)=>Response.json({error,request_id,...extra},{status})},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,h)=>h}})('src/app/api/salon/schedule-opportunities/route.ts');
 const response=await route.GET(new Request('https://girlzculture.com/api/salon/schedule-opportunities'));assert.equal(response.status,503);const body=await response.json();assert.equal(body.request_id,reference);assert.equal(logged.salonId,a);assert.doesNotMatch(JSON.stringify(body),/PRIVATE/);
});
test('assistant business summary exposes the same bounded schedule evidence, independently dated from historical metrics',async()=>{
 const proof=core().businessScheduleOpportunities(a,evidence(),now);
 const context={salon:{id:a,time_zone:zone},user:{id:'owner'},isOwner:true,admin:{rpc:async()=>({data:true,error:null}),from(){const q={select(){return q;},eq(){return q;},gte(){return q;},lt(){return q;},order(){return q;},range(){return Promise.resolve({data:[],error:null});}};return q;}}};
 const fn=loadNodeTypescript(process.cwd(),{'@/lib/bookingAvailabilityServer':{calendarAvailability:async()=>({gaps:[]})},'@/lib/businessScheduleOpportunitiesServer':{readBusinessScheduleOpportunities:async c=>{assert.equal(c,context);return proof;}}})('src/lib/ownerReadServer.ts').readOwnerOperation;
 const result=await fn(context,'get_business_summary',{start:'2026-08-01T00:00:00Z',end:'2026-08-08T00:00:00Z'});
 assert.deepEqual(result.schedule_opportunities,core().businessScheduleOpportunitiesSummary(proof));assert.equal(result.start,'2026-08-01T00:00:00Z');
});
test('four schedule dictionaries preserve every key and numerical placeholder',()=>{
 const values=load()('src/i18n/business-schedule-copy.ts').BUSINESS_SCHEDULE_COPY,tokens=s=>(s.match(/\{\w+\}/g)||[]).sort();
 for(const locale of ['en','fr','es','zh-CN']){assert.deepEqual(Object.keys(values[locale]).sort(),Object.keys(values.en).sort());for(const[key,value]of Object.entries(values[locale])){assert.ok(value.trim());assert.deepEqual(tokens(value),tokens(values.en[key]));}}
});
