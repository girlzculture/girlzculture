"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { ScopedApiError } from "@/lib/scopedApiCore";
import { campaignCopy } from "@/i18n/business-customer-campaign-copy";
import type { CampaignWorkspace, CustomerCampaign } from "@/lib/businessCustomerCampaigns";
import type { MarketingLocale } from "@/lib/businessMarketing";
const endpoint = "/api/salon/customer-campaigns";
const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold gc-disabled-control";
const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const failure = "Client updates could not be verified. Refresh saved status before continuing; attempted emails are never automatically resent.";
const names = { en: "English", fr: "Français", es: "Español", "zh-CN": "简体中文" };
function campaignErrorMessage(error: unknown, locale: string) {
 const source = error instanceof ScopedApiError && error.status === 403 ? "The business owner manages client updates." : failure;
 return campaignCopy(locale, source) + (error instanceof ScopedApiError && error.requestId ? ` ${campaignCopy(locale, "Support reference")}: ${error.requestId}` : "");
}
export function CustomerCampaignNavigation({ campaigns }: { campaigns: boolean }) {
 const { locale } = useI18n(); const t = (s: string) => campaignCopy(locale, s);
 return <nav className={`mb-4 flex flex-wrap gap-2 ${!campaigns ? "max-lg:[@media(max-height:600px)]:mb-2" : ""}`} aria-label={t("Client updates")} data-no-translate><Link className={button} href="/salon/dashboard/messages" aria-current={!campaigns ? "page" : undefined}>{t("Booking messages")}</Link><Link className={button} href="/salon/dashboard/messages/campaigns" aria-current={campaigns ? "page" : undefined}>{t("Client updates")}</Link></nav>;
}
export default function BusinessCustomerCampaigns({ businessId }: { businessId: string }) { return <CampaignPanel key={businessId}/>; }
function CampaignPanel() {
 const { locale, formatDate } = useI18n(); const t = (s: string) => campaignCopy(locale, s);
 const [workspace, setWorkspace] = useState<CampaignWorkspace | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState("");
 const [postId, setPostId] = useState(""), [selected, setSelected] = useState<string[]>([]), [search, setSearch] = useState("");
 const [focused, setFocused] = useState(""), [reviewed, setReviewed] = useState<MarketingLocale[]>([]);
 const generation = useRef(0), pending = useRef(false), requestId = useRef<string | null>(null);
 const load = useCallback(async (query = "") => (await createAuthenticatedApiClient("salon")).request<CampaignWorkspace>(`${endpoint}?search=${encodeURIComponent(query)}`), []);
 useEffect(() => { const epoch = ++generation.current; void load().then(data => { if (generation.current === epoch) setWorkspace(data); }).catch(err => { if (generation.current === epoch) setError(campaignErrorMessage(err, locale)); }).finally(() => { if (generation.current === epoch) setBusy(false); }); return () => { generation.current = epoch + 1; }; }, [load, locale]);
 const current = workspace?.campaigns.find(item => item.id === focused);
 const post = workspace?.posts.find(item => item.id === postId);
 async function run(body?: Record<string, unknown>) {
  if (pending.current) return; pending.current = true; setBusy(true); setError(""); const epoch = generation.current;
  try {
   const data = body ? await (await createAuthenticatedApiClient("salon")).request<CampaignWorkspace>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) : await load(search);
   if (generation.current !== epoch) return;
   if (!data.verified) throw Error("CAMPAIGN_READBACK_FAILED");
   setWorkspace(data);
   if (body?.action === "save") { setFocused(String(body.id)); setReviewed([]); requestId.current = null; setSelected([]); }
  } catch (err) { if (generation.current === epoch) setError(campaignErrorMessage(err, locale)); }
  finally { pending.current = false; if (generation.current === epoch) setBusy(false); }
 }
 function resetSelection() { requestId.current = null; }
 const status = (campaign: CustomerCampaign) => campaign.status === "draft" ? "Draft" : campaign.status === "confirmed" ? "Approved" : "Cancelled";
 const recipientStatus = { pending: "Not sent", processing: "Attempt recorded; refresh or contact support", accepted: "Accepted by email provider", skipped: "Skipped after a fresh eligibility check", uncertain: "Uncertain — support review needed" };
 const recipientLocales = current ? [...new Set(current.recipients.map(client => client.locale))] : [];
 return <section className="space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-labelledby="customer-campaign-title" aria-busy={busy} data-no-translate>
  <div className="flex flex-wrap justify-between gap-3"><div><h2 id="customer-campaign-title" className="text-lg font-semibold">{t("Email updates")}</h2><p className="mt-1 max-w-2xl text-sm text-muted">{t("Choose clients who have received a service and opted in to email updates from your business.")}</p></div><button className={button} disabled={busy} onClick={() => void run()}>{t("Refresh saved status")}</button></div>
  <p className="text-sm text-muted">{t("Only email is available here. Booking-only guest consent does not add someone to this list.")}</p>
  {busy && <p role="status" className="text-sm">{t("Checking saved updates…")}</p>}{error && <p role="alert" className="break-words rounded-lg border border-error p-3 text-sm text-error">{t(error)}</p>}
  {workspace && <>
   {!workspace.email_available && <p role="status" className="rounded-lg bg-subtle p-3 text-sm">{t("Email sending is unavailable. You can prepare and review a selection; sending stays disabled.")}</p>}
   <form className="space-y-4 rounded-xl border border-border p-4" onSubmit={event => { event.preventDefault(); if (!post) return; requestId.current ||= crypto.randomUUID(); void run({ action: "save", id: requestId.current, post_id: post.id, post_revision: post.revision, customer_ids: selected }); }}>
    <label className="block space-y-1 text-sm font-medium"><span>{t("Approved content")}</span><select className={field} value={postId} disabled={busy} onChange={event => { setPostId(event.target.value); resetSelection(); }}><option value="">{t("Choose a published update")}</option>{workspace.posts.map(item => <option key={item.id} value={item.id}>{item.copies[locale as MarketingLocale]?.title || item.copies.en.title}</option>)}</select></label>
    {!workspace.posts.length && <p className="text-sm">{t("Publish reviewed content in Promotions first. A public post never sends emails on its own.")} <Link className="underline" href="/salon/dashboard/promotions">{t("Open Promotions")}</Link></p>}
    <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 space-y-1 text-sm font-medium"><span>{t("Find an eligible client")}</span><input className={field} maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label><button type="button" className={button} disabled={busy} onClick={() => void run()}>{t("Search clients")}</button></div>
    <p className="text-sm text-muted">{t("Select up to 20 clients. Each client receives one email in their saved language.")} {selected.length}/20</p>
    {workspace.clients_capped && <p className="text-sm">{t("Showing the first 200 matches. Narrow your search to find more clients.")}</p>}
    {!workspace.clients.length && <p className="text-sm">{t("No eligible clients match. Clients control their own business update preferences.")}</p>}
    <div className="max-h-80 space-y-2 overflow-y-auto">{workspace.clients.map(client => <label key={client.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={selected.includes(client.id)} disabled={busy || !selected.includes(client.id) && selected.length >= 20} onChange={event => { setSelected(ids => event.target.checked ? [...ids, client.id] : ids.filter(id => id !== client.id)); resetSelection(); }}/><span className="min-w-0 break-words">{client.name} · {client.email_hint} · {names[client.locale]}</span></label>)}</div>
    <button className={button} disabled={busy || !post || !selected.length}>{t("Save selection for review")}</button>
   </form>
   <div className="space-y-3"><h3 className="font-semibold">{t("Saved updates")}</h3>{!workspace.campaigns.length && <p className="text-sm text-muted">{t("No client update is saved yet.")}</p>}{workspace.campaigns.map(item => <button key={item.id} className={`${button} mr-2 mb-2 text-left`} disabled={busy} aria-pressed={focused === item.id} onClick={() => { setFocused(item.id); setReviewed([]); }}>{item.copies[locale as MarketingLocale]?.title || item.copies.en.title} · {t(status(item))} · {formatDate(item.created_at)}</button>)}</div>
   {current && <article className="space-y-4 rounded-xl border border-border p-4" aria-label={t("Review saved selection")}>
    <h3 className="font-semibold">{t("Review saved selection")} · {t(status(current))}</h3><p className="text-sm">{t("Review each recipient language below, the selected clients and the booking destination.")}</p>
    {recipientLocales.map(language => <div key={language} lang={language} className="space-y-2 rounded-lg bg-subtle p-3"><h4 className="font-semibold">{names[language]} · {current.copies[language].title}</h4><p className="whitespace-pre-wrap break-words text-sm">{current.copies[language].body}</p>{current.status === "draft" && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={reviewed.includes(language)} disabled={busy} onChange={event => setReviewed(value => event.target.checked ? [...value, language] : value.filter(item => item !== language))}/>{t("I reviewed this language")} · {names[language]}</label>}</div>)}
    <Link className="block break-all text-sm underline" href={current.booking_path} target="_blank" rel="noopener noreferrer">{t("Book with this business")}</Link>
    <ul className="space-y-2">{current.recipients.map(client => <li key={client.id} className="rounded-lg border border-border p-3 text-sm"><p className="break-words font-medium">{client.name} · {client.email_hint} · {names[client.locale]}</p><p>{t(client.status === "skipped" && client.outcome_code === "cancelled" ? "Cancelled before sending" : recipientStatus[client.status])}</p>{client.support_reference && <p className="break-all">{t("Support reference")}: {client.support_reference}</p>}</li>)}</ul>
    {current.status === "draft" && <><p className="text-sm text-muted">{t("Approval does not send an email. Send one selected email at a time below.")}</p><button className={button} disabled={busy || !recipientLocales.every(language => reviewed.includes(language))} onClick={() => void run({ action: "confirm", id: current.id, revision: current.revision, reviewed_locales: reviewed, confirm: true })}>{t("Approve this exact selection")}</button></>}
    {current.status === "confirmed" && <button className={`${button} bg-primary text-white`} disabled={busy || !workspace.email_available || !current.recipients.some(client => client.status === "pending")} onClick={() => void run({ action: "send", id: current.id, confirm: true })}>{t("Send next approved email")}</button>}
    {current.status !== "cancelled" && <div className="space-y-2"><p className="text-sm text-muted">{t("Cancel stops only emails that have not started. Already attempted emails cannot be recalled.")}</p><button className={button} disabled={busy} onClick={() => void run({ action: "cancel", id: current.id, confirm: true })}>{t("Cancel unsent emails")}</button></div>}
    <p className="text-sm text-muted">{t("An uncertain attempt needs support review and cannot be resent here. Provider acceptance does not prove delivery or reading.")}</p>
   </article>}
  </>}
 </section>;
}
