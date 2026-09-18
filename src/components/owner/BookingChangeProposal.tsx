"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {getSessionForScope} from "@/lib/supabase";
import {OwnerActionError,readOwnerResponse} from "@/lib/ownerActionError";
import {rescheduleLocalTimestamp} from "@/lib/bookingRescheduleCore";
import {salonTimeZone} from "@/lib/dateTime";

type Row=Record<string,unknown>;
type Slot={value:string;label:string;stylistId:string|null;stylistName:string};
const input="min-h-11 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
const button="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50";
export default function BookingChangeProposal({booking,timeZone,professionalName}:{booking:Row;timeZone:string;professionalName:string}) {
 const {translateSource:t,locale}=useI18n();
 const zone=salonTimeZone(timeZone),currentLocal=rescheduleLocalTimestamp(booking.appointment_datetime,zone);
 const [kind,setKind]=useState<'reschedule'|'substitution'>('reschedule'),[date,setDate]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState('');
 const [slots,setSlots]=useState<Slot[]>([]),[selected,setSelected]=useState<string[]>([]),[proposal,setProposal]=useState<Row|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const pending=useRef(false),requestId=useRef<{body:string;id:string}|null>(null);
 const endpoint=`/api/salon/bookings/${booking.id}/reschedule`;
 const api=useCallback(async(url:string,init:RequestInit={})=>{
  const session=await getSessionForScope('salon');if(!session)throw new OwnerActionError('AUTH_REQUIRED');
  return readOwnerResponse(await fetch(url,{...init,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}}),'RESCHEDULE_FAILED');
 },[]);
 const failure=useCallback((value:unknown)=>`${t('The proposal could not be completed. Your draft is kept; review availability and try again.')}${value instanceof OwnerActionError&&value.reference?` ${t('Support reference')}: ${value.reference}`:''}`,[t]);
 useEffect(()=>{let active=true;api(endpoint).then(body=>{if(active)setProposal(body.proposals?.[0]||null);}).catch(value=>{if(active)setError(failure(value));});return()=>{active=false;};},[api,endpoint,failure,refresh]);
 useEffect(()=>{
  let active=true;
  async function load(){setSlots([]);setSelected([]);if(!date)return;setLoading(true);setError('');
   try{const body=await api(`${endpoint}?date=${encodeURIComponent(date)}&kind=${kind}`);if(active)setSlots(body.slots||[]);}
   catch(value){if(active)setError(failure(value));}finally{if(active)setLoading(false);}
  }
  void load();return()=>{active=false;};
 },[api,date,kind,endpoint,failure,refresh]);
 async function submit(){
  if(pending.current||loading||!reason.trim()||!selected.length)return;
  pending.current=true;setBusy(true);setError('');setNotice('');
  const payload={reason:reason.trim(),message:message.trim(),change_kind:kind,options:selected.map(key=>{const [local,stylistId]=key.split('|');return {local,stylistId:stylistId||null};})};
  const body=JSON.stringify(payload);if(requestId.current?.body!==body)requestId.current={body,id:crypto.randomUUID()};
  try{const result=await api(endpoint,{method:'POST',body:JSON.stringify({...payload,client_request_id:requestId.current.id})});setProposal(result.proposal);setNotice(t('Proposal saved. The appointment changes only after customer approval; price and deposit stay the same.')+(result.warnings?.[0]?.request_id?` ${t('A notification needs attention.')} ${t('Support reference')}: ${result.warnings[0].request_id}`:''));setReason('');setMessage('');setSelected([]);requestId.current=null;}
  catch(value){setError(failure(value));}finally{pending.current=false;setBusy(false);}
 }
 const format=(value:unknown)=>new Intl.DateTimeFormat(locale,{timeZone:zone,dateStyle:'medium',timeStyle:'short'}).format(new Date(String(value)));
 return <section aria-label={t('Appointment change proposal')} className="mt-6 border-t border-border pt-5">
  <h3 className="font-serif text-xl">{t('Propose an appointment change')}</h3>
  <p className="mt-2 text-sm text-muted">{t('Offer a new time or another professional. The customer must accept; price and deposit stay the same.')}</p>
  <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm"><b>{t('Current appointment')}</b><br/>{format(booking.appointment_datetime)} · {professionalName?<span data-no-translate>{professionalName}</span>:t('Any stylist')}</p>
  {proposal?<div className="mt-3 rounded-lg border border-border p-3 text-sm"><b>{t('Latest proposal')}: {t(String(proposal.status||''))}</b><p data-no-translate>{String(proposal.reason||'')}</p>{proposal.expires_at?<p>{t('Reply before')}: {format(proposal.expires_at)}</p>:null}</div>:null}
  <fieldset disabled={busy} className="mt-4 flex flex-wrap gap-2"><legend className="mb-2 text-sm font-semibold">{t('Change to propose')}</legend>{(['reschedule','substitution'] as const).map(value=><button type="button" key={value} aria-pressed={kind===value} className={`${button} ${kind===value?'!border-primary bg-primary/10':''}`} onClick={()=>{setKind(value);setSelected([]);setDate(value==='substitution'?currentLocal.slice(0,10):'');}}>{t(value==='reschedule'?'New appointment time':'Another professional, same time')}</button>)}</fieldset>
  <fieldset disabled={busy} className="mt-4 space-y-3">
   {kind==='reschedule'?<label className="block text-sm font-semibold">{t('Date to search')}<input type="date" className={input} min={rescheduleLocalTimestamp(new Date().toISOString(),zone).slice(0,10)} value={date} onChange={event=>setDate(event.target.value)}/></label>:null}
   {loading?<p role="status" className="text-sm">{t('Checking live availability…')}</p>:date&&!slots.length?<p className="rounded-lg bg-surface p-3 text-sm">{t('No eligible appointment options are available. Try a different date or keep the current appointment.')}</p>:null}
   {slots.length?<fieldset className="max-h-64 space-y-2 overflow-y-auto"><legend className="mb-2 text-sm font-semibold">{t('Choose up to three options')}</legend>{slots.map(slot=>{const key=`${date}T${slot.value}|${slot.stylistId||''}`;return <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={selected.includes(key)} disabled={!selected.includes(key)&&selected.length>=3} onChange={event=>setSelected(current=>event.target.checked?[...current,key]:current.filter(item=>item!==key))}/><span><span data-no-translate>{slot.stylistName}</span> · {new Intl.DateTimeFormat(locale,{timeZone:"UTC",hour:"numeric",minute:"2-digit"}).format(new Date(`${date}T${slot.value}:00Z`))}</span></label>;})}</fieldset>:null}
   <label className="block text-sm font-semibold">{t('Reason for proposing a change')}<input className={input} value={reason} onChange={event=>setReason(event.target.value)} maxLength={300}/></label>
   <label className="block text-sm font-semibold">{t('Optional message to the customer')}<textarea className={input} rows={3} value={message} onChange={event=>setMessage(event.target.value)} maxLength={600}/></label>
   <p className="text-xs text-muted">{t('Your written message is kept in its original language.')}</p>
  </fieldset>
  {error?<div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm"><p>{error}</p><button type="button" className={`${button} mt-2`} disabled={busy} onClick={()=>setRefresh(value=>value+1)}>{t('Refresh available options')}</button></div>:null}
  {notice?<p role="status" className="mt-3 rounded-lg bg-success/10 p-3 text-sm">{notice}</p>:null}
  <button type="button" onClick={()=>void submit()} disabled={busy||loading||!selected.length||!reason.trim()} className={`${button} mt-4 w-full !border-primary !bg-primary !text-white`}>{busy?t('Saving…'):t('Send proposal for customer approval')}</button>
 </section>;
}
