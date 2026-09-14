/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Languages, MessageSquare, Send } from "lucide-react";
import { getSessionForScope, getSupabaseForScope, type AuthScope } from "@/lib/supabase";
import MessageDisplay from "@/components/booking/MessageDisplay";
import BookingWelcome from "@/components/booking/BookingWelcome";
import BookingPolicyEvidence from "@/components/booking/BookingPolicyEvidence";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { LOCALE_NAMES } from "@/i18n/catalog";
import { bookingReference } from "@/lib/bookingReference";
import { OwnerActionError, ownerResponseError } from "@/lib/ownerActionError";

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
    const messages: Record<string, string> = { AUTH_REQUIRED: "Please sign in again to view messages.", MESSAGE_ACCESS_DENIED: "You do not have access to this booking conversation.", MESSAGE_NOT_FOUND: "This booking conversation is unavailable.", MESSAGE_RATE_LIMIT: "Too many requests. Please try again shortly.", MESSAGE_CONTENT_REVIEW_REQUIRED: "Please revise the message to remove abusive, hateful, threatening, or unsafe language.", MESSAGE_INVALID: "Enter a message of up to 2,000 characters." };
    setReference(error instanceof OwnerActionError ? error.reference : "");
    setNotice(error instanceof OwnerActionError ? messages[error.code] || fallback : fallback);
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
    const body = await response.json();
    if (generation !== actorGeneration.current) return;
    if (!response.ok) throw ownerResponseError(body, "MESSAGE_UNAVAILABLE");
    const next = Array.isArray(body.threads) ? body.threads : [];
    setThreads(next);
    setRole(body.role || "");
    setSelectedId((current) => current || next[0]?.booking?.id || "");
  }

  async function loadConversation(bookingId: string, identity: number) {
    const generation = ++conversationGeneration.current;
    if (!bookingId) { setMessages([]); return; }
    const headers = await authHeaders(identity);
    const response = await fetch(`/api/messages?booking_id=${encodeURIComponent(bookingId)}`, { headers, cache: "no-store" });
    const body = await response.json();
    if (generation !== conversationGeneration.current || identity !== actorGeneration.current) return;
    if (!response.ok) throw ownerResponseError(body, "MESSAGE_UNAVAILABLE");
    setMessages(Array.isArray(body.messages) ? body.messages : []);
    setWelcome(body.welcome?.facts || null);
    setThreads(current => current.some(thread => thread.booking.id === bookingId)
      ? current.map(thread => thread.booking.id === bookingId ? { ...thread, booking: body.booking } : thread)
      : [{ booking: body.booking, messages: body.messages || [] }, ...current]);
    setRole(body.role || "");
  }

  useEffect(() => {
    const subscription = getSupabaseForScope(scope).auth.onAuthStateChange((_event, session) => {
      const nextActor = session?.user.id || null;
      if (nextActor !== actor.current) {
        actorGeneration.current++; conversationGeneration.current++; operation.current++;
        draftGeneration.current++; previewGeneration.current++; actor.current = nextActor; busy.current = false;
        setThreads([]); setMessages([]); setWelcome(null); setRole(""); setSelectedId("");
        setDraft(""); setMessageLocale(currentLocale.current); setTranslationPreview(null); sendAttempt.current = null;
        setNotice(""); setReference(""); setSending(false); setLoading(Boolean(nextActor));
      }
      setActorId(nextActor);
    });
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
    if (actorId && initialBookingId) setSelectedId(initialBookingId);
  }, [actorId, initialBookingId]);

  useEffect(() => {
    draftGeneration.current++; previewGeneration.current++;
    setDraft(""); setTranslationPreview(null); sendAttempt.current = null;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !actorId) return;
    setMessages([]); setWelcome(null);
    const identity = actorGeneration.current;
    let live = true;
    void loadConversation(selectedId, identity).catch(error => { if (live && identity === actorGeneration.current) showFailure(error, "Unable to load this conversation."); });
    return () => { live = false; conversationGeneration.current++; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, locale, actorId]);

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
      const body = await response.json();
      if (identity !== actorGeneration.current || conversation !== conversationGeneration.current) return;
      if (!response.ok) throw ownerResponseError(body, "MESSAGE_UNAVAILABLE");
      if (revision === draftGeneration.current) { setDraft(""); sendAttempt.current = null; setTranslationPreview(null); }
      await Promise.all([loadConversation(selectedId, identity), loadThreads(identity)]);
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
      const body = await response.json();
      if (identity !== actorGeneration.current || conversation !== conversationGeneration.current || revision !== previewGeneration.current) return;
      if (!response.ok)
        throw ownerResponseError(body, "MESSAGE_UNAVAILABLE");
      setTranslationPreview(body.preview || null);
    } catch (error) {
      if (identity === actorGeneration.current && revision === previewGeneration.current) {
        setTranslationPreview(null); showFailure(error, "Unable to preview this translation.");
      }
    } finally {
      if (identity === actorGeneration.current && currentOperation === operation.current) { busy.current = false; setSending(false); }
    }
  }

  if (loading) return <div className="rounded-[18px] border border-plum/10 bg-white p-8 text-center text-sm text-ink/55">Loading booking messages…</div>;
  const failure = notice ? <div role="alert" className="border-t border-red-200 bg-red-50 p-4 text-sm gc-text-danger"><p>{t(notice)}</p>{reference ? <p>{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}<button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded-lg border px-4">{t("Try again")}</button></div> : null;
  if (!threads.length && failure) return failure;
  if (!threads.length) return <div className="rounded-[18px] border border-plum/10 bg-white p-10 text-center"><MessageSquare className="mx-auto text-magenta" /><h2 className="mt-4 font-serif text-2xl text-plum">No booking conversations yet</h2><p className="mt-2 text-sm text-ink/55">A conversation becomes available after a real appointment is booked.</p></div>;

  const selected = threads.find((thread) => thread.booking.id === selectedId);
  if (!selected) return failure || <p role="status" className="p-8 text-sm gc-text-secondary">{t("Loading booking messages…")}</p>;
  return <><div className={focused ? "mb-4" : "hidden"}><Link href={scope === "admin" ? "/admin/bookings" : "/salon/dashboard/messages"} className="inline-flex min-h-11 items-center rounded-lg border border-plum/15 bg-white px-4 text-xs font-bold text-plum">Back to conversations</Link></div><section className={`grid min-h-[610px] overflow-hidden rounded-[18px] border border-plum/10 bg-white ${focused ? "grid-cols-1" : "xl:grid-cols-[330px_1fr]"}`}>
    {!focused ? <aside className="border-b border-plum/10 xl:border-b-0 xl:border-r"><div className="p-5"><h2 className="font-serif text-2xl text-plum">Booking Messages</h2><p className="mt-1 text-[11px] text-ink/55">Private conversations linked to appointments.</p></div><div className="max-h-[545px] overflow-y-auto">{threads.map((thread) => {
      const latest = thread.messages[0];
      return <button key={thread.booking.id} disabled={sending} onClick={() => { if (scope === "salon" && !focused) window.location.assign(`/salon/dashboard/messages/${thread.booking.id}`); else setSelectedId(thread.booking.id); }} className={`w-full border-t border-plum/10 p-4 text-left ${selectedId === thread.booking.id ? "bg-blush/40" : "hover:bg-cream"}`}><span className="flex items-start justify-between gap-2"><b className="font-serif text-base text-plum"><span data-no-translate>{bookingLabel(thread.booking)}</span></b><small className="shrink-0 text-[9px] gc-text-muted">{formatDate(thread.booking.appointment_datetime, { dateStyle: "medium", timeZone: thread.booking.salon?.time_zone || "America/New_York" })}</small></span><span className="mt-1 block text-[10px] text-ink/60"><span data-no-translate>{bookingReference(thread.booking)} · {role === "customer" ? thread.booking.salon?.name : thread.booking.guest_name}</span></span><span className="mt-2 block truncate text-[10px] gc-text-secondary">{latest?.body ? <span data-no-translate>{latest.body}</span> : t("Start a conversation about this booking.")}</span></button>;
    })}</div></aside> : null}
    <div className="flex min-h-[520px] flex-col"><header className="border-b border-plum/10 p-5"><h3 className="font-serif text-xl text-plum"><span data-no-translate>{bookingLabel(selected.booking)}</span></h3><p className="mt-1 text-[11px] text-ink/55"><span data-no-translate>{bookingReference(selected.booking)} · {role === "customer" ? selected.booking.salon?.name : selected.booking.guest_name}</span> · {formatDate(selected.booking.appointment_datetime, { dateStyle: "medium", timeStyle: "short", timeZone: selected.booking.salon?.time_zone || "America/New_York" })}</p></header><div className="flex-1 space-y-3 overflow-y-auto bg-cream/35 p-5">{welcome ? <BookingWelcome facts={welcome}/> : null}<BookingPolicyEvidence booking={selected.booking}/>{messages.map((message, index) => {
      const mine = message.sender_role === role;
      return <article key={message.id} className={`max-w-[82%] rounded-[14px] px-4 py-3 text-sm ${mine ? "ml-auto bg-plum text-white" : "bg-white text-ink shadow-sm"}`}><MessageDisplay messageId={message.id} bookingId={selectedId} original={message.original_body || message.body} scope={scope} autoTranslate={index >= messages.length - 5}/><small className={`mt-2 block text-[9px] ${mine ? "gc-text-on-dark-muted" : "text-ink/40"}`}>{t(message.sender_role === "customer" ? "Customer" : message.sender_role === "salon" ? "Business" : "Girlz Culture Support")} · {formatDate(message.created_at, { dateStyle: "medium", timeStyle: "short" })}</small></article>;
    })}{!messages.length ? <p className="py-20 text-center text-sm gc-text-primary">No messages yet. Ask a question about this appointment.</p> : null}</div>{scope !== "admin" ? <form onSubmit={send} className="border-t border-plum/10 p-4"><label className="sr-only" htmlFor="booking-message">Message</label><label className="mb-2 block text-xs">{t("Message language")}<select value={messageLocale} onChange={event => { previewGeneration.current++; setTranslationPreview(null); setMessageLocale(event.target.value); }} className="ml-2 min-h-11 rounded-lg border bg-white px-2">{["en", "fr", "wo", "es", "zh-CN"].map(code => <option key={code} value={code} data-no-translate>{LOCALE_NAMES[code]}</option>)}<option value="unknown">{t("Mixed or unknown language")}</option></select></label><div className="flex gap-2"><textarea id="booking-message" value={draft} onChange={(event) => { draftGeneration.current++; previewGeneration.current++; setDraft(event.target.value.slice(0, 2000)); setTranslationPreview(null); }} rows={2} placeholder="Type a private booking message…" className="min-w-0 flex-1 resize-none rounded-[10px] border border-plum/15 p-3 text-sm outline-none focus:border-magenta" /><button disabled={sending || !draft.trim()} className="grid w-14 place-items-center rounded-[10px] bg-magenta text-white gc-disabled-control" aria-label={translationPreview ? "Send original and previewed translation" : "Send message"}><Send size={19} /></button></div><div className="mt-2 flex flex-wrap items-center gap-2"><select value={targetLocale} onChange={(event) => { previewGeneration.current++; setTargetLocale(event.target.value); setTranslationPreview(null); }} aria-label="Translation language" className="min-h-9 rounded-lg border border-plum/15 bg-white px-2 text-[10px]"><option value="fr">French</option><option value="es">Spanish</option><option value="wo">Wolof</option><option value="zh-CN">中文（简体）</option><option value="en">English</option></select><button type="button" disabled={sending || !draft.trim()} onClick={() => void previewTranslation()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta gc-disabled-control"><Languages size={13}/>Preview translation</button><span className="text-[9px] gc-text-primary">The original is always preserved. Nothing translated is sent until you preview and press Send.</span></div>{translationPreview?.original === draft ? <div className="mt-3 grid gap-2 rounded-[10px] border border-magenta/20 bg-blush/25 p-3 sm:grid-cols-2"><div><b className="text-[9px] uppercase gc-text-muted">Original</b><p className="mt-1 whitespace-pre-wrap text-xs"><span data-no-translate>{translationPreview.original}</span></p></div><div><b className="text-[9px] uppercase text-magenta">Translation preview · {translationPreview.locale}</b><p className="mt-1 whitespace-pre-wrap text-xs"><span data-no-translate>{translationPreview.translated}</span></p></div></div> : null}</form> : <p className="border-t border-plum/10 p-4 text-center text-xs text-ink/50">Admin read-only view for support and safety.</p>}{notice ? <p className="border-t border-red-200 bg-red-50 p-3 text-xs gc-text-danger">{t(notice)}{reference ? <><br/>{t("Support reference")}: <span data-no-translate>{reference}</span></> : null}</p> : null}</div>
  </section></>;
}
