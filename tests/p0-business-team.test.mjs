import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const {professionalHours,professionalPerformance}=typescriptLoader(process.cwd())('src/lib/businessTeamPerformance.ts');
test('team hours read both existing formats and do not claim missing days are bookable',()=>{
 const hours=professionalHours({Mon:'09:00 - 17:00',Tue:{open:'10:00',close:'16:00',closed:false},Wed:{open:'09:00',close:'17:00',closed:true}});
 assert.equal(hours[0].open,'09:00');assert.equal(hours[0].closed,false);assert.equal(hours[1].close,'16:00');assert.equal(hours.filter(row=>!row.closed).length,2);assert.equal(hours[6].closed,true);
});
test('team performance counts current-business current-professional real month-to-date records only',()=>{
 const now=Date.parse('2026-10-01T02:00:00Z');
 const base={id:'one',salon_id:'A',stylist_id:'s1',status:'Completed',appointment_datetime:'2026-09-30T18:00:00Z',estimated_total:123.45};
 const rows=[base,base,{...base,id:'foreign',salon_id:'B'},{...base,id:'other',stylist_id:'s2'},{...base,id:'test',payment_mode:'test'},{...base,id:'future',appointment_datetime:'2026-10-02T12:00:00Z'},{...base,id:'old',appointment_datetime:'2026-08-30T12:00:00Z'},{...base,id:'manual',booking_origin:'business_added'},{...base,id:'missing',estimated_total:null},{...base,id:'cancel',status:'Cancelled'}];
 const result=professionalPerformance(rows,'A','s1','America/New_York',now);
 assert.equal(result.from,'2026-09-01');assert.equal(result.to,'2026-09-30');assert.equal(result.appointments,4);assert.equal(result.completed,3);assert.equal(result.cancellations,1);assert.equal(result.completed_value_cents,12345);assert.equal(result.missing_prices,1);
});
