import {assertOperatingBooksScope,validateFinancePeriod,type OperatingBooks,type FinancePeriod,type FinanceMethod} from '@/lib/businessFinanceCore';
export type FinanceCloseDay={day:string;visits:number;sales_cents:number;receipts_cents:number;refunds_cents:number;methods:Record<FinanceMethod,number>;operating_expenses_cents:number;inventory_purchases_cents:number};

/** Transaction dates and service completion dates answer different questions.
 * Build both columns from the same authorized ledger without counting a
 * deposit again when the remaining balance is paid on another day. */
export function financeDailyClose(salonId:string,books:OperatingBooks,period:FinancePeriod){
 assertOperatingBooksScope(salonId,books);validateFinancePeriod(period);
 const days=new Map<string,FinanceCloseDay>();
 const format=new Intl.DateTimeFormat('en-CA',{timeZone:period.timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
 const at=(value:string)=>{const parts=format.formatToParts(new Date(value));return ['year','month','day'].map(key=>parts.find(p=>p.type===key)?.value).join('-');};
 const day=(value:string)=>{
  const key=at(value);if(key<period.from||key>period.to)return null;
  if(!days.has(key))days.set(key,{day:key,visits:0,sales_cents:0,receipts_cents:0,refunds_cents:0,methods:{cash:0,card:0,transfer:0,other:0},operating_expenses_cents:0,inventory_purchases_cents:0});
  return days.get(key)!;
 };
 for(const sale of books.sales)if(sale.status==='completed'){const row=day(sale.occurred_at);if(row){row.sales_cents+=sale.agreed_cents;if(sale.kind==='service')row.visits++;}}
 for(const receipt of books.payments){const row=day(receipt.occurred_at);if(!row)continue;const signed=receipt.stage==='refund'?-receipt.amount_cents:receipt.amount_cents;row.receipts_cents+=signed;row.methods[receipt.method]+=signed;if(receipt.stage==='refund')row.refunds_cents+=receipt.amount_cents;}
 for(const expense of books.expenses){const row=day(expense.occurred_at);if(row)row[expense.treatment==='operating'?'operating_expenses_cents':'inventory_purchases_cents']+=expense.amount_cents;}
 return [...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
