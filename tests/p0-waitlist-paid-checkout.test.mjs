import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';

test('verified paid waitlist checkout links the booking to its atomic claim and remains idempotent',async()=>{
 const writes=[],events=[];let bookingId=null;
 const intent={id:'intent-fixture',status:'Pending',stripe_checkout_session_id:'cs_fixture',deposit_amount:10,payload:{salon_id:'business-a',customer_id:'customer-a',waitlist_offer_id:'offer-a',estimated_total:100,deposit_amount:10,balance_due:90}};
 const admin={rpc:async(name)=>{events.push(name);return {data:true,error:null};},from(table){
  const q={select(){return q;},eq(){return q;},update(value){writes.push({table,value});if(table==='booking_checkout_intents')Object.assign(intent,value);return q;},insert(value){writes.push({table,value});bookingId='booking-fixture';return q;},single:async()=>({data:table==='booking_checkout_intents'?intent:{id:bookingId},error:null}),maybeSingle:async()=>({data:bookingId?{id:bookingId}:null,error:null}),then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}};return q;
 }};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h,noteOperationalFailure(){}},
  '@/lib/platformErrors':{capturePlatformError:async()=>{throw Error('Unexpected incident');}},
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,deliverBookingNotifications:async(id)=>{events.push(['notify',id]);}},
  '@/lib/stripeServer':{verifyStripeEvent:()=>({id:'evt_fixture',type:'checkout.session.completed',data:{object:{id:'cs_fixture',mode:'payment',payment_status:'paid',payment_intent:'pi_fixture',metadata:{type:'booking_deposit',booking_intent_id:intent.id},livemode:false}}}),stripeGet:async(path)=>{
   if(path.startsWith('/checkout/sessions/'))return {id:'cs_fixture',discounts:[]};
   assert.equal(path,'/payment_intents/pi_fixture?expand[]=latest_charge.balance_transaction');return {latest_charge:{id:'ch_fixture',transfer:'tr_fixture',balance_transaction:{fee:60,net:940},payment_method_details:{card:{brand:'visa',last4:'4242'}}}};
  }},
  '@/lib/commerceCheckoutServer':{completeCommerceCheckout:async()=>{}},
  '@/lib/pickupReservationsServer':{completePickupReservation:async()=>{}},
 });
 const route=load('src/app/api/stripe/webhook/route.ts');
 const deliver=()=>route.POST(new Request('https://fixture.invalid/api/stripe/webhook',{method:'POST',body:'signed-test-fixture'}));
 const first=await deliver();assert.equal(first.status,200,JSON.stringify(await first.json()));
 const booking=writes.find(x=>x.table==='bookings').value;
 assert.equal(booking.waitlist_offer_id,'offer-a');assert.equal(booking.origin_checkout_intent_id,intent.id);
 assert.equal(booking.balance_due,90);assert.equal(booking.deposit_amount,10);assert.equal(booking.stripe_payment_id,'pi_fixture');
 assert.equal(intent.status,'Paid');assert.equal(intent.booking_id,'booking-fixture');
 assert.equal((await deliver()).status,200);assert.equal(writes.filter(x=>x.table==='bookings').length,1);
});
