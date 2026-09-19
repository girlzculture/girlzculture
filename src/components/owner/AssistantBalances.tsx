"use client";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { assistantBalancesCopy } from "@/i18n/assistant-balances-copy";
type Entry = { record:string;client_name:string|null;service_name:string;unpaid_cents:number;href:string };
type Result = { available:boolean;as_of_day:string;completed:Entry[];pending:Entry[];completed_count:number;pending_count:number };
export default function AssistantBalances({value,onNavigate}:{value:unknown;onNavigate:()=>void}) {
  const {locale,formatCurrency}=useI18n(),copy=assistantBalancesCopy(locale),result=value as Result;
  if(!result||typeof result.available!=="boolean")return null;
  return <section className="ml-0 space-y-3 rounded-xl border border-border bg-white p-3 text-sm sm:ml-11" aria-label={copy.title}>
    <h3 className="font-semibold">{copy.title}</h3><p className="text-xs">{copy.asOf} <span data-no-translate>{result.as_of_day}</span></p>
    {!result.available?<p>{copy.incomplete}</p>:<>{([['completed',copy.completed],['pending',copy.pending]] as const).map(([key,label])=><section key={key}><h4 className="font-semibold">{label} ({result[`${key}_count`]})</h4><ul className="space-y-2">{result[key].slice(0,12).map(item=><li key={item.record} className="mt-2 rounded-lg bg-subtle p-2"><p data-no-translate>{item.client_name||copy.unnamed} · {item.service_name}</p><p>{formatCurrency(item.unpaid_cents/100)}</p>{item.href.startsWith('/salon/dashboard/earnings?')?<Link className="inline-flex min-h-11 items-center break-words text-primary underline" href={item.href} onClick={onNavigate}>{copy.open}</Link>:null}</li>)}</ul></section>)}<p className="text-xs">{copy.caveat}</p>{result.completed_count>12||result.pending_count>12?<p className="text-xs">{copy.limited}</p>:null}</>}
    <Link className="inline-flex min-h-11 items-center text-primary underline" href="/salon/dashboard/earnings?finance=transactions&finance_balance=unpaid" onClick={onNavigate}>{copy.all}</Link>
  </section>;
}
