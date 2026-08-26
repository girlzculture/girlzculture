import type { ContentCard } from "@/lib/content";
import { distanceMiles, validCoordinates } from "@/lib/location";
import { isPromotionCardActive } from "./promotionScheduleCore";

export { isPromotionCardActive } from "./promotionScheduleCore";

type Coordinates = { lat: number; lng: number };

export type HomepagePromotionDiagnosticCode =
  | "published"
  | "draft"
  | "hidden"
  | "inactive"
  | "missing_media"
  | "staged_media_unattached"
  | "missing_destination"
  | "unavailable_link"
  | "future_schedule"
  | "expired"
  | "outside_targeting"
  | "invalid_targeting"
  | "failed_publication";

export type HomepagePromotionDiagnostic = {
  code: HomepagePromotionDiagnosticCode;
  label: string;
  eligible: boolean;
  detail: string;
};

export type HomepagePromotionDiagnosticOptions = {
  availableSalonIds?: Set<string>;
  availableCampaignIds?: Set<string>;
  availableDestinations?: Set<string>;
  previewLocation?: Coordinates | null;
};

export const DEFAULT_HOMEPAGE_PROMOTION_COUNT = 8;
export const MAX_HOMEPAGE_PROMOTION_COUNT = 20;
export const MAX_HOMEPAGE_PROMOTION_SOURCE_COUNT = 200;

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
  "content_type", "source_kind", "association_type", "salon_id", "campaign_id",
  "title", "body", "media_url", "href", "cta_label", "alt_text", "status",
  "starts_at", "ends_at", "market_id", "target_label", "target_latitude",
  "target_longitude", "radius_miles", "priority", "rotation_weight",
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
 * A Super Admin may publish a media-only, copy-only, or informational card.
 * Missing marketing copy, CTA, destination, and alt text are presentation
 * warnings rather than authority blockers. A truly empty card is the only
 * incomplete card because it cannot present anything to a customer.
 */
export function isHomepagePromotionCardComplete(card: {
  title?: unknown;
  body?: unknown;
  media_url?: unknown;
  href?: unknown;
  cta_label?: unknown;
  alt_text?: unknown;
}) {
  return [card.title, card.body, card.media_url].some(
    (value) => exactMaterialValue(value).length > 0,
  );
}

export function homepagePromotionPreview(
  cards: ContentCard[],
  now: number,
  requestedLimit = DEFAULT_HOMEPAGE_PROMOTION_COUNT,
  options: HomepagePromotionDiagnosticOptions = {},
) {
  const limit = Math.max(
    1,
    Math.min(MAX_HOMEPAGE_PROMOTION_COUNT, Math.round(requestedLimit || 8)),
  );
  const saved = uniquePromotionCards(
    cards.filter((card) => !isCanonicalHomepageFallback(card)),
  );
  const diagnostics = saved.map((card) => ({
    card,
    diagnostic: homepagePromotionDiagnostic(card, now, options),
  }));
  const eligible = diagnostics
    .filter((item) => item.diagnostic.eligible)
    .map((item) => item.card);
  const effectiveSaved = eligible.slice(0, limit);
  const fallbackCount = Math.max(0, limit - effectiveSaved.length);
  return {
    saved,
    eligible,
    diagnostics,
    fallbackCount,
    effective: uniquePromotionCards([
      ...effectiveSaved,
      ...HOMEPAGE_EDITORIAL_FALLBACKS,
    ]).slice(0, limit),
  };
}

function validDestination(value: unknown) {
  const href = String(value || "").trim();
  if (!href) return true;
  if (href.startsWith("/")) return !href.startsWith("//");
  try {
    return new URL(href).protocol === "https:";
  } catch {
    return false;
  }
}

export function homepagePromotionDiagnostic(
  card: ContentCard,
  now: number,
  options: HomepagePromotionDiagnosticOptions = {},
): HomepagePromotionDiagnostic {
  const loose = card as ContentCard & {
    is_visible?: boolean;
    is_active?: boolean;
    media_state?: string;
    upload_state?: string;
    publication_error?: string;
  };
  if ((card.status || "Active") === "Draft") {
    return { code: "draft", label: "Draft", eligible: false, detail: "This card is saved as a draft." };
  }
  if (loose.is_visible === false) {
    return { code: "hidden", label: "Hidden", eligible: false, detail: "Visibility is turned off." };
  }
  if ((card.status || "Active") === "Archived" || loose.is_active === false) {
    return { code: "inactive", label: "Inactive", eligible: false, detail: "This card is archived or inactive." };
  }
  const mediaState = String(loose.media_state || loose.upload_state || "").toLowerCase();
  if (
    mediaState === "staged" &&
    !String(card.media_url || "").trim() &&
    !String(card.title || card.body || "").trim()
  ) {
    return {
      code: "staged_media_unattached",
      label: "Staged media not attached",
      eligible: false,
      detail: "The upload finished, but the empty card has not been saved with that media.",
    };
  }
  if (!isHomepagePromotionCardComplete(card)) {
    return {
      code: "missing_media",
      label: "Empty card",
      eligible: false,
      detail: "Add media, a title, or description before showing this card.",
    };
  }
  if (card.href && !validDestination(card.href)) {
    return { code: "unavailable_link", label: "Unavailable link", eligible: false, detail: "Use a valid internal path or HTTPS destination." };
  }
  const startsAt = card.starts_at ? Date.parse(card.starts_at) : 0;
  const endsAt = card.ends_at ? Date.parse(card.ends_at) : 0;
  if ((card.starts_at && !startsAt) || (card.ends_at && !endsAt) || (startsAt && endsAt && endsAt <= startsAt)) {
    return { code: "failed_publication", label: "Failed publication", eligible: false, detail: "Correct the promotion schedule before publishing." };
  }
  if (startsAt && startsAt > now) {
    return { code: "future_schedule", label: "Future schedule", eligible: false, detail: `Scheduled for ${new Date(startsAt).toLocaleString()}.` };
  }
  if (endsAt && endsAt <= now) {
    return { code: "expired", label: "Expired", eligible: false, detail: `Ended ${new Date(endsAt).toLocaleString()}.` };
  }
  const association = card.association_type || (card.campaign_id ? "campaign" : card.salon_id ? "salon" : undefined);
  if (association === "salon") {
    const id = String(card.salon_id || "").toLowerCase();
    if (!id || (options.availableSalonIds && !options.availableSalonIds.has(id))) {
      return { code: "unavailable_link", label: "Unavailable salon", eligible: false, detail: "The selected salon is not currently eligible for public placement." };
    }
  }
  if (association === "campaign") {
    const id = String(card.campaign_id || "").toLowerCase();
    if (!id || (options.availableCampaignIds && !options.availableCampaignIds.has(id))) {
      return { code: "unavailable_link", label: "Unavailable campaign", eligible: false, detail: "The campaign is paused, expired, or not authorized for public placement." };
    }
  }
  if (
    card.source_kind === "blog" &&
    card.href &&
    options.availableDestinations &&
    !options.availableDestinations.has(String(card.href).trim())
  ) {
    return { code: "unavailable_link", label: "Unavailable blog post", eligible: false, detail: "The linked blog post is not currently published." };
  }
  const hasTargeting = Boolean(card.market_id || card.target_label || card.target_latitude != null || card.target_longitude != null);
  const target = targetCoordinates(card);
  const configured = Number(card.radius_miles || 25);
  if (hasTargeting && (!target || !Number.isFinite(configured) || configured < 1 || configured > 250)) {
    return { code: "invalid_targeting", label: "Invalid radius or region", eligible: false, detail: "Choose a valid market center and a radius from 1 to 250 miles." };
  }
  if (
    target &&
    options.previewLocation &&
    validCoordinates(options.previewLocation) &&
    distanceMiles(options.previewLocation, target) > configuredRadius(card)
  ) {
    return { code: "outside_targeting", label: "Outside targeting", eligible: false, detail: "This preview location is outside the configured audience radius." };
  }
  if (loose.publication_error) {
    return { code: "failed_publication", label: "Failed publication", eligible: false, detail: "The last publication attempt failed. Save again after correcting the card." };
  }
  const optionalWarnings = [
    !card.media_url ? "no media" : "",
    !card.title ? "no title" : "",
    !card.body ? "no description" : "",
    !card.href ? "non-clickable" : "",
    !card.cta_label ? "no CTA label" : "",
    !card.alt_text && card.media_url ? "derived/decorative alt text" : "",
  ].filter(Boolean);
  return {
    code: "published",
    label: target ? "Published · location targeted" : "Published",
    eligible: true,
    detail: target
      ? `Eligible within ${configuredRadius(card)} miles of ${card.target_label || "the selected market"}.${optionalWarnings.length ? ` Optional warnings: ${optionalWarnings.join(", ")}.` : ""}`
      : `Eligible and ordered ahead of editorial fallbacks.${optionalWarnings.length ? ` Optional warnings: ${optionalWarnings.join(", ")}.` : ""}`,
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

export function isExplicitlyGlobalPromotionCard(card: ContentCard) {
  return !targetCoordinates(card) &&
    !card.market_id &&
    !card.association_type &&
    !card.salon_id &&
    !card.campaign_id;
}

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
  const configured = active.filter(
    (card) => !isCanonicalHomepageFallback(card),
  );
  const canonicalFallbacks = active.filter(isCanonicalHomepageFallback);
  const hasLocation = Boolean(
    input.customerLocation && validCoordinates(input.customerLocation),
  );
  const eligibleConfigured = configured.filter((card) => {
    const target = targetCoordinates(card);
    if (target) {
      return Boolean(
        hasLocation &&
          distanceMiles(input.customerLocation!, target) <= configuredRadius(card),
      );
    }
    return isExplicitlyGlobalPromotionCard(card);
  });
  const vacancies = Math.max(0, limit - eligibleConfigured.length);
  return uniquePromotionCards([
    ...eligibleConfigured.slice(0, limit),
    ...canonicalFallbacks.slice(0, vacancies),
  ]).slice(0, limit);
}
