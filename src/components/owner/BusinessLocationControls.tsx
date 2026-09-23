"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import type { BusinessLocationSettings } from "@/lib/businessLocationSettings";
import { useI18n } from "@/components/i18n/LocaleProvider";

export default function BusinessLocationControls() {
  const {translateSource:t}=useI18n();
  const [saved,setSaved]=useState<BusinessLocationSettings|null>(null),[draft,setDraft]=useState<BusinessLocationSettings|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[refresh,setRefresh]=useState(0),[busy,setBusy]=useState(false);
  const [radius,setRadius]=useState(""),[fee,setFee]=useState("");
  function restore(settings:BusinessLocationSettings){setSaved(settings);setDraft(settings);setRadius(settings.travel_radius_miles==null?"":String(settings.travel_radius_miles));setFee((settings.travel_fee_cents/100).toFixed(2));}
  useEffect(()=>{
    const controller=new AbortController();
    void(async()=>{try{const api=await createAuthenticatedApiClient("salon");const body=await api.request<{settings:BusinessLocationSettings;verified?:boolean}>("/api/salon/location",{signal:controller.signal});if(!controller.signal.aborted){restore(body.settings);setError("");}}catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"Location settings could not be loaded.");}})();
    return()=>controller.abort();
  },[refresh]);
  async function save(event:FormEvent){
    event.preventDefault();if(!draft||!saved||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const mobile=draft.service_location_type==='mobile'||draft.offers_mobile;
      const api=await createAuthenticatedApiClient("salon");
      const body=await api.request<{settings:BusinessLocationSettings;verified?:boolean}>("/api/salon/location",{method:"POST",body:JSON.stringify({revision:saved.revision,home_address_public:draft.home_address_public,public_neighborhood:draft.public_neighborhood||"",offers_mobile:mobile,travel_radius_miles:mobile?Number(radius):null,travel_fee_cents:mobile?Math.round(Number(fee)*100):0})});
      if(body.verified!==true)throw new Error("The saved location settings could not be verified.");
      restore(body.settings);setNotice("Location settings saved and verified.");
    }catch(failure){setError(failure instanceof Error?failure.message:"Location settings could not be saved. Your edits are retained.");}finally{setBusy(false);}
  }
  const mobile=draft?.service_location_type==='mobile'||draft?.offers_mobile;
  return <section className="max-w-3xl rounded-xl border border-border bg-white p-5">
    <h2 className="font-serif text-2xl">{t("Location & travel")}</h2>
    <p className="mt-2 text-sm text-muted">{t("Your verification address is kept privately. Address or location-type changes require a new review.")} <Link href="/contact" className="underline">{t("Request a location review")}</Link></p>
    {draft ? <form onSubmit={save} className="mt-5 space-y-5"><fieldset disabled={busy} className="space-y-5">
      {draft.service_location_type==='home'?<><label className="flex items-center gap-3"><input type="checkbox" checked={draft.home_address_public} onChange={e=>setDraft({...draft,home_address_public:e.target.checked})}/>{t("Show my home street address publicly")}</label><label className="block text-sm">{t("Public neighborhood")}<input required={!draft.home_address_public} maxLength={120} value={draft.public_neighborhood||""} onChange={e=>setDraft({...draft,public_neighborhood:e.target.value})} className="mt-2 min-h-11 w-full rounded-lg border p-3"/></label><p className="text-sm text-muted">{t("If your home address is private, only confirmed customers can retrieve it for their appointment.")}</p></>:null}
      {draft.service_location_type==='mobile'?<p>{t("Your verification address is never displayed publicly.")}</p>:<label className="flex items-center gap-3"><input type="checkbox" checked={draft.offers_mobile} onChange={e=>setDraft({...draft,offers_mobile:e.target.checked})}/>{t("I also travel to clients")}</label>}
      {mobile?<div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">{t("Travel radius (miles)")}<input type="number" required min={1} max={100} step="0.1" value={radius} onChange={e=>setRadius(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border p-3"/></label><label className="text-sm">{t("Travel fee ($)")}<input type="number" required min={0} max={1000} step="0.01" value={fee} onChange={e=>setFee(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border p-3"/></label></div>:null}
      <button className="min-h-11 rounded-lg bg-primary px-5 py-3 text-white gc-disabled-control" disabled={busy}>{t(busy?"Saving…":"Save and verify")}</button>
    </fieldset></form>:!error?<p role="status" className="mt-4">{t("Loading location settings…")}</p>:null}
    {error?<p role="alert" className="mt-4 text-sm gc-text-danger">{t(error)}</p>:null}
    {notice?<p role="status" className="mt-4 text-sm">{t(notice)}</p>:null}
    <button type="button" disabled={busy} onClick={()=>{setNotice("");setRefresh(value=>value+1);}} className="mt-4 min-h-11 underline">{t("Reload saved location settings")}</button>
  </section>;
}
