"use client";
import { useI18n } from "@/components/i18n/LocaleProvider";
import BusinessPolicyDisclosure from "@/components/booking/BusinessPolicyDisclosure";
import { validateBusinessPolicy } from "@/lib/businessPolicyCore";

/** Render the immutable booking evidence, never today's business policy. */
export default function BookingPolicyEvidence({ booking }: { booking: Record<string, unknown> }) {
  const { translateSource: t } = useI18n();
  if (booking.booking_origin === "business_added") return <p className="my-4 text-sm">{t("Business-added appointment. The customer did not accept policies or join a Girlz Culture conversation through this booking.")}</p>;
  let revision = null;
  if (booking.business_policy_revision_id && booking.business_policy_version) {
    try {
      revision = { id: String(booking.business_policy_revision_id), version: Number(booking.business_policy_version), source_locale: "und", policy: validateBusinessPolicy(booking.business_policy_snapshot) };
    } catch {
      return <p role="status" className="my-4 text-sm">{t("The saved policy could not be displayed. Contact support with your booking reference.")}</p>;
    }
  }
  return <details className="my-4 rounded-xl border border-plum/15 p-3 text-left text-sm"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t("Policy recorded for this booking")}</summary>{revision ? <BusinessPolicyDisclosure revision={revision}/> : <p>{t("No business policy was recorded for this booking. Girlz Culture rules and customer protections still apply.")}</p>}</details>;
}
