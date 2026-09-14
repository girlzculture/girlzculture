"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { getSessionForScope, getSupabaseForScope } from "@/lib/supabase";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { OwnerActionError, ownerResponseError } from "@/lib/ownerActionError";
import { LOCALE_NAMES } from "@/i18n/catalog";
import { LENGTH_OPTIONS } from "@/lib/salonPresets";

type Row = Record<string, unknown>;
type SavedRequest = { id: string; tool: string; arguments: Row; execution_payload: Row; before_summary: Row; result: unknown; risk_class: number; digest: string; confirmed_at: string | null };
type Turn = { id: string; text?: string; request?: SavedRequest; clarification?: string; navigate?: string; notice?: string };
const AssistantOpenContext = createContext<((button: HTMLButtonElement) => void) | null>(null);

export function GcAssistantLauncher() {
  const open = useContext(AssistantOpenContext);
  if (!open) return null;
  return <button data-gc-assistant-launcher onClick={event => open(event.currentTarget)} className="flex min-h-11 items-center gap-2 rounded-full bg-plum px-4 text-sm font-semibold text-white" aria-haspopup="dialog"><Sparkles aria-hidden size={18}/><span data-no-translate>GC Assistant</span></button>;
}
const destinations: Record<string, [string, string]> = {
  profile: ["My Page", "/salon/dashboard/my-page"], services: ["Styles & Pricing", "/salon/dashboard/styles"], imports: ["Import a spreadsheet", "/salon/dashboard/styles"], policies: ["Your Business Policies", "/salon/dashboard/my-page/business-policies"], bookings: ["Bookings", "/salon/dashboard/bookings"], subscription: ["Subscription", "/salon/dashboard/subscription"], support: ["Help", "/help"], security: ["Security & sign out", "/salon/dashboard/settings/security"],
};
const fieldNames: Record<string, string> = {
  all_professionals: "All professionals",
  slug: "Public URL", vanity_slug: "Custom public URL", guest_name: "Customer", customer_name: "Customer", style: "Service", stylist: "Professional", stylist_name: "Professional", professional_name: "Professional", duration_minutes: "Duration (minutes)", buffer_minutes: "Buffer (minutes)", time: "Time", source_locale: "Original language", published_at: "Published", breakdown_unavailable: "Status breakdown unavailable", price_add: "Additional price", value: "Option",
  description: "Description", hours: "Hours", name: "Name", price: "Price", price_display_min: "Minimum price", price_display_max: "Maximum price", base_price: "Price", duration_hours: "Duration (hours)", duration_min_hours: "Minimum duration (hours)", duration_max_hours: "Maximum duration (hours)", start: "Starts", end: "Ends", time_zone: "Time zone", stylist_id: "Professional", reason: "Reason", booking_id: "Booking", body: "Message", policy: "Business policy", version: "Version", field: "Field", text: "New wording", public_reference: "Booking reference", appointment_datetime: "Appointment", status: "Status", total: "Total", bookings: "Bookings", by_status: "Booking status", services: "Services", requested_deposit: "Requested deposit", length_addons: "Length add-ons", size_options: "Sizes", length_options: "Lengths", addons: "Add-ons", is_draft: "Draft", open: "Opens", close: "Closes", closed: "Closed", instagram_url: "Instagram", tiktok_url: "TikTok", google_business_url: "Google Business", address_street: "Street address", address_city: "City", address_state: "State", address_zip: "ZIP code", slots: "Available times", date: "Date", label: "Time", available_stylists: "Available professionals", cancellation_hours: "Cancellation notice (hours)", rescheduling_hours: "Rescheduling notice (hours)", grace_minutes: "Late-arrival grace period (minutes)", preparation: "Before your appointment", notes: "Additional business notes", guests: "Guests", children: "Children", walk_ins: "Walk-ins", no_show: "Missed appointments", late_arrival: "Late arrivals", deposit_treatment: "Deposit rules", balance_due: "Remaining balance", satisfaction: "Satisfaction concerns",
};
const values: Record<string, string> = { platform_rules: "Platform rules apply", after_service: "After the service", contact_business: "Contact the business", reschedule_request: "Request a new appointment", welcome: "Welcome", ask_first: "Please ask first", appointment_only: "Appointment only" };
const hiddenFields = new Set(["id", "digest", "salon_id", "requested_by", "created_at", "expires_at", "master_style_id", "category_id", "service_group_id", "capped_at", "platform_rules_apply", "currency", "stylist_id", "style_id", "booking_id", "revision_id"]);
const weekdays: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday", Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday", Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday", Sunday: "Sunday" };
export function Facts({ value, name = "", group = "", depth = 0, timeZone = "America/New_York" }: { value: unknown; name?: string; group?: string; depth?: number; timeZone?: string }) {
  const { translateSource: t, formatNumber, formatCurrency, formatDate } = useI18n();
  if (depth > 5) return null;
  if (value === null || value === undefined || value === "") return <span>{t("None added")}</span>;
  if (Array.isArray(value)) return value.length ? <><ul className="space-y-3">{value.slice(0, 30).map((item, index) => <li className="border-l-2 border-plum/15 pl-3" key={index}><Facts value={item} group={name || group} depth={depth + 1} timeZone={timeZone}/></li>)}</ul>{value.length > 30 ? <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm underline">{t("Show {value0} more results", { value0: formatNumber(value.length - 30) })}</summary><ul className="space-y-3">{value.slice(30).map((item, index) => <li className="border-l-2 border-plum/15 pl-3" key={index}><Facts value={item} group={name || group} depth={depth + 1} timeZone={timeZone}/></li>)}</ul></details> : null}</> : <span>{t("No results")}</span>;
  if (typeof value === "object") {
    const zone = typeof (value as Row).time_zone === "string" ? String((value as Row).time_zone) : timeZone;
    return <dl className="space-y-2">{Object.entries(value).filter(([key]) => !hiddenFields.has(key) && (fieldNames[key] || weekdays[key] || name === "by_status")).map(([key, item]) => <div key={key} className="min-w-0"><dt className="text-xs font-semibold">{t(key === "label" && group === "length_options" ? "Name" : fieldNames[key] || weekdays[key] || key)}</dt><dd className="mt-1 text-sm"><Facts value={item} name={key} group={name || group} depth={depth + 1} timeZone={zone}/></dd></div>)}</dl>;
  }
  if (typeof value === "number") return <span>{/price|deposit/.test(name) ? formatCurrency(value) : formatNumber(value)}</span>;
  if (typeof value === "boolean") return <span>{t(value ? "Yes" : "No")}</span>;
  if (["start", "end", "appointment_datetime", "published_at"].includes(name) && Number.isFinite(Date.parse(String(value)))) return <span>{formatDate(String(value), { dateStyle: "medium", timeStyle: "short", timeZone })}</span>;
  if (["time", "open", "close"].includes(name) && /^\d{2}:\d{2}$/.test(String(value))) return <span>{formatDate(`1970-01-01T${value}:00Z`, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</span>;
  if (name === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return <span>{formatDate(`${value}T12:00:00Z`, { dateStyle: "medium", timeZone: "UTC" })}</span>;
  if (name === "status") return <span>{t(String(value))}</span>;
  if (name === "field") return <span>{t(fieldNames[String(value)] || "Field")}</span>;
  if (name === "source_locale") return <span data-no-translate>{LOCALE_NAMES[String(value)] || String(value)}</span>;
  if (["no_show", "late_arrival", "deposit_treatment", "balance_due", "satisfaction", "guests", "children", "walk_ins"].includes(name) && values[String(value)]) return <span>{t(values[String(value)])}</span>;
  if (["length_options", "length_addons"].includes(group) && ["name", "label", "value"].includes(name) && LENGTH_OPTIONS.some(option => option === String(value))) return <span>{t(String(value))}</span>;
  // Prose, names, addresses, URLs and identifiers are untrusted original content.
  return <span className="whitespace-pre-wrap break-words" data-no-translate>{String(value)}</span>;
}
const errors: Record<string, string> = {
  ASSISTANT_ACCESS_DENIED: "You do not have permission for this action.", AUTH_REQUIRED: "Sign in to use GC Assistant.",
  ASSISTANT_PLAN_REQUIRED: "Open Subscription to review your business access.", ASSISTANT_PREVIEW_STALE: "This information changed. Ask for a new preview before confirming.",
  ASSISTANT_PREVIEW_EXPIRED: "This preview expired. Ask for a new preview.", ASSISTANT_DEPOSIT_PLATFORM_RULE: "Deposits follow platform rules. Remove the custom deposit amount to prepare this service.",
  ASSISTANT_RECORD_NOT_FOUND: "Choose a record from your business and try again.", ASSISTANT_RANGE_CONFLICT: "That time overlaps an existing block. Review Availability before trying again.",
  PLATFORM_POLICY_CONFLICT: "These preferences conflict with platform protections. Review the payment and policy rules.",
};
export default function GcAssistant({ children }: { children?: React.ReactNode } = {}) {
  const { locale, translateSource: t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState(""); const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const actor = useRef<string | null>(null);
  const actorGeneration = useRef(0);
  useEffect(() => {
    const subscription = getSupabaseForScope("salon").auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (actor.current !== nextActor) {
        actorGeneration.current++; actor.current = nextActor;
        setTurns([]); setText(""); setReviewed({}); setNotice(""); setReference(""); setBusy(false);
      }
      if (!session) dialog.current?.close();
    });
    return () => { actorGeneration.current++; subscription.data.subscription.unsubscribe(); };
  }, []);
  async function call(body: Row, generation: number) {
    const session = await getSessionForScope("salon");
    if (!session || generation !== actorGeneration.current || session.user.id !== actor.current) throw new Error("AUTH_REQUIRED");
    const response = await fetch("/api/salon/assistant", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, locale }), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok) throw ownerResponseError(result, "ASSISTANT_UNAVAILABLE"); return result;
  }
  async function submit(tool?: string, setup = false) {
    const message = setup ? t("Help me set up my business, one step at a time.") : text;
    if (busy || (!tool && !message.trim())) return;
    const generation = actorGeneration.current;
    const id = crypto.randomUUID(); setBusy(true); setNotice(""); setReference("");
    try {
      const result = await call(tool ? { action: "tool", request_id: id, tool, args: tool === "get_services_and_prices" ? { query: "" } : {} } : { action: "plan", request_id: id, text: message, previous_request_ids: turns.filter(turn => turn.request).slice(-6).map(turn => turn.request!.id) }, generation);
      if (generation !== actorGeneration.current) return;
      setTurns(previous => [...previous, { id, text: tool ? "" : message, ...result }].slice(-12)); setText("");
    } catch (error) { if (generation !== actorGeneration.current) return; setReference(error instanceof OwnerActionError ? error.reference : ""); setNotice(errors[error instanceof Error ? error.message : ""] || "GC Assistant is temporarily unavailable. You can still use the dashboard and the quick actions below."); }
    finally { if (generation === actorGeneration.current) setBusy(false); }
  }
  async function confirm(turn: Turn) {
    if (!turn.request || busy) return;
    const generation = actorGeneration.current;
    setBusy(true); setNotice(""); setReference("");
    try {
      const result = await call({ action: "confirm", request_id: turn.request.id, digest: turn.request.digest, confirm: true, policy_reviewed: Boolean(reviewed[turn.id]) }, generation);
      if (generation !== actorGeneration.current) return;
      setTurns(previous => previous.map(item => item.id === turn.id ? { ...item, request: { ...turn.request!, result: result.result, confirmed_at: new Date().toISOString() }, notice: "Your change was saved and verified." } : item));
      window.dispatchEvent(new Event("gc-assistant-saved"));
      if (result.warnings?.length) { setNotice("The message was saved, but a notification could not be delivered."); setReference(result.warnings[0].request_id || ""); }
    } catch (error) { if (generation !== actorGeneration.current) return; setReference(error instanceof OwnerActionError ? error.reference : ""); setNotice(errors[error instanceof Error ? error.message : ""] || "The change could not be completed. Review the dashboard before trying again."); }
    finally { if (generation === actorGeneration.current) setBusy(false); }
  }
  return <AssistantOpenContext.Provider value={button => { launcher.current = button; dialog.current?.showModal(); }}>{children}
    <dialog ref={dialog} aria-labelledby="gc-assistant-title" onClose={() => launcher.current?.focus()} className="fixed inset-auto bottom-0 right-0 m-0 h-[85dvh] max-h-[900px] w-full max-w-xl overflow-hidden rounded-t-2xl border border-plum/20 bg-cream p-0 text-ink backdrop:bg-black/40 sm:bottom-4 sm:right-4 sm:w-[calc(100%-2rem)] sm:rounded-2xl">
      <div className="flex h-full flex-col"><header className="flex shrink-0 items-center justify-between border-b p-4"><h2 id="gc-assistant-title" className="font-serif text-2xl" data-no-translate>GC Assistant</h2><button onClick={() => dialog.current?.close()} className="grid h-11 w-11 place-items-center rounded-full border" aria-label={t("Close GC Assistant")}><X aria-hidden size={20}/></button></header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4"><p className="text-sm">{t("Ask about your business or prepare a change. You review and confirm before anything changes.")}</p><div className="flex flex-wrap gap-2">{[["get_business_profile", "My business profile"], ["get_services_and_prices", "My services and prices"], ["get_business_policies", "My business policies"]].map(([tool, label]) => <button key={tool} disabled={busy} onClick={() => void submit(tool)} className="min-h-11 rounded-xl border bg-white px-3 text-sm">{t(label)}</button>)}<button disabled={busy} onClick={() => void submit(undefined, true)} className="min-h-11 rounded-xl border bg-white px-3 text-sm">{t("Set up with GC Assistant")}</button></div>
          {turns.map(turn => <article key={turn.id} className="space-y-3 rounded-xl border bg-white p-4">{turn.text ? <p data-no-translate className="whitespace-pre-wrap break-words text-sm font-semibold">{turn.text}</p> : null}{turn.clarification ? <p data-no-translate>{turn.clarification}</p> : null}{turn.navigate && destinations[turn.navigate] ? <Link className="underline" href={destinations[turn.navigate][1]} onClick={() => dialog.current?.close()}>{t(destinations[turn.navigate][0])}</Link> : null}
            {turn.request ? <>{turn.request.risk_class >= 3 && !turn.request.confirmed_at ? <><h3 className="font-semibold">{t("Review this draft")}</h3>{turn.request.tool === "prepare_service" ? <p className="text-sm">{t("This service will be saved as a draft. Deposits follow platform rules.")}</p> : null}{turn.request.tool === "prepare_business_profile_update" && ["tiktok_url", "instagram_url"].includes(String(turn.request.arguments.field)) ? <p className="text-sm">{t("This social link will be submitted for platform review.")}</p> : null}<Facts value={{ ...turn.request.arguments, ...turn.request.execution_payload }}/>{Object.keys(turn.request.before_summary).length ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm">{t("Current information")}</summary><Facts value={turn.request.before_summary} timeZone={String(turn.request.execution_payload.time_zone || turn.request.arguments.time_zone || "America/New_York")}/></details> : null}
              {turn.request.tool === "prepare_business_policy_update" ? <label className="flex gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={Boolean(reviewed[turn.id])} onChange={event => setReviewed({ ...reviewed, [turn.id]: event.target.checked })}/>{t("I reviewed this policy in its original language and understand that platform rules and legal rights take precedence.")}</label> : null}
              <button disabled={busy || (turn.request.tool === "prepare_business_policy_update" && !reviewed[turn.id])} onClick={() => void confirm(turn)} className="min-h-11 rounded-full bg-plum px-5 text-sm text-white gc-disabled-control">{t(turn.request.risk_class === 4 ? "Confirm this public action" : "Confirm this change")}</button></> : <><p role="status" className="text-sm font-semibold">{t(turn.notice || "Current business information")}</p><Facts value={turn.request.result}/></>}</> : null}</article>)}
          <p role="status" className="text-sm">{t(busy ? "Working…" : notice)}</p>
          {reference ? <p className="break-words text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
          <div className="flex flex-wrap gap-4 text-sm">{["profile", "imports", "bookings"].map(key => <Link key={key} href={destinations[key][1]} onClick={() => dialog.current?.close()} className="underline">{t(destinations[key][0])}</Link>)}</div>
        </div><form className="shrink-0 space-y-2 border-t bg-cream p-4" onSubmit={event => { event.preventDefault(); void submit(); }}><label htmlFor="gc-assistant-input" className="text-sm font-semibold">{t("What would you like help with?")}</label><textarea id="gc-assistant-input" data-no-translate maxLength={2400} value={text} onChange={event => setText(event.target.value)} className="block max-h-36 min-h-20 w-full rounded-xl border bg-white p-3 text-sm"/><button disabled={busy || !text.trim()} className="min-h-11 rounded-full bg-plum px-6 text-sm text-white gc-disabled-control">{t("Ask GC Assistant")}</button></form>
      </div>
    </dialog></AssistantOpenContext.Provider>;
}
