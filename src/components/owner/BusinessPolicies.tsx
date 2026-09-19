"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n as useLocale } from "@/components/i18n/LocaleProvider";
import { getSessionForScope } from "@/lib/supabase";
import { OwnerActionError, readOwnerResponse } from "@/lib/ownerActionError";
import { POLICY_DEFAULTS, POLICY_FIELDS, POLICY_CHOICES, businessPolicyText, type BusinessPolicy } from "@/lib/businessPolicyCore";
import BusinessPolicyEditor from "@/components/owner/BusinessPolicyEditor";
import { DASHBOARD_SOURCE_MESSAGES } from "@/i18n/dashboard-source-catalog";
import { LOCALE_NAMES } from "@/i18n/catalog";

type Revision = { id: string; policy: BusinessPolicy; version: number | null; source_locale: string; published_at: string | null };
export function PolicySummary({ policy }: { policy: BusinessPolicy }) {
  const { translateSource: t, formatNumber } = useLocale();
  if (typeof policy.business_policy_text === "string") return <div className="space-y-4"><div><h3 className="font-semibold">{t("Business Policy")}</h3><p data-no-translate className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{policy.business_policy_text || t("None added")}</p></div>{policy.preparation ? <div><h3 className="font-semibold">{t("Before your appointment")}</h3><p data-no-translate className="mt-2 whitespace-pre-wrap break-words text-sm">{policy.preparation}</p></div> : null}<div className="rounded-lg bg-subtle p-3 text-sm"><h3 className="font-semibold">{t("Booking rules")}</h3><p>{t("Cancellation notice (hours)")}: {formatNumber(policy.cancellation_hours)}</p><p>{t("Rescheduling notice (hours)")}: {formatNumber(policy.rescheduling_hours)}</p><p>{t("Late-arrival grace period (minutes)")}: {formatNumber(policy.grace_minutes)}</p></div></div>;
  return <dl className="grid gap-3 sm:grid-cols-2">{POLICY_FIELDS.map(([field, label]) => <div key={field} className="min-w-0"><dt className="text-sm font-semibold">{t(label)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm" {...(field === "notes" || field === "preparation" || field === "refund_terms" ? { "data-no-translate": true } : {})}>{typeof policy[field] === "number" ? formatNumber(Number(policy[field])) : field !== "notes" && field !== "preparation" && field !== "refund_terms" && POLICY_CHOICES[String(policy[field])] ? t(POLICY_CHOICES[String(policy[field])]) : policy[field] || t("None added")}</dd></div>)}</dl>;
}
export function PlatformPolicyNotice() {
  const { translateSource: t } = useLocale();
  return <aside className="rounded-xl border border-plum/20 bg-ivory p-4 text-sm leading-6"><h2 className="font-semibold">{t("Girlz Culture Policies")}</h2><p>{t("Platform payment rules, customer protections and your legal rights always apply. Business preferences cannot override them. This tool does not provide legal advice.")}</p><p>{t("Deposits follow platform rules. The remaining balance is due after the service. Contact the business for satisfaction concerns; platform refund and Care protections still apply.")}</p><div className="mt-2 flex flex-wrap gap-4"><Link href="/terms" className="underline">{t("Terms")}</Link><Link href="/privacy" className="underline">{t("Privacy")}</Link><Link href="/help" className="underline">{t("Help & customer protection")}</Link></div></aside>;
}
export default function BusinessPolicies() {
  const { locale, translateSource: t, formatNumber, formatDate } = useLocale();
  const [policy, setPolicy] = useState<BusinessPolicy>({ ...POLICY_DEFAULTS });
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [preview, setPreview] = useState<{ revision: Revision; digest: string; expected_revision: string | null } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sourceLocale, setSourceLocale] = useState<string>(locale);
  const [publicPolicyPath, setPublicPolicyPath] = useState<string | null>(null);
  const applyReadback = useCallback((result: { revisions?: Revision[]; current?: string | null; public_policy_path?: string | null }, expectedRevision?: string) => {
    if (!Array.isArray(result.revisions)) throw new Error("POLICY_UNAVAILABLE");
    const current = result.revisions.find(item => item.id === result.current);
    if (result.current && !current?.published_at || expectedRevision && current?.id !== expectedRevision) throw new Error("POLICY_UNAVAILABLE");
    setRevisions(result.revisions);
    if (current) {
      setPolicy({ ...POLICY_DEFAULTS, ...current.policy, business_policy_text: businessPolicyText(current.policy, text => DASHBOARD_SOURCE_MESSAGES[current.source_locale]?.[text] || text) });
      setSourceLocale(current.source_locale);
    } else setPolicy({ ...POLICY_DEFAULTS, business_policy_text: "" });
    setPublicPolicyPath(result.public_policy_path?.startsWith("/") && !result.public_policy_path.startsWith("//") ? result.public_policy_path : null);
  }, []);
  const call = useCallback(async (body?: Record<string, unknown>) => {
    const session = await getSessionForScope("salon");
    if (!session) throw new Error("AUTH_REQUIRED");
    const response = await fetch("/api/salon/policies", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    return readOwnerResponse(response, "POLICY_UNAVAILABLE");
  }, []);
  useEffect(() => { let active = true; void call().then(result => { if (active) { applyReadback(result); setLoaded(true); setNotice(""); setReference(""); } }).catch(error => { if (active) { setNotice("Business policies are temporarily unavailable."); setReference(error instanceof OwnerActionError ? error.reference : ""); } }); return () => { active = false; }; }, [call, applyReadback, loadAttempt]);
  async function save(publish: boolean) {
    if (!loaded || busy) return;
    setBusy(true); setNotice(""); setReference("");
    try {
      if (publish && preview && reviewed) {
        const result = await call({ action: "publish", revision_id: preview.revision.id, digest: preview.digest, expected_revision: preview.expected_revision, confirm: true, platform_rules_acknowledged: true, source_reviewed: true });
        if (result.verified !== true || !result.revision?.id) throw new Error("POLICY_UNAVAILABLE");
        applyReadback(await call(), result.revision.id);
        setPreview(null); setReviewed(false); setNotice("Business policies published.");
      } else if (!publish) {
        const result = await call({ action: "draft", locale: sourceLocale, policy }); setPreview(result); setReviewed(false); setNotice("Draft saved. Review before publishing.");
      }
    } catch (error) {
      setReference(error instanceof OwnerActionError ? error.reference : "");
      const code = error instanceof Error ? error.message : "";
      setNotice(code === "PLATFORM_POLICY_CONFLICT" ? "These preferences conflict with platform protections. Review the payment and policy rules." : code === "POLICY_PREVIEW_STALE" ? "The published policy changed. Refresh and review a new draft." : code === "POLICY_INVALID" ? "Check the policy fields and try again." : code === "PLAN_ACCESS_REQUIRED" ? "Open Subscription to review your business access." : "Business policies are temporarily unavailable.");
    } finally { setBusy(false); }
  }
  return <section className="space-y-6"><div><Link href="/salon/dashboard/my-page" className="text-sm underline">{t("Back to My Page")}</Link><h1 className="mt-3 font-serif text-3xl text-plum">{t("Your Business Policies")}</h1><p className="mt-2 text-sm">{t("Set clear expectations for appointments. Changes apply to future bookings after you publish.")}</p></div><PlatformPolicyNotice /><p className="text-sm">{t("Business refund and satisfaction terms apply to services and amounts handled directly by this business. Girlz Culture deposits, payment processes and mandatory protections remain governed by platform rules and applicable law.")}</p>
    {publicPolicyPath && revisions.some(row => row.published_at) ? <Link href={publicPolicyPath} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold underline">{t("View Public Page")}</Link> : null}
    <p role="status" className="text-sm">{t(notice)}</p>
    {reference ? <p className="break-words text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
    {!loaded && notice ? <button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="min-h-11 rounded-lg border border-border px-4">{t("Retry loading policies")}</button> : null}
    {preview ? <div className="space-y-5 rounded-2xl border border-plum/20 bg-white p-5"><h2 className="font-serif text-xl">{t("Review policy draft")}</h2><PolicySummary policy={preview.revision.policy}/><p className="text-sm">{t("Review the original wording carefully. Sensitive legal and payment translations need founder or native-language review before they are treated as final.")}</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1 h-5 w-5"/>{t("I reviewed this policy in its original language and understand that platform rules and legal rights take precedence.")}</label><div className="flex flex-wrap gap-3"><button disabled={busy || !reviewed} onClick={() => void save(true)} className="min-h-11 rounded-full bg-plum px-5 text-white gc-disabled-control">{t(busy ? "Publishing…" : "Confirm and publish")}</button><button disabled={busy} onClick={() => setPreview(null)} className="min-h-11 rounded-full border px-5">{t("Keep editing")}</button></div></div> : <form onSubmit={event => { event.preventDefault(); void save(false); }} className="space-y-5 rounded-2xl border border-plum/20 bg-white p-5"><label className="block text-sm font-semibold">{t("Policy language")}<select data-no-translate value={sourceLocale} disabled={!loaded || busy} onChange={event => setSourceLocale(event.target.value)} className="mt-2 min-h-11 rounded-lg border border-border p-3">{[...new Set(["en","fr","es","zh-CN",sourceLocale])].map(code => <option key={code} value={code}>{LOCALE_NAMES[code] || code}</option>)}</select></label><BusinessPolicyEditor policy={policy} onChange={setPolicy} disabled={!loaded || busy}/><button disabled={busy || !loaded} className="min-h-11 rounded-full bg-plum px-5 text-white gc-disabled-control">{t(busy ? "Saving…" : "Save draft and review")}</button></form>}
    <section><h2 className="font-serif text-xl">{t("Policy history")}</h2>{revisions.filter(row => row.published_at).length ? <ul className="mt-3 space-y-3">{revisions.filter(row => row.published_at).map(row => <li key={row.id}><details className="rounded-xl border p-4"><summary className="cursor-pointer">{t("Version")} {formatNumber(row.version || 0)} · {formatDate(row.published_at!, { dateStyle: "medium" })}</summary><div className="mt-4"><PolicySummary policy={row.policy}/></div></details></li>)}</ul> : <p className="mt-2 text-sm">{t("No published policies yet.")}</p>}</section>
  </section>;
}
