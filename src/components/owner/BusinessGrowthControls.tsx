"use client";
import {useEffect,useState,type FormEvent} from "react";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {ScopedApiError} from "@/lib/scopedApiCore";
import {useI18n} from "@/components/i18n/LocaleProvider";
import type {BusinessGrowthSettings} from "@/lib/businessGrowthSettings";
const control="mt-2 min-h-11 w-full rounded-lg border border-border bg-white px-3 py-2";
export default function BusinessGrowthControls(){
 const {translateSource:t,formatNumber}=useI18n();
 const [saved,setSaved]=useState<BusinessGrowthSettings|null>(null),[draft,setDraft]=useState<BusinessGrowthSettings|null>(null);
 const [hours,setHours]=useState(""),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[error,setError]=useState(""),[reference,setReference]=useState<string|null>(null),[notice,setNotice]=useState("");
 function restore(value:BusinessGrowthSettings){setSaved(value);setDraft(value);setHours((value.reminder_hours||value.effective_reminder_hours).join(", "));}
 useEffect(()=>{const controller=new AbortController();void(async()=>{
  try{const api=await createAuthenticatedApiClient("salon");const body=await api.request<{settings:BusinessGrowthSettings}>("/api/salon/growth-settings",{signal:controller.signal});if(!controller.signal.aborted){restore(body.settings);setError("");setReference(null);}}
  catch(failure){if(!controller.signal.aborted){setError("Reminder and waitlist settings could not be loaded.");setReference(failure instanceof ScopedApiError?failure.requestId:null);}}
 })();return()=>controller.abort();},[refresh]);
 async function save(event:FormEvent){
  event.preventDefault();if(!saved||!draft||busy)return;
  const parsed=hours.split(',').map(value=>Number(value.trim()));
  if(draft.reminder_hours!==null&&(!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(hours)||parsed.length>saved.reminder_limit||new Set(parsed).size!==parsed.length||parsed.some(hour=>hour<1||hour>336))){setError("Enter distinct whole hours from 1 to 336, within your plan limit.");return;}
  setBusy(true);setError("");setNotice("");setReference(null);
  try{const api=await createAuthenticatedApiClient("salon");const body=await api.request<{settings:BusinessGrowthSettings;verified:boolean}>("/api/salon/growth-settings",{method:"POST",body:JSON.stringify({revision:saved.revision,reminder_hours:draft.reminder_hours===null?null:parsed,waitlist_service_ids:draft.waitlist_mode==='targeted'?draft.waitlist_service_ids:[],waitlist_professional_ids:draft.waitlist_mode==='targeted'?draft.waitlist_professional_ids:[]})});
   if(body.verified!==true)throw Error("GROWTH_READBACK_FAILED");restore(body.settings);setNotice("Reminder and waitlist settings saved and verified.");
  }catch(failure){setError(failure instanceof ScopedApiError&&failure.status===409?"These settings changed in another session. Reload before saving.":"Settings could not be saved. Your edits are retained.");setReference(failure instanceof ScopedApiError?failure.requestId:null);}finally{setBusy(false);}
 }
 function toggle(field:'waitlist_service_ids'|'waitlist_professional_ids',id:string){if(draft)setDraft({...draft,[field]:draft[field].includes(id)?draft[field].filter(value=>value!==id):[...draft[field],id]});}
 return <section aria-label={t("Customer reminders & waitlist")} className="mt-5 rounded-xl border border-border bg-white p-5">
  <h2 className="font-serif text-2xl">{t("Customer reminders & waitlist")}</h2>
  {draft&&saved?<form onSubmit={save} className="mt-4 space-y-4"><fieldset disabled={busy} className="space-y-4">
   <p className="text-sm">{t("Current reminder hours before the appointment")}: {saved.effective_reminder_hours.map(hour=>formatNumber(hour)).join(', ')}</p>
   {saved.reminder_limit>0?<><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.reminder_hours===null} onChange={e=>setDraft({...draft,reminder_hours:e.target.checked?null:[]})}/>{t("Use standard reminder timing")}</label>
    {draft.reminder_hours!==null?<label className="block text-sm">{t("Hours before the appointment (comma separated)")}<input value={hours} onChange={e=>setHours(e.target.value)} className={control} inputMode="numeric" required/><small>{t("Maximum reminders")}: {formatNumber(saved.reminder_limit)}</small></label>:null}</>:<p className="text-sm">{t("Your plan includes standard reminder timing.")}</p>}
   <p className="text-sm">{t(draft.waitlist_mode==='manual'?"Review waitlist openings and send offers from Bookings.":draft.waitlist_mode==='automated'?"Matching waitlist openings are offered automatically.":"Matching waitlist openings are offered automatically. Choose services or professionals to target; leave all unchecked to include everyone.")}</p>
   {draft.waitlist_mode==='targeted'?<div className="grid gap-4 sm:grid-cols-2">{([['waitlist_service_ids','Services',draft.services],['waitlist_professional_ids','Professionals',draft.professionals]] as const).map(([field,label,rows])=><fieldset key={field} className="min-w-0 rounded-lg border p-3"><legend>{t(label)}</legend>{rows.map(row=><label key={row.id} className="flex min-h-11 items-center gap-3 break-words text-sm"><input type="checkbox" checked={draft[field].includes(row.id)} onChange={()=>toggle(field,row.id)}/><span data-no-translate>{row.name}</span></label>)}</fieldset>)}</div>:null}
   <p className="text-sm text-muted">{t("Customers keep their communication preferences. A waitlist offer does not book or charge anyone.")}</p>
   {saved.reminder_limit>0||draft.waitlist_mode==='targeted'?<button disabled={busy} className="min-h-11 rounded-lg bg-primary px-5 py-3 text-white gc-disabled-control">{t(busy?"Saving…":"Save and verify")}</button>:null}
  </fieldset></form>:!error?<p role="status" className="mt-4">{t("Loading…")}</p>:null}
  {error?<p role="alert" className="mt-3 break-words text-sm gc-text-danger">{t(error)}{reference?<span data-no-translate> {reference}</span>:null}</p>:null}
  {notice?<p role="status" className="mt-3 text-sm">{t(notice)}</p>:null}
  <button type="button" disabled={busy} onClick={()=>{setNotice("");setRefresh(value=>value+1);}} className="mt-3 min-h-11 text-sm underline">{t("Reload saved settings")}</button>
 </section>;
}
