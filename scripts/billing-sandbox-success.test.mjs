import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from '../tests/helpers/load-node-typescript.mjs';
import {assertCreate,identity} from './billing-sandbox-guards.mjs';

const helper=await import('./billing-sandbox-success.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const salon='11111111-1111-4111-8111-111111111111',attemptId='22222222-2222-4222-8222-222222222222';
const reviewed={account:'acct_fixture',customer:'cus_fixture',subscription:'sub_fixture',approvedSha:'a'.repeat(40),runSha:'a'.repeat(40),authorizeDefaultWrite:true};
const metadata={type:'subscription_payment_method',attempt_id:attemptId,salon_id:salon,subscription_id:reviewed.subscription};
const card=(id,last4)=>({id,customer:reviewed.customer,livemode:false,type:'card',card:{brand:'visa',last4,exp_month:12,exp_year:2030}});
const copy=value=>structuredClone(value);

// Only provider transport and RPC persistence are simulated. The setup, complete,
// status and terminal replay functions are the application's actual TS module.
function fixture(){
 const writes=[],reads=[],state={attempt:null,leased:false,guard:null,loseResponse:false};
 state.customer={id:reviewed.customer,livemode:false,invoice_settings:{default_payment_method:card('pm_customer','1111')},default_source:null};
 state.subscription={id:reviewed.subscription,customer:copy(state.customer),livemode:false,status:'active',default_payment_method:card('pm_old','4242'),default_source:null,schedule:null,items:{data:[{id:'si_fixture',subscription:reviewed.subscription,price:{id:'price_existing'},quantity:1}],has_more:false},billing_cycle_anchor:123,cancel_at_period_end:false};
 state.session={id:'cs_test_fixture',mode:'setup',status:'open',customer:reviewed.customer,livemode:false,metadata:copy(metadata),setup_intent:'seti_fixture',subscription:null,payment_intent:null,url:'https://checkout.stripe.com/c/pay/cs_test_fixture'};
 state.setup={id:'seti_fixture',status:'succeeded',usage:'off_session',customer:reviewed.customer,livemode:false,metadata:copy(metadata),payment_method:'pm_new'};
 state.method=card('pm_new','4444');state.invoices={data:[],has_more:false};state.intents={data:[],has_more:false};
 const snapshot=()=>copy({account:{id:reviewed.account},customer:state.customer,subscription:state.subscription,invoices:state.invoices,intents:state.intents});
 const admin=()=>({from(table){assert.ok(['subscriptions','subscription_payment_method_attempts'].includes(table));const filters=[];const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},in(k,v){filters.push(row=>v.includes(row[k]));return q;},async maybeSingle(){const row=table==='subscriptions'?{salon_id:salon,stripe_customer_id:reviewed.customer,stripe_subscription_id:reviewed.subscription}:state.attempt;return {data:row&&filters.every(fn=>fn(row))?copy(row):null,error:null};}};return q;},async rpc(name,a){
  if(name==='reserve_subscription_payment_method_attempt'){state.attempt??={id:attemptId,salon_id:salon,stripe_customer_id:reviewed.customer,stripe_subscription_id:reviewed.subscription,livemode:false,status:'reserved',stripe_checkout_session_id:null,baseline_payment_method_id:a.p_baseline_method_id,first_apply_at:null,created_at:new Date().toISOString()};return {data:copy(state.attempt)};}
  assert.equal(a.p_attempt_id,attemptId);
  if(name==='bind_subscription_payment_method_attempt'){state.attempt.stripe_checkout_session_id=a.p_session_id;state.attempt.status='open';return {data:copy(state.attempt)};}
  if(name==='claim_subscription_payment_method_attempt'){if(state.leased)return {data:{claimed:false,attempt:copy(state.attempt)}};state.leased=true;state.lease=a.p_lease_id;state.attempt.status='processing';return {data:{claimed:true,attempt:copy(state.attempt)}};}
  assert.equal(a.p_lease_id,state.lease);
  if(name==='mark_subscription_payment_method_apply'){state.attempt.first_apply_at??=new Date().toISOString();state.attempt.stripe_setup_intent_id=a.p_setup_intent_id;state.attempt.stripe_payment_method_id=a.p_payment_method_id;return {data:copy(state.attempt)};}
  if(name==='finish_subscription_payment_method_attempt'){Object.assign(state.attempt,{status:a.p_status,stripe_setup_intent_id:a.p_setup_intent_id,stripe_payment_method_id:a.p_payment_method_id});state.leased=false;return {data:true};}
  throw Error(`Unexpected RPC ${name}`);
 }});
 const get=async path=>{reads.push(path);if(path.startsWith(`/subscriptions/${reviewed.subscription}?`))return copy(state.subscription);if(path===`/customers/${reviewed.customer}?expand[]=invoice_settings.default_payment_method&expand[]=default_source`)return copy(state.customer);
  state.guard?.assertRead(path);const value=path===`/checkout/sessions/${state.session.id}`?state.session:path===`/setup_intents/${state.setup.id}`?state.setup:path===`/payment_methods/${state.method.id}`?state.method:null;assert.ok(value,`Unexpected read ${path}`);state.guard?.observeRead(path,value);return copy(value);
 };
 const stripe={siteUrl:()=> 'http://127.0.0.1:3199',stripeGet:get,async stripeRequest(path,values,options){
  if(path==='/checkout/sessions'){assert.equal(writes.length,0);assertCreate({mode:'setup-cancel',...reviewed},values);assert.equal(options.idempotencyKey,`payment-method-setup:${attemptId}`);writes.push({path,values:copy(values)});return copy(state.session);}
  assert.ok(state.guard,'No subscription write without the new guard');state.guard.assertDefaultWrite(path,values,options,snapshot());writes.push({path,values:copy(values),key:options.idempotencyKey});
  state.subscription.default_payment_method=copy(state.method);options.onResponse?.({requestId:'req_fixture'});if(state.loseResponse){state.loseResponse=false;throw Error('SIMULATED_RESPONSE_LOST');}return copy(state.subscription);
 }};
 class SafeError extends Error{constructor(message,status){super(message);this.status=status;}}
 const load=loadNodeTypescript(process.cwd(),{'@/lib/stripeServer':stripe,'@/lib/platformErrors':{UserSafeRequestError:SafeError}}),api=load('src/lib/subscriptionPaymentMethodServer.ts');
 const complete=()=>api.completeSubscriptionPaymentMethod(admin(),state.session.id,salon);
 const reload=()=>api.subscriptionPaymentMethodStatus(admin(),salon);
 const begin=async()=>{const baseline=snapshot();await api.beginSubscriptionPaymentMethod({admin:admin(),salonId:salon,actorId:salon,request:new Request('http://127.0.0.1:3199/api/stripe/portal')});assert.equal(typeof helper.createSandboxSuccessGuard,'function','Successful-save verification boundary is missing');state.guard=helper.createSandboxSuccessGuard({reviewed,attempt:copy(state.attempt),createdSessionId:state.session.id,baseline});return baseline;};
 const verify=(overrides={})=>helper.verifySandboxSuccess({guard:state.guard,returnedUrl:`http://127.0.0.1:3199/salon/dashboard/subscription?payment_method_session=${state.session.id}`,read:get,complete,reload,replay:complete,readFinal:async()=>({attempt:copy(state.attempt),snapshot:snapshot()}),...overrides});
 return {state,writes,reads,snapshot,begin,verify,complete,reload,get};
}

test('successful hosted-return boundary exercises real app completion, fresh status and read-only replay while keeping the new default',async()=>{
 const f=fixture();await f.begin();f.state.session.status='complete';const result=await f.verify();
 assert.equal(result.status,'PASS');assert.equal(f.state.attempt.status,'completed');assert.equal(identity(f.state.subscription.default_payment_method),'pm_new');
 assert.deepEqual(f.writes.map(row=>row.path),['/checkout/sessions','/subscriptions/sub_fixture']);assert.deepEqual(f.writes[1].values,{default_payment_method:'pm_new'});
 assert.equal(f.writes[1].key,`payment-method-apply:${attemptId}`);assert.equal(result.applicationReady,false);assert.doesNotMatch(JSON.stringify(result),/cus_|sub_|pm_|cs_|seti_|checkout\.stripe|4444/);
});

test('return URL and caller success claims are never setup-completion evidence',async()=>{
 for(const returnedUrl of ['https://example.test/salon/dashboard/subscription?payment_method_session=cs_test_fixture','http://127.0.0.1:3199/salon/dashboard/subscription?payment_method_session=cs_test_other','http://127.0.0.1:3199/salon/dashboard/subscription?payment_method_session=cs_test_fixture&payment_method_cancel=x']){
  const f=fixture();await f.begin();f.state.session.status='complete';const count=f.reads.length;
  await assert.rejects(f.verify({returnedUrl}),/SUCCESS_RETURN_MISMATCH/);assert.equal(f.reads.length,count);assert.equal(f.writes.length,1);
 }
 const f=fixture();await f.begin();await assert.rejects(f.verify({complete:async()=>({updated:true})}),/SUCCESS_SESSION_NOT_VERIFIED/);assert.equal(f.writes.length,1);
});

test('only the exact created setup chain may unlock the subscription default write',async()=>{
 for(const mutate of [s=>s.session.id='cs_test_foreign',s=>s.session.customer='cus_other',s=>s.session.metadata.salon_id='33333333-3333-4333-8333-333333333333',s=>s.session.livemode=true,s=>s.session.subscription='sub_other',s=>s.setup.metadata.attempt_id='33333333-3333-4333-8333-333333333333',s=>s.setup.status='requires_action',s=>s.setup.customer='cus_other',s=>s.method.customer='cus_other',s=>s.method.livemode=true,s=>s.method.type='us_bank_account']){
  const f=fixture();await f.begin();f.state.session.status='complete';mutate(f.state);
  await assert.rejects(f.verify(),/SUCCESS_/);assert.equal(f.writes.length,1);
 }
});

test('authoritative SetupIntent must retain the app-requested off-session usage before any default write',async()=>{
 for(const usage of ['on_session',undefined]){
  const f=fixture();await f.begin();f.state.session.status='complete';f.state.setup.usage=usage;
  await assert.rejects(f.verify(),/SUCCESS_SETUP_NOT_VERIFIED/);assert.equal(f.writes.length,1);
 }
});

test('reviewed SHA, sandbox association and durable attempt must match before a completion guard exists',async()=>{
 const f=fixture();const baseline=await f.begin(),input={reviewed,baseline,attempt:f.state.attempt,createdSessionId:f.state.session.id};
 for(const mutate of [v=>v.reviewed.runSha='b'.repeat(40),v=>v.baseline.account.id='acct_other',v=>v.baseline.customer.livemode=true,v=>v.baseline.subscription.customer='cus_other',v=>v.attempt.salon_id='invalid',v=>v.attempt.stripe_subscription_id='sub_other',v=>v.attempt.baseline_payment_method_id='pm_foreign',v=>v.createdSessionId='cs_test_not_created',v=>v.attempt.schedule_baseline={},v=>v.baseline.subscription.items.has_more=true,v=>v.baseline.intents.has_more=true,v=>v.baseline.subscription.default_payment_method={},v=>v.baseline.customer.default_source={}]){
  const value=copy(input);mutate(value);assert.throws(()=>helper.createSandboxSuccessGuard(value));
 }
 assert.equal(f.writes.length,1);
});

test('readback comparison tolerates identity expansion without discarding commercial or customer-default facts',async()=>{
 const f=fixture();await f.begin();f.state.session.status='complete';
 const result=await f.verify({readFinal:async()=>{const snapshot=f.snapshot();snapshot.subscription.customer=reviewed.customer;snapshot.customer.invoice_settings.default_payment_method='pm_customer';return {attempt:copy(f.state.attempt),snapshot};}});
 assert.equal(result.status,'PASS');assert.equal(f.writes.length,2);
});

test('guard refuses extra fields, alternate destinations, wrong key and writes before proof or after sealing',async()=>{
 const f=fixture();await f.begin();const guard=f.state.guard,options={idempotencyKey:`payment-method-apply:${attemptId}`};
 assert.throws(()=>guard.assertDefaultWrite('/subscriptions/sub_fixture',{default_payment_method:'pm_new'},options,f.snapshot()),/SUCCESS_WRITE_NOT_AUTHORIZED/);
 assert.throws(()=>guard.assertRead('/setup_intents/seti_fixture'),/SUCCESS_READ_NOT_ALLOWLISTED/);
 f.state.session.status='complete';await guard.proveSetup(f.get);
 for(const [path,values,key] of [
  ['/customers/cus_fixture',{default_payment_method:'pm_new'},options],
  ['/subscriptions/sub_fixture?expand[]=items',{default_payment_method:'pm_new'},options],
  ['/subscriptions/sub_other',{default_payment_method:'pm_new'},options],
  ['/subscriptions/sub_fixture',{default_payment_method:'pm_old'},options],
  ['/subscriptions/sub_fixture',{default_payment_method:'pm_new',proration_behavior:'none'},options],
  ['/subscriptions/sub_fixture',Object.assign(Object.create({default_payment_method:'pm_new'}),{anything:1}),options],
  ['/subscriptions/sub_fixture',{default_payment_method:'pm_new'},{idempotencyKey:'new_key'}],
 ])assert.throws(()=>guard.assertDefaultWrite(path,values,key,f.snapshot()),/SUCCESS_WRITE_NOT_ALLOWLISTED/);
 guard.seal();assert.throws(()=>guard.assertDefaultWrite('/subscriptions/sub_fixture',{default_payment_method:'pm_new'},options,f.snapshot()),/SUCCESS_WRITE_NOT_AUTHORIZED/);assert.equal(f.writes.length,1);
});

test('fresh pre-write evidence rejects customer defaults, unknown commercial fields and new invoice/payment activity',async()=>{
 for(const mutate of [s=>s.subscription.items.data[0].quantity=2,s=>s.subscription.new_commercial_field='changed',s=>s.customer.invoice_settings.default_payment_method='pm_external',s=>s.subscription.schedule='sub_sched_new',s=>s.invoices.data.push({id:'in_new',livemode:false,customer:reviewed.customer,status:'paid'}),s=>s.intents.data.push({id:'pi_new',livemode:false,customer:reviewed.customer,status:'succeeded'})]){
  const f=fixture();await f.begin();f.state.session.status='complete';mutate(f.state);
  await assert.rejects(f.verify());assert.equal(f.writes.length,1,'No subscription dispatch after changed evidence');
 }
});

test('null and non-card original defaults can be replaced without changing customer defaults',async()=>{
 for(const original of [null,{id:'pm_bank',customer:reviewed.customer,livemode:false,type:'us_bank_account'}]){
  const f=fixture();f.state.subscription.default_payment_method=original;const before=await f.begin();f.state.session.status='complete';await f.verify();
  assert.deepEqual(f.state.customer,before.customer);assert.equal(identity(f.state.subscription.default_payment_method),'pm_new');assert.equal(f.writes.length,2);
 }
});

test('lost apply response preserves original durable attempt and later real-app reconciliation sends no second write',async()=>{
 const f=fixture(),baseline=await f.begin();f.state.session.status='complete';f.state.loseResponse=true;
 await assert.rejects(f.verify(),/SIMULATED_RESPONSE_LOST/);assert.equal(f.state.attempt.status,'processing');assert.equal(identity(f.state.subscription.default_payment_method),'pm_new');assert.equal(f.writes.length,2);
 // Simulate a later worker after the DB lease expires, retaining durable state.
 f.state.leased=false;f.state.guard=helper.createSandboxSuccessGuard({reviewed,attempt:copy(f.state.attempt),createdSessionId:f.state.session.id,baseline});
 const result=await f.verify();assert.equal(result.status,'PASS');assert.equal(f.writes.length,2);assert.equal(f.state.attempt.status,'completed');
});

test('pending core result, false display claims and late changes cannot produce a passing success report',async()=>{
 const pending=fixture();await pending.begin();pending.state.session.status='complete';pending.state.leased=true;
 await assert.rejects(pending.verify(),/SUCCESS_DEFAULT_NOT_PERSISTED/);assert.equal(pending.writes.length,1);
 const wrongMask=fixture();await wrongMask.begin();wrongMask.state.session.status='complete';
 await assert.rejects(wrongMask.verify({reload:async()=>({...await wrongMask.reload(),paymentMethod:{type:'card',brand:'visa',last4:'9999',expMonth:12,expYear:2030}})}),/SUCCESS_MASKED_READBACK_MISMATCH/);assert.equal(wrongMask.writes.length,2);
 const drift=fixture();await drift.begin();drift.state.session.status='complete';
 await assert.rejects(drift.verify({reload:async()=>{drift.state.subscription.cancel_at_period_end=true;return drift.reload();}}),/BILLING_BASELINE_CHANGED/);assert.equal(drift.writes.length,2,'No compensation or automatic restore on changed evidence');
});

test('post-completion replay is sealed against all writes and cannot restore an older default',async()=>{
 const f=fixture();await f.begin();f.state.session.status='complete';
 await assert.rejects(f.verify({replay:async()=>{f.state.guard.assertDefaultWrite('/subscriptions/sub_fixture',{default_payment_method:'pm_new'},{idempotencyKey:`payment-method-apply:${attemptId}`},f.snapshot());return f.complete();}}),/SUCCESS_WRITE_NOT_AUTHORIZED/);
 assert.equal(f.writes.length,2);assert.equal(identity(f.state.subscription.default_payment_method),'pm_new');
});

test('explicit write authorization is caller-gated and this module does not enable an existing verifier mode',async()=>{
 const f=fixture(),baseline=await f.begin();f.state.guard=helper.createSandboxSuccessGuard({reviewed:{...reviewed,authorizeDefaultWrite:false},attempt:f.state.attempt,createdSessionId:f.state.session.id,baseline});f.state.session.status='complete';
 await assert.rejects(f.verify(),/SUCCESS_WRITE_NOT_AUTHORIZED/);assert.equal(f.writes.length,1);
 const {configuration}=await import('./billing-sandbox-guards.mjs');assert.throws(()=>configuration({BILLING_SANDBOX_MODE:'setup-success'}),/MODE_NOT_IMPLEMENTED/);
});
