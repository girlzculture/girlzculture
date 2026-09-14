"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n as useLocale } from "@/components/i18n/LocaleProvider";
import { getSessionForScope } from "@/lib/supabase";
import { OwnerActionError, ownerResponseError } from "@/lib/ownerActionError";
import { POLICY_DEFAULTS, POLICY_FIELDS, POLICY_CHOICES, policyOptions, type BusinessPolicy } from "@/lib/businessPolicyCore";

type Revision = { id: string; policy: BusinessPolicy; version: number | null; source_locale: string; published_at: string | null };
export function PolicySummary({ policy }: { policy: BusinessPolicy }) {
  const { translateSource: t, formatNumber } = useLocale();
  return <dl className="grid gap-3 sm:grid-cols-2">{POLICY_FIELDS.map(([field, label]) => <div key={field} className="min-w-0"><dt className="text-sm font-semibold">{t(label)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm" {...(field === "notes" || field === "preparation" ? { "data-no-translate": true } : {})}>{typeof policy[field] === "number" ? formatNumber(Number(policy[field])) : POLICY_CHOICES[String(policy[field])] ? t(POLICY_CHOICES[String(policy[field])]) : policy[field] || t("None added")}</dd></div>)}</dl>;
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
  const call = useCallback(async (body?: Record<string, unknown>) => {
    const session = await getSessionForScope("salon");
    if (!session) throw new Error("AUTH_REQUIRED");
    const response = await fetch("/api/salon/policies", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw ownerResponseError(result, "POLICY_UNAVAILABLE");
    return result;
  }, []);
  useEffect(() => { let active = true; void call().then(result => { if (active) { setRevisions(result.revisions); const current = result.revisions.find((item: Revision) => item.id === result.current); if (current) setPolicy(current.policy); } }).catch(error => { if (active) { setNotice("Business policies are temporarily unavailable."); setReference(error instanceof OwnerActionError ? error.reference : ""); } }); return () => { active = false; }; }, [call]);
  async function save(publish: boolean) {
    setBusy(true); setNotice(""); setReference("");
    try {
      if (publish && preview && reviewed) {
        const result = await call({ action: "publish", revision_id: preview.revision.id, digest: preview.digest, expected_revision: preview.expected_revision, confirm: true, platform_rules_acknowledged: true, source_reviewed: true });
        setRevisions(rows => [result.revision, ...rows.filter(row => row.id !== result.revision.id)]); setPreview(null); setReviewed(false); setNotice("Business policies published.");
      } else if (!publish) {
        const result = await call({ action: "draft", locale, policy }); setPreview(result); setReviewed(false); setNotice("Draft saved. Review before publishing.");
      }
    } catch (error) {
      setReference(error instanceof OwnerActionError ? error.reference : "");
      const code = error instanceof Error ? error.message : "";
      setNotice(code === "PLATFORM_POLICY_CONFLICT" ? "These preferences conflict with platform protections. Review the payment and policy rules." : code === "POLICY_PREVIEW_STALE" ? "The published policy changed. Refresh and review a new draft." : code === "POLICY_INVALID" ? "Check the policy fields and try again." : code === "PLAN_ACCESS_REQUIRED" ? "Open Subscription to review your business access." : "Business policies are temporarily unavailable.");
    } finally { setBusy(false); }
  }
  return <section className="space-y-6"><div><Link href="/salon/dashboard/my-page" className="text-sm underline">{t("Back to My Page")}</Link><h1 className="mt-3 font-serif text-3xl text-plum">{t("Your Business Policies")}</h1><p className="mt-2 text-sm">{t("Set clear expectations for appointments. Changes apply to future bookings after you publish.")}</p></div><PlatformPolicyNotice />
    <p role="status" className="text-sm">{t(notice)}</p>
    {reference ? <p className="break-words text-xs">{t("Support reference")}: <span data-no-translate>{reference}</span></p> : null}
    {preview ? <div className="space-y-5 rounded-2xl border border-plum/20 bg-white p-5"><h2 className="font-serif text-xl">{t("Review policy draft")}</h2><PolicySummary policy={preview.revision.policy}/><p className="text-sm">{t("Review the original wording carefully. Sensitive legal and payment translations need founder or native-language review before they are treated as final.")}</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1 h-5 w-5"/>{t("I reviewed this policy in its original language and understand that platform rules and legal rights take precedence.")}</label><div className="flex flex-wrap gap-3"><button disabled={busy || !reviewed} onClick={() => void save(true)} className="min-h-11 rounded-full bg-plum px-5 text-white disabled:opacity-50">{t(busy ? "Publishing…" : "Confirm and publish")}</button><button disabled={busy} onClick={() => setPreview(null)} className="min-h-11 rounded-full border px-5">{t("Keep editing")}</button></div></div> : <form onSubmit={event => { event.preventDefault(); void save(false); }} className="space-y-5 rounded-2xl border border-plum/20 bg-white p-5"><div className="grid gap-5 sm:grid-cols-2">{POLICY_FIELDS.map(([field,label]) => <div key={field} className="block text-sm font-semibold"><label htmlFor={`business-policy-${field}`}>{t(label)}</label>{typeof policy[field] === "number" ? <input id={`business-policy-${field}`} type="number" min={0} max={field === "grace_minutes" ? 60 : 168} required value={policy[field]} onChange={event => setPolicy({ ...policy, [field]: event.target.valueAsNumber })} className="mt-2 block min-h-11 w-full rounded-lg border p-3"/> : policyOptions(field).length ? <select id={`business-policy-${field}`} value={policy[field]} onChange={event => setPolicy({ ...policy, [field]: event.target.value })} className="mt-2 block min-h-11 w-full rounded-lg border p-3">{policyOptions(field).map(value => <option value={value} key={value}>{t(POLICY_CHOICES[value])}</option>)}</select> : <textarea id={`business-policy-${field}`} data-no-translate maxLength={1200} value={policy[field]} onChange={event => setPolicy({ ...policy, [field]: event.target.value })} className="mt-2 block min-h-28 w-full rounded-lg border p-3"/>}</div>)}</div><button disabled={busy} className="min-h-11 rounded-full bg-plum px-5 text-white disabled:opacity-50">{t(busy ? "Saving…" : "Save draft and review")}</button></form>}
    <section><h2 className="font-serif text-xl">{t("Policy history")}</h2>{revisions.filter(row => row.published_at).length ? <ul className="mt-3 space-y-3">{revisions.filter(row => row.published_at).map(row => <li key={row.id}><details className="rounded-xl border p-4"><summary className="cursor-pointer">{t("Version")} {formatNumber(row.version || 0)} · {formatDate(row.published_at!, { dateStyle: "medium" })}</summary><div className="mt-4"><PolicySummary policy={row.policy}/></div></details></li>)}</ul> : <p className="mt-2 text-sm">{t("No published policies yet.")}</p>}</section>
  </section>;
}
