import type { ContentCard, ContentSection } from "@/lib/content";

export const HOME_HERO_SECTION_ID = "home-hero-promotion-carousel";
export const HOME_ANNOUNCEMENT_SECTION_ID = "home-announcement-banner";
export const ABOUT_CAROUSEL_ONE_ID = "about-promo-carousel";
export const ABOUT_CAROUSEL_TWO_ID = "about-community-carousel";

export const HERO_PRESENTATION_LAYOUTS = [
  "promo_rail",
  "community_carousel",
  "carousel",
  "card_grid",
  "banner",
  "text",
] as const;

export type HeroPresentationLayout =
  (typeof HERO_PRESENTATION_LAYOUTS)[number];

export type ManagedContentSection = ContentSection & {
  presentation_layout?: HeroPresentationLayout;
};

function isHeroLayout(value: unknown): value is HeroPresentationLayout {
  return HERO_PRESENTATION_LAYOUTS.includes(value as HeroPresentationLayout);
}

export function heroPresentationLayout(
  section: ContentSection | null | undefined,
): HeroPresentationLayout {
  const managed = section as ManagedContentSection | null | undefined;
  if (isHeroLayout(managed?.presentation_layout)) {
    return managed.presentation_layout;
  }
  if (isHeroLayout(section?.type)) return section.type;
  return "promo_rail";
}

export function isHomeHeroSection(
  section: ContentSection | null | undefined,
) {
  return Boolean(
    section &&
      (String(section.id || "") === HOME_HERO_SECTION_ID ||
        section.type === "promo_rail"),
  );
}

export function findHomeHeroSection(
  sections: ContentSection[] | null | undefined,
) {
  const rows = Array.isArray(sections) ? sections : [];
  return (
    rows.find((section) => String(section.id || "") === HOME_HERO_SECTION_ID) ||
    rows.find((section) => section.type === "promo_rail") ||
    null
  );
}

export function canonicalHomeHeroSection(
  section: ContentSection | null | undefined,
): ManagedContentSection {
  return {
    id: HOME_HERO_SECTION_ID,
    type: "promo_rail",
    presentation_layout: heroPresentationLayout(section),
    title: section?.title || "",
    body: section?.body || "",
    image_url: section?.image_url || "",
    cta_label: section?.cta_label || "",
    cta_href: section?.cta_href || "",
    is_visible: section?.is_visible !== false,
    columns: section?.columns || 4,
    display_limit: section?.display_limit || 8,
    scroll_direction:
      section?.scroll_direction === "reverse" ? "reverse" : "forward",
    cards: Array.isArray(section?.cards) ? section.cards : [],
  };
}

export function findAboutCarouselSection(
  sections: ContentSection[] | null | undefined,
  slot: "one" | "two",
) {
  const rows = Array.isArray(sections) ? sections : [];
  const expectedId =
    slot === "one" ? ABOUT_CAROUSEL_ONE_ID : ABOUT_CAROUSEL_TWO_ID;
  const exact = rows.find(
    (section) => String(section.id || "") === expectedId,
  );
  if (exact) return exact;
  const carousels = rows.filter(
    (section) => section.type === "community_carousel",
  );
  return carousels[slot === "one" ? 0 : 1] || null;
}

export function replaceManagedSection(
  sections: ContentSection[] | null | undefined,
  section: ContentSection,
  options: {
    legacyMatcher?: (candidate: ContentSection, index: number) => boolean;
  } = {},
) {
  const rows = Array.isArray(sections) ? [...sections] : [];
  const sectionId = String(section.id || "");
  let index = sectionId
    ? rows.findIndex((candidate) => String(candidate.id || "") === sectionId)
    : -1;
  if (index < 0 && options.legacyMatcher) {
    index = rows.findIndex(options.legacyMatcher);
  }
  if (index < 0) return [section, ...rows];
  rows[index] = section;
  return rows;
}

export const ABOUT_CAROUSEL_ONE_EDITORIAL_FALLBACKS: ContentCard[] = [
  {
    id: "about-editorial-community",
    content_type: "image",
    source_kind: "custom",
    title: "Made for our community",
    body: "Discover beauty professionals who understand the styles, care, and service you are looking for.",
    media_url: "/images/hero-braids.jpg",
    href: "/salons",
    cta_label: "Find a salon",
    alt_text: "Client with a finished braided hairstyle",
    status: "Active",
    editorial_fallback: true,
  },
  {
    id: "about-editorial-styles",
    content_type: "image",
    source_kind: "custom",
    title: "Explore real styles",
    body: "Compare clear service information before choosing a salon and appointment.",
    media_url: "/images/braids-knotless.jpg",
    href: "/styles",
    cta_label: "Browse styles",
    alt_text: "Detailed knotless braid hairstyle",
    status: "Active",
    editorial_fallback: true,
  },
  {
    id: "about-editorial-partner",
    content_type: "image",
    source_kind: "custom",
    title: "Helping salons grow",
    body: "Girlz Culture gives beauty professionals practical tools to reach and serve more customers.",
    media_url: "/images/salon-modern.jpg",
    href: "/partner",
    cta_label: "Partner with us",
    alt_text: "Bright modern beauty salon",
    status: "Active",
    editorial_fallback: true,
  },
  {
    id: "about-editorial-trust",
    content_type: "image",
    source_kind: "custom",
    title: "Book with clearer information",
    body: "See services, prices, availability, and verified marketplace information in one place.",
    media_url: "/images/salon-warm.jpg",
    href: "/how-it-works",
    cta_label: "How it works",
    alt_text: "Warm welcoming beauty salon interior",
    status: "Active",
    editorial_fallback: true,
  },
];
