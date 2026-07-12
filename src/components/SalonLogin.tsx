"use client";

import { useState } from "react";
import Link from "next/link";
import { salonSupabase as supabase } from "@/lib/supabase";
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
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (data?.session) {
      try {
        let response = await fetch("/api/auth/destination", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
        let destination = await response.json() as { path?: string; role?: string };
        if(destination.role!=="salon_owner"&&data.user.user_metadata?.role==="salon_owner"){
          const bootstrap=await fetch("/api/salon/bootstrap",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({phone:data.user.user_metadata?.phone,selected_plan:data.user.user_metadata?.selected_plan})});
          if(bootstrap.ok){response=await fetch("/api/auth/destination",{method:"POST",headers:{Authorization:`Bearer ${data.session.access_token}`}});destination=await response.json() as {path?:string;role?:string};}
        }
        if (!response.ok || destination.role !== "salon_owner") {
          await supabase.auth.signOut({ scope: "local" });
          setErrorMsg(destination.role === "admin"
            ? "That is a platform-admin account. Use the separate Admin Login; your salon-owner session will remain independent."
            : "This account is not linked to a salon-owner profile.");
          return;
        }
        setInfoMsg(destination.path === "/salon/dashboard"
          ? "Signed in successfully. Redirecting to your dashboard..."
          : "Signed in successfully. Redirecting to finish your salon setup...");
        router.replace(destination.path || "/salon/onboarding");
        router.refresh();
        return;
      } catch (roleError) {
        console.error("Salon role verification failed", roleError);
        await supabase.auth.signOut({ scope: "local" });
        setErrorMsg("We could not verify this salon-owner account. Please try again.");
        return;
      }
    }

    setErrorMsg('Sign in succeeded, but no active session was returned. Please try again.');
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
        <Link className="text-sm text-ink/70 hover:text-plum" href="/salon/signup">Need an account?</Link>
      </div>
    </form>
  );
}
