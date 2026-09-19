import test from 'node:test';
import assert from 'node:assert/strict';
import {configuration,assertAssociation,assertNoFanout,digest,assertCreate,safeSummary} from './billing-sandbox-guards.mjs';
const env={STRIPE_SANDBOX_SECRET_KEY:'sk_test_placeholder',BILLING_SANDBOX_ACCOUNT_ID:'acct_fixture',BILLING_SANDBOX_CUSTOMER_ID:'cus_fixture',BILLING_SANDBOX_SUBSCRIPTION_ID:'sub_fixture',BILLING_SANDBOX_APPROVED_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40),GITHUB_REPOSITORY:'girlzculture/girlzculture',GITHUB_EVENT_NAME:'workflow_dispatch'};
const facts={account:{id:'acct_fixture'},customer:{id:'cus_fixture',livemode:false},subscription:{id:'sub_fixture',customer:'cus_fixture',livemode:false}};
test('missing/live keys, another commit/repository/event and unsupported update mode fail closed',()=>{
 for(const change of [{STRIPE_SANDBOX_SECRET_KEY:''},{STRIPE_SANDBOX_SECRET_KEY:'sk_live_placeholder'},{STRIPE_SANDBOX_SECRET_KEY:'rk_live_placeholder'},{GITHUB_SHA:'b'.repeat(40)},{GITHUB_REPOSITORY:'fork/other'},{GITHUB_EVENT_NAME:'pull_request'},{BILLING_SANDBOX_MODE:'setup-update'}]) assert.throws(()=>configuration({...env,...change}));
 assert.equal(configuration(env).mode,'read-only');
});
test('provider account, customer, subscription and test-mode associations must all match',()=>{
 const config=configuration(env);assert.doesNotThrow(()=>assertAssociation(config,facts));
 for(const change of [{account:{id:'acct_other'}},{customer:{id:'cus_fixture',livemode:true}},{customer:{id:'cus_fixture',livemode:false,deleted:true}},{subscription:{id:'sub_fixture',customer:'cus_other',livemode:false}},{subscription:{id:'sub_fixture',customer:'cus_fixture',livemode:true}}])assert.throws(()=>assertAssociation(config,{...facts,...change}));
});
test('setup cancellation needs both mutation approval and reviewed event routing',()=>{
 assert.throws(()=>configuration({...env,BILLING_SANDBOX_MODE:'setup-cancel'}));
 assert.equal(configuration({...env,BILLING_SANDBOX_MODE:'setup-cancel',BILLING_SANDBOX_AUTHORIZE_SETUP_CANCEL:'true',BILLING_SANDBOX_EVENT_ROUTING_REVIEWED:'true'}).mode,'setup-cancel');
});
test('relevant webhook fanout and incomplete inventories block writes',()=>{
 assert.doesNotThrow(()=>assertNoFanout({data:[],has_more:false}));
 for(const events of [['*'],['checkout.session.expired'],['setup_intent.created']])assert.throws(()=>assertNoFanout({data:[{status:'enabled',enabled_events:events}],has_more:false}));
 assert.throws(()=>assertNoFanout({data:[],has_more:true}));
 assert.doesNotThrow(()=>assertNoFanout({data:[{status:'disabled',enabled_events:['*']}],has_more:false}));
});
test('before/after digest preserves all commercial fields regardless of key order',()=>{
 assert.equal(digest({items:[{price:'old',quantity:1}],schedule:'same'}),digest({schedule:'same',items:[{quantity:1,price:'old'}]}));
 assert.notEqual(digest({items:[{price:'old',quantity:1}]}),digest({items:[{price:'old',quantity:2}]}));
});
test('the only creation payload is existing-customer setup, never charge/subscription/line items',()=>{
 const config={...configuration(env),mode:'setup-cancel'};
 const values={mode:'setup',customer:config.customer,'payment_method_types[0]':'card','setup_intent_data[usage]':'off_session',success_url:'http://127.0.0.1:3199/salon/dashboard/subscription?payment_method_session={CHECKOUT_SESSION_ID}',cancel_url:'http://127.0.0.1:3199/salon/dashboard/subscription?payment_method_cancel=fixture',expires_at:9999999999};
 for(const [key,value] of Object.entries({type:'subscription_payment_method',attempt_id:'fixture',salon_id:'fixture',subscription_id:config.subscription})) {values[`metadata[${key}]`]=value;values[`setup_intent_data[metadata][${key}]`]=value;}
 assert.doesNotThrow(()=>assertCreate(config,values));
 for(const changes of [{mode:'payment'},{customer:'cus_other'},{'line_items[0][price]':'price_any'},{'subscription_data[trial_period_days]':1},{success_url:'https://external.invalid/'}])assert.throws(()=>assertCreate(config,{...values,...changes}));
 assert.throws(()=>assertCreate(configuration(env),values));
});
test('unexpected provider/SQL errors cannot expose message, request URL or secret',()=>{
 assert.equal(safeSummary(new Error('secret and private provider message')),'SANDBOX_VERIFICATION_FAILED');
});
