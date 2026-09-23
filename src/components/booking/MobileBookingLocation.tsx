"use client";
import {useLayoutEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";
import {useI18n} from "@/components/i18n/LocaleProvider";
import {travelAddress,type TravelAddress,type TravelQuote} from "@/lib/mobileBooking";
import {readApiResponse} from "@/lib/apiResponseClient";

export const EMPTY_TRAVEL_ADDRESS:TravelAddress={address_street:"",address_line2:"",address_city:"",address_state:"",address_zip:""};
export default function MobileBookingLocation({salonId,email,required,mobile,setMobile,address,setAddress,quote,setQuote,error}:{
 salonId:string;email:string;required:boolean;mobile:boolean;setMobile:(value:boolean)=>void;
 address:TravelAddress;setAddress:(value:TravelAddress)=>void;quote:TravelQuote|null;setQuote:(value:TravelQuote|null)=>void;error?:string;
}){
 const {translateSource:t,formatCurrency}=useI18n();const [busy,setBusy]=useState(false),[failure,setFailure]=useState(""),[reference,setReference]=useState("");
 const current=JSON.stringify({salonId,email,address,mobile});const live=useRef(current);
 useLayoutEffect(()=>{live.current=current;return()=>{live.current="";};},[current]);
 async function check(){
  if(busy)return;const submitted=live.current;setBusy(true);setFailure("");setReference("");
  try{
   const value=travelAddress(address);if(!email.trim())throw Error("Enter your booking email before checking the address.");
   const {data:{session}}=await supabase.auth.getSession();
   const response=await fetch("/api/booking/travel-quote",{method:"POST",headers:{"Content-Type":"application/json",...(session?{Authorization:`Bearer ${session.access_token}`}:{})},
    body:JSON.stringify({salon_id:salonId,guest_email:email,address:value}),signal:AbortSignal.timeout(15000)});
   const result=await readApiResponse(response,"The appointment address could not be checked.");
   if(live.current!==submitted)return;
   if(!response.ok){setReference(String(result.request_id||""));throw Error(result.code==="TRAVEL_OUTSIDE_RADIUS"?"This address is outside the business’s travel radius.":result.code==="TRAVEL_ADDRESS_INVALID"?"Enter a complete street address.":"The appointment address could not be checked.");}
   setQuote(result.quote as TravelQuote);
  }catch(caught){if(live.current===submitted){setQuote(null);setFailure(caught instanceof Error&&caught.message!=="TRAVEL_ADDRESS_INVALID"?caught.message:"Enter a complete street address.");}}
  finally{setBusy(false);}
 }
 return <section aria-label={t("Appointment location")} className="my-4 space-y-3 rounded-xl border border-border bg-white p-4">
  <h3 className="font-semibold">{t("Appointment location")}</h3>
  {!required?<label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={mobile} onChange={e=>{setMobile(e.target.checked);setQuote(null);}}/>{t("I want the professional to travel to me")}</label>:<p>{t("This appointment takes place at your address.")}</p>}
  {mobile?<><p className="text-sm">{t("Enter the address where the service will take place. It is shared only for this booking.")}</p>
   <div className="grid gap-3 sm:grid-cols-2">{Object.entries({address_street:"Street address",address_line2:"Apartment or suite (optional)",address_city:"City",address_state:"State",address_zip:"ZIP code"}).map(([key,label])=><label key={key} className="text-sm">{t(label)}<input autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border px-3" value={address[key as keyof TravelAddress]} maxLength={key==="address_state"?2:key==="address_zip"?10:160} onChange={e=>{setAddress({...address,[key]:key==="address_state"?e.target.value.toUpperCase():e.target.value});setQuote(null);setFailure("");}}/></label>)}</div>
   <button type="button" disabled={busy} onClick={()=>void check()} className="min-h-11 rounded-lg border border-primary px-4 font-semibold">{t(busy?"Checking address…":"Check address and travel fee")}</button>
   {quote?<p role="status">{t("Address checked. Travel fee: {value0}",{value0:formatCurrency(quote.fee_cents/100)})}</p>:null}
   {failure||error?<p role="alert" className="text-sm gc-text-danger">{t(failure||error||"")}</p>:null}
   {reference?<p className="text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p>:null}
  </>:null}
 </section>;
}
