import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localDatabase,localAdmin,sqlLiteral as literal } from './billing-sandbox-local.mjs';
import { loadNodeTypescript } from '../tests/helpers/load-node-typescript.mjs';

// Explicit integration command only. Missing database configuration fails; this
// file is not silently skipped or part of the database-free p0 test glob.
assert.ok(process.env.BILLING_SANDBOX_TEST_DATABASE,'BILLING_SANDBOX_TEST_DATABASE must name a disposable local schema clone');
const run=localDatabase({database:process.env.BILLING_SANDBOX_TEST_DATABASE,port:Number(process.env.BILLING_SANDBOX_TEST_PORT||5432),psql:process.env.PSQL_BIN||'psql'});
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('External network is forbidden in the simulated-provider database checks');};
after(()=>{globalThis.fetch=originalFetch;});

test('local adapter rejects unapproved databases and ignores inherited libpq routing and service settings',()=>{
  assert.throws(()=>localDatabase({database:'postgres'}),/LOCAL_FIXTURE_DATABASE_REQUIRED/);
  const previous={PGHOSTADDR:process.env.PGHOSTADDR,PGSERVICE:process.env.PGSERVICE,PGOPTIONS:process.env.PGOPTIONS};
  try {
    Object.assign(process.env,{PGHOSTADDR:'127.0.0.2',PGSERVICE:'not-an-allowed-service',PGOPTIONS:'-c default_transaction_read_only=on'});
    const clean=localDatabase({database:process.env.BILLING_SANDBOX_TEST_DATABASE,port:Number(process.env.BILLING_SANDBOX_TEST_PORT||5432),psql:process.env.PSQL_BIN||'psql'});
    assert.equal(clean("select current_setting('default_transaction_read_only');"),'off');
  } finally {for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

function fixture({loseCreationResponse=false}={}) {
  const actor=randomUUID(),business=randomUUID(),suffix=business.replaceAll('-','');
  const customer=`cus_fixture${suffix}`,subscription=`sub_fixture${suffix}`,sessionId=`cs_test_fixture${suffix}`;
  const email=`billing-adapter-${actor}@example.test`;
  run(`begin;insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(${literal(actor)},${literal(email)},'',now(),'{"role":"salon_owner"}');insert into public.salons(id,user_id,email,name,slug,status) values(${literal(business)},${literal(actor)},${literal(email)},'Adapter fixture',${literal('billing-adapter-'+business)},'Pending');insert into public.subscriptions(salon_id,tier,status,stripe_customer_id,stripe_subscription_id) values(${literal(business)},'Premium','active',${literal(customer)},${literal(subscription)});commit;`);
  const original=JSON.parse(run(`select to_jsonb(s) from public.subscriptions s where salon_id=${literal(business)};`));
  const method={id:`pm_old${suffix}`,customer,livemode:false,type:'card',card:{brand:'visa',last4:'4242',exp_month:12,exp_year:2034}};
  const state={session:null,posts:[],creationLost:false};
  const provider={siteUrl:()=> 'http://127.0.0.1:3199',
    async stripeGet(path){
      if(path.startsWith(`/subscriptions/${subscription}?`))return {id:subscription,customer:{id:customer,livemode:false},status:'active',livemode:false,default_payment_method:method,schedule:null};
      if(path===`/checkout/sessions/${sessionId}`)return structuredClone(state.session);
      throw Error('Unexpected simulated provider read');
    },
    async stripeRequest(path,values,options){
      state.posts.push({path,values:structuredClone(values),key:options?.idempotencyKey});
      if(path==='/checkout/sessions') {
        assert.equal(values.mode,'setup');assert.equal(values.customer,customer);
        assert.ok(!Object.keys(values).some(key=>/line_items|subscription_data|payment_intent_data/.test(key)));
        state.session??={id:sessionId,mode:'setup',status:'open',customer,livemode:false,url:`https://checkout.stripe.com/c/pay/${sessionId}`,subscription:null,payment_intent:null,
          metadata:{type:values['metadata[type]'],attempt_id:values['metadata[attempt_id]'],salon_id:values['metadata[salon_id]'],subscription_id:values['metadata[subscription_id]']}};
        if(loseCreationResponse&&!state.creationLost){state.creationLost=true;throw Error('Simulated lost creation response');}
        return structuredClone(state.session);
      }
      assert.equal(path,`/checkout/sessions/${sessionId}/expire`);assert.deepEqual(values,{});
      state.session.status='expired';return structuredClone(state.session);
    }};
  const api=loadNodeTypescript(process.cwd(),{'@/lib/stripeServer':provider})('src/lib/subscriptionPaymentMethodServer.ts');
  const admin=localAdmin(run);
  const begin=()=>api.beginSubscriptionPaymentMethod({admin:localAdmin(run),salonId:business,actorId:actor,request:new Request('http://127.0.0.1:3199/api/stripe/portal')});
  const attempts=()=>JSON.parse(run(`select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.subscription_payment_method_attempts a where salon_id=${literal(business)};`));
  const unchanged=()=>assert.deepEqual(JSON.parse(run(`select to_jsonb(s) from public.subscriptions s where salon_id=${literal(business)};`)),original);
  return {api,admin,actor,business,sessionId,state,begin,attempts,unchanged};
}

test('actual local PostgreSQL attempts support begin, new-client resume, cancellation and terminal replay',async()=>{
  const f=fixture();const first=await f.begin();const second=await f.begin();
  assert.equal(first.attemptId,second.attemptId);assert.equal(f.state.posts.length,1);
  assert.equal(f.attempts().length,1);assert.equal(f.attempts()[0].status,'open');
  const cancelled=await f.api.cancelSubscriptionPaymentMethod(f.admin,f.business,first.attemptId);
  assert.equal(cancelled.cancelled,true);assert.equal(cancelled.updated,false);assert.equal(cancelled.expired,false);
  assert.equal(f.attempts()[0].status,'cancelled');assert.equal(f.attempts()[0].lease_id,null);
  const replay=await f.api.cancelSubscriptionPaymentMethod(localAdmin(run),f.business,first.attemptId);
  assert.equal(replay.cancelled,true);assert.equal(f.state.posts.length,2);f.unchanged();
});

test('actual durable unbound attempt survives response loss and uses the identical setup idempotency request',async()=>{
  const f=fixture({loseCreationResponse:true});await assert.rejects(f.begin,/Simulated lost creation response/);
  const reserved=f.attempts()[0];assert.equal(reserved.status,'reserved');assert.equal(reserved.stripe_checkout_session_id,null);
  const begun=await f.begin();assert.equal(begun.attemptId,reserved.id);assert.deepEqual(f.state.posts[0],f.state.posts[1]);
  await f.api.cancelSubscriptionPaymentMethod(f.admin,f.business,begun.attemptId);assert.equal(f.attempts()[0].status,'cancelled');f.unchanged();
});

test('actual expiry webhook state is read-only and terminal on both browser return routes',async()=>{
  const f=fixture();const begun=await f.begin();f.state.session.status='expired';
  const webhook=await f.api.completeSubscriptionPaymentMethod(f.admin,f.sessionId);
  assert.equal(webhook.expired,true);assert.equal(f.attempts()[0].status,'expired');
  for(const result of [await f.api.completeSubscriptionPaymentMethod(localAdmin(run),f.sessionId,f.business),await f.api.cancelSubscriptionPaymentMethod(localAdmin(run),f.business,begun.attemptId)]) {
    assert.equal(result.expired,true);assert.equal(result.updated,false);assert.equal(result.cancelled,false);
  }
  assert.equal(f.state.posts.length,1);f.unchanged();
});

test('actual service-role RPC rejects owner transfer and foreign business without another provider mutation',async()=>{
  const f=fixture();const begun=await f.begin();
  await assert.rejects(()=>f.api.cancelSubscriptionPaymentMethod(f.admin,randomUUID(),begun.attemptId));
  const replacement=randomUUID(),email=`billing-adapter-${replacement}@example.test`;
  run(`begin;insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(${literal(replacement)},${literal(email)},'',now(),'{"role":"salon_owner"}');update public.salons set user_id=${literal(replacement)},email=${literal(email)} where id=${literal(f.business)};commit;`);
  await assert.rejects(()=>f.api.cancelSubscriptionPaymentMethod(f.admin,f.business,begun.attemptId),/LOCAL_DATABASE_OPERATION_FAILED/);
  assert.equal(f.state.posts.length,1);assert.equal(f.attempts()[0].status,'open');f.unchanged();
});
