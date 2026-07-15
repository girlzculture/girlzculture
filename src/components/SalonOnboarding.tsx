"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Clock3, ImagePlus, Paintbrush, RefreshCw, Scissors, Store, UserRound } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import PushSetup from "@/components/notifications/PushSetup";

type CheckKey = "logo" | "photos" | "style" | "stylist" | "hours" | "availability" | "alerts";
type OnboardingState = {
  salon: { name?: string; slug?: string; status?: string; subscription_status?: string };
  checks: Record<CheckKey, boolean>;
  progress: number;
  checklist_complete: boolean;
  discoverable: boolean;
  eligibility: { active_status: boolean; active_subscription: boolean };
};

const items: Array<{ key: CheckKey; title: string; body: string; href: string; action: string; icon: typeof Store }> = [
  { key: "logo", title: "Add your salon logo", body: "Use a clear business mark clients will recognize.", href: "/salon/dashboard/my-page", action: "Add logo", icon: Store },
  { key: "photos", title: "Publish at least 3 photos", body: "Show your space and real examples of your work.", href: "/salon/dashboard/photos", action: "Manage photos", icon: ImagePlus },
  { key: "style", title: "Add a priced service", body: "Publish at least one bookable service with a real starting price.", href: "/salon/dashboard/styles", action: "Add service", icon: Paintbrush },
  { key: "stylist", title: "Add a stylist", body: "Create the professional clients can select while booking.", href: "/salon/dashboard/stylists", action: "Add stylist", icon: UserRound },
  { key: "hours", title: "Set store hours", body: "Tell clients when your salon is normally open.", href: "/salon/dashboard/availability", action: "Set hours", icon: Clock3 },
  { key: "availability", title: "Set bookable availability", body: "Add a working schedule so real appointment times can be offered.", href: "/salon/dashboard/availability", action: "Set availability", icon: Scissors },
  { key: "alerts", title: "Install the app and enable alerts", body: "Required so new bookings and cancellations can always reach you.", href: "#booking-alerts", action: "Enable alerts", icon: BellRing },
];

export default function SalonOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (method: "GET" | "POST" = "GET") => {
    const session = await getSessionForScope("salon");
    if (!session) throw new Error("Sign in with the salon-owner account to continue.");
    const response = await fetch("/api/salon/onboarding", { method, headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load setup progress.");
    setState(body);
    setMessage(method === "POST" ? "Setup progress refreshed." : "");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load setup.")).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const handlePushReady = useCallback((ready: boolean) => {
    if (ready) window.setTimeout(() => void refresh("POST").catch(console.error), 0);
  }, [refresh]);

  if (loading) return <div className="py-16 text-center text-plum">Checking your setup...</div>;
  if (!state) return <div className="rounded-xl bg-red-50 p-5 text-sm text-red-700">{message || "Unable to load salon onboarding."}</div>;

  return <div>
    <section className={`rounded-[18px] p-5 text-white sm:p-7 ${state.discoverable ? "bg-emerald-700" : "bg-[linear-gradient(135deg,#2f1038,#5b1a6b)]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-white/70">Marketplace setup</p><h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">{state.discoverable ? "Your salon is discoverable" : "Complete your public listing"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{state.discoverable ? "Clients can find your salon in homepage and search results." : "All seven items are required before the salon appears in discovery and search."}</p></div><b className="font-serif text-4xl">{state.progress}%</b></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-magenta transition-all" style={{ width: `${state.progress}%` }}/></div>
      {!state.eligibility.active_status || !state.eligibility.active_subscription ? <p className="mt-4 rounded-xl bg-white/10 p-3 text-xs leading-5">The checklist can be prepared now, but public discovery also requires an Active salon status and an active subscription.</p> : null}
    </section>

    <div className="mt-6 grid gap-3 sm:grid-cols-2">{items.map((item) => { const Icon = item.icon; const complete = state.checks[item.key]; return <article key={item.key} className={`rounded-[16px] border p-5 ${complete ? "border-emerald-200 bg-emerald-50" : "border-plum/10 bg-white"}`}><div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700" : "bg-blush text-magenta"}`}>{complete ? <Check size={21}/> : <Icon size={21}/>}</span><div className="min-w-0 flex-1"><h2 className="font-serif text-xl text-plum">{item.title}</h2><p className="mt-1 text-xs leading-5 text-ink/60">{item.body}</p>{complete ? <p className="mt-3 text-xs font-bold text-emerald-700">Complete</p> : <Link href={item.href} className="mt-3 inline-flex text-xs font-bold text-magenta">{item.action} →</Link>}</div></div></article>; })}</div>

    <section id="booking-alerts" className="mt-6"><PushSetup scope="salon" required onReady={handlePushReady}/></section>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-ink/55">{message}</p><div className="flex gap-3"><button type="button" onClick={() => void refresh("POST").catch((error) => setMessage(error instanceof Error ? error.message : "Unable to refresh."))} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-magenta px-5 text-xs font-bold text-magenta"><RefreshCw size={15}/>Refresh progress</button>{state.discoverable && state.salon.slug ? <Link href={`/salon/${state.salon.slug}`} className="inline-flex min-h-11 items-center rounded-lg bg-magenta px-5 text-xs font-bold text-white">View public salon</Link> : <Link href="/salon/dashboard" className="inline-flex min-h-11 items-center rounded-lg bg-plum px-5 text-xs font-bold text-white">Back to dashboard</Link>}</div></div>
  </div>;
}
