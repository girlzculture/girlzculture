import { BadgeCheck, CalendarDays, Clock3, Info, Tag } from "lucide-react";
import {
  salonTrustPresentationItems,
  type SalonTrustLabelKind,
} from "@/lib/salonTrustPresentation";

const ICONS: Record<SalonTrustLabelKind, typeof Info> = {
  verification: BadgeCheck,
  pricing: Tag,
  scheduling: Clock3,
  availability: CalendarDays,
  information: Info,
};

export function SalonVerificationBadge({
  verified,
  label = "Verified Salon",
}: {
  verified: boolean;
  label?: string;
}) {
  if (!verified) return null;

  return (
    <span
      data-salon-verification-badge
      className="inline-flex items-center gap-2 rounded-full bg-blush px-3 py-1.5 text-[9px] font-semibold text-ink"
    >
      <BadgeCheck aria-hidden="true" size={14} className="text-amber" />
      {label}
    </span>
  );
}

export default function SalonTrustLabels({
  labels,
  verified,
}: {
  labels: Array<string | null | undefined>;
  verified: boolean;
}) {
  const visibleItems = salonTrustPresentationItems(labels, verified);
  if (!visibleItems.length) return null;

  return (
    <div
      data-salon-trust-labels
      data-verified={verified ? "true" : "false"}
      className="mt-4 grid grid-cols-3 gap-2"
    >
      {visibleItems.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <div
            key={`${item.kind}:${item.label}`}
            data-trust-kind={item.kind}
            className="flex min-h-[58px] items-center gap-2 rounded-[11px] border border-plum/10 bg-white/65 px-2.5 py-2"
          >
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blush ${item.kind === "verification" ? "text-amber" : "text-magenta"}`}
            >
              <Icon aria-hidden="true" size={16} />
            </span>
            <span className="min-w-0 text-[9px] font-semibold leading-tight text-ink">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
