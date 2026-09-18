"use client";
import { useEffect, useRef, useState } from "react";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { getSupabaseForScope } from "@/lib/supabase";
import { ScopedApiError } from "@/lib/scopedApiCore";
import { useI18n } from "@/components/i18n/LocaleProvider";

type Incident = { kind: "no_show" | "late_cancellation"; status: "confirmed" | "review_requested" | "voided"; evidence: string; review_reason: string | null };
type Result = { incident: Incident | null; verified?: boolean; booking_status?: string };
export default function BookingAttendance({ bookingId, scope, guestToken, onSaved }: { bookingId: string; scope: "salon" | "customer"; guestToken?: string; onSaved?: (status: string) => void }) {
  const { translateSource: t } = useI18n();
  const [incident, setIncident] = useState<Incident | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("no_show"), [reason, setReason] = useState(""), [action, setAction] = useState("confirm"), [review, setReview] = useState(false);
  const [notice, setNotice] = useState(""), [error, setError] = useState("");
  const generation = useRef(0), pending = useRef(false), requestId = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    let actor: string | null | undefined;
    const subscription = guestToken ? null : getSupabaseForScope(scope).auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id || null;
      if (actor === next) return;
      actor = next; generation.current++; pending.current = false;
      setIncident(null); setOpen(false); setReason(""); setReview(false); setBusy(false); setNotice(""); setError(""); requestId.current = null;
    });
    const lifecycle = generation;
    return () => { lifecycle.current++; subscription?.data.subscription.unsubscribe(); };
  }, [scope, guestToken, bookingId]);

  async function request(body?: object) {
    const url = `/api/${scope}/bookings/${bookingId}/attendance`;
    const init: RequestInit = { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) };
    if (!guestToken) return (await createAuthenticatedApiClient(scope)).request<Result>(url, init);
    const response = await fetch(url, { ...init, headers: { ...init.headers, "X-Guest-Booking-Token": guestToken }, cache: "no-store", referrerPolicy: "no-referrer" });
    const data = await response.json();
    if (!response.ok) throw new ScopedApiError({ status: response.status, message: "", code: data.code, requestId: data.request_id });
    return data as Result;
  }
  function failure(value: unknown) {
    const specific = value instanceof ScopedApiError ? {
      INCIDENT_NOT_VERIFIED: "A no-show can only be confirmed after the appointment ends. A late cancellation must match the booking's agreed notice period.",
      INCIDENT_ALREADY_RECORDED: "This appointment already has an attendance record. Reload it before making a correction.",
      INCIDENT_ACCESS_DENIED: "You do not have permission to manage this appointment.",
    }[value.code] : undefined;
    setError(`${t(specific || "The attendance record could not be saved. Your explanation is retained.")}${value instanceof ScopedApiError && value.requestId ? ` ${t("Support reference")}: ${value.requestId}` : ""}`);
  }
  async function load() {
    if (pending.current) return; pending.current = true; setBusy(true); setError(""); const current = generation.current;
    try { const result = await request(); if (current !== generation.current) return; setIncident(result.incident); setAction(result.incident ? "void" : "confirm"); setOpen(true); setReview(false); }
    catch (value) { if (current === generation.current) failure(value); }
    finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  }
  async function save() {
    if (pending.current || !reason.trim()) return;
    const payload = scope === "salon" ? { action, kind: incident ? null : kind, reason } : { reason };
    const signature = JSON.stringify(payload);
    if (requestId.current?.signature !== signature) requestId.current = { signature, id: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError(""); setNotice(""); const current = generation.current;
    try {
      const result = await request(scope === "salon" ? { ...payload, request_id: requestId.current.id } : payload);
      if (current !== generation.current) return;
      if (result.verified !== true) throw Error("INCIDENT_NOT_VERIFIED");
      setIncident(result.incident); setReason(""); setReview(false); requestId.current = null;
      setNotice(t(scope === "salon" ? "Attendance saved. Only this business can use it for future deposit protection." : "Your review request was saved. This incident is excluded from higher-deposit rules while it is under review."));
      if (result.booking_status) onSaved?.(result.booking_status);
    } catch (value) { if (current === generation.current) failure(value); }
    finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  }
  const canWrite = scope === "salon" || incident?.status === "confirmed";
  return <section className="my-4 rounded-xl border border-border bg-white p-4" aria-label={t("Appointment attendance")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-serif text-lg font-bold">{t("Appointment attendance")}</h3><button type="button" disabled={busy} onClick={() => void load()} className="min-h-11 rounded-lg border px-4 text-sm font-semibold">{t(open ? "Reload attendance" : "View attendance")}</button></div>
    {open ? <div className="mt-3 space-y-3">
      {incident ? <div><p className="text-sm font-semibold">{t(incident.kind === "no_show" ? "No-show" : "Late cancellation")} · {t(({ confirmed: "Confirmed", review_requested: "Review requested", voided: "Corrected" })[incident.status])}</p><p data-no-translate className="mt-2 whitespace-pre-wrap break-words text-sm">{incident.evidence}</p>{incident.review_reason ? <p data-no-translate className="mt-2 whitespace-pre-wrap break-words text-sm">{incident.review_reason}</p> : null}</div> : <p className="text-sm">{t("No attendance incident has been recorded for this appointment.")}</p>}
      <p className="text-xs gc-text-secondary">{t("Attendance history stays with this business. Other businesses cannot use it to set your deposit.")}</p>
      {canWrite ? <form onSubmit={event => { event.preventDefault(); if (review) void save(); else setReview(true); }} className="space-y-3">
        <fieldset disabled={busy} className="space-y-3" onChange={() => setReview(false)}>
          {scope === "salon" ? <label className="block text-sm">{t(incident ? "Attendance correction" : "Incident type")}<select value={incident ? action : kind} onChange={event => incident ? setAction(event.target.value) : setKind(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3">{incident ? <><option value="void">{t("Correct this incident")}</option><option value="reinstate">{t("Confirm after review")}</option></> : <><option value="no_show">{t("No-show")}</option><option value="late_cancellation">{t("Late cancellation")}</option></>}</select></label> : null}
          <label className="block text-sm">{t(scope === "salon" ? "What did you verify?" : "Explain what needs correction")}<textarea required maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} data-no-translate className="mt-1 w-full rounded-lg border p-3"/></label>
        </fieldset>
        {review ? <p className="rounded-lg bg-cyan-50 p-3 text-sm">{t(scope === "salon" ? "Confirm that this record is accurate. It may affect this customer's deposit at your business. No charge or message is sent." : "Send this explanation to the business for review. No booking or payment will be changed.")}</p> : null}
        <button type="submit" disabled={busy || !reason.trim()} className="min-h-11 rounded-lg bg-plum px-4 text-sm font-semibold text-white">{t(busy ? "Saving…" : review ? "Confirm this change" : scope === "salon" ? "Review attendance change" : "Request a correction")}</button>
      </form> : null}
    </div> : null}
    {error ? <p role="alert" className="mt-3 text-sm gc-text-danger">{error}</p> : null}{notice ? <p role="status" className="mt-3 text-sm gc-text-success">{notice}</p> : null}
  </section>;
}
