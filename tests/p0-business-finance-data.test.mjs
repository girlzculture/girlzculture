import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const {operatingBooksFromData}=load('src/lib/businessFinanceData.ts');
const {summarizeOperatingBooks}=load('src/lib/businessFinanceCore.ts');
const at='2026-09-18T16:00:00Z';
const empty=()=>({scope:{kind:'business',stylist_id:null},sales:[],bookings:[],receipts:[],expenses:[],arrangements:[],obligations:[],compensation_payments:[],stylists:[],product_orders:[],product_refunds:[]});
const booking=()=>({id:'booking-A',salon_id:'A',stylist_id:'stylist-A',customer_id:'client-A',guest_name:'Customer A',name:'Box Braids',created_at:at,appointment_datetime:at,service_completed_at:at,status:'Completed',booking_origin:'marketplace',source:'platform',estimated_total:80,subtotal_before_promotion:100,deposit_amount:10,deposit_status:'Paid',payment_mode:'live',payment_verified_at:at,verified_charge:true,operating_compensation:{kind:'none',version:null}});
const summarize=data=>{const result=operatingBooksFromData('A',data);return {...result,summary:summarizeOperatingBooks('A',result.books,{from:'2026-09-01',to:'2026-09-30',timeZone:'UTC'})};};

test('platform deposit and external chair balance reconcile to one discounted service',()=>{
  const data=empty();data.bookings=[booking()];data.receipts=[{id:'balance-A',salon_id:'A',booking_id:'booking-A',stage:'balance',method:'cash',amount_cents:7000,occurred_at:at}];
  const {books,summary}=summarize(data);assert.equal(books.sales.length,1);assert.equal(books.sales[0].list_cents,10000);assert.equal(books.sales[0].discount_cents,2000);assert.equal(summary.completed_sales_cents,8000);assert.equal(summary.cash_received_cents,8000);assert.equal(summary.by_stage.deposit,1000);assert.equal(summary.balances[0].unpaid_cents,0);
});
test('unverified provider deposits and test activity are explicitly excluded from cash',()=>{
  for(const change of [{deposit_status:'Unpaid'},{payment_mode:'unknown'},{verified_charge:false},{payment_verified_at:null}]){
    const data=empty();data.bookings=[{...booking(),...change}];const result=summarize(data);assert.equal(result.summary.cash_received_cents,0);assert.equal(result.evidence.unverified_deposit_records,1);
  }
  const data=empty();data.bookings=[{...booking(),payment_mode:'test'}];const result=summarize(data);assert.equal(result.books.sales.length,0);assert.equal(result.evidence.excluded_test_bookings,1);
});

test('private demo books include only protected sample records and explicitly recorded sample receipts',()=>{
 const data=empty();data.is_demo=true;
 data.bookings=[{...booking(),is_demo:true,payment_mode:'test',verified_charge:false,payment_verified_at:null}];
 data.receipts=[{id:'sample-payment',salon_id:'A',booking_id:'booking-A',stage:'full',method:'other',amount_cents:8000,occurred_at:at}];
 const result=summarize(data);
 assert.equal(result.summary.cash_received_cents,8000);assert.equal(result.summary.completed_sales_cents,8000);
 assert.equal(result.evidence.sample_data,true);assert.equal(result.evidence.provider_bank_settlement_verified,false);
 assert.equal(result.books.payments.length,1);assert.match(result.books.payments[0].id,/^receipt:/);
 data.is_demo=false;assert.equal(summarize(data).books.sales.length,0);
 data.is_demo=true;data.bookings[0].is_demo=false;assert.equal(summarize(data).books.sales.length,0);
 data.bookings[0].salon_id='B';assert.throws(()=>summarize(data),/FINANCE_ACCESS_DENIED/);
});
test('business-added appointment deposits are not invented provider receipts',()=>{
  const data=empty();data.bookings=[{...booking(),booking_origin:'business_added',source:'Phone'}];const result=summarize(data);assert.equal(result.books.sales[0].source,'phone');assert.equal(result.summary.cash_received_cents,0);assert.equal(result.evidence.unverified_deposit_records,1);
});
test('verified provider refund and external receipt refund retain separate original links',()=>{
  const data=empty();data.bookings=[{...booking(),refund_status:'Succeeded',refund_completed_at:at,verified_refund:true,refund_amount:2}];data.receipts=[{id:'balance-A',salon_id:'A',booking_id:'booking-A',stage:'balance',method:'cash',amount_cents:7000,occurred_at:at},{id:'refund-A',salon_id:'A',booking_id:'booking-A',stage:'refund',method:'cash',amount_cents:1000,original_payment_id:'balance-A',occurred_at:at}];
  const result=summarize(data);assert.equal(result.summary.cash_received_cents,6800);assert.equal(result.summary.net_completed_sales_cents,6800);assert.equal(result.summary.balances[0].unpaid_cents,0);
});
test('foreign records in every RPC array fail before any result can reach a model or export',()=>{
  for(const key of Object.keys(empty()).filter(key=>key!=='scope')){const data=empty();data[key].push({id:'foreign',salon_id:'B'});assert.throws(()=>operatingBooksFromData('A',data),/FINANCE_ACCESS_DENIED/,key);}
});
test('own-stylist defense rejects peer records, business expenses and missing scope binding',()=>{
  for(const key of ['sales','bookings','arrangements','obligations','compensation_payments']){const data=empty();data.scope={kind:'own',stylist_id:'stylist-A'};data[key].push({salon_id:'A',stylist_id:'stylist-peer'});assert.throws(()=>operatingBooksFromData('A',data),/FINANCE_ACCESS_DENIED/,key);}
  const data=empty();data.scope={kind:'own',stylist_id:null};assert.throws(()=>operatingBooksFromData('A',data),/FINANCE_ACCESS_DENIED/);
});

const order=()=>({id:'order-A',salon_id:'A',public_reference:'GC-P-A-1',created_at:at,fulfilled_at:at,paid_at:at,fulfillment_status:'Delivered',reservation_status:null,subtotal:100,discount_amount:0,tax_amount:8,shipping_amount:5,total_amount:113,currency:'usd',payment_mode:'live',payment_status:'Paid',verified_charge:true,items:[{product_name:'Curl cream',quantity:2,unit_price:50,line_total:100}]});
test('online merchandise, tax and shipping are distinct from receipts and prorated refunds',()=>{
  const data=empty();data.product_orders=[order()];data.product_refunds=[{id:'refund-A',salon_id:'A',order_id:'order-A',amount:56.5,status:'Succeeded',verified_refund:true,completed_at:at}];
  const {books,summary}=summarize(data);
  assert.equal(books.sales[0].name,'Curl cream × 2');assert.equal(summary.completed_product_sales_cents,10000);
  assert.equal(summary.completed_tax_cents,800);assert.equal(summary.completed_shipping_cents,500);
  assert.equal(summary.cash_received_cents,5650);assert.equal(summary.net_completed_sales_cents,5000);assert.equal(summary.balances[0].unpaid_cents,0);
  assert.equal(summary.recorded_profit_cents,5000);assert.equal(summary.costs_missing_for_sales,1);
});
test('pickup deposit and external balance fund the same product order only once',()=>{
  const data=empty();data.product_orders=[{...order(),reservation_status:'Collected',fulfillment_status:'Collected',payment_status:'Deposit paid',deposit_amount:10}];
  data.receipts=[{id:'pickup-cash',salon_id:'A',product_order_id:'order-A',stage:'balance',method:'cash',amount_cents:10300,occurred_at:at}];
  const result=summarize(data);assert.equal(result.summary.completed_sales_cents,10000);assert.equal(result.summary.cash_received_cents,11300);assert.equal(result.summary.by_stage.deposit,1000);assert.equal(result.summary.balances[0].unpaid_cents,0);
});
test('unfulfilled orders are not completed sales, and test orders never enter real books',()=>{
  const data=empty();data.product_orders=[{...order(),fulfilled_at:null,fulfillment_status:'Preparing'}];
  assert.equal(summarize(data).summary.completed_sales_cents,0);assert.equal(summarize(data).summary.cash_received_cents,11300);
  data.product_orders[0].payment_mode='test';const result=summarize(data);assert.equal(result.summary.cash_received_cents,0);assert.equal(result.evidence.excluded_test_orders,1);
  data.scope={kind:'own',stylist_id:'stylist-A'};assert.throws(()=>summarize(data),/FINANCE_ACCESS_DENIED/);
});
test('missing service prices and inconsistent product totals fail without invented values',()=>{
  const data=empty();data.bookings=[{...booking(),estimated_total:null}];assert.throws(()=>summarize(data),/FINANCE_INCOMPLETE_RECORDS/);
  data.bookings=[];data.product_orders=[{...order(),total_amount:100}];assert.throws(()=>summarize(data),/FINANCE_INVALID_RECORD/);
});
