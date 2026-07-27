import type { ContentCard } from "@/lib/content";

export function isPromotionCardActive(card: ContentCard, now: number) {
  if ((card.status || "Active") !== "Active") return false;
  const startsAt = card.starts_at ? Date.parse(card.starts_at) : 0;
  const endsAt = card.ends_at ? Date.parse(card.ends_at) : 0;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
}

