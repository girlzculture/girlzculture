"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { salonSupabase } from "@/lib/supabase";
import { EMAIL_PATTERN, isValidEmail, normalizeEmail } from "@/lib/validation";
import { startSecureLogin, verifySecureLogin, type LoginChallenge, type LoginSession } from "@/lib/secureLoginClient";
import MfaCodeField from "@/components/auth/MfaCodeField";

export default function SalonLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function finish(session: LoginSession) {
    const { error } = await salonSupabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
    sessionStorage.removeItem("girlz-culture-signed-out:salon");
    const destination = await fetch("/api/auth/destination", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
    const result = await destination.json() as { path?: string; role?: string };
    if (!destination.ok || result.role !== "salon_owner") throw new Error("This account is not linked to an active salon profile.");
    window.location.replace(result.path || "/salon/dashboard");
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setErrorMsg("");
    if (!isValidEmail(email)) { setErrorMsg("Please enter a valid email address (name@example.com)."); return; }
    setLoading(true);
    try {
      const validEmail = normalizeEmail(email);
      if (challenge) await finish(await verifySecureLogin("salon", validEmail, password, challenge, code));
      else {
        const result = await startSecureLogin("salon", validEmail, password);
        if (result.challenge) setChallenge(result.challenge);
        else if (result.session) await finish(result.session);
      }
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : "Unable to sign in."); }
    finally { setLoading(false); }
  }

  return <form onSubmit={submit} className="space-y-4">
    {challenge ? <MfaCodeField challenge={challenge} code={code} setCode={setCode} reset={() => { setChallenge(null); setCode(""); setPassword(""); }} /> : <>
      <label className="block text-sm font-semibold">Email<input type="email" pattern={EMAIL_PATTERN} value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-3" /></label>
      <label className="block text-sm font-semibold">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-3" /></label>
      <Link className="block text-right text-sm font-semibold text-magenta" href="/forgot-password">Forgot password?</Link>
    </>}
    {errorMsg ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p> : null}
    <button type="submit" disabled={loading || Boolean(challenge && code.length !== 6)} className="w-full rounded-[9px] bg-magenta px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Verifying..." : challenge ? "Verify and open dashboard" : "Continue securely"}</button>
    {!challenge ? <p className="text-sm text-ink/65">Salon accounts use SMS two-factor verification. If SMS delivery is unavailable, the code is sent to the account email.</p> : null}
    <Link className="block text-center text-sm text-ink/70 hover:text-plum" href="/salon/signup">Need an account?</Link>
  </form>;
}
