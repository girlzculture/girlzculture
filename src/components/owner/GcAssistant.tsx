"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AssistantDictation from "@/components/owner/AssistantDictation";
import AssistantSpeech from "@/components/owner/AssistantSpeech";
import { ArrowUp, Bot, Building2, ListChecks, ShieldCheck, Sparkles, X } from "lucide-react";
import { getSessionForScope, getSupabaseForScope } from "@/lib/supabase";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { OwnerActionError, readOwnerResponse } from "@/lib/ownerActionError";
import { LOCALE_NAMES } from "@/i18n/catalog";
import { BOOKING_SOURCE_LABELS } from "@/lib/ownerBusinessMetrics";
import { POLICY_CHOICES } from "@/lib/businessPolicyCore";
import { LENGTH_OPTIONS } from "@/lib/salonPresets";
import { presentAssistantResult, presentPreparedAssistantAction } from "@/lib/gcAssistantPresentation";

type Row = Record<string, unknown>;
type SavedRequest = { id: string; tool: string; arguments: Row; execution_payload: Row; before_summary: Row; result: unknown; risk_class: number; digest: string; confirmed_at: string | null };
type Turn = { id: string; locale?: string; text?: string; request?: SavedRequest; assistant_message?: string; reply?: string; clarification?: string; navigate?: string; notice?: string; suggestions?: string[] };
const AssistantOpenContext = createContext<((button: HTMLButtonElement) => void) | null>(null);

export function GcAssistantLauncher() {
  const open = useContext(AssistantOpenContext);
  if (!open) return null;
  return <button data-gc-assistant-launcher onClick={event => open(event.currentTarget)} className="flex min-h-11 items-center gap-2 rounded-full bg-plum px-4 text-sm font-semibold text-white" aria-haspopup="dialog"><Sparkles aria-hidden size={18}/><span data-no-translate>GC Assistant</span></button>;
}
const destinations: Record<string, [string, string]> = {
  profile: ["My Page", "/salon/dashboard/my-page"], services: ["Styles & Pricing", "/salon/dashboard/styles"], imports: ["Import a spreadsheet", "/salon/dashboard/styles"], policies: ["Your Business Policies", "/salon/dashboard/my-page/business-policies"], bookings: ["Bookings", "/salon/dashboard/bookings"], subscription: ["Subscription", "/salon/dashboard/subscription"], support: ["Help", "/help"], security: ["Security & sign out", "/salon/dashboard/settings/security"],
};
const quickActions = [
  { tool: "get_business_profile", label: "My business profile", icon: Building2 },
  { tool: "get_services_and_prices", label: "My services and prices", icon: ListChecks },
  { tool: "get_business_policies", label: "My business policies", icon: ShieldCheck },
] as const;
const fieldNames: Record<string, string> = {
  calendar_gaps: "Calendar gaps", service_name: "Service", total_appointments: "Total Appointments", marketplace_bookings: "Girlz Culture marketplace bookings", business_added_appointments: "Business-added appointments", source_breakdown: "Booking sources", customers: "Customers", completed_booking_value: "Completed Booking Value", cancellation_rate: "Salon Cancellation Rate", upcoming: "Upcoming appointments", gaps: "Open time", profile_views: "Profile Views", profile_views_period: "Profile views period", profile_completion: "Profile Completion", professionals: "Professionals", products: "Products", messages: "Messages", original_body: "Original message", sender_role: "Sender", reviews: "Reviews", rating_overall: "Rating", written_review: "Review", salon_reply: "Business reply", display_name: "Customer", moderation_status: "Status", promotions: "Promotions", title: "Title", public_headline: "Public headline", promotion_type: "Offer type", discount_value: "Discount", starts_at: "Starts", ends_at: "Ends", subscription: "Subscription", tier: "Plan", current_period_end: "Current period ends", scheduled_tier: "Scheduled plan", cancel_at_period_end: "Cancellation scheduled", inventory_quantity: "Inventory quantity", product_status: "Status", is_visible: "Visible", sale_price: "Sale price", bio: "Biography", specialties: "Specialties", years_experience: "Years of experience", availability: "Availability", is_active: "Active", source: "Booking source", booking_origin: "Appointment origin", guest_email: "Email", guest_phone: "Phone", note: "Private booking note", payment_status: "Payment status", customer_policy_acceptance: "Customer policy acceptance", values: "Draft changes", refund_satisfaction: "Refund & Service Satisfaction Policy", refund_terms: "Business refund and satisfaction terms",

  all_professionals: "All professionals",
  slug: "Public URL", vanity_slug: "Custom public URL", guest_name: "Customer", customer_name: "Customer", style: "Service", stylist: "Professional", stylist_name: "Professional", professional_name: "Professional", duration_minutes: "Duration (minutes)", buffer_minutes: "Buffer (minutes)", time: "Time", source_locale: "Original language", published_at: "Published", breakdown_unavailable: "Status breakdown unavailable", price_add: "Additional price", value: "Option",
  description: "Description", hours: "Hours", name: "Name", price: "Price", price_display_min: "Minimum price", price_display_max: "Maximum price", base_price: "Price", duration_hours: "Duration (hours)", duration_min_hours: "Minimum duration (hours)", duration_max_hours: "Maximum duration (hours)", start: "Starts", end: "Ends", time_zone: "Time zone", stylist_id: "Professional", reason: "Reason", booking_id: "Booking", body: "Message", policy: "Business policy", version: "Version", field: "Field", text: "New wording", public_reference: "Booking reference", appointment_datetime: "Appointment", status: "Status", total: "Total", bookings: "Bookings", by_status: "Booking status", services: "Services", requested_deposit: "Requested deposit", length_addons: "Length add-ons", size_options: "Sizes", length_options: "Lengths", addons: "Add-ons", is_draft: "Draft", open: "Opens", close: "Closes", closed: "Closed", instagram_url: "Instagram", tiktok_url: "TikTok", google_business_url: "Google Business", address_street: "Street address", address_city: "City", address_state: "State", address_zip: "ZIP code", slots: "Available times", date: "Date", label: "Time", available_stylists: "Available professionals", cancellation_hours: "Cancellation notice (hours)", rescheduling_hours: "Rescheduling notice (hours)", grace_minutes: "Late-arrival grace period (minutes)", preparation: "Before your appointment", notes: "Additional business notes", guests: "Guests", children: "Children", walk_ins: "Walk-ins", no_show: "Missed appointments", late_arrival: "Late arrivals", deposit_treatment: "Deposit rules", balance_due: "Remaining balance", satisfaction: "Satisfaction concerns",
};
const values: Record<string, string> = { ...POLICY_CHOICES, platform_rules: "Platform rules apply", after_service: "After the service" };
const statusLabels: Record<string, string> = { active: "Active", trialing: "Trialing", past_due: "Past due", unpaid: "Unpaid", incomplete: "Incomplete", incomplete_expired: "Incomplete and expired", canceled: "Canceled", cancelled: "Cancelled", paused: "Paused", pending: "Pending", published: "Published", draft: "Draft", archived: "Archived", ended: "Ended", confirmed: "Confirmed", requested: "Requested", completed: "Completed" };
const senderLabels: Record<string, string> = { customer: "Customer", salon: "Business", salon_owner: "Business", salon_team: "Business", admin: "Platform support", system: "System" };
const offerLabels: Record<string, string> = { percentage: "Percentage discount", fixed: "Fixed discount", descriptive: "Descriptive offer", free_addon: "Free eligible add-on", free_service: "Free eligible service" };
const hiddenFields = new Set(["id", "digest", "salon_id", "requested_by", "created_at", "expires_at", "master_style_id", "category_id", "service_group_id", "capped_at", "platform_rules_apply", "currency", "stylist_id", "style_id", "booking_id", "revision_id"]);
const weekdays: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday", Monday: "Monday", Tuesday: "Tuesday", Wednesday: "Wednesday", Thursday: "Thursday", Friday: "Friday", Saturday: "Saturday", Sunday: "Sunday" };
export function Facts({ value, name = "", group = "", depth = 0, timeZone = "America/New_York" }: { value: unknown; name?: string; group?: string; depth?: number; timeZone?: string }) {
  const { translateSource: t, formatNumber, formatCurrency, formatDate } = useI18n();
  if (depth > 5) return null;
  if (value === null || value === undefined || value === "") return <span>{t("None added")}</span>;
  if (Array.isArray(value)) return value.length ? <><ul className="space-y-3">{value.slice(0, 30).map((item, index) => <li className="border-l-2 border-plum/15 pl-3" key={index}><Facts value={item} group={name || group} depth={depth + 1} timeZone={timeZone}/></li>)}</ul>{value.length > 30 ? <details className="mt-3"><summary className="min-h-11 cursor-pointer text-sm underline">{t("Show {value0} more results", { value0: formatNumber(value.length - 30) })}</summary><ul className="space-y-3">{value.slice(30).map((item, index) => <li className="border-l-2 border-plum/15 pl-3" key={index}><Facts value={item} group={name || group} depth={depth + 1} timeZone={timeZone}/></li>)}</ul></details> : null}</> : <span>{t("No results")}</span>;
  if (typeof value === "object") {
    const zone = typeof (value as Row).time_zone === "string" ? String((value as Row).time_zone) : timeZone;
    return <dl className="space-y-2">{Object.entries(value).filter(([key]) => !hiddenFields.has(key) && (fieldNames[key] || weekdays[key] || (name === "by_status" || name === "source_breakdown"))).map(([key, item]) => <div key={key} className="min-w-0"><dt className="text-xs font-semibold">{t(key === "label" && group === "length_options" ? "Name" : fieldNames[key] || weekdays[key] || (name === "source_breakdown" ? BOOKING_SOURCE_LABELS[key] : null) || key)}</dt><dd className="mt-1 text-sm"><Facts value={item} name={key} group={name || group} depth={depth + 1} timeZone={zone}/></dd></div>)}</dl>;
  }
  if (typeof value === "number") return <span>{/price|deposit|completed_booking_value/.test(name) ? formatCurrency(value) : name === "cancellation_rate" ? formatNumber(value, { style: "percent", maximumFractionDigits: 1 }) : formatNumber(value)}</span>;
  if (typeof value === "boolean") return <span>{t(value ? "Yes" : "No")}</span>;
  if (["start", "end", "starts_at", "ends_at", "current_period_end", "appointment_datetime", "published_at"].includes(name) && Number.isFinite(Date.parse(String(value)))) return <span>{formatDate(String(value), { dateStyle: "medium", timeStyle: "short", timeZone })}</span>;
  if (["time", "open", "close"].includes(name) && /^\d{2}:\d{2}$/.test(String(value))) return <span>{formatDate(`1970-01-01T${value}:00Z`, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</span>;
  if (name === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return <span>{formatDate(`${value}T12:00:00Z`, { dateStyle: "medium", timeZone: "UTC" })}</span>;
  if (name === "profile_views_period") return <span>{t(value === "all_time" ? "All time" : String(value))}</span>;
  if (name === "source") return <span>{t(({ phone: "Phone", walk_in: "Walk-in", instagram: "Instagram", whatsapp: "WhatsApp", other: "Other", marketplace: "Girlz Culture marketplace" } as Record<string, string>)[String(value)] || "Other")}</span>;
  if (name === "booking_origin") return <span>{t(value === "business_added" ? "Business-added appointment" : "Girlz Culture marketplace")}</span>;
  if (["status", "product_status", "moderation_status"].includes(name)) return <span>{t(statusLabels[String(value).toLowerCase()] || String(value))}</span>;
  if (name === "sender_role") return <span>{t(senderLabels[String(value)] || String(value))}</span>;
  if (name === "promotion_type") return <span>{t(offerLabels[String(value)] || String(value))}</span>;
  if (["payment_status", "customer_policy_acceptance"].includes(name)) return <span>{t(String(value))}</span>;
  if (name === "field") return <span>{t(fieldNames[String(value)] || "Field")}</span>;
  if (name === "source_locale") return <span data-no-translate>{LOCALE_NAMES[String(value)] || String(value)}</span>;
  if (["refund_satisfaction", "no_show", "late_arrival", "deposit_treatment", "balance_due", "satisfaction", "guests", "children", "walk_ins"].includes(name) && values[String(value)]) return <span>{t(values[String(value)])}</span>;
  if (["length_options", "length_addons"].includes(group) && ["name", "label", "value"].includes(name) && LENGTH_OPTIONS.some(option => option === String(value))) return <span>{t(String(value))}</span>;
  // Prose, names, addresses, URLs and identifiers are untrusted original content.
  return <span className="whitespace-pre-wrap break-words" data-no-translate>{String(value)}</span>;
}
const errors: Record<string, string> = {
  ASSISTANT_SERVICE_CLARIFICATION_REQUIRED: "Which service is this appointment for?", ASSISTANT_DURATION_CLARIFICATION_REQUIRED: "How many minutes will this appointment take?", ASSISTANT_PROFESSIONAL_CLARIFICATION_REQUIRED: "Which professional should take this appointment?", ASSISTANT_AVAILABILITY_CONFLICT: "That time is unavailable. Choose another time.", ASSISTANT_DRAFT_REQUIRED: "Choose a draft record. Published records remain in their existing editing workflow.", ASSISTANT_CUSTOMER_PARTICIPANT_REQUIRED: "This appointment has no customer participant in Girlz Culture. Use your existing contact channel.",

  ASSISTANT_ACCESS_DENIED: "You do not have permission for this action.", AUTH_REQUIRED: "Sign in to use GC Assistant.",
  ASSISTANT_PLAN_REQUIRED: "Open Subscription to review your business access.", ASSISTANT_PREVIEW_STALE: "This information changed. Ask for a new preview before confirming.",
  ASSISTANT_PREVIEW_EXPIRED: "This preview expired. Ask for a new preview.", ASSISTANT_DEPOSIT_PLATFORM_RULE: "Deposits follow platform rules. Remove the custom deposit amount to prepare this service.",
  ASSISTANT_RECORD_NOT_FOUND: "Choose a record from your business and try again.", ASSISTANT_RANGE_CONFLICT: "That time overlaps an existing block. Review Availability before trying again.",
  ASSISTANT_BUDGET_LIMIT: "GC Assistant has reached its protected usage allowance. Your dashboard data is safe; contact Girlz Culture support to review access.",
  ASSISTANT_RATE_LIMIT: "Too many requests were sent at once. Wait a moment, then try again.",
  ASSISTANT_COST_CONFIGURATION_REQUIRED: "GC Assistant needs its approved AI cost settings before free-form chat can run. The dashboard quick actions still work.",
  ASSISTANT_UNAVAILABLE: "GC Assistant could not reach its AI service. The dashboard and read-only quick actions are still available.",
  PLATFORM_POLICY_CONFLICT: "These preferences conflict with platform protections. Review the payment and policy rules.",
};
export default function GcAssistant({ children }: { children?: React.ReactNode } = {}) {
  const { locale, translateSource: t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(""); const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [dictationSession, setDictationSession] = useState(0);
  const [reference, setReference] = useState("");
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const actor = useRef<string | null>(null);
  const actorGeneration = useRef(0);
  useEffect(() => {
    const lifetime = actorGeneration;
    const subscription = getSupabaseForScope("salon").auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (actor.current !== nextActor) {
        actorGeneration.current++; actor.current = nextActor;
        setDictationSession(value => value + 1); setTurns([]); setText(""); setReviewed({}); setNotice(""); setReference(""); setBusy(false);
      }
      if (!session) dialog.current?.close();
    });
    return () => { lifetime.current++; subscription.data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ block: "end", behavior: turns.length > 1 ? "smooth" : "auto" });
  }, [turns, busy, notice]);
  async function call(body: Row, generation: number) {
    const session = await getSessionForScope("salon");
    if (!session || generation !== actorGeneration.current) throw new Error("AUTH_REQUIRED");
    // onAuthStateChange can arrive after a fast first click. The bearer session
    // remains authoritative; initialize the same-account guard without making
    // the user's first Assistant request fail spuriously.
    if (actor.current === null) actor.current = session.user.id;
    if (session.user.id !== actor.current) throw new Error("AUTH_REQUIRED");
    const response = await fetch("/api/salon/assistant", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, locale }), signal: AbortSignal.timeout(55000) });
    return readOwnerResponse(response, "ASSISTANT_UNAVAILABLE");
  }
  async function submit(tool?: string, setup = false) {
    const message = setup ? t("Help me set up my business, one step at a time.") : text;
    if (busy || (!tool && !message.trim())) return;
    const generation = actorGeneration.current;
    const id = crypto.randomUUID(); setBusy(true); setNotice(""); setReference("");
    try {
      const result = await call(tool ? { action: "tool", request_id: id, tool, args: tool === "get_services_and_prices" ? { query: "" } : {} } : { action: "plan", request_id: id, text: message, conversation: turns.flatMap(turn => {
        // Tool facts are replayed only from server records after fresh permission
        // checks. Do not smuggle revoked data back through client chat history.
        const assistant = turn.clarification || "";
        return [...(turn.text ? [{ role: "user", text: turn.text }] : []), ...(assistant ? [{ role: "assistant", text: assistant }] : [])];
      }).slice(-6), previous_request_ids: turns.filter(turn => turn.request).slice(-6).map(turn => turn.request!.id) }, generation);
      if (generation !== actorGeneration.current) return;
      const quickAction = quickActions.find(action => action.tool === tool);
      setTurns(previous => [...previous, { id, text: tool ? t(quickAction?.label || "Business information") : message, ...result, locale }].slice(-12));
      if (!tool) setText(current => current === message ? "" : current);
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
    <dialog ref={dialog} aria-labelledby="gc-assistant-title" aria-describedby="gc-assistant-description" onClose={() => { setDictationSession(value => value + 1); launcher.current?.focus(); }} className="fixed inset-auto bottom-0 right-0 m-0 h-[92dvh] max-h-[920px] w-full max-w-[680px] overflow-hidden rounded-t-[24px] border border-border bg-white p-0 font-sans text-text-primary shadow-[0_28px_90px_rgba(13,17,20,.24)] backdrop:bg-primary-hover/45 sm:bottom-4 sm:right-4 sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[calc(100%-2rem)] sm:rounded-[24px]">
      <div className="flex h-full flex-col bg-white">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-hover text-white"><Bot aria-hidden size={21}/></span>
            <div className="min-w-0"><h2 id="gc-assistant-title" className="truncate text-base font-bold tracking-[-.01em] text-text-primary" data-no-translate>GC Assistant</h2><p className="text-xs font-medium text-text-primary">{t("Your business copilot")}</p></div>
          </div>
          <button onClick={() => dialog.current?.close()} className="grid h-10 w-10 place-items-center rounded-full text-text-primary transition hover:bg-subtle" aria-label={t("Close GC Assistant")}><X aria-hidden size={20}/></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-subtle px-3 py-5 sm:px-5">
          <section className="flex items-start gap-3" aria-label={t("GC Assistant introduction")}>
            <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-hover text-white"><Sparkles aria-hidden size={16}/></span>
            <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-border bg-white px-4 py-3 shadow-[0_4px_16px_rgba(13,17,20,.04)]">
              <p id="gc-assistant-description" className="text-sm font-medium leading-6 text-text-primary">{t("Ask about your business, find an answer, or prepare a change. I will keep it conversational, and you will review anything before it is saved.")}</p>
            </div>
          </section>

          <nav aria-label={t("Suggested Assistant actions")} className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {quickActions.map(action => <button key={action.tool} data-assistant-tool={action.tool} disabled={busy} onClick={() => void submit(action.tool)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-teal hover:text-text-link gc-disabled-control"><action.icon aria-hidden size={15}/>{t(action.label)}</button>)}
            <button disabled={busy} onClick={() => void submit(undefined, true)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-white px-3.5 text-xs font-semibold text-text-primary shadow-sm transition hover:border-teal hover:text-text-link gc-disabled-control"><Sparkles aria-hidden size={15}/>{t("Set up with GC Assistant")}</button>
          </nav>

          <div className="mt-5 space-y-5">
            {turns.map(turn => {
              const fallback = turn.request?.risk_class === 1 ? presentAssistantResult(turn.request.tool, turn.request.result, locale) : null;
              const responseText = turn.request?.confirmed_at ? "" : turn.assistant_message || turn.reply || turn.clarification || fallback?.message || (turn.request?.risk_class && turn.request.risk_class >= 3 ? presentPreparedAssistantAction(turn.request.tool, locale) : "");
              const suggestions = turn.suggestions || fallback?.suggestions || [];
              return <article key={turn.id} className="space-y-3">
                {turn.text ? <div className="flex justify-end"><p data-no-translate className="max-w-[86%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary-hover px-4 py-3 text-sm font-medium leading-6 text-white shadow-sm">{turn.text}</p></div> : null}
                {responseText || turn.navigate ? <div className="flex items-start gap-3"><span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-hover text-white"><Bot aria-hidden size={16}/></span><div className="max-w-[88%] rounded-2xl rounded-tl-md border border-border bg-white px-4 py-3 shadow-[0_4px_16px_rgba(13,17,20,.04)]">
                  {responseText ? <><p role={turn.request?.risk_class === 1 || !turn.request ? "status" : undefined} data-no-translate className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-text-primary">{responseText}</p><AssistantSpeech text={responseText} sessionKey={dictationSession} language={turn.assistant_message || turn.reply || turn.clarification ? turn.locale : locale}/></> : null}
                  {turn.navigate && destinations[turn.navigate] ? <Link className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary-hover px-4 text-xs font-bold text-white" href={destinations[turn.navigate][1]} onClick={() => dialog.current?.close()}>{t(`Open ${destinations[turn.navigate][0]}`)}</Link> : null}
                </div></div> : null}

                {turn.request?.risk_class && turn.request.risk_class >= 3 && !turn.request.confirmed_at ? <section className="ml-0 rounded-2xl border border-border bg-white p-4 shadow-[0_6px_20px_rgba(13,17,20,.05)] sm:ml-11">
                  <h3 className="text-base font-bold text-text-primary">{t("Review this draft")}</h3>
                  {turn.request.tool === "prepare_service" ? <p className="mt-2 text-sm leading-6 text-text-primary">{t("This service will be saved as a draft. Deposits follow platform rules.")}</p> : null}
                  {turn.request.tool === "prepare_business_profile_update" && ["tiktok_url", "instagram_url"].includes(String(turn.request.arguments.field)) ? <p className="mt-2 text-sm leading-6 text-text-primary">{t("This social link will be submitted for platform review.")}</p> : null}
                  <div className="mt-4 rounded-xl bg-subtle p-4 text-text-primary"><Facts value={{ ...turn.request.arguments, ...turn.request.execution_payload }}/></div>
                  {Object.keys(turn.request.before_summary).length ? <details className="mt-3 rounded-xl border border-border px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-text-primary">{t("Current information")}</summary><div className="border-t border-border py-3"><Facts value={turn.request.before_summary} timeZone={String(turn.request.execution_payload.time_zone || turn.request.arguments.time_zone || "America/New_York")}/></div></details> : null}
                  {turn.request.tool === "prepare_business_policy_update" ? <label className="mt-4 flex gap-3 text-sm font-medium leading-5 text-text-primary"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-teal" checked={Boolean(reviewed[turn.id])} onChange={event => setReviewed({ ...reviewed, [turn.id]: event.target.checked })}/>{t("I reviewed this policy in its original language and understand that platform rules and legal rights take precedence.")}</label> : null}
                  {/* Keep foreground and background changes immediate so an enabled action stays readable throughout the state change. */}
                  <button disabled={busy || (turn.request.tool === "prepare_business_policy_update" && !reviewed[turn.id])} onClick={() => void confirm(turn)} className="mt-4 min-h-11 rounded-full bg-primary-hover px-5 text-sm font-bold text-white shadow-sm transition-shadow hover:bg-primary-hover gc-disabled-control">{t(turn.request.risk_class === 4 ? "Confirm this public action" : "Confirm this change")}</button>
                </section> : null}

                {turn.notice ? <p role="status" className="ml-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-text-success">{t(turn.notice)}</p> : null}
                {suggestions.length ? <div className="ml-11 flex flex-wrap gap-2">{suggestions.slice(0, 3).map(suggestion => <button key={suggestion} type="button" onClick={() => setText(t(suggestion))} className="min-h-9 rounded-full border border-border bg-white px-3 text-xs font-semibold text-text-primary hover:border-teal">{t(suggestion)}</button>)}</div> : null}
              </article>;
            })}
            {busy ? <div className="flex items-start gap-3" aria-label={t("GC Assistant is working")}><span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-hover text-white"><Bot aria-hidden size={16}/></span><div className="flex h-11 items-center gap-1 rounded-2xl rounded-tl-md border border-border bg-white px-4"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink [animation-delay:120ms]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink [animation-delay:240ms]"/></div></div> : null}
            {notice ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-5 text-text-danger"><p role="status" aria-label={t("GC Assistant status")}>{t(notice)}</p>{reference ? <p className="mt-1 break-words text-xs font-medium">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}</div> : <p role="status" aria-label={t("GC Assistant status")} className="sr-only">{t(busy ? "Working…" : "Ready")}</p>}
            <div ref={conversationEnd}/>
          </div>
        </div>

        <form className="shrink-0 border-t border-border bg-white p-3 sm:p-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="gc-assistant-input" className="sr-only">{t("What would you like help with?")}</label>
          <div className="rounded-[22px] border border-border bg-white px-3 py-2 shadow-[0_6px_24px_rgba(13,17,20,.08)] focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
            <textarea id="gc-assistant-input" data-no-translate rows={2} maxLength={2400} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={t("Message GC Assistant")} className="block max-h-36 min-h-12 w-full resize-none bg-transparent px-1 py-2 text-[15px] font-medium leading-6 text-text-primary outline-none placeholder:text-text-primary"/>
            <div className="flex items-center justify-between gap-3"><p className="pl-1 text-[11px] font-medium text-text-primary">{t("Review AI suggestions before saving changes.")}</p><div className="flex items-center gap-1"><AssistantDictation key={`${locale}:${dictationSession}`} sessionKey={dictationSession} disabled={busy} value={text} onChange={setText}/><button disabled={busy || !text.trim()} aria-label={t("Ask GC Assistant")} title={t("Ask GC Assistant")} className="grid h-10 w-10 place-items-center rounded-full bg-primary-hover text-white shadow-sm transition hover:bg-primary-hover gc-disabled-control"><ArrowUp aria-hidden size={19}/></button></div></div>
          </div>
        </form>
      </div>
    </dialog>
  </AssistantOpenContext.Provider>;
}
