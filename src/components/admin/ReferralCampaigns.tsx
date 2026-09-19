"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import type { ReferralCampaign, ReferralTerms } from "@/lib/businessReferrals";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { referralCopy } from "@/i18n/business-referral-copy";

const endpoint = "/api/admin/referral-campaigns";
const field = "mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm";
const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold gc-disabled-control";
type Saved = { campaigns: ReferralCampaign[]; issuance_enabled: false; activation_enabled: false };
const empty = (): ReferralCampaign => ({ id: crypto.randomUUID(), title: "", revision: 0, status: "inactive", terms: { currency: "usd", amount_cents: null, recipient: null, starts_at: null, ends_at: null, minimum_payment_cents: null, qualifying_days: null, hold_days: null, max_rewards_per_referrer: null } });
export function ReferralCampaignEntry() {
 const { locale } = useI18n(); const t = (source: string) => referralCopy(locale, source);
 return <Link href="/admin/settings/referrals" className="mt-4 block rounded-xl border border-plum/10 p-4 hover:border-magenta"><h3 className="font-serif text-xl text-plum">{t("Referral campaigns")}</h3><p className="mt-2 text-sm text-ink/70">{t("Configure inactive terms for founder review.")}</p></Link>;
}
export function ReferralCampaignAccessDenied() {
 const { locale } = useI18n();
 return <p role="alert" className="rounded-xl border border-border bg-surface p-5">{referralCopy(locale, "Only a Super Admin can configure referral campaigns.")}</p>;
}
/** Engine-only configuration. Saving always leaves the campaign inactive;
 * this component has no activation, reward issuance or Stripe operation. */
export default function ReferralCampaigns() {
 const { locale } = useI18n(); const t = (source: string) => referralCopy(locale, source);
 const [campaigns, setCampaigns] = useState<ReferralCampaign[]>([]), [draft, setDraft] = useState<ReferralCampaign | null>(null);
 const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
 useEffect(() => { let active = true; void createAuthenticatedApiClient("admin").then(api => api.request<Saved>(endpoint)).then(result => { if (active) setCampaigns(result.campaigns); }).catch(failure => { if (active) setError(scopedApiErrorMessage(failure, "Referral campaigns could not be loaded.")); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, []);
 function terms<K extends keyof ReferralTerms>(key: K, value: ReferralTerms[K]) { setDraft(current => current && ({ ...current, terms: { ...current.terms, [key]: value } })); }
 async function refresh() {
  if (busy) return; setBusy(true); setError(""); setNotice("");
  try { const result = await (await createAuthenticatedApiClient("admin")).request<Saved>(endpoint); setCampaigns(result.campaigns); setNotice("Saved campaigns refreshed. Select a campaign to review its saved revision; your open edits remain available."); }
  catch (failure) { setError(scopedApiErrorMessage(failure, "Referral campaigns could not be loaded.")); }
  finally { setBusy(false); }
 }
 async function save() {
  if (!draft || busy) return; setBusy(true); setError(""); setNotice("");
  try {
   const api = await createAuthenticatedApiClient("admin");
   const saved = await api.request<Saved>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", id: draft.id, revision: draft.revision, title: draft.title, terms: draft.terms }) });
   const verified = saved.campaigns.find(campaign => campaign.id === draft.id);
   if (!verified || verified.status !== "inactive" || verified.revision !== draft.revision + 1) throw new Error("Saved referral campaign could not be verified.");
   setCampaigns(saved.campaigns); setDraft(verified); setNotice("Campaign draft saved and verified. It remains inactive.");
  } catch (failure) { setError(scopedApiErrorMessage(failure, "The campaign could not be saved. Keep your edits and retry after checking the saved revision.")); }
  finally { setBusy(false); }
 }
 return <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-label={t("Referral campaign configuration")} aria-busy={busy}>
  <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("Referral campaigns")}</h2><p className="mt-1 text-sm text-muted">{t("Configure final terms for founder review. Saving pauses a campaign. Activation and credit issuance are unavailable here.")}</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void refresh()}>{t("Refresh saved campaigns")}</button><button className={button} disabled={busy} onClick={() => { setDraft(empty()); setError(""); setNotice(""); }}>{t("New inactive campaign")}</button></div></div>
  {busy && <p role="status">{t("Checking saved campaign configuration…")}</p>}{error && <p role="alert" className="text-sm text-error">{t(error)}</p>}{notice && <p role="status" className="text-sm text-success">{t(notice)}</p>}
  {/* Titles are original content; status labels have already been localized. */}
  <ul className="flex flex-wrap gap-2">{campaigns.map(campaign => <li key={campaign.id}><button className={button} disabled={busy} onClick={() => { setDraft(structuredClone(campaign)); setError(""); setNotice(""); }}><span data-no-translate>{campaign.title}</span>{" · "}<span data-no-translate>{t(campaign.status)}</span></button></li>)}</ul>
  {draft && <form data-referral-campaign-editor className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void save(); }}>
   <label className="text-sm sm:col-span-2">{t("Campaign title")}<input className={field} required maxLength={100} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/></label>
   <label className="text-sm">{t("Recipient")}<select className={field} value={draft.terms.recipient || ""} onChange={event => terms("recipient", event.target.value as ReferralTerms["recipient"] || null)}><option value="">{t("Not configured")}</option><option value="referrer">{t("Referring business")}</option><option value="referred">{t("Referred business")}</option></select></label>
   {([['amount_cents','Reward amount (USD cents)',100000],['minimum_payment_cents','Minimum qualifying payment (USD cents)',1000000],['qualifying_days','Qualification window (days)',365],['hold_days','Review hold (days)',180],['max_rewards_per_referrer','Maximum rewards per referring business',100]] as const).map(([key,label,max]) => <label key={key} className="text-sm">{t(label)}<input className={field} type="number" min={1} max={max} step={1} value={draft.terms[key] ?? ""} onChange={event => terms(key, event.target.value === "" ? null : Number(event.target.value))}/></label>)}
   {([['starts_at','Campaign start (UTC)'],['ends_at','Campaign end (UTC)']] as const).map(([key,label]) => <label className="text-sm" key={key}>{t(label)}<input className={field} type="datetime-local" value={draft.terms[key]?.slice(0,16) || ""} onChange={event => terms(key, event.target.value ? `${event.target.value}:00.000Z` : null)}/></label>)}
   <p className="text-sm text-muted sm:col-span-2">{t("Only a new eligible subscription and a verified live Stripe payment can qualify. Self-referrals, duplicates, refunds and fraud flags require rejection or review. Historical claims retain their accepted terms. No free month or example reward is implied.")}</p>
   <button className={`${button} bg-primary text-white sm:col-span-2`} disabled={busy}>{t("Save inactive campaign")}</button>
  </form>}
 </section>;
}
