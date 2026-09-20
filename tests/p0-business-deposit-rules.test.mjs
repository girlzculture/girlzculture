import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const {bookingDepositTerms,defaultDepositRule,validateDepositRule,protectedBookingDiscount}=typescriptLoader(process.cwd())('src/lib/businessDepositRules.ts');
const rule={...defaultDepositRule(20),version:'version-A',threshold_amount:300,threshold_rate:40,repeat_incident_count:2,repeat_incident_rate:50};
test('owner rates apply before discounts, strictly above threshold, and select one highest applicable rate',()=>{
 assert.equal(bookingDepositTerms(300,rule).deposit,60);assert.equal(bookingDepositTerms(300.01,rule).deposit,120);
 assert.equal(bookingDepositTerms(400,rule,2).rate,50);assert.equal(bookingDepositTerms(400,rule,2).deposit,200);
 const snapshot=bookingDepositTerms(400,rule,2);const changed={...rule,rate:30};assert.equal(snapshot.rule.rate,20);assert.equal(bookingDepositTerms(100,changed).deposit,30);
 const terms=bookingDepositTerms(100,defaultDepositRule(10));const result=protectedBookingDiscount(100,terms.deposit,20);
 assert.equal(result.total,80);assert.equal(result.deposit,10);assert.equal(result.balance,70);
});
test('tiny-deposit waiver and cent rounding are explicit and identical for preview/checkout',()=>{
 assert.equal(bookingDepositTerms(1,defaultDepositRule(10)).minimum_waived,true);
 assert.equal(bookingDepositTerms(5,defaultDepositRule(10)).deposit,.5);
 assert.equal(bookingDepositTerms(99.99,defaultDepositRule(33.33)).deposit,33.33);
 assert.equal(bookingDepositTerms(100,defaultDepositRule(.29)).deposit,0);
 assert.equal(protectedBookingDiscount(99.99,33.33,100).discount,66.66);
 assert.equal(protectedBookingDiscount(99.99,33.33,100).balance,0);
});
test('malformed and contradictory deposit rules fail closed',()=>{
 for(const patch of [{rate:NaN},{rate:-1},{rate:101},{threshold_rate:null},{threshold_rate:10},{repeat_incident_count:0},{repeat_incident_rate:10},{incident_window_days:0},{incident_window_days:731}])assert.throws(()=>validateDepositRule({...rule,...patch}),/DEPOSIT_RULE_INVALID/);
 assert.throws(()=>bookingDepositTerms(100,rule,-1),/DEPOSIT_PRICE_INVALID/);
 assert.throws(()=>protectedBookingDiscount(100,101,20),/BOOKING_PRICE_INVALID/);
});
