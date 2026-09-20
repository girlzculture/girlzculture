import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadNodeTypescript } from './helpers/load-node-typescript.mjs';
const load=loadNodeTypescript(process.cwd());
const {buildFinanceReport,financeReportText}=load('src/lib/businessFinanceReport.ts');
const {financePdf,financeSpreadsheet,financePdfColumnGroups}=load('src/lib/businessFinanceExportServer.ts');
const {summarizeOperatingBooks}=load('src/lib/businessFinanceCore.ts');
const at='2026-09-18T16:00:00Z',salon='business-A',period={from:'2026-09-01',to:'2026-09-30',timeZone:'America/New_York'};
const books={
 sales:[{id:'sale:A',salon_id:salon,source:'platform',kind:'service',name:'Boho / Goddess Braids 丽人',occurred_at:at,recorded_at:at,status:'completed',stylist_id:'stylist-A',client_id:'customer-A',client_name:'Test client',list_cents:10000,discount_cents:0,agreed_cents:10000,cost_cents:2000,quantity:1,compensation:{kind:'commission',version:'v1',percent:20,basis:'after_discount'}},{id:'sale:P',salon_id:salon,source:'walk_in',kind:'product',name:'=HYPERLINK("https://invalid.example")',occurred_at:at,recorded_at:at,status:'completed',stylist_id:null,client_id:'customer-A',client_name:'Test client',list_cents:4000,discount_cents:0,agreed_cents:4000,cost_cents:1000,quantity:2,tax_cents:500,shipping_cents:1000,compensation:{kind:'none',version:null}}],
 payments:[{id:'dep:A',salon_id:salon,sale_id:'sale:A',occurred_at:at,stage:'deposit',method:'card',amount_cents:2000,original_payment_id:null},{id:'bal:A',salon_id:salon,sale_id:'sale:A',occurred_at:at,stage:'balance',method:'cash',amount_cents:8000,original_payment_id:null},{id:'pay:P',salon_id:salon,sale_id:'sale:P',occurred_at:at,stage:'full',method:'card',amount_cents:5500,original_payment_id:null},{id:'refund:A',salon_id:salon,sale_id:'sale:A',occurred_at:at,stage:'refund',method:'cash',amount_cents:1000,original_payment_id:'bal:A'}],
 expenses:[{id:'exp:A',salon_id:salon,occurred_at:at,category:'Supplies',amount_cents:500,treatment:'operating'}],obligations:[],compensation_payments:[],
};
const input={salonId:salon,business:'Test Beauty 丽人',scope:'business',books,names:new Map([['stylist-A','Test Stylist']]),period,generatedAt:at};

function boothBooks() {
 return {
  sales:[{...books.sales[0],id:'sale:booth',stylist_id:'stylist-booth',compensation:{kind:'booth',version:'booth-v1'}}],
  payments:[],expenses:[],
  obligations:[
   {id:'rent:current',salon_id:salon,stylist_id:'stylist-booth',due_at:at,kind:'booth_rent',amount_cents:20000,arrangement_version:'booth-v1'},
   {id:'rent:prior',salon_id:salon,stylist_id:'stylist-booth',due_at:'2026-09-01T03:59:59Z',kind:'booth_rent',amount_cents:90000,arrangement_version:'booth-v1'},
  ],
  compensation_payments:[
   {id:'rent:paid',salon_id:salon,stylist_id:'stylist-booth',occurred_at:at,obligation_id:'rent:current',kind:'booth_rent',amount_cents:7500,method:'transfer'},
   {id:'rent:future',salon_id:salon,stylist_id:'stylist-booth',occurred_at:'2026-10-01T04:00:00Z',obligation_id:'rent:current',kind:'booth_rent',amount_cents:12500,method:'cash'},
  ],
 };
}

test('booth-renter PDF and spreadsheet summaries retain rent due and received without treating them as compensation',async()=>{
 const ownBooks=boothBooks(),names=new Map([['stylist-booth','Original Booth 丽人']]);
 const canonical=summarizeOperatingBooks(salon,ownBooks,period);
 assert.equal(canonical.business_sales_cents,0,'The professional retains their service income');
 assert.equal(canonical.completed_service_sales_cents,10000);
 assert.equal(canonical.recorded_profit_cents,20000,'Rent earned is counted once; receiving part is not additional income');
 assert.equal(canonical.cash_received_cents,0,'Customer receipts do not include rent receipts');
 for(const scope of ['business','own'])for(const locale of ['en','fr','es','zh-CN']){
  const report=buildFinanceReport({...input,books:ownBooks,names,scope,locale});
  const section=report.sections.find(row=>row.key==='stylists');
  for(const label of ['Booth rent due','Booth rent received'])assert.ok(section.headers.includes(financeReportText(locale,label)),`Missing ${label} in ${scope}/${locale} export`);
  const values=section.rows[0].map(item=>item.value);
  assert.deepEqual(values,['Original Booth 丽人',1,100,0,0,0,200,75]);
  assert.deepEqual(report.period,period);assert.equal(report.currency,'USD');
  const groups=financePdfColumnGroups(section.headers.length);
  assert.ok(groups.every(group=>group.length<=5&&group[0]===0));
  assert.deepEqual(groups.flatMap(group=>group.slice(1).map(index=>values[index])),values.slice(1),'PDF continuation retains each rent column and repeats the professional');
  const summary=report.sections.find(row=>row.key==='summary').rows;
  if(scope==='business')assert.equal(summary.find(row=>row[0].value===financeReportText(locale,'Recorded profit'))[1].value,200);
  else for(const forbidden of ['Recorded profit','Business-owned sales','Operating expenses'])assert.equal(summary.some(row=>row[0].value===financeReportText(locale,forbidden)),false);
  const xlsx=await financeSpreadsheet(report),pdf=await financePdf(report);
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx);
  const sheet=workbook.getWorksheet(financeReportText(locale,'Stylist earnings'));
  assert.deepEqual(sheet.getRow(5).values.slice(1),section.headers);
  assert.deepEqual(sheet.getRow(6).values.slice(1),values);
  assert.equal(sheet.getCell('G6').type,ExcelJS.ValueType.Number);assert.equal(sheet.getCell('H6').type,ExcelJS.ValueType.Number);
  assert.equal(sheet.getCell('A3').value,'2026-09-01 - 2026-09-30 | America/New_York | USD');
  if(process.env.FINANCE_REPORT_OUTPUT){mkdirSync(process.env.FINANCE_REPORT_OUTPUT,{recursive:true});writeFileSync(path.join(process.env.FINANCE_REPORT_OUTPUT,`booth-${scope}-${locale}.pdf`),pdf);writeFileSync(path.join(process.env.FINANCE_REPORT_OUTPUT,`booth-${scope}-${locale}.xlsx`),xlsx);}
 }
});

test('booth-renter report columns retain real zero and reject foreign rent before rendering',()=>{
 const ownBooks=boothBooks();ownBooks.compensation_payments=[];
 const report=buildFinanceReport({...input,books:ownBooks,names:new Map([['stylist-booth','Original Booth 丽人']]),locale:'en'});
 assert.deepEqual(report.sections.find(row=>row.key==='stylists').rows[0].slice(-2).map(item=>item.value),[200,0]);
 for(const key of ['obligations','compensation_payments']){
  const mixed=boothBooks();mixed[key][0].salon_id='business-B';
  assert.throws(()=>buildFinanceReport({...input,books:mixed,locale:'en'}),/FINANCE_ACCESS_DENIED/);
 }
 const empty=buildFinanceReport({...input,books:{sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]},locale:'en'});
 assert.deepEqual(empty.sections.find(row=>row.key==='stylists').rows,[]);
});

test('wide daily-close PDFs retain all figures and repeat the date in readable continuation tables',()=>{
 const daily=buildFinanceReport({...input,locale:'fr'}).sections.find(section=>section.key==='daily');
 assert.ok(daily.headers.length>6);
 const groups=financePdfColumnGroups(daily.headers.length);
 assert.ok(groups.every(group=>group.length<=5&&group[0]===0));
 assert.deepEqual(groups.flatMap(group=>group.slice(1)),Array.from({length:daily.headers.length-1},(_,index)=>index+1));
 for(const values of daily.rows){
  assert.deepEqual(groups.flatMap(group=>group.slice(1).map(index=>values[index])),values.slice(1));
 }
});

test('four-language PDF and spreadsheet exports match the operating ledger and preserve original facts',async()=>{
 const summary=summarizeOperatingBooks(salon,books,period);assert.equal(summary.recorded_profit_cents,7700);assert.equal(summary.cash_received_cents,14500);
 for(const locale of ['en','fr','es','zh-CN']){
  const report=buildFinanceReport({...input,locale});const rows=report.sections.find(s=>s.key==='summary').rows;
  assert.equal(rows.find(row=>row[0].value===financeReportText(locale,'Recorded profit'))[1].value,77);
  assert.equal(rows.find(row=>row[0].value===financeReportText(locale,'Payments received'))[1].value,145);
  assert.equal(report.sections.find(s=>s.key==='activity').rows[1][1].value,1);
  const xlsx=await financeSpreadsheet(report),pdf=await financePdf(report);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length<=4,'Summary footers must not create extra blank pages');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsx);
  const summarySheet=workbook.getWorksheet(financeReportText(locale,'Income summary'));let exportedProfit;
  summarySheet.eachRow(row=>{if(row.getCell(1).value===financeReportText(locale,'Recorded profit'))exportedProfit=row.getCell(2).value;});assert.equal(exportedProfit,77);
  const sheet=workbook.getWorksheet(financeReportText(locale,'Completed sale records'));
  assert.equal(sheet.getCell('C6').value,'Boho / Goddess Braids 丽人');assert.equal(sheet.getCell('C7').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('C7').value,books.sales[1].name);
  assert.equal(workbook.getWorksheet(financeReportText(locale,'Payment records')).getCell('G9').value,'bal:A');
  assert.equal(workbook.worksheets.some(sheet=>sheet.name.includes('undefined')),false);
  if(process.env.FINANCE_REPORT_OUTPUT){mkdirSync(process.env.FINANCE_REPORT_OUTPUT,{recursive:true});writeFileSync(path.join(process.env.FINANCE_REPORT_OUTPUT,`finance-${locale}.pdf`),pdf);writeFileSync(path.join(process.env.FINANCE_REPORT_OUTPUT,`finance-${locale}.xlsx`),xlsx);}
 }
});

test('report builder rejects two-business data before either document renderer receives it',()=>{
 for(const target of ['sales','payments','expenses','obligations','compensation_payments']){
  const mixed=structuredClone(books);mixed[target].push({id:'foreign',salon_id:'business-B'});
  assert.throws(()=>buildFinanceReport({...input,books:mixed,locale:'en'}),/FINANCE_ACCESS_DENIED/);
 }
});

test('own-stylist reports exclude business profit, expenses and client names',()=>{
 const own={...structuredClone(books),sales:[books.sales[0]],payments:books.payments.filter(row=>row.sale_id==='sale:A'),expenses:[]};
 const report=buildFinanceReport({...input,books:own,scope:'own',locale:'en'});const text=JSON.stringify(report);
 for(const forbidden of ['Recorded profit','Operating expenses','Test client','HYPERLINK'])assert.equal(text.includes(forbidden),false,forbidden);
 assert.equal(report.title,'Your finance report');
});

test('binary downloads preserve refresh handling, exact error references and block account switches',async()=>{
 const {createScopedJsonApiClient}=load('src/lib/scopedApiCore.ts');const user={id:'owner-A'};let current={access_token:'old',user};let calls=0;
 const api=await createScopedJsonApiClient({scopeLabel:'salon',getSession:async()=>current,refreshSession:async()=>current={access_token:'fresh',user},fetcher:async(_url,init)=>{calls++;assert.equal(init.redirect,'manual');return calls===1?Response.json({error:'Expired'},{status:401}):new Response('PDF fixture',{headers:{'Content-Type':'application/pdf'}});}});
 assert.equal(await (await api.download('/api/salon/finances/export','application/pdf')).text(),'PDF fixture');assert.equal(calls,2);
 const changed=await createScopedJsonApiClient({getSession:async()=>current,refreshSession:async()=>current,fetcher:async()=>{current={access_token:'other',user:{id:'owner-B'}};return new Response('private-A',{headers:{'Content-Type':'application/pdf'}});}});
 await assert.rejects(()=>changed.download('/api/salon/finances/export','application/pdf'),/account changed/);
 const reference='10000000-0000-4000-8000-000000000001';
 const denied=await createScopedJsonApiClient({getSession:async()=>current,refreshSession:async()=>current,fetcher:async()=>Response.json({code:'FINANCE_ACCESS_DENIED',request_id:reference},{status:403})});
 await assert.rejects(()=>denied.download('/api/salon/finances/export','application/pdf'),error=>error.status===403&&error.requestId===reference);
});

test('export endpoint derives both business and role from authentication and returns JSON-only errors',async()=>{
 const reference='10000000-0000-4000-8000-000000000001';
 function endpoint({business='business-A',denied=false}={}){
  const reads=[],renders=[];
  const context={salon:{id:business,name:'Verified business',time_zone:'UTC'},user:{id:'owner-A'}};
  const scoped=loadNodeTypescript(process.cwd(),{
   '@/lib/supabaseAdmin':{requireSalonOwner:async()=>context},
   '@/lib/requestSecurity':{enforceRateLimit(){},RateLimitError:class extends Error{}},
   '@/lib/operationalMonitoring':{routeMonitoringProfile:()=>({}),withOperationalMonitoring:(_p,handler)=>handler},
   '@/lib/platformErrors':{capturePlatformError:async()=>reference},
   '@/lib/businessFinanceServer':{readBusinessFinances:async(ctx,dates)=>{reads.push([ctx.salon.id,dates]);if(denied)throw Error('FINANCE_ACCESS_DENIED');return {scope:{kind:'business'},books:{sales:[],payments:[],expenses:[],obligations:[],compensation_payments:[]},stylists:[]};}},
   '@/lib/businessFinanceExportServer':{financePdf:async report=>{renders.push(report);return Buffer.from('%PDF-fixture');},financeSpreadsheet:async()=>Buffer.from('xlsx')},
  });
  return{reads,renders,get:query=>scoped('src/app/api/salon/finances/export/route.ts').GET(new Request('https://fixture.invalid/api/salon/finances/export?'+query))};
 }
 const query='from=2026-09-01&to=2026-09-30&format=pdf&locale=fr';
 for(const business of ['business-A','business-B']){const api=endpoint({business});const response=await api.get(query);assert.equal(response.status,200);assert.equal(api.reads[0][0],business);assert.equal(api.renders[0].locale,'fr');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('content-type'),'application/pdf');}
 const api=endpoint();for(const invalid of [query+'&salon_id=business-B',query.replace('2026-09-01','2026-02-30'),query.replace('locale=fr','locale=wo')])assert.equal((await api.get(invalid)).status,400);assert.equal(api.reads.length,0);
 const denied=endpoint({denied:true});const response=await denied.get(query);assert.equal(response.status,403);assert.equal(response.headers.get('x-request-id'),reference);assert.equal((await response.json()).request_id,reference);assert.equal(denied.renders.length,0);
});
