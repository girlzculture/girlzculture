"use client";
import {assistantControlsCopy} from '@/i18n/assistant-controls-copy';
type Row=Record<string,unknown>;
export default function AssistantControlsPreview({value,locale}:{value:Row;locale:string}){
 const copy=assistantControlsCopy(locale),changes=(value.changes||{}) as Row,values=(value.values||{}) as Row,names=(value.names||{}) as Row;
 function display(key:string,item:unknown):string{
  if(key.endsWith('_ids'))return Array.isArray(names[key])&&names[key].length?names[key].join(', '):copy.all;
  if(item===null)return key==='reminder_hours'?copy.default:copy.unset;
  if(typeof item==='boolean')return item?copy.yes:copy.no;
  if(Array.isArray(item))return item.join(', ');
  if(typeof item==='number')return new Intl.NumberFormat(locale,key==='travel_fee_cents'?{style:'currency',currency:'USD'}:{}).format(key==='travel_fee_cents'?item/100:item);
  return String(item);
 }
 return <section data-no-translate aria-label={copy.review} className="space-y-3"><h4 className="font-semibold">{copy[String(value.section)]}</h4><dl className="space-y-2">{Object.entries(changes).map(([key,item])=><div key={key}><dt className="text-xs font-semibold">{copy[key]}</dt><dd className="mt-1 break-words text-sm">{display(key,item)}</dd></div>)}</dl>{value.public_address?<p className="text-sm"><strong>{copy.public_address}: </strong>{String(value.public_address)}</p>:null}{value.section==='location'?<p className="text-sm">{copy.location_notice}</p>:value.section==='notifications'?<p className="text-sm">{copy.notification_notice}</p>:['deposits','booking'].includes(String(value.section))?<p className="text-sm">{copy.deposit_notice}</p>:value.section==='growth'?<p className="text-sm">{copy.growth_notice}</p>:values.enabled?<p className="text-sm">{copy.contact_notice}</p>:null}</section>;
}
