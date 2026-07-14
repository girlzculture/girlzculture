"use client";

import { useState } from "react";
import { Clock3, Store } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import { isSalonClosedToday } from "@/lib/salonOpenStatus";

export default function SalonOpenStatusControl({ salon }: { salon: Record<string, unknown> }) {
  const [closed, setClosed] = useState(() => isSalonClosedToday(salon)); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function change(next: boolean) { setBusy(true); setMessage(""); try { const session = await getSessionForScope("salon"); if (!session) throw new Error("Your salon session expired."); const response = await fetch("/api/salon/open-status", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ closed: next }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setClosed(next); setMessage(next ? "Your salon now shows Closed today and new bookings for today are blocked." : "Today follows your normal published hours again."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update status."); } finally { setBusy(false); } }
  return <section className={`mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border p-4 ${closed ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}><div className="flex items-center gap-3">{closed ? <Clock3 className="text-red-700"/> : <Store className="text-emerald-700"/>}<div><p className="font-semibold text-plum">{closed ? "Closed today" : "Open according to normal hours"}</p><p className="text-sm text-ink/70">This same-day override appears on your public page and salon cards.</p>{message ? <p className="mt-1 text-sm font-medium text-plum">{message}</p> : null}</div></div><label className="flex items-center gap-3 text-sm font-semibold"><span>Open</span><button type="button" role="switch" aria-checked={closed} disabled={busy} onClick={() => void change(!closed)} className={`relative h-7 w-14 rounded-full transition ${closed ? "bg-red-500" : "bg-emerald-600"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${closed ? "left-8" : "left-1"}`}/></button><span>Closed</span></label></section>;
}
