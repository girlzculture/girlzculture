import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const booking='10000000-0000-4000-8000-000000000001',otherBooking='10000000-0000-4000-8000-000000000002',operation='10000000-0000-4000-8000-000000000003',reference='10000000-0000-4000-8000-000000000004';
function fixture({business='A',owner=true,staffStylist,bookingBusiness=business,bookingStylist='stylist-A',customer='customer-A',actor='customer-A',guest=false,guestBooking=booking,failure,authError}={}){
 const calls=[];
 const incident={id:'incident',booking_id:booking,kind:'no_show',status:'confirmed',evidence:'Fixture verified absence'};
 const admin={auth:{getUser:async()=>({data:{user:actor?{id:actor,email:'verified@example.test',email_confirmed_at:null}:null},error:null})},
  from(table){const filters={};const q={select:()=>q,eq:(key,value)=>{filters[key]=value;return q;},maybeSingle:async()=>{calls.push({table,filters});const data=table==='bookings'?{id:booking,salon_id:bookingBusiness,stylist_id:bookingStylist,customer_id:customer,guest_email:'unverified@example.test'}:incident;return{data:(filters.id&&filters.id!==booking)||(filters.salon_id&&filters.salon_id!==bookingBusiness)?null:data,error:null};}};return q;},
  rpc:async(name,args)=>{calls.push({name,args});return failure?{error:{message:failure}}:{data:{...incident,verified:true,booking_status:'No Show'},error:null};}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin,requireSalonPermission:async()=>{if(authError)throw Error(authError);return{admin,salon:{id:business},user:{id:`owner-${business}`},isOwner:owner,teamMember:owner?null:{stylist_id:staffStylist}};}},
  '@/lib/requestSecurity':{enforceRateLimit(){}},
  '@/lib/platformErrors':{capturePlatformError:async()=>reference},
  '@/lib/guestBookingAccess':{verifyGuestBookingToken:async()=>guest?{bookingId:guestBooking,tokenId:'guest-token'}:null},
  '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_,h)=>h},
 });
 const ownerRoute=load('src/app/api/salon/bookings/[id]/attendance/route.ts'),customerRoute=load('src/app/api/customer/bookings/[id]/attendance/route.ts');
 const ownerBody={request_id:operation,action:'confirm',kind:'no_show',reason:'Verified at this business'};
 const run=(route,body,headers={},id=booking)=>route[body?'POST':'GET'](new Request(`https://fixture.invalid/attendance`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({id})});
 return{calls,ownerBody,owner:(body)=>run(ownerRoute,body),customer:(body,headers={'Authorization':'Bearer fixture'})=>run(customerRoute,body,headers)};
}
test('owner writes derive scope from verified account in each of two businesses',async()=>{
 for(const business of ['A','B']){const f=fixture({business});const response=await f.owner(f.ownerBody);assert.equal(response.status,200);const rpc=f.calls.find(c=>c.name);assert.equal(rpc.args.p_salon,business);assert.equal(rpc.args.p_user,`owner-${business}`);assert.equal(rpc.args.p_booking,booking);assert.equal(rpc.args.p_request,operation);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
test('foreign appointments and another stylist appointment fail before reading incidents or mutation',async()=>{
 for(const options of [{bookingBusiness:'B'},{owner:false,staffStylist:'stylist-B'}]){const f=fixture(options);assert.ok([403,404].includes((await f.owner(f.ownerBody)).status));assert.ok(!f.calls.some(c=>c.name||c.table==='business_booking_incidents'));}
 const f=fixture();assert.equal((await f.owner({...f.ownerBody,salon_id:'B'})).status,400);assert.ok(!f.calls.some(c=>c.name));
});
test('failed attendance confirms preserve structured status and exact protected reference',async()=>{
 for(const [failure,status] of [['INCIDENT_NOT_VERIFIED',409],['INCIDENT_REQUEST_CONFLICT',409],['INCIDENT_ACCESS_DENIED',403]]){const f=fixture({failure});const response=await f.owner(f.ownerBody);const body=await response.json();assert.equal(response.status,status);assert.equal(body.request_id,reference);assert.equal(response.headers.get('x-request-id'),reference);}
 assert.equal((await fixture({authError:'Unauthorized'}).owner()).status,401);
});
test('customer own booking can request review; guessed IDs and unverified email cannot',async()=>{
 const f=fixture();const response=await f.customer({reason:'Please review my arrival'});assert.equal(response.status,200);assert.equal(f.calls.find(c=>c.name).args.p_user,'customer-A');
 const denied=fixture({actor:'customer-B'});assert.equal((await denied.customer()).status,404);assert.ok(!denied.calls.some(c=>c.table==='business_booking_incidents'));
 assert.equal((await f.customer({reason:'Review',customer_id:'customer-B'})).status,400);
});
test('secure guest booking link allows only its one appointment, without an account or typed identity',async()=>{
 const f=fixture({actor:null,guest:true});assert.equal((await f.customer({reason:'I arrived'}, {'X-Guest-Booking-Token':'fixture'})).status,200);const rpc=f.calls.find(c=>c.name);assert.equal(rpc.args.p_user,null);assert.equal(rpc.args.p_guest_token,'guest-token');
 for(const options of [{guest:false},{guest:true,guestBooking:otherBooking}]){const denied=fixture({actor:null,...options});assert.equal((await denied.customer(null,{'X-Guest-Booking-Token':'fixture'})).status,401);assert.equal(denied.calls.length,0);}
});
