"use client";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { PolicySummary, PlatformPolicyNotice } from "@/components/owner/BusinessPolicies";
import type { BusinessPolicy } from "@/lib/businessPolicyCore";

export type PolicyDisclosure = { id: string; policy: BusinessPolicy; version: number; source_locale: string };
export default function BusinessPolicyDisclosure({ revision }: { revision: PolicyDisclosure | null }) {
  const { translateSource: t, formatNumber } = useI18n();
  return <section id="business-policies" className="my-5 space-y-3 rounded-xl border border-plum/15 bg-white p-4 text-sm"><h2 className="font-serif text-xl">{t("Business policies")}</h2>{revision ? <><p>{t("Cancellation notice (hours)")}: {formatNumber(revision.policy.cancellation_hours)} · {t("Late-arrival grace period (minutes)")}: {formatNumber(revision.policy.grace_minutes)}</p><details><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("Read the full business policy")} · {t("Version")} {formatNumber(revision.version)}</summary><div className="mt-3"><PolicySummary policy={revision.policy}/></div><p className="mt-3 text-xs">{t("Business-written notes are shown in their original language.")}</p></details></> : <p>{t("This business has not added its own policy. Girlz Culture rules and customer protections still apply.")}</p>}<PlatformPolicyNotice /></section>;
}
