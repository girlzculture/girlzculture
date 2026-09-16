"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { getSessionForScope, getSupabaseForScope } from "@/lib/supabase";
import { ownerResponseError, OwnerActionError } from "@/lib/ownerActionError";
import { Facts } from "@/components/owner/GcAssistant";
import { BOOKING_SOURCE_LABELS } from "@/lib/ownerBusinessMetrics";
type Row = Record<string, unknown>;
type Preview = { id: string; digest: string; arguments: Row; execution_payload: Row };
export default function ManualAppointmentEditor({ styles, stylists, timeZone, booking, onSaved }: { styles: Row[]; stylists: Row[]; timeZone: string; booking?: Row; onSaved: (booking: Row) => void }) {
  const { locale, translateSource: t } = useI18n();
  const [values, setValues] = useState<Row>({ guest_name: "", guest_email: "", guest_phone: "", style_id: null, service_name: "", duration_minutes: null, stylist_id: booking?.stylist_id || null, date: "", time: "", notes: "", source: "phone" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(""); const [reference, setReference] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const actor = useRef<string | null>(null); const generation = useRef(0);
  useEffect(() => {
    const lifetime = generation;
    const subscription = getSupabaseForScope("salon").auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id || null;
      // The initial callback clears actor-scoped state. Do not accept input
      // until it has run; otherwise a fast edit can be silently discarded.
      setSessionReady(Boolean(next));
      if (actor.current !== next) {
        actor.current = next; generation.current++;
        setValues({ guest_name: "", guest_email: "", guest_phone: "", style_id: null, service_name: "", duration_minutes: null, stylist_id: booking?.stylist_id || null, date: "", time: "", notes: "", source: "phone" });
        setPreview(null); setNotice(""); setReference(""); setBusy(false);
      }
    });
    return () => { lifetime.current++; subscription.data.subscription.unsubscribe(); };
  }, [booking?.stylist_id]);
  function change(key: string, value: unknown) { setPreview(null); setValues(current => ({ ...current, [key]: value })); }
  async function call(body: Row, activeGeneration: number) {
    const session = await getSessionForScope("salon"); if (!session || session.user.id !== actor.current || activeGeneration !== generation.current) throw new Error("AUTH_REQUIRED");
    // Explicit controls share the deterministic prepare/confirm API with chat.
    // No model, provider key, speech service or AI budget is needed by this form.
    const response = await fetch("/api/salon/assistant", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, locale }), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok) throw ownerResponseError(result, "ASSISTANT_UNAVAILABLE"); return result;
  }
  async function act(mode: "prepare" | "cancel" | "confirm") {
    if (busy || !sessionReady) return;
    const activeGeneration = generation.current;
    setBusy(true); setNotice(""); setReference("");
    try {
      if (mode === "confirm" && preview) {
        const result = await call({ action: "confirm", request_id: preview.id, digest: preview.digest, confirm: true, policy_reviewed: false }, activeGeneration);
        if (activeGeneration !== generation.current) return;
        onSaved(result.result); setPreview(null); setNotice("Appointment saved. Girlz Culture did not collect a payment.");
        window.dispatchEvent(new Event("gc-assistant-saved"));
      } else {
        const tool = mode === "cancel" ? "prepare_manual_cancellation" : booking ? "prepare_manual_reschedule" : "prepare_manual_appointment";
        const args = mode === "cancel" ? { booking_id: booking?.id, reason: String(values.reason || "") } : booking ? { booking_id: booking.id, date: values.date, time: values.time, stylist_id: values.stylist_id } : values;
        const result = await call({ action: "tool", request_id: crypto.randomUUID(), tool, args }, activeGeneration);
        if (activeGeneration !== generation.current) return;
        setPreview(result.request);
      }
    } catch (error) {
      if (activeGeneration !== generation.current) return;
      setReference(error instanceof OwnerActionError ? error.reference : "");
      const messages: Record<string, string> = {
        ASSISTANT_SERVICE_CLARIFICATION_REQUIRED: "Which service is this appointment for?", ASSISTANT_DURATION_CLARIFICATION_REQUIRED: "How many minutes will this appointment take?",
        ASSISTANT_PROFESSIONAL_CLARIFICATION_REQUIRED: "Which professional should take this appointment?", ASSISTANT_AVAILABILITY_CONFLICT: "That time is unavailable. Choose another time.",
        ASSISTANT_PREVIEW_STALE: "This information changed. Ask for a new preview before confirming.", ASSISTANT_ACCESS_DENIED: "You do not have permission for this action.",
        ASSISTANT_INVALID_INPUT: "Check the appointment fields and try again.", ASSISTANT_INVALID_DURATION: "Choose a duration within the service's published range.",
      };
      setNotice(messages[error instanceof Error ? error.message : ""] || "The appointment could not be saved. Review the fields and try again.");
    } finally { if (activeGeneration === generation.current) setBusy(false); }
  }
  const inputClass = "mt-1 block min-h-11 w-full rounded-lg border bg-white p-3 text-sm";
  return <section className="my-4 space-y-4 rounded-xl border border-plum/20 bg-white p-4"><h2 className="font-serif text-xl">{t(booking ? "Manage business-added appointment" : "Add an appointment")}</h2><p className="text-sm">{t("Business-added appointments block your calendar. Girlz Culture does not collect a payment or record customer policy acceptance.")}</p><p className="text-sm">{t("Time zone")}: <span data-no-translate>{timeZone}</span></p>{booking ? <Facts value={{ customer_name: booking.guest_name, service_name: booking.manual_service_name, appointment_datetime: booking.appointment_datetime, status: booking.status, source: booking.source }} timeZone={timeZone}/> : null}
    <p role="status" className="text-sm">{t(notice)}</p>{reference ? <p className="break-words text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
    {booking && !["Confirmed", "Requested"].includes(String(booking.status)) ? null : preview ? <div className="space-y-4"><h3 className="font-semibold">{t("Review this draft")}</h3><Facts value={{ ...preview.arguments, ...preview.execution_payload }} timeZone={timeZone}/><div className="flex flex-wrap gap-3"><button disabled={busy} type="button" onClick={() => void act("confirm")} className="min-h-11 rounded-full bg-plum px-5 text-white">{t("Confirm this change")}</button><button disabled={busy} type="button" onClick={() => setPreview(null)} className="min-h-11 rounded-full border px-5">{t("Keep editing")}</button></div></div>
      : <form onSubmit={event => { event.preventDefault(); void act("prepare"); }}><fieldset disabled={busy || !sessionReady} className="min-w-0 space-y-4"><div className="grid gap-4 sm:grid-cols-2">
      {!booking ? <><label className="text-sm">{t("Customer name")}<input required data-no-translate maxLength={120} value={String(values.guest_name)} onChange={event => change("guest_name", event.target.value)} className={inputClass}/></label><label className="text-sm">{t("Booking source")}<select value={String(values.source)} onChange={event => change("source", event.target.value)} className={inputClass}>{Object.entries(BOOKING_SOURCE_LABELS).filter(([key]) => key !== "marketplace").map(([key,label]) => <option value={key} key={key}>{t(label)}</option>)}</select></label><label className="text-sm">{t("Email (optional)")}<input type="email" data-no-translate maxLength={254} value={String(values.guest_email)} onChange={event => change("guest_email",event.target.value)} className={inputClass}/></label><label className="text-sm">{t("Phone (optional)")}<input type="tel" data-no-translate maxLength={40} value={String(values.guest_phone)} onChange={event => change("guest_phone",event.target.value)} className={inputClass}/></label><label className="text-sm">{t("Service")}<select value={String(values.style_id || "")} onChange={event => { change("style_id",event.target.value || null); change("duration_minutes",null); }} className={inputClass}><option value="">{t("Other service with an explicit duration")}</option>{styles.filter(row => !row.is_draft && !row.archived_at).map(row => <option key={String(row.id)} value={String(row.id)} data-no-translate>{String(row.name)}</option>)}</select></label>{!values.style_id ? <label className="text-sm">{t("Service name")}<input required data-no-translate maxLength={120} value={String(values.service_name)} onChange={event => change("service_name",event.target.value)} className={inputClass}/></label> : null}<label className="text-sm">{t("Duration (minutes)")}<input type="number" min={15} max={1440} step={1} required={!values.style_id} value={values.duration_minutes == null ? "" : Number(values.duration_minutes)} onChange={event => change("duration_minutes",event.target.value === "" ? null : event.target.valueAsNumber)} className={inputClass}/><span className="mt-1 block text-xs">{t("Leave blank to use a fixed service duration. A duration range requires a choice.")}</span></label></> : null}
      <label className="text-sm">{t("Professional")}<select value={String(values.stylist_id || "")} onChange={event => change("stylist_id",event.target.value || null)} className={inputClass}><option value="">{t("Choose a professional")}</option>{stylists.filter(row => row.is_active && !row.archived_at).map(row => <option data-no-translate key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label><label className="text-sm">{t("Date")}<input required type="date" value={String(values.date)} onChange={event => change("date",event.target.value)} className={inputClass}/></label><label className="text-sm">{t("Time")}<input required type="time" value={String(values.time)} onChange={event => change("time",event.target.value)} className={inputClass}/></label>
      {!booking ? <label className="text-sm sm:col-span-2">{t("Private booking note (optional)")}<textarea data-no-translate maxLength={1200} value={String(values.notes)} onChange={event => change("notes",event.target.value)} className={inputClass}/></label> : null}</div><button disabled={busy} className="min-h-11 rounded-full bg-plum px-5 text-white">{t("Review appointment")}</button>{booking ? <div className="space-y-2 border-t pt-4"><label className="text-sm">{t("Cancellation reason")}<input data-no-translate maxLength={300} value={String(values.reason || "")} onChange={event => change("reason",event.target.value)} className={inputClass}/></label><button type="button" disabled={busy || !String(values.reason || "").trim()} onClick={() => void act("cancel")} className="min-h-11 rounded-full border px-5">{t("Review cancellation")}</button></div> : null}</fieldset></form>}
  </section>;
}
