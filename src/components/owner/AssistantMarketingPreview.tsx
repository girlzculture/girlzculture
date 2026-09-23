"use client";
import Image from 'next/image';
import {assistantMarketingCopy} from '@/i18n/assistant-marketing-copy';
type Row=Record<string,unknown>;
export default function AssistantMarketingPreview({value,locale}:{value:Row;locale:string}){
 const t=assistantMarketingCopy(locale),c=(value.changes||{}) as Row,snapshot=(value.snapshot||{}) as Row,copies=(c.copies||value.copies||{}) as Record<string,{title:string;body:string;tags:string[]}>;
 const date=(v:unknown)=>{try{return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:String(value.time_zone||(snapshot.business as Row)?.time_zone||'UTC')}).format(new Date(String(v)));}catch{return String(v||'');}};
 return <div data-no-translate className="space-y-3"><h4 className="font-semibold">{t[value.operation as 'marketing_draft'|'marketing_publish'|'marketing_cancel']}</h4><p className="text-sm">{t.scope}</p>
 {(['service','promotion'] as const).map(key=>snapshot[key]?<p className="text-sm" key={key}>{t.source}: {String((snapshot[key] as Row).name||(snapshot[key] as Row).title)}</p>:null)}
 <div className="flex flex-wrap gap-2">{((snapshot.photos||[]) as {url:string}[]).map(photo=><Image unoptimized key={photo.url} src={photo.url} alt={t.photo} width={120} height={100} className="h-24 w-28 rounded-lg object-cover"/>)}</div>
 {Object.entries(copies).map(([language,copy])=><section key={language} className="rounded-lg border border-border p-3"><h5 className="font-semibold">{({en:'English',fr:'Français',es:'Español','zh-CN':'简体中文'} as Record<string,string>)[language]}</h5><p className="mt-2 font-medium">{copy.title}</p><p className="whitespace-pre-wrap break-words text-sm">{copy.body}</p><p className="text-sm">{copy.tags?.join(' ')}</p></section>)}
 {c.scheduled_at?<p>{t.scheduled}: {date(c.scheduled_at)}</p>:null}{c.expires_at?<p>{t.expires}: {date(c.expires_at)}</p>:null}</div>;
}
