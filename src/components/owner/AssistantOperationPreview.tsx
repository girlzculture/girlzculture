"use client";
import Image from "next/image";
import {assistantOperationsCopy} from "@/i18n/assistant-operations-copy";
type Row=Record<string,unknown>;
export default function AssistantOperationPreview({value,locale}:{value:Row;locale:string}){
 const copy=assistantOperationsCopy(locale),changes=(value.changes||{}) as Row;
 const label=(key:string)=>copy[key as keyof typeof copy]||key;
 function fields(row:Row):React.ReactNode{return <dl className="space-y-2">{Object.entries(row).filter(([key])=>!["url","source_locale","locale"].includes(key)).map(([key,item])=><div key={key}><dt className="text-xs font-semibold">{label(key)}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm">{item&&typeof item==="object"?fields(item as Row):typeof item==="boolean"?item?copy.yes:copy.no:key==="cost_cents"?new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(Number(item)/100):["kind","category","fulfillment_status"].includes(key)?label(String(item)):String(item??"—")}</dd></div>)}</dl>;}
 const patch=(changes.patch||changes) as Row;
 return <div data-no-translate className="space-y-3"><h4 className="font-semibold">{label(String(value.operation))}</h4>{value.record_name?<p className="text-sm">{String(value.record_name)}</p>:null}{typeof changes.url==="string"?<Image unoptimized loading="eager" src={changes.url} alt={copy.photo} width={180} height={135} className="h-auto max-h-36 w-auto max-w-[180px] rounded-lg object-contain"/>:null}{fields(patch)}{value.operation==="product_fulfillment"?<p className="text-sm">{copy.status_only}</p>:null}</div>;
}
