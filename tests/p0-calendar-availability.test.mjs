import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';

function fixture({roster=[],bookings=[],intents=[],blockouts=[],closed=false,truncated=null}={}) {
  const calls=[];
  const tables={salons:[{id:'business',status:'Active',is_discoverable:true,subscription_status:'active',accepting_bookings:true,time_zone:'America/New_York',hours:{Tue:{open:'09:00',close:'19:00',closed}},booking_settings:{}}],styles:[{id:'service',salon_id:'business',duration_min_hours:1,buffer_minutes:15}],stylists:roster,bookings,booking_checkout_intents:intents,salon_blockouts:blockouts};
  const admin={from(table){calls.push(table);const filters=[];let one=false;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},gt(k,v){filters.push(r=>r[k]>v);return q;},single(){one=true;return q;},then(resolve,reject){return Promise.resolve().then(()=>{const rows=tables[table].filter(r=>filters.every(f=>f(r)));return {data:one?rows[0]:rows,error:null,count:!one&&table===truncated?rows.length+1:null};}).then(resolve,reject);}};return q;}};
  const availability=typescriptLoader(process.cwd(),{'@/lib/supabaseAdmin':{getSupabaseAdmin:()=>admin}})('src/lib/bookingAvailabilityServer.ts');
  return {calls,...availability};
}
const input={salonId:'business',date:'2030-09-24'};
test('calendar gaps require no service and subtract manual, marketplace holds and overrides',async()=>{
  const f=fixture({bookings:[{id:'manual',salon_id:'business',stylist_id:null,status:'Confirmed',appointment_datetime:'2030-09-24T17:00:00.000Z',blocked_until:'2030-09-24T18:15:00.000Z'}],intents:[{id:'hold',salon_id:'business',stylist_id:null,status:'Pending',expires_at:'2030-10-01T00:00:00Z',appointment_datetime:'2030-09-24T19:00:00.000Z',blocked_until:'2030-09-24T20:00:00.000Z'}],blockouts:[{id:'block',salon_id:'business',stylist_id:null,starts_at:'2030-09-24T21:00:00.000Z',ends_at:'2030-09-24T22:00:00.000Z'}]});
  const result=await f.calendarAvailability(input);
  assert.equal(f.calls.includes('styles'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.gaps.map(g=>[g.start,g.end]))),[['2030-09-24T13:00:00.000Z','2030-09-24T17:00:00.000Z'],['2030-09-24T18:15:00.000Z','2030-09-24T19:00:00.000Z'],['2030-09-24T20:00:00.000Z','2030-09-24T21:00:00.000Z'],['2030-09-24T22:00:00.000Z','2030-09-24T23:00:00.000Z']]);
  const publicFit=await f.bookingAvailability({...input,styleId:'service'});
  assert.equal(publicFit.slots.some(s=>s.value==='13:00'),false);
  assert.equal(publicFit.slots.some(s=>s.value==='09:00'),true);
});
test('professional-specific occupancy leaves another professional free and closed businesses offer no gap',async()=>{
  const availability={Tue:'09:00 - 19:00'};
  const f=fixture({roster:[{id:'one',salon_id:'business',name:'One',is_active:true,availability},{id:'two',salon_id:'business',name:'Two',is_active:true,availability}],bookings:[{id:'manual',salon_id:'business',stylist_id:'one',status:'Confirmed',appointment_datetime:'2030-09-24T17:00:00.000Z',blocked_until:'2030-09-24T18:00:00.000Z'}]});
  const result=await f.calendarAvailability(input);assert.equal(result.gaps.filter(g=>g.stylist_id==='one').length,2);assert.equal(result.gaps.filter(g=>g.stylist_id==='two').length,1);
  assert.equal((await fixture({closed:true}).calendarAvailability(input)).gaps.length,0);
});

test('incomplete occupancy or roster responses fail closed instead of inventing free time',async()=>{
  for(const truncated of ['stylists','bookings','booking_checkout_intents','salon_blockouts']) {
    await assert.rejects(fixture({truncated}).calendarAvailability(input), /RESULT_TRUNCATED/);
  }
});

test('service assignments exclude unassigned professionals without falling back to a salon slot',async()=>{
  const professional={id:'one',salon_id:'business',name:'One',is_active:true,is_draft:false,availability:{Tue:'09:00 - 19:00'}};
  for(const assigned_service_ids of [[],['other-service']]) {
    const f=fixture({roster:[{...professional,assigned_service_ids}]});
    assert.equal((await f.bookingAvailability({...input,styleId:'service'})).slots.length,0);
    assert.equal((await f.bookingAvailability({...input,styleId:'service',stylistId:'one'})).slots.length,0);
    assert.equal((await f.calendarAvailability(input)).gaps.length,1,'general calendar still reports working hours');
  }
  for(const assigned_service_ids of [null,['service']]) {
    assert.ok((await fixture({roster:[{...professional,assigned_service_ids}]}).bookingAvailability({...input,styleId:'service'})).slots.length>0);
  }
  for(const status of [{is_active:false},{is_draft:true}]) {
    assert.equal((await fixture({roster:[{...professional,...status}]}).bookingAvailability({...input,styleId:'service'})).slots.length,0);
  }
});

test('existing appointment availability reserves its full duration and buffer after a catalog edit',async()=>{
 const f=fixture();
 const current=await f.bookingAvailability({...input,styleId:'service'});
 assert.ok(current.slots.some(slot=>slot.value==='17:30'),'edited one-hour catalog service fits');
 const booked=await f.bookingAvailability({...input,styleId:'service',durationMinutes:180,bufferMinutes:30});
 assert.equal(booked.durationMinutes,180);
 assert.ok(!booked.slots.some(slot=>slot.value==='17:30'),'three-hour booked service cannot fit before closing');
 assert.ok(booked.slots.some(slot=>slot.value==='15:30'),'complete booked duration plus buffer fits exactly');
});
