import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{}});
const core=load('src/lib/gcAssistantCore.ts');
const protocol=load('src/lib/gcAssistantPlannerProtocol.ts');
const booking='18000000-0000-4000-8000-000000000001';
const args={booking_id:booking,date:'2099-10-20',time:'15:00',reason:'Client requested another time',message:''};
test('migration180 preserves every prior tool and registers only the new proposal action',()=>{
 const names=file=>[...readFileSync(file,'utf8').match(/check\(tool in \(([^;]+)\)\);/)[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
 const previous=names('supabase/migrations/20260919063800_assistant_outstanding_balances.sql'),current=names('supabase/migrations/20260919084221_assistant_booking_reschedule.sql');
 assert.deepEqual(current.filter(name=>!previous.includes(name)),['prepare_booking_reschedule_proposal']);assert(previous.every(name=>current.includes(name)));
 const settings=names('supabase/migrations/20260919134859_assistant_profile_settings_read.sql');assert.deepEqual([...settings].sort(),[...current,'get_business_settings'].sort());const money=names('supabase/migrations/20260919143452_assistant_authoritative_money_reads.sql');assert.deepEqual([...money].sort(),[...settings,'calculate_service_selection','get_booking_price_details'].sort());assert.deepEqual([...money].sort(),Object.keys(core.ASSISTANT_TOOLS).sort());
});
test('reschedule review copy covers the same contract in all four supported languages',()=>{
 const dictionary=load('src/i18n/assistant-reschedule-copy.ts').assistantRescheduleCopy;
 assert.deepEqual(Object.keys(dictionary).sort(),['en','es','fr','zh-CN']);
 for(const locale of Object.keys(dictionary)){assert.deepEqual(Object.keys(dictionary[locale]),Object.keys(dictionary.en));for(const value of Object.values(dictionary[locale]))assert.equal(typeof value,'string');}
});
const business='18000000-0000-4000-8000-000000000010',actor='18000000-0000-4000-8000-000000000011',stylist='18000000-0000-4000-8000-000000000012',service='18000000-0000-4000-8000-000000000013',foreign='18000000-0000-4000-8000-000000000099';
test('marketplace reschedule has a separate reviewed risk4 proposal tool under bookings permission',()=>{
 const checked=core.validateTool('prepare_booking_reschedule_proposal',args);
 assert.equal(checked.risk,4);assert.equal(checked.permission,'bookings');
 const decisions=protocol.ownerPlannerSchema(new Set(['bookings']),false).properties.decision.anyOf;
 assert(decisions.some(row=>row.properties.tool?.enum[0]==='prepare_booking_reschedule_proposal'));
 assert(!protocol.ownerPlannerSchema(new Set(['availability']),false).properties.decision.anyOf.some(row=>row.properties.tool?.enum[0]==='prepare_booking_reschedule_proposal'));
});
function fixture({assignment=null,denied=false,scopeDenied=false,mixed=false,conflict=false,changed=false,revokedDuringRead=false,origin='marketplace'}={}){
 const calls=[],writes=[],sends=[];let readCount=0;
 const b={id:booking,salon_id:business,style_id:service,stylist_id:stylist,appointment_datetime:'2099-10-20T14:00:00.000Z',duration_hours:1,buffer_minutes:15,status:'Confirmed',booking_origin:origin,estimated_total:120,deposit_amount:12,deposit_status:'Paid',guest_name:'Sarah',guest_email:'PRIVATE@example.test',guest_phone:'PRIVATE_PHONE',customer_id:null,public_reference:'GC-180',service_started_at:null};
 const rows={bookings:[b],styles:[{id:service,salon_id:business,name:'Silk Press'}],stylists:[{id:stylist,salon_id:business,name:'Aisha'}],engine_settings:[]};
 const admin={async rpc(name,payload){calls.push({name,payload});if(name==='p0_actor_has_permission')return {data:!denied};if(name==='p0_actor_can_manage_professional')return {data:!scopeDenied};throw Error(`Unexpected RPC ${name}`);},from(table){const filters=[];const q={select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},maybeSingle(){if(table==='bookings')readCount++;let value=rows[table]?.filter(row=>filters.every(f=>f(row)))[0]??null;if(value&&table==='bookings'&&mixed)value={...value,salon_id:foreign};if(value&&table==='bookings'&&changed&&readCount>1)value={...value,estimated_total:140};return Promise.resolve({data:value});},insert(v){writes.push(v);throw Error('Unexpected write');},update(v){writes.push(v);throw Error('Unexpected write');}};return q;}};
 const loader=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{sendEmail(){sends.push('email');},sendSms(){sends.push('sms');},runDeliveries(){sends.push('delivery');},bookingDeliveryChannels(){sends.push('channels');}},'@/lib/webPushServer':{sendPushToUsers(){sends.push('push');}},'@/lib/guestBookingAccess':{issueGuestBookingToken(){writes.push('token');}},'@/lib/contentModerationServer':{moderatePublicContent:async()=>({allowed:true})},'@/lib/bookingAvailabilityServer':{bookingAvailability:async input=>{calls.push({availability:input});if(revokedDuringRead)denied=true;return {slots:conflict?[]:[{value:'15:00',stylistId:stylist,stylistName:'Aisha'}],timeZone:'America/New_York'};}}});
 return {helper:loader('src/lib/assistantBookingReschedule.ts'),calls,writes,sends,context:{admin,user:{id:actor},salon:{id:business,time_zone:'America/New_York',name:'Own salon'},isOwner:!assignment,teamMember:assignment?{stylist_id:assignment}:null}};
}
test('preparing uses canonical read-only availability with current duration and creates no proposal, token or notification',async()=>{
 const f=fixture();const result=await f.helper.prepareAssistantBookingReschedule(f.context,args);
 assert.equal(result.payload.appointment_datetime,'2099-10-20T19:00:00.000Z');assert.equal(result.payload.previous_appointment_datetime,'2099-10-20T14:00:00.000Z');assert.equal(result.payload.professional_name,'Aisha');assert.equal(result.payload.estimated_total,120);assert.equal(result.payload.deposit_amount,12);assert.equal(result.payload.duration_hours,1);
 const av=f.calls.find(row=>row.availability).availability;assert.equal(av.excludeBookingId,booking);assert.equal(av.stylistId,stylist);assert.equal(av.durationMinutes,60);assert.equal(av.salonId,business);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|manageUrl|token|guest_email|guest_phone/);assert.deepEqual(f.writes,[]);assert.deepEqual(f.sends,[]);
});
test('foreign records, reassigned staff, lost permission and changed financial terms cannot prepare a proposal',async()=>{
 for(const options of [{assignment:foreign},{denied:true},{scopeDenied:true},{mixed:true},{changed:true},{revokedDuringRead:true},{origin:'business_added'},{conflict:true}]){
 const f=fixture(options);await assert.rejects(f.helper.prepareAssistantBookingReschedule(f.context,args),/ASSISTANT_(?:RECORD_NOT_FOUND|ACCESS_DENIED|PREVIEW_STALE|AVAILABILITY_CONFLICT)/);assert.deepEqual(f.writes,[]);assert.deepEqual(f.sends,[]);
 }
});
test('marketplace proposal cannot inject another business, professional, price or customer consent',()=>{
 for(const patch of [{salon_id:booking},{stylist_id:booking},{price:1},{customer_approved:true},{reason:''},{date:'2026-02-30'}])assert.throws(()=>core.validateTool('prepare_booking_reschedule_proposal',{...args,...patch}),/ASSISTANT_INVALID_(?:INPUT|DATE_RANGE)/);
});
