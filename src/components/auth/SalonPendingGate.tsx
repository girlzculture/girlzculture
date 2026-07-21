"use client";

import { useEffect, useState } from "react";
import { getSessionForScope } from "@/lib/supabase";

export default function SalonPendingGate({ redirect = true }: { redirect?: boolean }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const session = await getSessionForScope("salon");
        if (!session) return;
        const response = await fetch("/api/auth/destination", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json() as { path?: string; salon_status?: string };
        if (!response.ok) throw new Error("Unable to verify application status.");
        if (redirect && result.path && result.path !== "/pending") window.location.replace(result.path);
        else setMessage(result.salon_status === "Pending" ? "Application review is still in progress." : "Your application status changed. Redirecting…");
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to verify application status.");
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [redirect]);
  return message ? <p role="status" className="mx-auto mt-4 max-w-lg rounded-lg bg-blush/50 p-3 text-center text-xs text-plum">{message}</p> : null;
}
