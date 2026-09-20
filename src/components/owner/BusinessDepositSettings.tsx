"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {createAuthenticatedApiClient} from "@/lib/scopedApiClient";
import {scopedApiErrorMessage} from "@/lib/scopedApiCore";
import {validateDepositRule,type BusinessDepositRule} from "@/lib/businessDepositRules";
import {FinanceField,financePanel,financeInput,financePrimary,financeButton} from "./FinanceUI";
import {useI18n} from "@/components/i18n/LocaleProvider";

export default function BusinessDepositSettings(){
 const {translateSource:t}=useI18n();
 const [rule,setRule]=useState<BusinessDepositRule|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 const mounted=useRef(true),pending=useRef(false),operation=useRef<{signature:string;id:string}|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;}},[]);
 async function load(){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");
  try{const api=await createAuthenticatedApiClient("salon");const result=await api.request<{rule:BusinessDepositRule}>("/api/salon/deposit-rules");if(mounted.current){setRule(validateDepositRule(result.rule));setOpen(true);operation.current=null;}}
  catch(failure){if(mounted.current)setError(scopedApiErrorMessage(failure,t("Deposit settings could not be loaded.")));}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current||!rule)return;
  const data=new FormData(event.currentTarget),optional=(name:string)=>String(data.get(name)||"").trim()?Number(data.get(name)):null;
  const value={rate:Number(data.get("rate")),threshold_amount:optional("threshold_amount"),threshold_rate:optional("threshold_rate"),repeat_incident_count:optional("repeat_incident_count"),repeat_incident_rate:optional("repeat_incident_rate"),incident_window_days:Number(data.get("incident_window_days"))};
  try{validateDepositRule({...value,version:rule.version});}catch{setError(t("Check the deposit rates and paired threshold fields."));return;}
  const signature=JSON.stringify([rule.version,value]);if(operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
  pending.current=true;setBusy(true);setError("");setNotice("");
  try{const api=await createAuthenticatedApiClient("salon");const result=await api.request<{rule:BusinessDepositRule;verified:boolean}>("/api/salon/deposit-rules",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rule:value,expected_version:rule.version,request_id:operation.current.id})});if(!result.verified)throw Error("DEPOSIT_NOT_VERIFIED");if(mounted.current){setRule(validateDepositRule(result.rule));operation.current=null;setNotice(t("Deposit settings saved. Existing bookings keep their original terms."));}}
  catch(failure){if(mounted.current)setError(scopedApiErrorMessage(failure,t("Deposit settings could not be saved. Your entry is retained.")));}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 const number=(name:string,value:number|null,max:number,required=false,step="0.01")=><input name={name} type="number" min="0" max={max} step={step} required={required} defaultValue={value??""} className={financeInput}/>;
 return <section className={financePanel} aria-label={t("Booking deposit settings")}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-bold">{t("Booking deposits")}</h2><button className={financeButton} disabled={busy} onClick={()=>void load()}>{t(open?"Reload saved settings":"Manage deposit settings")}</button></div>
 <p className="mt-2 text-sm gc-text-secondary">{t("Set rates for future bookings. Promotions reduce the remaining balance, never the required deposit.")}</p>
 {error?<p role="alert" className="mt-3 text-sm gc-text-danger">{error}</p>:null}{notice?<p role="status" className="mt-3 text-sm gc-text-success">{notice}</p>:null}
 {open&&rule?<form key={rule.version||"default"} onSubmit={save} aria-label={t("Booking deposit settings")} className="mt-4 space-y-4"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><FinanceField label={t("Standard deposit (%)")}>{number("rate",rule.rate,100,true)}</FinanceField><div/>
 <FinanceField label={t("Higher rate above service price (USD)")}>{number("threshold_amount",rule.threshold_amount,10000)}</FinanceField><FinanceField label={t("Higher-price deposit (%)")}>{number("threshold_rate",rule.threshold_rate,100)}</FinanceField>
 <FinanceField label={t("Repeat incidents at this business")}>{number("repeat_incident_count",rule.repeat_incident_count,100,false,"1")}</FinanceField><FinanceField label={t("Repeat-incident deposit (%)")}>{number("repeat_incident_rate",rule.repeat_incident_rate,100)}</FinanceField><FinanceField label={t("Incident lookback (days)")}>{number("incident_window_days",rule.incident_window_days,730,true,"1")}</FinanceField></fieldset>
 <p className="text-xs gc-text-secondary">{t("Leave both fields in a pair blank to disable that rule. The highest applicable rate is used once. Only confirmed incidents at your business count; disputed incidents are excluded.")}</p><button className={financePrimary} disabled={busy} type="submit">{t(busy?"Saving…":"Save deposit settings")}</button></form>:null}</section>;
}
