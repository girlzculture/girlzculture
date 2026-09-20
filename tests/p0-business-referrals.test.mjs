import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const core=load('src/lib/businessReferrals.ts');
const {referralPaymentEvidence}=load('src/lib/referralPaymentEvidence.ts');
const {referralCopy,REFERRAL_COPY_ROWS}=load('src/i18n/business-referral-copy.ts');
const owner='17600000-0000-4000-8000-000000000001',salon='17600000-0000-4000-8000-000000000011';
const emptyTerms=()=>({currency:'usd',recipient:null,amount_cents:null,starts_at:null,ends_at:null,minimum_payment_cents:null,qualifying_days:null,hold_days:null,max_rewards_per_referrer:null});
const input=()=>({eventType:'invoice.paid',invoice:{id:'in_Fixture',status:'paid',livemode:true,collection_method:'charge_automatically',amount_paid:8900,currency:'usd',customer:'cus_Fixture',payment_intent:'pi_Fixture',status_transitions:{paid_at:1900000000}},subscription:{id:'sub_Fixture',customer:'cus_Fixture',status:'active',livemode:true,created:1899999999},stored:{salon_id:salon,stripe_customer_id:'cus_Fixture',stripe_subscription_id:'sub_Fixture'},salonId:salon});
const payment=()=>({id:'pi_Fixture',customer:'cus_Fixture',status:'succeeded',livemode:true,amount_received:8900,currency:'usd',latest_charge:{id:'ch_Fixture',customer:'cus_Fixture',payment_intent:'pi_Fixture',status:'succeeded',paid:true,captured:true,livemode:true,disputed:false,amount_refunded:0,amount:8900,currency:'usd'}});
test('incomplete configuration remains a null-valued draft without an invented campaign award',()=>{
 const result=core.referralCampaignInput({action:'save',id:owner,revision:0,title:'  Draft  ',terms:emptyTerms()});
 assert.equal(result.title,'Draft');assert.equal(result.terms.amount_cents,null);assert.equal(result.terms.recipient,null);
 for(const terms of [{...emptyTerms(),amount_cents:20.1},{...emptyTerms(),currency:'eur'},{...emptyTerms(),recipient:'both'},{...emptyTerms(),starts_at:'2026-09-19T10:00'},{...emptyTerms(),starts_at:'2026-09-20T00:00:00Z',ends_at:'2026-09-19T00:00:00Z'},{...emptyTerms(),issue_credit:true}]) assert.throws(()=>core.referralCampaignInput({action:'save',id:owner,revision:0,title:'Draft',terms}));
 assert.throws(()=>core.referralCampaignInput({action:'activate',id:owner,revision:1,title:'Draft',terms:emptyTerms()}));
});
test('verified live canonical association and captured unreversed payment yields exact proof',async()=>{
 const paths=[];const proof=await referralPaymentEvidence(input(),async(path,options)=>{paths.push(path);assert.ok(options.signal);return payment();});
 assert.equal(proof.amount_cents,8900);assert.equal(proof.source,'stripe_verified_payment_v1');assert.equal(proof.livemode,true);assert.deepEqual(paths,['/payment_intents/pi_Fixture?expand[]=latest_charge']);
});
test('test mode, external paid marks, credit-only, customer conflicts and inactive activation cannot qualify',async()=>{
 for(const change of [v=>v.invoice.livemode=false,v=>v.subscription.livemode=false,v=>v.invoice.paid_out_of_band=true,v=>v.invoice.amount_paid=0,v=>v.invoice.collection_method='send_invoice',v=>v.stored.stripe_customer_id='cus_Other',v=>v.stored.salon_id='other',v=>v.subscription.status='trialing',v=>v.invoice.payment_intent=null]){
  const data=input();change(data);let reads=0;assert.equal(await referralPaymentEvidence(data,async()=>{reads++;return payment();}),null);assert.equal(reads,0);
 }
});
test('refund, dispute, uncaptured charge, mixed payment and foreign provider customer are denied',async()=>{
 for(const change of [v=>v.latest_charge.amount_refunded=1,v=>v.latest_charge.disputed=true,v=>v.latest_charge.captured=false,v=>v.latest_charge.customer='cus_Other',v=>v.latest_charge.payment_intent='pi_Other',v=>v.amount_received=9000,v=>v.livemode=false]){
  const data=payment();change(data);assert.equal(await referralPaymentEvidence(input(),async()=>data),null);
 }
});
test('current invoice payments relationship supported without guessing mixed allocation',async()=>{
 const data=input();delete data.invoice.payment_intent;data.invoice.payments={has_more:false,data:[{status:'paid',amount_paid:8900,payment:{type:'payment_intent',payment_intent:'pi_Fixture'}}]};
 assert.ok(await referralPaymentEvidence(data,async()=>payment()));
 data.invoice.payments.has_more=true;assert.equal(await referralPaymentEvidence(data,async()=>assert.fail()),null);
 data.invoice.payments.has_more=false;data.invoice.payments.data.push({...data.invoice.payments.data[0]});assert.equal(await referralPaymentEvidence(data,async()=>assert.fail()),null);
});
test('explicit fraud or a linked provider review holds qualification despite a captured undisputed payment',async()=>{
 for(const change of [value=>{value.latest_charge.fraud_details={user_report:'fraudulent'};},value=>{value.latest_charge.review='prv_Fixture';},value=>{value.latest_charge.review={id:'prv_Fixture',open:false};}]){
  const data=payment();change(data);assert.equal(await referralPaymentEvidence(input(),async()=>data),null);
 }
 const cleared=payment();cleared.latest_charge.fraud_details={user_report:'safe'};cleared.latest_charge.review=null;assert.ok(await referralPaymentEvidence(input(),async()=>cleared));
});
test('assistant projection excludes other business and provider evidence even if supplied',()=>{
 const summary=core.ownReferralSummary({rewards:[{id:'private-id',status:'pending_review',amount_cents:700,currency:'usd',campaign_title:'Configured campaign',qualified_at:'2026-09-19',eligible_at:'2026-10-03',referred_name:'Other salon',stripe_customer_id:'cus_Private'}],codes:[{code:'private-code'}]});
 assert.equal(summary.issuance_enabled,false);assert.doesNotMatch(JSON.stringify(summary),/Other salon|cus_Private|private-code|private-id/);
});
test('owner referral states have four-language truthful no-credit copy',()=>{
 for(const locale of ['fr','es','zh-CN'])for(const source of ['Business referrals','Not issued','pending','qualified','on_hold','expired','No qualifying reward is recorded for your business.'])assert.notEqual(referralCopy(locale,source),source);
 assert.equal(new Set(REFERRAL_COPY_ROWS.map(row=>row[0])).size,REFERRAL_COPY_ROWS.length);
 for(const row of REFERRAL_COPY_ROWS){assert.equal(row.length,4);for(const value of row){assert.ok(value.trim());assert.deepEqual(value.match(/\{[^}]+\}/g)||[],row[0].match(/\{[^}]+\}/g)||[]);}}
});
function route({isOwner=true,authError=null,rpcError=null}={}){
 const calls=[],incidents=[];
 const workspace={campaigns:[],codes:[],claim:null,rewards:[],issuance_enabled:false};
 const admin={rpc:async(name,params)=>{calls.push({name,params});return {data:name==='business_referral_workspace'?workspace:{id:owner},error:rpcError};}};
 const api=loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireSalonOwner:async()=>{if(authError)throw Error(authError);return {admin,user:{id:owner},salon:{id:salon},isOwner};}},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},'@/lib/platformErrors':{capturePlatformError:async details=>{incidents.push(details);return 'referral-safe-reference';},safeFailure:(message,reference,status,details)=>Response.json({error:message,request_id:reference,...details},{status})}})('src/app/api/salon/referrals/route.ts');
 return {api,calls,incidents,workspace};
}
test('owner route scopes code/claim/refresh to fresh authorized business and returns saved readback',async()=>{
 const {api,calls}=route();const response=await api.POST(new Request('https://fixture.invalid/api/salon/referrals',{method:'POST',body:JSON.stringify({action:'claim',code:'a'.repeat(32),confirm:true})}));
 assert.equal(response.status,200);assert.deepEqual(calls.map(c=>c.name),['claim_business_referral','business_referral_workspace']);for(const call of calls){assert.equal(call.params.p_salon,salon);assert.equal(call.params.p_actor,owner);}
});
test('team, unauthenticated, foreign scope and unconfirmed writes never reach referral database',async()=>{
 for(const options of [{isOwner:false},{authError:'Unauthorized'}]){const {api,calls}=route(options);assert.ok([401,403].includes((await api.GET(new Request('https://fixture.invalid'))).status));assert.equal(calls.length,0);}
 for(const [body,status] of [[{action:'claim',code:'a'.repeat(32),confirm:false},409],[{action:'claim',code:'a'.repeat(32),confirm:true,salon_id:'other'},400],[{action:'issue-credit'},400]]){const {api,calls}=route();assert.equal((await api.POST(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(body)}))).status,status);assert.equal(calls.length,0);}
});
test('unexpected save errors preserve exact protected incident reference without raw backend details',async()=>{
 const {api,incidents}=route({rpcError:Error('private backend detail')});const response=await api.GET(new Request('https://fixture.invalid'));const json=await response.json();assert.equal(response.status,500);assert.equal(json.request_id,'referral-safe-reference');assert.equal(incidents.length,1);assert.doesNotMatch(JSON.stringify(json),/private backend/);
});

test('disabled or absent referral never adds Stripe reads; optional failure stays explicit and nonblocking',async()=>{
 const server=load('src/lib/businessReferralProofServer.ts');let reads=0;
 const admin=claim=>({from:()=>({select:()=>({eq:()=>({limit:()=>({maybeSingle:async()=>claim})})})})});
 const get=async()=>{reads++;throw Error('provider private failure');};
 assert.equal(await server.optionalReferralPaymentEvidence(admin({data:null}),input(),get),null);assert.equal(reads,0);
 const unavailable=await server.optionalReferralPaymentEvidence(admin({error:Error('table unavailable')}),input(),get);assert.equal(unavailable.source,'stripe_unverified_payment_v1');assert.equal(reads,0);
 const providerFailure=await server.optionalReferralPaymentEvidence(admin({data:{id:owner}}),input(),get);assert.equal(providerFailure.reason,'provider_read_unavailable');assert.equal(reads,1);assert.doesNotMatch(JSON.stringify(providerFailure),/private/);
});
function proofStore(){
 const rows=new Map();
 const candidate={billing_event_id:owner,salon_id:salon,stripe_invoice_id:'in_Fixture',stripe_subscription_id:'sub_Fixture',stripe_customer_id:'cus_Fixture',amount_collected:8900,currency:'usd'};
 const admin={rpc:async(name,args)=>{assert.equal(name,'business_referral_check_inputs');assert.deepEqual(args,{p_salon:salon,p_actor:owner});return {data:[candidate]};},from:table=>{assert.equal(table,'business_referral_payment_checks');return {upsert:async values=>{for(const row of values)rows.set(row.billing_event_id,structuredClone(row));return {};},update:values=>{const filters={};const query={eq(key,value){filters[key]=value;return query;},select(){return query;},async maybeSingle(){const current=rows.get(filters.billing_event_id);if(current?.generation!==filters.generation)return {data:null};Object.assign(current,values);return {data:{billing_event_id:filters.billing_event_id}};}};return query;}};}};
 return {admin,rows};
}
function readFixture(modify=()=>{}){return async path=>{const data=input();data.invoice.subscription='sub_Fixture';if(path==='/invoices/in_Fixture')return data.invoice;if(path==='/subscriptions/sub_Fixture')return data.subscription;assert.equal(path,'/payment_intents/pi_Fixture?expand[]=latest_charge');const method=payment();modify(method);return method;};}
test('fresh proof recheck recovers missing webhook evidence and later disputes or read failure invalidate prior positive proof',async()=>{
 const server=load('src/lib/businessReferralProofServer.ts'),f=proofStore();
 assert.deepEqual(await server.refreshReferralPaymentChecks(f.admin,salon,owner,readFixture()),{checked:1,pending:false});assert.equal(f.rows.get(owner).state,'verified');
 assert.deepEqual(await server.refreshReferralPaymentChecks(f.admin,salon,owner,readFixture(value=>{value.latest_charge.disputed=true;})),{checked:1,pending:true});assert.equal(f.rows.get(owner).state,'unverified');assert.equal(f.rows.get(owner).proof,null);
 await server.refreshReferralPaymentChecks(f.admin,salon,owner,readFixture());
 await server.refreshReferralPaymentChecks(f.admin,salon,owner,async()=>{throw Error('temporary failure');});assert.equal(f.rows.get(owner).state,'unverified');assert.equal(f.rows.get(owner).last_error,'REFERRAL_CHECK_UNAVAILABLE');
});
test('slow prior positive recheck cannot replace a newer failed or disputed generation',async()=>{
 const server=load('src/lib/businessReferralProofServer.ts'),f=proofStore();let release;const gate=new Promise(resolve=>{release=resolve;});let started;const arrived=new Promise(resolve=>{started=resolve;});
 const prior=server.refreshReferralPaymentChecks(f.admin,salon,owner,async path=>{if(path.startsWith('/payment_intents/')){started();await gate;}return readFixture()(path);});
 await arrived;await server.refreshReferralPaymentChecks(f.admin,salon,owner,readFixture(value=>{value.latest_charge.disputed=true;}));release();assert.equal((await prior).pending,true);assert.equal(f.rows.get(owner).state,'unverified');assert.equal(f.rows.get(owner).proof,null);
});

test('bounded payment verification leaves a truthful pending signal when a twenty-first candidate remains',async()=>{
 const server=load('src/lib/businessReferralProofServer.ts'),f=proofStore();
 const original=f.admin.rpc;
 f.admin.rpc=async(...args)=>{const result=await original(...args);return {data:Array.from({length:21},(_,index)=>({...result.data[0],billing_event_id:`17600000-0000-4000-8000-${String(index).padStart(12,'0')}`}))};};
 let reads=0;const result=await server.refreshReferralPaymentChecks(f.admin,salon,owner,async path=>{reads++;return readFixture()(path);});
 assert.deepEqual(result,{checked:20,pending:true});assert.equal(reads,60);assert.equal(f.rows.size,20);assert.ok([...f.rows.values()].every(row=>row.state==='verified'));
});

test('actual invoice webhook commits canonical money with no referral and with optional provider failure',async()=>{
 for(const hasClaim of [false,true]){
  const facts=input(),writes=[],paths=[];facts.invoice.subscription='sub_Fixture';facts.invoice.billing_reason='subscription_create';
  const admin={rpc:async()=>({data:true}),from:table=>{
   const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},async maybeSingle(){return {data:table==='subscriptions'?{...facts.stored,tier:'Starter'}:table==='salons'?{id:salon,name:'Private fixture'}:table==='business_referral_claims'&&hasClaim?{id:owner}:null};},insert(value){writes.push({table,value});return Promise.resolve({});},update(value){writes.push({table,value});return q;},then(resolve){resolve({});}};return q;
  }};
  const api=loadNodeTypescript(process.cwd(),{
   '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,deliverBookingNotifications:async()=>{}},
   '@/lib/stripeServer':{verifyStripeEvent:()=>({id:'evt_ReferralFixture',type:'invoice.paid',created:1900000000,data:{object:facts.invoice}}),stripeGet:async path=>{paths.push(path);if(path==='/subscriptions/sub_Fixture')return facts.subscription;throw Error('optional provider unavailable');}},
   '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler,noteOperationalFailure(){}},
   '@/lib/platformErrors':{capturePlatformError:async()=> 'safe-fixture-reference'},
   '@/lib/commerceCheckoutServer':{completeCommerceCheckout:async()=>{}},'@/lib/pickupReservationsServer':{completePickupReservation:async()=>{}},
  })('src/app/api/stripe/webhook/route.ts');
  const response=await api.POST(new Request('https://fixture.invalid/api/stripe/webhook',{method:'POST',body:'signed-fixture'}));
  assert.equal(response.status,200);const event=writes.find(row=>row.table==='billing_events').value;assert.equal(event.amount_collected,8900);assert.equal(event.stripe_event_id,'evt_ReferralFixture');assert.equal(event.salon_id,salon);
  assert.equal(event.metadata.referral_payment?.source||null,hasClaim?'stripe_unverified_payment_v1':null);assert.equal(paths.filter(path=>path.startsWith('/payment_intents/')).length,hasClaim?1:0);
  assert.equal(writes.findLast(row=>row.table==='stripe_webhook_events').value.processing_status,'Processed');
 }
});

test('platform-owner configuration saves only inactive terms and refuses owner-role or activation requests',async()=>{
 let calls=0;
 function adminRoute(superAdmin){
  const saved={id:owner,title:'Reviewed draft',revision:1,status:'inactive',terms:emptyTerms()};
  const admin={rpc:async(name,args)=>{calls++;assert.equal(name,'save_business_referral_campaign');assert.equal(args.p_actor,owner);assert.deepEqual(args.p_terms,emptyTerms());return {data:saved};},from:()=>({select:()=>({order:()=>({limit:async()=>({data:[saved]})})})})};
  return loadNodeTypescript(process.cwd(),{'@/lib/supabaseAdmin':{requireAdmin:async()=>({admin,user:{id:owner},adminUser:{is_super_admin:superAdmin}})},'@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},'@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},'@/lib/platformErrors':{capturePlatformError:async()=> 'safe-reference',safeFailure:()=>Response.json({error:'safe'},{status:500})}})('src/app/api/admin/referral-campaigns/route.ts');
 }
 const body={action:'save',id:owner,revision:0,title:'Reviewed draft',terms:emptyTerms()};
 const request=value=>new Request('https://fixture.invalid/api/admin/referral-campaigns',{method:'POST',body:JSON.stringify(value)});
 assert.equal((await adminRoute(false).POST(request(body))).status,403);assert.equal(calls,0);
 assert.equal((await adminRoute(true).POST(request({...body,action:'activate'}))).status,400);assert.equal(calls,0);
 const response=await adminRoute(true).POST(request(body));assert.equal(response.status,200);const result=await response.json();assert.equal(result.campaigns[0].status,'inactive');assert.equal(result.activation_enabled,false);assert.equal(result.issuance_enabled,false);assert.equal(calls,1);
});
