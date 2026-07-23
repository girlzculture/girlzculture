"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { type AuthScope, getSupabaseForScope } from "@/lib/supabase";

const destinationFor: Record<AuthScope, string> = {
  customer: "/login",
  salon: "/salon/login",
  admin: "/admin/login",
};

export function RoleSessionBoundary({ scope }: { scope: AuthScope }) {
  useEffect(() => {
    let active = true;
    const verify = async () => {
      const { data, error } = await getSupabaseForScope(scope).auth.getSession();
      // A provider/network failure is not proof that the user signed out.
      // Redirect only when Supabase completed the check without an error.
      if (active && !error && !data.session)
        window.location.replace(destinationFor[scope]);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || sessionStorage.getItem(`girlz-culture-signed-out:${scope}`)) void verify();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => { active = false; window.removeEventListener("pageshow", onPageShow); };
  }, [scope]);
  return null;
}

export default function RoleLogoutButton({ scope, className = "", compact = false }: { scope: AuthScope; className?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function logOut() {
    if (busy) return;
    setBusy(true);
    try {
      // Local scope is intentional: ending one role never destroys another
      // role's independent browser session.
      await getSupabaseForScope(scope).auth.signOut({ scope: "local" });
    } catch (error) {
      void error;
    } finally {
      sessionStorage.setItem(`girlz-culture-signed-out:${scope}`, String(Date.now()));
      window.location.replace(destinationFor[scope]);
    }
  }

  return <button type="button" onClick={logOut} disabled={busy} className={className} aria-label={`Log out of ${scope} account`}>
    <LogOut size={18} aria-hidden="true" />
    {compact ? null : busy ? "Logging out..." : "Log out"}
  </button>;
}
