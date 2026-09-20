import test from 'node:test';import assert from 'node:assert/strict';import{typescriptLoader}from './helpers/load-typescript.mjs';
const {bookingMatchesGroup,filterBookingPeriod,summarizeBookings}=typescriptLoader(process.cwd())('src/lib/businessBookings.ts');
test('existing workflow groups preserve pending, active, terminal and overdue meanings',()=>{
 const now=Date.parse('2030-01-01T12:00:00Z');const row=(status,when=now+3600000)=>({status,appointment_datetime:new Date(when).toISOString()});
 assert.equal(bookingMatchesGroup(row('Confirmed'),'Upcoming',now),true);assert.equal(bookingMatchesGroup(row('Pending'),'Upcoming',now),false);assert.equal(bookingMatchesGroup(row('Confirmed',now-3600000),'Needs Resolution',now),true);
 for(const status of ['Ready','Checked In','In Progress','Started'])assert.equal(bookingMatchesGroup(row(status),'In Progress',now),true);
 for(const status of ['Completed','Cancelled','No Show'])assert.equal(bookingMatchesGroup(row(status),'Upcoming',now),false);
 assert.equal(bookingMatchesGroup({...row('Confirmed'),refund_status:'Failed'},'Needs Resolution',now),true);
});
test('date filters use business local days across UTC midnight and DST',()=>{
 const rows=[{id:'before',appointment_datetime:'2030-03-10T04:30:00Z'},{id:'after',appointment_datetime:'2030-03-10T07:30:00Z'}];const filter={from:'2030-03-10',to:'2030-03-10',staff:'',service:''};
 assert.deepEqual(filterBookingPeriod(rows,filter,'America/New_York').map(r=>r.id),['after']);assert.equal(filterBookingPeriod(rows,filter,'UTC').length,2);
});
test('staff/service filters preserve unassigned and custom records',()=>{
 const rows=[{id:'a',stylist_id:'A',style_id:'style'},{id:'b',stylist_id:null,style_id:null}];
 assert.deepEqual(filterBookingPeriod(rows,{from:'',to:'',staff:'unassigned',service:'manual'},'UTC').map(r=>r.id),['b']);assert.equal(filterBookingPeriod(rows,{from:'',to:'',staff:'A',service:'wrong'},'UTC').length,0);
});
test('booking summary separates completed agreed value from deposits and missing prices',()=>{
 assert.deepEqual({...summarizeBookings([{status:'Completed',estimated_total:100.01,deposit_amount:20},{status:'Completed',estimated_total:null},{status:'Confirmed',estimated_total:999},{status:'Cancelled',estimated_total:888}])},{total:4,confirmed:1,completed:2,completedAgreedCents:10001,missingPrices:1});
});
