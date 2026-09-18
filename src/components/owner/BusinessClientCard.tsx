"use client";
import { useEffect, useRef, useState } from "react";
import { FileHeart, ImagePlus, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { getSupabaseForScope, getValidSessionForScope } from "@/lib/supabase";
import { ScopedApiError } from "@/lib/scopedApiCore";
import type { ClientCard, ClientFormula } from "@/lib/businessClientCore";
import BusinessClientLinks from "./BusinessClientLinks";

function PrivateWorkPhoto({ bookingId, photo, reload, editable }: { bookingId: string; photo: ClientCard["photos"][number]; reload: () => void; editable: boolean }) {
  const { translateSource: t } = useI18n();
  const [url, setUrl] = useState(""), [failed, setFailed] = useState(false), [removing, setRemoving] = useState(false), [confirm, setConfirm] = useState(false), [reference, setReference] = useState("");
  useEffect(() => {
    const abort = new AbortController(); let blobUrl = "";
    void (async () => {
      const session = await getValidSessionForScope("salon", 30);
      if (!session || abort.signal.aborted) return;
      const response = await fetch(`/api/salon/bookings/${bookingId}/client-record/photos/${photo.id}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: abort.signal });
      if (!response.ok) { const error = await response.json(); if (!abort.signal.aborted) setReference(String(error.request_id || "")); throw Error("Photo unavailable"); }
      const blob = await response.blob();
      if (!abort.signal.aborted) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl); }
    })().catch(() => { if (!abort.signal.aborted) setFailed(true); });
    return () => { abort.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [bookingId, photo.id]);
  async function remove() {
    if (removing) return; setRemoving(true); setReference("");
    try { await (await createAuthenticatedApiClient("salon")).request(`/api/salon/bookings/${photo.booking_id}/client-record/photos/${photo.id}`, { method: "DELETE", signal: AbortSignal.timeout(30000) }); reload(); }
    catch (error) { setReference(error instanceof ScopedApiError ? error.requestId || "" : ""); setFailed(true); }
    finally { setRemoving(false); }
  }
  return <figure className="min-w-0 rounded-xl border bg-white p-2">
    {/* Authorized binary stays in this component's short-lived blob, never a public image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt={photo.caption || t("Private work photo")} className="aspect-square w-full rounded-lg object-contain"/> : <div className="flex aspect-square items-center justify-center bg-surface-subtle p-3 text-sm">{t(failed ? "Photo unavailable. Reload the record to try again." : "Loading photo…")}</div>}
    <figcaption data-no-translate className="mt-2 break-words text-sm">{photo.caption}</figcaption>
    {editable ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={removing} onClick={() => confirm ? void remove() : setConfirm(true)} className="min-h-11 rounded-lg border px-3 text-sm">{t(confirm ? "Confirm photo removal" : "Remove photo")}</button>{confirm ? <button type="button" onClick={() => setConfirm(false)} className="min-h-11 px-2 text-sm">{t("Cancel")}</button> : null}</div> : null}
    {failed && url ? <p role="status" className="text-sm">{t("The photo could not be removed. Try again.")}</p> : null}{reference ? <p className="break-all text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
  </figure>;
}

export default function BusinessClientCard({ bookingId, timeZone }: { bookingId: string; timeZone: string }) {
  const { locale, translateSource: t, formatDate, formatCurrency, formatNumber } = useI18n();
  const [open, setOpen] = useState(false), [card, setCard] = useState<ClientCard | null>(null), [busy, setBusy] = useState(false), [sessionReady, setSessionReady] = useState(false);
  const [preferences, setPreferences] = useState(""), [notes, setNotes] = useState(""), [cautions, setCautions] = useState("");
  const [formula, setFormula] = useState<ClientFormula>({}), [notice, setNotice] = useState(""), [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null), [caption, setCaption] = useState("");
  const generation = useRef(0), pending = useRef(false), operation = useRef<{ signature: string; id: string } | null>(null), photoOperation = useRef<{ file: File; caption: string; locale: string; id: string } | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let actor: string | null | undefined;
    const subscription = getSupabaseForScope("salon").auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id || null;
      if (actor === next) return;
      actor = next; generation.current++; pending.current = false; setSessionReady(Boolean(session));
      setOpen(false); setCard(null); setPreferences(""); setNotes(""); setCautions(""); setFormula({}); setBusy(false); setNotice(""); setReference(""); setFile(null); setCaption(""); operation.current = null; photoOperation.current = null;
    });
    const lifetime = generation;
    return () => { lifetime.current++; subscription.data.subscription.unsubscribe(); };
  }, [bookingId]);
  function seed(next: ClientCard) { setCard(next); setPreferences(next.preferences || ""); setNotes(next.notes || ""); setCautions(next.cautions || ""); setFormula(next.visits.find(visit => visit.booking_id === bookingId)?.formula || {}); }
  function failure(error: unknown) {
    setReference(error instanceof ScopedApiError ? error.requestId || "" : "");
    setNotice(error instanceof ScopedApiError && error.code === "CLIENT_CHANGED" ? "This client record changed. Your draft is kept; copy it before reloading the saved record." : "The client record could not be saved or loaded. Your draft is kept.");
    if (error instanceof ScopedApiError && [401, 403, 404].includes(error.status)) { setCard(null); setPreferences(""); setNotes(""); setCautions(""); setFormula({}); setFile(null); setNotice("This client record is not available to your current account."); }
  }
  async function load(resetDraft = true) {
    if (pending.current) return; pending.current = true; const active = generation.current; setBusy(true); setNotice(""); setReference("");
    try {
      const { card: next } = await (await createAuthenticatedApiClient("salon")).request<{ card: ClientCard }>(`/api/salon/bookings/${bookingId}/client-record`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (active === generation.current) { if (resetDraft) seed(next); else setCard(next); setOpen(true); }
    } catch (error) { if (active === generation.current) failure(error); }
    finally { if (active === generation.current) { pending.current = false; setBusy(false); } }
  }
  async function save() {
    if (!card || pending.current) return;
    const permissions = card.permissions;
    const currentFormula = card.visits.find(visit => visit.booking_id === bookingId)?.formula || {};
    const patch = { ...(permissions.client_notes && preferences !== card.preferences ? { preferences } : {}), ...(permissions.client_notes && notes !== card.notes ? { notes } : {}), ...(permissions.client_cautions && cautions !== card.cautions ? { cautions } : {}), ...(permissions.client_formulas && JSON.stringify(formula) !== JSON.stringify(currentFormula) ? { formula } : {}) };
    if (!Object.keys(patch).length) { setNotice("No changes to save."); return; }
    pending.current = true; const active = generation.current; setBusy(true); setNotice(""); setReference("");
    const input = { revision: card.revision, locale, patch };
    const signature = JSON.stringify(input); if (operation.current?.signature !== signature) operation.current = { signature, id: crypto.randomUUID() };
    try {
      const result = await (await createAuthenticatedApiClient("salon")).request<{ verified: boolean; card: ClientCard }>(`/api/salon/bookings/${bookingId}/client-record`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, request_id: operation.current.id }), signal: AbortSignal.timeout(30000) });
      if (!result.verified) throw Error("Not verified");
      if (active === generation.current) { seed(result.card); operation.current = null; setNotice("Client record saved and verified."); }
    } catch (error) { if (active === generation.current) failure(error); }
    finally { if (active === generation.current) { pending.current = false; setBusy(false); } }
  }
  async function upload() {
    if (!file || pending.current) return; pending.current = true; const active = generation.current; setBusy(true); setNotice(""); setReference("");
    if (photoOperation.current?.file !== file || photoOperation.current?.caption !== caption || photoOperation.current?.locale !== locale) photoOperation.current = { file, caption, locale, id: crypto.randomUUID() };
    const body = new FormData(); body.set("file", file); body.set("request_id", photoOperation.current.id); body.set("caption", caption); body.set("locale", locale);
    try {
      const result = await (await createAuthenticatedApiClient("salon")).request<{ verified: boolean; card: ClientCard }>(`/api/salon/bookings/${bookingId}/client-record/photos`, { method: "POST", body, signal: AbortSignal.timeout(60000) });
      if (!result.verified) throw Error("Not verified");
      if (active === generation.current) { setCard(result.card); setFile(null); setCaption(""); photoOperation.current = null; if (uploadInput.current) uploadInput.current.value = ""; setNotice("Private work photo saved."); }
    } catch (error) { if (active === generation.current) failure(error); }
    finally { if (active === generation.current) { pending.current = false; setBusy(false); } }
  }
  const field = "mt-1 block min-h-11 w-full rounded-lg border border-border-default bg-white p-3 text-sm";
  const edit = Boolean(card?.permissions.client_edit);
  return <section aria-label={t("Client history and formulas")} className="my-4 space-y-4 rounded-xl border border-border-default bg-white p-4 sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 font-serif text-xl"><FileHeart size={20}/>{t("Client history and formulas")}</h2><p className="mt-1 flex items-center gap-1 text-xs text-text-secondary"><ShieldCheck size={14}/>{t("Private to this business and authorized staff.")}</p></div><button type="button" disabled={busy || !sessionReady} onClick={() => open ? setOpen(false) : void load()} className="min-h-11 rounded-lg border px-4 text-sm font-semibold">{t(open ? "Close client record" : "Open client record")}</button></header>
    {open && card ? <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{t("Visits in this business")}: {formatNumber(card.visit_count)}{card.scope === "assigned_stylist_only" ? ` · ${t("Your assigned appointments only")}` : ""}</p><button type="button" disabled={busy} onClick={() => void load()} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"><RefreshCw size={14}/>{t("Reload saved client record")}</button></div>
      <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
        {card.permissions.client_notes ? <div className="grid gap-4 md:grid-cols-2"><label className="text-sm">{t("Client preferences")}<textarea data-no-translate disabled={busy || !edit} value={preferences} maxLength={4000} onChange={event => setPreferences(event.target.value)} className={`${field} min-h-24`}/></label><label className="text-sm">{t("Private client notes")}<textarea data-no-translate disabled={busy || !edit} value={notes} maxLength={4000} onChange={event => setNotes(event.target.value)} className={`${field} min-h-24`}/></label></div> : null}
        {card.permissions.client_cautions ? <label className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">{t("Allergies, sensitivities and cautions")}<textarea data-no-translate disabled={busy || !edit} value={cautions} maxLength={4000} onChange={event => setCautions(event.target.value)} className={`${field} min-h-20`}/></label> : null}
        {card.permissions.client_formulas ? <fieldset disabled={busy || !edit} className="rounded-xl border p-4"><legend className="px-2 font-semibold">{t("Formula for this appointment")}</legend><div className="grid gap-3 sm:grid-cols-2">{([['instructions','Exact service instructions'],['color','Color / formula'],['size','Size'],['length','Length'],['technique','Technique']] as const).map(([key,label]) => <label key={key} className={`text-sm ${key === 'instructions' ? 'sm:col-span-2' : ''}`}>{t(label)}{key === 'instructions' ? <textarea data-no-translate maxLength={4000} value={formula[key] || ""} onChange={event => setFormula(current => ({ ...current, [key]: event.target.value }))} className={`${field} min-h-20`}/> : <input data-no-translate maxLength={4000} value={formula[key] || ""} onChange={event => setFormula(current => ({ ...current, [key]: event.target.value }))} className={field}/>}</label>)}<label className="text-sm">{t("Actual duration (minutes)")}<input type="number" min={1} max={1440} step={1} value={formula.duration_minutes ?? ""} onChange={event => setFormula(current => ({ ...current, duration_minutes: event.target.value === "" ? null : Number(event.target.value) }))} className={field}/></label></div></fieldset> : null}
        {edit && (card.permissions.client_notes || card.permissions.client_cautions || card.permissions.client_formulas) ? <button disabled={busy} className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 font-semibold text-white"><Save size={16}/>{t("Save client record")}</button> : null}
      </form>
      {card.related_profiles?.length ? <section className="space-y-3"><h3 className="font-semibold">{t("Original records from linked visits")}</h3>{card.related_profiles.map(profile => <article key={profile.card_id} className="space-y-2 rounded-xl border p-3"><a href={`/salon/dashboard/bookings/${profile.booking_id}`} className="text-sm font-semibold text-primary underline">{formatDate(profile.date, { dateStyle: "medium", timeZone })} · {t("Open original visit")}</a>{([["preferences", "Client preferences"], ["notes", "Private client notes"], ["cautions", "Allergies, sensitivities and cautions"]] as const).map(([key, label]) => profile[key] ? <div key={key} className={key === "cautions" ? "rounded-lg bg-amber-50 p-2" : ""}><h4 className="text-xs font-semibold">{t(label)}</h4><p data-no-translate className="whitespace-pre-wrap break-words text-sm">{profile[key]}</p></div> : null)}</article>)}</section> : null}
      {card.can_link_visits ? <BusinessClientLinks key={bookingId} bookingId={bookingId} timeZone={timeZone} saved={setCard}/> : null}
      {card.spend ? <section className="rounded-xl border bg-surface-subtle p-4"><h3 className="font-semibold">{t("Recorded client spend")}</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm">{t("Completed agreed service value")}</dt><dd className="font-serif text-xl">{formatCurrency(card.spend.completed_agreed_cents / 100)}</dd></div><div><dt className="text-sm">{t("Recorded payments after refunds")}</dt><dd className="font-serif text-xl">{formatCurrency(card.spend.recorded_payment_cents / 100)}</dd></div></dl><p className="mt-2 text-xs text-text-secondary">{t("All-time linked bookings and recorded chair payments. Unlinked sales and unrecorded payments are excluded.")}</p></section> : null}
      <section><h3 className="font-semibold">{t("Past and upcoming services")}</h3><div className="mt-3 space-y-2">{card.visits.map(visit => <details key={visit.booking_id} className="rounded-xl border p-3"><summary className="cursor-pointer text-sm"><span data-no-translate>{visit.name}</span> · {formatDate(visit.date, { dateStyle: "medium", timeStyle: "short", timeZone })} · {t(visit.status)}</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{visit.formula ? Object.entries(visit.formula).filter(([, value]) => value !== "" && value !== null).map(([key,value]) => <div key={key}><dt className="text-xs text-text-secondary">{t(({instructions:'Exact service instructions',color:'Color / formula',size:'Size',length:'Length',technique:'Technique',duration_minutes:'Actual duration (minutes)'} as Record<string,string>)[key] || key)}</dt><dd data-no-translate className="whitespace-pre-wrap break-words">{String(value)}</dd></div>) : <p>{t("No saved formula for this visit.")}</p>}{visit.size ? <div><dt>{t("Booked size")}</dt><dd data-no-translate>{visit.size}</dd></div> : null}{visit.length ? <div><dt>{t("Booked length")}</dt><dd data-no-translate>{visit.length}</dd></div> : null}</dl></details>)}</div>{card.visit_count > card.capped_at ? <p className="mt-2 text-sm">{t("Showing the most recent 200 visits. Spend totals include all linked visits.")}</p> : null}</section>
      {card.permissions.client_photos ? <section className="space-y-3"><h3 className="font-semibold">{t("Private work photos")}</h3><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{card.photos.map(photo => <PrivateWorkPhoto key={photo.id} bookingId={bookingId} photo={photo} reload={() => void load(false)} editable={edit}/>)}</div>{!card.photos.length ? <p className="text-sm text-text-secondary">{t("No private work photos saved.")}</p> : null}{edit ? <div className="space-y-3 rounded-xl border p-3"><label className="block text-sm">{t("Add a work photo (JPG, PNG or WebP, up to 10 MB)")}<input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); photoOperation.current = null; }} className={`${field} max-w-full`}/></label><label className="block text-sm">{t("Work photo caption")}<input data-no-translate maxLength={300} disabled={busy} value={caption} onChange={event => setCaption(event.target.value)} className={field}/></label><button type="button" disabled={busy || !file} onClick={() => void upload()} className="flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white gc-disabled-control"><ImagePlus size={16}/>{t("Save private photo")}</button></div> : null}</section> : null}
    </> : null}
    {notice ? <p role="status" className="text-sm">{t(notice)}</p> : null}{reference ? <p className="break-all text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
  </section>;
}
