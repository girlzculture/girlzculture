import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNodeTypescript} from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {selectAssistantAppointment}=load('src/lib/assistantAppointmentAvailability.ts');
const {readOwnerResponse}=load('src/lib/ownerActionError.ts');
const start=Date.parse('2026-09-24T19:30:00Z');
const candidate={service:{id:'style-A',name:'Boho / Knotless Braids'},duration:60,buffer:15};
const base={start,candidates:[candidate],roster:[{id:'own',name:'Aisha',assigned_service_ids:['style-A']},{id:'other',name:'Not assigned',assigned_service_ids:[]}],professional:'own',timeZone:'America/New_York',customServiceName:''};
test('conflict alternatives fit full duration and buffer, preserve named professional and exclude ineligible assignments',()=>{
 let error;
 try{selectAssistantAppointment({...base,gaps:[{stylist_id:'own',start:'2026-09-24T18:00:00Z',end:'2026-09-24T19:15:00Z'},{stylist_id:'own',start:'2026-09-24T20:00:00Z',end:'2026-09-24T21:15:00Z'},{stylist_id:'own',start:'2026-09-24T19:30:00Z',end:'2026-09-24T20:30:00Z'},{stylist_id:'other',start:'2026-09-24T19:30:00Z',end:'2026-09-24T23:00:00Z'}]});}catch(e){error=e;}
 assert.equal(error.code,'ASSISTANT_AVAILABILITY_CONFLICT');assert.equal(error.alternatives.length,2);
 assert.equal(error.alternatives[0].start,'2026-09-24T20:00:00.000Z');assert.equal(error.alternatives[1].start,'2026-09-24T18:00:00.000Z');
 assert.ok(error.alternatives.every(row=>row.professional_name==='Aisha'&&row.duration_minutes===60&&row.buffer_minutes===15));
 assert.throws(()=>selectAssistantAppointment({...base,professional:null,gaps:[{stylist_id:'other',start:'2026-09-24T19:30:00Z',end:'2026-09-24T23:00:00Z'}]}),e=>e.alternatives.length===0);
});
test('exact requested minutes are never rounded and long ranges produce only three bounded alternatives',()=>{
 const input={...base,start:Date.parse('2026-09-24T19:37:00Z'),gaps:[{stylist_id:'own',start:'2026-09-24T19:00:00Z',end:'2026-09-24T23:00:00Z'}]};
 const result=selectAssistantAppointment(input);assert.equal(result.professional,'own');assert.equal(input.start,Date.parse('2026-09-24T19:37:00Z'));
 const gaps=Array.from({length:20},(_,i)=>({stylist_id:'own',start:new Date(start+(i+1)*3600000).toISOString(),end:new Date(start+(i+3)*3600000).toISOString()}));
 assert.throws(()=>selectAssistantAppointment({...base,gaps}),e=>e.alternatives.length===3);
});
test('only allowlisted alternatives survive error transport; incident correlation remains exact',async()=>{
 const alternatives=[{start:'2026-09-24T20:00:00.000Z',time_zone:'America/New_York',professional_name:'Aisha',service_name:'Boho / Knotless Braids',duration_minutes:60,buffer_minutes:15}];
 await assert.rejects(readOwnerResponse(Response.json({code:'ASSISTANT_AVAILABILITY_CONFLICT',request_id:'EXACT-REF',alternatives},{status:409}),'FAILED'),e=>{assert.equal(e.reference,'EXACT-REF');assert.deepEqual(e.alternatives,alternatives);return true;});
 for(const malformed of [[{...alternatives[0],provider_body:'SECRET'}],[{...alternatives[0],time_zone:'invalid-zone'}],[{...alternatives[0],duration_minutes:0}],Array(4).fill(alternatives[0])]){
  await assert.rejects(readOwnerResponse(Response.json({code:'ASSISTANT_AVAILABILITY_CONFLICT',alternatives:malformed},{status:409}),'FAILED'),e=>e.alternatives.length===0);
 }
 await assert.rejects(readOwnerResponse(Response.json({code:'AUTH_REQUIRED',alternatives},{status:401}),'FAILED'),e=>e.alternatives.length===0);
});
