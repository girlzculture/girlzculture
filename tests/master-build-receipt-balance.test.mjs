import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const {attachBookingReceiptBalances,bookingBalanceAmount,bookingBalanceStatus}=typescriptLoader(process.cwd())('src/lib/bookingReceiptBalance.ts');
const booking=()=>({id:'paid',salon_id:'A',is_demo:true,payment_mode:'test',booking_origin:'marketplace',status:'Completed',balance_due:168});
test('paid receipt readback fixes the visible balance without rewriting agreed terms',()=>{
 const row=booking();attachBookingReceiptBalances('A',[row],[{id:'paid',salon_id:'A',remaining_cents:0}]);
 assert.equal(row.balance_due,168);assert.equal(bookingBalanceAmount(row),0);assert.equal(bookingBalanceStatus(row),'Paid');
});
test('unpaid appointments retain their actual remaining cents and real accounts are unchanged',()=>{
 const row={...booking(),status:'Confirmed'};attachBookingReceiptBalances('A',[row],[{id:'paid',salon_id:'A',remaining_cents:7600}]);
 assert.equal(bookingBalanceAmount(row),76);assert.equal(bookingBalanceStatus(row),'Due after service');
 assert.equal(bookingBalanceStatus({...row,status:'No Show',recorded_balance_cents:0}),'No Show');assert.equal(bookingBalanceStatus({...row,status:'Cancelled',recorded_balance_cents:0}),'Cancelled');
 assert.equal(bookingBalanceAmount({balance_due:23}),23);assert.equal(bookingBalanceStatus({balance_status:'Paid'}),'Paid');
});
test('foreign, unassigned, duplicate, missing and malformed readbacks fail closed',()=>{
 for(const summaries of [[{id:'paid',salon_id:'B',remaining_cents:0}],[{id:'other',salon_id:'A',remaining_cents:0}],[],[{id:'paid',salon_id:'A',remaining_cents:-1}],[{id:'paid',salon_id:'A',remaining_cents:'0'}],[{id:'paid',salon_id:'A',remaining_cents:0},{id:'paid',salon_id:'A',remaining_cents:0}]])assert.throws(()=>attachBookingReceiptBalances('A',[booking()],summaries));
 assert.throws(()=>attachBookingReceiptBalances('A',[{...booking(),is_demo:false}],[{id:'paid',salon_id:'A',remaining_cents:0}]));
});
