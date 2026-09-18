"use client";
import {useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {useI18n} from '@/components/i18n/LocaleProvider';
import {financePeriodToDate} from '@/lib/businessFinanceCore';
import {FinanceField,financeInput as input,financeButton as button} from './FinanceUI';
export default function FinancePeriodControls({from,to,today,timeZone,busy,onChange}:{from:string;to:string;today:string;timeZone:string;busy:boolean;onChange:(from:string,to:string)=>void}){
 const {translateSource:t}=useI18n();const[draftFrom,setFrom]=useState(from),[draftTo,setTo]=useState(to);
 return <form aria-label={t('Reporting period')} onSubmit={event=>{event.preventDefault();onChange(draftFrom,draftTo);}} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-plum/10 bg-white p-3 sm:flex sm:flex-wrap">
  <CalendarDays size={20} className="mb-3 hidden sm:block"/>
  <FinanceField label={t('From')}><input type="date" required value={draftFrom} onChange={event=>setFrom(event.target.value)} className={input}/></FinanceField>
  <FinanceField label={t('To')}><input type="date" required value={draftTo} onChange={event=>setTo(event.target.value)} className={input}/></FinanceField>
  <button type="submit" disabled={busy} className={button}>{t('Apply dates')}</button>
  <select aria-label={t('Reporting period')} defaultValue="custom" className={`${input} min-w-0 sm:max-w-44`} onChange={event=>{if(event.target.value==='custom')return;const range=financePeriodToDate(today,event.target.value as 'day'|'week'|'month'|'quarter'|'year');onChange(range.from,range.to);}}>
   <option value="custom">{t('Custom')}</option>{[['day','Today'],['week','This week'],['month','This month'],['quarter','This quarter'],['year','This year']].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}
  </select><span className="col-span-2 text-xs gc-text-secondary sm:mb-3"><span data-no-translate>{timeZone}</span> · USD</span>
 </form>;
}
