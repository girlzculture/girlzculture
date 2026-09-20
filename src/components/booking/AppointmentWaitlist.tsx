"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {getSessionForScope,getSupabaseForScope} from "@/lib/supabase";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {readApiResponse} from "@/lib/apiResponseClient";

type Offer={id:string;appointment_at:string;expires_at:string;stylist_id:string|null;status:string;booking_id:string|null};
type Entry={id:string;style_id:string;stylist_id:string|null;starts_after:string;starts_before:string;status:string;business_name?:string;service_name:string;professional_name?:string;customer_name?:string;slug?:string;time_zone?:string;open_offers?:number;offers?:Offer[]};
const control="min-h-11 min-w-0 rounded-xl border border-border bg-white px-3 py-2 text-sm";
export async function waitlistRequest(scope:"customer"|"salon",body?:Record<string,unknown>) {
 const session=await getSessionForScope(scope);
 if(!session)throw Error("WAITLIST_AUTH_REQUIRED");
 const response=await fetch(`/api/${scope}/waitlist`,{method:body?"POST":"GET",cache:"no-store",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const result=await readApiResponse(response,"Waitlist unavailable.");
 if(!response.ok)throw Error(result.code==="WAITLIST_AUTH_REQUIRED"?"WAITLIST_AUTH_REQUIRED":String(result.request_id||"WAITLIST_UNAVAILABLE"));
 return (result.requests||[]) as Entry[];
}
function offerHref(entry:Entry,offer:Offer) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:entry.time_zone||"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(offer.appointment_at)).map(p=>[p.type,p.value]));
 const query=new URLSearchParams({style:entry.style_id,date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,waitlist_offer:offer.id});
 if(offer.stylist_id)query.set("stylist",offer.stylist_id);
 return `/salon/${encodeURIComponent(entry.slug||"")}/book?${query}`;
}
export default function AppointmentWaitlist({scope="customer",timeZone="America/New_York"}:{scope?:"customer"|"salon";timeZone?:string}) {
 const {translateSource:t,formatDate,formatNumber}=useI18n();
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState("");
 const generation=useRef(0);
 async function load(body?:Record<string,unknown>) {
  const current=++generation.current;setError("");setLoading(true);
  try {const result=await waitlistRequest(scope,body);if(current===generation.current)setRows(result);}
  catch(error){if(current===generation.current)setError(error instanceof Error?error.message:"WAITLIST_UNAVAILABLE");}
  finally{if(current===generation.current){setLoading(false);setBusy("");}}
 }
 useEffect(()=>{
  const lifetime=generation;
  let actor:string|undefined;
  const subscription=getSupabaseForScope(scope).auth.onAuthStateChange((_event,session)=>{
   const next=session?.user.id||"";
   if(next===actor)return;actor=next;generation.current++;setRows([]);setError("");
   // Avoid awaiting a second auth operation inside the auth callback.
   queueMicrotask(()=>void load());
  });
  return()=>{lifetime.current++;subscription.data.subscription.unsubscribe();};
  // scope owns the authenticated lifetime. load itself is intentionally not an effect dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope]);
 return <section className="space-y-4" aria-label={t("Appointment waitlist")}>
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">{t("Appointment waitlist")}</h2><button className={control} onClick={()=>void load()} disabled={loading}>{t("Refresh")}</button></div>
  <p className="text-sm leading-6 text-muted">{t("Opening offers appear in your account notifications. An offer is not a booking. Review current availability, price and deposit before confirming.")}</p>
  {loading?<p role="status">{t("Loading…")}</p>:null}
  {error?<div role="alert" className="rounded-xl border border-red-200 p-4 text-sm">{error==="WAITLIST_AUTH_REQUIRED"?<Link href="/login?next=/account/waitlist" className="font-semibold text-primary">{t("Sign in to manage your waitlist")}</Link>:<>{t("Waitlist unavailable. Try again.")} <span data-no-translate>{error}</span></>}</div>:null}
  {!loading&&!error&&!rows.length?<p className="rounded-xl border border-dashed border-border p-6 text-sm">{t("No appointment waitlist requests yet.")}</p>:null}
  <div className="grid gap-3 lg:grid-cols-2">{rows.map(row=><article key={row.id} className="min-w-0 space-y-3 rounded-2xl border border-border bg-white p-4">
   <h3 className="font-serif text-xl break-words" data-no-translate>{scope==="salon"?row.customer_name:row.business_name}</h3>
   <p className="break-words text-sm" data-no-translate>{row.service_name}{row.professional_name?` · ${row.professional_name}`:""}</p>
   <p className="text-xs text-muted">{formatDate(row.starts_after,{dateStyle:"medium",timeStyle:"short",timeZone:row.time_zone||timeZone})} – {formatDate(row.starts_before,{dateStyle:"medium",timeStyle:"short",timeZone:row.time_zone||timeZone})}</p>
   <span className="inline-block rounded-full bg-subtle px-3 py-1 text-xs">{t(({waiting:"Waiting",cancelled:"Cancelled",fulfilled:"Booked",expired:"Expired"} as Record<string,string>)[row.status]||"Unavailable")}</span>
   {scope==="salon"?<p className="text-xs">{t("{value0} open offers",{value0:formatNumber(row.open_offers||0)})}</p>:null}
   {(row.offers||[]).map(offer=><div key={offer.id} className="rounded-xl bg-subtle p-3 text-sm"><b>{formatDate(offer.appointment_at,{dateStyle:"medium",timeStyle:"short",timeZone:row.time_zone||timeZone})}</b>
    {offer.status==="offered"&&new Date(offer.expires_at).getTime()>Date.now()&&row.status==="waiting"?<><p className="my-2 text-xs">{t("Offer expires {value0}",{value0:formatDate(offer.expires_at,{timeStyle:"short",timeZone:row.time_zone||timeZone})})}</p><Link href={offerHref(row,offer)} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 text-white">{t("Review opening")}</Link></>:<p className="mt-2">{t(offer.status==="booked"?"Booked":offer.status==="claimed"?"Checkout in progress":"Offer closed")}</p>}
   </div>)}
   {scope==="customer"&&row.status==="waiting"?<button disabled={Boolean(busy)} className={control} onClick={()=>{setBusy(row.id);void load({action:"leave",id:row.id});}}>{t("Leave waitlist")}</button>:null}
  </article>)}</div>
 </section>;
}

export function JoinAppointmentWaitlist({salonId,styleId,stylistId,date,timeZone}:{salonId:string;styleId:string;stylistId:string|null;date:string;timeZone:string}) {
 const {translateSource:t,locale}=useI18n();
 const [from,setFrom]=useState("09:00"),[until,setUntil]=useState("17:00"),[busy,setBusy]=useState(false),[result,setResult]=useState("");
 const request=useRef<{key:string;id:string}|null>(null),generation=useRef(0);
 const key=`${salonId}:${styleId}:${stylistId}:${date}:${from}:${until}`;
 useEffect(()=>{
  const lifetime=generation;
  let actor:string|undefined;
  const subscription=getSupabaseForScope("customer").auth.onAuthStateChange((_event,session)=>{
   const next=session?.user.id||"";if(actor===next)return;actor=next;generation.current++;request.current=null;setResult("");setBusy(false);
  });
  return()=>{lifetime.current++;subscription.data.subscription.unsubscribe();};
 },[]);
 function reset(){generation.current++;setResult("");setBusy(false);}
 async function join(){
  if(busy)return;setBusy(true);setResult("");const current=generation.current;
  if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  try{await waitlistRequest("customer",{action:"join",id:request.current.id,salon_id:salonId,style_id:styleId,stylist_id:stylistId,from_local:`${date}T${from}`,until_local:`${date}T${until}`,locale:["en","fr","es","zh-CN"].includes(locale)?locale:"en"});if(current===generation.current)setResult("saved");}
  catch(error){if(current===generation.current)setResult(error instanceof Error?error.message:"WAITLIST_UNAVAILABLE");}
  finally{if(current===generation.current)setBusy(false);}
 }
 return <section className="mt-5 space-y-3 rounded-xl border border-border p-4">
  <h3 className="text-sm font-semibold">{t("Join the appointment waitlist")}</h3>
  <p className="text-xs leading-5">{t("Choose a start-time window for this service and professional. We will notify your customer account if a cancellation matches. No reservation or payment is made.")}</p>
  <p className="text-xs" data-no-translate>{date} · {timeZone}</p>
  <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-xs">{t("Earliest start")}<input type="time" className={`${control} mt-1 w-full`} value={from} onChange={e=>{reset();setFrom(e.target.value);}}/></label><label className="min-w-0 text-xs">{t("Latest start")}<input type="time" className={`${control} mt-1 w-full`} value={until} onChange={e=>{reset();setUntil(e.target.value);}}/></label></div>
  <button type="button" disabled={busy||!date||!styleId||!from||!until||from>=until||result==="saved"} onClick={()=>void join()} className={`${control} w-full bg-primary text-white gc-disabled-control`}>{t(busy?"Saving…":"Join waitlist")}</button>
  {result?<p role={result==="saved"?"status":"alert"} className="text-xs">{result==="saved"?<Link href="/account/waitlist">{t("Request saved. Manage your waitlist")}</Link>:result==="WAITLIST_AUTH_REQUIRED"?<Link href={`/login?next=${encodeURIComponent(typeof window!=="undefined"?window.location.pathname+window.location.search:"/account/waitlist")}`}>{t("Sign in to manage your waitlist")}</Link>:<>{t("Waitlist unavailable. Try again.")} <span data-no-translate>{result}</span></>}</p>:null}
 </section>;
}
