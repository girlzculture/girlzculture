"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, ImagePlus, Paintbrush, RefreshCw, Store, UserRound } from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import PushSetup from "@/components/notifications/PushSetup";

type CheckKey = "application_approved" | "business_name" | "structured_address" | "precise_geocoding" | "logo" | "cover_photo" | "gallery_photos" | "business_details" | "priced_service" | "active_stylist" | "business_hours" | "active_subscription" | "payout_account" | "agreements";
type Gate = { label?: string; required?: boolean; passed?: boolean; action?: string; current?: number; target?: number };
type OnboardingState = {
  salon: { name?: string; slug?: string; status?: string; subscription_status?: string };
  checks: Partial<Record<CheckKey, Gate>>;
  missing: Array<{ key: CheckKey; label: string; action?: string }>;
  progress: number;
  checklist_complete: boolean;
  discoverable: boolean;
  finished: boolean;
  owner_is_sole_stylist: boolean;
  finish_blockers: string[];
  eligibility: { approved: boolean; active_status: boolean; active_subscription: boolean; precise_location: boolean };
  lifecycle: { auto_activation: boolean; loss_behavior?: string; grace_until?: string | null };
};

const items: Array<{ key: CheckKey; title: string; body: string; href: string; action: string; icon: typeof Store }> = [
  { key: "application_approved", title: "Application approval", body: "Girlz Culture verifies the application and business identity.", href: "/salon/application-submitted", action: "View application status", icon: Check },
  { key: "business_name", title: "Business name", body: "Add the public name clients should recognize.", href: "/salon/dashboard/my-page", action: "Edit business profile", icon: Store },
  { key: "structured_address", title: "Complete business address", body: "Provide a valid US street, city, state, and ZIP code.", href: "/salon/dashboard/my-page", action: "Complete address", icon: Store },
  { key: "precise_geocoding", title: "Verify your map location", body: "A precise location is required for honest nearby results.", href: "/salon/dashboard/my-page", action: "Verify address", icon: Store },
  { key: "logo", title: "Add your salon logo", body: "Use a clear business mark clients will recognize.", href: "/salon/dashboard/my-page", action: "Add logo", icon: Store },
  { key: "cover_photo", title: "Upload a cover image", body: "Choose the main editorial photo for your public page.", href: "/salon/dashboard/photos", action: "Add cover image", icon: ImagePlus },
  { key: "gallery_photos", title: "Build your gallery", body: "Upload the required number of real salon or work photos.", href: "/salon/dashboard/photos", action: "Manage gallery", icon: ImagePlus },
  { key: "business_details", title: "Complete business details", body: "Add a useful description, email address, and US phone number.", href: "/salon/dashboard/my-page", action: "Edit details", icon: Store },
  { key: "priced_service", title: "Add a bookable service", body: "Publish at least one service with a valid price and duration.", href: "/salon/dashboard/styles", action: "Add service", icon: Paintbrush },
  { key: "active_stylist", title: "Identify who provides services", body: "Add an active stylist, or confirm that you are the sole stylist.", href: "/salon/dashboard/stylists", action: "Add stylist", icon: UserRound },
  { key: "business_hours", title: "Set salon hours", body: "Tell clients when your salon is normally open and bookable.", href: "/salon/dashboard/availability", action: "Set hours", icon: Clock3 },
  { key: "active_subscription", title: "Activate your subscription", body: "A current salon plan is required before the listing can go live.", href: "/salon/dashboard/subscription", action: "Manage subscription", icon: Store },
  { key: "payout_account", title: "Connect payouts", body: "Connect the salon payout account when this gate is enabled.", href: "/salon/dashboard/earnings", action: "Manage payouts", icon: Store },
  { key: "agreements", title: "Confirm required permissions", body: "Accept the application agreements and confirm media rights.", href: "/salon/dashboard/my-page", action: "Review permissions", icon: Check },
];

export default function SalonOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const requestState = useCallback(async (action: "load" | "refresh" | "finish" | "set_sole_stylist" = "load", ownerIsSoleStylist?: boolean) => {
    const session = await getSessionForScope("salon");
    if (!session) throw new Error("Sign in with the salon-owner account to continue.");
    const response = await fetch("/api/salon/onboarding", {
      method: action === "load" ? "GET" : "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, ...(action === "load" ? {} : { "Content-Type": "application/json" }) },
      body: action === "load" ? undefined : JSON.stringify({ action, owner_is_sole_stylist: ownerIsSoleStylist }),
      cache: "no-store",
    });
    const body = await response.json() as OnboardingState & { error?: string };
    if (!response.ok) throw new Error(body.error || "Unable to load setup progress.");
    setState(body);
    if (action === "finish") {
      setMessage(body.discoverable ? "Setup complete. Your salon is now live and discoverable." : `Your salon is still hidden. Complete: ${body.finish_blockers.join("; ")}.`);
    } else if (action === "set_sole_stylist") {
      setMessage(ownerIsSoleStylist ? "Sole stylist status saved." : "Sole stylist status removed.");
    } else if (action === "refresh") setMessage("Setup checklist refreshed.");
    return body;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void requestState().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load setup.")).finally(() => setLoading(false)), 0);
    return () => window.clearTimeout(timer);
  }, [requestState]);

  async function perform(action: "refresh" | "finish" | "set_sole_stylist", ownerIsSoleStylist?: boolean) {
    setSaving(true);
    try { await requestState(action, ownerIsSoleStylist); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update setup."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="py-16 text-center text-plum">Checking your setup...</div>;
  if (!state) return <div className="rounded-xl bg-red-50 p-5 text-sm text-red-700">{message || "Unable to load salon onboarding."}</div>;

  return <div>
    <section className={`rounded-[18px] p-5 text-white sm:p-7 ${state.discoverable ? "bg-emerald-700" : "bg-[linear-gradient(135deg,#2f1038,#5b1a6b)]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-white/70">Marketplace setup</p><h1 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">{state.discoverable ? "Your salon is discoverable" : "Complete your public listing"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">{state.discoverable ? "Clients can find your salon on the homepage and in search results." : "Complete every required gate below. Progress only reaches 100% when each live marketplace requirement passes."}</p></div><b className="font-serif text-4xl">{state.progress}%</b></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-magenta transition-all" style={{ width: `${state.progress}%` }}/></div>
      {!state.eligibility.active_status || !state.eligibility.active_subscription ? <p className="mt-4 rounded-xl bg-white/10 p-3 text-xs leading-5">You can prepare the checklist now. Going live also requires an Active salon status and an active subscription.</p> : null}
    </section>

    {!state.discoverable && state.missing.length ? <section className="mt-5 rounded-[14px] border border-amber/40 bg-amber/10 p-4"><h2 className="font-serif text-xl text-plum">Still required before you can go live</h2><ul className="mt-2 space-y-1 text-sm text-ink/70">{state.missing.map((item) => <li key={item.key}>• {item.label}</li>)}</ul></section> : null}

    <div className="mt-6 grid gap-3 sm:grid-cols-2">{items.filter((item) => state.checks[item.key]?.required !== false).map((item) => { const Icon = item.icon; const complete = state.checks[item.key]?.passed === true; return <article key={item.key} className={`rounded-[16px] border p-5 ${complete ? "border-emerald-200 bg-emerald-50" : "border-plum/10 bg-white"}`}><div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${complete ? "bg-emerald-100 text-emerald-700" : "bg-blush text-magenta"}`}>{complete ? <Check size={21}/> : <Icon size={21}/>}</span><div className="min-w-0 flex-1"><h2 className="font-serif text-xl text-plum">{state.checks[item.key]?.label || item.title}</h2><p className="mt-1 text-xs leading-5 text-ink/60">{item.body}</p>{complete ? <p className="mt-3 text-xs font-bold text-emerald-700">Complete</p> : <Link href={state.checks[item.key]?.action || item.href} className="mt-3 inline-flex text-xs font-bold text-magenta">{item.action} →</Link>}{item.key === "active_stylist" ? <label className="mt-4 flex items-start gap-2 rounded-lg border border-plum/10 bg-white p-3 text-xs font-semibold text-plum"><input type="checkbox" checked={state.owner_is_sole_stylist} disabled={saving} onChange={(event) => void perform("set_sole_stylist", event.target.checked)} className="mt-0.5 accent-magenta"/><span>I am the salon owner and sole stylist</span></label> : null}</div></div></article>; })}</div>

    <section className="mt-6 rounded-[16px] border border-plum/10 bg-white p-5"><h2 className="font-serif text-xl text-plum">Recommended: booking alerts</h2><p className="mt-1 text-xs leading-5 text-ink/60">Install the app and enable alerts so booking changes reach you quickly. This does not block your salon from going live.</p><div className="mt-4"><PushSetup scope="salon" compact /></div></section>

    {message ? <p role="status" className={`mt-5 rounded-lg p-3 text-sm ${state.discoverable ? "bg-emerald-50 text-emerald-800" : "bg-blush/45 text-plum"}`}>{message}</p> : null}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={saving} onClick={() => void perform("refresh")} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-magenta px-5 text-xs font-bold text-magenta disabled:opacity-60"><RefreshCw size={15}/>Refresh checklist</button><div className="flex gap-3">{state.discoverable && state.salon.slug ? <Link href={`/salon/${state.salon.slug}`} className="inline-flex min-h-11 items-center rounded-lg border border-magenta px-5 text-xs font-bold text-magenta">View public salon</Link> : <Link href="/salon/dashboard" className="inline-flex min-h-11 items-center rounded-lg border border-plum/20 px-5 text-xs font-bold text-plum">Back to dashboard</Link>}<button type="button" disabled={saving || state.discoverable} onClick={() => void perform("finish")} className="inline-flex min-h-11 items-center rounded-lg bg-magenta px-6 text-xs font-bold text-white disabled:opacity-50">{state.discoverable ? "Setup finished" : saving ? "Checking..." : "Finish setup"}</button></div></div>
  </div>;
}
