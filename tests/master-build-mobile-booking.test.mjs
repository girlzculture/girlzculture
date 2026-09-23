import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {travelAddress,totalWithTravel}=load('src/lib/mobileBooking.ts');
const {travelEmailHash,readCheckoutTravelQuote}=load('src/lib/mobileBookingServer.ts');
const id='72000000-0000-4000-8000-000000000001',business={id,service_location_type:'mobile',travel_fee_cents:1500,location_settings_revision:3};
const address={address_street:'100 Sample Avenue',address_line2:'',address_city:'New York',address_state:'NY',address_zip:'10001'};
function fixture(patch={}){const filters=[];return{filters,admin:{from(table){assert.equal(table,'business_travel_quotes');return{select(){return this;},eq(...args){filters.push(args);return this;},maybeSingle:async()=>({data:{id,salon_id:id,customer_id:'customer-a',email_hash:travelEmailHash('customer@example.test'),address,fee_cents:1500,location_revision:3,expires_at:new Date(Date.now()+60000).toISOString(),intent_id:null,...patch},error:null})};}}};}
test('travel destination rejects injected fields, incomplete/oversized addresses and malformed postal data',()=>{
 assert.deepEqual(travelAddress(address),address);
 for(const patch of [{salon_id:'other'},{address_street:''},{address_city:'x'.repeat(101)},{address_state:'New York'},{address_zip:'postcode'},{address_line2:null}])assert.throws(()=>travelAddress({...address,...patch}),/TRAVEL_ADDRESS_INVALID/);
});
test('travel adds to the already discounted service total without changing its deposit or discount basis',()=>{
 assert.equal(totalWithTravel(80,1500),95);assert.equal(totalWithTravel(80.23,1599),96.22);
 for(const fee of [-1,1.5,NaN,100001])assert.throws(()=>totalWithTravel(80,fee),/TRAVEL_TERMS_CHANGED/);
});
test('checkout reads a quote scoped to business and exact customer/email without leaking internal quote fields',async()=>{
 const f=fixture(),q=await readCheckoutTravelQuote(f.admin,business,{service_visit_mode:'mobile',travel_quote_id:id},'customer-a',' CUSTOMER@example.test ');
 assert.deepEqual(f.filters,[['id',id],['salon_id',id]]);assert.deepEqual(Object.keys(q).sort(),['address','expires_at','fee_cents','id']);assert.equal(q.fee_cents,1500);
});
for(const [label,patch,code]of [['foreign customer',{customer_id:'other'},'FORBIDDEN'],['foreign email',{email_hash:travelEmailHash('other@example.test')},'FORBIDDEN'],['expired',{expires_at:new Date(0).toISOString()},'EXPIRED'],['already claimed',{intent_id:'old-intent'},'EXPIRED'],['revised fee',{fee_cents:2000},'TERMS_CHANGED'],['revised radius',{location_revision:4},'TERMS_CHANGED']])test(`checkout rejects ${label} before any reservation`,async()=>{
 const f=fixture(patch);await assert.rejects(()=>readCheckoutTravelQuote(f.admin,business,{service_visit_mode:'mobile',travel_quote_id:id},'customer-a','customer@example.test'),new RegExp(code));
});
test('required mobile quote cannot be bypassed and storefront/demo cannot take a mobile reservation',async()=>{
 const f=fixture();await assert.rejects(()=>readCheckoutTravelQuote(f.admin,business,{},null,''),/ADDRESS_REQUIRED/);
 for(const patch of [{is_demo:true},{service_location_type:'storefront',offers_mobile:false}])await assert.rejects(()=>readCheckoutTravelQuote(f.admin,{...business,...patch},{service_visit_mode:'mobile',travel_quote_id:id},null,''),/NOT_AVAILABLE/);
 assert.equal(await readCheckoutTravelQuote(f.admin,{id,service_location_type:'storefront'},{},null,''),null);
});

function routeFixture({geocodeError,foreign=false,invalidAuth=false}={}){
 const calls=[];const admin={auth:{getUser:async()=>({data:{user:invalidAuth?null:{id:'customer-a'}}})},from(){return{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:foreign?null:{id,is_demo:false,service_location_type:'mobile',status:'Active',is_discoverable:true,accepting_bookings:true}})};},rpc:async(name,args)=>{calls.push({name,args});return{data:{id,address,fee_cents:1500}};}};
 const {POST}=loadNodeTypescript(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin},
  '@/lib/geocodingServer':{geocodeCustomerServiceAddress:async()=>{calls.push('geocode');if(geocodeError)throw Error('secret provider body');return{lat:40.76,lng:-73.98};}},
  '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{},cleanEmail(v){if(!v.includes('@'))throw Error('invalid');return v;}},
  '@/lib/platformErrors':{capturePlatformError:async args=>{assert.equal(args.error.message,'TRAVEL_CHECK_UNAVAILABLE');return'event-fixture';}},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h},
 })('src/app/api/booking/travel-quote/route.ts');
 return{calls,post:()=>POST(new Request('https://example.test/api/booking/travel-quote',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({salon_id:id,guest_email:'customer@example.test',address})}))};
}
test('travel endpoint returns only reviewed quote and passes scoped customer plus validated coordinates to SQL',async()=>{
 const f=routeFixture(),response=await f.post();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.deepEqual(f.calls[1],{name:'create_business_travel_quote',args:{p_salon:id,p_customer:'customer-a',p_email_hash:travelEmailHash('customer@example.test'),p_address:address,p_lat:40.76,p_lng:-73.98}});
 assert.deepEqual(await response.json(),{quote:{id,address,fee_cents:1500}});
});
test('geocoder failure is JSON, secret-safe and uses the exact incident reference with no reservation',async()=>{
 const f=routeFixture({geocodeError:true}),response=await f.post();assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'TRAVEL_CHECK_UNAVAILABLE',request_id:'event-fixture'});assert.equal(response.headers.get('X-Request-ID'),'event-fixture');assert.deepEqual(f.calls,['geocode']);
});
