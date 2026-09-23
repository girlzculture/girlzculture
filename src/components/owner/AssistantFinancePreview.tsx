"use client";
import {assistantFinanceCopy} from "@/i18n/assistant-finance-record-copy";
type Row=Record<string,unknown>;
export default function AssistantFinancePreview({value,locale}:{value:Row;locale:string}){
 const copy=assistantFinanceCopy(locale),payload=(value.finance_payload||{}) as Row;
 const amount=new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(Number(value.amount_cents)/100);
 const date=new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:String(value.time_zone||"America/New_York")}).format(new Date(String(value.occurred_at)));
 const rows=[ [copy.record,copy[value.action as "expense"|"receipt"|"refund"]], [copy.category,value.record_label], [copy.amount,amount],[copy.date,date],
  ...(payload.treatment?[[copy.treatment,copy[payload.treatment as "operating"|"inventory_asset"]]]:[]),
  ...(payload.method?[[copy.method,copy[payload.method as "cash"|"card"|"transfer"|"other"]]]:[]),[copy.note,payload.note] ];
 return <div data-no-translate className="space-y-3"><p className="text-sm">{copy.intro}</p><dl className="space-y-2">{rows.map(([label,text],index)=><div key={index}><dt className="text-xs font-semibold">{String(label)}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm">{String(text||'—')}</dd></div>)}</dl></div>;
}
