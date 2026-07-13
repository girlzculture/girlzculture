"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, LockKeyhole, Mail, ShieldCheck, Star, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EMAIL_PATTERN, isValidEmail, normalizeEmail } from "@/lib/validation";

export default function CustomerAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!isValidEmail(email)) { setMessage("Please enter a valid email address (name@example.com)."); return; }
    const validEmail = normalizeEmail(email);
    setLoading(true);
    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({ email: validEmail, password });
      if (error) { setMessage(error.message); setLoading(false); return; }
      const response = await fetch("/api/auth/destination", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const result = await response.json();
      router.push(result.path || "/account"); router.refresh(); return;
    }
    const { data, error } = await supabase.auth.signUp({ email: validEmail, password, options: { data: { role: "customer", name } } });
    if (error) { setMessage(error.message); setLoading(false); return; }
    if (data.user && data.session) await supabase.from("customers").upsert({ id: data.user.id, name, email: validEmail, status: "Active" });
    setLoading(false);
    if (data.session) { router.push("/account"); router.refresh(); }
    else setMessage("Account created. Check your email to confirm it, then log in.");
  }

  return <div><div className="grid grid-cols-2 border-b border-plum/10"><button type="button" onClick={() => setMode("login")} className={`py-4 font-semibold ${mode === "login" ? "border-b-3 border-plum text-plum" : ""}`}>Log in</button><button type="button" onClick={() => setMode("signup")} className={`py-4 font-semibold ${mode === "signup" ? "border-b-3 border-plum text-plum" : ""}`}>Sign up</button></div><form onSubmit={submit} className="space-y-5 p-6 sm:p-8"><h2 className="font-serif text-3xl font-semibold text-plum">{mode === "login" ? "Welcome back" : "Create your account"}</h2><p className="text-sm text-ink/65">{mode === "login" ? "Log in to your account to continue" : "Save salons, manage bookings, and leave verified reviews."}</p>{mode === "signup" ? <Field label="Full name" icon={UserRound}><input required value={name} onChange={event => setName(event.target.value)} className="w-full bg-transparent outline-none" placeholder="Your name" /></Field> : null}<Field label="Email" icon={Mail}><input required type="email" pattern={EMAIL_PATTERN} title="Enter a valid email address such as name@example.com" value={email} onChange={event => setEmail(event.target.value)} className="w-full bg-transparent outline-none" placeholder="name@example.com" /></Field><Field label="Password" icon={LockKeyhole}><input required minLength={8} type={show ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} className="w-full bg-transparent outline-none" placeholder="Enter your password" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}><Eye size={18} /></button></Field>{mode === "login" ? <Link href="/forgot-password" className="block text-right text-sm font-semibold text-magenta">Forgot password?</Link> : null}{message ? <p className="rounded-lg bg-blush/55 p-3 text-sm text-plum">{message}</p> : null}<button disabled={loading} className="w-full rounded-[9px] bg-magenta py-3.5 font-bold text-white">{loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}</button><div className="flex items-center gap-3 text-xs text-ink/45"><span className="h-px flex-1 bg-plum/10" />or<span className="h-px flex-1 bg-plum/10" /></div><Link href="/salons" className="flex w-full items-center justify-center gap-2 rounded-[9px] border border-plum/30 py-3 text-sm font-semibold text-plum"><UserRound size={18} />Continue as guest</Link><div className="grid grid-cols-3 gap-2 border-t border-plum/10 pt-5 text-center text-[9px] text-ink/60">{[[ShieldCheck, "Verified Pros"], [LockKeyhole, "Secure & Private"], [Star, "Account protected"]].map(([Icon, label]) => <span key={label as string}><Icon className="mx-auto mb-1 text-amber" size={20} />{label as string}</span>)}</div></form></div>;
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Mail; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><span className="flex items-center gap-3 rounded-[9px] border border-plum/15 px-4 py-3"><Icon size={18} className="text-ink/50" />{children}</span></label>;
}
