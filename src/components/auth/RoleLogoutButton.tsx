"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import {
  type AuthScope,
  getSessionForScope,
  getSupabaseForScope,
} from "@/lib/supabase";
import { surfacePathForHost } from "@/lib/hostRouting";

const destinationFor: Record<AuthScope, string> = {
  customer: "/login",
  salon: "/salon/login",
  admin: "/admin/login",
};

export function RoleSessionBoundary({ scope }: { scope: AuthScope }) {
  useEffect(() => {
    let active = true;
    const loginDestination = () =>
      scope === "admin" || scope === "salon"
        ? surfacePathForHost(
            scope,
            destinationFor[scope],
            window.location.hostname,
          )
        : destinationFor[scope];
    const verify = async () => {
      try {
        const session = await getSessionForScope(scope);
        if (active && !session) window.location.replace(loginDestination());
      } catch {
        // A provider/network failure is not proof that the user signed out.
        // Preserve the scoped session and let the next verification retry.
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || sessionStorage.getItem(`girlz-culture-signed-out:${scope}`)) void verify();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
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
      const destination =
        scope === "admin" || scope === "salon"
          ? surfacePathForHost(
              scope,
              destinationFor[scope],
              window.location.hostname,
            )
          : destinationFor[scope];
      window.location.replace(destination);
    }
  }

  return <button type="button" onClick={logOut} disabled={busy} className={className} aria-label={`Log out of ${scope} account`}>
    <LogOut size={18} aria-hidden="true" />
    {compact ? null : busy ? "Logging out..." : "Log out"}
  </button>;
}
