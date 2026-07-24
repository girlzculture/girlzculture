"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Eye, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { adminSupabase } from "@/lib/supabase";
import { EMAIL_PATTERN, isValidEmail, normalizeEmail } from "@/lib/validation";
import { startSecureLogin, verifySecureLogin, type LoginChallenge, type LoginSession } from "@/lib/secureLoginClient";
import MfaCodeField from "@/components/auth/MfaCodeField";
import { surfacePathForHost } from "@/lib/hostRouting";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function finish(session: LoginSession) {
    const { error } = await adminSupabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
    sessionStorage.removeItem("girlz-culture-signed-out:admin");
    sessionStorage.setItem("girlz-culture-admin-session-started", String(Date.now()));
    window.location.replace(
      surfacePathForHost("admin", "/admin", window.location.hostname),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (!isValidEmail(email)) { setMessage("Please enter a valid email address (name@example.com)."); return; }
    setLoading(true);
    try {
      const validEmail = normalizeEmail(email);
      if (challenge) await finish(await verifySecureLogin("admin", validEmail, password, challenge, code));
      else {
        const result = await startSecureLogin("admin", validEmail, password);
        if (result.challenge) setChallenge(result.challenge);
        else if (result.session) await finish(result.session);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sign in."); }
    finally { setLoading(false); }
  }

  return <form onSubmit={submit} className="space-y-5">
    {challenge ? <MfaCodeField challenge={challenge} code={code} setCode={setCode} reset={() => { setChallenge(null); setCode(""); setPassword(""); }} /> : <>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Email</span><span className="flex items-center gap-3 rounded-[9px] border border-plum/15 px-4 py-3"><Mail size={18}/><input required type="email" pattern={EMAIL_PATTERN} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@girlzculture.com" className="w-full bg-transparent outline-none"/></span></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold">Password</span><span className="flex items-center gap-3 rounded-[9px] border border-plum/15 px-4 py-3"><LockKeyhole size={18}/><input required type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full bg-transparent outline-none"/><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}><Eye size={18}/></button></span></label>
      <Link href="/forgot-password" className="block text-right text-sm font-semibold text-magenta">Forgot password?</Link>
    </>}
    {message ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
    <button disabled={loading || Boolean(challenge && code.length !== 6)} className="w-full rounded-[9px] bg-magenta py-3.5 font-bold text-white disabled:opacity-60">{loading ? "Verifying..." : challenge ? "Verify and open Admin" : "Continue securely"}</button>
    <p className="flex items-center justify-center gap-2 text-sm text-ink/60"><ShieldCheck size={15}/>Admin 2FA is required on every new sign-in.</p>
  </form>;
}
