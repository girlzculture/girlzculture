"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Sun,RefreshCw,ArrowUpRight} from "lucide-react";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {scopedApiErrorMessage} from "@/lib/scopedApiCore";
import type {MorningBrief,BriefSection} from "@/lib/businessMorningBrief";

export default function BusinessMorningBrief(){
 const {translateSource:t,formatDate,formatCurrency:money,formatNumber:number}=useI18n();
 const [data,setData]=useState<MorningBrief|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const generation=useRef(0);
 const load=useCallback(async()=>{
  const current=++generation.current;setLoading(true);setError("");
  try{const api=await createAuthenticatedApiClient("salon");const value=await api.request<MorningBrief>("/api/salon/morning-brief");if(current===generation.current)setData(value);}
  catch(failure){if(current===generation.current){setData(null);setError(scopedApiErrorMessage(failure,t("Morning brief could not be loaded.")));}}
  finally{if(current===generation.current)setLoading(false);}
 },[t]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void load();});return()=>{active=false;
  // Invalidates an in-flight read when the authorized workspace unmounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  generation.current++;
 };},[load]);
 const unavailable=(part:BriefSection<unknown>)=>part.status==="unavailable"?<p role="status" className="mt-2 break-words text-xs text-muted">{t("Unavailable, not zero. Refresh to try again.")} <span data-no-translate>{part.request_id}</span></p>:null;
 const time=(at:string)=>formatDate(at,{timeZone:data?.time_zone,hour:"numeric",minute:"2-digit"});
 const recommendations:Array<[string,string]>=[];
 if(data?.appointments.status==="ok"){
  if(data.appointments.value.overlaps||data.appointments.value.unassigned)recommendations.push(["Review overlapping or unassigned appointments.","availability"]);
  else if(data.appointments.value.overdue)recommendations.push(["Check the status of appointments that have already started.","bookings"]);
 }
 if(data?.inventory.status==="ok"&&data.inventory.value.length)recommendations.push(["Review low stock before today's services.","products?tab=inventory"]);
 if(data?.availability.status==="ok"&&data.availability.value.waitlist_opportunities)recommendations.push(["Review waiting clients against today's open time.","bookings/waitlist"]);
 if(data?.followups.status==="ok"&&data.followups.value.length)recommendations.push(["Review pending post-visit follow-ups.","bookings"]);
 const card="min-w-0 rounded-xl border border-border bg-white p-3";
 return <section aria-label={t("Morning brief")} aria-busy={loading} className="rounded-2xl border border-border bg-subtle p-4 sm:p-5">
  <header className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-serif text-2xl"><Sun size={22} className="shrink-0 text-primary"/>{t("Morning brief")}</h2><p className="mt-1 text-xs text-muted">{t("Your business today. Facts first, next steps ready.")}</p></div><button type="button" onClick={()=>void load()} disabled={loading} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-white px-3 text-xs font-semibold disabled:text-muted"><RefreshCw size={15}/>{t("Refresh")}</button></header>
  {error?<p role="alert" className="mt-3 break-words text-sm text-muted">{error}</p>:null}
  {!data&&loading?<p role="status" className="mt-3 text-sm">{t("Loading today's brief…")}</p>:null}
  {data?<><p className="my-3 text-xs text-muted">{t("Updated {value0}",{value0:formatDate(data.generated_at,{timeZone:data.time_zone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})})} · <span data-no-translate>{data.time_zone}</span></p>
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
   <article className={card}><h3 className="font-semibold">{t("Today's appointments")}</h3>{unavailable(data.appointments)}{data.appointments.status==="ok"?<><p className="mt-2 text-xs">{t("{value0} appointments · {value1} cancellations · {value2} no-shows",{value0:number(data.appointments.value.items.length),value1:number(data.appointments.value.cancelled),value2:number(data.appointments.value.no_shows)})}</p><ul className="mt-2 max-h-56 overflow-y-auto">{data.appointments.value.items.map(row=><li key={row.id} className="border-t border-border"><Link href={`/salon/dashboard/bookings/${row.id}`} className="block min-h-11 py-2 text-xs"><b>{time(row.at)}</b> · <span data-no-translate>{row.client||t("Customer")}</span><span className="mt-1 block text-muted" data-no-translate>{row.service||t("Appointment")} · {row.professional||t("Unassigned")}</span><span className="mt-1 block">{t(row.status)}</span></Link></li>)}</ul>{!data.appointments.value.items.length?<p className="mt-2 text-xs">{t("No appointments today.")}</p>:null}<p className="mt-2 text-xs">{t("{value0} overlapping pairs · {value1} unassigned · {value2} started, status to check",{value0:number(data.appointments.value.overlaps),value1:number(data.appointments.value.unassigned),value2:number(data.appointments.value.overdue)})}</p></>:null}</article>
   <article className={card}><h3 className="font-semibold">{t("Today's appointment money")}</h3>{unavailable(data.money)}{data.money.status==="ok"?<><dl className="mt-2 space-y-2 text-xs">{([["Expected service value",data.money.value.expected_cents],["Deposits received",data.money.value.deposit_cents],["Received after refunds",data.money.value.received_cents],["Outstanding balance",data.money.value.balance_cents]] as const).map(([label,value])=><div key={label} className="flex justify-between gap-3"><dt>{t(label)}</dt><dd className="font-semibold">{money(value/100)}</dd></div>)}</dl><p className="mt-3 text-xs text-muted">{t("Expected value is not revenue received. Deposits are included in receipts, not added again. Cancelled appointments and no-shows are excluded from these money totals.")}</p><Link href="/salon/dashboard/earnings" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary">{t("Open Finances")}</Link></>:null}</article>
   <article className={card}><h3 className="font-semibold">{t("Open time and waitlist")}</h3>{unavailable(data.availability)}{data.availability.status==="ok"?<><p className="mt-2 text-xs">{t("{value0} open intervals · {value1} waiting requests to review",{value0:number(data.availability.value.gaps.length),value1:number(data.availability.value.waitlist_opportunities)})}</p><ul className="mt-2 max-h-40 overflow-y-auto space-y-2 text-xs">{data.availability.value.gaps.map((gap,index)=><li key={index}>{time(gap.start)}–{time(gap.end)} · <span data-no-translate>{gap.professional_name||t("Business")}</span></li>)}</ul><p className="mt-2 text-xs text-muted">{t("Open time includes current holds and blocks. A waiting request still needs a service-fit check; no offer or booking is created here.")}</p><Link href="/salon/dashboard/bookings/waitlist" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary">{t("Appointment waitlist")}</Link></>:null}</article>
   <article className={card}><h3 className="font-semibold">{t("Stock to review")}</h3>{unavailable(data.inventory)}{data.inventory.status==="ok"?<>{data.inventory.value.length?<ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs">{data.inventory.value.map((row,index)=><li key={index}><span data-no-translate>{row.name}</span> · {row.quantity===null?t("Quantity unavailable"):number(row.quantity)}</li>)}</ul>:<p className="mt-2 text-xs">{t("No low-stock warnings in tracked inventory.")}</p>}<Link href="/salon/dashboard/products?tab=inventory" className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-primary">{t("Review inventory")}</Link></>:null}</article>
   <article className={card}><h3 className="font-semibold">{t("Post-visit follow-ups")}</h3>{unavailable(data.followups)}{data.followups.status==="ok"?<><p className="mt-2 text-xs">{t("{value0} queued follow-ups due for review",{value0:number(data.followups.value.length)})}</p><ul className="mt-2 max-h-40 overflow-y-auto text-xs">{data.followups.value.map(row=><li key={row.booking_id}><Link className="inline-flex min-h-11 items-center font-semibold text-primary" href={`/salon/dashboard/bookings/${row.booking_id}`} data-no-translate>{row.client||t("Customer")}</Link></li>)}</ul><p className="mt-2 text-xs text-muted">{t("Sending still requires current customer consent and eligibility. Opening this brief sends nothing.")}</p></>:null}</article>
   <article className={card}><h3 className="font-semibold">{t("Your next steps")}</h3>{recommendations.length?<ul className="mt-2 space-y-2">{recommendations.slice(0,2).map(([label,path])=><li key={path}><Link href={`/salon/dashboard/${path}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-subtle p-2 text-xs font-semibold text-primary">{t(label)}<ArrowUpRight size={16} className="shrink-0"/></Link></li>)}</ul>:<p className="mt-2 text-xs text-muted">{t("No urgent recommendation from the available records. Review today's calendar for the next appointment.")}</p>}</article>
  </div></>:null}
 </section>;
}
