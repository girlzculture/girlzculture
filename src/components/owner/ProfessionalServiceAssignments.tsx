"use client";
import {useState} from "react";
import {useI18n} from "@/components/i18n/LocaleProvider";
type Row=Record<string,unknown>&{id?:string;name?:string};
export default function ProfessionalServiceAssignments({professional,services,save}:{professional:Row;services:Row[];save:(ids:string[]|null)=>Promise<void>}){
 const {translateSource:t}=useI18n();
 const [all,setAll]=useState(professional.assigned_service_ids==null);
 const [ids,setIds]=useState<string[]>(Array.isArray(professional.assigned_service_ids)?professional.assigned_service_ids.map(String):[]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function submit(){setBusy(true);setError('');setSaved(false);try{await save(all?null:ids);setSaved(true);}catch(error){setError(error instanceof Error?error.message:t('Unable to save service assignments.'));}finally{setBusy(false);}}
 return <section aria-label={t('Assigned services')} className="space-y-3 border-t border-border pt-4">
  <h3 className="font-semibold">{t('Assigned services')}</h3>
  <p className="text-xs text-text-secondary">{t('Controls new online bookings. Existing appointments and checkout holds keep their booked terms.')}</p>
  <fieldset disabled={busy} className="space-y-2">
   <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={event=>{setAll(event.target.checked);setSaved(false);}} className="h-4 w-4 accent-primary"/>{t('All current and future services')}</label>
   {!all?<><p className="text-xs">{t('Select services this professional offers. Selecting none stops new online bookings for this professional.')}</p><div className="max-h-64 overflow-y-auto rounded-lg border border-border p-2">{services.map(service=><label key={service.id} className="flex min-h-11 items-center gap-2 break-words text-sm"><input type="checkbox" checked={ids.includes(String(service.id))} onChange={event=>{setIds(previous=>event.target.checked?[...previous,String(service.id)]:previous.filter(id=>id!==service.id));setSaved(false);}} className="h-4 w-4 shrink-0 accent-primary"/><span data-no-translate>{service.name}</span>{service.is_draft===true?<span className="text-xs text-text-secondary">{t('Draft')}</span>:null}</label>)}{!services.length?<p className="p-2 text-sm">{t('No services saved yet.')}</p>:null}</div></>:null}
  </fieldset>
  {error?<p role="alert" className="break-words text-sm gc-text-danger">{error}</p>:null}
  {saved?<p role="status" className="text-sm text-primary">{t('Service assignments saved and verified.')}</p>:null}
  <button type="button" disabled={busy} onClick={()=>void submit()} className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t(busy?'Saving…':'Save service assignments')}</button>
 </section>;
}
