import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd(),{}, {URLSearchParams});
const {financeWorkspaceState}=load('src/lib/financeWorkspace.ts');
const {financeDailyClose}=load('src/lib/financeDailyClose.ts');
const {buildFinanceReport}=load('src/lib/businessFinanceReport.ts');
test('finance query validates dates and keeps tab/search/balance without accepting data or scope',()=>{
 const state=financeWorkspaceState(new URLSearchParams('finance=reports&finance_from=2026-02-31&finance_to=2026-04-01&finance_search=Silk&finance_balance=unpaid&salon_id=other'),'2026-09-18','America/New_York');
 assert.deepEqual(JSON.parse(JSON.stringify(state)),{tab:'reports',from:'2026-09-01',to:'2026-09-18',search:'Silk',balance:'unpaid'});
 assert.equal(financeWorkspaceState(new URLSearchParams('finance=other'),'2026-09-18','UTC').tab,'overview');
});
test('daily close separates earlier deposits, chair cash, refunds and expenses and agrees with export',()=>{
 const books={sales:[{id:'sale:one',salon_id:'A',source:'platform',kind:'service',occurred_at:'2026-09-18T17:00:00Z',recorded_at:'2026-09-16T12:00:00Z',status:'completed',name:'Silk Press',stylist_id:'one',client_id:null,client_name:null,list_cents:10000,discount_cents:0,agreed_cents:10000,cost_cents:null,quantity:1,compensation:{kind:'none',version:null}}],payments:[{id:'deposit',salon_id:'A',sale_id:'sale:one',occurred_at:'2026-09-18T02:00:00Z',stage:'deposit',method:'card',amount_cents:2000,original_payment_id:null},{id:'chair',salon_id:'A',sale_id:'sale:one',occurred_at:'2026-09-18T17:00:00Z',stage:'balance',method:'cash',amount_cents:8000,original_payment_id:null},{id:'refund',salon_id:'A',sale_id:'sale:one',occurred_at:'2026-09-18T18:00:00Z',stage:'refund',method:'cash',amount_cents:1000,original_payment_id:'chair'}],expenses:[{id:'expense',salon_id:'A',occurred_at:'2026-09-18T16:00:00Z',category:'Supplies',amount_cents:500,treatment:'operating'},{id:'stock',salon_id:'A',occurred_at:'2026-09-18T16:00:00Z',category:'Inventory',amount_cents:1500,treatment:'inventory_asset'}],obligations:[],compensation_payments:[]};
 const period={from:'2026-09-17',to:'2026-09-18',timeZone:'America/New_York'};
 const days=financeDailyClose('A',books,period);assert.equal(days.length,2);
 assert.equal(days[0].day,'2026-09-17');assert.equal(days[0].sales_cents,0);assert.equal(days[0].receipts_cents,2000);
 const today=days[1];assert.equal(today.sales_cents,10000);assert.equal(today.receipts_cents,7000);assert.equal(today.methods.cash,7000);assert.equal(today.refunds_cents,1000);assert.equal(today.operating_expenses_cents,500);assert.equal(today.inventory_purchases_cents,1500);
 for(const locale of ['en','fr','es','zh-CN']){
  const report=buildFinanceReport({salonId:'A',business:'Fixture',scope:'business',books,names:new Map(),period,locale,generatedAt:'2026-09-18T20:00:00Z'});
  const daily=report.sections.find(s=>s.key==='daily');assert.equal(daily.rows.length,2);assert.deepEqual(Array.from(daily.rows[1].slice(1),cell=>cell.value),[1,100,70,70,0,0,0,10,5,15]);
 }
 assert.throws(()=>financeDailyClose('B',books,period),/FINANCE_ACCESS_DENIED/);
});
