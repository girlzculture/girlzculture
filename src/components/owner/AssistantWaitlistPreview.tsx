"use client";
import {assistantWaitlistCopy} from '@/i18n/assistant-waitlist-copy';
export default function AssistantWaitlistPreview({value,locale}:{value:Record<string,unknown>;locale:string}){
 const copy=assistantWaitlistCopy(locale),message=(value.notification_copy||{}) as Record<string,string>;
 let time=String(value.appointment_at||'');try{time=new Intl.DateTimeFormat(locale,{dateStyle:'full',timeStyle:'short',timeZone:String(value.time_zone||'UTC')}).format(new Date(time));}catch{}
 return <section data-no-translate aria-label={copy.title} className="space-y-3"><h4 className="font-semibold">{copy.title}</h4><p className="text-sm">{copy.notice}</p><dl className="space-y-2">{[[copy.customer,value.customer_name],[copy.service,value.service_name],[copy.professional,value.professional_name],[copy.time,time]].filter(([,v])=>v).map(([label,v])=><div key={String(label)}><dt className="text-xs font-semibold">{String(label)}</dt><dd className="text-sm">{String(v)}</dd></div>)}</dl><h5 className="text-sm font-semibold">{copy.notification}</h5><p className="text-sm">{message.title}</p><p className="text-sm">{message.body}</p></section>;
}
