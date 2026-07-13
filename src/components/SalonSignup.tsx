"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, LockKeyhole, Mail, Phone, ShieldCheck, Sparkles, Star } from "lucide-react";
import { salonSupabase as supabase } from "@/lib/supabase";
import { normalizePlan } from "@/lib/plans";
import { EMAIL_PATTERN, formatUsPhoneInput, isValidEmail, isValidUsPhone, normalizeEmail, normalizeUsPhone, US_PHONE_PATTERN } from "@/lib/validation";

export default function SalonSignup() {
  const router=useRouter(); const searchParams=useSearchParams(); const selectedPlan=normalizePlan(searchParams.get("plan")||"Growth"); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [phone,setPhone]=useState(""); const [show,setShow]=useState(false); const [loading,setLoading]=useState(false); const [message,setMessage]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setMessage("");if(!isValidEmail(email)){setMessage("Please enter a valid email address (name@example.com).");return;}if(!isValidUsPhone(phone)){setMessage("Please enter a US phone number.");return;}const validEmail=normalizeEmail(email),validPhone=normalizeUsPhone(phone);setLoading(true);const {data,error}=await supabase.auth.signUp({email:validEmail,password,options:{data:{role:"salon_owner",phone:validPhone,selected_plan:selectedPlan}}});if(error){setMessage(error.message);setLoading(false);return;}if(data.user&&data.session){const response=await fetch("/api/salon/bootstrap",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({phone:validPhone,selected_plan:selectedPlan})});if(!response.ok){const body=await response.json();setMessage(body.error||"Account created, but the application could not be started.");setLoading(false);return;}}setLoading(false);if(data.session){router.push(`/salon/apply?plan=${selectedPlan.toLowerCase()}`);router.refresh();}else setMessage("Account created. Confirm your email, then log in to complete your salon application.");}
  return <form onSubmit={submit} className="space-y-5">
    <Field label="Email" icon={Mail}><input type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" className="w-full bg-transparent outline-none"/></Field>
    <Field label="Password" icon={LockKeyhole}><input type={show?"text":"password"} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a strong password" className="w-full bg-transparent outline-none"/><button type="button" onClick={()=>setShow(!show)} aria-label="Show password"><Eye size={18}/></button></Field>
    <Field label="Phone Number" icon={Phone}><input type="tel" required inputMode="tel" pattern={US_PHONE_PATTERN} title="Please enter a US phone number" value={phone} onChange={e=>setPhone(formatUsPhoneInput(e.target.value))} placeholder="+1 (555) 123-4567" className="w-full bg-transparent outline-none"/></Field>
    {message?<p className="rounded-xl bg-blush/50 p-3 text-sm text-plum">{message}</p>:null}
    <button disabled={loading} className="w-full rounded-[9px] bg-magenta py-4 font-bold text-white">{loading?"Creating account…":"Join Now"}</button>
    <div className="rounded-[12px] bg-blush/45 p-4 text-sm text-plum">After you sign up, you’ll complete a short application to list your salon.</div>
    <p className="text-center text-sm">Already have an account? <Link href="/salon/login" className="font-semibold text-magenta">Log in</Link></p>
    <div className="grid grid-cols-3 gap-3 border-t border-plum/10 pt-5 text-center text-[10px] text-ink/70">{[[ShieldCheck,"Secure & Private"],[Sparkles,"Quality Community"],[Star,"Built for Stylists"]].map(([Icon,label])=><div key={label as string}><Icon className="mx-auto mb-2 text-amber" size={23}/>{label as string}</div>)}</div>
  </form>;
}
function Field({label,icon:Icon,children}:{label:string;icon:typeof Mail;children:React.ReactNode}){return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><span className="flex items-center gap-3 rounded-[9px] border border-plum/15 bg-white px-4 py-3.5"><Icon size={19} className="text-ink/55"/>{children}</span></label>}
