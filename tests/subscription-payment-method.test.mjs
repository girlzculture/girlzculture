import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';

class SafeError extends Error { constructor(message,status){super(message);this.status=status;} }
const salon='11111111-1111-4111-8111-111111111111';
const customer='cus_owner',subscription='sub_owner',attemptId='22222222-2222-4222-8222-222222222222';
const metadata={type:'subscription_payment_method',attempt_id:attemptId,salon_id:salon,subscription_id:subscription};
const card=(id,last4)=>({id,customer,type:'card',livemode:false,card:{brand:'visa',last4,exp_month:12,exp_year:2030}});

function fixture(){
  const calls=[];
  const state={
    attempt:null,leaseActive:false,uncertain:false,
    subscription:{id:subscription,customer:{id:customer,livemode:false,invoice_settings:{default_payment_method:card('pm_customer','1111')}},livemode:false,status:'active',default_payment_method:card('pm_old','4242'),schedule:null,items:{data:[{price:{id:'price_unchanged'},quantity:1}]},billing_cycle_anchor:123,cancel_at_period_end:false},
    session:{id:'cs_owned',mode:'setup',status:'open',customer,livemode:false,metadata:{...metadata},setup_intent:'seti_owned',subscription:null,payment_intent:null,url:'https://checkout.stripe.com/c/pay/cs_owned'},
    setup:{id:'seti_owned',status:'succeeded',customer,livemode:false,metadata:{...metadata},payment_method:'pm_new'},
    method:card('pm_new','4444'),
  };
  const admin={from(table){let predicates=[];const q={select(){return q;},eq(key,value){predicates.push(row=>row[key]===value);return q;},in(key,values){predicates.push(row=>values.includes(row[key]));return q;},async maybeSingle(){const row=table==='subscriptions'?{salon_id:salon,stripe_customer_id:customer,stripe_subscription_id:subscription}:state.attempt;return {data:row&&predicates.every(check=>check(row))?structuredClone(row):null,error:null};}};return q;},async rpc(name,args){calls.push({rpc:name,args});
    if(name==='reserve_subscription_payment_method_attempt'){state.attempt??={id:attemptId,salon_id:salon,stripe_customer_id:customer,stripe_subscription_id:subscription,livemode:false,status:'reserved',stripe_checkout_session_id:null,baseline_payment_method_id:args.p_baseline_method_id,first_apply_at:null,created_at:new Date().toISOString()};return {data:structuredClone(state.attempt)};}
    if(name==='bind_subscription_payment_method_attempt'){Object.assign(state.attempt,{stripe_checkout_session_id:args.p_session_id,status:'open'});return {data:structuredClone(state.attempt)};}
    if(name==='claim_subscription_payment_method_attempt'){if(state.leaseActive)return {data:{claimed:false,attempt:structuredClone(state.attempt)}};state.leaseActive=true;state.attempt.status='processing';state.lease=args.p_lease_id;return {data:{claimed:true,attempt:structuredClone(state.attempt)}};}
    if(name==='finish_subscription_payment_method_attempt'){if(args.p_lease_id!==state.lease)return {data:false};state.leaseActive=false;state.attempt.status=args.p_status;return {data:true};}
    if(name==='mark_subscription_payment_method_apply'){assert.equal(args.p_lease_id,state.lease);state.attempt.first_apply_at??=new Date().toISOString();state.attempt.stripe_setup_intent_id=args.p_setup_intent_id;state.attempt.stripe_payment_method_id=args.p_payment_method_id;return {data:structuredClone(state.attempt)};}
    throw Error(`Unexpected RPC ${name}`);
  }};
  const stripe={siteUrl:()=> 'https://fixture.invalid',async stripeGet(path,options){calls.push({get:path,signal:options?.signal});
    if(path.startsWith('/subscriptions/'))return structuredClone(state.subscription);
    if(path.startsWith('/checkout/sessions/'))return structuredClone(state.session);
    if(path==='/setup_intents/seti_owned')return structuredClone(state.setup);
    if(path==='/payment_methods/pm_new')return structuredClone(state.method);
    throw Error(`Unexpected Stripe GET ${path}`);
  },async stripeRequest(path,values,options){calls.push({post:path,values:structuredClone(values),key:options?.idempotencyKey,signal:options?.signal});options?.onResponse?.({requestId:'req_fixture'});
    if(path==='/checkout/sessions')return structuredClone(state.session);
    if(path==='/checkout/sessions/cs_owned/expire'){state.session.status='expired';return structuredClone(state.session);}
    assert.equal(path,`/subscriptions/${subscription}`);assert.deepEqual(values,{default_payment_method:'pm_new'});
    if(state.uncertainBefore){state.uncertainBefore=false;throw Object.assign(Error('NETWORK_ERROR'),{deliveryUncertain:true});}
    state.subscription.default_payment_method=structuredClone(state.method);
    if(state.uncertain){state.uncertain=false;throw Object.assign(Error('NETWORK_ERROR'),{deliveryUncertain:true});}
    return structuredClone(state.subscription);
  }};
  const load=loadNodeTypescript(process.cwd(),{'@/lib/stripeServer':stripe,'@/lib/platformErrors':{UserSafeRequestError:SafeError}});
  const api=load('src/lib/subscriptionPaymentMethodServer.ts');
  const core=load('src/lib/subscriptionPaymentMethodCore.ts');
  const begin=()=>api.beginSubscriptionPaymentMethod({admin,salonId:salon,actorId:salon,request:new Request('https://fixture.invalid/api/stripe/portal')});
  const complete=()=>api.completeSubscriptionPaymentMethod(admin,'cs_owned',salon);
  return {state,calls,admin,api,core,begin,complete};
}

test('setup creation uses existing customer, no subscription purchase or invoice, and durable stable metadata',async()=>{
  const f=fixture();const result=await f.begin();assert.equal(result.url,f.state.session.url);
  const create=f.calls.find(x=>x.post==='/checkout/sessions');
  assert.equal(create.values.mode,'setup');assert.equal(create.values.customer,customer);
  assert.equal(create.values['setup_intent_data[usage]'],'off_session');
  assert.equal(create.values['metadata[attempt_id]'],attemptId);assert.equal(create.values['setup_intent_data[metadata][subscription_id]'],subscription);
  assert.ok(create.values.success_url.includes('payment_method_session={CHECKOUT_SESSION_ID}'));
  assert.ok(create.values.cancel_url.endsWith(`payment_method_cancel=${attemptId}`));
  assert.ok(!Object.keys(create.values).some(key=>/line_items|subscription_data|payment_intent_data/.test(key)));
  await f.begin();assert.equal(f.calls.filter(x=>x.post).length,1);
});

test('verified completion changes only exact subscription method and reads authoritative masked result',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';
  const before=structuredClone(f.state.subscription);delete before.default_payment_method;
  const result=await f.complete();assert.equal(result.updated,true);assert.equal(result.billingMode,'test');
  assert.deepEqual(result.paymentMethod,{type:'card',brand:'visa',last4:'4444',expMonth:12,expYear:2030});
  const after=structuredClone(f.state.subscription);delete after.default_payment_method;assert.deepEqual(after,before);
  const write=f.calls.find(x=>x.post?.startsWith('/subscriptions/'));assert.deepEqual(write.values,{default_payment_method:'pm_new'});
  assert.equal(write.key,`payment-method-apply:${attemptId}`);
  assert.equal(f.state.attempt.status,'completed');assert.doesNotMatch(JSON.stringify(result),/cus_|pm_|seti_|client_secret|number/);
});

test('every provider request in a payment-method operation shares one bounded AbortSignal',async()=>{
  const f=fixture();await f.begin();
  const begin=f.calls.filter(x=>x.get||x.post);
  assert.ok(begin.every(x=>x.signal instanceof AbortSignal));assert.equal(new Set(begin.map(x=>x.signal)).size,1);
  f.calls.length=0;f.state.session.status='complete';await f.complete();
  const complete=f.calls.filter(x=>x.get||x.post);
  assert.ok(complete.length>3);assert.ok(complete.every(x=>x.signal instanceof AbortSignal));
  assert.equal(new Set(complete.map(x=>x.signal)).size,1);
  assert.notEqual(begin[0].signal,complete[0].signal);
});

test('completed attempt replay never restores its old card after a newer change',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';await f.complete();
  f.state.subscription.default_payment_method=card('pm_latest','9999');
  const before=f.calls.filter(x=>x.post).length;
  const result=await f.complete();assert.equal(result.paymentMethod.last4,'9999');assert.equal(f.calls.filter(x=>x.post).length,before);
});

test('cancel expires open session and does not update card, plan or schedule',async()=>{
  const f=fixture();await f.begin();const before=structuredClone(f.state.subscription);
  const result=await f.api.cancelSubscriptionPaymentMethod(f.admin,salon,attemptId);
  assert.equal(result.cancelled,true);assert.equal(result.updated,false);assert.deepEqual(f.state.subscription,before);
  assert.equal(f.state.attempt.status,'cancelled');assert.equal(f.calls.filter(x=>x.post?.startsWith('/subscriptions/')).length,0);
  await f.complete();assert.deepEqual(f.state.subscription,before);
});

test('expiry webhook before either browser return reports a terminal expiry without provider writes',async()=>{
  for (const returningViaCancel of [false,true]) {
    const f=fixture();await f.begin();const before=structuredClone(f.state.subscription);
    f.state.session.status='expired';
    const webhook=await f.api.completeSubscriptionPaymentMethod(f.admin,'cs_owned');
    assert.equal(webhook.expired,true);assert.equal(webhook.cancelled,false);assert.equal(webhook.updated,false);
    assert.equal(f.state.attempt.status,'expired');
    const writes=f.calls.filter(x=>x.post).length;
    const returned=returningViaCancel
      ? await f.api.cancelSubscriptionPaymentMethod(f.admin,salon,attemptId)
      : await f.complete();
    assert.equal(returned.expired,true);assert.equal(returned.cancelled,false);assert.equal(returned.updated,false);
    assert.equal(returned.updatePending,false);assert.equal(returned.pending,undefined);
    assert.equal(f.calls.filter(x=>x.post).length,writes);assert.deepEqual(f.state.subscription,before);
  }
});

test('cancelled setup replay through either return preserves cancellation rather than reporting pending',async()=>{
  const f=fixture();await f.begin();const before=structuredClone(f.state.subscription);
  const cancelled=await f.api.cancelSubscriptionPaymentMethod(f.admin,salon,attemptId);
  assert.equal(cancelled.cancelled,true);assert.equal(cancelled.expired,false);
  const writes=f.calls.filter(x=>x.post).length;
  for (const result of [await f.complete(),await f.api.cancelSubscriptionPaymentMethod(f.admin,salon,attemptId)]) {
    assert.equal(result.updated,false);assert.equal(result.cancelled,true);assert.equal(result.expired,false);
    assert.equal(result.updatePending,false);assert.equal(result.pending,undefined);
  }
  assert.equal(f.calls.filter(x=>x.post).length,writes);assert.deepEqual(f.state.subscription,before);
});

test('cancel URL after completed Checkout cannot falsely report a cancellation',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';
  const result=await f.api.cancelSubscriptionPaymentMethod(f.admin,salon,attemptId);
  assert.equal(result.cancelled,false);assert.equal(result.updated,true);
  assert.equal(f.calls.some(x=>x.post?.endsWith('/expire')),false);
});

test('concurrent return and webhook completion claim once, with pending response for contender',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';
  const results=await Promise.all([f.complete(),f.complete()]);
  assert.equal(results.filter(x=>x.updated===true).length,1);assert.equal(results.filter(x=>x.pending===true).length,1);
  assert.equal(f.calls.filter(x=>x.post?.startsWith('/subscriptions/')).length,1);
});

test('uncertain applied provider write reconciles read-only instead of replaying it',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';f.state.uncertain=true;
  await assert.rejects(f.complete,/NETWORK_ERROR/);assert.equal(f.state.attempt.status,'processing');
  f.state.leaseActive=false; // Simulate the durable lease expiry, not a new attempt.
  assert.equal((await f.complete()).updated,true);
  const writes=f.calls.filter(x=>x.post?.startsWith('/subscriptions/'));assert.equal(writes.length,1);
});

test('uncertain undelivered write retries inside its durable window with the same provider idempotency key',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';f.state.uncertainBefore=true;
  await assert.rejects(f.complete,/NETWORK_ERROR/);const firstApply=f.state.attempt.first_apply_at;
  assert.ok(firstApply);f.state.leaseActive=false;
  assert.equal((await f.complete()).updated,true);assert.equal(f.state.attempt.first_apply_at,firstApply);
  const writes=f.calls.filter(x=>x.post?.startsWith('/subscriptions/'));assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);
});

test('aged uncertain completion cannot replay a pruned key and overwrite a newer external method',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';f.state.uncertain=true;
  await assert.rejects(f.complete,/NETWORK_ERROR/);
  f.state.attempt.first_apply_at=new Date(Date.now()-25*60*60_000).toISOString();f.state.leaseActive=false;
  f.state.subscription.default_payment_method=card('pm_external_newer','9999');
  const count=f.calls.filter(x=>x.post).length;
  await assert.rejects(f.complete,error=>error.status===409 && /too old/.test(error.message));
  assert.equal(f.calls.filter(x=>x.post).length,count);assert.equal(f.state.subscription.default_payment_method.id,'pm_external_newer');
});

test('aged uncertain completion can reconcile current target read-only without another Stripe write',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';f.state.uncertain=true;
  await assert.rejects(f.complete,/NETWORK_ERROR/);
  f.state.attempt.first_apply_at=new Date(Date.now()-25*60*60_000).toISOString();f.state.leaseActive=false;
  const count=f.calls.filter(x=>x.post).length;
  assert.equal((await f.complete()).updated,true);assert.equal(f.calls.filter(x=>x.post).length,count);
});

for(const ageMinutes of [29,31,61,25*60]) test(`unbound setup aged ${ageMinutes} minutes never sends an invalid or blind creation retry`,async()=>{
  const f=fixture();await f.begin();f.state.attempt.stripe_checkout_session_id=null;f.state.attempt.status='reserved';
  f.state.attempt.created_at=new Date(Date.now()-ageMinutes*60_000).toISOString();
  const count=f.calls.filter(x=>x.post).length;
  await assert.rejects(f.begin,error=>error.status===409 && /support/.test(error.message));
  assert.equal(f.calls.filter(x=>x.post).length,count);
});

test('older setup cannot replace an external method changed before its first apply',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';f.state.subscription.default_payment_method=card('pm_external_newer','9999');
  await assert.rejects(f.complete,error=>error.status===409 && /changed after/.test(error.message));
  assert.equal(f.calls.filter(x=>x.post?.startsWith('/subscriptions/')).length,0);assert.equal(f.state.subscription.default_payment_method.id,'pm_external_newer');
});

test('another salon cannot complete or cancel an owned attempt',async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';
  await assert.rejects(()=>f.api.completeSubscriptionPaymentMethod(f.admin,'cs_owned','33333333-3333-4333-8333-333333333333'),error=>error.status===404);
  await assert.rejects(()=>f.api.cancelSubscriptionPaymentMethod(f.admin,'33333333-3333-4333-8333-333333333333',attemptId),error=>error.status===409);
  assert.equal(f.calls.filter(x=>x.post?.startsWith('/subscriptions/')).length,0);
});

test('attached schedule blocks update creation and late completion without altering schedule',async()=>{
  const f=fixture();f.state.subscription.schedule='sub_sched_unchanged';await assert.rejects(f.begin,error=>error.status===409);assert.equal(f.calls.some(x=>x.post),false);
  f.state.subscription.schedule=null;await f.begin();f.state.session.status='complete';f.state.subscription.schedule='sub_sched_unchanged';
  await assert.rejects(f.complete,error=>error.status===409);assert.equal(f.state.subscription.schedule,'sub_sched_unchanged');assert.equal(f.calls.filter(x=>x.post?.startsWith('/subscriptions/')).length,0);
});

for(const [name,mutate] of [
  ['wrong session customer',s=>s.session.customer='cus_other'],['wrong setup customer',s=>s.setup.customer='cus_other'],
  ['wrong method customer',s=>s.method.customer='cus_other'],['wrong session mode',s=>s.session.mode='payment'],
  ['incomplete setup',s=>s.setup.status='requires_action'],['wrong mode',s=>s.setup.livemode=true],
  ['wrong method mode',s=>s.method.livemode=true],['wrong metadata subscription',s=>s.setup.metadata.subscription_id='sub_other'],
  ['wrong attempt',s=>s.session.metadata.attempt_id='other'],['unexpected charge',s=>s.session.payment_intent='pi_unexpected'],
  ['unexpected subscription',s=>s.session.subscription='sub_unexpected'],['wrong setup identity',s=>s.setup.id='seti_other'],
]) test(`completion rejects ${name} before applying any method`,async()=>{
  const f=fixture();await f.begin();f.state.session.status='complete';mutate(f.state);
  await assert.rejects(f.complete);assert.equal(f.calls.filter(x=>x.post?.startsWith('/subscriptions/')).length,0);
});

test('readback uses subscription default before customer default and masks all other provider fields',async()=>{
  const f=fixture();f.state.subscription.default_payment_method.card.number='4242424242424242';
  const result=await f.api.subscriptionPaymentMethodStatus(f.admin,salon);assert.equal(result.paymentMethod.last4,'4242');
  assert.doesNotMatch(JSON.stringify(result),/4242424242424242|cus_|pm_/);
  f.state.subscription.default_payment_method=null;
  assert.equal((await f.api.subscriptionPaymentMethodStatus(f.admin,salon)).paymentMethod.last4,'1111');
});

test('mismatched provider account or subscription identity cannot create a setup or replacement customer',async()=>{
  const f=fixture();f.state.subscription.customer.id='cus_other';
  await assert.rejects(f.begin,/IDENTITY_CONFLICT/);assert.equal(f.calls.some(x=>x.post),false);
});

test('webhook setup completion uses the dedicated path and never enters booking or new-plan checkout handlers',async()=>{
  const calls=[];
  const admin={rpc:async()=>({data:true,error:null}),from(table){assert.equal(table,'stripe_webhook_events');const q={update(){return q;},eq:async()=>({error:null})};return q;}};
  const event={id:'evt_setup',type:'checkout.session.completed',data:{object:{id:'cs_owned',mode:'setup',metadata:{type:'subscription_payment_method'},livemode:false}}};
  const load=loadNodeTypescript(process.cwd(),{
    '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler,noteOperationalFailure(){}},
    '@/lib/platformErrors':{capturePlatformError:async()=>{throw Error('unexpected incident');}},
    '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin},
    '@/lib/stripeServer':{verifyStripeEvent:()=>event,stripeGet:async()=>{throw Error('Unrelated provider retrieval');}},
    '@/lib/subscriptionPaymentMethodServer':{completeSubscriptionPaymentMethod:async(...args)=>{calls.push(args);return {updated:true};}},
    '@/lib/commerceCheckoutServer':{completeCommerceCheckout:async()=>{throw Error('Unexpected commerce completion');}},
    '@/lib/pickupReservationsServer':{completePickupReservation:async()=>{throw Error('Unexpected pickup completion');}},
  });
  const route=load('src/app/api/stripe/webhook/route.ts');
  assert.equal((await route.POST(new Request('https://fixture.invalid/api/stripe/webhook',{method:'POST',body:'signed-fixture'}))).status,200);
  assert.equal(calls.length,1);assert.equal(calls[0][1],'cs_owned');
  event.type='customer.subscription.updated';event.data={object:{id:subscription,customer,livemode:false,default_payment_method:'pm_new'},previous_attributes:{default_payment_method:'pm_old'}};
  assert.equal((await route.POST(new Request('https://fixture.invalid/api/stripe/webhook',{method:'POST',body:'signed-fixture'}))).status,200);
  assert.equal(calls.length,1,'method-only subscription event does not rewrite plan or schedule');
});

test('portal endpoint derives ownership from auth and returns JSON incident references for forbidden staff',async()=>{
  let owner=false;const calls=[];
  const load=loadNodeTypescript(process.cwd(),{
    '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler},
    '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
    '@/lib/platformErrors':{UserSafeRequestError:SafeError,capturePlatformError:async()=> 'GC-TEST-REFERENCE'},
    '@/lib/supabaseAdmin':{requireSalonOwner:async()=>({admin:{},salon:{id:salon},user:{id:'actor'},isOwner:owner})},
    '@/lib/stripeServer':{stripeFailureDiagnostics:()=>null},
    '@/lib/subscriptionPaymentMethodServer':{
      subscriptionPaymentMethodStatus:async(...args)=>{calls.push(args);return {status:'none',paymentMethod:null,billingMode:'test'};},
      beginSubscriptionPaymentMethod:async(args)=>{calls.push(args);return {url:'https://checkout.stripe.com/c/pay/fixture'};},
    },
  });
  const route=load('src/app/api/stripe/portal/route.ts');
  for(const method of ['GET','POST']) {
    const response=await route[method](new Request('https://fixture.invalid/api/stripe/portal',{method}));
    assert.equal(response.status,403);assert.equal(response.headers.get('x-request-id'),'GC-TEST-REFERENCE');
    assert.equal((await response.json()).request_id,'GC-TEST-REFERENCE');assert.equal(calls.length,0);
  }
  owner=true;
  const response=await route.POST(new Request('https://fixture.invalid/api/stripe/portal',{method:'POST',body:JSON.stringify({customer_id:'cus_foreign',subscription_id:'sub_foreign'})}));
  assert.equal(response.status,200);assert.equal(calls[0].salonId,salon);assert.equal(calls[0].actorId,'actor');
  assert.equal(Object.hasOwn(calls[0],'customer_id'),false);
  const bad=await route.POST(new Request('https://fixture.invalid/api/stripe/portal',{method:'POST',body:'invalid-json'}));
  assert.equal(bad.status,400);assert.equal(bad.headers.get('content-type').includes('application/json'),true);
});
