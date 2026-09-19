import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const id=n=>`18300000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const salon=id(1),service=id(2),fingerprint='a'.repeat(32);
function fixture(){
 const bookings=[1,2,3].map((n)=>({id:id(10+n),salon_id:salon,stylist_id:id(3),status:'Completed',booking_origin:'business_added',payment_mode:'live',created_at:'2026-08-01T12:00:00Z',appointment_datetime:n===1?'2026-09-10T12:00:00Z':`2026-08-${n===2?'12':'20'}T12:00:00Z`,service_completed_at:null,estimated_total:100,deposit_amount:0,refund_amount:0,operating_compensation:{kind:'commission',version:id(4),basis:'after_discount',percent:20}}));
 return {salon_id:salon,period:{from:'2026-09-01',to:'2026-09-28',timeZone:'America/New_York'},as_of:'2026-09-29T12:00:00Z',fingerprint,
 finance:{scope:{kind:'business',stylist_id:null},sales:[],bookings,receipts:[],expenses:[{id:id(5),salon_id:salon,occurred_at:'2026-09-05T12:00:00Z',category:'Supplies',amount_cents:3000,treatment:'operating'}],obligations:[],compensation_payments:[],arrangements:[],stylists:[]},
 services:[{id:service,salon_id:salon,name:'Own service'}],booking_services:bookings.map(b=>({id:b.id,salon_id:salon,style_id:service})),reviews:[]};
}
const review=()=>({service_id:service,revision:1,fingerprint,complete:true,zero_confirmed:false,note:'All applicable own costs reviewed',allocations:[{kind:'expense',id:id(5),cents:3000}]});
test('service contribution capability exists and never treats missing costs as profitable advice',()=>{
 const {businessServiceContribution}=load('src/lib/businessServiceContribution.ts');const value=businessServiceContribution(salon,fixture());
 assert.equal(value.rows[0].contribution_cents,null);assert.equal(value.rows[0].review_status,'missing');assert.equal(value.recommendations.length,0);
});
test('positive reviewed contribution subtracts saved commission and allocated expense with exact own comparison',()=>{
 const f=fixture();f.reviews=[review()];const r=load('src/lib/businessServiceContribution.ts').businessServiceContribution(salon,f);
 assert.equal(r.rows[0].completed_count,1);assert.equal(r.rows[0].previous_count,2);assert.equal(r.rows[0].commission_cents,2000);assert.equal(r.rows[0].contribution_cents,5000);assert.equal(r.recommendations.length,1);assert.equal(r.net_profit_verified,false);assert.equal(r.cost_completeness_source,'owner_recorded');
});
test('stale review and changed source allocation cannot retain an earlier positive recommendation',()=>{
 const f=fixture();f.reviews=[{...review(),fingerprint:'b'.repeat(32)}];const core=load('src/lib/businessServiceContribution.ts');assert.equal(core.businessServiceContribution(salon,f).rows[0].review_status,'stale');f.reviews=[review()];f.finance.expenses[0].amount_cents=1000;assert.throws(()=>core.businessServiceContribution(salon,f),/CONTRIBUTION_ALLOCATION/);
});
test('foreign scope, mixed records, duplicate identities and missing mapping fail closed',()=>{
 const core=load('src/lib/businessServiceContribution.ts');for(const change of [f=>f.salon_id=id(99),f=>f.finance.scope.kind='own',f=>f.services[0].salon_id=id(99),f=>f.booking_services[0].salon_id=id(99),f=>f.booking_services.pop(),f=>f.booking_services.push(f.booking_services[0])]){const f=fixture();change(f);assert.throws(()=>core.businessServiceContribution(salon,f));}
});
test('allocations cannot spend the same canonical expense twice across services',()=>{
 const f=fixture();f.services.push({id:id(20),salon_id:salon,name:'Other own service'});f.reviews=[review(),{...review(),service_id:id(20)}];assert.throws(()=>load('src/lib/businessServiceContribution.ts').businessServiceContribution(salon,f),/CONTRIBUTION_ALLOCATION/);
});
test('refunds reduce contribution, and unverified payment evidence makes advice unavailable',()=>{
 const f=fixture();f.finance.receipts=[{id:id(50),salon_id:salon,booking_id:id(11),occurred_at:'2026-09-10T12:00:00Z',stage:'full',method:'cash',amount_cents:10000},{id:id(51),salon_id:salon,booking_id:id(11),occurred_at:'2026-09-20T12:00:00Z',stage:'refund',method:'cash',amount_cents:10000,original_payment_id:id(50)}];f.reviews=[review()];const core=load('src/lib/businessServiceContribution.ts');assert.equal(core.businessServiceContribution(salon,f).rows[0].contribution_cents,-3000);assert.equal(core.businessServiceContribution(salon,f).recommendations.length,0);f.finance.bookings[0].deposit_amount=10;assert.equal(core.businessServiceContribution(salon,f).rows[0].review_status,'payment_unverified');
});
test('zero allocation needs explicit zero declaration; name-only sales and booth turnover are not service profit',()=>{
 const f=fixture();f.reviews=[{...review(),allocations:[],zero_confirmed:false}];const core=load('src/lib/businessServiceContribution.ts');assert.throws(()=>core.businessServiceContribution(salon,f),/CONTRIBUTION_REVIEW/);f.reviews[0].zero_confirmed=true;assert.equal(core.businessServiceContribution(salon,f).rows[0].contribution_cents,8000);f.finance.bookings[0].operating_compensation={kind:'booth',version:id(4)};assert.equal(core.businessServiceContribution(salon,f).rows[0].review_status,'booth');assert.equal(core.businessServiceContribution(salon,f).recommendations.length,0);
});
test('local-day comparison crosses DST with equal calendar days and rejects malformed period',()=>{
 const core=load('src/lib/businessServiceContribution.ts');assert.deepEqual(core.contributionPreviousPeriod({from:'2026-03-01',to:'2026-03-28',timeZone:'America/New_York'}),{from:'2026-02-01',to:'2026-02-28',timeZone:'America/New_York'});assert.throws(()=>core.contributionPreviousPeriod({from:'2026-02-30',to:'2026-03-02',timeZone:'UTC'}));
});
function serverHarness({deny=false,revoke=false,foreign=false,wrongReadback=false,changedSource=false,isOwner=true}={}){
 const f=fixture(),calls=[];let evidenceRead=false;
 const context={salon:{id:salon,time_zone:f.period.timeZone},user:{id:id(99)},isOwner,admin:{from(table){assert.equal(table,'salons');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:salon,user_id:isOwner?id(99):id(98),time_zone:f.period.timeZone}};}};},async rpc(name,args){calls.push({name,args});assert.equal(args.p_salon,salon);if(name==='p0_actor_has_permission')return {data:!deny&&!(revoke&&evidenceRead)};if(name==='business_finance_scope')return {data:{kind:'business'}};if(name==='read_service_contribution_evidence'){evidenceRead=true;if(changedSource&&f.reviews.length)f.fingerprint='b'.repeat(32);return {data:foreign?{...f,salon_id:id(88)}:f};}if(name==='save_service_contribution_review'){f.reviews=[review()];return {data:{verified:true,service_id:service,revision:wrongReadback?2:1,fingerprint}};}throw Error(name);}}};
 const loaded=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/platformErrors':{capturePlatformError:async()=>id(90),safeFailure:(message,reference,status,extra)=>Response.json({error:message,request_id:reference,...extra},{status})},'@/lib/operationalMonitoring':{withOperationalMonitoring:(_,fn)=>fn,routeMonitoringProfile:()=>({})}});
 return {context,calls,server:loaded('src/lib/businessServiceContributionServer.ts'),route:loaded('src/app/api/salon/service-contribution/route.ts')};
}
test('actual server fresh pre/post permissions and full-scope evidence prevent private data escape',async()=>{
 for(const options of [{deny:true},{revoke:true},{foreign:true}]){const f=serverHarness(options);await assert.rejects(f.server.readServiceContribution(f.context,'2026-09-01','2026-09-28'),/CONTRIBUTION_ACCESS_DENIED/);if(options.deny)assert.equal(f.calls.some(c=>c.name==='read_service_contribution_evidence'),false);}
 const f=serverHarness();const result=await f.server.readServiceContribution(f.context,'2026-09-01','2026-09-28');assert.equal(result.finance,undefined);assert.equal(result.booking_services,undefined);assert.equal(result.rows[0].name,'Own service');
});
test('actual saved action requires same fresh review revision and owner; allocation never performs provider action',async()=>{
 const payload={from:'2026-09-01',to:'2026-09-28',service_id:service,revision:0,fingerprint,complete:true,zero_confirmed:false,note:'Reviewed sources',allocations:review().allocations};
 const good=serverHarness();assert.equal((await good.server.saveServiceContribution(good.context,id(80),payload)).verified,true);
 const wrong=serverHarness({wrongReadback:true});await assert.rejects(wrong.server.saveServiceContribution(wrong.context,id(80),payload),/CONTRIBUTION_READBACK_FAILED/);
 const changed=serverHarness({changedSource:true});await assert.rejects(changed.server.saveServiceContribution(changed.context,id(80),payload),/CONTRIBUTION_READBACK_FAILED/);
 const staff=serverHarness({isOwner:false});await assert.rejects(staff.server.saveServiceContribution(staff.context,id(80),payload),/CONTRIBUTION_OWNER_REQUIRED/);assert.equal(staff.calls.some(c=>c.name==='save_service_contribution_review'),false);
});
test('protected route rejects crafted business override and returns exact incident reference as JSON',async()=>{
 const f=serverHarness();const result=await f.route.POST(new Request('http://fixture.invalid',{method:'POST',body:JSON.stringify({request_id:id(80),payload:{salon_id:id(88)}})}));assert.equal(result.status,400);const body=await result.json();assert.equal(body.request_id,id(90));assert.equal(body.code,'CONTRIBUTION_REVIEW_INVALID');assert.equal(f.calls.length,0);
});
test('cost-review copy has four-language key and placeholder parity',()=>{
 const {SERVICE_CONTRIBUTION_COPY_ROWS,contributionCopy}=load('src/i18n/business-service-contribution-copy.ts');assert.equal(new Set(SERVICE_CONTRIBUTION_COPY_ROWS.map(row=>row[0])).size,SERVICE_CONTRIBUTION_COPY_ROWS.length);
 for(const row of SERVICE_CONTRIBUTION_COPY_ROWS){assert.equal(row.length,4);for(const value of row){assert.ok(value.trim());assert.deepEqual((value.match(/\{[^}]+\}/g)||[]).sort(),(row[0].match(/\{[^}]+\}/g)||[]).sort());}}
 for(const locale of ['fr','es','zh-CN'])assert.notEqual(contributionCopy(locale,'Service contribution'),'Service contribution');
});
