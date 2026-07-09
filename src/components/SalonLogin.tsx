"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SalonLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const onLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    console.log('Supabase login result:', { data, error });
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data?.session) {
      setInfoMsg('Signed in successfully. Redirecting...');
    }
    router.push('/salon/onboarding');
  };

  return (
    <form onSubmit={onLogin} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-ink/80">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-md border border-ink/10 bg-white px-3 py-2" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-ink/80">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded-md border border-ink/10 bg-white px-3 py-2" />
      </div>

      {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}
      {infoMsg ? <div className="text-sm text-emerald-700">{infoMsg}</div> : null}

      <div className="flex items-center justify-between">
        <button type="submit" disabled={loading} className="rounded-full bg-magenta px-4 py-2 text-sm font-semibold text-white">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <a className="text-sm text-ink/70 hover:text-plum" href="/salon/signup">Need an account?</a>
      </div>
    </form>
  );
}
