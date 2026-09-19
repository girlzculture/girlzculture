import test from 'node:test';
import assert from 'node:assert/strict';
import {typescriptLoader} from './helpers/load-typescript.mjs';
const core=typescriptLoader(process.cwd())('src/lib/businessMoneyInsights.ts');
const period={from:'2026-03-08',to:'2026-03-14',timeZone:'America/New_York'};
const empty=()=>({sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]});
const sale=(id,at,cents,extra={})=>({id,salon_id:'A',source:'walk_in',kind:'service',occurred_at:at,recorded_at:at,status:'completed',name:'Silk Press',stylist_id:'person',client_id:null,client_name:null,list_cents:cents,discount_cents:0,agreed_cents:cents,cost_cents:null,quantity:1,compensation:{kind:'none',version:null},...extra});
test('money comparison uses equal calendar days across daylight saving and a null zero-base percentage',()=>{
 const result=core.businessMoneyInsights('A',empty(),period);
 assert.deepEqual(JSON.parse(JSON.stringify(result.previous_period)),{from:'2026-03-01',to:'2026-03-07',timeZone:'America/New_York'});
 assert.equal(result.sales_change_percent,null);assert.equal(result.completed_count,0);assert.equal(result.service_samples.length,0);
});
test('money insight separates pending value, completed sales, receipts and earlier unpaid balances',()=>{
 const books=empty();books.sales=[sale('old','2026-03-01T15:00:00Z',10000),sale('current','2026-03-09T15:00:00Z',12000),sale('pending','2026-03-10T15:00:00Z',8000,{status:'pending'})];
 books.payments=[{id:'deposit',salon_id:'A',sale_id:'current',occurred_at:'2026-03-09T15:00:00Z',stage:'deposit',method:'card',amount_cents:2000,original_payment_id:null}];
 const r=core.businessMoneyInsights('A',books,period);
 assert.equal(r.completed_sales_cents,12000);assert.equal(r.received_cents,2000);assert.equal(r.pending_value_cents,8000);assert.equal(r.unpaid_cents,28000);assert.equal(r.sales_change_percent,20);
 assert.equal(r.recommendations[0].kind,'balances');assert.equal(r.recommendations[0].value_cents,28000);
 assert.ok(r.recommendations.length<=2);assert.equal(r.missing_cost_count,1);
});
test('own price samples retain exact service names, period, units and discounts without inventing external comparisons',()=>{
 const books=empty();books.sales=[sale('a','2026-03-09T15:00:00Z',10000),sale('b','2026-03-09T16:00:00Z',15000,{list_cents:20000,discount_cents:5000}),sale('c','2026-03-09T17:00:00Z',30000,{quantity:2})];
 const r=core.businessMoneyInsights('A',books,period), sample=r.service_samples[0];
 assert.equal(sample.name,'Silk Press');assert.equal(sample.visits,3);assert.equal(sample.units,4);assert.equal(sample.min_unit_cents,10000);assert.equal(sample.max_unit_cents,15000);assert.equal(sample.median_unit_cents,15000);assert.equal(sample.discount_cents,5000);
 assert.equal(r.sample_scope,'own_business_completed_service_records');assert.deepEqual(r.period,period);assert.equal(r.promotion_attribution_available,false);
});
test('mixed business books fail before any recommendation or price sample is returned',()=>{
 const books=empty();books.sales=[sale('foreign','2026-03-09T15:00:00Z',99999,{salon_id:'B',name:'Private service'})];
 assert.throws(()=>core.businessMoneyInsights('A',books,period),/FINANCE_ACCESS_DENIED/);
});
test('cancelled value stays distinct from collected money and recommendations preserve the selected period',()=>{
 const books=empty();books.sales=[sale('cancel','2026-03-10T15:00:00Z',25000,{status:'cancelled'})];
 const r=core.businessMoneyInsights('A',books,period);assert.equal(r.cancelled_count,1);assert.equal(r.cancelled_value_cents,25000);assert.equal(r.received_cents,0);assert.equal(r.completed_sales_cents,0);
 assert.equal(r.recommendations[0].kind,'cancellations');assert.equal(r.recommendations[0].count,1);
});
test('future and previous records do not masquerade as current price samples or growth',()=>{
 const books=empty();books.sales=[sale('before','2026-03-08T04:59:00Z',10000),sale('inside','2026-03-08T05:00:00Z',8000),sale('future','2026-03-15T04:00:00Z',100000)];
 const r=core.businessMoneyInsights('A',books,period);assert.equal(r.completed_count,1);assert.equal(r.completed_sales_cents,8000);assert.equal(r.previous_sales_cents,10000);assert.equal(r.sales_change_percent,-20);assert.equal(r.service_samples[0].visits,1);
});
test('finance server adds whole-business insights only after scoped data validation',async()=>{
 const server=typescriptLoader(process.cwd())('src/lib/businessFinanceServer.ts');
 const data={scope:{kind:'business',stylist_id:null},sales:[],bookings:[],receipts:[],expenses:[],arrangements:[],obligations:[],compensation_payments:[],stylists:[],product_orders:[],product_refunds:[]};
 const calls=[];const context={salon:{id:'A'},user:{id:'owner-A'},admin:{rpc:async(name,args)=>{calls.push([name,args]);return {data,error:null};}}};
 assert.equal((await server.readBusinessFinances(context,period)).insights.sample_scope,'own_business_completed_service_records');
 assert.equal(calls[0][1].p_salon,'A');assert.equal(calls[0][1].p_user,'owner-A');
 data.scope={kind:'own',stylist_id:'person'};
 assert.equal((await server.readBusinessFinances(context,period)).insights,null);
 data.sales=[sale('foreign','2026-03-09T15:00:00Z',12000,{salon_id:'B',stylist_id:'person'})];
 await assert.rejects(server.readBusinessFinances(context,period),/FINANCE_ACCESS_DENIED/);
});
test('money explanation dictionaries preserve all four languages and dynamic values',()=>{
 const messages=typescriptLoader(process.cwd())('src/i18n/business-money-source-catalog.ts').BUSINESS_MONEY_SOURCE_MESSAGES;
 const tokens=s=>(s.match(/\{value\d+\}/g)||[]).sort();
 for(const locale of ['en','fr','es','zh-CN']){
  assert.deepEqual(Object.keys(messages[locale]).sort(),Object.keys(messages.en).sort());
  for(const [source,text] of Object.entries(messages[locale])){assert.ok(text.trim());assert.deepEqual(tokens(text),tokens(source));}
 }
});
