import "server-only";

import { supabase } from "@/lib/supabase";
import type { ContentCard } from "@/lib/content";
import { isPromotionCardActive } from "@/lib/homePromotionCore";
import { capturePublicPageFailure } from "@/lib/publicPageMonitoring";

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
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveAssociation(card: ContentCard) {
  const type =
    card.association_type ||
    (card.campaign_id ? "campaign" : card.salon_id ? "salon" : null);
  const id = type === "campaign" ? card.campaign_id : card.salon_id;
  if (!type || !id) return { card, associated: false };
  if (!UUID_PATTERN.test(id)) return { card: null, associated: true };

  const { data, error } = await supabase
    .rpc("resolve_homepage_promotion_target", {
      p_target_type: type,
      p_target_id: id,
    })
    .maybeSingle();
  if (error) {
    await capturePublicPageFailure(
      error,
      "homepage",
      "resolve-promotion-association",
    );
    return { card: null, associated: true };
  }
  const target = data as ResolvedTarget | null;
  if (!target) return { card: null, associated: true };
  const location = [target.address_city, target.address_state]
    .filter(Boolean)
    .join(", ");
  return {
    associated: true,
    card: {
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
    } satisfies ContentCard,
  };
}

export async function resolvePublishedHomepagePromotions(
  cards: ContentCard[],
  now = Date.now(),
) {
  const scheduled = cards
    .slice(0, 8)
    .filter((card) => isPromotionCardActive(card, now));
  const resolved = await Promise.all(scheduled.map(resolveAssociation));
  return resolved
    .map((result) => result.card)
    .filter((card): card is ContentCard => Boolean(card));
}
