import { summarizeOperatingBooks, financeSalePayable, type OperatingBooks, type FinancePeriod } from '@/lib/businessFinanceCore';
import { BUSINESS_FINANCE_SOURCE_MESSAGES } from '@/i18n/business-finance-source-catalog';
import {financeDailyClose} from '@/lib/financeDailyClose';

export const FINANCE_REPORT_LOCALES = ['en', 'fr', 'es', 'zh-CN'] as const;
export type FinanceReportLocale = typeof FINANCE_REPORT_LOCALES[number];
export type ReportCell = { value: string | number; kind?: 'money' | 'count' };
export type ReportSection = { key: string; title: string; headers: string[]; rows: ReportCell[][]; detail?: boolean };
export type FinanceReport = { title: string; business: string; locale: FinanceReportLocale; period: FinancePeriod; currency: 'USD'; generatedAt: string; notes: string[]; sections: ReportSection[] };
const terms: Record<string,string>={cash:'Cash',card:'Card',transfer:'Transfer',other:'Other',platform:'Platform booking',walk_in:'Walk-in',phone:'Phone',social:'Social media',deposit:'Deposit',balance:'Balance',full:'Full payment',refund:'Refund',commission:'Commission',wage:'Wages',booth_rent:'Booth rent',operating:'Operating expense',inventory_asset:'Inventory purchase — cost when sold'};
export const financeReportText = (locale: FinanceReportLocale, source: string) => {
  const label=terms[source]||source;return BUSINESS_FINANCE_SOURCE_MESSAGES[locale]?.[label] || label;
};
const cell = (value: string | number, kind?: ReportCell['kind']): ReportCell => ({ value, kind });
const cash = (value: number) => cell(value / 100, 'money');

/** The only source of export totals is the same scoped operating ledger as the
 * dashboard and assistant. Never accept a caller-supplied summary or business. */
export function buildFinanceReport(input: { salonId: string; business: string; scope: 'business' | 'own'; books: OperatingBooks; names: ReadonlyMap<string,string>; period: FinancePeriod; locale: FinanceReportLocale; generatedAt: string }): FinanceReport {
  if (!FINANCE_REPORT_LOCALES.includes(input.locale) || !['business','own'].includes(input.scope)) throw Error('FINANCE_INVALID_RECORD');
  const s = summarizeOperatingBooks(input.salonId,input.books,input.period);
  const t = (text: string) => financeReportText(input.locale,text);
  const day = (at: string) => new Intl.DateTimeFormat('en-CA',{timeZone:input.period.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at)).filter(part=>['year','month','day'].includes(part.type));
  const key = (at: string) => { const parts=day(at);return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-'); };
  const within = (at: string) => key(at)>=input.period.from && key(at)<=input.period.to;
  const date = (at: string) => new Intl.DateTimeFormat(input.locale,{dateStyle:'medium',timeStyle:'short',timeZone:input.period.timeZone}).format(new Date(at));
  const name = (id: string | null) => id ? input.names.get(id) || t('Unassigned') : t('Unassigned');
  const sections: ReportSection[] = [];
  const add = (id: string,title: string,headers: string[],rows: ReportCell[][],detail=false) => sections.push({key:id,title:t(title),headers:headers.map(t),rows,detail});
  const metrics: [string,number][] = [
    ['Completed service sales',s.completed_service_sales_cents],['Completed product sales',s.completed_product_sales_cents],['Recognized sales refunds',s.recognized_refunds_cents],['Net completed sales',s.net_completed_sales_cents],
    ['Payments received',s.cash_received_cents],['Collected deposits',s.by_stage.deposit],['Balance payments',s.by_stage.balance],['Full payments',s.by_stage.full],['Recorded refunds',s.by_stage.refund],['Unpaid balances',s.balances.reduce((sum,row)=>sum+row.unpaid_cents,0)],
  ];
  if(input.scope==='business')metrics.push(['Business-owned sales',s.business_sales_cents],['Rent earned',s.rent_earned_cents],['Operating expenses',s.operating_expenses_cents],['Cost of sales',s.cost_of_sales_cents],['Commission earned',s.commission_earned_cents],['Wages due',s.wage_due_cents],['Recorded profit',s.recorded_profit_cents],['Inventory purchases',s.inventory_purchases_cents],['Product tax',s.completed_tax_cents],['Product shipping',s.completed_shipping_cents]);
  add('summary','Income summary',['Measure','Amount'],metrics.map(([label,value])=>[cell(t(label)),cash(value)]));
  add('activity','Client activity',['Measure','Count'],[['Visits',s.visits],['Identified clients',s.identified_clients],['Unnamed visits',s.unnamed_visits]].map(([label,value])=>[cell(t(String(label))),cell(Number(value),'count')]));
  add('methods','Payment methods',['Payment method','Amount'],Object.entries(s.by_method).map(([method,value])=>[cell(t(method)),cash(value)]));
  add('sources','Completed sales by source',['Source','Completed sales'],Object.entries(s.by_source).map(([source,value])=>[cell(t(source)),cash(value)]));
  add('services','Sales by service or product',['Service or product','Completed sales'],Object.entries(s.by_service).sort((a,b)=>b[1]-a[1]).map(([service,value])=>[cell(service),cash(value)]));
  add('daily','Daily close',['Date','Visits','Completed sales','Payments received','Cash','Card','Transfer','Other','Recorded refunds',...(input.scope==='business'?['Operating expenses','Inventory purchases']:[])],financeDailyClose(input.salonId,input.books,input.period).map(row=>[cell(new Intl.DateTimeFormat(input.locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${row.day}T12:00:00Z`))),cell(row.visits,'count'),cash(row.sales_cents),cash(row.receipts_cents),cash(row.methods.cash),cash(row.methods.card),cash(row.methods.transfer),cash(row.methods.other),cash(row.refunds_cents),...(input.scope==='business'?[cash(row.operating_expenses_cents),cash(row.inventory_purchases_cents)]:[])]));
  add('stylists','Stylist earnings',['Stylist','Visits','Service sales','Commission earned','Wages due','Compensation paid','Booth rent due','Booth rent received'],Object.entries(s.by_stylist).map(([id,row])=>[cell(name(id)),cell(row.visits,'count'),cash(row.service_sales_cents),cash(row.commission_earned_cents),cash(row.wage_due_cents),cash(row.paid_cents),cash(row.booth_rent_due_cents),cash(row.booth_rent_paid_cents)]));
  if(input.scope==='business')add('expenses','Expense categories',['Category','Operating expenses'],Object.entries(s.expense_categories).map(([category,value])=>[cell(category),cash(value)]));
  const sales = new Map(input.books.sales.map(sale=>[sale.id,sale]));
  add('sales','Completed sale records',['Reference','Date','Service or product','Source','Stylist','Listed price','Discount','Agreed price','Product tax','Product shipping'],input.books.sales.filter(sale=>sale.status==='completed'&&within(sale.occurred_at)).map(sale=>[cell(sale.id),cell(date(sale.occurred_at)),cell(sale.name),cell(t(sale.source)),cell(name(sale.stylist_id)),cash(sale.list_cents),cash(sale.discount_cents),cash(sale.agreed_cents),cash(sale.tax_cents||0),cash(sale.shipping_cents||0)]),true);
  add('receipts','Payment records',['Reference','Sale reference','Date','Stage','Payment method','Amount','Original payment'],input.books.payments.filter(row=>within(row.occurred_at)).map(row=>[cell(row.id),cell(row.sale_id),cell(date(row.occurred_at)),cell(t(row.stage)),cell(t(row.method)),cash(row.stage==='refund'?-row.amount_cents:row.amount_cents),cell(row.original_payment_id||'')]),true);
  add('balances','Balances as of period end',['Sale reference','Service or product','Agreed payable','Payments received','Unpaid balances'],s.balances.map(row=>[cell(row.sale_id),cell(sales.get(row.sale_id)!.name),cash(financeSalePayable(sales.get(row.sale_id)!)),cash(row.received_cents),cash(row.unpaid_cents)]),true);
  if(input.scope==='business')add('expense-records','Expense records',['Reference','Date','Category','Treatment','Amount'],input.books.expenses.filter(row=>within(row.occurred_at)).map(row=>[cell(row.id),cell(date(row.occurred_at)),cell(row.category),cell(t(row.treatment)),cash(row.amount_cents)]),true);
  add('compensation-records','Compensation payment records',['Reference','Date','Stylist','Arrangement type','Payment method','Amount'],input.books.compensation_payments.filter(row=>within(row.occurred_at)).map(row=>[cell(row.id),cell(date(row.occurred_at)),cell(name(row.stylist_id)),cell(t(row.kind)),cell(t(row.method)),cash(row.amount_cents)]),true);
  if(sections.reduce((count,section)=>count+section.rows.length,0)>10000)throw Error('FINANCE_EXPORT_TOO_LARGE');
  return {title:t(input.scope==='own'?'Your finance report':'Business finance report'),business:input.business,locale:input.locale,period:input.period,currency:'USD',generatedAt:input.generatedAt,sections,notes:[
    t('Payment methods and deposits are parts of the same receipts, not additional sales.'),
    t('Sales follow completion dates; payments and expenses follow their recorded dates. Balances are as of the reporting period end.'),
    t('Identified clients use linked customer identities. Named and unnamed walk-ins are not assumed to be distinct people.'),
    ...(input.scope==='business'?[t('Based on recorded sales and costs. Missing expenses or service costs mean this is not an exact margin.')]:[]),
    t('Product sales exclude sales tax and shipping. Product refunds use a proportional merchandise allocation. Tax treatment and bank settlement must be reconciled separately.'),
    t('Organized business records for your accountant. This report does not file or certify a tax return.'),
  ]};
}
