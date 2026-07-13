"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, FileUp, LockKeyhole } from "lucide-react";
import { salonSupabase as supabase } from "@/lib/supabase";
import { normalizePlan, PLAN_ORDER, SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/plans";
import BaseImageUpload from "@/components/ImageUpload";
import { EMAIL_PATTERN, formatUsPhoneInput, isValidEmail, isValidUsPhone, US_PHONE_PATTERN } from "@/lib/validation";

const states = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming","District of Columbia"];
const initial = { business_name:"", owner_name:"", business_email:"", phone:"", street_address:"", city:"", state:"New York", zip_code:"", neighborhood:"", business_type:"Braiding Studio", referral_source:"" };
const ImageUpload = (props: React.ComponentProps<typeof BaseImageUpload>) => <BaseImageUpload {...props} authScope="salon" />;

export default function SalonApplication() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form,setForm] = useState(initial);
  const [selectedPlan,setSelectedPlan] = useState<SubscriptionPlan>(() => normalizePlan(searchParams.get("plan") || "Growth"));
  const [userId,setUserId] = useState("");
  const [checks,setChecks] = useState([false,false,false]);
  const [message,setMessage] = useState("");
  const [saving,setSaving] = useState(false);
  const [logo,setLogo] = useState<string|null>(null);
  const [photos,setPhotos] = useState<string[]>([]);
  const [documents,setDocuments] = useState<string[]>([]);
  const [uploadingDocs,setUploadingDocs] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({data}) => {
      if (!data.user) { router.replace("/salon/login"); return; }
      setUserId(data.user.id);
      setForm((current) => ({...current, business_email:data.user?.email || "", phone:String(data.user?.user_metadata?.phone || "")}));
      const {data:salon}=await supabase.from("salons").select("subscription_tier").eq("user_id",data.user.id).maybeSingle();
      if(salon?.subscription_tier)setSelectedPlan(normalizePlan(salon.subscription_tier));
    });
  }, [router]);

  function update(key: keyof typeof initial, value: string) { setForm((current) => ({...current,[key]:value})); }

  async function uploadDocuments(files: FileList | null) {
    if (!files || !userId) return;
    setUploadingDocs(true); setMessage("");
    const urls:string[] = [];
    for (const file of Array.from(files).slice(0,5)) {
      if (!["application/pdf","image/jpeg","image/png"].includes(file.type)) { setMessage(`${file.name} must be a PDF, JPG, or PNG.`); continue; }
      if (file.size > 10*1024*1024) { setMessage(`${file.name} is larger than 10 MB.`); continue; }
      const path = `${userId}/documents/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;
      const {error} = await supabase.storage.from("application-documents").upload(path,file,{contentType:file.type,upsert:false});
      if (error) { setMessage(error.message); continue; }
      urls.push(path);
    }
    setDocuments((current) => [...current,...urls]); setUploadingDocs(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checks.every(Boolean)) { setMessage("Please accept all three confirmations."); return; }
    if (!userId) { setMessage("Your account is not ready. Please sign in again."); return; }
    if (!isValidEmail(form.business_email)) { setMessage("Please enter a valid email address (name@example.com)."); return; }
    if (!isValidUsPhone(form.phone)) { setMessage("Please enter a US phone number."); return; }
    setSaving(true); setMessage("");
    try {
      const {data:{session}} = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/salon/application", { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({...form,selected_plan:selectedPlan,website:"",logo_url:logo,photo_urls:photos,document_urls:documents,consent_authorized:checks[0],consent_terms:checks[1],consent_photos:checks[2]}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to submit application");
      router.push("/salon/application-submitted");
    } catch (error) {
      console.error("Salon application submit error",error);
      setMessage(error instanceof Error ? error.message : "Unable to submit application");
    } finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="rounded-[18px] border border-plum/10 bg-white/85 p-5 shadow-[0_20px_60px_rgba(26,18,32,.08)] sm:p-8">
    <div className="mb-7 flex items-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-[15px] bg-blush text-magenta"><Building2 size={34}/></span><div><h1 className="font-serif text-4xl font-semibold text-plum">Salon Application</h1><p className="mt-1 text-sm text-ink/65">Tell us about your business so we can help you grow with Girlz Culture.</p></div></div>

    <section className="mb-7"><div className="flex items-end justify-between gap-3"><div><h2 className="font-serif text-2xl text-plum">Choose your plan</h2><p className="mt-1 text-xs text-ink/55">No payment today. Billing begins only after approval and activation.</p></div><Link href="/plans" target="_blank" className="text-xs font-bold text-magenta">Compare plans</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{PLAN_ORDER.map((name) => { const plan=SUBSCRIPTION_PLANS[name]; const active=selectedPlan===name; return <button key={name} type="button" onClick={()=>setSelectedPlan(name)} className={`rounded-[13px] border p-4 text-left ${active?"border-magenta bg-blush/30 ring-2 ring-magenta/10":"border-plum/10 bg-white"}`}><span className="flex items-center justify-between"><b className="font-serif text-xl text-plum">{name}</b>{active?<Check size={18} className="text-magenta"/>:null}</span><span className="mt-1 block text-sm font-bold">${plan.monthlyPrice.toFixed(2)}/mo</span><span className="mt-2 block text-[10px] leading-4 text-ink/55">{plan.description}</span></button>; })}</div></section>

    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="Business / Salon Name" value={form.business_name} onChange={(value)=>update("business_name",value)} />
      <Input label="Owner / Contact Full Name" value={form.owner_name} onChange={(value)=>update("owner_name",value)} />
      <Input label="Business Email" type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" value={form.business_email} onChange={(value)=>update("business_email",value)} />
      <Input label="Phone Number" type="tel" pattern={US_PHONE_PATTERN} title="Please enter a US phone number" value={form.phone} onChange={(value)=>update("phone",formatUsPhoneInput(value))} placeholder="+1 (555) 123-4567" />
      <div className="sm:col-span-2"><Input label="Street Address" value={form.street_address} onChange={(value)=>update("street_address",value)} /></div>
      <Input label="City" value={form.city} onChange={(value)=>update("city",value)} />
      <label><span className="mb-2 block text-xs font-bold">State *</span><select required value={form.state} onChange={(event)=>update("state",event.target.value)} className="w-full rounded-[8px] border border-plum/15 bg-white px-3 py-3 text-sm">{states.map((state)=><option key={state}>{state}</option>)}</select></label>
      <Input label="Zip Code" value={form.zip_code} onChange={(value)=>update("zip_code",value)} />
      <Input label="Neighborhood" value={form.neighborhood} onChange={(value)=>update("neighborhood",value)} required={false} />
      <label><span className="mb-2 block text-xs font-bold">Type of Business *</span><select value={form.business_type} onChange={(event)=>update("business_type",event.target.value)} className="w-full rounded-[8px] border border-plum/15 bg-white px-3 py-3 text-sm">{["Hair Salon","Beauty Shop","Barber Shop","Braiding Studio","Other"].map((item)=><option key={item}>{item}</option>)}</select></label>
      <div className="sm:col-span-2"><Input label="How did you hear about us?" value={form.referral_source} onChange={(value)=>update("referral_source",value)} required={false} /></div>
    </div>

    <section className="mt-7 grid gap-5 lg:grid-cols-2"><ImageUpload bucket="application-media" value={logo} onChange={(value)=>setLogo(typeof value==="string"?value:null)} label="Salon logo" helperText="Upload your logo or primary business mark." folder={`${userId}/logo`}/><ImageUpload bucket="application-media" value={photos} onChange={(value)=>setPhotos(Array.isArray(value)?value:[])} label="Salon photos" helperText="Show your work, team, or salon space." folder={`${userId}/photos`} multiple maxFiles={8}/></section>
    <section className="mt-6 rounded-[14px] border border-dashed border-plum/25 bg-blush/20 p-5"><div className="flex items-center gap-3"><FileUp className="text-magenta"/><div><h2 className="font-semibold text-plum">Licenses & supporting documents</h2><p className="text-xs text-ink/55">Private PDF, JPG, or PNG · up to 10 MB each</p></div></div><input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={(event)=>void uploadDocuments(event.target.files)} className="mt-4 block w-full text-sm"/>{uploadingDocs?<p className="mt-2 text-xs text-magenta">Uploading documents…</p>:null}<ul className="mt-3 space-y-1 text-xs">{documents.map((path,index)=><li key={path} className="flex justify-between"><span className="text-plum">Private document {index+1} uploaded</span><button type="button" onClick={()=>setDocuments((rows)=>rows.filter((item)=>item!==path))}>Remove</button></li>)}</ul></section>
    <div className="mt-6 space-y-3">{["I confirm the information is accurate and I’m authorized to represent this business.","I agree to the Terms of Service and Partner Agreement.","I confirm I have permission and rights for any photos I upload."].map((label,index)=><label key={label} className="flex gap-3 text-sm"><input type="checkbox" checked={checks[index]} onChange={(event)=>setChecks((current)=>current.map((value,itemIndex)=>itemIndex===index?event.target.checked:value))} className="accent-magenta"/>{label}</label>)}</div>
    {message?<p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>:null}
    <button disabled={saving} className="mt-6 w-full rounded-[8px] bg-magenta py-3.5 font-bold text-white disabled:opacity-60">{saving?"Submitting…":"Submit Application"}</button><p className="mt-4 flex items-center justify-center gap-2 text-[11px] text-ink/50"><LockKeyhole size={13}/>Your information is secure and will never be shared.</p>
  </form>;
}

function Input({label,value,onChange,required=true,type="text",pattern,title,placeholder}:{label:string;value:string;onChange:(value:string)=>void;required?:boolean;type?:string;pattern?:string;title?:string;placeholder?:string}) {
  return <label className="block"><span className="mb-2 block text-xs font-bold">{label}{required?" *":""}</span><input required={required} type={type} pattern={pattern} title={title} placeholder={placeholder} inputMode={type==="tel"?"tel":undefined} value={value} onChange={(event)=>onChange(event.target.value)} className="w-full rounded-[8px] border border-plum/15 bg-white px-3 py-3 text-sm"/></label>;
}
