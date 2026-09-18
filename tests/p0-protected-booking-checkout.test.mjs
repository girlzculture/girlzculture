import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const salon='71000000-0000-4000-8000-000000000001',style='71000000-0000-4000-8000-000000000002',offerId='71000000-0000-4000-8000-000000000003',intent='71000000-0000-4000-8000-000000000004';
const at=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
function fixture({offer=true,value=20,rate=10,threshold=null,customer=null,claimError=null}={}){
 const stripe=[],reservations=[],events=[],bookings=[];
 const rows={salons:{id:salon,slug:'fixture',name:'Business A',status:'Active',is_discoverable:true,subscription_status:'active',subscription_tier:'Premium',time_zone:'UTC',stripe_account_id:'acct_fixture'},styles:{id:style,salon_id:salon,name:'Braids',base_price:100,duration_min_hours:1},supported_locales:{locale:'en'},salon_promotions:{id:offerId,salon_id:salon,status:'Active',is_active:true,target_scope:'salon',promotion_type:'percentage',discount_value:value},business_deposit_rules:{id:'rule-A',salon_id:salon,rate,threshold_amount:threshold,threshold_rate:threshold===null?null:40,repeat_incident_count:null,repeat_incident_rate:null,incident_window_days:365},booking_checkout_intents:{id:intent},promo_codes:{id:'code-A',code:'GC20',is_active:true,applies_to:'booking',discount_type:'percent',discount_value:20,stripe_coupon_id:'coupon_NOT_APPLIED',usage_limit:null}};
 const admin={auth:{getUser:async()=>({data:{user:customer?{id:customer}:null}})},from(table){assert.ok(table==='bookings'||Object.hasOwn(rows,table)||['salon_promotion_redemptions','promo_code_redemptions'].includes(table),table);const q={insert:(payload)=>{bookings.push(payload);return q;}};for(const method of ['select','eq','is','ilike','limit','order','gt','update'])q[method]=(...args)=>{events.push([table,method,args]);return q;};const result=()=>({data:table==='bookings'?{id:'confirmed-fixture',...bookings.at(-1)}:rows[table]||null,error:null,count:0});q.single=q.maybeSingle=async()=>result();q.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);return q;},async rpc(name,args){events.push([name,args]);if(name==='reserve_booking_checkout'){reservations.push(args);return{data:claimError?null:intent,error:claimError?{message:claimError}:null};}if(name==='reserve_salon_promotion')return{data:'redemption-A',error:null};if(name==='redeem_salon_promotion')return{data:true,error:null};if(name==='reserve_promo_code')return{data:{promo_code_id:'code-A',redemption_id:'code-redemption',code:'GC20',discount_type:'percent',discount_value:20,stripe_coupon_id:'coupon_NOT_APPLIED'},error:null};throw Error(name);}};
 const load=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,deliverBookingNotifications:async()=>({})},
  '@/lib/requestSecurity':{enforceRateLimit(){},rejectBot(){},cleanText:v=>String(v||'').trim(),cleanEmail:v=>v,cleanUsPhone:v=>v,errorResponse:error=>Response.json({error:error.message},{status:400})},
  '@/lib/operationalMonitoring':{withOperationalMonitoring:(_p,h)=>h,routeMonitoringProfile:()=>({}),noteOperationalFailure(){}},
  '@/lib/platformErrors':{capturePlatformError:async()=>{throw Error('Unexpected incident');}},
  '@/lib/businessPolicyServer':{currentBusinessPolicy:async()=>null},
  '@/lib/marketplaceEligibilityServer':{rejectRegisteredTestCheckout:async()=>null},
  '@/lib/engineConfigServer':{getEngineNumber:async(_key,value)=>value},
  '@/lib/bookingAvailabilityServer':{bookingAvailability:async()=>({slots:[{value:'13:00',stylistId:null}],bufferMinutes:15})},
  '@/lib/stripeServer':{siteUrl:()=> 'https://fixture.invalid',stripeRequest:async(path,body,options)=>{stripe.push({path,body,options});return{id:'cs_fixture',url:'https://checkout.invalid/session'};}},
 });
 const route=load('src/app/api/stripe/booking-checkout/route.ts');
 const body={salon_id:salon,style_id:style,guest_name:'Test customer',guest_email:'test@example.test',guest_phone:'3055550123',appointment_local:at+'T13:00',platform_policy_acknowledged:true,business_policy_revision_id:null,salon_promotion_id:offer?offerId:null,expected_deposit:rate,expected_total:80};
 return {stripe,reservations,events,bookings,body,post:patch=>route.POST(new Request('https://fixture.invalid/api/stripe/booking-checkout',{method:'POST',headers:customer?{Authorization:'Bearer fixture'}:{},body:JSON.stringify({...body,...patch})}))};
}

test('checkout preserves $10 deposit on $100 less 20%, snapshots $70 balance and cannot apply Stripe coupons',async()=>{
 const f=fixture();const response=await f.post();const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
 assert.equal(data.deposit,10);assert.equal(data.total,80);assert.equal(f.reservations.length,1);
 const payload=f.reservations[0].p_payload;assert.equal(payload.subtotal_before_promotion,100);assert.equal(payload.deposit_rule_snapshot.deposit,10);assert.equal(payload.promotion_discount_amount,20);assert.equal(payload.balance_due,70);
 assert.equal(f.stripe.length,1);assert.equal(f.stripe[0].body['line_items[0][price_data][unit_amount]'],1000);assert.equal(f.stripe[0].body.allow_promotion_codes,false);assert.ok(!Object.keys(f.stripe[0].body).some(k=>k.startsWith('discounts[')));
 assert.equal(f.stripe[0].body['payment_intent_data[transfer_data][destination]'],'acct_fixture');assert.ok(!Object.keys(f.stripe[0].body).some(k=>k.includes('application_fee')));
});
test('full-price promotion caps savings at protected deposit instead of creating a zero-payment booking',async()=>{
 const f=fixture({value:100});const response=await f.post({expected_total:10});assert.equal(response.status,200);const data=await response.json();assert.equal(data.salonPromotionDiscount,90);assert.equal(data.deposit,10);assert.equal(f.reservations[0].p_payload.balance_due,0);assert.equal(f.stripe.length,1);
});
test('a genuinely zero-deposit booking retains its price snapshot and real booking status without charging Stripe',async()=>{
 const f=fixture({rate:0});const response=await f.post({expected_deposit:0});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.noPaymentRequired,true);assert.equal(body.testMode,false);assert.equal(f.stripe.length,0);assert.equal(f.bookings.length,1);assert.equal(f.bookings[0].payment_mode,'live');assert.equal(f.bookings[0].origin_checkout_intent_id,intent);assert.equal(f.bookings[0].deposit_rule_snapshot.deposit,0);assert.equal(f.bookings[0].balance_due,80);
});
test('changed owner threshold or missing reviewed prices require review before any reservation or Stripe request',async()=>{
 for(const patch of [{expected_deposit:20},{expected_total:undefined}]){const f=fixture({rate:20,threshold:50});const response=await f.post(patch);assert.equal(response.status,409);const data=await response.json();assert.equal(data.code,'BOOKING_PRICE_CHANGED');assert.equal(data.deposit_terms.deposit,40);assert.equal(f.reservations.length,0);assert.equal(f.stripe.length,0);}
});
test('booking code reduces service balance once and cannot stack with a business offer',async()=>{
 const f=fixture({offer:false});const response=await f.post({promo_code:'GC20'});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.discount,20);assert.equal(data.deposit,10);assert.equal(f.reservations[0].p_payload.balance_due,70);assert.equal(f.stripe[0].body['line_items[0][price_data][unit_amount]'],1000);assert.equal(f.stripe[0].body.allow_promotion_codes,false);assert.ok(!Object.keys(f.stripe[0].body).some(k=>k.startsWith('discounts[')));
 const stacked=fixture();const rejected=await stacked.post({promo_code:'GC20'});assert.equal(rejected.status,400);assert.equal(stacked.reservations.length,0);assert.equal(stacked.stripe.length,0);
});

test('waitlist claims require authenticated customer, a valid offer and reviewed current terms before payment',async()=>{
 const customer='71000000-0000-4000-8000-000000000005';
 for(const [options,patch,status]of [[{},{waitlist_offer_id:offerId},403],[{customer},{waitlist_offer_id:'-'.repeat(36)},403],[{customer},{waitlist_offer_id:offerId,platform_policy_acknowledged:false},400],[{customer},{waitlist_offer_id:offerId,expected_deposit:11},409],[{customer,claimError:'WAITLIST_OFFER_UNAVAILABLE'},{waitlist_offer_id:offerId},409]]){
  const f=fixture(options),res=await f.post(patch);assert.equal(res.status,status,JSON.stringify(await res.json()));assert.equal(f.stripe.length,0);
 }
 const accepted=fixture({customer});assert.equal((await accepted.post({waitlist_offer_id:offerId})).status,200);assert.equal(accepted.reservations[0].p_payload.waitlist_offer_id,offerId);assert.equal(accepted.reservations[0].p_customer_id,customer);assert.equal(accepted.stripe.length,1);
});
