import test from 'node:test';
// Included by the required test:p0:core workflow glob.
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

const req = '77000000-0000-4000-8000-000000000001';
function fixture(overrides = {}) {
  const reads=[], calls=[], delivered=[];
  const booking={id:'booking-a',salon_id:'business-a',style_id:'service-a',stylist_id:'professional-a',appointment_datetime:'2099-06-10T14:00:00.000Z',duration_hours:3,buffer_minutes:30,status:'Confirmed',...overrides.booking};
  const admin={from(table){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:{id:'proposal-a',status:'Pending',expires_at:'2099-06-11T14:00:00Z'},error:null})};return q;},rpc:async(name,input)=>{calls.push({name,input});return {data:'proposal-a',error:null};}};
  const load=typescriptLoader(process.cwd(),{
    '@/lib/nonDomVisualTokens.mjs':{NON_DOM_VISUAL_TOKENS:{}},
    '@/lib/bookingAvailabilityServer':{bookingAvailability:async input=>{reads.push(input);return {durationMinutes:60,slots:[{value:'10:00',stylistId:'professional-b',stylistName:'Original professional name'}]};}},
    '@/lib/guestBookingAccess':{issueGuestBookingToken:async()=>({url:'https://example.test/manage?token=fixture'})},
    '@/lib/supabaseAdmin':{sendEmail:async()=>{},sendSms:async()=>{},bookingDeliveryChannels:async()=>new Set(['email']),runDeliveries:async(...input)=>{delivered.push(input);return [];}},
    '@/lib/webPushServer':{sendPushToUsers:async()=>{}},
    '@/lib/platformErrors':{capturePlatformError:async()=> 'fixture-incident'},
    '@/lib/requestSecurity':{cleanText:(v,max)=>String(v||'').trim().slice(0,max)},
  },{Error});
  return {reads,calls,delivered,run:input=>load('src/lib/bookingRescheduleServer.ts').createCustomerApprovedReschedule({admin,booking,salon:{id:'business-a',name:'Original business name',time_zone:'America/New_York'},actorUserId:'owner-a',actorRole:'Salon owner',reason:'Same time, another professional',message:'Original customer message',localOptions:[{local:'2099-06-10T10:00',stylistId:'professional-b'}],rootUrl:'https://example.test',requestId:req,changeKind:'substitution',...input})};
}
test('professional substitution preserves the booked duration and buffer, not the edited catalog duration',async()=>{
  const f=fixture();await f.run();assert.equal(f.reads[0].durationMinutes,180);assert.equal(f.reads[0].bufferMinutes,30);
  assert.equal(f.calls[0].input.p_options[0].duration_hours,3);assert.equal(f.calls[0].input.p_request_id,req);
});
test('substitution cannot silently change time or keep the original professional',async()=>{
  for(const localOptions of [[{local:'2099-06-11T10:00',stylistId:'professional-b'}],[{local:'2099-06-10T10:00',stylistId:'professional-a'}]]){
    const f=fixture();await assert.rejects(f.run({localOptions}),/Choose another professional at the current appointment time/);assert.equal(f.calls.length,0);
  }
});
test('invalid duration and changed professional cannot create a proposal or notification',async()=>{
  const f=fixture({booking:{duration_hours:0}});await assert.rejects(f.run(),/booking duration/);assert.equal(f.calls.length,0);assert.equal(f.delivered.length,0);
});

test('proposal API scopes the booking before action and shows only eligible same-time substitutes',async()=>{
 const {rescheduleLocalTimestamp}=typescriptLoader(process.cwd())('src/lib/bookingRescheduleCore.ts');
 assert.equal(rescheduleLocalTimestamp('2030-01-01T03:00:00Z','America/New_York'),'2029-12-31T22:00');
 const calls=[];const rows=[{id:'own',salon_id:'business-a',stylist_id:'one',appointment_datetime:'2099-06-10T14:00:00Z',duration_hours:3,status:'Confirmed'},{id:'foreign',salon_id:'business-b'}];
 const admin={from(){const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle:async()=>({data:rows.find(row=>filters.every(([k,v])=>row[k]===v))||null,error:null})};return q;}};
 const load=typescriptLoader(process.cwd(),{
  '@/lib/bookingRescheduleServer':{createCustomerApprovedReschedule:async input=>{calls.push(input);return {proposal:{id:'one'}};}},
  '@/lib/bookingAvailabilityServer':{bookingAvailability:async()=>({slots:[{value:'10:00',stylistId:'one'},{value:'10:00',stylistId:'two'},{value:'11:00',stylistId:'two'}]})},
  '@/lib/supabaseAdmin':{requireSalonPermission:async()=>({admin,user:{id:'owner-a'},salon:{id:'business-a',time_zone:'America/New_York'},isOwner:true})},
  '@/lib/requestSecurity':{enforceRateLimit(){},publicErrorResponse:()=>Response.json({code:'ERROR'},{status:500})},
  '@/lib/operationalMonitoring':{withOperationalMonitoring:(_profile,handler)=>handler,routeMonitoringProfile(){},noteOperationalFailure(){}},
 },{Error});
 const route=load('src/app/api/salon/bookings/[id]/reschedule/route.ts');
 const get=await route.GET(new Request('http://localhost/api/salon/bookings/own/reschedule?date=2099-06-10&kind=substitution'),{params:Promise.resolve({id:'own'})});
 assert.deepEqual((await get.json()).slots,[{value:'10:00',stylistId:'two'}]);
 const post=id=>route.POST(new Request('http://localhost/api/salon/bookings/'+id+'/reschedule',{method:'POST',body:JSON.stringify({client_request_id:req,change_kind:'substitution',reason:'Original reason'})}),{params:Promise.resolve({id})});
 assert.equal((await post('foreign')).status,400);assert.equal(calls.length,0);
 assert.equal((await post('own')).status,201);assert.equal(calls[0].booking.id,'own');assert.equal(calls[0].requestId,req);
});

test('notification retries reconstruct the same signed management link without exposing or rotating it',async()=>{
 let saved;let claims=0;
 const admin={from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:null,error:null})};return q;},rpc:async(name,input)=>{assert.equal(name,'claim_booking_communication_token');claims++;saved||={id:input.p_id,expires_at:input.p_expires,token_hash:input.p_hash};return {data:saved,error:null};}};
 const load=typescriptLoader(process.cwd(),{'@/lib/requestSecurity':{clientAddress:()=>''}},{process:{env:{GUEST_BOOKING_LINK_SECRET:'isolated-fixture-signing-secret-never-production'}},Error});
 const {issueGuestBookingToken}=load('src/lib/guestBookingAccess.ts');
 const {parseGuestToken}=load('src/lib/guestBookingTokenCore.ts');
 const first=await issueGuestBookingToken(admin,req,{rootUrl:'https://example.test',reuseActive:true});const second=await issueGuestBookingToken(admin,req,{rootUrl:'https://example.test',reuseActive:true});
 assert.equal(first.url,second.url);assert.equal(first.tokenId,second.tokenId);assert.equal(claims,2);assert.equal(parseGuestToken(first.token,'isolated-fixture-signing-secret-never-production').b,req);
});
