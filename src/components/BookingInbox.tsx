/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";

import { FormEvent, useEffect, useState } from "react";
import { Languages, MessageSquare, Send } from "lucide-react";
import { getSessionForScope, type AuthScope } from "@/lib/supabase";

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

export default function BookingInbox({ scope }: { scope: AuthScope }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Row[]>([]);
  const [role, setRole] = useState("");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [targetLocale, setTargetLocale] = useState("fr");
  const [translationPreview, setTranslationPreview] =
    useState<TranslationPreview | null>(null);

  async function authHeaders() {
    const session = await getSessionForScope(scope);
    if (!session) throw new Error("Please sign in again to view messages.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function loadThreads() {
    const headers = await authHeaders();
    const response = await fetch("/api/messages", { headers, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load messages.");
    const next = Array.isArray(body.threads) ? body.threads : [];
    setThreads(next);
    setRole(body.role || "");
    setSelectedId((current) => current || next[0]?.booking?.id || "");
  }

  async function loadConversation(bookingId: string) {
    if (!bookingId) { setMessages([]); return; }
    const headers = await authHeaders();
    const response = await fetch(`/api/messages?booking_id=${encodeURIComponent(bookingId)}`, { headers, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load this conversation.");
    setMessages(Array.isArray(body.messages) ? body.messages : []);
    setRole(body.role || "");
  }

  useEffect(() => {
    let live = true;
    void loadThreads().catch((error) => { if (live) setNotice(error instanceof Error ? error.message : "Unable to load messages."); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  // This inbox is mounted for a fixed role scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadConversation(selectedId).catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load this conversation."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setNotice("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: selectedId,
          body: draft,
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
      if (!response.ok) throw new Error(body.error || "Unable to send message.");
      setDraft("");
      setTranslationPreview(null);
      await Promise.all([loadConversation(selectedId), loadThreads()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to send message.");
    } finally { setSending(false); }
  }

  async function previewTranslation() {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setNotice("");
    try {
      const headers = await authHeaders();
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
      if (!response.ok)
        throw new Error(body.error || "Unable to preview this translation.");
      setTranslationPreview(body.preview || null);
    } catch (error) {
      setTranslationPreview(null);
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to preview this translation.",
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="rounded-[18px] border border-plum/10 bg-white p-8 text-center text-sm text-ink/55">Loading booking messages…</div>;
  if (!threads.length) return <div className="rounded-[18px] border border-plum/10 bg-white p-10 text-center"><MessageSquare className="mx-auto text-magenta" /><h2 className="mt-4 font-serif text-2xl text-plum">No booking conversations yet</h2><p className="mt-2 text-sm text-ink/55">A conversation becomes available after a real appointment is booked.</p></div>;

  const selected = threads.find((thread) => thread.booking.id === selectedId) || threads[0];
  return <section className="grid min-h-[610px] overflow-hidden rounded-[18px] border border-plum/10 bg-white xl:grid-cols-[330px_1fr]">
    <aside className="border-b border-plum/10 xl:border-b-0 xl:border-r"><div className="p-5"><h2 className="font-serif text-2xl text-plum">Booking Messages</h2><p className="mt-1 text-[11px] text-ink/55">Private conversations linked to appointments.</p></div><div className="max-h-[545px] overflow-y-auto">{threads.map((thread) => {
      const latest = thread.messages[0];
      return <button key={thread.booking.id} onClick={() => setSelectedId(thread.booking.id)} className={`w-full border-t border-plum/10 p-4 text-left ${selectedId === thread.booking.id ? "bg-blush/40" : "hover:bg-cream"}`}><span className="flex items-start justify-between gap-2"><b className="font-serif text-base text-plum">{bookingLabel(thread.booking)}</b><small className="shrink-0 text-[9px] text-ink/45">{new Date(thread.booking.appointment_datetime).toLocaleDateString()}</small></span><span className="mt-1 block text-[10px] text-ink/60">{role === "customer" ? thread.booking.salon?.name : thread.booking.guest_name}</span><span className="mt-2 block truncate text-[10px] text-ink/45">{latest?.body || "Start a conversation about this booking."}</span></button>;
    })}</div></aside>
    <div className="flex min-h-[520px] flex-col"><header className="border-b border-plum/10 p-5"><h3 className="font-serif text-xl text-plum">{bookingLabel(selected.booking)}</h3><p className="mt-1 text-[11px] text-ink/55">{role === "customer" ? selected.booking.salon?.name : selected.booking.guest_name} · {new Date(selected.booking.appointment_datetime).toLocaleString()}</p></header><div className="flex-1 space-y-3 overflow-y-auto bg-cream/35 p-5">{messages.map((message) => {
      const mine = message.sender_role === role;
      return <article key={message.id} className={`max-w-[82%] rounded-[14px] px-4 py-3 text-sm ${mine ? "ml-auto bg-plum text-white" : "bg-white text-ink shadow-sm"}`}><p data-no-translate="true" className="whitespace-pre-wrap break-words">{message.original_body || message.body}</p>{message.translated_body ? <div className={`mt-3 border-t pt-3 ${mine ? "border-white/20" : "border-plum/10"}`}><small className={`mb-1 block text-[9px] font-bold uppercase tracking-wide ${mine ? "text-white/60" : "text-magenta"}`}>Translation · {message.translation_locale}</small><p data-no-translate="true" className="whitespace-pre-wrap break-words">{message.translated_body}</p></div> : null}<small className={`mt-2 block text-[9px] ${mine ? "text-white/60" : "text-ink/40"}`}>{message.sender_role === "customer" ? "Customer" : message.sender_role === "salon" ? "Salon" : "Girlz Culture Support"} · {new Date(message.created_at).toLocaleString()}</small></article>;
    })}{!messages.length ? <p className="py-20 text-center text-sm text-ink/45">No messages yet. Ask a question about this appointment.</p> : null}</div>{scope !== "admin" ? <form onSubmit={send} className="border-t border-plum/10 p-4"><label className="sr-only" htmlFor="booking-message">Message</label><div className="flex gap-2"><textarea id="booking-message" value={draft} onChange={(event) => { setDraft(event.target.value.slice(0, 2000)); setTranslationPreview(null); }} rows={2} placeholder="Type a private booking message…" className="min-w-0 flex-1 resize-none rounded-[10px] border border-plum/15 p-3 text-sm outline-none focus:border-magenta" /><button disabled={sending || !draft.trim()} className="grid w-14 place-items-center rounded-[10px] bg-magenta text-white disabled:opacity-50" aria-label={translationPreview ? "Send original and previewed translation" : "Send message"}><Send size={19} /></button></div><div className="mt-2 flex flex-wrap items-center gap-2"><select value={targetLocale} onChange={(event) => { setTargetLocale(event.target.value); setTranslationPreview(null); }} aria-label="Translation language" className="min-h-9 rounded-lg border border-plum/15 bg-white px-2 text-[10px]"><option value="fr">French</option><option value="es">Spanish</option><option value="wo">Wolof</option></select><button type="button" disabled={sending || !draft.trim()} onClick={() => void previewTranslation()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-magenta px-3 text-[10px] font-bold text-magenta disabled:opacity-50"><Languages size={13}/>Preview translation</button><span className="text-[9px] text-ink/45">The original is always preserved. Nothing translated is sent until you preview and press Send.</span></div>{translationPreview?.original === draft ? <div className="mt-3 grid gap-2 rounded-[10px] border border-magenta/20 bg-blush/25 p-3 sm:grid-cols-2"><div><b className="text-[9px] uppercase text-ink/45">Original</b><p className="mt-1 whitespace-pre-wrap text-xs">{translationPreview.original}</p></div><div><b className="text-[9px] uppercase text-magenta">Translation preview · {translationPreview.locale}</b><p className="mt-1 whitespace-pre-wrap text-xs">{translationPreview.translated}</p></div></div> : null}</form> : <p className="border-t border-plum/10 p-4 text-center text-xs text-ink/50">Admin read-only view for support and safety.</p>}{notice ? <p className="border-t border-red-200 bg-red-50 p-3 text-xs text-red-700">{notice}</p> : null}</div>
  </section>;
}
