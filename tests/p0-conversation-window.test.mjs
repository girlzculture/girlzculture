import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const { bookingConversationWindow:window,conversationUnread }=typescriptLoader(process.cwd())('src/lib/bookingConversation.ts');
const booking={customer_id:'c',appointment_datetime:'2030-03-10T06:00:00Z',duration_hours:2,status:'Confirmed'};
test('conversation deadline uses absolute appointment end plus24h, including a DST boundary',()=>{
 assert.equal(window(booking,Date.parse('2030-03-11T07:59:59Z')).open,true);
 assert.equal(window(booking,Date.parse('2030-03-11T08:00:00Z')).open,false);
 assert.equal(window(booking,0).closesAt,'2030-03-11T08:00:00.000Z');
});
test('confirmed reschedule changes the window, proposals do not, cancellation closes without deleting',()=>{
 assert.equal(window({...booking,proposed_datetime:'2099-01-01'},Date.parse('2030-03-12')).open,false);
 assert.equal(window({...booking,appointment_datetime:'2030-03-13T06:00:00Z'},Date.parse('2030-03-12')).open,true);
 for(const status of ['Cancelled','Cancelled by customer','Declined','Expired'])assert.equal(window({...booking,status},0).open,false);
 assert.equal(window({...booking,customer_id:null,booking_origin:"business_added"},0).reason,'participant_required');
 assert.equal(window({...booking,appointment_datetime:'invalid'},0).open,false);
});
test('unread counts use the recipient receipt, never the sender own receipt',()=>{
 const messages=[{sender_role:'customer',read_by_customer_at:'now'},{sender_role:'salon',read_by_salon_at:'now'},{sender_role:'customer',read_by_salon_at:'now'}];
 assert.equal(conversationUnread(messages,'salon'),1);assert.equal(conversationUnread(messages,'customer'),1);
});
