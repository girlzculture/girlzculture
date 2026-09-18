import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {bookingFollowupCopy}=load('src/lib/bookingFollowupCopy.ts');
const reference='10000000-0000-4000-8000-000000000001';
const bookingId='20000000-0000-4000-8000-000000000001',lease='30000000-0000-4000-8000-000000000001';
function fixture({locale='es',status='Completed',followup=true,channels=['email'],denyChannel=false,emailStatus=200,age=26,configurationFailure=false}={}){
 const calls=[],emails=[];
 const booking={id:bookingId,salon_id:'business-a',style_id:'service-a',appointment_datetime:new Date(Date.now()-age*3600000).toISOString(),duration_hours:1,status,guest_name:'Client',guest_email:'fixture@example.test',preferred_locale:locale};
 const pref={id:'40000000-0000-4000-8000-000000000001',email_enabled:true,sms_enabled:false,push_enabled:false,follow_up:followup,locale,consent_version:1};
 const admin={from(table){const q={select(){return q},eq(){return q},in(){return q},like(){return q},update(){return q},single:async()=>response(),maybeSingle:async()=>response(),then(ok,no){return Promise.resolve(response()).then(ok,no)}};
 function response(){return {error:table==='engine_settings'&&configurationFailure?Error('fixture unavailable'):null,data:table==='bookings'?booking:table==='salons'?{id:'business-a',name:'Isha 5 Stars',slug:'isha-five',email:'business@example.test',time_zone:'America/New_York'}:table==='styles'?{name:'Boho / Goddess Braids $250'}:table==='engine_settings'?[{setting_key:'notifications.channels',published_value:channels}]:table==='business_communication_preferences'?pref:[]};}return q;},rpc:async(name,args)=>{calls.push({name,args});return {error:null,data:name==='claim_due_booking_followups'?[{booking_id:bookingId,lease_id:lease}]:name==='claim_followup_notification_delivery'?denyChannel?null:'delivery-id':name==='finish_booking_followup'?true:null};}};
 const server=typescriptLoader(process.cwd(),{
  '@supabase/supabase-js':{createClient:()=>admin},
  '@/lib/platformErrors':{capturePlatformError:async()=>reference},
  '@/lib/operationalTelemetryContext':{noteOperationalFailure(){}},
  '@/lib/businessCommunicationServer':{bookingCommunicationPreferences:async()=>pref,communicationUnsubscribeToken:id=>`${id}.synthetic-signature`},
 },{fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');emails.push({body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return Response.json({id:'fixture-email'},{status:emailStatus});},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',RESEND_API_KEY:'fixture-only',NEXT_PUBLIC_SITE_URL:'https://example.test'}}})('src/lib/supabaseAdmin.ts');
 return {server,calls,emails,booking};
}
for(const [locale,title] of [['en','Thank you for visiting Isha 5 Stars'],['fr','Merci de votre visite chez Isha 5 Stars'],['es','Gracias por visitar Isha 5 Stars'],['zh-CN','感谢您光临Isha 5 Stars']])test(`${locale} post-visit email uses original facts, its own business link and an opt-out`,async()=>{
 const f=fixture({locale});const result=await f.server.processBookingFollowups();
 assert.equal(f.emails.length,1);assert.equal(f.emails[0].body.subject,title);assert.equal(f.emails[0].body.to,'fixture@example.test');
 for(const fact of ['Isha 5 Stars','Boho / Goddess Braids $250','https://example.test/salon/isha-five','/communications/unsubscribe?token='])assert.ok(f.emails[0].body.html.includes(fact),fact);
 assert.equal(f.emails[0].key,`${bookingId}:booking_follow_up:customer:email`);
 assert.ok(f.calls.some(c=>c.name==='claim_followup_notification_delivery'&&c.args.p_lease===lease));
 assert.ok(f.calls.some(c=>c.name==='finish_booking_followup'&&c.args.p_lease===lease&&c.args.p_success===true));assert.equal(result.results[0].status,'completed');
});
test('optional message does not send before due, after expiry, after cancellation, without opt-in or with channels disabled',async()=>{
 for(const options of [{age:5},{age:80},{status:'Cancelled'},{followup:false},{channels:[]}]){const f=fixture(options);await f.server.processBookingFollowups();assert.equal(f.emails.length,0,JSON.stringify(options));assert.equal(f.calls.filter(c=>c.name==='claim_followup_notification_delivery').length,0);}
});
test('changed final consent or lease rejects dispatch even after a permitted read',async()=>{
 const f=fixture({denyChannel:true});await f.server.processBookingFollowups();assert.equal(f.emails.length,0);assert.ok(f.calls.some(c=>c.name==='claim_followup_notification_delivery'));
});
test('provider failure retains its protected incident and retries use the same delivery idempotency key',async()=>{
 const f=fixture({emailStatus:503});const result=await f.server.processBookingFollowups();
 assert.equal(result.results[0].request_id,reference);assert.equal(result.results[0].status,'failed');
 assert.ok(f.calls.some(c=>c.name==='finish_booking_followup'&&c.args.p_success===false&&c.args.p_reference===reference));
 await f.server.processBookingFollowups();assert.equal(f.emails[0].key,f.emails[1].key);
});
test('optional notifications fail closed when Engine configuration cannot be read',async()=>{
 const f=fixture({configurationFailure:true});const result=await f.server.processBookingFollowups();assert.equal(f.emails.length,0);assert.equal(result.results[0].status,'failed');assert.equal(result.results[0].request_id,reference);
});
test('template replacement preserves literal names containing substitution syntax',()=>{
 const message=bookingFollowupCopy('fr','Business $& {{service}}','Service $250');assert.equal(message.subject,'Merci de votre visite chez Business $& {{service}}');assert.ok(message.body.includes('Service $250'));
});
