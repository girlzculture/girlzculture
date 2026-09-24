"use client";
import {useState} from "react";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {ScopedApiError} from "@/lib/scopedApiCore";
import {useI18n} from "@/components/i18n/LocaleProvider";
type Opening={source_booking_id:string;appointment_at:string;time_zone:string};
export default function BusinessWaitlistOpenings({requestId,onOffered}:{requestId:string;onOffered:()=>void}){
 const {translateSource:t,formatDate}=useI18n();const [openings,setOpenings]=useState<Opening[]|null>(null),[selected,setSelected]=useState<Opening|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function act(source?:string){if(busy)return;setBusy(true);setError(null);
  try{const api=await createAuthenticatedApiClient("salon");const body=await api.request<{offered:boolean;openings:Opening[]}>("/api/salon/waitlist/openings",{method:"POST",body:JSON.stringify({action:source?'offer':'review',request_id:requestId,...(source?{source_booking_id:source}:{})})});
   if(source){if(body.offered!==true)throw Error('WAITLIST_READBACK_FAILED');setSelected(null);setOpenings([]);onOffered();}else setOpenings(body.openings);
  }catch(failure){setError(failure instanceof ScopedApiError?failure.requestId||'WAITLIST_UNAVAILABLE':'WAITLIST_UNAVAILABLE');}finally{setBusy(false);}
 }
 const when=(opening:Opening)=>formatDate(opening.appointment_at,{dateStyle:'medium',timeStyle:'short',timeZone:opening.time_zone});
 return <div className="space-y-2">
  <button type="button" disabled={busy} onClick={()=>void act()} className="min-h-11 rounded-lg border px-3 text-sm gc-disabled-control">{t(busy?"Checking…":"Check waitlist openings")}</button>
  {openings?.length===0?<p role="status" className="text-sm">{t("No matching openings are available now.")}</p>:null}
  {!selected?openings?.map(opening=><button key={opening.source_booking_id} disabled={busy} type="button" onClick={()=>setSelected(opening)} className="block min-h-11 rounded-lg border px-3 text-sm">{t("Review opening")}: {when(opening)}</button>):<div className="rounded-lg border p-3 text-sm"><p>{when(selected)}</p><p className="my-2">{t("Send this customer an opening offer? They must confirm availability and deposit terms before booking.")}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void act(selected.source_booking_id)} className="min-h-11 rounded-lg bg-primary px-3 text-white gc-disabled-control">{t("Send opening offer")}</button><button type="button" disabled={busy} onClick={()=>setSelected(null)} className="min-h-11 rounded-lg border px-3">{t("Cancel")}</button></div></div>}
  {error?<p role="alert" className="break-words text-sm gc-text-danger">{t("This opening could not be offered. Check availability and try again.")} <span data-no-translate>{error}</span></p>:null}
 </div>;
}
