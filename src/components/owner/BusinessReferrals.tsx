"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import { scopedApiErrorMessage } from "@/lib/scopedApiCore";
import type { ReferralWorkspace } from "@/lib/businessReferrals";
import { referralCopy } from "@/i18n/business-referral-copy";
const endpoint = "/api/salon/referrals";
const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold gc-disabled-control";
export function SubscriptionReferralNavigation({ referrals }: { referrals: boolean }) {
 const { locale } = useI18n(); const t = (source: string) => referralCopy(locale, source);
 return <nav className="flex flex-wrap gap-2" aria-label={t("Subscription workspaces")}><Link href="/salon/dashboard/subscription" aria-current={!referrals ? "page" : undefined} className={`${button} ${!referrals ? "bg-primary text-white" : "bg-surface"}`}>{t("Subscription")}</Link><Link href="/salon/dashboard/subscription/referrals" aria-current={referrals ? "page" : undefined} className={`${button} ${referrals ? "bg-primary text-white" : "bg-surface"}`}>{t("Business referrals")}</Link></nav>;
}
export default function BusinessReferrals({ businessId }: { businessId: string }) { return <ReferralWorkspacePanel key={businessId}/>; }
function ReferralWorkspacePanel() {
 const { locale, formatCurrency, formatDate } = useI18n();
 const t = (source: string) => referralCopy(locale, source);
 const [workspace, setWorkspace] = useState<ReferralWorkspace | null>(null);
 const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
 const [code, setCode] = useState(""), [confirm, setConfirm] = useState(false);
 const pending = useRef(false), generation = useRef(0);
 const load = useCallback(async () => (await createAuthenticatedApiClient("salon")).request<ReferralWorkspace>(endpoint), []);
 useEffect(() => {
  const current = ++generation.current;
  void load().then(data => { if (current === generation.current) setWorkspace(data); }).catch(failure => { if (current === generation.current) setError(scopedApiErrorMessage(failure, "Referral status could not be verified. Retry to check your saved records.")); }).finally(() => { if (current === generation.current) setBusy(false); });
  return () => { generation.current = current + 1; };
 }, [load]);
 async function run(body: Record<string, unknown>) {
  if (pending.current) return;
  pending.current = true; const current = generation.current; setBusy(true); setError(""); setNotice("");
  try {
   const api = await createAuthenticatedApiClient("salon");
   const fresh = await api.request<ReferralWorkspace>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
   if (current !== generation.current) return;
   setWorkspace(fresh); setNotice(fresh.verification_pending ? "Some payment checks need another refresh or billing review." : body.action === "claim" ? "Referral recorded and verified." : "Saved referral status refreshed.");
   if (body.action === "claim") { setCode(""); setConfirm(false); }
  } catch (failure) { if (current === generation.current) setError(scopedApiErrorMessage(failure, "Referral status could not be verified. Retry to check your saved records.")); }
  finally { pending.current = false; if (current === generation.current) setBusy(false); }
 }
 return <section className="space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6" aria-labelledby="business-referrals-title" aria-busy={busy}>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="business-referrals-title" className="text-lg font-semibold">{t("Business referrals")}</h2><p className="mt-1 max-w-2xl text-sm text-muted">{t("Campaign terms determine who qualifies. No credit has been issued from this workspace.")}</p></div><button className={button} disabled={busy} onClick={() => void run({ action: "refresh" })}>{t("Refresh referral status")}</button></div>
  {busy && <p role="status" className="text-sm text-muted">{t("Checking saved referrals…")}</p>}
  {error && <p role="alert" className="rounded-lg border border-error p-3 text-sm text-error">{t(error)}</p>}
  {notice && <p role="status" className="text-sm text-success">{t(notice)}</p>}
  {workspace && <>
   {!workspace.campaigns.length ? <p className="rounded-xl bg-subtle p-4 text-sm">{t("No referral campaign is active. Final terms must be configured and authorized before referrals can qualify.")}</p> : <div className="grid gap-3 lg:grid-cols-2">{workspace.campaigns.map(campaign => {
    const ownCode = workspace.codes.find(item => item.campaign_id === campaign.id);
    return <article key={campaign.id} className="min-w-0 space-y-3 rounded-xl border border-border p-4"><h3 className="font-semibold">{campaign.title}</h3><p className="text-sm">{formatCurrency((campaign.terms.amount_cents || 0) / 100, "USD")} · {t(campaign.terms.recipient === "referrer" ? "For the referring business" : "For the referred business")}</p><p className="text-sm text-muted">{campaign.terms.starts_at && formatDate(campaign.terms.starts_at)} – {campaign.terms.ends_at && formatDate(campaign.terms.ends_at)}</p><dl className="grid grid-cols-2 gap-2 text-sm"><dt>{t("Minimum qualifying payment")}</dt><dd>{formatCurrency((campaign.terms.minimum_payment_cents || 0) / 100, "USD")}</dd><dt>{t("Qualification window (days)")}</dt><dd>{campaign.terms.qualifying_days}</dd><dt>{t("Review hold (days)")}</dt><dd>{campaign.terms.hold_days}</dd><dt>{t("Campaign referral limit")}</dt><dd>{campaign.terms.max_rewards_per_referrer}</dd></dl><p className="text-xs text-muted">{t("An eligible new subscription and verified payment are required. Self-referrals, duplicate claims and reversed payments do not qualify. Review is required before any credit.")}</p>{ownCode ? <label className="block text-sm">{t("Your referral code")}<input className="mt-1 min-h-11 w-full rounded-lg border border-border bg-subtle px-3 font-mono text-xs" readOnly value={ownCode.code} onFocus={event => event.currentTarget.select()}/></label> : <button className={button} disabled={busy} onClick={() => void run({ action: "code", campaign_id: campaign.id })}>{t("Create my referral code")}</button>}</article>;
   })}</div>}
   {workspace.claim ? <p className="text-sm">{t("Your recorded referral")}: {workspace.claim.campaign_title} · {t(workspace.claim.status)}</p> : workspace.campaigns.length > 0 && <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={event => { event.preventDefault(); void run({ action: "claim", code, confirm }); }}><label className="block text-sm font-medium">{t("Referral code from another business")}<input required maxLength={32} pattern="[a-fA-F0-9]{32}" autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3" value={code} onChange={event => { setCode(event.target.value); setConfirm(false); }}/></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} onChange={event => setConfirm(event.target.checked)}/>{t("I have reviewed the campaign terms. This attribution cannot be replaced after it is recorded.")}</label><button className={`${button} bg-primary text-white`} disabled={busy || !confirm}>{t("Record referral")}</button></form>}
   <div className="space-y-3"><h3 className="font-semibold">{t("Your reward records")}</h3>{!workspace.rewards.length ? <p className="text-sm text-muted">{t("No qualifying reward is recorded for your business.")}</p> : <ul className="space-y-2">{workspace.rewards.map(reward => <li key={reward.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-border p-4"><div><p className="font-medium">{reward.campaign_title}</p><p className="text-sm text-muted">{t(reward.status === "on_hold" ? "On hold for review" : "Qualifying payment verified — awaiting review")}</p><p className="text-xs text-muted">{t("Earliest review date")}: {formatDate(reward.eligible_at)}</p></div><p className="font-semibold">{formatCurrency(reward.amount_cents / 100, reward.currency.toUpperCase())}<span className="block text-xs font-normal text-muted">{t("Not issued")}</span></p></li>)}</ul>}</div>
  </>}
 </section>;
}
