"use client";
import { useI18n } from "@/components/i18n/LocaleProvider";
import type { BusinessPolicy } from "@/lib/businessPolicyCore";

export default function BusinessPolicyEditor({ policy, onChange, disabled }: { policy: BusinessPolicy; onChange: (policy: BusinessPolicy) => void; disabled: boolean }) {
  const { translateSource: t } = useI18n();
  return <fieldset disabled={disabled} className="space-y-5 gc-disabled-control">
    <div>
      <label htmlFor="business-policy-text" className="block font-serif text-xl font-semibold">{t("Business Policy")}</label>
      <p id="business-policy-guidance" className="my-2 text-sm text-text-secondary">{t("Explain cancellations, missed appointments, late arrivals, guests and service concerns in your own words. Check that your wording matches the booking rules below.")}</p>
      <textarea id="business-policy-text" data-no-translate aria-describedby="business-policy-guidance" rows={12} maxLength={12000} value={policy.business_policy_text || ""} onChange={event => onChange({ ...policy, business_policy_text: event.target.value })} className="block w-full rounded-xl border border-border p-3 text-sm leading-6" />
      <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("Writing guidance")}</summary><p>{t("Include how customers contact you, the notice you need, what happens if they arrive late, preparation and guest arrangements, and how you handle service concerns. Only include terms you actually use.")}</p></details>
    </div>
    <div><label htmlFor="business-policy-preparation" className="block text-sm font-semibold">{t("Before your appointment")}</label><textarea id="business-policy-preparation" data-no-translate rows={3} maxLength={1200} value={policy.preparation} onChange={event => onChange({ ...policy, preparation: event.target.value })} className="mt-2 block w-full rounded-xl border border-border p-3 text-sm" /></div>
    <details className="rounded-xl border border-border p-3"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("Booking rules")}</summary>
      <p className="mb-3 text-sm text-text-secondary">{t("These settings control booking behavior. Writing a different time in your policy does not change them.")}</p>
      <div className="grid gap-4 sm:grid-cols-3">{([['cancellation_hours', 'Cancellation notice (hours)'], ['rescheduling_hours', 'Rescheduling notice (hours)'], ['grace_minutes', 'Late-arrival grace period (minutes)']] as const).map(([key, label]) => <label key={key} className="text-sm font-semibold">{t(label)}<input type="number" required min={0} max={key === 'grace_minutes' ? 60 : 168} value={policy[key]} onChange={event => onChange({ ...policy, [key]: event.target.valueAsNumber })} className="mt-2 min-h-11 w-full rounded-lg border border-border p-3" /></label>)}</div>
    </details>
  </fieldset>;
}
