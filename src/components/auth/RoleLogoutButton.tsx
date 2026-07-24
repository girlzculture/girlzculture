"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { type AuthScope, getSupabaseForScope } from "@/lib/supabase";
import { surfacePathForHost } from "@/lib/hostRouting";

const destinationFor: Record<AuthScope, string> = {
  customer: "/login",
  salon: "/salon/login",
  admin: "/admin/login",
};

export function RoleSessionBoundary({ scope }: { scope: AuthScope }) {
  useEffect(() => {
    let active = true;
    let lastActivity = Date.now();
    const sessionStartedKey = "girlz-culture-admin-session-started";
    const idleMinutes = Math.max(
      5,
      Number(process.env.NEXT_PUBLIC_ADMIN_IDLE_TIMEOUT_MINUTES || 30),
    );
    const absoluteHours = Math.max(
      1,
      Number(process.env.NEXT_PUBLIC_ADMIN_ABSOLUTE_SESSION_HOURS || 8),
    );
    if (scope === "admin" && !sessionStorage.getItem(sessionStartedKey))
      sessionStorage.setItem(sessionStartedKey, String(Date.now()));
    const loginDestination = () =>
      scope === "admin" || scope === "salon"
        ? surfacePathForHost(
            scope,
            destinationFor[scope],
            window.location.hostname,
          )
        : destinationFor[scope];
    const expireAdminSession = async () => {
      await getSupabaseForScope("admin").auth.signOut({ scope: "local" });
      sessionStorage.setItem("girlz-culture-signed-out:admin", String(Date.now()));
      sessionStorage.removeItem(sessionStartedKey);
      window.location.replace(loginDestination());
    };
    const verify = async () => {
      const { data, error } = await getSupabaseForScope(scope).auth.getSession();
      // A provider/network failure is not proof that the user signed out.
      // Redirect only when Supabase completed the check without an error.
      if (active && !error && !data.session)
        window.location.replace(loginDestination());
    };
    const activity = () => {
      lastActivity = Date.now();
    };
    const timeout = window.setInterval(() => {
      if (scope !== "admin") return;
      const now = Date.now();
      const started = Number(sessionStorage.getItem(sessionStartedKey) || now);
      if (
        now - lastActivity >= idleMinutes * 60_000 ||
        now - started >= absoluteHours * 60 * 60_000
      )
        void expireAdminSession();
    }, 30_000);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted || sessionStorage.getItem(`girlz-culture-signed-out:${scope}`)) void verify();
    };
    window.addEventListener("pageshow", onPageShow);
    for (const event of ["pointerdown", "keydown", "scroll"])
      window.addEventListener(event, activity, { passive: true });
    return () => {
      active = false;
      window.clearInterval(timeout);
      window.removeEventListener("pageshow", onPageShow);
      for (const event of ["pointerdown", "keydown", "scroll"])
        window.removeEventListener(event, activity);
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
      if (scope === "admin")
        sessionStorage.removeItem("girlz-culture-admin-session-started");
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
