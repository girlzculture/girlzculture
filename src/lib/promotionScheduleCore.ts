export type PromotionScheduleRecord = {
  status?: unknown;
  starts_at?: string | null;
  ends_at?: string | null;
};

/** Pure schedule predicate shared by the public promotion resolver and its
 * executable regression tests. Invalid dates are treated as absent here;
 * publication validation rejects malformed administrator input upstream. */
export function isPromotionCardActive(
  card: PromotionScheduleRecord,
  now: number,
) {
  if (String(card.status || "Active") !== "Active") return false;
  const startsAt = card.starts_at ? Date.parse(card.starts_at) : 0;
  const endsAt = card.ends_at ? Date.parse(card.ends_at) : 0;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
}
