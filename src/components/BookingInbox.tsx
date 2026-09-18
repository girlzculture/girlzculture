/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import BookingPriceEvidence from "@/components/booking/BookingPriceEvidence";
import BookingAttendance from "@/components/booking/BookingAttendance";
import CommunicationPreferences from "@/components/booking/CommunicationPreferences";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { bookingConversationWindow, conversationUnread } from "@/lib/bookingConversation";
import { Languages, MessageSquare, Send } from "lucide-react";
import { getSessionForScope, getSupabaseForScope, type AuthScope } from "@/lib/supabase";
import MessageDisplay from "@/components/booking/MessageDisplay";
import BookingWelcome from "@/components/booking/BookingWelcome";
import BookingPolicyEvidence from "@/components/booking/BookingPolicyEvidence";
import { translationProviderFailure } from "@/lib/translationProviderErrors";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { LOCALE_NAMES } from "@/i18n/catalog";
import { bookingReference } from "@/lib/bookingReference";
import { OwnerActionError, readOwnerResponse } from "@/lib/ownerActionError";

type Row = Record<string, any>;
type Thread = { booking: Row; messages: Row[] };
type TranslationPreview = {
  original: string;
  translated: string;
  locale: string;
  provider: string;
};

function bookingLabel(booking: Row) {
  return booking.style?.name || booking.salon?.name || booking.guest_name || "Booking conversation";
}

export default function BookingInbox({ scope, initialBookingId = "", focused = false }: { scope: AuthScope; initialBookingId?: string; focused?: boolean }) {
  const { locale, formatDate, translateSource: t } = useI18n();
  const params = useSearchParams();
  const drafts = useRef(new Map<string, { text: string; locale: string }>());
  const [conversationLoading, setConversationLoading] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const query = params.get("messageSearch") || "";
  const filter = params.get("messageView") || "all";
  const mobileConversation = focused || Boolean(initialBookingId) || Boolean(params.get("conversation"));
  function updateInbox(values: Record<string, string>, push = false) {
    const next = new URLSearchParams(window.location.search);
    Object.entries(values).forEach(([key,value]) => value ? next.set(key,value) : next.delete(key));
    window.history[push ? "pushState" : "replaceState"](null,"",window.location.pathname+"?"+next);
  }
  const [welcome, setWelcome] = useState<Row | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState(initialBookingId);
  const [messages, setMessages] = useState<Row[]>([]);
  const [role, setRole] = useState("");
  const [messageLocale, setMessageLocale] = useState<string>(locale);
  const currentLocale = useRef(locale);
  useEffect(() => { currentLocale.current = locale; }, [locale]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendAttempt = useRef<{ bookingId: string; body: string; sourceLocale: string; id: string } | null>(null);
  const conversationGeneration = useRef(0);
  const actor = useRef<string | null>(null);
  const actorGeneration = useRef(0);
  const [actorId, setActorId] = useState<string | null | undefined>(undefined);
  const draftGeneration = useRef(0);
  const previewGeneration = useRef(0);
  const operation = useRef(0);
  const busy = useRef(false);
  function showFailure(error: unknown, fallback: string) {
    const messages: Record<string, string> = { AUTH_REQUIRED: "Please sign in again to view messages.", MESSAGE_ACCESS_DENIED: "You do not have access to this booking conversation.", MESSAGE_NOT_FOUND: "This booking conversation is unavailable.", MESSAGE_RATE_LIMIT: "Too many requests. Please try again shortly.", MESSAGE_CONTENT_REVIEW_REQUIRED: "Please revise the message to remove abusive, hateful, threatening, or unsafe language.", MESSAGE_INVALID: "Enter a message of up to 2,000 characters.", MESSAGE_CONVERSATION_CLOSED: "This conversation is closed. Its history is still available.", MESSAGE_CUSTOMER_PARTICIPANT_REQUIRED: "This appointment has no customer account participant." };
    setReference(error instanceof OwnerActionError ? error.reference : "");
    setNotice(error instanceof OwnerActionError ? messages[error.code] || translationProviderFailure(error)?.error || fallback : fallback);
  }
  const [targetLocale, setTargetLocale] = useState("fr");
  const [translationPreview, setTranslationPreview] =
    useState<TranslationPreview | null>(null);

  async function authHeaders(generation: number) {
    const session = await getSessionForScope(scope);
    if (!session || generation !== actorGeneration.current || session.user.id !== actor.current) throw new OwnerActionError("AUTH_REQUIRED");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function loadThreads(generation: number) {
    const headers = await authHeaders(generation);
    const response = await fetch("/api/messages", { headers, cache: "no-store" });
    const body = await readOwnerResponse(response, "MESSAGE_UNAVAILABLE");
    if (generation !== actorGeneration.current) return;
    const next = Array.isArray(body.threads) ? body.threads : [];
    setThreads(next);
    setRole(body.role || "");
    setSelectedId((current) => current || initialBookingId || params.get("conversation") || (window.innerWidth >= 1024 ? next[0]?.booking?.id || "" : ""));
  }

  async function loadConversation(bookingId: string, identity: number) {
    const generation = ++conversationGeneration.current;
    if (!bookingId) { setMessages([]); return; }
    const headers = await authHeaders(identity);
    const response = await fetch(`/api/messages?booking_id=${encodeURIComponent(bookingId)}`, { headers, cache: "no-store" });
    const body = await readOwnerResponse(response, "MESSAGE_UNAVAILABLE");
    if (generation !== conversationGeneration.current || identity !== actorGeneration.current) return;
    setClock(Date.now());
    setMessages(Array.isArray(body.messages) ? body.messages : []);
    setWelcome(body.welcome?.facts || null);
    setThreads(current => current.some(thread => thread.booking.id === bookingId)
      ? current.map(thread => thread.booking.id === bookingId ? { ...thread, booking: body.booking, messages: [...(body.messages || [])].reverse() } : thread)
      : [{ booking: body.booking, messages: body.messages || [] }, ...current]);
    setRole(body.role || "");
  }

  useEffect(() => {
    const subscription = getSupabaseForScope(scope).auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (nextActor !== actor.current) {
        actorGeneration.current++; conversationGeneration.current++; operation.current++;
        draftGeneration.current++; previewGeneration.current++; actor.current = nextActor; busy.current = false;
        drafts.current.clear(); setThreads([]); setMessages([]); setWelcome(null); setRole(""); setSelectedId("");
        setDraft(""); setMessageLocale(currentLocale.current); setTranslationPreview(null); sendAttempt.current = null;
        setNotice(""); setReference(""); setSending(false); setLoading(Boolean(nextActor));
      }
      setActorId(nextActor);
    });
    // Invalidate pending operations using the latest counters, not mount-time values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { actorGeneration.current++; conversationGeneration.current++; subscription.data.subscription.unsubscribe(); };
  }, [scope]);

  useEffect(() => {
    if (actorId === undefined) return;
    const generation = actorGeneration.current;
    if (!actorId) { setLoading(false); showFailure(new OwnerActionError("AUTH_REQUIRED"), "Unable to load messages."); return; }
    // Run outside the auth callback so session lookup cannot block its lock.
    let live = true;
    void loadThreads(generation).catch(error => { if (live && generation === actorGeneration.current) showFailure(error, "Unable to load messages."); }).finally(() => { if (live && generation === actorGeneration.current) setLoading(false); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, scope]);

  useEffect(() => {
    if (actorId && (initialBookingId || params.get("conversation"))) setSelectedId(initialBookingId || params.get("conversation") || "");
  }, [actorId, initialBookingId, params]);

  useEffect(() => {
    draftGeneration.current++; previewGeneration.current++;
    const retained = drafts.current.get(selectedId);
    setDraft(retained?.text || ""); setMessageLocale(retained?.locale || currentLocale.current); setTranslationPreview(null); sendAttempt.current = null;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !actorId) return;
    setMessages([]); setWelcome(null); setConversationLoading(true);
    const identity = actorGeneration.current;
    let live = true;
    void loadConversation(selectedId, identity).catch(error => { if (live && identity === actorGeneration.current) showFailure(error, "Unable to load this conversation."); }).finally(() => { if(live && identity===actorGeneration.current) setConversationLoading(false); });
    // Invalidate the latest request when the selected conversation is left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { live = false; conversationGeneration.current++; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, actorId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !selectedId || !draft.trim()) return;
    if (sendAttempt.current?.bookingId !== selectedId || sendAttempt.current?.body !== draft || sendAttempt.current?.sourceLocale !== messageLocale) sendAttempt.current = { bookingId: selectedId, body: draft, sourceLocale: messageLocale, id: crypto.randomUUID() };
    const identity = actorGeneration.current;
    const conversation = conversationGeneration.current;
    const revision = draftGeneration.current;
    const currentOperation = ++operation.current;
    const requestId = sendAttempt.current.id;
    busy.current = true; setSending(true);
    setNotice("");
    setReference("");
    try {
      const headers = await authHeaders(identity);
      if (conversation !== conversationGeneration.current) return;
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: selectedId,
          body: draft,
          client_request_id: requestId,
          source_locale: messageLocale === "unknown" ? null : messageLocale,
          translated_body:
            translationPreview?.original === draft
              ? translationPreview.translated
              : undefined,
          translation_locale:
            translationPreview?.original === draft
              ? translationPreview.locale
              : undefined,
          translation_provider:
            translationPreview?.original === draft
              ? translationPreview.provider
              : undefined,
          translation_previewed: translationPreview?.original === draft,
        }),
      });
      const body = await readOwnerResponse(response, "MESSAGE_UNAVAILABLE");
      if (identity !== actorGeneration.current || conversation !== conversationGeneration.current) return;
        if (revision === draftGeneration.current) { drafts.current.delete(selectedId); setDraft(""); sendAttempt.current = null; setTranslationPreview(null); }
      await loadConversation(selectedId, identity);
      await loadThreads(identity);
      if (identity !== actorGeneration.current) return;
      if (body.warnings?.length) { setNotice("The message was saved, but a notification could not be delivered."); setReference(body.warnings[0].request_id || ""); }
    } catch (error) {
      if (identity === actorGeneration.current) showFailure(error, "Unable to send message.");
    } finally { if (identity === actorGeneration.current && currentOperation === operation.current) { busy.current = false; setSending(false); } }
  }

  async function previewTranslation() {
    if (busy.current || !selectedId || !draft.trim()) return;
    const identity = actorGeneration.current;
    const conversation = conversationGeneration.current;
    const revision = ++previewGeneration.current;
    const currentOperation = ++operation.current;
    busy.current = true; setSending(true);
    setNotice("");
    try {
      const headers = await authHeaders(identity);
      if (conversation !== conversationGeneration.current || revision !== previewGeneration.current) return;
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "translate_preview",
          booking_id: selectedId,
          body: draft,
          target_locale: targetLocale,
        }),
      });
      const body = await readOwnerResponse(response, "MESSAGE_UNAVAILABLE");
      if (identity !== actorGeneration.current || conversation !== conversationGeneration.current || revision !== previewGeneration.current) return;
      setTranslationPreview(body.preview || null);
    } catch (error) {
      if (identity === actorGeneration.current && revision === previewGeneration.current) {
        setTranslationPreview(null); showFailure(error, "Unable to preview this translation.");
      }
    } finally {
      if (identity === actorGeneration.current && currentOperation === operation.current) { busy.current = false; setSending(false); }
    }
  }

  const selected = threads.find(thread => thread.booking.id === selectedId);
  const windowState = bookingConversationWindow(selected?.booking || {}, clock);
  useEffect(() => {
    if (!windowState.open || !windowState.closesAt) return;
    // Refresh at the deadline, not on an arbitrary polling interval.
    const delay = Math.min(2_147_483_647, Math.max(0, Date.parse(windowState.closesAt) - clock));
    const timer = setTimeout(() => setClock(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [windowState.open, windowState.closesAt, clock]);
  const visibleThreads = threads.filter(thread => {
    const open = bookingConversationWindow(thread.booking, clock).open;
    if (filter === "unread" && !conversationUnread(thread.messages, role)) return false;
    if (filter === "active" && !open || filter === "closed" && open) return false;
    return [bookingLabel(thread.booking), thread.booking.guest_name, bookingReference(thread.booking), ...thread.messages.map(message => message.original_body || message.body)].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase());
  });
  function editDraft(value: string) {
    draftGeneration.current++; previewGeneration.current++;
    setDraft(value); setTranslationPreview(null); drafts.current.set(selectedId, {text:value,locale:messageLocale});
  }
  if (loading) return <p role="status" className="p-8 text-center">{t("Loading booking messages…")}</p>;
  const failure = notice ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm gc-text-danger"><p>{t(notice)}</p>{reference ? <p>{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}<button type="button" onClick={() => { setNotice(""); void loadThreads(actorGeneration.current).catch(error => showFailure(error,"Unable to load messages.")); }} className="mt-2 min-h-11 rounded-lg border px-4">{t("Refresh conversations")}</button></div> : null;
  return <section aria-label={t("Messages workspace")} className="min-w-0 space-y-4">
    <header><h1 className="font-serif text-3xl text-plum">{t("Messages")}</h1><p className="mt-1 text-sm gc-text-secondary">{t("Connect with clients and keep appointment conversations together.")}</p></header>
    {failure}
    {!threads.length ? <div className="rounded-2xl border bg-white p-8 text-center"><MessageSquare className="mx-auto text-magenta"/><h2 className="mt-4 font-serif text-xl">{t("No booking conversations yet")}</h2><p className="mt-2 text-sm gc-text-secondary">{t("A conversation becomes available after a real appointment is booked.")}</p></div> :
    <div className={`grid min-w-0 overflow-hidden rounded-2xl border border-plum/10 bg-white ${focused ? "" : "lg:grid-cols-[minmax(240px,30%)_minmax(0,1fr)]"}`}>
      {!focused && <aside className={`min-w-0 border-plum/10 lg:border-r ${mobileConversation ? "hidden lg:block" : ""}`}>
        <div className="space-y-3 border-b p-4"><div className="flex flex-wrap gap-1" aria-label={t("Inbox categories")}>{[["all","All"],["unread","Unread"],["active","Active conversations"],["closed","Closed conversations"]].map(([key,label]) => <button key={key} type="button" aria-pressed={filter===key} onClick={() => updateInbox({messageView:key})} className={`min-h-11 rounded-lg px-3 text-xs ${filter===key ? "bg-magenta text-white" : "bg-slate-50 text-plum"}`}>{t(label)}{key==="unread" ? ` (${threads.reduce((sum,thread)=>sum+conversationUnread(thread.messages,role),0)})` : ""}</button>)}</div>
          <label className="block text-xs">{t("Search conversations")}<input value={query} onChange={event => updateInbox({messageSearch:event.target.value})} className="mt-1 min-h-11 w-full rounded-lg border px-3"/></label>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto">{visibleThreads.map(thread => {
          const latest=thread.messages[0]; const unread=conversationUnread(thread.messages,role); const open=bookingConversationWindow(thread.booking,clock).open;
          return <button key={thread.booking.id} type="button" disabled={sending} aria-pressed={selectedId===thread.booking.id} onClick={() => { setNotice(""); setReference(""); setSelectedId(thread.booking.id); updateInbox({conversation:thread.booking.id},true); }} className={`w-full border-b p-4 text-left ${selectedId===thread.booking.id ? "border-l-4 border-l-magenta bg-sky-50" : "hover:bg-slate-50"}`}>
            <span className="flex justify-between gap-3"><b className="text-sm" data-no-translate>{role==="customer" ? thread.booking.salon?.name : thread.booking.guest_name || bookingReference(thread.booking)}</b>{unread>0 && <span aria-label={t("Unread messages")} className="rounded-full bg-magenta px-2 text-xs text-white">{unread}</span>}</span>
            <span className="mt-1 block text-xs gc-text-secondary" data-no-translate>{bookingLabel(thread.booking)} · {bookingReference(thread.booking)}</span>
            <span className="mt-2 line-clamp-2 text-sm" data-no-translate>{latest?.original_body || latest?.body || t("Start a conversation about this booking.")}</span>
            <span className="mt-2 flex justify-between gap-2 text-xs gc-text-muted"><span>{formatDate(thread.booking.appointment_datetime,{dateStyle:"medium",timeZone:thread.booking.salon?.time_zone||"America/New_York"})}</span><span>{t(open ? "Active" : "Closed")}</span></span>
          </button>;
        })}{!visibleThreads.length && <p className="p-6 text-sm gc-text-secondary">{t("No conversations match these filters.")}</p>}</div>
      </aside>}
      {selected && <div className={`min-w-0 flex-col ${!mobileConversation ? "hidden lg:flex" : "flex"}`}>
        <header className="border-b border-slate-200 p-4">
          {focused ? <Link href={scope==="salon" ? `/salon/dashboard/messages?${new URLSearchParams(Object.fromEntries([...params].filter(([key])=>key!=="conversation")))}` : scope==="admin" ? "/admin/bookings" : "/account?tab=inbox"} className="mb-2 inline-flex min-h-11 items-center text-sm text-magenta">{t("Back to conversations")}</Link> : <button type="button" onClick={() => updateInbox({conversation:""},true)} className="mb-2 min-h-11 text-sm text-magenta lg:hidden">{t("Back to conversations")}</button>}
          <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl" data-no-translate>{role==="customer" ? selected.booking.salon?.name : selected.booking.guest_name || bookingReference(selected.booking)}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{t(windowState.open ? "Active" : "Closed")}</span></div>
          <p className="mt-1 text-xs gc-text-secondary"><span data-no-translate>{bookingLabel(selected.booking)} · {bookingReference(selected.booking)}</span> · {formatDate(selected.booking.appointment_datetime,{dateStyle:"medium",timeStyle:"short",timeZone:selected.booking.salon?.time_zone||"America/New_York"})}</p>
          <details className="mt-3 rounded-xl border border-slate-200 p-3" open={scope!=="salon" || undefined}><summary className="cursor-pointer text-sm font-semibold">{t("Booking and customer context")}</summary><div className="mt-3 space-y-3">{welcome && <BookingWelcome facts={welcome}/>}<BookingPriceEvidence booking={selected.booking}/><BookingPolicyEvidence booking={selected.booking}/>{scope==="salon" && <Link href={`/salon/dashboard/bookings/${selectedId}`} className="inline-flex min-h-11 items-center text-sm text-magenta">{t("View booking")}</Link>}{scope==="customer" && <><BookingAttendance key={`${actorId}:${selectedId}`} bookingId={selectedId} scope="customer"/><CommunicationPreferences key={`communications:${actorId}:${selectedId}`} bookingId={selectedId}/></>}</div></details>
        </header>
        <div aria-label={t("Conversation history")} className="max-h-[55dvh] min-h-36 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
          {conversationLoading ? <p role="status">{t("Loading booking messages…")}</p> : messages.map((message,index) => <article key={message.id} className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm sm:max-w-[82%] ${message.sender_role===role ? "ml-auto bg-plum text-white" : "border border-slate-200 bg-white text-ink"}`}><MessageDisplay messageId={message.id} bookingId={selectedId} original={message.original_body||message.body} scope={scope} autoTranslate={index>=messages.length-5}/><small className={`mt-2 block text-xs ${message.sender_role===role ? "gc-text-on-dark-muted" : "gc-text-muted"}`}>{t(message.sender_role==="customer"?"Customer":message.sender_role==="salon"?"Business":"Girlz Culture Support")} · {formatDate(message.created_at,{dateStyle:"medium",timeStyle:"short"})}</small></article>)}
          {!conversationLoading && !messages.length && <p className="py-8 text-center text-sm gc-text-secondary">{t("No messages yet. Ask a question about this appointment.")}</p>}
        </div>
        <div className="border-t border-slate-200 p-4 text-xs gc-text-secondary"><p>{t(windowState.open ? "Replies close 24 hours after the appointment ends. A confirmed reschedule updates the deadline; cancellation closes replies immediately." : "This conversation is closed. Its history is still available.")}</p>{windowState.closesAt && windowState.reason!=="cancelled" && <p className="mt-1">{t("Conversation deadline")}: {formatDate(windowState.closesAt,{dateStyle:"medium",timeStyle:"short",timeZone:selected.booking.salon?.time_zone||"America/New_York"})}</p>}</div>
        {scope!=="admin" && windowState.open && <form onSubmit={send} className="space-y-3 border-t p-4">
          <label className="block text-xs">{t("Message language")}<select value={messageLocale} onChange={event => { previewGeneration.current++; setTranslationPreview(null); setMessageLocale(event.target.value); drafts.current.set(selectedId,{text:draft,locale:event.target.value}); }} className="ml-2 min-h-11 rounded-lg border bg-white px-2">{["en","fr","es","zh-CN"].map(code=><option key={code} value={code} data-no-translate>{LOCALE_NAMES[code]}</option>)}<option value="unknown">{t("Mixed or unknown language")}</option></select></label>
          <label htmlFor="booking-message" className="sr-only">{t("Message")}</label><div className="flex gap-2"><textarea id="booking-message" value={draft} disabled={conversationLoading} onChange={event => editDraft(event.target.value.slice(0,2000))} rows={3} placeholder={t("Type a private booking message…")} className="min-w-0 flex-1 resize-y rounded-xl border p-3 text-sm"/><button disabled={sending||conversationLoading||!draft.trim()} className="grid min-h-11 w-12 shrink-0 place-items-center rounded-xl bg-magenta text-white gc-disabled-control" aria-label={t(translationPreview ? "Send original and previewed translation" : "Send message")}><Send size={19}/></button></div>
          <details><summary className="cursor-pointer text-sm text-magenta">{t("Preview translation")}</summary><div className="mt-2 flex flex-wrap items-center gap-2"><select value={targetLocale} onChange={event => {previewGeneration.current++;setTargetLocale(event.target.value);setTranslationPreview(null);}} aria-label={t("Translation language")} className="min-h-11 rounded-lg border bg-white px-2 text-sm">{["en","fr","es","zh-CN"].map(code=><option key={code} value={code} data-no-translate>{LOCALE_NAMES[code]}</option>)}</select><button type="button" disabled={sending||conversationLoading||!draft.trim()} onClick={() => void previewTranslation()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm gc-disabled-control"><Languages size={16}/>{t("Preview translation")}</button><p className="text-xs gc-text-secondary">{t("The original is always preserved. Nothing translated is sent until you preview and press Send.")}</p></div></details>
          {translationPreview?.original===draft && <div className="grid gap-3 rounded-xl border bg-sky-50 p-3 sm:grid-cols-2"><div><b className="text-xs">{t("Original")}</b><p data-no-translate className="mt-1 whitespace-pre-wrap text-sm">{translationPreview.original}</p></div><div><b className="text-xs">{t("Translation preview")} · {translationPreview.locale}</b><p data-no-translate className="mt-1 whitespace-pre-wrap text-sm">{translationPreview.translated}</p></div></div>}
        </form>}
        {scope==="admin" && <p className="border-t p-4 text-center text-sm gc-text-secondary">{t("Admin read-only view for support and safety.")}</p>}
      </div>}
    </div>}
  </section>;
}
