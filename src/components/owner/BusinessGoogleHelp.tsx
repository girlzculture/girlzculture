"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useI18n} from '@/components/i18n/LocaleProvider';
import {createAuthenticatedApiClient} from '@/lib/scopedApiClient';
import {ScopedApiError} from '@/lib/scopedApiCore';
import {GOOGLE_HELP_GUIDES,type GoogleHelp} from '@/lib/businessGoogleHelp';
const button='min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold gc-disabled-control';
export default function BusinessGoogleHelp({businessId}:{businessId:string}){
 const {translateSource:t}=useI18n();const [data,setData]=useState<GoogleHelp|null>(null),[version,setVersion]=useState(0),[error,setError]=useState(''),[reference,setReference]=useState<string|null>(null),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[notice,setNotice]=useState<string|null>(null);
 const pending=useRef<{id:string;kind:string;fingerprint:string}|null>(null);
 useEffect(()=>{const controller=new AbortController();void(async()=>{try{const api=await createAuthenticatedApiClient('salon'),body=await api.request<{help:GoogleHelp}>('/api/salon/google-help',{signal:controller.signal});if(body.help.salon_id!==businessId)throw Error('GOOGLE_HELP_SCOPE');if(!controller.signal.aborted){setData(body.help);setReviewed(false);setError('');setReference(null);pending.current=null;}}catch(failure){if(!controller.signal.aborted){setError('Google setup help could not be loaded.');setReference(failure instanceof ScopedApiError?failure.requestId:null);}}})();return()=>controller.abort();},[businessId,version]);
 async function requestHelp(kind:'assisted_setup'|'profile_review'){
  if(!data||!reviewed||busy)return;setBusy(true);setError('');setReference(null);setNotice(null);
  if(!pending.current||pending.current.kind!==kind||pending.current.fingerprint!==data.fingerprint)pending.current={id:crypto.randomUUID(),kind,fingerprint:data.fingerprint};
  try{const api=await createAuthenticatedApiClient('salon'),body=await api.request<{help:GoogleHelp;verified:boolean;ticket_id:string}>('/api/salon/google-help',{method:'POST',body:JSON.stringify(pending.current)});if(body.verified!==true||body.help.salon_id!==businessId||!body.help.requests.some(r=>r.id===body.ticket_id))throw Error('GOOGLE_HELP_READBACK');setData(body.help);setReviewed(false);setNotice(body.ticket_id);pending.current=null;}
  catch(failure){setError(failure instanceof ScopedApiError&&failure.status===409?'The business details changed. Reload and review them again.':'The help request could not be confirmed. Your review is retained.');setReference(failure instanceof ScopedApiError?failure.requestId:null);}finally{setBusy(false);}
 }
 function hours(value:unknown){if(value&&typeof value==='object'){const row=value as Record<string,unknown>;return row.closed||row.enabled===false?t('Closed'):`${row.open||'—'} – ${row.close||'—'}`;}return typeof value==='string'?t(value):t('Not set');}
 return <section aria-label={t('Google profile setup help')} className='mt-5 space-y-4 rounded-xl border border-border bg-white p-5'>
  <h2 className='font-serif text-2xl'>{t('Google profile setup help')}</h2>
  <p className='text-sm'>{t('Prepare your own profile with Google’s official guides. Setup help does not enable Girlz Culture synchronization or verify your profile with Google.')}</p>
  <ul className='space-y-2 text-sm'>{GOOGLE_HELP_GUIDES.map(guide=><li key={guide.href}><a href={guide.href} target='_blank' rel='noopener noreferrer' className='inline-flex min-h-11 items-center text-primary underline'>{t(guide.label)}</a></li>)}</ul>
  {data?<>
   <p className='font-semibold text-sm'>{t(data.level==='guide'?'Guide included':data.level==='assisted'?'Assisted setup included':'Assisted setup and profile review included')}</p>
   {data.fields?<><h3 className='font-semibold'>{t('Review your saved business information')}</h3><dl className='grid gap-3 text-sm sm:grid-cols-2'>
    {(['name','phone','description','address','area','page'] as const).map(key=><div className='min-w-0' key={key}><dt className='font-semibold'>{t({name:'Business name',phone:'Phone',description:'Description',address:'Public address',area:'Neighborhood',page:'Your Girlz Culture page'}[key])}</dt><dd className='mt-1 break-words whitespace-pre-wrap' data-no-translate>{data.fields![key]||t('Not set')}</dd></div>)}
   </dl><dl className='grid gap-2 text-sm sm:grid-cols-2'>{Object.entries(data.fields.hours||{}).map(([day,value])=><div key={day}><dt className='font-semibold'>{t(day[0].toUpperCase()+day.slice(1))}</dt><dd>{hours(value)}</dd></div>)}</dl>
    {data.fields.mobile||data.fields.location_type==='home'||data.fields.location_type==='chair_suite'?<p className='rounded-lg bg-subtle p-3 text-sm'>{t('Check Google’s address and service-area eligibility before publishing a location. Your private verification address is not included here.')}</p>:null}
    <Link href='/salon/dashboard/my-page/business' className='inline-flex min-h-11 items-center text-sm text-primary underline'>{t('Edit business information')}</Link>
   </>:null}
   {data.review?<><h3 className='font-semibold'>{t('Girlz Culture information check')}</h3><p className='text-sm'>{t('These checks use your Girlz Culture records, not a live Google profile. Request a human review below.')}</p><ul className='space-y-2 text-sm'>{(['name','phone','description','hours','public_page'] as const).map(key=><li key={key}>{t({name:'Business name saved',phone:'Phone saved',description:'Description between 1 and 750 characters',hours:'Business hours saved',public_page:'Girlz Culture page is public'}[key])}: {t(data.review![key]?'Present':'Needs review')}</li>)}</ul></>:null}
   {data.is_demo?<p className='text-sm'>{t('Setup requests are unavailable for this account.')}</p>:data.level!=='guide'?<fieldset disabled={busy} className='space-y-3'><label className='flex min-h-11 items-start gap-3 text-sm'><input type='checkbox' checked={reviewed} onChange={e=>setReviewed(e.target.checked)} className='mt-1'/>{t('I reviewed these details and want to send them to Girlz Culture support.')}</label><div className='flex flex-wrap gap-3'><button type='button' className={button} disabled={!reviewed||busy} onClick={()=>void requestHelp('assisted_setup')}>{t('Request setup assistance')}</button>{data.level==='review'?<button type='button' className={button} disabled={!reviewed||busy} onClick={()=>void requestHelp('profile_review')}>{t('Request a profile review')}</button>:null}</div></fieldset>:null}
   {notice?<p role='status' className='break-words text-sm'>{t('Your request is saved in platform support. Reference:')} <span data-no-translate>{notice}</span></p>:null}
   {data.requests.length?<ul aria-label={t('Your setup requests')} className='space-y-2 text-sm'>{data.requests.map(r=><li className='break-all' key={r.id}>{t(r.kind==='profile_review'?'Profile review':'Setup assistance')} · {t(r.status)} · <span data-no-translate>{r.id}</span></li>)}</ul>:null}
  </>:!error?<p role='status'>{t('Loading…')}</p>:null}
  {error?<p role='alert' className='break-words text-sm gc-text-danger'>{t(error)}{reference?<span className='block' data-no-translate>{reference}</span>:null}</p>:null}
  <button className={button} disabled={busy} onClick={()=>{setNotice(null);setVersion(n=>n+1);}}>{t('Reload saved details')}</button>
 </section>;
}
