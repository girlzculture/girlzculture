import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const {businessOverview,businessDay}=typescriptLoader(process.cwd())('src/lib/businessOverview.ts');
const now=Date.parse('2026-09-18T02:00:00Z');
test('overview uses the business day and Monday-to-date periods, including DST',()=>{
 assert.equal(businessDay(now,'America/New_York'),'2026-09-17');
 assert.equal(businessDay('2026-03-08T06:30:00Z','America/New_York'),'2026-03-08');
 const rows=[{appointment_datetime:'2026-09-14T12:00:00Z'},{appointment_datetime:'2026-09-13T12:00:00Z'},{appointment_datetime:'2026-09-18T12:00:00Z'}];
 const result=businessOverview(rows,'week','America/New_York',now);assert.equal(result.from,'2026-09-14');assert.equal(result.appointments,1);
});
test('counts identified clients rather than labeling repeat visits as new customers',()=>{
 const rows=[{customer_id:'A'},{customer_id:'A'},{guest_email:' B@example.test '},{guest_email:'b@example.test'},{}].map(row=>({...row,appointment_datetime:'2026-09-17T12:00:00Z'}));
 const result=businessOverview(rows,'today','America/New_York',now);assert.equal(result.appointments,5);assert.equal(result.identified_clients,2);
});
test('completed marketplace value excludes tests, manual records and unpaid non-completed sales',()=>{
 const base={appointment_datetime:'2026-09-17T12:00:00Z',status:'Completed',estimated_total:19.99};
 const result=businessOverview([base,base,{...base,payment_mode:'test'},{...base,booking_origin:'business_added'},{...base,status:'Confirmed'},{...base,estimated_total:null}],'month','America/New_York',now);
 assert.equal(result.completed_value_cents,3998);assert.equal(result.missing_completed_prices,1);assert.equal(result.business_added,1);assert.equal(result.trend.at(-1).completed_value_cents,3998);
});
test('cancellation rate has actual terminal outcomes as denominator, excludes customer cancellation numerator',()=>{
 const rows=[{status:'Cancelled',cancelled_by:'salon'},{status:'Cancelled',cancelled_by:'customer'},{status:'Completed'},{status:'Confirmed'}].map(row=>({...row,appointment_datetime:'2026-09-17T12:00:00Z'}));
 const result=businessOverview(rows,'month','America/New_York',now);assert.equal(result.cancellation_denominator,3);assert.equal(result.cancellation_rate,1/3);
 assert.equal(businessOverview([],'today','UTC',now).cancellation_rate,null);
});
test('today and upcoming exclude no-shows and cancelled appointments without fabricating availability',()=>{
 const rows=['Confirmed','No Show','Cancelled'].map(status=>({status,appointment_datetime:'2026-09-18T03:00:00Z'}));
 const result=businessOverview(rows,'today','America/New_York',now);assert.equal(result.today.length,1);assert.equal(result.upcoming.length,1);
});
