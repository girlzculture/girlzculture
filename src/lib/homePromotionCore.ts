import type { ContentCard } from "@/lib/content";
import { distanceMiles, validCoordinates } from "@/lib/location";

type Coordinates = { lat: number; lng: number };

export const DEFAULT_HOMEPAGE_PROMOTION_COUNT = 8;
export const MAX_HOMEPAGE_PROMOTION_COUNT = 20;
export const MAX_HOMEPAGE_PROMOTION_SOURCE_COUNT = 200;

/**
 * Built-in editorial cards are presentation fallbacks, not administrator
 * records. Keeping the canonical collection in this client-safe core lets the
 * public resolver and the Content Management preview use the same identities
 * without ever writing these cards into the editor.
 */
export const HOMEPAGE_EDITORIAL_FALLBACKS: ContentCard[] = [
  { id: "editorial-nearby", content_type: "image", title: "Find trusted salons nearby", body: "See verified beauty professionals close to you.", media_url: "/images/salon-warm.jpg", href: "/salons", cta_label: "Find a salon", alt_text: "Warm, modern beauty salon interior", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-knotless", content_type: "image", title: "Knotless braids, clear prices", body: "Compare real service details before you reserve.", media_url: "/images/braids-knotless.jpg", href: "/styles?style=knotless-braids", cta_label: "Browse knotless", alt_text: "Client wearing knotless braids", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-box", content_type: "image", title: "Explore box braids", body: "Choose a salon, stylist, length, and available time.", media_url: "/images/braids-box.jpg", href: "/styles?style=box-braids", cta_label: "Explore styles", alt_text: "Detailed box braid hairstyle", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-cornrows", content_type: "image", title: "Cornrow specialists", body: "Discover local professionals and verified client reviews.", media_url: "/images/braids-cornrows.jpg", href: "/styles?style=cornrows", cta_label: "See specialists", alt_text: "Client wearing neat cornrows", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-book", content_type: "image", title: "Reserve with confidence", body: "Choose an available appointment with clear pricing.", media_url: "/images/hero-braids.jpg", href: "/salons", cta_label: "Book now", alt_text: "Client with a finished braided hairstyle", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-how", content_type: "image", title: "How Girlz Culture works", body: "From discovery to a verified review, see every step.", media_url: "/images/salon-modern.jpg", href: "/how-it-works", cta_label: "How it works", alt_text: "Bright contemporary beauty salon", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-partner", content_type: "image", title: "Built for salon owners", body: "Manage services, availability, bookings, and your public page.", media_url: "/images/salon-blush.jpg", href: "/partner", cta_label: "Partner with us", alt_text: "Blush-toned salon interior", status: "Active", editorial_fallback: true, priority: 0 },
  { id: "editorial-trust", content_type: "image", title: "Real work. Real reviews.", body: "Book from transparent salon profiles with verified feedback.", media_url: "/images/salon-dark.jpg", href: "/how-it-works", cta_label: "Safety and trust", alt_text: "Premium dark-toned salon interior", status: "Active", editorial_fallback: true, priority: 0 },
];

const HOMEPAGE_PROMOTION_MATERIAL_FIELDS: Array<keyof ContentCard> = [
  "content_type",
  "source_kind",
  "association_type",
  "salon_id",
  "campaign_id",
  "title",
  "body",
  "media_url",
  "href",
  "cta_label",
  "alt_text",
  "status",
  "starts_at",
  "ends_at",
  "market_id",
  "target_label",
  "target_latitude",
  "target_longitude",
  "radius_miles",
  "priority",
  "rotation_weight",
];

function exactMaterialValue(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export function isCanonicalHomepageFallback(card: ContentCard) {
  const canonical = HOMEPAGE_EDITORIAL_FALLBACKS.find(
    (fallback) => fallback.id === card.id,
  );
  if (!canonical) return false;
  return card.editorial_fallback === true && HOMEPAGE_PROMOTION_MATERIAL_FIELDS.every(
    (field) => exactMaterialValue(card[field]) === exactMaterialValue(canonical[field]),
  );
}

/**
 * An Active homepage card is publishable only when it can render a complete,
 * accessible call to action without SafeImage or button-label fallbacks.
 * Draft and archived cards may remain incomplete while an editor is working.
 */
export function isHomepagePromotionCardComplete(card: {
  title?: unknown;
  body?: unknown;
  media_url?: unknown;
  href?: unknown;
  cta_label?: unknown;
  alt_text?: unknown;
}) {
  return [
    card.title,
    card.body,
    card.media_url,
    card.href,
    card.cta_label,
    card.alt_text,
  ].every((value) => exactMaterialValue(value).length > 0);
}

export function homepagePromotionPreview(
  cards: ContentCard[],
  now: number,
  requestedLimit = DEFAULT_HOMEPAGE_PROMOTION_COUNT,
) {
  const limit = Math.max(
    1,
    Math.min(MAX_HOMEPAGE_PROMOTION_COUNT, Math.round(requestedLimit || 8)),
  );
  const saved = uniquePromotionCards(
    cards.filter((card) => !isCanonicalHomepageFallback(card)),
  );
  const eligible = saved.filter(
    (card) =>
      isPromotionCardActive(card, now) &&
      isHomepagePromotionCardComplete(card),
  );
  const effectiveSaved = eligible.slice(0, limit);
  const fallbackCount = Math.max(0, limit - effectiveSaved.length);
  return {
    saved,
    eligible,
    fallbackCount,
    effective: uniquePromotionCards([
      ...effectiveSaved,
      ...HOMEPAGE_EDITORIAL_FALLBACKS,
    ]).slice(0, limit),
  };
}

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

/**
 * Explicitly global editorial content has no market, coordinates, salon, or
 * campaign association. This distinction matters while customer-location
 * state is still loading: unresolved targeted cards must never flash first.
 */
export function isExplicitlyGlobalPromotionCard(card: ContentCard) {
  return !targetCoordinates(card) &&
    !card.market_id &&
    !card.association_type &&
    !card.salon_id &&
    !card.campaign_id;
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
    // Existing administrator-authored image/GIF cards predate the
    // editorial_fallback flag. Treat every unassociated, untargeted card as a
    // global editorial card so a saved GIF cannot silently disappear after a
    // reload. Associated cards still require verified coordinates and radius.
    return isExplicitlyGlobalPromotionCard(card);
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
