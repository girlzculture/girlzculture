"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {useI18n} from '@/components/i18n/LocaleProvider';
import {createAuthenticatedApiClient} from '@/lib/scopedApiClient';
import {ScopedApiError} from '@/lib/scopedApiCore';
import {REBOOKING_COPY,type RebookingSettings} from '@/lib/businessRebookingReminders';
const control='mt-2 min-h-11 w-full rounded-lg border border-border bg-white px-3 py-2';
export default function BusinessRebookingControls(){
 const {translateSource:t,locale}=useI18n();const [saved,setSaved]=useState<RebookingSettings|null>(null),[draft,setDraft]=useState<RebookingSettings|null>(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[version,setVersion]=useState(0),[error,setError]=useState(''),[reference,setReference]=useState<string|null>(null),[notice,setNotice]=useState('');
 useEffect(()=>{const controller=new AbortController();void(async()=>{try{const api=await createAuthenticatedApiClient('salon'),body=await api.request<{settings:RebookingSettings}>('/api/salon/rebooking-settings',{signal:controller.signal});if(!controller.signal.aborted){setSaved(body.settings);setDraft(body.settings);setReviewed(false);setError('');setReference(null);}}catch(failure){if(!controller.signal.aborted){setError('Rebooking settings could not be loaded.');setReference(failure instanceof ScopedApiError?failure.requestId:null);}}})();return()=>controller.abort();},[version]);
 async function save(event:FormEvent){event.preventDefault();if(!saved||!draft||busy)return;setBusy(true);setError('');setReference(null);setNotice('');
  try{const api=await createAuthenticatedApiClient('salon'),body=await api.request<{settings:RebookingSettings;verified:boolean}>('/api/salon/rebooking-settings',{method:'POST',body:JSON.stringify({revision:saved.revision,enabled:draft.enabled,absence_days:draft.absence_days,minimum_visits:draft.segmented?draft.minimum_visits:1,service_ids:draft.segmented?draft.service_ids:[],reviewed})});
   if(body.verified!==true||body.settings.salon_id!==saved.salon_id||body.settings.revision!==saved.revision+1)throw Error('REBOOKING_READBACK_FAILED');setSaved(body.settings);setDraft(body.settings);setReviewed(false);setNotice('Rebooking settings saved and verified.');
  }catch(failure){setError(failure instanceof ScopedApiError&&failure.status===409?'These settings changed in another session. Reload before saving.':'Settings could not be saved. Your edits are retained.');setReference(failure instanceof ScopedApiError?failure.requestId:null);}finally{setBusy(false);}
 }
 const copy=REBOOKING_COPY[locale as keyof typeof REBOOKING_COPY]||REBOOKING_COPY.en;
 return <section aria-label={t('Rebooking reminders')} className='mt-5 rounded-xl border border-border bg-white p-5'>
  <h2 className='font-serif text-2xl'>{t('Rebooking reminders')}</h2>
  {saved&&draft?<>
   <p className='mt-3 text-sm'>{t(saved.is_demo?'Demo reminders are never sent.':saved.effective_enabled&&saved.email_available?'Automatic rebooking reminders are on.':'Automatic rebooking reminders are off.')}</p>
   {!saved.automatic?<p className='mt-2 text-sm'>{t('Your plan includes manual rebooking. Review returning clients from Bookings.')}</p>:null}
   {!saved.email_available?<p className='mt-2 text-sm'>{t('Email delivery is unavailable. You can still turn reminders off.')}</p>:null}
   <form onSubmit={save} className='mt-4 space-y-4'><fieldset disabled={busy} className='space-y-4'>
    <label className='flex min-h-11 items-center gap-3'><input type='checkbox' checked={draft.enabled} disabled={!draft.enabled&&(!saved.automatic||saved.is_demo||!saved.email_available)} onChange={e=>{setDraft({...draft,enabled:e.target.checked});setReviewed(false);}}/>{t('Send automatic rebooking reminders')}</label>
    <p className='text-sm'>{t('Only opted-in clients served by this business, with no upcoming appointment. One email per completed visit, at least 30 days apart, up to 20 per business per day.')}</p>
    {saved.automatic&&!saved.is_demo?<>
     <label className='block text-sm'>{t('Days since the last completed appointment')}<input className={control} type='number' min={30} max={180} required value={draft.absence_days} onChange={e=>{setDraft({...draft,absence_days:Number(e.target.value)});setReviewed(false);}}/></label>
     {saved.segmented?<><label className='block text-sm'>{t('Minimum completed visits in the last year')}<input className={control} type='number' min={1} max={20} required value={draft.minimum_visits} onChange={e=>{setDraft({...draft,minimum_visits:Number(e.target.value)});setReviewed(false);}}/></label>
      <fieldset className='rounded-lg border p-3'><legend>{t('Last-visit services (leave unchecked for all)')}</legend>{saved.services.map(service=><label key={service.id} className='flex min-h-11 items-center gap-3 break-words text-sm'><input type='checkbox' checked={draft.service_ids.includes(service.id)} onChange={()=>{setDraft({...draft,service_ids:draft.service_ids.includes(service.id)?draft.service_ids.filter(id=>id!==service.id):[...draft.service_ids,service.id]});setReviewed(false);}}/><span data-no-translate>{service.name}</span></label>)}</fieldset></>:null}
     <div className='rounded-lg border bg-subtle p-3 text-sm' data-no-translate><strong>{copy.title}</strong><p className='mt-2'>{copy.body}</p><p className='mt-2'>{copy.book} · {copy.unsubscribe}</p></div>
     <p className='text-sm'>{t('Each client receives this message in their saved language with your business name, booking link and unsubscribe link.')}</p>
     {draft.enabled?<label className='flex min-h-11 items-start gap-3 text-sm'><input type='checkbox' required checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className='mt-1'/>{t('I reviewed the reminder and authorize sending under these settings.')}</label>:null}
    </>:null}
    {(saved.automatic&&!saved.is_demo)||saved.enabled?<button className='min-h-11 rounded-lg bg-primary px-5 py-3 text-white gc-disabled-control' disabled={busy||draft.enabled&&!reviewed}>{t(busy?'Saving…':'Save and verify')}</button>:null}
   </fieldset></form>
   {saved.attempts.length?<details className='mt-4'><summary className='min-h-11 cursor-pointer text-sm font-semibold'>{t('Recent reminder attempts')}</summary><p className='mb-2 text-xs'>{t('Provider acceptance does not prove delivery. Pending or uncertain attempts are never resent automatically.')}</p><ul className='space-y-2 text-sm'>{saved.attempts.map((attempt,i)=><li key={i}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(attempt.attempted_at))} — {t({processing:'Outcome pending',accepted:'Accepted by email provider',uncertain:'Outcome uncertain'}[attempt.status])}{attempt.support_reference?<span className='block break-all' data-no-translate>{attempt.support_reference}</span>:null}</li>)}</ul></details>:null}
  </>:!error?<p role='status' className='mt-4'>{t('Loading…')}</p>:null}
  {error?<p role='alert' className='mt-3 text-sm gc-text-danger'>{t(error)}{reference?<span className='block break-all' data-no-translate>{reference}</span>:null}</p>:null}
  {notice?<p role='status' className='mt-3 text-sm'>{t(notice)}</p>:null}
  <button type='button' disabled={busy} onClick={()=>{setNotice('');setVersion(n=>n+1);}} className='mt-3 min-h-11 text-sm underline'>{t('Reload saved settings')}</button>
 </section>;
}
