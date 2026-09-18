"use client";
import {useEffect,useRef,useState} from "react";
import {getSessionForScope,getSupabaseForScope} from "@/lib/supabase";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {OwnerActionError,readOwnerResponse} from "@/lib/ownerActionError";
import {communicationFlags,type CommunicationPreferences as Preferences,type CommunicationChoices} from "@/lib/businessCommunicationCore";
const labels={email_enabled:"Email updates",sms_enabled:"Text message updates",push_enabled:"Device notifications",reminders:"Appointment reminders",follow_up:"Thank-you and rebooking messages",marketing:"Promotions and business news"};
export default function CommunicationPreferences({bookingId,guestToken}:{bookingId:string;guestToken?:string}){
 return <CommunicationPreferencesState key={`${bookingId}:${guestToken||"account"}`} bookingId={bookingId} guestToken={guestToken}/>;
}
export function CommunicationPreferencesState({bookingId,guestToken}:{bookingId:string;guestToken?:string}){
 const {translateSource:t}=useI18n();const [open,setOpen]=useState(false),[saved,setSaved]=useState<Preferences|null>(null),[draft,setDraft]=useState<CommunicationChoices|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const actor=useRef<string|null>(null);const [authReady,setAuthReady]=useState(Boolean(guestToken));
 const generation=useRef(0),pending=useRef(false),retry=useRef<{signature:string;id:string}|null>(null);
 useEffect(()=>{
  let initialized=false;const subscription=guestToken?null:getSupabaseForScope("customer").auth.onAuthStateChange((_event,session)=>{const next=session?.user.id||null;if(initialized&&next===actor.current)return;initialized=true;actor.current=next;setAuthReady(Boolean(next));generation.current++;pending.current=false;setOpen(false);setSaved(null);setDraft(null);setError("");setNotice("");setBusy(false);retry.current=null;});
  const lifecycle=generation;return()=>{lifecycle.current++;subscription?.data.subscription.unsubscribe();};
 },[bookingId,guestToken]);
 async function request(current:number,update?:object){
  const headers:Record<string,string>={"Content-Type":"application/json"};
  if(guestToken)headers["x-guest-booking-token"]=guestToken;else{const session=await getSessionForScope("customer");if(!session||session.user.id!==actor.current||current!==generation.current)throw new OwnerActionError("COMMUNICATION_UNAUTHORIZED");headers.Authorization=`Bearer ${session.access_token}`;}
  return readOwnerResponse(await fetch(`/api/customer/bookings/${bookingId}/communications`,{method:update?"PUT":"GET",headers,body:update?JSON.stringify(update):undefined,cache:"no-store",signal:AbortSignal.timeout(30000)}),"COMMUNICATION_UNAVAILABLE");
 }
 async function run(save:boolean){
  if(pending.current||!authReady)return;pending.current=true;setBusy(true);setError("");setNotice("");const current=generation.current;
  try{
   let update;
   if(save&&saved&&draft){const signature=JSON.stringify([saved.revision,draft]);if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};update={request_id:retry.current.id,expected_revision:saved.revision,choices:draft};}
   const body=await request(current,update);if(current!==generation.current)return;
   const preference=body.preferences as Preferences;if(!preference||!Number.isInteger(preference.revision)||communicationFlags.some(key=>typeof preference[key]!=="boolean"))throw new OwnerActionError("COMMUNICATION_UNAVAILABLE");
   setSaved(preference);setDraft(Object.fromEntries([...communicationFlags,"locale","consent_version"].map(key=>[key,preference[key as keyof Preferences]])) as CommunicationChoices);retry.current=null;if(save)setNotice(t("Communication preferences saved."));
  }catch(failure){if(current!==generation.current)return;const e=failure instanceof OwnerActionError?failure:null;setError(`${t(e?.code==="COMMUNICATION_STALE"?"These preferences changed elsewhere. Reload to review the latest choices.":"Communication preferences could not be saved or loaded. Your choices are retained.")}${e?.reference?` ${t("Support reference")}: ${e.reference}`:""}`);}
  finally{if(current===generation.current){pending.current=false;setBusy(false);}}
 }
 return <section className="rounded-xl border border-border bg-white p-4"><button type="button" aria-expanded={open} disabled={!authReady} onClick={()=>{setOpen(!open);if(!open&&!saved)void run(false);}} className="min-h-11 text-left font-semibold text-magenta">{t("Communication preferences")}</button>{open&&<div className="mt-3 space-y-3"><p className="text-sm">{t(saved?.scope==="business"?"These choices apply to your appointments with this business only.":"These choices apply to this booking only.")}</p><p className="text-sm">{t("Promotional and rebooking messages are optional. The business cannot opt you in. Availability depends on its enabled delivery channels.")}</p>{draft&&<fieldset disabled={busy} className="space-y-2">{communicationFlags.map(key=><label key={key} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.checked})}/>{t(labels[key])}</label>)}<label className="block text-sm">{t("Message language")}<select value={draft.locale} onChange={event=>setDraft({...draft,locale:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border p-2"><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="zh-CN">简体中文</option></select></label></fieldset>}{error&&<p role="alert" className="text-sm gc-text-danger">{error}</p>}{notice&&<p role="status" className="text-sm gc-text-success">{notice}</p>}<div className="flex flex-wrap gap-3">{draft&&<button type="button" disabled={busy} onClick={()=>void run(true)} className="min-h-11 rounded-lg bg-magenta px-4 text-white">{t(busy?"Saving…":"Save communication preferences")}</button>}<button type="button" disabled={busy} onClick={()=>void run(false)} className="min-h-11 rounded-lg border px-4">{t(busy?"Loading…":"Reload preferences")}</button></div></div>}</section>;
}
