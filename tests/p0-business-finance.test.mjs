import test from 'node:test';
import assert from 'node:assert/strict';
import { typescriptLoader } from './helpers/load-typescript.mjs';
const load=typescriptLoader(process.cwd());
const core=load('src/lib/businessFinanceCore.ts');
const salon='business-A',other='business-B';
const at='2026-09-18T16:00:00Z';
const period={from:'2026-09-01',to:'2026-09-30',timeZone:'America/New_York'};
const empty=()=>({sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]});
const sale=(changes={})=>({id:'sale-1',salon_id:salon,source:'platform',kind:'service',occurred_at:at,recorded_at:at,status:'completed',name:'Braids',stylist_id:'stylist-A',client_id:null,client_name:null,list_cents:10000,discount_cents:0,agreed_cents:10000,cost_cents:null,quantity:1,compensation:{kind:'none',version:null},...changes});
const payment=(id,stage,amount_cents,changes={})=>({id,salon_id:salon,sale_id:'sale-1',occurred_at:at,stage,method:'card',amount_cents,original_payment_id:null,...changes});
const summary=books=>core.summarizeOperatingBooks(salon,books,period);

test('unpaid and incomplete statuses never count as collected deposits',()=>{
  const legacy=load('src/lib/financeLedgerCore.ts');
  for(const deposit_status of ['Unpaid','Payment incomplete','Not paid','Pending','Failed']) assert.equal(legacy.bookingTransaction({deposit_status,deposit_amount:20}).deposit_collected,0,deposit_status);
  for(const deposit_status of ['Paid','Succeeded','Refund pending','Partially refunded']) assert.equal(legacy.bookingTransaction({deposit_status,deposit_amount:20}).deposit_collected,20,deposit_status);
});

test('$100 sale with $20 card deposit and $80 cash balance is $100 received, never $120 or $200',()=>{
  const books=empty();books.sales=[sale()];books.payments=[payment('dep','deposit',2000),payment('bal','balance',8000,{method:'cash'})];
  const s=summary(books);assert.equal(s.cash_received_cents,10000);assert.equal(s.completed_sales_cents,10000);assert.equal(s.by_method.card,2000);assert.equal(s.by_method.cash,8000);assert.equal(s.by_stage.deposit,2000);assert.equal(s.balances[0].unpaid_cents,0);assert.equal(s.visits,1);assert.equal(s.identified_clients,0);assert.equal(s.unnamed_visits,1);assert.equal(s.costs_missing_for_sales,1);assert.equal(s.expenses_completeness_verified,false);
});

test('future booked balance and deposits are distinct from completed sales, cancellation discharges debt',()=>{
  const books=empty();books.sales=[sale({status:'pending',occurred_at:'2026-10-20T16:00:00Z'})];books.payments=[payment('dep','deposit',2000)];
  let s=summary(books);assert.equal(s.completed_sales_cents,0);assert.equal(s.cash_received_cents,2000);assert.equal(s.balances[0].unpaid_cents,8000);
  books.sales[0].status='cancelled';books.payments.push(payment('refund','refund',2000,{original_payment_id:'dep'}));s=summary(books);assert.equal(s.cash_received_cents,0);assert.equal(s.balances[0].unpaid_cents,0);assert.equal(s.recognized_refunds_cents,0);
});

test('refunds reduce cash and recognized sales once, do not reopen a settled debt',()=>{
  const books=empty();books.sales=[sale()];books.payments=[payment('full','full',10000),payment('refund','refund',2000,{original_payment_id:'full'})];
  const s=summary(books);assert.equal(s.cash_received_cents,8000);assert.equal(s.completed_sales_cents,10000);assert.equal(s.net_completed_sales_cents,8000);assert.equal(s.business_sales_cents,8000);assert.equal(s.balances[0].unpaid_cents,0);
  books.payments.push(payment('duplicate','refund',9000,{original_payment_id:'full'}));assert.throws(()=>summary(books),/FINANCE_REFUND_EXCEEDS_RECEIPT/);
});

test('recorded expenses, inventory cost and compensation count once; payouts are not a second expense',()=>{
  const books=empty();books.sales=[sale({cost_cents:1000,discount_cents:2000,agreed_cents:8000,compensation:{kind:'commission',version:'v1',basis:'after_discount',percent:50}}),sale({id:'product',kind:'product',stylist_id:null,agreed_cents:4000,list_cents:4000,cost_cents:1500})];
  books.expenses=[{id:'restock',salon_id:salon,occurred_at:at,category:'Stock',amount_cents:5000,treatment:'inventory_asset'},{id:'expense',salon_id:salon,occurred_at:at,category:'Rent',amount_cents:1000,treatment:'operating'}];
  books.compensation_payments=[{id:'payout',salon_id:salon,stylist_id:'stylist-A',occurred_at:at,obligation_id:null,kind:'commission',amount_cents:4000,method:'transfer'}];
  const s=summary(books);assert.equal(s.business_sales_cents,12000);assert.equal(s.commission_earned_cents,4000);assert.equal(s.cost_of_sales_cents,2500);assert.equal(s.operating_expenses_cents,1000);assert.equal(s.recorded_profit_cents,4500);assert.equal(s.by_stylist['stylist-A'].paid_cents,4000);assert.equal(s.inventory_purchases_cents,5000);
});

test('booth stylist turnover belongs to the stylist; rent and employee wages come from actual agreements',()=>{
  const books=empty();books.sales=[sale({compensation:{kind:'booth',version:'booth-v1'}})];
  books.obligations=[{id:'rent',salon_id:salon,stylist_id:'stylist-A',due_at:at,kind:'booth_rent',amount_cents:25000,arrangement_version:'booth-v1'},{id:'wage',salon_id:salon,stylist_id:'stylist-B',due_at:at,kind:'wage',amount_cents:12000,arrangement_version:'wage-v1'}];
  const s=summary(books);assert.equal(s.completed_service_sales_cents,10000);assert.equal(s.business_sales_cents,0);assert.equal(s.commission_earned_cents,0);assert.equal(s.rent_earned_cents,25000);assert.equal(s.wage_due_cents,12000);assert.equal(s.recorded_profit_cents,13000);
});

test('partial refunds across months reverse snapshotted commission exactly including cent rounding',()=>{
  const books=empty();books.sales=[sale({list_cents:100,agreed_cents:100,compensation:{kind:'commission',version:'v1',basis:'after_discount',percent:1}})];books.payments=[payment('full','full',100),payment('r1','refund',33,{original_payment_id:'full'}),payment('r2','refund',33,{original_payment_id:'full'}),payment('r3','refund',34,{original_payment_id:'full',occurred_at:'2026-10-01T16:00:00Z'})];
  const september=summary(books);const october=core.summarizeOperatingBooks(salon,books,{...period,from:'2026-10-01',to:'2026-10-31'});
  assert.equal(september.commission_earned_cents+october.commission_earned_cents,0);assert.equal(september.cash_received_cents+october.cash_received_cents,0);
});

test('calendar period follows business timezone, not UTC or browser date',()=>{
  const books=empty();books.sales=[sale({occurred_at:'2026-10-01T02:00:00Z'})];assert.equal(summary(books).visits,1);assert.equal(core.summarizeOperatingBooks(salon,books,{...period,timeZone:'UTC'}).visits,0);
  assert.throws(()=>core.validateFinancePeriod({...period,from:'2026-02-30'}));assert.throws(()=>core.validateFinancePeriod({...period,from:'2026-10-01'}));
});

test('two-business isolation rejects foreign sales, receipts, expenses, wages and payouts before summaries',()=>{
  for(const table of ['sales','payments','expenses','obligations','compensation_payments']){
    const books=empty();books.sales=[sale()];books[table].push({id:'foreign',salon_id:other});assert.throws(()=>summary(books),/FINANCE_ACCESS_DENIED/,table);
  }
  const books=empty();books.sales=[sale()];books.payments=[payment('foreign-link','full',100,{sale_id:'business-B-sale'})];assert.throws(()=>summary(books),/FINANCE_INVALID_RECORD/);
});

test('strict decimal parsing and duplicate detection prevent silent malformed money and duplicate events',()=>{
  assert.equal(core.moneyCents('12.50'),1250);assert.equal(core.moneyCents('0'),0);
  for(const value of ['','1.005','-1','1e3','Infinity',null,{},'15,000'])assert.throws(()=>core.moneyCents(value),/FINANCE_INVALID_AMOUNT/);
  const books=empty();books.sales=[sale(),sale()];assert.throws(()=>summary(books),/FINANCE_DUPLICATE_RECORD/);
});

test('outstanding compensation includes earlier earned amounts, payment history and later refunds once',()=>{
  const books=empty();books.sales=[sale({occurred_at:'2026-08-15T16:00:00Z',compensation:{kind:'commission',version:'v1',basis:'after_discount',percent:50}})];
  books.payments=[payment('full','full',10000,{occurred_at:'2026-08-15T16:00:00Z'}),payment('refund','refund',2000,{original_payment_id:'full'})];
  books.compensation_payments=[{id:'payout',salon_id:salon,stylist_id:'stylist-A',occurred_at:at,obligation_id:null,kind:'commission',amount_cents:3000,method:'cash'}];
  const s=summary(books),position=s.compensation_position['stylist-A'];
  assert.equal(s.commission_earned_cents,-1000);assert.equal(position.commission_earned_cents,4000);assert.equal(position.compensation_outstanding_cents,1000);
  books.compensation_payments[0].amount_cents=4500;assert.equal(summary(books).compensation_position['stylist-A'].advance_cents,500);
});

test('report presets use calendar weeks, quarters and leap-year boundaries without browser timezone shifts',()=>{
  assert.deepEqual({...core.financePeriodToDate('2026-01-04','week')},{from:'2025-12-29',to:'2026-01-04'});
  assert.deepEqual({...core.financePeriodToDate('2028-02-29','month')},{from:'2028-02-01',to:'2028-02-29'});
  assert.deepEqual({...core.financePeriodToDate('2026-12-31','quarter')},{from:'2026-10-01',to:'2026-12-31'});
  assert.deepEqual({...core.financePeriodToDate('2026-04-01','year')},{from:'2026-01-01',to:'2026-04-01'});
});
