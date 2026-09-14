"use client";
import { useEffect, useRef, useState } from "react";
import { getSessionForScope, getSupabaseForScope } from "@/lib/supabase";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { ownerResponseError, OwnerActionError } from "@/lib/ownerActionError";
type Row = Record<string, unknown>;
export default function BookingNotes({ bookingId }: { bookingId: string }) {
  const { locale, translateSource: t, formatDate } = useI18n();
  const [notes, setNotes] = useState<Row[]>([]); const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ id: string; digest: string; arguments: { note: string } } | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [reference, setReference] = useState("");
  const generation = useRef(0); const actor = useRef<string | null>(null);
  useEffect(() => {
    const lifetime = generation;
    let mounted = true;
    const subscription = getSupabaseForScope("salon").auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id || null;
      if (actor.current === next) return;
      actor.current = next; const active = ++generation.current;
      setNotes([]); setText(""); setPreview(null); setBusy(false); setNotice(""); setReference("");
      if (!session) return;
      void fetch(`/api/salon/bookings/${bookingId}/notes`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(30000) }).then(async response => {
        const result = await response.json(); if (!response.ok) throw ownerResponseError(result, "NOTES_UNAVAILABLE");
        if (mounted && active === generation.current) setNotes(result.notes);
      }).catch(error => { if (mounted && active === generation.current) { setNotice("Private booking notes could not be loaded."); setReference(error instanceof OwnerActionError ? error.reference : ""); } });
    });
    return () => { mounted = false; lifetime.current++; actor.current = null; subscription.data.subscription.unsubscribe(); };
  }, [bookingId]);
  async function submit() {
    if (busy || !text.trim()) return;
    const active = generation.current; setBusy(true); setNotice(""); setReference("");
    try {
      const session = await getSessionForScope("salon");
      if (!session || active !== generation.current || session.user.id !== actor.current) return;
      const response = await fetch("/api/salon/assistant", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ locale, ...(preview ? { action: "confirm", request_id: preview.id, digest: preview.digest, confirm: true, policy_reviewed: false } : { action: "tool", request_id: crypto.randomUUID(), tool: "prepare_booking_note", args: { booking_id: bookingId, note: text } }) }), signal: AbortSignal.timeout(30000) });
      const result = await response.json(); if (!response.ok) throw ownerResponseError(result, "NOTES_UNAVAILABLE");
      if (active !== generation.current) return;
      if (preview) { setNotes(current => [result.result, ...current]); setPreview(null); setText(""); setNotice("Private note saved."); }
      else setPreview(result.request);
    } catch (error) { if (active === generation.current) { setNotice("The private note could not be saved. Review and try again."); setReference(error instanceof OwnerActionError ? error.reference : ""); } }
    finally { if (active === generation.current) setBusy(false); }
  }
  return <section className="my-4 space-y-3 rounded-xl border bg-white p-4"><h2 className="font-serif text-xl">{t("Private booking notes")}</h2><p className="text-sm">{t("Only authorized business staff can read these notes. They are never sent to the customer.")}</p>
    <ul className="space-y-3">{notes.map(note => <li key={String(note.id)}><p data-no-translate className="whitespace-pre-wrap break-words">{String(note.body)}</p><p className="text-xs">{formatDate(String(note.created_at), { dateStyle: "medium", timeStyle: "short" })}</p></li>)}</ul>
    <label className="block text-sm">{t("Private booking note")}<textarea disabled={busy} data-no-translate maxLength={1200} value={text} onChange={event => { setText(event.target.value); setPreview(null); }} className="mt-1 block min-h-20 w-full rounded-lg border p-3"/></label>
    {preview ? <div><p className="text-sm">{t("Review this draft")}</p><p data-no-translate className="whitespace-pre-wrap break-words">{preview.arguments.note}</p></div> : null}<button type="button" disabled={busy || !text.trim()} onClick={() => void submit()} className="min-h-11 rounded-full bg-plum px-5 text-white">{t(preview ? "Confirm this change" : "Review private note")}</button>
    <p role="status">{t(notice)}</p>{reference ? <p>{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}</section>;
}
