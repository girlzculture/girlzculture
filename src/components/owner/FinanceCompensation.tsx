"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import { moneyCents, type OperatingBooks, type summarizeOperatingBooks } from "@/lib/businessFinanceCore";
import { zonedLocalToUtc } from "@/lib/dateTime";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { FinanceField, financeButton as button, financePrimary as primary, financePanel as panel, financeInput as input, financeLabels as labels } from "./FinanceUI";
type Row=Record<string,unknown>;
export default function FinanceCompensation({books,summary,arrangements,names,isOwner,manageable,today,timeZone,onSaved}:{books:OperatingBooks;summary:ReturnType<typeof summarizeOperatingBooks>;arrangements:Row[];names:Map<string,string>;isOwner:boolean;manageable:boolean;today:string;timeZone:string;onSaved:()=>Promise<void>}) {
  const {translateSource:t,locale}=useI18n();
  const [mode,setMode]=useState(""),[kind,setKind]=useState("commission"),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const pending=useRef(false),mounted=useRef(true),attempt=useRef<{signature:string;id:string}|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const money=(cents:number)=>new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(cents/100);
  const field=(label:string,child:ReactNode)=><FinanceField label={t(label)}>{child}</FinanceField>;
  const name=(id:unknown)=>names.get(String(id))||t("Unassigned");
  const choose=(next:string)=>{setMode(next);setKind("commission");setError("");setNotice("");attempt.current=null;};
  const title=mode==="arrangement"?"Set an arrangement":mode==="obligation"?"Record wage or rent due":"Record compensation payment";
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending.current)return;
    const form=new FormData(event.currentTarget),text=(key:string)=>String(form.get(key)||"");let payload:Row;
    try {
      if(mode==="arrangement") payload={stylist_id:text("stylist_id"),effective_from:text("effective_from"),kind,
        ...(kind==="commission"?{percent:Number(text("percent")),basis:text("basis")}:kind==="none"?{}:{amount_cents:moneyCents(text("amount")),period:text("period")})};
      else if(mode==="obligation") payload={arrangement_version:text("arrangement_version"),period_start:text("period_start"),due_at:zonedLocalToUtc(`${text("due_date")}T12:00`,timeZone).toISOString()};
      else {
        const obligation=books.obligations.find(row=>row.id===text("obligation_id"));
        payload={kind,stylist_id:kind==="commission"?text("stylist_id"):obligation?.stylist_id,obligation_id:kind==="commission"?null:obligation?.id,amount_cents:moneyCents(text("amount")),method:text("method")};
      }
    } catch {setError(t("Check the amount and required fields."));return;}
    const signature=JSON.stringify([mode,payload]);if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
    pending.current=true;setBusy(true);setError("");
    try {
      const api=await createAuthenticatedApiClient("salon");
      const result=await api.request("/api/salon/finances",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:mode,payload,request_id:attempt.current.id})});
      if(!mounted.current)return;if(result.verified!==true)throw Error("FINANCE_NOT_VERIFIED");
      attempt.current=null;setMode("");setNotice(t("Record saved. No payment was processed."));await onSaved();
    } catch(failure){if(mounted.current)setError(scopedApiErrorMessage(failure,t("The record could not be saved. Your entry is retained.")));}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  }
  return <section className={panel} aria-label={t("Compensation and rent")}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">{t("Compensation and rent")}</h2><div className="flex flex-wrap gap-2">{isOwner?<button className={button} disabled={busy} onClick={()=>choose("arrangement")}>{t("Set an arrangement")}</button>:null}{manageable?<><button className={button} disabled={busy} onClick={()=>choose("obligation")}>{t("Record wage or rent due")}</button><button className={primary} disabled={busy} onClick={()=>choose("compensation_payment")}>{t("Record payment")}</button></>:null}</div></div>
    <p className="mt-2 text-xs gc-text-secondary">{t("Arrangements are versioned. Completed sales keep their original commission basis. Payments here are records only; no transfer is made.")}</p>
    {error?<p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-sm">{error}</p>:null}{notice?<p role="status" className="my-3 text-sm">{notice}</p>:null}
    {mode?<form aria-label={t(title)} onSubmit={submit} className="my-4 space-y-3 rounded-lg border border-plum/10 p-3"><h3 className="font-semibold">{t(title)}</h3><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      {mode!=="obligation"?field("Arrangement type",<select name="kind" value={kind} onChange={event=>setKind(event.target.value)} className={input}>{(mode==="arrangement"?["commission","employee","booth","none"]:["commission","wage","booth_rent"]).map(value=><option key={value} value={value}>{t(labels[value])}</option>)}</select>):null}
      {mode==="arrangement"||mode==="compensation_payment"&&kind==="commission"?field("Stylist",<select name="stylist_id" required defaultValue="" className={input}><option value="" disabled>{t("Choose stylist")}</option>{[...names].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>):null}
      {mode==="arrangement"?<>{field("Effective from",<input name="effective_from" type="date" min={today} defaultValue={today} required className={input}/>)}{kind==="commission"?<>{field("Commission percentage",<input name="percent" type="number" min="0" max="100" step="0.01" required className={input}/>)}{field("Calculation basis",<select name="basis" className={input}><option value="after_discount">{t("After discount")}</option><option value="before_discount">{t("Before discount")}</option></select>)}</>:kind!=="none"?<>{field("Agreed amount",<input name="amount" required inputMode="decimal" className={input}/>)}{field("Period",<select name="period" className={input}><option value="week">{t("Weekly")}</option><option value="month">{t("Monthly")}</option></select>)}</>:null}</>:null}
      {mode==="obligation"?<>{field("Arrangement",<select name="arrangement_version" required defaultValue="" className={input}><option value="" disabled>{t("Choose an arrangement")}</option>{arrangements.filter(row=>["booth","employee"].includes(String(row.kind))).map(row=><option key={String(row.id)} value={String(row.id)}>{name(row.stylist_id)} · {t(labels[String(row.kind)])} · {money(Number(row.amount_cents))} · {String(row.effective_from)}</option>)}</select>)}{field("Period starts",<input name="period_start" type="date" defaultValue={today} required className={input}/>)}{field("Due date",<input name="due_date" type="date" defaultValue={today} required className={input}/>)}</>:null}
      {mode==="compensation_payment"?<>{kind!=="commission"?field("Recorded obligation",<select name="obligation_id" required defaultValue="" className={input}><option value="" disabled>{t("Choose an obligation")}</option>{books.obligations.filter(row=>row.kind===kind).map(row=><option key={row.id} value={row.id}>{name(row.stylist_id)} · {row.due_at.slice(0,10)} · {money(row.amount_cents-books.compensation_payments.filter(p=>p.obligation_id===row.id).reduce((sum,p)=>sum+p.amount_cents,0))}</option>)}</select>):null}{field("Amount paid",<input name="amount" required inputMode="decimal" className={input}/>)}{field("Payment method",<select name="method" className={input}>{["cash","card","transfer","other"].map(value=><option key={value} value={value}>{t(labels[value])}</option>)}</select>)}</>:null}
    </fieldset><p className="text-xs gc-text-secondary">{t("Commission payments above earned compensation appear as an advance. Wage and rent payments cannot exceed their recorded obligation.")}</p><div className="flex gap-2"><button type="submit" disabled={busy} className={primary}>{t(busy?"Saving…":"Save record")}</button><button type="button" disabled={busy} className={button} onClick={()=>choose("")}>{t("Cancel")}</button></div></form>:null}
    <p className="my-3 text-xs gc-text-secondary">{t("Outstanding position as of")}: <span data-no-translate>{summary.position_as_of} · {timeZone}</span></p><div className="grid gap-3 sm:grid-cols-2">{Object.entries(summary.compensation_position).map(([id,row])=><article key={id} className="rounded-lg border border-plum/10 p-3"><h3 className="font-semibold">{name(id)}</h3><dl className="mt-2 space-y-1 text-sm">{[["Commission earned",row.commission_earned_cents],["Wages due",row.wage_due_cents],["Compensation paid",row.commission_paid_cents+row.wage_paid_cents],["Outstanding compensation",row.compensation_outstanding_cents],["Advance",row.advance_cents],["Outstanding rent",row.rent_outstanding_cents]].map(([label,value])=><div className="flex justify-between gap-3" key={label}><dt>{t(String(label))}</dt><dd>{money(Number(value))}</dd></div>)}</dl></article>)}</div>
    <details className="mt-4"><summary className="cursor-pointer font-semibold">{t("Arrangement and payment history")}</summary><ul className="mt-3 space-y-2 text-sm">{arrangements.map(row=><li key={String(row.id)}>{name(row.stylist_id)} · {t(labels[String(row.kind)])} · {row.kind==="commission"?`${Number(row.percent)}% · ${t(labels[String(row.basis)])}`:row.kind==="none"?"":`${money(Number(row.amount_cents))} · ${t(labels[String(row.period)])}`} · {t("Effective from")}: {String(row.effective_from)}</li>)}</ul><ul className="mt-3 space-y-2 text-sm">{books.compensation_payments.map(row=><li key={row.id}>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone}).format(new Date(row.occurred_at))} · {name(row.stylist_id)} · {t(labels[row.kind])} · {t(labels[row.method])} · {money(row.amount_cents)}</li>)}</ul>{!arrangements.length&&!books.compensation_payments.length?<p className="my-3 text-sm gc-text-secondary">{t("No arrangements or payments recorded.")}</p>:null}</details>
  </section>;
}
