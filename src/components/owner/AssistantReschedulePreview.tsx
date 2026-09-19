"use client";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {rescheduleAssistantCopy} from "@/i18n/assistant-reschedule-copy";
export default function AssistantReschedulePreview({value,locale}:{value:Record<string,unknown>;locale:string}){
 const {formatCurrency,formatDate,formatNumber}=useI18n();const c=rescheduleAssistantCopy(locale);const zone=String(value.time_zone||"America/New_York");
 const when=(v:unknown)=>formatDate(String(v),{dateStyle:"medium",timeStyle:"short",timeZone:zone});
 const rows=[[c.customer,value.customer_name],[c.reference,value.public_reference],[c.current,when(value.previous_appointment_datetime)],[c.proposed,when(value.appointment_datetime)],[c.professional,value.professional_name],[c.service,value.service_name],[c.duration,formatNumber(Number(value.duration_hours))],[c.total,value.estimated_total==null?null:formatCurrency(Number(value.estimated_total))],[c.deposit,value.deposit_amount==null?null:formatCurrency(Number(value.deposit_amount))],[c.reason,value.reason],[c.message,value.message]];
 return <div data-no-translate><p className="text-sm leading-6">{c.intro}</p><dl className="mt-4 space-y-3">{rows.map(([label,v])=><div key={String(label)}><dt className="text-xs font-semibold">{String(label)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{v?String(v):c.unavailable}</dd></div>)}</dl></div>;
}
