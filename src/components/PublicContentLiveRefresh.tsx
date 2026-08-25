"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const FALLBACK_REFRESH_MS = 90_000;

export default function PublicContentLiveRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const refreshTimer = useRef<number | null>(null);
  const lastVersion = useRef(new Map<string, number>());

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/salon/dashboard")) return;
    let stopped = false;
    const scheduleRefresh = () => {
      if (stopped || refreshTimer.current !== null) return;
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        if (!stopped) router.refresh();
      }, 250);
    };
    const channel = supabase
      .channel(`public-content-live-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_change_events",
        },
        (payload) => {
          const row = (payload.new || {}) as {
            scope?: string;
            version?: number;
          };
          const scope = String(row.scope || "public");
          const version = Number(row.version || 0);
          if (version && lastVersion.current.get(scope) === version) return;
          if (version) lastVersion.current.set(scope, version);
          scheduleRefresh();
        },
      )
      .subscribe();

    const fallback = window.setInterval(() => {
      if (!document.hidden) router.refresh();
    }, FALLBACK_REFRESH_MS);

    return () => {
      stopped = true;
      if (refreshTimer.current !== null)
        window.clearTimeout(refreshTimer.current);
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [pathname, router]);

  return null;
}
