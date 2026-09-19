import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load=()=>loadNodeTypescript(process.cwd())('src/lib/businessAppointmentPatterns.ts');
const window={start:'2026-08-03T04:00:00Z',end:'2026-08-31T04:00:00Z',timeZone:'America/New_York',now:Date.parse('2026-09-01T12:00:00Z')};
const row=(id,at,status='Completed')=>({id,appointment_datetime:at,status});

test('historical patterns identify lower observed weekday periods using actual completed appointments',()=>{
 const rows=[row('1','2026-08-04T18:00:00Z'),row('2','2026-08-11T18:00:00Z'),...['05','12','19','26'].flatMap((day,i)=>[row(`a${i}`,`2026-08-${day}T18:00:00Z`),row(`b${i}`,`2026-08-${day}T19:00:00Z`)])];
 const result=load().businessAppointmentPatterns(rows,window);
 assert.equal(result.complete_local_days,28);assert.equal(result.completed_count,10);
 const slow=result.lower_observed_periods.find(x=>x.weekday==='Tue'&&x.start_hour===12);
 assert.equal(slow.completed_count,2);assert.equal(slow.observed_calendar_days,4);assert.equal(slow.appointments_per_calendar_day,0.5);
 assert.equal(slow.comparison_median,1.25);assert.equal(result.lower_observed_periods.some(x=>x.completed_count===0),false);
 assert.match(result.definition,/not capacity|not historical capacity/);assert.match(result.definition,/unknown/);
});
test('partial days, future dates and non-completed records cannot create historical completion claims',()=>{
 const rows=[row('partial','2026-08-03T15:00:00Z'),row('today','2026-08-31T15:00:00Z'),row('cancel','2026-08-04T15:00:00Z','Cancelled'),row('pending','2026-08-05T15:00:00Z','Confirmed'),row('visit','2026-08-06T15:00:00Z')];
 const result=load().businessAppointmentPatterns(rows,{...window,start:'2026-08-03T14:00:00Z',end:'2026-09-30T04:00:00Z',now:Date.parse('2026-08-31T20:00:00Z')});
 assert.equal(result.from,'2026-08-04');assert.equal(result.to,'2026-08-30');assert.equal(result.completed_count,1);assert.equal(result.lower_observed_periods.length,0);
});
test('historical local-day counts survive daylight-saving changes instead of using elapsed 24-hour periods',()=>{
 const result=load().businessAppointmentPatterns([row('1','2026-03-08T16:30:00Z')],{start:'2026-03-01T05:00:00Z',end:'2026-03-15T04:00:00Z',timeZone:'America/New_York',now:Date.parse('2026-03-16T12:00:00Z')});
 assert.equal(result.complete_local_days,14);assert.equal(result.completed_count,1);assert.equal(result.observed_periods.find(x=>x.weekday==='Sun').observed_calendar_days,2);
});
test('empty and short evidence are explicit, and malformed or duplicated records fail instead of fabricating patterns',()=>{
 const fn=load().businessAppointmentPatterns;
 assert.equal(fn([],window).completed_count,0);assert.equal(fn([],window).lower_observed_periods.length,0);
 assert.equal(fn([],{...window,end:'2026-08-04T04:00:00Z'}).sufficient_comparison_window,false);
 assert.throws(()=>fn([row('x','bad')],window),/PATTERN_INVALID_RECORD/);
 assert.throws(()=>fn([row('x','2026-08-04T15:00:00Z'),row('x','2026-08-04T15:00:00Z')],window),/PATTERN_INVALID_RECORD/);
 assert.throws(()=>fn([],{...window,timeZone:'bad'}),/PATTERN_INVALID_WINDOW/);
});
test('model projection keeps observed counts bounded and never includes customer, service or professional identities',()=>{
 const result=load().businessAppointmentPatterns([{...row('1','2026-08-04T15:00:00Z'),guest_name:'PRIVATE_CLIENT',guest_email:'private@example.test',stylist_id:'PRIVATE_STAFF'}],window);
 assert.equal(JSON.stringify(result).includes('PRIVATE'),false);assert.equal(JSON.stringify(result).includes('private@example.test'),false);
 assert(result.observed_periods.length<=12);assert(result.lower_observed_periods.length<=6);
});
