"use client";
import {assistantTeamCopy} from '@/i18n/assistant-team-copy';
type Row=Record<string,unknown>;
export default function AssistantTeamPreview({value,locale}:{value:Row;locale:string}){
 const copy=assistantTeamCopy(locale),changes=(value.changes||{}) as Row;
 const fields=value.operation==='permissions'?{...(changes.permissions as Row||{}),...('status'in changes?{status:changes.status}:{})}:changes;
 function display(key:string,item:unknown){
  if(typeof item==='boolean')return item?copy.yes:copy.no;
  if(key==='amount_cents')return new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(Number(item)/100);
  if(key==='effective_from')return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(String(item)+'T00:00:00Z'));
  return copy[String(item)]||(typeof item==='number'?new Intl.NumberFormat(locale).format(item):String(item));
 }
 return <section data-no-translate aria-label={copy.review} className="space-y-3"><h4 className="font-semibold">{copy[String(value.operation)]}</h4><p className="break-words font-medium">{String(value.name||'')}</p><dl className="space-y-2">{Object.entries(fields).filter(([,item])=>item!==null).map(([key,item])=><div key={key}><dt className="text-xs font-semibold">{copy[key]}</dt><dd className="mt-1 break-words text-sm">{display(key,item)}</dd></div>)}</dl><p className="text-sm">{copy[value.operation==='permissions'?'permissions_notice':'arrangement_notice']}</p></section>;
}
