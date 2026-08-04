import type { ContentCard } from "@/lib/content";
import { distanceMiles, validCoordinates } from "@/lib/location";

type Coordinates = { lat: number; lng: number };

export const DEFAULT_HOMEPAGE_PROMOTION_COUNT = 8;
export const MAX_HOMEPAGE_PROMOTION_COUNT = 20;
export const MAX_HOMEPAGE_PROMOTION_SOURCE_COUNT = 200;

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function promotionCardIdentity(card: ContentCard) {
  if (card.association_type === "campaign" && card.campaign_id) {
    return `campaign:${normalized(card.campaign_id)}`;
  }
  if (card.association_type === "salon" && card.salon_id) {
    return `salon:${normalized(card.salon_id)}`;
  }
  const destination = normalized(card.href);
  const media = normalized(card.media_url);
  if (destination || media) return `editorial:${destination}|${media}`;
  return `card:${normalized(card.id)}|${normalized(card.title)}`;
}

export function uniquePromotionCards(cards: ContentCard[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const identity = promotionCardIdentity(card);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function configuredRadius(card: ContentCard) {
  const radius = Number(card.radius_miles || 25);
  return Number.isFinite(radius) ? Math.max(1, Math.min(250, radius)) : 25;
}

function targetCoordinates(card: ContentCard): Coordinates | null {
  const coordinates = {
    lat: Number(card.target_latitude),
    lng: Number(card.target_longitude),
  };
  return validCoordinates(coordinates) ? coordinates : null;
}

function boundedRotationWeight(card: ContentCard) {
  const weight = Number(card.rotation_weight ?? 1);
  return Number.isFinite(weight) ? Math.max(0.1, Math.min(100, weight)) : 1;
}

function configuredPriority(card: ContentCard) {
  const priority = Number(card.priority ?? 50);
  return Number.isFinite(priority) ? Math.max(0, Math.min(100, priority)) : 50;
}

/**
 * FNV-1a gives the browser and server the same inexpensive 32-bit value. The
 * hour and coarse location are part of the seed, so a rail is stable during a
 * visit while higher-weight cards receive proportionally more first-place
 * opportunities as the rotation bucket changes.
 */
function deterministicUnitInterval(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) + 1) / 4_294_967_297;
}

export function promotionRotationScore(
  card: ContentCard,
  now: number,
  location?: Coordinates | null,
) {
  const hourBucket = Math.floor(now / 3_600_000);
  const locationBucket =
    location && validCoordinates(location)
      ? `${location.lat.toFixed(2)}:${location.lng.toFixed(2)}`
      : "global";
  const unit = deterministicUnitInterval(
    `${promotionCardIdentity(card)}:${hourBucket}:${locationBucket}`,
  );
  // Exponential-race ordering is deterministic for a seed and gives a card's
  // configured weight a real proportional effect (lower score ranks first).
  return -Math.log(unit) / boundedRotationWeight(card);
}

function rank(
  left: ContentCard,
  right: ContentCard,
  now: number,
  location?: Coordinates | null,
) {
  const priority = configuredPriority(right) - configuredPriority(left);
  if (priority) return priority;
  const weightedRotation =
    promotionRotationScore(left, now, location) -
    promotionRotationScore(right, now, location);
  if (weightedRotation) return weightedRotation;
  if (!location || !validCoordinates(location)) {
    return promotionCardIdentity(left).localeCompare(promotionCardIdentity(right));
  }
  const leftTarget = targetCoordinates(left);
  const rightTarget = targetCoordinates(right);
  const leftDistance = leftTarget ? distanceMiles(location, leftTarget) : Number.POSITIVE_INFINITY;
  const rightDistance = rightTarget ? distanceMiles(location, rightTarget) : Number.POSITIVE_INFINITY;
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;
  return promotionCardIdentity(left).localeCompare(promotionCardIdentity(right));
}

/**
 * Selects a complete, distinct local promotion pool. Cards with coordinates
 * are never shown outside their administrator-controlled radius. Empty local
 * positions are filled only by explicitly global editorial fallback cards.
 */
export function selectLocalPromotionCards(input: {
  cards: ContentCard[];
  now: number;
  customerLocation?: Coordinates | null;
  limit?: number;
}) {
  const limit = Math.max(
    1,
    Math.min(
      MAX_HOMEPAGE_PROMOTION_COUNT,
      Math.round(input.limit || DEFAULT_HOMEPAGE_PROMOTION_COUNT),
    ),
  );
  const active = uniquePromotionCards(
    input.cards.filter((card) => isPromotionCardActive(card, input.now)),
  );
  const globalFallbacks = active.filter((card) => {
    if (targetCoordinates(card)) return false;
    const associated =
      card.association_type === "salon" ||
      card.association_type === "campaign" ||
      Boolean(card.salon_id || card.campaign_id);
    // Existing administrator-authored image/GIF cards predate the
    // editorial_fallback flag. Treat every unassociated, untargeted card as a
    // global editorial card so a saved GIF cannot silently disappear after a
    // reload. Associated cards still require verified coordinates and radius.
    return !associated;
  }).sort((left, right) => rank(left, right, input.now, input.customerLocation));
  if (!input.customerLocation || !validCoordinates(input.customerLocation)) {
    return globalFallbacks.slice(0, limit);
  }
  const local = active
    .filter((card) => {
      const target = targetCoordinates(card);
      return Boolean(
        target &&
          distanceMiles(input.customerLocation!, target!) <= configuredRadius(card),
      );
    })
    .sort((left, right) =>
      rank(left, right, input.now, input.customerLocation!),
    );
  return uniquePromotionCards([...local, ...globalFallbacks]).slice(0, limit);
}

export function isPromotionCardActive(card: ContentCard, now: number) {
  if ((card.status || "Active") !== "Active") return false;
  const startsAt = card.starts_at ? Date.parse(card.starts_at) : 0;
  const endsAt = card.ends_at ? Date.parse(card.ends_at) : 0;
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);
}
