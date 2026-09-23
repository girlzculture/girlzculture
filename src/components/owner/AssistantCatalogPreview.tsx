"use client";
import {assistantCatalogCopy} from "@/i18n/assistant-catalog-copy";
type Row=Record<string,unknown>;
export default function AssistantCatalogPreview({value,locale}:{value:Row;locale:string}){
 const copy=assistantCatalogCopy(locale),changes=(value.changes||{}) as Row,values=(value.values||{}) as Row;
 const money=new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}),number=new Intl.NumberFormat(locale);
 function display(key:string,item:unknown){
  if(key==="assigned_service_ids")return item===null?copy.all:Array.isArray(item)&&!item.length?copy.none:Array.isArray(value.assignment_names)?value.assignment_names.join(", "):copy.unset;
  if(key==="target_ids")return Array.isArray(value.target_names)?value.target_names.join(", ")||copy.none:copy.unset;
  if(item==null)return copy.unset;
  if(typeof item==="boolean")return item?copy.yes:copy.no;
  if(typeof item==="number")return ["base_price","price_display_min","price_display_max","price","sale_price","shipping_price"].includes(key)?money.format(item):key==="discount_value"?values.promotion_type==="percentage"?number.format(item)+"%":money.format(item):number.format(item);
  if(Array.isArray(item))return item.join(", ");
  return ["status","product_status","promotion_type","target_scope"].includes(key)?copy[String(item)]||String(item):String(item);
 }
 return <section data-no-translate aria-label={copy.review} className="space-y-3"><h4 className="font-semibold">{copy.review}</h4><p className="break-words">{String(values.name||values.title||"")}</p><dl className="space-y-2">{Object.entries(changes).filter(([key])=>key!=="master_style_id").map(([key,item])=><div key={key}><dt className="text-xs font-semibold">{copy[key]||key}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm">{display(key,item)}</dd></div>)}</dl></section>;
}
