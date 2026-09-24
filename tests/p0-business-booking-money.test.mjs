import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}});
const core=load('src/lib/businessBookingMoney.ts'),finance=load('src/lib/businessFinanceData.ts');
const salon='17900000-0000-4000-8000-000000000001',actor='17900000-0000-4000-8000-000000000002',campaign='17900000-0000-4000-8000-000000000020';
const id=n=>`17900000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const period={from:'2026-03-08',to:'2026-03-14',timeZone:'America/New_York'};
function booking(n,patch={}){return {id:id(n),salon_id:salon,stylist_id:id(3),customer_id:id(99),guest_name:'PRIVATE CUSTOMER',guest_email:'private@example.test',name:'Booked service',created_at:'2026-03-01T12:00:00Z',appointment_datetime:'2026-03-08T05:00:00Z',service_completed_at:null,status:'Cancelled',booking_origin:'platform',source:'platform',estimated_total:180,subtotal_before_promotion:180,deposit_amount:18,deposit_status:'Paid',payment_mode:'live',payment_verified_at:'2026-03-01T12:00:00Z',verified_charge:true,refund_status:null,refund_amount:0,refund_completed_at:null,verified_refund:false,operating_compensation:{kind:'none',version:null},salon_promotion_id:null,promotion_snapshot:{},promotion_discount_amount:0,...patch};}
function data(bookings){return {scope:{kind:'business',stylist_id:null},bookings,sales:[],receipts:[],expenses:[],arrangements:[],obligations:[],compensation_payments:[],stylists:[]};}
const summarize=(value,metadata=value.bookings.filter(row=>row.payment_mode!=='test'&&core.bookingMoneyDay(row.appointment_datetime,period.timeZone)>=period.from&&core.bookingMoneyDay(row.appointment_datetime,period.timeZone)<=period.to))=>core.businessBookingMoney(salon,finance.operatingBooksFromData(salon,value).books,value,metadata,period);

test('a busy six-professional annual cohort retains every booking and canonical receipt',()=>{
 const value=data(Array.from({length:3200},(_,i)=>booking(1000+i,{status:'Completed',service_completed_at:'2026-03-08T10:00:00Z'})));
 const result=summarize(value);assert.equal(result.cohort_count,3200);assert.equal(result.categories.completed.count,3200);assert.equal(result.categories.completed.agreed_cents,3200*18000);assert.equal(result.categories.completed.verified_platform_receipts_cents,3200*1800);
 const excessive=data(Array.from({length:10001},(_,i)=>booking(1000+i)));assert.throws(()=>core.bookingMoneyCohort(salon,excessive,period),/RANGE_TOO_LARGE/);
});
test('appointment cohort handles DST, distinct current cancellation/no-show states and receipts before the period',()=>{
 const value=data([booking(10),booking(11,{status:'No-show',refund_status:'Succeeded',refund_amount:8,refund_completed_at:'2026-03-10T12:00:00Z',verified_refund:true}),booking(12,{appointment_datetime:'2026-03-08T04:59:59Z'}),booking(13,{appointment_datetime:'2026-03-15T04:00:00Z'}),booking(14,{payment_mode:'test'})]);
 const result=summarize(value);assert.equal(result.cohort_count,2);assert.equal(result.categories.cancelled.count,1);assert.equal(result.categories.no_show.count,1);assert.equal(result.categories.cancelled.agreed_cents,18000);assert.equal(result.categories.cancelled.net_recorded_receipts_cents,1800);assert.equal(result.categories.no_show.verified_platform_refunds_cents,800);assert.equal(result.categories.no_show.net_recorded_receipts_cents,1000);assert.equal(result.status_basis,'current_recorded_status');assert.equal(result.measured_lost_revenue,false);assert.doesNotMatch(JSON.stringify(result),/PRIVATE|private@|customer_id/);
});
test('later refunds do not rewrite period-end receipts; business receipts stay distinct from verified platform receipts',()=>{
 const value=data([booking(10,{refund_status:'Succeeded',refund_amount:18,refund_completed_at:'2026-03-15T04:00:00Z',verified_refund:true})]);
 value.receipts=[{id:id(40),salon_id:salon,booking_id:id(10),occurred_at:'2026-03-09T12:00:00Z',stage:'balance',method:'cash',amount_cents:2000,original_payment_id:null}];
 const r=summarize(value).categories.cancelled;assert.equal(r.verified_platform_refunds_cents,0);assert.equal(r.verified_platform_receipts_cents,1800);assert.equal(r.business_recorded_receipts_cents,2000);assert.equal(r.net_recorded_receipts_cents,3800);
});
test('promotion usage requires booked evidence, preserves saved titles, and never invents incremental lift',()=>{
 const offer={salon_promotion_id:campaign,subtotal_before_promotion:200,promotion_discount_amount:20,promotion_snapshot:{promotion_id:campaign,title:'Saved offer name',discount_amount:20,adjusted_total:180,subtotal_before_promotion:200}};
 const value=data([booking(10,{...offer,status:'Completed',service_completed_at:'2026-03-16T12:00:00Z'}),booking(11,{...offer,status:'No Show'})]);
 const r=summarize(value),p=r.promotion_attribution.groups[0];assert.equal(r.promotion_attribution.status,'measured');assert.equal(p.title,'Saved offer name');assert.equal(p.completed_count,1);assert.equal(p.no_show_count,1);assert.equal(p.discount_cents,4000);assert.equal(p.totals.net_recorded_receipts_cents,3600);assert.equal(r.measured_incremental_lift,false);
 value.bookings[0].salon_promotion_id=null;assert.equal(summarize(value).promotion_attribution.groups.length,1);
});
test('missing or contradictory offer evidence becomes unavailable rather than a synthetic zero or partial benchmark',()=>{
 for(const snapshot of [{},{promotion_id:id(21),title:'Mismatch',discount_amount:20,adjusted_total:180,subtotal_before_promotion:200},{promotion_id:campaign,title:'Missing amounts'}]){
  const r=summarize(data([booking(10,{salon_promotion_id:campaign,promotion_discount_amount:20,subtotal_before_promotion:200,promotion_snapshot:snapshot})]));assert.equal(r.promotion_attribution.status,'incomplete');assert.equal(r.promotion_attribution.incomplete_booking_count,1);assert.equal(r.promotion_attribution.groups.length,0);
 }
});
test('mixed business, own-staff scope, missing metadata and concurrent status/price changes fail closed',()=>{
 const value=data([booking(10)]);
 assert.throws(()=>summarize(value,[booking(10,{salon_id:id(99)})]),/ACCESS_DENIED/);assert.throws(()=>summarize(value,[]),/CHANGED/);assert.throws(()=>summarize(value,[booking(10,{status:'No-show'})]),/CHANGED/);assert.throws(()=>summarize(value,[booking(10,{estimated_total:1})]),/CHANGED/);
 const own=data([booking(10)]);own.scope={kind:'own',stylist_id:id(3)};assert.throws(()=>summarize(own),/ACCESS_DENIED/);
 const mixed=data([booking(10)]);mixed.expenses=[{id:id(30),salon_id:id(99),occurred_at:'2026-03-01',amount_cents:1}];assert.throws(()=>summarize(mixed),/ACCESS_DENIED/);
});
test('unverified paid/refunded provider labels never become zero actual receipts',()=>{
 for(const patch of [{verified_charge:false},{payment_mode:null},{refund_status:'Succeeded',refund_amount:10,refund_completed_at:'2026-03-10T12:00:00Z',verified_refund:false}])assert.throws(()=>summarize(data([booking(10,patch)])),/INVALID_EVIDENCE/);
});

test('private demo outcomes reconcile simulated receipts without requiring or claiming provider charges',()=>{
 const value=data([booking(10,{is_demo:true,payment_mode:'test',verified_charge:false,refund_status:'Succeeded',refund_amount:8,refund_completed_at:'2026-03-10T12:00:00Z',verified_refund:false})]);
 value.is_demo=true;
 value.receipts=[
  {id:id(40),salon_id:salon,booking_id:id(10),occurred_at:'2026-03-01T12:00:00Z',stage:'deposit',method:'other',amount_cents:1800,original_payment_id:null},
  {id:id(41),salon_id:salon,booking_id:id(10),occurred_at:'2026-03-10T12:00:00Z',stage:'refund',method:'other',amount_cents:800,original_payment_id:id(40)},
 ];
 const result=summarize(value,value.bookings).categories.cancelled;
 assert.equal(result.verified_platform_receipts_cents,0);
 assert.equal(result.verified_platform_refunds_cents,0);
 assert.equal(result.business_recorded_receipts_cents,1800);
 assert.equal(result.business_recorded_refunds_cents,800);
 assert.equal(result.net_recorded_receipts_cents,1000);
 for (const index of [0,1]) {
  const incomplete={...value,receipts:index===0?[]:value.receipts.filter((_,i)=>i!==index)};
  assert.throws(()=>summarize(incomplete,incomplete.bookings),/INVALID_EVIDENCE/);
 }
 // A demo label must never excuse missing verification of a live payment.
 value.bookings[0].payment_mode='live';
 assert.throws(()=>summarize(value,value.bookings),/INVALID_EVIDENCE/);
 value.is_demo=false;
 assert.throws(()=>summarize(value,value.bookings),/INVALID_EVIDENCE/);
});
function serverFixture({permissions={earnings:true,bookings:true},owner=true,revoked=false,count=1}={}){
 const value=data(Array.from({length:count},(_,i)=>booking(100+i))),calls=[];let authorization=0;
 const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='p0_actor_has_permission'){assert.equal(args.p_user,actor);authorization++;return {data:!(revoked&&authorization>2)};}assert.equal(name,'read_business_finance');return {data:value};},from(table){assert.equal(table,'bookings');const filters={};const q={select(columns){assert.doesNotMatch(columns,/guest|customer|stripe|email|phone/);return q;},eq(k,v){filters[k]=v;return q;},in(k,v){filters[k]=v;return q;},limit(n){assert.equal(n,101);return q;},abortSignal(signal){assert.ok(signal instanceof AbortSignal);assert.equal(filters.salon_id,salon);assert.ok(filters.id.length<=100);calls.push({chunk:filters.id.length});return Promise.resolve({data:value.bookings.filter(row=>filters.id.includes(row.id))});}};return q;}};
 return {context:{admin,salon:{id:salon},user:{id:actor},isOwner:owner,teamMember:owner?null:{permissions}},calls};
}
test('protected server reads bounded own-ID chunks and repeats fresh authorization before returning',async()=>{
 const f=serverFixture({owner:false,count:101});const r=await load('src/lib/businessBookingMoneyServer.ts').readBusinessBookingMoney(f.context,period);assert.equal(r.cohort_count,101);assert.deepEqual(f.calls.filter(c=>c.chunk).map(c=>c.chunk),[100,1]);assert.equal(f.calls.filter(c=>c.name==='p0_actor_has_permission').length,4);
});
test('full finances without bookings, own-earnings only, and mid-read revocation never return cohort data',async()=>{
 const helper=load('src/lib/businessBookingMoneyServer.ts');
 for(const permissions of [{earnings:true},{earnings_own:true,bookings:true}]){const f=serverFixture({owner:false,permissions});await assert.rejects(helper.readBusinessBookingMoney(f.context,period),/ACCESS_DENIED/);assert.equal(f.calls.length,0);}
 await assert.rejects(helper.readBusinessBookingMoney(serverFixture({revoked:true}).context,period),/ACCESS_DENIED/);
});
test('four-language cohort copy retains exact placeholder and key parity',()=>{
 const rows=load('src/i18n/business-booking-money-copy.ts').BOOKING_MONEY_COPY;assert.equal(new Set(rows.map(row=>row[0])).size,rows.length);
 for(const row of rows){assert.equal(row.length,4);for(const text of row){assert.ok(text.trim());assert.deepEqual((text.match(/\{[^}]+\}/g)||[]).sort(),(row[0].match(/\{[^}]+\}/g)||[]).sort());}}
});
test('read-only route scopes the business and timezone server-side and rejects caller scope before reading',async()=>{
 const calls=[];
 const api=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>({salon:{id:salon,time_zone:period.timeZone},user:{id:actor},isOwner:true})},'@/lib/businessBookingMoneyServer':{readBusinessBookingMoney:async(context,range)=>{calls.push({context,range});return {cohort_count:0};}},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},'@/lib/platformErrors':{capturePlatformError:async()=>{assert.fail('Expected validation must not create incident');}}})('src/app/api/salon/booking-money/route.ts');
 const response=await api.GET(new Request('https://fixture.invalid/api/salon/booking-money?from=2026-03-08&to=2026-03-14'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(calls[0].context.salon.id,salon);assert.equal(calls[0].range.timeZone,period.timeZone);
 assert.equal((await api.GET(new Request('https://fixture.invalid/api/salon/booking-money?from=2026-03-08&to=2026-03-14&salon_id=foreign'))).status,400);
 for(const date of ['2026-99-99','2026-02-30','invalid','2026-00-01'])assert.equal((await api.GET(new Request(`https://fixture.invalid/api/salon/booking-money?from=${date}&to=2026-03-14`))).status,400);
 assert.equal(calls.length,1);assert.equal(api.POST,undefined);
});
test('unexpected cohort provider/database failures preserve the protected reference without private details',async()=>{
 const reference='17900000-0000-4000-8000-000000000090',incidents=[];
 const api=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>({salon:{id:salon,time_zone:period.timeZone},user:{id:actor},isOwner:true})},'@/lib/businessBookingMoneyServer':{readBusinessBookingMoney:async()=>{throw Error('PRIVATE DATABASE DETAIL');}},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},'@/lib/platformErrors':{capturePlatformError:async details=>{incidents.push(details);return reference;},safeFailure:(message,id,status,details)=>Response.json({error:message,request_id:id,...details},{status,headers:{'X-Request-ID':id}})}})('src/app/api/salon/booking-money/route.ts');
 const response=await api.GET(new Request('https://fixture.invalid/api/salon/booking-money?from=2026-03-08&to=2026-03-14'));const body=await response.json();assert.equal(response.status,500);assert.equal(body.request_id,reference);assert.equal(response.headers.get('x-request-id'),reference);assert.equal(incidents.length,1);assert.doesNotMatch(JSON.stringify(body),/PRIVATE/);
});
