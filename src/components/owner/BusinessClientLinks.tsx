"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { ScopedApiError } from "@/lib/scopedApiCore";
import type { ClientCard, ClientLinks } from "@/lib/businessClientCore";

export default function BusinessClientLinks({ bookingId, timeZone, saved }: { bookingId: string; timeZone: string; saved: (card: ClientCard) => void }) {
  const { translateSource: t, formatDate } = useI18n();
  const [data, setData] = useState<ClientLinks | null>(null), [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [reference, setReference] = useState("");
  const [review, setReview] = useState<{ action: "link" | "unlink"; target: string; label: string; revision: number } | null>(null);
  const operation = useRef<string | null>(null), pending = useRef(false), lifetime = useRef(0);
  useEffect(() => { const active = lifetime; return () => { active.current++; }; }, []);
  const date = (value: string) => formatDate(value, { dateStyle: "medium", timeStyle: "short", timeZone });
  function failure(error: unknown) {
    setReference(error instanceof ScopedApiError ? error.requestId || "" : "");
    setNotice(error instanceof ScopedApiError && error.status === 409 ? "Client links changed or conflict. Reload and review the selection again." : "The client link could not be verified. Your selection is retained.");
    if (error instanceof ScopedApiError && [401, 403, 404].includes(error.status)) { setData(null); setReview(null); }
  }
  async function load() {
    if (pending.current) return; pending.current = true; setBusy(true); setNotice(""); setReference(""); const generation = lifetime.current;
    try {
      const result = await (await createAuthenticatedApiClient("salon")).request<ClientLinks>(`/api/salon/bookings/${bookingId}/client-record/links?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (generation === lifetime.current) { setData(result); setReview(null); operation.current = null; }
    } catch (error) { if (generation === lifetime.current) failure(error); }
    finally { if (generation === lifetime.current) { pending.current = false; setBusy(false); } }
  }
  async function confirm() {
    if (!review || pending.current) return; pending.current = true; setBusy(true); setNotice(""); setReference(""); const generation = lifetime.current;
    operation.current ||= crypto.randomUUID();
    try {
      const result = await (await createAuthenticatedApiClient("salon")).request<{ verified: boolean; card: ClientCard }>(`/api/salon/bookings/${bookingId}/client-record/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: review.action, target: review.target, revision: review.revision, request_id: operation.current }), signal: AbortSignal.timeout(30000) });
      if (!result.verified) throw Error("CLIENT_NOT_VERIFIED");
      if (generation === lifetime.current) { saved(result.card); setReview(null); setData(null); operation.current = null; setNotice("Client link saved and verified."); }
    } catch (error) { if (generation === lifetime.current) failure(error); }
    finally { if (generation === lifetime.current) { pending.current = false; setBusy(false); } }
  }
  const choose = (action: "link" | "unlink", target: string, label: string) => { if (!data) return; operation.current = null; setReview({ action, target, label, revision: data.revision }); };
  return <section aria-label={t("Link returning guest visits")} className="space-y-3 rounded-xl border bg-surface-subtle p-4">
    <h3 className="font-semibold">{t("Link returning guest visits")}</h3>
    <p className="text-sm">{t("Only link visits after confirming they belong to the same client. A matching name or email is not proof. Original notes, cautions and photos stay separate; sign-in identities are unchanged.")}</p>
    <div className="flex flex-col gap-2 sm:flex-row"><label className="min-w-0 flex-1 text-sm">{t("Find a client at this business")}<input data-no-translate value={query} onChange={event => setQuery(event.target.value)} maxLength={120} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3"/></label><button type="button" disabled={busy} onClick={() => void load()} className="min-h-11 self-end rounded-lg border bg-white px-4 text-sm">{t("Search / reload links")}</button></div>
    {data ? <div className="space-y-3">
      {data.links.map(link => <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-sm"><p><span data-no-translate>{link.from_name}</span> · {date(link.from_date)} → <span data-no-translate>{link.to_name}</span> · {date(link.to_date)}</p><button type="button" disabled={busy} onClick={() => choose("unlink", link.id, `${link.from_name || ""} · ${date(link.from_date)} → ${link.to_name || ""} · ${date(link.to_date)}`)} className="min-h-11 rounded-lg border px-3">{t("Review unlink")}</button></div>)}
      {data.candidates.map(candidate => <div key={candidate.booking_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-sm"><p><span data-no-translate>{candidate.name} · {candidate.service}</span><br/>{date(candidate.date)}</p><button type="button" disabled={busy} onClick={() => choose("link", candidate.booking_id, `${candidate.name || ""} · ${candidate.service || ""} · ${date(candidate.date)}`)} className="min-h-11 rounded-lg border px-3">{t("Review link")}</button></div>)}
      {!data.candidates.length ? <p className="text-sm">{t("No linkable visits in this result. Search by at least two characters of the client's name; the latest 20 matches are shown.")}</p> : null}
    </div> : null}
    {review ? <div role="group" aria-label={t("Review client link")} className="space-y-3 rounded-xl border border-primary bg-white p-4"><p className="font-semibold">{t(review.action === "link" ? "Confirm these visits belong to the same client" : "Remove this client-history link")}</p><p data-no-translate className="break-words text-sm">{review.label}</p><p className="text-sm">{t("No original record is overwritten or deleted. Other verified identity links remain in place.")}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void confirm()} className="min-h-11 rounded-lg bg-primary px-4 text-white">{t(review.action === "link" ? "Confirm client link" : "Confirm unlink")}</button><button type="button" disabled={busy} onClick={() => { setReview(null); operation.current = null; }} className="min-h-11 rounded-lg border px-4">{t("Cancel")}</button></div></div> : null}
    {notice ? <p role="status" className="text-sm">{t(notice)}</p> : null}{reference ? <p className="break-all text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
  </section>;
}
