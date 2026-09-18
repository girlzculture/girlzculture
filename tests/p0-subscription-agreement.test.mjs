import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {existingAgreementPlan,subscriptionPriceSnapshot,recordedSubscriptionMonthlyAmount}=load('src/lib/subscriptionAgreement.ts');
const at='2026-09-18T21:35:00Z';
const stored={stripe_subscription_id:'sub_old',price_id:'price_old',tier:'Starter'};
const item={quantity:1,price:{id:'price_old',unit_amount:5900,currency:'usd',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}};
const {planFromStripePriceId}=load('src/lib/plans.ts');
test('a retired Starter price is read-only identity, not a new-sale price',()=>{
 const previous=process.env.STRIPE_STARTER_PRICE_ID;
 try {process.env.STRIPE_STARTER_PRICE_ID='price_starter_retired';assert.equal(planFromStripePriceId('price_starter_retired'),'Starter');}
 finally {if(previous===undefined)delete process.env.STRIPE_STARTER_PRICE_ID;else process.env.STRIPE_STARTER_PRICE_ID=previous;}
});
test('new catalog changes cannot reprice or lose a matching old subscription identity',()=>{
 assert.equal(existingAgreementPlan({subscriptionId:'sub_old',priceId:'price_old',configuredPlan:null,stored}),'Starter');
 for(const input of [{subscriptionId:'sub_other',priceId:'price_old'},{subscriptionId:'sub_old',priceId:'price_unrecognized'},{subscriptionId:'sub_old'}])assert.equal(existingAgreementPlan({...input,configuredPlan:null,stored}),null);
 assert.equal(existingAgreementPlan({subscriptionId:'sub_old',priceId:'price_new',configuredPlan:'Growth',stored}),'Growth');
});

test('signed subscription webhook preserves old price facts and rejects an unrelated stored agreement',async()=>{
 async function deliver({previous=stored,price=item.price,salon='business-a',metadataSalon='business-a'}={}){
  const writes=[];const errors=[];
  const admin={
   rpc:async()=>({data:true,error:null}),
   from:table=>{
    const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:previous?{...previous,salon_id:salon}:null,error:null}),
     upsert(value){writes.push({table,value});return Promise.resolve({error:null});},
     update(value){writes.push({table,value});return q;},then(resolve){resolve({error:null});}};
    return q;
   },
  };
  const routeLoad=loadNodeTypescript(process.cwd(),{
   '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,handler)=>handler,noteOperationalFailure:()=>{}},
   '@/lib/platformErrors':{capturePlatformError:async({error})=>{errors.push(error.message);return 'safe-fixture-reference';}},
   '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,deliverBookingNotifications:async()=>{}},
   '@/lib/stripeServer':{
    verifyStripeEvent:()=>({
     id:'evt_fixture',type:'customer.subscription.created',
     data:{object:{id:'sub_old',customer:'cus_fixture',metadata:{salon_id:metadataSalon},status:'active',items:{data:[{...item,price}]}}},
    }),
    stripeGet:async()=>{throw new Error('Unexpected provider request');},
   },
   '@/lib/commerceCheckoutServer':{completeCommerceCheckout:async()=>{}},
   '@/lib/pickupReservationsServer':{completePickupReservation:async()=>{}},
  });
  const response=await routeLoad('src/app/api/stripe/webhook/route.ts').POST(new Request('https://fixture.test/api/stripe/webhook',{method:'POST',body:'fixture'}));
  return {response,writes,errors};
 }
 const old=await deliver();assert.equal(old.response.status,200);
 const saved=old.writes.find(row=>row.table==='subscriptions').value;
 assert.equal(saved.price_id,'price_old');assert.equal(saved.tier,'Starter');assert.equal(saved.recurring_price_snapshot.amount_cents,5900);
 assert.equal(saved.recurring_price_snapshot.price_id,'price_old');
 for(const input of [{previous:{...stored,stripe_subscription_id:'sub_other'}},{price:{...item.price,id:'price_unknown'}},{metadataSalon:'business-b'}]){
  const denied=await deliver(input);assert.equal(denied.response.status,500);
  assert.equal(denied.writes.some(row=>row.table==='subscriptions'),false);
  assert.match(denied.response.headers.get('content-type'),/application\/json/);
  assert.deepEqual(await denied.response.json(),{error:'Webhook processing failed'});
 }
});
test('recorded monthly amount comes from the provider agreement, never the latest tier price',()=>{
 const snapshot=subscriptionPriceSnapshot([item],at);
 assert.equal(recordedSubscriptionMonthlyAmount({...stored,recurring_price_snapshot:snapshot}),59);
 assert.equal(recordedSubscriptionMonthlyAmount({...stored,tier:'Premium',recurring_price_snapshot:snapshot}),59);
 assert.equal(recordedSubscriptionMonthlyAmount(stored),null);
 assert.equal(recordedSubscriptionMonthlyAmount({...stored,price_id:'price_replaced',recurring_price_snapshot:snapshot}),null);
 assert.equal(recordedSubscriptionMonthlyAmount({...stored,recurring_price_snapshot:{...snapshot,observed_at:''}}),null);
 assert.equal(recordedSubscriptionMonthlyAmount({...stored,recurring_price_snapshot:{...snapshot,amount_cents:null}}),null);
});
test('unsupported or incomplete provider prices stay unknown rather than inventing a billing amount',()=>{
 assert.equal(subscriptionPriceSnapshot([item,item],at),null);
 for(const changed of [{quantity:2},{price:{...item.price,recurring:{...item.price.recurring,usage_type:'metered'}}},{price:{...item.price,recurring:{...item.price.recurring,usage_type:undefined}}},{quantity:undefined},{price:{...item.price,unit_amount:null}},{price:{...item.price,unit_amount:-1}},{price:{...item.price,currency:'eur'}},{price:{...item.price,recurring:{interval:'year',interval_count:1}}}])assert.equal(subscriptionPriceSnapshot([{...item,...changed}],at),null);
 assert.equal(subscriptionPriceSnapshot([item],'invalid'),null);
 assert.equal(subscriptionPriceSnapshot([{...item,price:{...item.price,unit_amount:0}}],at).amount_cents,0);
});
