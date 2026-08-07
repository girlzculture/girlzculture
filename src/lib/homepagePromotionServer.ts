import "server-only";

import { supabase } from "@/lib/supabase";
import type { ContentCard } from "@/lib/content";
import {
  DEFAULT_HOMEPAGE_PROMOTION_COUNT,
  MAX_HOMEPAGE_PROMOTION_COUNT,
  MAX_HOMEPAGE_PROMOTION_SOURCE_COUNT,
  isPromotionCardActive,
  uniquePromotionCards,
} from "@/lib/homePromotionCore";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";

const PUBLIC_PROMOTION_READ_TIMEOUT_MS = 2_500;

/**
 * Distinct, non-paid editorial cards used only when a local pool has fewer
 * eligible promotions than the configured rail size. These never bypass a
 * salon/campaign radius: they have no business association and link only to
 * Girlz Culture discovery/editorial pages.
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

type ResolvedTarget = {
  target_type: "salon" | "campaign";
  target_id: string;
  salon_id: string;
  campaign_id: string | null;
  salon_name: string;
  salon_slug: string;
  cover_photo_url: string | null;
  address_city: string | null;
  address_state: string | null;
  target_latitude: number | null;
  target_longitude: number | null;
  radius_miles: number | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AssociationReference = {
  type: "salon" | "campaign";
  id: string;
  key: string;
};

function associationReference(card: ContentCard): AssociationReference | null {
  const type =
    card.association_type ||
    (card.campaign_id ? "campaign" : card.salon_id ? "salon" : null);
  const id = type === "campaign" ? card.campaign_id : card.salon_id;
  if (!type || !id) return null;
  return { type, id, key: `${type}:${id.toLowerCase()}` };
}

async function resolveAssociations(cards: ContentCard[]) {
  const requested = new Map<string, AssociationReference>();
  for (const card of cards) {
    const reference = associationReference(card);
    if (reference && UUID_PATTERN.test(reference.id)) {
      requested.set(reference.key, reference);
    }
  }
  if (!requested.size) return new Map<string, ResolvedTarget>();

  try {
    const { data, error } = await supabase
      .rpc("resolve_homepage_promotion_targets", {
        p_targets: Array.from(requested.values(), (reference) => ({
          target_type: reference.type,
          target_id: reference.id,
        })),
      })
      .abortSignal(AbortSignal.timeout(PUBLIC_PROMOTION_READ_TIMEOUT_MS));
    if (error) throw error;

    const resolved = new Map<string, ResolvedTarget>();
    for (const target of (data || []) as ResolvedTarget[]) {
      const key = `${target.target_type}:${String(target.target_id).toLowerCase()}`;
      // Defense in depth: a SECURITY DEFINER response can hydrate only a tuple
      // explicitly requested by this page load. Never accept an unrelated salon
      // or campaign if a database regression returns an over-broad result set.
      if (requested.has(key)) resolved.set(key, target);
    }
    return resolved;
  } catch (error) {
    await capturePublicPageFailure(
      error,
      "homepage",
      "resolve-promotion-associations",
    );
    // Editorial fallbacks are already approved and must keep the homepage
    // available when a nonessential promotion lookup is slow or unavailable.
    return new Map<string, ResolvedTarget>();
  }
}

function hydrateAssociation(card: ContentCard, target: ResolvedTarget) {
  const location = [target.address_city, target.address_state]
    .filter(Boolean)
    .join(", ");
  const requestedRadius = Math.max(
    1,
    Math.min(250, Number(card.radius_miles || target.radius_miles || 25)),
  );
  const authorizedCampaignRadius = Math.max(
    1,
    Math.min(250, Number(target.radius_miles || 25)),
  );
  const effectiveRadius =
    target.target_type === "campaign"
      ? Math.min(requestedRadius, authorizedCampaignRadius)
      : requestedRadius;
  return {
    ...card,
    association_type: target.target_type,
    salon_id: target.salon_id,
    campaign_id: target.campaign_id || undefined,
    title: card.title || target.salon_name,
    body: card.body || location,
    media_url: card.media_url || target.cover_photo_url || undefined,
    href:
      target.target_type === "campaign"
        ? `/salon/${target.salon_slug}?campaign=${target.campaign_id}`
        : `/salon/${target.salon_slug}`,
    target_label: location,
    target_latitude: target.target_latitude ?? undefined,
    target_longitude: target.target_longitude ?? undefined,
    radius_miles: effectiveRadius,
  } satisfies ContentCard;
}

export async function resolvePublishedHomepagePromotions(
  cards: ContentCard[],
  now = Date.now(),
  requestedDisplayLimit = DEFAULT_HOMEPAGE_PROMOTION_COUNT,
) {
  const poolLimit = Math.max(
    1,
    Math.min(MAX_HOMEPAGE_PROMOTION_COUNT, Math.round(requestedDisplayLimit || DEFAULT_HOMEPAGE_PROMOTION_COUNT)),
  );
  const scheduled = uniquePromotionCards(cards)
    .filter((card) => isPromotionCardActive(card, now))
    .slice(0, MAX_HOMEPAGE_PROMOTION_SOURCE_COUNT);
  const resolvedTargets = await resolveAssociations(scheduled);
  const published = scheduled.flatMap((card) => {
    const reference = associationReference(card);
    if (!reference) return [card];
    if (!UUID_PATTERN.test(reference.id)) return [];
    const target = resolvedTargets.get(reference.key);
    return target ? [hydrateAssociation(card, target)] : [];
  });
  return uniquePromotionCards([...published, ...HOMEPAGE_EDITORIAL_FALLBACKS])
    .map((card) => ({ ...card, display_limit: poolLimit }));
}
