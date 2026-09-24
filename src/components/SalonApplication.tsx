"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ApplicationAgent from "@/components/business/ApplicationAgent";
import {emptyInterview,type ApplicationInterview,type InterviewKey} from "@/lib/applicationInterview";
import LanguageSelector from "@/components/i18n/LanguageSelector";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, FileUp, LockKeyhole } from "lucide-react";
import {
  getValidSessionForScope,
  getSessionForScope,
  reportClientOperationalFailure,
  salonSupabase as supabase,
} from "@/lib/supabase";
import { readApiResponse } from "@/lib/apiResponseClient";
import {
  APPLICATION_DOCUMENT_MAXIMUM_BYTES,
  APPLICATION_DOCUMENT_MAXIMUM_COUNT,
  APPLICATION_DOCUMENT_MIME_TYPES,
} from "@/lib/applicationDocumentUploadCore";
import { parseApplicationPlanQuery, PLAN_ORDER, SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/plans";
import { EMAIL_PATTERN, formatUsPhoneInput, isValidEmail, isValidUsPhone, US_PHONE_PATTERN } from "@/lib/validation";

import { isValidUsZip, US_STATES } from "@/lib/usStates";
import NumericInput from "@/components/forms/NumericInput";
import { parseBusinessSetup } from "@/lib/businessOnboarding";
import { INITIAL_APPLICATION_FIELDS, APPLICATION_TOPICS, applicationSetup, validateApplicationDetails, type ApplicationFields } from "@/lib/applicationProgress";
import { useApplicationProgress, type ApplicationProgressPayload } from "@/components/business/useApplicationProgress";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { isSoloPlan } from "@/lib/plans";
const initial = INITIAL_APPLICATION_FIELDS;

export default function SalonApplication({businessTypes}:{businessTypes:string[]}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form,setForm] = useState({...initial,business_type:businessTypes[0]||initial.business_type});
  const selectedPlan = parseApplicationPlanQuery(searchParams.get("plan"));
  const [userId,setUserId] = useState("");
  const [checks,setChecks] = useState([false,false,false]);
  const [message,setMessage] = useState("");
  const [saving,setSaving] = useState(false);
  const [documents,setDocuments] = useState<string[]>([]);
  const [uploadingDocs,setUploadingDocs] = useState(false);
  const [step,setStep] = useState(0);
  const [entryMode,setEntryMode]=useState<"form"|"conversation">("form");
  const [interview,setInterview]=useState<ApplicationInterview>(emptyInterview);
  const [agentBusy,setAgentBusy]=useState(false);
  const {locale,setLocale,translateSource:t} = useI18n();
  const restoreProgress = useCallback((draft:ApplicationProgressPayload) => {
    setForm({...initial,...draft.fields});setDocuments(draft.documents);setStep(draft.step);setEntryMode(draft.entry_mode);setInterview(draft.assistant||emptyInterview());
    const next=new URLSearchParams(searchParams.toString());
    // An explicit new plan entry wins; ordinary resume restores the saved choice.
    if(!next.has("plan") && draft.plan)next.set("plan",SUBSCRIPTION_PLANS[draft.plan].key);
    if(!next.has("lang"))setLocale(draft.locale);
    if(next.toString()!==searchParams.toString())router.replace(`/business/apply?${next}`,{scroll:false});
  },[router,searchParams,setLocale]);
  const progress=useApplicationProgress(userId,{fields:form,documents,plan:selectedPlan,locale,step,entry_mode:entryMode,...(interview.answered.length||interview.turns.length||interview.failed_message?{assistant:interview}:{})},restoreProgress);


  useEffect(() => {
    void getSessionForScope("salon").then((session) => {
      if (!session?.user) { router.replace("/business/login"); return; }
      setUserId(session.user.id);
      setForm((current) => ({...current, business_email:current.business_email || session.user.email || "", phone:current.phone || String(session.user.user_metadata?.phone || "")}));
    }).catch(() => {
      // A temporary Auth provider failure is not a logout. Keep this form in
      // place so the next authenticated operation can recover the session.
    });
  }, [router]);

  function choosePlan(plan: SubscriptionPlan) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("plan", SUBSCRIPTION_PLANS[plan].key);
    router.replace(`/business/apply?${next.toString()}`, { scroll: false });
  }

  function captureAgentAnswer(key:InterviewKey,value:string,state:ApplicationInterview){
    if(key==='plan')choosePlan(value as SubscriptionPlan);
    else if(key==='operator_type')chooseOperator(value);
    else if(key!=='documents')update(key,value);
    setInterview(key==='operator_type'&&form.operator_type!==value?{...state,answered:state.answered.filter(k=>!['plan','stylist_count','location_count','years_in_operation'].includes(k))}:state);
  }
  function update(key: keyof typeof initial, value: string) { setForm((current) => ({...current,[key]:value})); }
  function chooseOperator(value:string){
    if(form.operator_type!==value)setInterview(current=>({...current,answered:current.answered.filter(k=>!['plan','stylist_count','location_count','years_in_operation'].includes(k))}));
    setForm(current=>({...current,operator_type:value,stylist_count:value==="solo"?"1":current.stylist_count}));
    if(selectedPlan && isSoloPlan(selectedPlan)!==(value==="solo")) {
      const next=new URLSearchParams(searchParams.toString());next.delete("plan");router.replace(`/business/apply?${next}`,{scroll:false});
    }
  }
  function advance(formElement:HTMLFormElement){
    if(!formElement.reportValidity())return;
    if(step===0&&!form.operator_type){setMessage(t("Choose how you work."));return;}
    if(step===5&&!selectedPlan){setMessage(t("Choose a plan for your business setup."));return;}
    setMessage("");setStep(value=>Math.min(APPLICATION_TOPICS.length-1,value+1));
  }

  async function uploadDocuments(files: FileList | null) {
    if (!files || !userId) return;
    const capacity = APPLICATION_DOCUMENT_MAXIMUM_COUNT - documents.length;
    if (capacity <= 0) {
      setMessage("You can upload up to five supporting documents.");
      return;
    }
    setUploadingDocs(true);
    setMessage("");
    const uploadedPaths: string[] = [];
    const failures: string[] = [];
    try {
      const session = await getValidSessionForScope("salon");
      if (!session) {
        setMessage("Your session has expired. Please sign in again.");
        return;
      }
      const selectedFiles = Array.from(files).slice(0, capacity);
      if (files.length > capacity) {
        failures.push("Only the first available document slots were uploaded.");
      }
      for (const file of selectedFiles) {
        if (
          !APPLICATION_DOCUMENT_MIME_TYPES.includes(
            file.type as (typeof APPLICATION_DOCUMENT_MIME_TYPES)[number],
          )
        ) {
          failures.push(`${file.name} must be a PDF, JPG, or PNG.`);
          continue;
        }
        if (file.size <= 0) {
          failures.push(`${file.name} is empty.`);
          continue;
        }
        if (file.size > APPLICATION_DOCUMENT_MAXIMUM_BYTES) {
          failures.push(`${file.name} is larger than 10 MB.`);
          continue;
        }
        let preparedPath = "";
        try {
          const descriptor = {
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          };
          const prepareResponse = await fetch(
            "/api/salon/application/documents/prepare",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(descriptor),
              cache: "no-store",
              credentials: "same-origin",
            },
          );
          const prepareBody = await readApiResponse(
            prepareResponse,
            "The supporting-document upload could not be prepared.",
          );
          const uploadId = String(prepareBody.upload_id || "");
          const bucket = String(prepareBody.bucket || "");
          const path = String(prepareBody.path || "");
          const token = String(prepareBody.token || "");
          if (
            !prepareResponse.ok ||
            !uploadId ||
            !bucket ||
            !path ||
            !token
          ) {
            throw new Error(
              String(
                prepareBody.error ||
                  "The supporting-document upload could not be prepared.",
              ),
            );
          }
          preparedPath = path;
          const transfer = await supabase.storage
            .from(bucket)
            .uploadToSignedUrl(path, token, file, {
              contentType: file.type,
              cacheControl: "3600",
            });
          if (transfer.error) {
            const status = Number(
              (transfer.error as unknown as { statusCode?: number })
                .statusCode || 500,
            );
            const report = await reportClientOperationalFailure({
              status,
              code: "SIGNED_APPLICATION_DOCUMENT_UPLOAD_FAILED",
              operation: `application-document-upload:${uploadId}`,
              provider: "supabase",
              authorization: `Bearer ${session.access_token}`,
              dedupeScope: `application-document:${uploadId}`,
            });
            throw new Error(report.message);
          }
          const finalizeResponse = await fetch(
            "/api/salon/application/documents/finalize",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...descriptor,
                upload_id: uploadId,
                path,
              }),
              cache: "no-store",
              credentials: "same-origin",
            },
          );
          const finalizeBody = await readApiResponse(
            finalizeResponse,
            "The supporting document uploaded, but could not be verified.",
          );
          if (!finalizeResponse.ok || finalizeBody.uploaded !== true) {
            throw new Error(
              String(
                finalizeBody.error ||
                  "The supporting document uploaded, but could not be verified.",
              ),
            );
          }
          uploadedPaths.push(String(finalizeBody.path || path));
        } catch (error) {
          if (preparedPath) {
            // Release the durable pending-upload quota immediately. Storage
            // removal remains the bounded cleanup job's responsibility, so a
            // second provider failure cannot hide the original upload error.
            try {
              await fetch("/api/salon/application/documents/abandon", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ path: preparedPath }),
                cache: "no-store",
                credentials: "same-origin",
              });
            } catch {
              // The scheduled cleanup still expires this upload safely.
            }
          }
          failures.push(
            error instanceof Error
              ? error.message
              : "A supporting document could not be uploaded.",
          );
        }
      }
      if (uploadedPaths.length) {
        setDocuments((current) => [...current, ...uploadedPaths]);
      }
      if (failures.length) setMessage(failures.join(" "));
    } finally {
      setUploadingDocs(false);
    }
  }

  async function removeDocument(path: string) {
    setMessage("");
    try {
      const session = await getValidSessionForScope("salon");
      if (!session) {
        setMessage("Your session has expired. Please sign in again.");
        return;
      }
      const response = await fetch(
        "/api/salon/application/documents/abandon",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path }),
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const body = await readApiResponse(
        response,
        "The supporting document could not be removed.",
      );
      if (!response.ok || body.abandoned !== true) {
        throw new Error(
          String(body.error || "The supporting document could not be removed."),
        );
      }
      setDocuments((rows) => rows.filter((item) => item !== path));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The supporting document could not be removed.",
      );
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(entryMode!=="form")return;
    if(step<APPLICATION_TOPICS.length-1){advance(event.currentTarget);return;}
    if(!progress.isSaved){setMessage(t("Wait for your application progress to save before submitting."));return;}
    try{validateApplicationDetails(form,selectedPlan);}catch(error){setMessage(error instanceof Error?error.message:t("Please review your application."));return;}
    if (!selectedPlan) { setMessage("Please choose a plan before submitting your application."); return; }
    if (!checks.every(Boolean)) { setMessage("Please accept all three confirmations."); return; }
    if (!parseBusinessSetup(applicationSetup(form))) { setMessage("Please choose your business setup before submitting your application."); return; }
    if (!userId) { setMessage("Your account is not ready. Please sign in again."); return; }
    if (!isValidEmail(form.business_email)) { setMessage("Please enter a valid email address (name@example.com)."); return; }
    if (!isValidUsPhone(form.phone)) { setMessage("Please enter a US phone number."); return; }
    if (!isValidUsZip(form.zip_code)) { setMessage("Please enter a valid ZIP code (12345 or 12345-6789)."); return; }
    setSaving(true); setMessage("");
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/salon/application", { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({...form,business_setup_type:applicationSetup(form),draft_revision:progress.revision,locale,selected_plan:selectedPlan,website:"",logo_url:null,photo_urls:[],document_urls:documents,consent_authorized:checks[0],consent_terms:checks[1],consent_photos:checks[2]}) });
      const body = await readApiResponse(response, "Unable to submit application");
      if (!response.ok) throw new Error(body.error || "Unable to submit application");
      router.push("/salon/application-submitted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit application");
    } finally { setSaving(false); }
  }

  if(!progress.ready)return <section className="rounded-2xl bg-white p-7"><h1 className="font-serif text-3xl">{t("Business Application")}</h1><p role={progress.error?"alert":"status"} className="mt-4">{progress.error?t(progress.error):t("Loading your saved application…")}</p>{progress.error?<button className="mt-4 rounded-lg border px-4 py-3" onClick={progress.reloadSaved}>{t("Try again")}</button>:null}</section>;
  const input=(key:keyof ApplicationFields,label:string,options:Partial<React.ComponentProps<typeof Input>>={})=><Input label={t(label)} value={form[key]} onChange={value=>update(key,value)} {...options}/>;
  return <form onSubmit={submit} className="rounded-[18px] border border-plum/10 bg-white/85 p-5 shadow-[0_20px_60px_rgba(13,17,20,.08)] sm:p-8">
    <div className="mb-6 flex items-center gap-4"><Building2 aria-hidden="true" className="text-magenta" size={32}/><div><h1 className="font-serif text-3xl text-plum">{t("Business Application")}</h1><p className="mt-2 text-sm">{t("Tell us about your business, one step at a time.")}</p></div></div>
    <div className="mb-4"><LanguageSelector/></div>
    <div className="mb-4 flex flex-wrap gap-3"><button type="button" disabled={agentBusy} aria-pressed={entryMode==='form'} onClick={()=>setEntryMode('form')} className="min-h-11 rounded-lg border px-4">{t('Fill out the form')}</button><button type="button" disabled={agentBusy} aria-pressed={entryMode==='conversation'} onClick={()=>setEntryMode('conversation')} className="min-h-11 rounded-lg border px-4">{t('Complete your application with your assistant')}</button></div>
    {entryMode==='form'?<><p className="text-xs font-semibold text-magenta">{step+1} / {APPLICATION_TOPICS.length}</p><h2 className="mb-5 mt-2 font-serif text-2xl" tabIndex={-1}>{t(APPLICATION_TOPICS[step])}</h2></>:null}
    <p role="status" className="mb-5 text-xs">{progress.status==="saving"?t("Saving progress…"):progress.status==="saved"?t("Progress saved. You can return on another device."):""}</p>
    {progress.error?<div role="alert" className="mb-5 rounded-lg border border-red-300 p-3"><p>{t(progress.error)}</p>{progress.status==="error"?<button type="button" disabled={progress.retrying} onClick={()=>void progress.retrySave()} className="mr-4 mt-2 underline">{t("Retry saving my edits")}</button>:null}<button type="button" onClick={progress.reloadSaved} className="mt-2 underline">{t("Discard these edits and load the saved draft")}</button></div>:null}
    {entryMode==='conversation'&&message?<p role="alert" className="mb-4 rounded-lg border p-3 text-sm">{t(message)}</p>:null}
    {entryMode==='conversation'?<ApplicationAgent fields={form} plan={selectedPlan} documents={documents} state={interview} revision={progress.revision} isSaved={progress.isSaved} uploading={uploadingDocs} onAnswer={captureAgentAnswer} onState={setInterview} onUpload={files=>void uploadDocuments(files)} onRemove={path=>void removeDocument(path)} onBusy={setAgentBusy} onReview={()=>{setEntryMode('form');setStep(6);}}/>:null}
    {entryMode==='form'?<>
    {step===0?<fieldset className="space-y-3"><legend className="sr-only">{t("How do you work?")}</legend>{[["solo","I work on my own"],["team","I run a business with a team"],["multi","I manage multiple locations"]].map(([value,label])=><label key={value} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4"><input type="radio" name="operator" value={value} checked={form.operator_type===value} onChange={()=>chooseOperator(value)} required/>{t(label)}</label>)}</fieldset>:null}
    {step===1?<div className="grid gap-4 sm:grid-cols-2">{input("owner_name","Your full name")}{input("business_name","Business Name")}{input("business_email","Business Email",{type:"email",pattern:EMAIL_PATTERN})}{input("phone","Phone Number",{type:"tel",pattern:US_PHONE_PATTERN,onChange:value=>update("phone",formatUsPhoneInput(value))})}{form.operator_type==="solo"?input("years_in_operation","Years of experience",{type:"number",min:0,max:150}):null}{form.operator_type!=="solo"?input("stylist_count","Number of professionals",{type:"number",min:1,max:500}):null}{form.operator_type==="multi"?input("location_count","Number of locations",{type:"number",min:2,max:500}):null}<label className="text-sm">{t("Type of Business")}<select className="mt-2 w-full rounded-lg border p-3" value={form.business_type} onChange={e=>update("business_type",e.target.value)}>{businessTypes.filter(name=>name!=="Other").map(name=><option key={name}>{name}</option>)}</select></label></div>:null}
    {step===2?<div className="space-y-5"><fieldset><legend className="mb-3 font-semibold">{t("Where do you work?")}</legend><div className="grid gap-2 sm:grid-cols-2">{[["storefront","Storefront"],["chair_suite","Rented chair or suite"],["home","Home studio"],["mobile","Mobile / at the client’s location"]].map(([value,label])=><label key={value} className="flex items-center gap-2 rounded-lg border p-3"><input type="radio" name="location" value={value} checked={form.location_type===value} onChange={()=>update("location_type",value)} required/>{t(label)}</label>)}</div></fieldset>{form.location_type==="chair_suite"?input("host_business_name","Host business name"):null}<p className="text-sm">{t("A verification address is required. A home address is private unless you choose to display it. A mobile verification address is never displayed.")}</p><div className="grid gap-4 sm:grid-cols-2">{input("street_address","Verification address")}{input("address_line2","Address Line 2",{required:false})}{input("city","City")}<label>{t("State")}<select className="mt-2 w-full rounded-lg border p-3" value={form.state} onChange={e=>update("state",e.target.value)}>{US_STATES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label>{input("zip_code","ZIP Code",{pattern:"\\d{5}(-\\d{4})?"})}</div>{form.location_type==="home"?<><label className="flex items-start gap-3"><input type="checkbox" checked={form.home_address_public==="true"} onChange={e=>update("home_address_public",String(e.target.checked))}/>{t("Show my home street address publicly")}</label>{form.home_address_public!=="true"?input("public_neighborhood","Public neighborhood"):null}</>:null}{form.location_type!=="mobile"?<label className="flex items-center gap-3"><input type="checkbox" checked={form.offers_mobile==="true"} onChange={e=>update("offers_mobile",String(e.target.checked))}/>{t("I also travel to clients")}</label>:null}{form.location_type==="mobile"||form.offers_mobile==="true"?<div className="grid gap-4 sm:grid-cols-2">{input("travel_radius_miles","Travel radius (miles)",{type:"number",min:1,max:100})}{input("travel_fee","Travel fee ($)",{type:"number",min:0,max:1000,integer:false})}</div>:null}</div>:null}
    {step===3?<div className="space-y-4">{input("services_offered","Services you offer")}{input("price_range","Usual price range")}{input("website_url","Business website",{type:"url",required:false})}{input("instagram_url","Instagram profile",{type:"url",required:false})}<label className="flex items-center gap-3"><input type="checkbox" checked={form.hours_later==="true"} onChange={e=>update("hours_later",String(e.target.checked))}/>{t("I will set my working hours later")}</label>{form.hours_later!=="true"?input("working_hours","Usual working hours"):null}</div>:null}
    {step===4?<div className="space-y-5">{input("business_license_number","Business license number",{required:false})}{input("cosmetology_license_number","Professional license number",{required:false})}<label className="block">{t("Do you currently have insurance?")}<select required className="mt-2 w-full rounded-lg border p-3" value={form.insurance} onChange={e=>update("insurance",e.target.value)}><option value="">{t("Choose an answer")}</option><option value="yes">{t("Yes")}</option><option value="no">{t("No")}</option></select></label><p className="text-xs">{t("You can apply without insurance. Licensing, insurance and location requirements are reviewed before approval.")}</p><section className="rounded-xl border border-dashed p-5"><div className="flex items-center gap-3"><FileUp aria-hidden="true"/><h3>{t("Licenses & supporting documents")}</h3></div><p className="mt-2 text-xs">{t("Private PDF, JPG, or PNG · up to 10 MB each")}</p><input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={event=>void uploadDocuments(event.target.files)} className="mt-4 block w-full text-sm"/>{uploadingDocs?<p role="status">{t("Uploading documents…")}</p>:null}<ul className="mt-3 space-y-2">{documents.map((path,index)=><li key={path} className="flex justify-between gap-3"><span>{t("Private document")} {index+1}</span><button type="button" onClick={()=>void removeDocument(path)} className="underline">{t("Remove")}</button></li>)}</ul></section>{form.operator_type==="solo"?<p className="rounded-lg bg-blush p-4 text-sm">{t("Independent professionals need an in-person verification visit before approval. Submitting this form does not mean a visit has taken place.")}</p>:null}</div>:null}
    {step===5?<section><p className="text-sm">{t("No payment at application. New-plan billing must be verified before activation.")}</p><Link href="/plans" target="_blank" className="mt-2 inline-block text-sm underline">{t("Compare plans")}</Link><div className="mt-5 grid gap-3 sm:grid-cols-2">{PLAN_ORDER.filter(name=>isSoloPlan(name)===(form.operator_type==="solo")).map(name=>{const plan=SUBSCRIPTION_PLANS[name];return <button key={name} type="button" aria-pressed={selectedPlan===name} onClick={()=>choosePlan(name)} className={`rounded-xl border p-4 text-left ${selectedPlan===name?"border-magenta bg-blush":"bg-white"}`}><span className="flex items-center justify-between font-serif text-xl">{name}{selectedPlan===name?<Check aria-hidden="true" size={18}/>:null}</span><span className="mt-2 block">${plan.monthlyPrice}/{t("month")}</span></button>;})}</div></section>:null}
    {step===6?<section className="space-y-5"><p>{t("Review your application before submitting. Nothing is published or charged by this step.")}</p><dl className="divide-y rounded-lg border px-4">{[["Business Name",form.business_name],["Your full name",form.owner_name],["Business Email",form.business_email],["Phone Number",form.phone],["Business setup",form.operator_type],["Location",form.location_type],["Verification address",[form.street_address,form.address_line2,form.city,form.state,form.zip_code].filter(Boolean).join(", ")],["Services you offer",form.services_offered],["Usual price range",form.price_range],["Your plan",selectedPlan||""]].map(([label,value])=><div key={label} className="py-3"><dt className="text-xs font-semibold">{t(label)}</dt><dd className="mt-1 break-words" translate="no">{value}</dd></div>)}</dl><p>{t("Supporting documents")}: {documents.length}</p><div className="space-y-3">{["I confirm the information is accurate and I’m authorized to represent this business.","I agree to the Terms of Service and Partner Agreement.","I confirm I have permission and rights for any photos I upload now or during setup."].map((label,index)=><label key={label} className="flex items-start gap-3 text-sm"><input required type="checkbox" checked={checks[index]} onChange={event=>setChecks(current=>current.map((value,i)=>i===index?event.target.checked:value))}/>{t(label)}</label>)}</div></section>:null}
    {message?<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm gc-text-danger">{t(message)}</p>:null}
    <div className="mt-7 flex gap-3">{step>0?<button type="button" onClick={()=>{setMessage("");setStep(value=>value-1);}} className="rounded-lg border px-5 py-3">{t("Back")}</button>:null}<button disabled={saving||uploadingDocs||step===6&&!progress.isSaved} className="min-h-12 flex-1 rounded-lg bg-magenta px-5 py-3 font-bold text-white gc-disabled-control">{saving?t("Submitting…"):step===6?t("Submit Application"):t("Continue")}</button></div><p className="mt-4 flex items-center justify-center gap-2 text-xs"><LockKeyhole size={13}/>{t("Your application is private and reviewed by our team.")}</p>
    </>:null}
  </form>;
}

function Input({label,value,onChange,required=true,type="text",pattern,title,placeholder,min,max,integer=true}:{label:string;value:string;onChange:(value:string)=>void;required?:boolean;type?:string;pattern?:string;title?:string;placeholder?:string;min?:number;max?:number;integer?:boolean}) {
  return <label className="block"><span className="mb-2 block text-xs font-bold">{label}{required?" *":""}</span>{type === "number" ? <NumericInput required={required} integer={integer} min={min} max={max} value={value} onValueChange={onChange} className="w-full rounded-[8px] border border-plum/15 bg-white px-3 py-3 text-sm"/> : <input required={required} type={type} pattern={pattern} title={title} placeholder={placeholder} value={value} onChange={(event)=>onChange(event.target.value)} className="w-full rounded-[8px] border border-plum/15 bg-white px-3 py-3 text-sm"/>}</label>;
}
