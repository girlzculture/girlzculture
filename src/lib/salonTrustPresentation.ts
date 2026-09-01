export type SalonTrustLabelKind =
  | "verification"
  | "pricing"
  | "scheduling"
  | "availability"
  | "information";

export type SalonTrustPresentationItem = {
  label: string;
  kind: SalonTrustLabelKind;
};

const normalizeCmsLabel = (label: string) =>
  label
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");

/**
 * An unverified salon may show only platform-backed, neutral discovery facts.
 * Keys are exact normalized CMS values: this is deliberately a positive
 * allowlist, not a denylist that can be bypassed with a new synonym for
 * verified, approved, vetted, licensed, certified, or background checked.
 */
const UNVERIFIED_NEUTRAL_LABELS = new Map<
  string,
  SalonTrustPresentationItem
>([
  [
    "transparent pricing",
    { label: "Pricing shown upfront", kind: "pricing" },
  ],
  ["time respected", { label: "Appointment timing", kind: "scheduling" }],
  [
    "real availability",
    { label: "Current availability", kind: "availability" },
  ],
]);

const VERIFICATION_CLAIM =
  /\b(?:accredit(?:ed|ation)?|approv(?:ed|al)|background[ -]?check(?:ed)?|certif(?:ied|ication)|identity|licen[cs](?:e|ed|ing)|screen(?:ed|ing)|trust(?:ed|worthy)?|vet(?:ted|ting)|verif(?:y|ied|ication))\b/i;
const PRICING_CLAIM = /\b(?:cost|fee|price|pricing|transparent|upfront)\b/i;
const SCHEDULING_CLAIM =
  /\b(?:appointment|on[ -]?time|punctual|schedule|scheduling|time|timing)\b/i;
const AVAILABILITY_CLAIM = /\b(?:availability|available|opening|openings)\b/i;

function semanticKind(label: string): SalonTrustLabelKind {
  if (VERIFICATION_CLAIM.test(label)) return "verification";
  if (PRICING_CLAIM.test(label)) return "pricing";
  if (SCHEDULING_CLAIM.test(label)) return "scheduling";
  if (AVAILABILITY_CLAIM.test(label)) return "availability";
  return "information";
}

export function salonTrustPresentationItems(
  labels: Array<string | null | undefined>,
  verified: boolean,
): SalonTrustPresentationItem[] {
  const items = labels
    .map((label) => String(label || "").trim())
    .filter(Boolean)
    .map((label) => {
      if (verified) return { label, kind: semanticKind(label) };
      return UNVERIFIED_NEUTRAL_LABELS.get(normalizeCmsLabel(label)) || null;
    })
    .filter((item): item is SalonTrustPresentationItem => Boolean(item));

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${normalizeCmsLabel(item.label)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Compatibility helper for source/server tests that need only visible copy.
 * Components should use salonTrustPresentationItems so icons are selected from
 * the label's meaning rather than its array position.
 */
export function visibleSalonTrustLabels(
  labels: Array<string | null | undefined>,
  verified: boolean,
) {
  return salonTrustPresentationItems(labels, verified).map(
    (item) => item.label,
  );
}
