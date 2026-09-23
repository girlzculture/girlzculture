"use client";
import AssistantFinanceReport from './AssistantFinanceReport';
import AssistantPhotoUpload from './AssistantPhotoUpload';
import AssistantTeamPreview from './AssistantTeamPreview';
import AssistantControlsPreview from "@/components/owner/AssistantControlsPreview";
import {isCatalogTool} from "@/lib/assistantCatalog";
import AssistantCatalogPreview from "./AssistantCatalogPreview";
import AssistantOperationPreview from "@/components/owner/AssistantOperationPreview";
import type {AppointmentAlternative} from "@/lib/assistantAppointmentAlternatives";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { assistantPageFromPath } from "@/lib/assistantPageContext";
import { isAssistantLanguage } from "@/lib/assistantLanguage";
import AssistantDictation from "@/components/owner/AssistantDictation";
import AssistantSpeech from "@/components/owner/AssistantSpeech";
import AssistantReschedulePreview from "@/components/owner/AssistantReschedulePreview";
import {rescheduleAssistantCopy} from "@/i18n/assistant-reschedule-copy";
import AssistantFinancePreview from "@/components/owner/AssistantFinancePreview";
import {assistantFinanceCopy} from "@/i18n/assistant-finance-record-copy";
import AssistantBalances from "@/components/owner/AssistantBalances";
import { MEMORY_TOOLS } from "@/lib/assistantMemory";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { ASSISTANT_AVATARS, type AssistantAvatar, type AssistantBusinessContext } from "@/lib/assistantAppearance";
import { assistantPageActions } from "@/lib/assistantPageActions";
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
type ActiveTask={id:string;tool:string;revision:number;label:string};
type Turn = { alternatives?:AppointmentAlternative[]; task_switch_required?:boolean; abandoned?:boolean; id: string; locale?: string; text?: string; request?: SavedRequest; assistant_message?: string; reply?: string; clarification?: string; navigate?: string; notice?: string; suggestions?: string[]; submission?: Row; pending?: boolean; error?: string; errorReference?: string };
const AssistantOpenContext = createContext<{ open: (button: HTMLButtonElement) => void; openAppearance: (button: HTMLButtonElement) => void; expanded: boolean; docked: boolean; avatar: AssistantAvatar } | null>(null);
const AssistantBusinessBinding = createContext<((business: AssistantBusinessContext) => void) | null>(null);
export function useAssistantBusinessBinding() { return useContext(AssistantBusinessBinding); }
function Avatar({ value, small = false }: { value: AssistantAvatar; small?: boolean }) {
  const { translateSource: t } = useI18n();
  const entry = ASSISTANT_AVATARS[value];
  return <span role="img" aria-label={t(entry.label)} data-assistant-avatar={value} className={`grid shrink-0 place-items-center rounded-full bg-teal/10 ${small ? "h-7 w-7 text-lg" : "h-9 w-9 text-2xl"}`}>{entry.symbol}</span>;
}

export function useAssistantDocked() { return useContext(AssistantOpenContext)?.docked || false; }

export function GcAssistantLauncher() {
  const assistant = useContext(AssistantOpenContext);
  if (!assistant) return null;
  return <button data-gc-assistant-launcher onClick={event => assistant.open(event.currentTarget)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary-hover px-3 text-xs font-semibold text-white" aria-label="GC Assistant" aria-haspopup="dialog" aria-expanded={assistant.expanded}><Avatar value={assistant.avatar} small/><span data-no-translate>GC Assistant</span></button>;
}
export function GcAssistantAppearanceLauncher() {
  const assistant = useContext(AssistantOpenContext);
  const { translateSource: t } = useI18n();
  if (!assistant) return null;
  return <button type="button" onClick={event => assistant.openAppearance(event.currentTarget)} aria-label={t("Assistant appearance")} aria-haspopup="dialog" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-primary"><Avatar value={assistant.avatar} small/>{t("Assistant appearance")}</button>;
}
const destinations: Record<string, [string, string]> = {
  overview: ["Overview", "/salon/dashboard"], photos: ["Photos", "/salon/dashboard/photos"], professionals: ["Stylists", "/salon/dashboard/stylists"], products: ["Products", "/salon/dashboard/products"], availability: ["Availability & Calendar", "/salon/dashboard/availability"], messages: ["Messages", "/salon/dashboard/messages"], reviews: ["Reviews", "/salon/dashboard/reviews"], earnings: ["Finances", "/salon/dashboard/earnings"], promotions: ["Promotions", "/salon/dashboard/promotions"], settings: ["Settings", "/salon/dashboard/settings"],
  profile: ["My Page", "/salon/dashboard/my-page"], services: ["Services & Pricing", "/salon/dashboard/styles"], imports: ["Import a spreadsheet", "/salon/dashboard/styles"], policies: ["Your Business Policies", "/salon/dashboard/my-page/business-policies"], bookings: ["Bookings", "/salon/dashboard/bookings"], subscription: ["Subscription", "/salon/dashboard/subscription"], support: ["Help", "/help"], security: ["Security & sign out", "/salon/dashboard/settings/security"],
};
const fieldNames: Record<string, string> = {
  amount_cents: "Received amount", occurred_at: "Received at", method: "Payment method", client_name: "Client name (optional)",
  business_policy_text: "Business Policy", preferences: "Client preferences", cautions: "Allergies, sensitivities and cautions", visits: "Past and upcoming services", formula: "Formula for this appointment", instructions: "Exact service instructions", color: "Color / formula", technique: "Technique", visit_count: "Visits in this business",
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
  if (typeof value === "number") return <span>{name === "amount_cents" ? formatCurrency(value / 100) : /price|deposit|completed_booking_value/.test(name) ? formatCurrency(value) : name === "cancellation_rate" ? formatNumber(value, { style: "percent", maximumFractionDigits: 1 }) : formatNumber(value)}</span>;
  if (typeof value === "boolean") return <span>{t(value ? "Yes" : "No")}</span>;
  if (["start", "end", "starts_at", "ends_at", "current_period_end", "appointment_datetime", "published_at", "occurred_at"].includes(name) && Number.isFinite(Date.parse(String(value)))) return <span>{formatDate(String(value), { dateStyle: "medium", timeStyle: "short", timeZone })}</span>;
  if (["time", "open", "close"].includes(name) && /^\d{2}:\d{2}$/.test(String(value))) return <span>{formatDate(`1970-01-01T${value}:00Z`, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}</span>;
  if (name === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return <span>{formatDate(`${value}T12:00:00Z`, { dateStyle: "medium", timeZone: "UTC" })}</span>;
  if (name === "profile_views_period") return <span>{t(value === "all_time" ? "All time" : String(value))}</span>;
  if (name === "method") return <span>{t(({ cash: "Cash", card: "Card", transfer: "Transfer", other: "Other" } as Record<string, string>)[String(value)] || "Other")}</span>;
  if (name === "source") return <span>{t(({ phone: "Phone", walk_in: "Walk-in", social: "Social media", instagram: "Instagram", whatsapp: "WhatsApp", other: "Other", marketplace: "Girlz Culture marketplace" } as Record<string, string>)[String(value)] || "Other")}</span>;
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
  ASSISTANT_GALLERY_FULL: "Your gallery is full. Remove a photo before adding another.",
    ASSISTANT_BOOKING_NOT_READY: "This appointment is not ready for that action. Refresh its status and review again.",
    ASSISTANT_CHECK_IN_REASON_REQUIRED: "Early or late check-in needs your actual reason and confirmation that it is accurate.",
  ASSISTANT_LOCATION_REVIEW_REQUIRED: "A verified business location is required before changing privacy or travel settings. Contact support to complete the location review.",
  ASSISTANT_EMAIL_UNAVAILABLE: "Email delivery is unavailable. Keep automatic reminders off until support restores the connection.",
  ASSISTANT_TASK_CHANGED: "This task changed in another session. Send your request again to use its current state.",
  ASSISTANT_TASK_CONTEXT_FULL: "This task has reached its context limit. Review and finish it, or end it before starting another task.",
  ASSISTANT_CONVERSATION_CLOSED: "This conversation is closed. Its history is still available.",
  ASSISTANT_SERVICE_CLARIFICATION_REQUIRED: "Which service is this appointment for?", ASSISTANT_DURATION_CLARIFICATION_REQUIRED: "How many minutes will this appointment take?", ASSISTANT_PROFESSIONAL_CLARIFICATION_REQUIRED: "Which professional should take this appointment?", ASSISTANT_AVAILABILITY_CONFLICT: "That time is unavailable. Choose another time.", ASSISTANT_DRAFT_REQUIRED: "Choose a draft record. Published records remain in their existing editing workflow.", ASSISTANT_CUSTOMER_PARTICIPANT_REQUIRED: "This appointment has no customer participant in Girlz Culture. Use your existing contact channel.",

  ASSISTANT_ACCESS_DENIED: "You do not have permission for this action.", AUTH_REQUIRED: "Sign in to use GC Assistant.",
  ASSISTANT_PROFESSIONAL_BOOKINGS_REMAIN: "Reassign this professional’s upcoming appointments before removing them.",
  ASSISTANT_FINANCE_AMOUNT_EXCEEDS_REMAINING: "The amount exceeds the remaining recorded balance. Review the current record and prepare a new draft.", ASSISTANT_FINANCE_PAYMENT_UNVERIFIED: "The original payment is unverified or in test mode. Review it in Finances before recording a balance.",
  ASSISTANT_PLAN_REQUIRED: "Open Subscription to review your business access.", ASSISTANT_PREVIEW_STALE: "This information changed. Ask for a new preview before confirming.",
  ASSISTANT_PREVIEW_EXPIRED: "This preview expired. Ask for a new preview.", ASSISTANT_DEPOSIT_PLATFORM_RULE: "Deposit rates are managed separately in Finances. Remove the custom deposit amount to prepare this service.",
  ASSISTANT_RECORD_NOT_FOUND: "Choose a record from your business and try again.", ASSISTANT_RANGE_CONFLICT: "That time overlaps an existing block. Review Availability before trying again.",
  ASSISTANT_BUDGET_LIMIT: "GC Assistant has reached its protected usage allowance. Your dashboard data is safe; contact Girlz Culture support to review access.",
  ASSISTANT_RATE_LIMIT: "Too many requests were sent at once. Wait a moment, then try again.",
  ASSISTANT_COST_CONFIGURATION_REQUIRED: "GC Assistant needs its approved AI cost settings before free-form chat can run. The dashboard quick actions still work.",
  ASSISTANT_LANGUAGE_SAVE_FAILED: "Your response language could not be saved. Retry this message; no business change was made.",
  ASSISTANT_UNAVAILABLE: "GC Assistant could not reach its AI service. The dashboard and read-only quick actions are still available.",
  PLATFORM_POLICY_CONFLICT: "These preferences conflict with platform protections. Review the payment and policy rules.",
};
export default function GcAssistant({ children }: { children?: React.ReactNode } = {}) {
  const pathname = usePathname();
  const { locale, translateSource: t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const explicitOpen = useRef(false);
  const conversationOptions = useRef<HTMLDetailsElement>(null);
  const appearanceSection = useRef<HTMLFieldSetElement>(null);
  const handledAppearanceRequest = useRef(0);
  const [appearanceRequest, setAppearanceRequest] = useState(0);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const conversationViewport = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const submissionInFlight = useRef(false);
  const desktopMode = useRef(false);
  const desktopClosed = useRef(false);
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [text, setText] = useState(""); const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const [dictationSession, setDictationSession] = useState(0);
  const [reference, setReference] = useState("");
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const actor = useRef<string | null>(null);
  const actorGeneration = useRef(0);
  const [activeTask,setActiveTask]=useState<ActiveTask|null>(null);
  const taskMutation = useRef(0);
  const [rememberedIds, setRememberedIds] = useState<string[]>([]);
  const [memory, setMemory] = useState<{ request_ids: string[]; locale: string; expires_at: string } | null>(null);
  const [memoryNotice, setMemoryNotice] = useState("");
  const [memoryReference, setMemoryReference] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const businessRef = useRef<AssistantBusinessContext | null>(null);
  const [business, setBusiness] = useState<AssistantBusinessContext | null>(null);
  const [avatar, setAvatar] = useState<AssistantAvatar>("woman");
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [appearanceNotice, setAppearanceNotice] = useState("");
  const [appearanceReference, setAppearanceReference] = useState("");
  const quickActions = assistantPageActions(assistantPageFromPath(pathname), business);
  // The server resolves the account response preference independently of the
  // display language. Saving it does not opt the owner into conversation memory.
  const responseLanguage = useRef<{ display: string; response: string } | null>(null);
  const bindBusiness = useCallback((next: AssistantBusinessContext) => {
    if (actor.current && actor.current !== next.userId) return;
    if (actor.current === null) actor.current = next.userId;
    const previous = businessRef.current;
    const accessChanged = previous && (previous.isOwner !== next.isOwner || (!next.isOwner && JSON.stringify(previous.permissions) !== JSON.stringify(next.permissions)));
    if (previous && (previous.id !== next.id || previous.userId !== next.userId || accessChanged)) {
      actorGeneration.current++; responseLanguage.current = null;
      setActiveTask(null); setTurns([]); setText(""); setReviewed({}); setNotice(""); setReference(""); setBusy(false);
      setRememberedIds([]); setMemory(null); setMemoryNotice(""); setMemoryReference(""); setMemoryOpen(false);
      setDictationSession(value => value + 1); submissionInFlight.current = false;
      setAppearanceNotice(""); setAppearanceReference(""); setAppearanceBusy(false);
    }
    businessRef.current = next; setBusiness(next); setAvatar(next.avatar);
  }, []);
  useEffect(() => {
    const lifetime = actorGeneration;
    const subscription = getSupabaseForScope("salon").auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (actor.current !== nextActor) {
        actorGeneration.current++; actor.current = nextActor;
        businessRef.current = null; setBusiness(null); setAvatar("woman"); setAppearanceNotice(""); setAppearanceReference(""); setAppearanceBusy(false);
        responseLanguage.current = null;
        setRememberedIds([]); setMemory(null); setMemoryNotice(""); setMemoryReference(""); setMemoryOpen(false);
        submissionInFlight.current = false; followConversation.current = true;
        setDictationSession(value => value + 1); setActiveTask(null); setTurns([]); setText(""); setReviewed({}); setNotice(""); setReference(""); setBusy(false);
      }
      setHasSession(Boolean(session));
      if (!session) { dialog.current?.close(); setOpen(false); }
    });
    return () => { lifetime.current++; subscription.data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => {
      desktopMode.current = media.matches;
      setDesktop(media.matches);
      // A phone or tablet never opens the conversation just because the route
      // loaded. The desktop close preference survives route changes/resizing.
      setOpen(media.matches && !desktopClosed.current);
    };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (!hasSession || !open) { explicitOpen.current = false; if (panel.open) panel.close(); return; }
    const active = document.activeElement;
    const retainFocus = desktop && !explicitOpen.current && active instanceof HTMLElement && active !== document.body && !panel.contains(active);
    explicitOpen.current = false;
    if (panel.open) panel.close();
    if (desktop) panel.show(); else panel.showModal();
    // Native show() moves focus even for a passive desktop dock. Restore the
    // existing editor synchronously, before another keyboard event can arrive.
    if (retainFocus && active.isConnected) active.focus({ preventScroll: true });
  }, [desktop, open, hasSession]);
  useEffect(() => {
    if (!appearanceRequest || handledAppearanceRequest.current === appearanceRequest || !open || !hasSession || !business?.isOwner || !dialog.current?.open) return;
    handledAppearanceRequest.current = appearanceRequest;
    if (conversationOptions.current) conversationOptions.current.open = true;
    followConversation.current = false;
    const selection = appearanceSection.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    selection?.focus({ preventScroll: true });
    appearanceSection.current?.scrollIntoView({ block: "center" });
  }, [appearanceRequest, open, hasSession, business?.isOwner]);
  useEffect(() => {
    const viewport = conversationViewport.current;
    if (viewport && followConversation.current) viewport.scrollTop = viewport.scrollHeight;
  }, [turns, busy, notice]);
  useEffect(() => {
    if (!open || !hasSession || !business?.id) return;
    const controller = new AbortController();
    const generation = actorGeneration.current, revision = taskMutation.current;
    void (async () => {
      try {
        const session = await getSessionForScope("salon");
        if (!session || generation !== actorGeneration.current) return;
        const response = await fetch("/api/salon/assistant/task", {headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal});
        const result = await readOwnerResponse(response,"ASSISTANT_UNAVAILABLE");
        if (!controller.signal.aborted && generation === actorGeneration.current && revision === taskMutation.current) setActiveTask(result.active_task as ActiveTask|null);
      } catch {
        if (!controller.signal.aborted && generation === actorGeneration.current && revision === taskMutation.current) setNotice("The unfinished task could not be loaded. Try again.");
      }
    })();
    return () => controller.abort();
  }, [open, hasSession, business?.id]);
  async function call(body: Row, generation: number) {
    taskMutation.current++;
    const session = await getSessionForScope("salon");
    if (!session || generation !== actorGeneration.current) throw new Error("AUTH_REQUIRED");
    // onAuthStateChange can arrive after a fast first click. The bearer session
    // remains authoritative; initialize the same-account guard without making
    // the user's first Assistant request fail spuriously.
    if (actor.current === null) actor.current = session.user.id;
    if (session.user.id !== actor.current) throw new Error("AUTH_REQUIRED");
    const requestLocale = responseLanguage.current?.display === locale ? responseLanguage.current.response : locale;
    const response = await fetch("/api/salon/assistant", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, task_tracking:true, locale: body.locale || requestLocale, ...(body.action === "plan" ? { page: body.page || assistantPageFromPath(pathname) } : {}) }), signal: AbortSignal.timeout(55000) });
    return readOwnerResponse(response, "ASSISTANT_UNAVAILABLE");
  }
  async function submit(tool?: string, setup = false, retry?: Turn, prompt?: string, toolArgs?: Row) {
    const message = prompt || (setup ? t("Help me set up my business, one step at a time.") : text);
    if (busy || submissionInFlight.current || (!retry && !tool && !message.trim())) return;
    const generation = actorGeneration.current;
    const id = retry?.id || crypto.randomUUID();
    const submission: Row = retry?.submission || { ...(tool ? { action: "tool", request_id: id, tool, args: toolArgs || quickActions.find(action => action.tool === tool)?.args || {} } : { action: "plan", request_id: id, text: message, page: assistantPageFromPath(pathname), conversation: turns.filter(turn => !turn.error && !turn.pending).flatMap(turn => {
        // Tool facts are replayed only from server records after fresh permission
        // checks. Do not smuggle revoked data back through client chat history.
        const assistant = turn.clarification || "";
        return [...(turn.text ? [{ role: "user", text: turn.text }] : []), ...(assistant ? [{ role: "assistant", text: assistant }] : [])];
      }).slice(-6), previous_request_ids: [...new Set([...rememberedIds, ...turns.filter(turn => turn.request).map(turn => turn.request!.id)])].slice(-6) }), locale: responseLanguage.current?.display === locale ? responseLanguage.current.response : locale };
    submissionInFlight.current = true;
    followConversation.current = true;
    setBusy(true); setNotice(""); setReference("");
    if (retry) setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, pending: true, error: undefined, errorReference: undefined, alternatives:undefined } : turn));
    else {
      const quickAction = quickActions.find(action => action.tool === tool);
      setTurns(previous => [...previous, { id, text: tool ? prompt || t(quickAction?.label || "Business information") : message, submission, pending: true }]);
      if (!tool && !setup && !prompt) setText("");
    }
    try {
      const result = await call(submission, generation);
      if (generation !== actorGeneration.current) return;
      if(Object.hasOwn(result,"active_task"))setActiveTask(result.active_task as ActiveTask|null);
      const resultLocale = isAssistantLanguage(result.response_locale) ? result.response_locale : (responseLanguage.current?.display === locale ? responseLanguage.current.response : locale);
      responseLanguage.current = { display: locale, response: resultLocale };
      setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, ...result, id, locale: resultLocale, pending: false, error: undefined, errorReference: undefined, alternatives:undefined } : turn));
    } catch (error) {
      if (generation !== actorGeneration.current) return;
      const message = errors[error instanceof Error ? error.message : ""] || "GC Assistant is temporarily unavailable. You can still use the dashboard and the quick actions below.";
      setNotice(message);
      setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, pending: false, error: message, errorReference: error instanceof OwnerActionError ? error.reference : "",alternatives:error instanceof OwnerActionError?error.alternatives:[] } : turn));
    } finally { if (generation === actorGeneration.current) { submissionInFlight.current = false; setBusy(false); } }
  }
  async function endTask(next?:Turn){
    if(busy||!activeTask)return;
    taskMutation.current++;
    const generation=actorGeneration.current;setBusy(true);setNotice("");
    try{
      const session=await getSessionForScope("salon");if(!session)throw Error("AUTH_REQUIRED");
      const response=await fetch("/api/salon/assistant/task",{method:"DELETE",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({id:activeTask.id,revision:activeTask.revision,confirm:true})});
      const result=await readOwnerResponse(response,"ASSISTANT_UNAVAILABLE");if(!result.verified)throw Error("ASSISTANT_TASK_CHANGED");
      if(generation!==actorGeneration.current)return;
      setActiveTask(null);setRememberedIds([]);
      setTurns(previous=>previous.map(turn=>({...turn,...(turn.request?.tool===activeTask.tool&&!turn.request.confirmed_at?{abandoned:true}:{}),task_switch_required:false})));
      if(next){
        const submission={...next.submission,...(next.submission?.action==='plan'?{previous_request_ids:[],conversation:[]}:{})};
        // Reuse the already visible user turn. This continuation was explicitly
        // requested by the owner and must not duplicate the original message.
        setTurns(previous=>previous.map(turn=>turn.id===next.id?{...turn,pending:true}:turn));
        const answer=await call(submission,generation);if(generation!==actorGeneration.current)return;
        if(isAssistantLanguage(answer.response_locale))responseLanguage.current={display:locale,response:answer.response_locale};
        if(Object.hasOwn(answer,"active_task"))setActiveTask(answer.active_task as ActiveTask|null);
        setTurns(previous=>previous.map(turn=>turn.id===next.id?{...turn,...answer,submission,pending:false}:turn));
      }
    }catch(error){if(generation===actorGeneration.current){setNotice(errors[error instanceof Error?error.message:""]||"The unfinished task could not be loaded. Try again.");if(next)setTurns(previous=>previous.map(turn=>turn.id===next.id?{...turn,pending:false,error:"GC Assistant is temporarily unavailable. You can still use the dashboard and the quick actions below.",submission:{...next.submission,...(next.submission?.action==='plan'?{previous_request_ids:[],conversation:[]}:{})}}:turn));}}
    finally{if(generation===actorGeneration.current)setBusy(false);}
  }
  async function manageMemory(action: "load" | "save" | "delete" | "resume") {
    if (busy) return;
    const generation = actorGeneration.current;
    setBusy(true); setMemoryNotice(""); setMemoryReference("");
    try {
      const session = await getSessionForScope("salon");
      if (!session || generation !== actorGeneration.current) throw new Error("AUTH_REQUIRED");
      if (actor.current === null) actor.current = session.user.id;
      if (session.user.id !== actor.current) throw new Error("AUTH_REQUIRED");
      const safeIds = turns.filter(turn => turn.request && (MEMORY_TOOLS as readonly string[]).includes(turn.request.tool)).map(turn => turn.request!.id);
      const responseLocale = responseLanguage.current?.display === locale ? responseLanguage.current.response : locale;
      const response = await fetch("/api/salon/assistant/memory", {
        method: action === "save" ? "POST" : action === "delete" ? "DELETE" : "GET",
        headers: {Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},
        ...(action === "save" ? {body:JSON.stringify({consent:true,locale:isAssistantLanguage(responseLocale)?responseLocale:"en",request_ids:[...new Set([...rememberedIds,...safeIds])].slice(-6)})} : {}),
        signal:AbortSignal.timeout(15000),
      });
      const result = await readOwnerResponse(response,"ASSISTANT_MEMORY_UNAVAILABLE");
      if (generation !== actorGeneration.current) return;
      setMemory(result.memory || null);
      if (action === "delete") { setRememberedIds([]); setMemoryNotice("Saved context deleted. Business audit records are unchanged."); }
      else if (action === "save") setMemoryNotice("Context saved for 30 days. Only you can resume it in this business.");
      else if (!result.memory) { setRememberedIds([]); setMemoryNotice("No saved context is available."); }
      else if (action === "resume" && isAssistantLanguage(result.memory.locale)) {
        // Read again at the actual resume action: a previously opened panel may
        // outlive the bookmark or the actor's permission to a saved topic.
        actorGeneration.current++; setBusy(false); setTurns([]); setText(""); setReviewed({}); setNotice(""); setReference(""); setDictationSession(value => value + 1);
        setRememberedIds(result.memory.request_ids);
        responseLanguage.current = {display:locale,response:result.memory.locale};
        setMemoryNotice("Saved context resumed. Ask a new question to read current information.");
      }
    } catch (error) {
      if (generation !== actorGeneration.current) return;
      setMemoryReference(error instanceof OwnerActionError ? error.reference : "");
      setMemoryNotice(error instanceof Error && error.message === "ASSISTANT_MEMORY_NO_SAFE_CONTEXT" ? "Ask about services, products, professionals or business settings before saving context." : "Saved context could not be loaded or changed. Your current conversation is still available.");
    } finally { if (generation === actorGeneration.current) setBusy(false); }
  }
  async function confirm(turn: Turn) {
    if (!turn.request || busy) return;
    const generation = actorGeneration.current;
    setBusy(true); setNotice(""); setReference("");
    try {
      const result = await call({ action: "confirm", request_id: turn.request.id, digest: turn.request.digest, confirm: true, policy_reviewed: Boolean(reviewed[turn.id]) }, generation);
      if (generation !== actorGeneration.current) return;
      if(activeTask?.tool===turn.request?.tool)setActiveTask(null);
      setTurns(previous => previous.map(item => item.id === turn.id ? { ...item, request: { ...turn.request!, result: result.result, confirmed_at: new Date().toISOString() }, notice: turn.request?.tool === "prepare_manual_service_sale" ? "The received payment was recorded and verified in Finances. No customer charge was made." : "Your change was saved and verified." } : item));
      window.dispatchEvent(new Event("gc-assistant-saved"));
      if (result.warnings?.length) { setNotice(turn.request.tool === "prepare_booking_reschedule_proposal" ? "The proposal was saved, but a notification could not be delivered." : "The message was saved, but a notification could not be delivered."); setReference(result.warnings[0].request_id || ""); }
    } catch (error) { if (generation !== actorGeneration.current) return; setReference(error instanceof OwnerActionError ? error.reference : ""); setNotice(errors[error instanceof Error ? error.message : ""] || "The change could not be completed. Review the dashboard before trying again."); }
    finally { if (generation === actorGeneration.current) setBusy(false); }
  }
  async function saveAvatar(value: AssistantAvatar) {
    const selectedBusiness = businessRef.current;
    if (!selectedBusiness?.isOwner || appearanceBusy) return;
    const generation = actorGeneration.current;
    setAppearanceBusy(true); setAppearanceNotice(""); setAppearanceReference("");
    try {
      const session = await getSessionForScope("salon");
      if (!session || session.user.id !== selectedBusiness.userId || generation !== actorGeneration.current) throw new Error("AUTH_REQUIRED");
      const response = await fetch("/api/salon/assistant/appearance", { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ avatar: value }) });
      const result = await readOwnerResponse(response, "ASSISTANT_APPEARANCE_UNAVAILABLE");
      if (generation !== actorGeneration.current || businessRef.current?.id !== selectedBusiness.id) return;
      if (!result.verified || result.business_id !== selectedBusiness.id || result.avatar !== value) throw new Error("ASSISTANT_APPEARANCE_UNVERIFIED");
      setAvatar(value); businessRef.current = { ...selectedBusiness, avatar: value }; setBusiness(businessRef.current);
      setAppearanceNotice("Assistant appearance saved.");
      window.dispatchEvent(new Event("gc-assistant-saved"));
    } catch (error) {
      if (generation !== actorGeneration.current) return;
      setAppearanceNotice("Assistant appearance could not be saved. Try again."); setAppearanceReference(error instanceof OwnerActionError ? error.reference : "");
    } finally { if (generation === actorGeneration.current) setAppearanceBusy(false); }
  }
  function openFromLauncher(button: HTMLButtonElement) {
    launcher.current = button; desktopClosed.current = false;
    explicitOpen.current = !dialog.current?.open;
    setOpen(true);
    if (dialog.current?.open) dialog.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  return <AssistantBusinessBinding.Provider value={bindBusiness}><AssistantOpenContext.Provider value={{ open: openFromLauncher, openAppearance: button => { openFromLauncher(button); setAppearanceRequest(value => value + 1); }, expanded: open && hasSession, docked: desktop && open && hasSession, avatar }}>{children}
    <dialog ref={dialog} aria-labelledby="gc-assistant-title" aria-describedby="gc-assistant-description" aria-modal={!desktop} onClose={() => { if (dialog.current?.open) return; setOpen(false); if (desktopMode.current) desktopClosed.current = true; setDictationSession(value => value + 1); launcher.current?.focus(); }} className={`gc-assistant-panel fixed inset-auto m-0 overflow-hidden border border-border bg-white p-0 font-sans text-text-primary ${desktop ? "bottom-4 right-4 top-20 z-30 h-auto max-h-none w-[320px] max-w-none rounded-2xl shadow-sm" : "bottom-0 right-0 h-[92dvh] max-h-[920px] w-full max-w-[680px] rounded-t-2xl shadow-xl backdrop:bg-black/30 sm:bottom-4 sm:right-4 sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[calc(100%-2rem)] sm:rounded-2xl"}`}>
      <div className="flex h-full flex-col bg-white">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar value={avatar}/>
            <div className="min-w-0"><h2 id="gc-assistant-title" className="truncate font-serif text-lg font-bold text-text-primary" data-no-translate>GC Assistant</h2><p className="text-xs text-text-secondary">{t("Your AI business assistant.")}</p></div>
          </div>
          <button onClick={() => dialog.current?.close()} className="grid h-10 w-10 place-items-center rounded-full text-text-primary transition hover:bg-subtle" aria-label={t("Close GC Assistant")}><X aria-hidden size={20}/></button>
        </header>

        {activeTask?<section aria-label={t("Unfinished task")} className="border-b border-border px-4 py-2 text-xs"><p className="font-semibold">{t("Unfinished task")}</p><p className="line-clamp-2" data-no-translate>{activeTask.label}</p><button type="button" disabled={busy} onClick={()=>void endTask()} className="min-h-11 underline">{t("End this task")}</button></section>:null}
        <div ref={conversationViewport} data-assistant-conversation onScroll={event => { const viewport = event.currentTarget; followConversation.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-subtle px-3 py-3">
          <section className="flex items-start gap-3" aria-label={t("GC Assistant introduction")}>
            <Avatar value={avatar} small/>
            <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-border bg-white px-4 py-3 shadow-[0_4px_16px_rgba(13,17,20,.04)]">
              <p id="gc-assistant-description" className="text-sm leading-6 text-text-primary">{t("Hi, I’m your GC Assistant. Let’s work on your business together.")}</p>
            </div>
          </section>

          <details ref={conversationOptions} className="mt-2 text-xs text-text-secondary"><summary className="min-h-11 cursor-pointer py-3">{t("Conversation options")}</summary><div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => {
              actorGeneration.current++; setTurns([]); setText(""); setReviewed({}); setNotice(""); setReference(""); setDictationSession(value => value + 1);
              setRememberedIds([]);
            }} className="min-h-11 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-text-primary gc-disabled-control">{t("New conversation")}</button>
          </div>

          <details className="my-2 text-xs text-text-secondary"><summary className="min-h-11 cursor-pointer py-3">{t("Voice information")}</summary><p>{t("Spoken answers use an installed voice on this device. Audio is not saved.")}</p></details>
          <button type="button" disabled={busy} onClick={() => void submit(undefined, true)} className="min-h-11 rounded-lg border border-border bg-white px-3 text-xs font-semibold gc-disabled-control">{t("Set up with GC Assistant")}</button>

          <section className="mt-3 rounded-xl border border-border bg-white p-3" aria-label={t("Saved conversation context")}>
            <button type="button" disabled={busy} aria-expanded={memoryOpen} onClick={() => { setMemoryOpen(value => !value); if (!memoryOpen) void manageMemory("load"); }} className="min-h-11 text-sm font-semibold underline gc-disabled-control">{t("Saved conversation context")}</button>
            {memoryOpen ? <div className="space-y-3 text-sm">
              <p>{t("Save business topic references and your response language for 30 days. Chat text, customer details and proposed changes are not saved as memory. Current permissions and business facts are checked again when you ask a question.")}</p>
              <p>{t("Saving replaces your previous saved context. Expired context cannot be resumed and is removed by the daily cleanup. Business audit history is retained separately.")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || (!rememberedIds.length && !turns.some(turn => turn.request && (MEMORY_TOOLS as readonly string[]).includes(turn.request.tool)))} onClick={() => void manageMemory("save")} className="min-h-11 rounded-lg border border-border px-3 font-semibold gc-disabled-control">{t("Save this context for 30 days")}</button>
                <button type="button" disabled={busy || !memory} onClick={() => void manageMemory("resume")} className="min-h-11 rounded-lg border border-border px-3 font-semibold gc-disabled-control">{t("Resume saved context")}</button>
                <button type="button" disabled={busy} onClick={() => void manageMemory("delete")} className="min-h-11 rounded-lg border border-border px-3 font-semibold gc-disabled-control">{t("Delete saved context")}</button>
              </div>
              {memory ? <p>{t("Saved context expires: {value0}", {value0:new Date(memory.expires_at).toLocaleDateString(locale)})}</p> : null}
              {memoryNotice ? <p role="status">{t(memoryNotice)}</p> : null}
              {memoryReference ? <p>{t("Support reference")}: <span data-no-translate>{memoryReference}</span></p> : null}
            </div> : null}
          </section>

          {business?.isOwner ? <fieldset ref={appearanceSection} className="my-3"><legend className="mb-2 text-sm font-semibold">{t("Assistant appearance")}</legend><div className="grid grid-cols-3 gap-2">{Object.entries(ASSISTANT_AVATARS).map(([key, entry]) => <button key={key} type="button" disabled={appearanceBusy} aria-label={t(entry.label)} aria-pressed={avatar === key} onClick={() => void saveAvatar(key as AssistantAvatar)} className={`flex min-h-12 items-center justify-center rounded-xl border text-2xl ${avatar === key ? "border-primary bg-teal/10" : "border-border bg-white"}`}>{entry.symbol}</button>)}</div>{appearanceNotice ? <p role="status" className="mt-2">{t(appearanceNotice)}</p> : null}{appearanceReference ? <p className="mt-1">{t("Support reference")}: <span data-no-translate>{appearanceReference}</span></p> : null}</fieldset> : null}
          </details>
          <nav aria-label={t("Suggested Assistant actions")} className="mt-2 grid gap-2">
            {quickActions.map(action => <button key={action.label} data-assistant-tool={action.tool} disabled={busy} onClick={() => void submit(action.tool, false, undefined, action.prompt ? t(action.prompt) : undefined)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-primary/10 bg-teal/5 px-3 text-left text-xs font-semibold text-text-primary transition hover:border-teal gc-disabled-control"><Sparkles aria-hidden size={15}/>{t(action.label)}</button>)}
          </nav>

          <div className="mt-5 space-y-5">
            {turns.map(turn => {
              const turnLocale = turn.locale || locale;
              const fallback = turn.request?.risk_class === 1 ? presentAssistantResult(turn.request.tool, turn.request.result, turnLocale) : null;
              const responseText = turn.request?.confirmed_at ? "" : turn.assistant_message || turn.reply || turn.clarification || fallback?.message || (turn.request?.risk_class && turn.request.risk_class >= 3 ? presentPreparedAssistantAction(turn.request.tool, turnLocale) : "");
              const suggestions = turn.suggestions || fallback?.suggestions || [];
              return <article key={turn.id} className="space-y-3">
                {turn.text ? <div className="flex justify-end"><p data-no-translate className="max-w-[86%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary-hover px-4 py-3 text-sm font-medium leading-6 text-white shadow-sm">{turn.text}</p></div> : null}
                {turn.error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-text-danger"><p role="status">{t(turn.error)}</p>{turn.alternatives?.length ? <section aria-label={t("Available alternatives")} className="mt-3 rounded-lg bg-white p-3 text-text-primary"><p className="font-semibold">{t("These times fit the full service. Choose one to review; nothing has been saved.")}</p><ul className="mt-2 space-y-2">{turn.alternatives.map((option,index)=><li key={index} className="rounded-lg border border-border p-2"><p data-no-translate>{new Intl.DateTimeFormat(turnLocale,{dateStyle:"medium",timeStyle:"short",timeZone:option.time_zone}).format(new Date(option.start))} · {option.professional_name} · {option.service_name}</p><p>{t("Duration (minutes)")}: {option.duration_minutes} · {t("Buffer (minutes)")}: {option.buffer_minutes}</p></li>)}</ul></section> : null}{turn.errorReference ? <p className="mt-1 break-words text-xs">{t("Support reference")}: <span data-no-translate>{turn.errorReference}</span></p> : null}<button type="button" disabled={busy} onClick={() => void submit(undefined, false, turn)} className="mt-2 min-h-11 rounded-lg border border-border bg-white px-3 font-semibold text-text-primary gc-disabled-control">{t("Retry message")}</button></div> : null}
                {responseText || turn.navigate ? <div className="flex items-start gap-3"><Avatar value={avatar} small/><div className="max-w-[88%] rounded-2xl rounded-tl-md border border-border bg-white px-4 py-3 shadow-[0_4px_16px_rgba(13,17,20,.04)]">
                  {responseText ? <><p role={turn.request?.risk_class === 1 || !turn.request ? "status" : undefined} data-no-translate className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-text-primary">{responseText}</p><AssistantSpeech text={responseText} sessionKey={dictationSession} language={turn.assistant_message || turn.reply || turn.clarification ? turn.locale : locale} showExplanation={false}/></> : null}
                  {turn.navigate && destinations[turn.navigate] ? <Link className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary-hover px-4 text-xs font-bold text-white" href={destinations[turn.navigate][1]} onClick={() => { if (!desktop) dialog.current?.close(); }}>{t("Open {value0}", { value0: t(destinations[turn.navigate][0]) })}</Link> : null}
                </div></div> : null}

                {turn.request?.tool==="get_business_media" && business && (business.isOwner || business.permissions?.photos) && turn.id===turns.filter(item=>item.request?.tool==="get_business_media").at(-1)?.id ? <AssistantPhotoUpload key={business.id} businessId={business.id} locale={turnLocale} disabled={busy} onReady={(url,prompt)=>void submit("prepare_photo_change",false,undefined,prompt,{operation:"photo_add",record_id:null,changes_json:JSON.stringify({url})})}/> : null}
                {turn.request?.tool === "get_earnings_summary" ? <AssistantFinanceReport value={turn.request.result} locale={turnLocale}/> : null}
                {turn.request?.tool === "get_outstanding_balances" ? <AssistantBalances value={turn.request.result} onNavigate={() => { if (!desktop) dialog.current?.close(); }}/> : null}
                {turn.task_switch_required?<section className="rounded-xl border border-border bg-white p-3 text-sm"><p>{t("There is an unfinished task. End it before moving to this request?")}</p><button type="button" disabled={busy} onClick={()=>void endTask(turn)} className="min-h-11 rounded-lg bg-primary px-3 text-white">{t("End task and continue")}</button><button type="button" disabled={busy} onClick={()=>setTurns(previous=>previous.map(item=>item.id===turn.id?{...item,task_switch_required:false,notice:"The current task is still active."}:item))} className="min-h-11 px-3 underline">{t("Keep current task")}</button></section>:null}
                {turn.request?.risk_class && turn.request.risk_class >= 3 && !turn.request.confirmed_at && !turn.abandoned ? <section className="ml-0 rounded-2xl border border-border bg-white p-4 shadow-[0_6px_20px_rgba(13,17,20,.05)] sm:ml-11">
                  <h3 className="text-base font-bold text-text-primary">{t("Review this draft")}</h3>
                  {turn.request.tool === "prepare_professional_archive" ? <p className="mt-2 text-sm leading-6 text-text-primary">{t("This removes the professional from booking and disables their staff access. Booking and finance history are preserved.")}</p> : null}
                  {turn.request.tool === "prepare_manual_service_sale" ? <p className="mt-2 text-sm leading-6 text-text-primary">{t("This records payment you already received in Finances. Girlz Culture will not charge the client, send a receipt or create an appointment.")}</p> : null}
                  {turn.request.tool === "prepare_service" ? <p className="mt-2 text-sm leading-6 text-text-primary">{t("This service will be saved as a draft. Deposits follow platform rules.")}</p> : null}
                  {turn.request.tool === "prepare_business_profile_update" && ["tiktok_url", "instagram_url"].includes(String(turn.request.arguments.field)) ? <p className="mt-2 text-sm leading-6 text-text-primary">{t("This social link will be submitted for platform review.")}</p> : null}
                  <div className="mt-4 rounded-xl bg-subtle p-4 text-text-primary">{turn.request.tool==="prepare_team_controls"?<AssistantTeamPreview value={turn.request.execution_payload} locale={turnLocale}/>:turn.request.tool==="prepare_business_controls"?<AssistantControlsPreview value={turn.request.execution_payload} locale={turnLocale}/>:isCatalogTool(turn.request.tool)? <AssistantCatalogPreview value={turn.request.execution_payload} locale={turnLocale}/> : ["prepare_booking_progress","prepare_stock_change","prepare_photo_change","prepare_client_card_change","prepare_review_reply"].includes(turn.request.tool) ? <AssistantOperationPreview value={turn.request.execution_payload} locale={turnLocale}/> : turn.request.tool === "prepare_finance_record" ? <AssistantFinancePreview value={turn.request.execution_payload} locale={turnLocale}/> : turn.request.tool === "prepare_booking_reschedule_proposal" ? <AssistantReschedulePreview value={turn.request.execution_payload} locale={turnLocale}/> : <Facts value={{ ...turn.request.arguments, ...turn.request.execution_payload }}/>}</div>
                  {Object.keys(turn.request.before_summary).length ? <details className="mt-3 rounded-xl border border-border px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-text-primary">{t("Current information")}</summary><div className="border-t border-border py-3"><Facts value={turn.request.before_summary} timeZone={String(turn.request.execution_payload.time_zone || turn.request.arguments.time_zone || "America/New_York")}/></div></details> : null}
                  {turn.request.tool === "prepare_business_policy_update" ? <label className="mt-4 flex gap-3 text-sm font-medium leading-5 text-text-primary"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-teal" checked={Boolean(reviewed[turn.id])} onChange={event => setReviewed({ ...reviewed, [turn.id]: event.target.checked })}/>{t("I reviewed this policy in its original language and understand that platform rules and legal rights take precedence.")}</label> : null}
                  {/* Keep foreground and background changes immediate so an enabled action stays readable throughout the state change. */}
                  <button disabled={busy || (turn.request.tool === "prepare_business_policy_update" && !reviewed[turn.id])} onClick={() => void confirm(turn)} className="mt-4 min-h-11 rounded-full bg-primary-hover px-5 text-sm font-bold text-white shadow-sm transition-shadow hover:bg-primary-hover gc-disabled-control">{turn.request.tool === "prepare_finance_record" ? <span data-no-translate>{assistantFinanceCopy(turnLocale).confirm}</span> : turn.request.tool === "prepare_booking_reschedule_proposal" ? <span data-no-translate>{rescheduleAssistantCopy(turnLocale).confirm}</span> : t(turn.request.tool === "prepare_manual_service_sale" ? "Record received payment" : ["prepare_team_controls","prepare_business_controls","prepare_service_change","prepare_professional_change","prepare_product_change","prepare_promotion_change","prepare_professional_archive","prepare_booking_progress","prepare_stock_change","prepare_photo_change","prepare_client_card_change","prepare_review_reply"].includes(turn.request.tool) ? "Confirm this change" : turn.request.risk_class === 4 ? "Confirm this public action" : "Confirm this change")}</button>
                </section> : null}

                {turn.notice ? <p role="status" className="ml-11 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-text-success">{turn.request?.tool === "prepare_finance_record" ? <span data-no-translate>{assistantFinanceCopy(turnLocale).saved}</span> : turn.request?.tool === "prepare_booking_reschedule_proposal" ? <span data-no-translate>{rescheduleAssistantCopy(turnLocale)[String((turn.request.result as Row)?.status).toLowerCase() === "accepted" ? "accepted" : String((turn.request.result as Row)?.status).toLowerCase() === "pending" ? "pending" : "closed"]}</span> : t(turn.notice)}</p> : null}
                {suggestions.length ? <div className="ml-11 flex flex-wrap gap-2">{suggestions.slice(0, 3).map(suggestion => <button key={suggestion} type="button" onClick={() => setText(t(suggestion))} className="min-h-9 rounded-full border border-border bg-white px-3 text-xs font-semibold text-text-primary hover:border-teal">{t(suggestion)}</button>)}</div> : null}
              </article>;
            })}
            {busy ? <div className="flex items-start gap-3" aria-label={t("GC Assistant is working")}><Avatar value={avatar} small/><div className="flex h-11 items-center gap-1 rounded-2xl rounded-tl-md border border-border bg-white px-4"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink [animation-delay:120ms]"/><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink [animation-delay:240ms]"/></div></div> : null}
            {notice ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-5 text-text-danger"><p role="status" aria-label={t("GC Assistant status")}>{t(notice)}</p>{reference ? <p className="mt-1 break-words text-xs font-medium">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}</div> : <p role="status" aria-label={t("GC Assistant status")} className="sr-only">{t(busy ? "Working…" : "Ready")}</p>}
            <div ref={conversationEnd}/>
          </div>
        </div>

        <form className="shrink-0 border-t border-border bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))]" onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="gc-assistant-input" className="sr-only">{t("What would you like help with?")}</label>
          <div className="rounded-[22px] border border-border bg-white px-3 py-2 shadow-[0_6px_24px_rgba(13,17,20,.08)] focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/15">
            <textarea id="gc-assistant-input" data-no-translate rows={1} maxLength={2400} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={t("Message GC Assistant")} className="block max-h-36 min-h-11 w-full resize-y bg-transparent px-1 py-2 text-[15px] font-medium leading-6 text-text-primary outline-none placeholder:text-text-secondary"/>
            <div className="flex items-center justify-between gap-2"><p className="pl-1 text-[11px] text-text-secondary">{t("Review changes before saving.")}</p><div className="flex items-center gap-1"><AssistantDictation key={`${locale}:${dictationSession}`} sessionKey={dictationSession} disabled={busy} value={text} onChange={setText}/><button disabled={busy || !text.trim()} aria-label={t("Ask GC Assistant")} title={t("Ask GC Assistant")} className="grid h-11 w-11 place-items-center rounded-full bg-primary-hover text-white shadow-sm transition hover:bg-primary-hover gc-disabled-control"><ArrowUp aria-hidden size={19}/></button></div></div>
          </div>
        </form>
      </div>
    </dialog>
  </AssistantOpenContext.Provider></AssistantBusinessBinding.Provider>;
}
