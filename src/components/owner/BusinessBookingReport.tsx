"use client";
import {useEffect,useState,useRef} from "react";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {scopedApiErrorMessage} from "@/lib/scopedApiCore";
import type {BusinessBookingReport as Report,BookingReportSource} from "@/lib/businessBookingReport";
import {financePanel,financeButton} from "./FinanceUI";
const sourceNames:Record<string,string>={platform:"Girlz Culture",off_platform:"Outside the platform",walk_in:"Walk-in",phone:"Phone",social:"Social media",other:"Other"};
export default function BusinessBookingReport({month,businessId}:{month:string;businessId:string}){
 const {translateSource:t,locale}=useI18n();const [snapshot,setSnapshot]=useState<{key:string;report:Report}|null>(null),[error,setError]=useState<unknown>(null);const [revision,setRevision]=useState(0),generation=useRef(0);const key=businessId+":"+month;
 const report=snapshot?.key===key?snapshot.report:null;
 useEffect(()=>{let active=true;const epoch=++generation.current;
  void Promise.resolve().then(async()=>{if(!active)return;setError(null);try{const api=await createAuthenticatedApiClient("salon");if(!active)return;
   const data=await api.request<{report:Report}>(`/api/salon/booking-report?month=${encodeURIComponent(month)}`);
   if(data.report?.salon_id!==businessId||data.report.month!==month+"-01")throw Error("REPORT_SCOPE_MISMATCH");
   if(active&&epoch===generation.current)setSnapshot({key,report:data.report});
  }catch(failure){if(active&&epoch===generation.current){setSnapshot(null);setError(failure);}}});
  return()=>{active=false;};
 },[key,businessId,month,revision]);
 const money=(n:number)=>new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(n/100);
 const sources=(rows:BookingReportSource[])=><dl className="mt-3 space-y-2">{rows.map(row=><div key={row.name} className="flex justify-between gap-3"><dt>{t(sourceNames[row.name]||row.name)}</dt><dd>{row.bookings}</dd></div>)}</dl>;
 return <section className={financePanel} aria-label={t("Monthly appointment report")}><h2 className="font-serif text-xl font-bold">{t("Monthly appointment report")}</h2><p className="mt-2 text-sm">{month}</p>
  <p className="mt-2 text-xs gc-text-secondary">{t("Appointments are grouped by their scheduled date in your business time zone. Completed value is the saved appointment price, not cash received or profit. Ledger-only walk-in sales stay in your finance reports.")}</p>
  {error?<div role="alert" className="mt-3"><p>{scopedApiErrorMessage(error,t("The appointment report could not be loaded."))}</p><button className={financeButton} onClick={()=>setRevision(n=>n+1)}>{t("Reload")}</button></div>:!report?<p role="status" className="mt-3">{t("Loading report…")}</p>:<>
   <p className="mt-3 text-sm">{t({basic:"Basic reporting",detailed:"Detailed reporting",advanced:"Advanced reporting"}[report.level])}{report.scope==='assigned_professional'?` · ${t("Your assigned appointments only")}`:''}</p>
   <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">{[["Appointments",report.totals.bookings],["Completed",report.totals.completed],["Cancelled",report.totals.cancelled],["No-shows",report.totals.no_shows],["Completed appointment value",money(report.totals.completed_value_cents)],["Missing saved prices",report.totals.missing_prices]].map(([label,value])=><div key={label} className="rounded-lg border border-plum/10 p-3"><dt className="text-xs">{t(String(label))}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>
   <div className="mt-4 grid gap-4 md:grid-cols-2"><section><h3 className="font-semibold">{t("Booking sources")}</h3>{sources(report.sources)}{!report.sources.length?<p className="mt-2 text-sm">{t("No appointments in this month.")}</p>:null}</section>
   {report.comparison?<section><h3 className="font-semibold">{t("Previous month")}: {report.comparison.month.slice(0,7)}</h3><p className="mt-2 text-sm">{t("Appointments")}: {report.comparison.totals.bookings} · {t("Completed")}: {report.comparison.totals.completed}</p><p className="text-sm">{t("Completed appointment value")}: {money(report.comparison.totals.completed_value_cents)}</p>{sources(report.comparison.sources)}</section>:null}</div>
   {report.daily?<details className="mt-4"><summary className="cursor-pointer font-semibold">{t("Daily appointment counts")}</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{report.daily.map(row=><div className="flex justify-between gap-3" key={row.day}><dt>{row.day}</dt><dd>{row.bookings} / {row.completed} {t("Completed")}</dd></div>)}</dl></details>:null}
   {report.services?<details className="mt-4"><summary className="cursor-pointer font-semibold">{t("Services in this month")}</summary><dl className="mt-3 space-y-2">{report.services.map((row,i)=><div key={i} className="flex justify-between gap-3"><dt data-no-translate>{row.name}</dt><dd>{row.bookings} / {row.completed} {t("Completed")}</dd></div>)}</dl></details>:null}
   {report.team?<details className="mt-4"><summary className="cursor-pointer font-semibold">{t("Team appointment comparison")}</summary><dl className="mt-3 space-y-2">{report.team.map((row,i)=><div key={i} className="flex justify-between gap-3"><dt data-no-translate>{row.name}</dt><dd>{row.bookings} / {row.completed} {t("Completed")}</dd></div>)}</dl></details>:null}
  </>}
 </section>;
}
