"use client";
import {useEffect,useRef,useState} from "react";
import {getSessionForScope} from "@/lib/supabase";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {readApiResponse} from "@/lib/apiResponseClient";
import BusinessGoogleHelp from './BusinessGoogleHelp';
type Row=Record<string,unknown>;
type State={available:boolean;status:string;auto_sync?:boolean;last_success_at?:string;last_error?:string;operations?:Array<{id:string;kind:string;status:string;created_at:string}>};
type Choice={account:string;name:string;title:string;address:Row};
type Preview={before:Row;after:Row;review_hash:string};
const control="min-h-11 rounded-xl border border-border bg-white px-3 py-2 text-sm disabled:bg-subtle disabled:text-muted disabled:cursor-not-allowed";
export default function GoogleBusinessProfileSettings({businessId,photos=[]}:{businessId:string;photos?:string[]}){
 const {translateSource:t,locale,formatDate}=useI18n();
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [choices,setChoices]=useState<Choice[]>([]),[choice,setChoice]=useState(""),[searched,setSearched]=useState(false);
 const [kind,setKind]=useState("info"),[url,setUrl]=useState(photos[0]||""),[summary,setSummary]=useState(""),[preview,setPreview]=useState<Preview|null>(null);
 const intent=useRef(""),generation=useRef(0);
 async function api(body?:Row){
  const session=await getSessionForScope("salon");if(!session)throw Error(t("Sign in again to manage this connection."));
  const res=await fetch("/api/salon/integrations/google",{method:body?"POST":"GET",cache:"no-store",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const data=await readApiResponse(res,"Google profile unavailable.");
  if(!res.ok){const reference=typeof data.request_id==="string"&&/^[a-f0-9-]{36}$/i.test(data.request_id)?data.request_id:"";const explanation=/CONFLICT|REVIEW_CHANGED|LOCATION_MISMATCH/.test(String(data.code))?t("The profile changed. Review the current details before trying again."):t("Google profile unavailable. Your Girlz Culture information is unchanged.");throw Error([explanation,reference].filter(Boolean).join(" "));}
  return data;
 }
 async function action(fn:()=>Promise<void>){const current=generation.current;setBusy(true);setError("");setNotice("");try{await fn();}catch(failure){if(current===generation.current)setError(failure instanceof Error?failure.message:t("Google profile unavailable."));}finally{if(current===generation.current)setBusy(false);}}
 useEffect(()=>{const current=++generation.current;void api().then(data=>{if(current===generation.current)setState(data as unknown as State);}).catch(()=>{if(current===generation.current)setError(t("Google profile unavailable."));});return()=>{generation.current=current+1;};
 // The parent keys this component to the authorized business and disposes old state.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[businessId]);
 const refresh=async()=>{const current=generation.current;const data=await api();if(current===generation.current)setState(data as unknown as State);};
 const clear=()=>{setPreview(null);intent.current="";};
 const payload=()=>({kind,url,summary,locale});
 function value(key:string,item:unknown):string{
  if(item==null)return t("Not set");
  if(key==="profile")return String((item as Row).description||"");
  if(key==="phoneNumbers")return String((item as Row).primaryPhone||"");
  if(key==="regularHours")return ((item as {periods?:Row[]}).periods||[]).map(p=>{const open=p.openTime as Row,close=p.closeTime as Row;return `${t(String(p.openDay).slice(0,1)+String(p.openDay).slice(1).toLowerCase())}: ${String(open.hours||0).padStart(2,"0")}:${String(open.minutes||0).padStart(2,"0")} – ${String(close.hours||0).padStart(2,"0")}:${String(close.minutes||0).padStart(2,"0")}`;}).join("\n")||t("Closed");
  if(typeof item==="object")return t("Selected photo");
  return String(item);
 }
 return <><section aria-label={t("Google Business Profile")} className="space-y-5 rounded-2xl border border-border bg-white p-5">
  <h2 className="font-serif text-2xl">{t("Google Business Profile")}</h2>
  {error?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm">{error}</p>:null}
  {notice?<p role="status" className="rounded-xl bg-primary/5 p-3 text-sm">{notice}</p>:null}
  {!state&&!error?<p>{t("Loading…")}</p>:null}
  {state?.available===false?<><p className="text-sm leading-6">{t("Google Business Profile is not available yet. Activation awaits a qualifying salon profile, Google approval and live verification.")}</p><p className="text-sm text-muted">{t("Your Girlz Culture page and booking tools continue to work. No Google profile changes or background synchronization are running.")}</p></>:null}
  {state?.available?<>
   <p className="text-sm">{t(state.status==="connected"?"This business has a connected Google profile.":"Authorize only the Google profile for this business.")}</p>
   {state.status==="disconnected"?<button disabled={busy} className={control+" bg-primary! text-white"} onClick={()=>void action(async()=>{const data=await api({action:"authorize"});const target=new URL(String(data.url));if(target.origin!=="https://accounts.google.com")throw Error(t("Google profile unavailable."));window.location.assign(target.toString());})}>{t("Connect Google profile")}</button>:null}
   {state.status==="authorized"?<div className="space-y-3"><p className="text-sm">{t("Only profiles matching your business name and phone or address can be selected. Other businesses are excluded.")}</p><button disabled={busy} className={control} onClick={()=>void action(async()=>{const data=await api({action:"locations"});setChoices(data.locations as Choice[]);setChoice("");setSearched(true);})}>{t("Find this business profile")}</button>
    {searched&&!choices.length?<p role="status" className="text-sm">{t("No matching profile was found. Check your Google account and this business name, phone and address.")}</p>:null}
    {choices.length?<><label className="block text-sm">{t("Matching Google profile")}<select className={control+" mt-2 w-full"} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">{t("Choose a profile")}</option>{choices.map((item,i)=><option key={item.account+item.name} value={i} data-no-translate>{item.title} · {(item.address.addressLines as string[]|undefined)?.join(" ")}</option>)}</select></label><button className={control} disabled={busy||choice===""} onClick={()=>void action(async()=>{const selected=choices[Number(choice)];await api({action:"connect",account:selected.account,location:selected.name});await refresh();})}>{t("Confirm this is my business")}</button></>:null}
   </div>:null}
   {state.status==="connected"?<>
    <p className="text-xs text-muted">{state.last_success_at?t("Last successful update: {value0}",{value0:formatDate(state.last_success_at,{dateStyle:"medium",timeStyle:"short"})}):t("No successful synchronization recorded yet.")}</p>
    {state.last_error?<p role="status" className="text-sm">{t("Synchronization needs review. Automatic updates have stopped; review the current Google profile before enabling them again.")}</p>:null}
    <p className="text-sm leading-6">{t("Girlz Culture is authoritative for reviewed name, phone, description and published regular hours. Your Google address, categories, website and reviews are not overwritten. External changes require a new review.")}</p>
    <label className="block text-sm">{t("Update type")}<select value={kind} onChange={e=>{setKind(e.target.value);clear();}} className={control+" ml-3"}><option value="info">{t("Business information and hours")}</option><option value="media">{t("Business photo")}</option><option value="post">{t("Google post")}</option></select></label>
    {kind==="media"?<label className="block text-sm">{t("Select an existing business photo")}<select value={url} onChange={e=>{setUrl(e.target.value);clear();}} className={control+" mt-2 w-full"}>{photos.map((photo,i)=><option key={photo} value={photo}>{t("Photo")} {i+1}</option>)}</select></label>:null}
    {kind==="post"?<label className="block text-sm">{t("Post text")}<textarea data-no-translate value={summary} onChange={e=>{setSummary(e.target.value);clear();}} rows={4} maxLength={1500} className={control+" mt-2 w-full"}/></label>:null}
    <button disabled={busy||(kind==="media"&&!url)||(kind==="post"&&!summary.trim())} className={control} onClick={()=>void action(async()=>{const data=await api({action:"preview",...payload()});setPreview(data as unknown as Preview);intent.current=crypto.randomUUID();})}>{t("Review Google update")}</button>
    {preview?<div className="space-y-3 rounded-xl border border-primary/30 p-4"><h3 className="font-semibold">{t("Review before sending to Google")}</h3>{Object.entries(preview.after).filter(([key])=>!["locationAssociation","mediaFormat","topicType","languageCode"].includes(key)).map(([key,after])=><div key={key} className="space-y-2 border-b border-border pb-3"><h4 className="text-sm font-semibold">{t(({title:"Business name",phoneNumbers:"Phone",profile:"Description",regularHours:"Regular hours",sourceUrl:"Selected photo",summary:"Post text"} as Record<string,string>)[key]||key)}</h4><div className="grid gap-2 sm:grid-cols-2"><span className="text-xs font-semibold">{t("Current Google value")}</span><span className="text-xs font-semibold">{t("Proposed value")}</span><p className="whitespace-pre-wrap break-words text-sm" data-no-translate>{value(key,preview.before[key])}</p><p className="whitespace-pre-wrap break-words text-sm" data-no-translate>{value(key,after)}</p></div></div>)}<p className="text-xs">{t("Google may review photos and posts before displaying them publicly.")}</p><button disabled={busy} className={control+" bg-primary! text-white"} onClick={()=>void action(async()=>{const result=await api({action:"sync",...payload(),id:intent.current,review_hash:preview.review_hash});setNotice(t(result.status==="completed"?"Google accepted the reviewed update.":"This operation needs review. Check Google before creating another update."));if(result.status==="completed")clear();await refresh();})}>{t("Send reviewed update")}</button></div>:null}
    <label className="flex items-start gap-3 rounded-xl bg-primary/5 p-4 text-sm"><input type="checkbox" checked={Boolean(state.auto_sync)} disabled={busy} onChange={e=>{const enabled=e.target.checked,previous=Boolean(state.auto_sync);setState({...state,auto_sync:enabled});void action(async()=>{try{await api({action:"auto_sync",enabled});await refresh();setNotice(t("Automatic synchronization preference saved."));}catch(error){setState(current=>current?{...current,auto_sync:previous}:current);throw error;}});}}/><span>{t("Automatically synchronize future business information and hours changes. Stop for external Google conflicts; never automatically publish photos or posts.")}</span></label>
    {state.operations?.length?<details><summary className="min-h-11 cursor-pointer text-sm">{t("Synchronization history")}</summary><ul className="space-y-2 text-sm">{state.operations.map(op=><li key={op.id}>{formatDate(op.created_at,{dateStyle:"medium",timeStyle:"short"})} · {t(({completed:"Completed",failed:"Failed",uncertain:"Needs review",cancelled:"Cancelled",running:"In progress"} as Record<string,string>)[op.status]||"Needs review")}</li>)}</ul></details>:null}
   </>:null}
   {state.status!=="disconnected"?<button disabled={busy} className={control} onClick={()=>void action(async()=>{const result=await api({action:"disconnect"});clear();await refresh();setNotice(t(result.revoked?"Disconnected. Background synchronization has stopped.":"Disconnected locally. Remove Girlz Culture access in your Google account if revocation could not be confirmed."));})}>{t("Disconnect Google profile")}</button>:null}
  </>:null}
  <button disabled={busy} className={control} onClick={()=>void action(refresh)}>{t("Refresh")}</button>
 </section><BusinessGoogleHelp key={`help:${businessId}`} businessId={businessId}/></>;
}
