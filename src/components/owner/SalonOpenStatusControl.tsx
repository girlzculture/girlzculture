"use client";

import { useState } from "react";
import { Clock3, Store } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { isSalonClosedToday } from "@/lib/salonOpenStatus";

export default function SalonOpenStatusControl({ salon }: { salon: Record<string, unknown> }) {
  const [closed, setClosed] = useState(() => isSalonClosedToday(salon));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    if (
      next &&
      !window.confirm(
        "Mark the salon full today? New appointments for today will be blocked, but existing bookings will not be cancelled.",
      )
    ) return;
    setBusy(true);
    setMessage("");
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Your salon session expired.");
      const response = await fetch("/api/salon/open-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ closed: next }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setClosed(next);
      setMessage(
        next
          ? "New bookings for today are blocked. This expires automatically at midnight in the salon time zone."
          : "Bookings resumed immediately and today follows your normal published hours again.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update status.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border p-4 ${closed ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
      <div className="flex items-center gap-3">
        {closed ? <Clock3 className="gc-text-danger"/> : <Store className="gc-text-success"/>}
        <div>
          <p className="font-semibold text-plum">{closed ? "Full today · bookings blocked" : "Open according to normal hours"}</p>
          <p className="text-sm text-ink/70">
            {closed
              ? "Current override expires automatically at salon-local midnight."
              : "No same-day salon-wide override is active."}
          </p>
          {message ? <p role="status" className="mt-1 text-sm font-medium text-plum">{message}</p> : null}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void change(!closed)}
        className={`min-h-11 rounded-lg px-5 text-sm font-bold text-white gc-disabled-control ${closed ? "bg-emerald-700" : "bg-red-700"}`}
      >
        {busy ? "Updating…" : closed ? "Reopen Today" : "Mark Full Today"}
      </button>
    </section>
  );
}
