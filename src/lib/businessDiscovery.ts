import { BUSINESS_CATEGORIES } from "./businessCategories";
import {
  DEFAULT_BUSINESS_SIGNUP_CONTENT,
  type BusinessSignupCategory,
  type BusinessSignupCategoryId,
} from "./businessSignupContent";

type DiscoveryDestination = { state: "live"; href: string } | { state: "coming_soon" };

// Customer discovery is independent of recruitment availability. Register a
// dedicated discovery route here only after that category has a real marketplace.
export const BUSINESS_DISCOVERY_DESTINATIONS: Readonly<Record<BusinessSignupCategoryId, DiscoveryDestination>> = {
  "hair-salon-braiding": { state: "live", href: "/salons" },
  "nail-studio": { state: "coming_soon" },
  "massage-wellness": { state: "coming_soon" },
  "aesthetics-clinic": { state: "coming_soon" },
  "tattoo-studio": { state: "coming_soon" },
  "lash-brow-bar": { state: "coming_soon" },
  barbershop: { state: "coming_soon" },
  other: { state: "coming_soon" },
};

const descriptions: Record<BusinessSignupCategoryId, string> = {
  "hair-salon-braiding": "Find salons and braiders. Explore styles, services and available appointments.",
  "nail-studio": "Manicures, nail art and your next fresh set.",
  "massage-wellness": "Time to unwind, recharge and feel your best.",
  "aesthetics-clinic": "Skincare and aesthetic treatments, with care.",
  "tattoo-studio": "Personal expression, brought to life in ink.",
  "lash-brow-bar": "Lashes and brows, shaped around your look.",
  barbershop: "Fresh cuts, fades and everyday grooming.",
  other: "More beauty and wellness experiences to discover.",
};

export function customerBusinessCategories(publishedCategories?: readonly BusinessSignupCategory[]) {
  return BUSINESS_CATEGORIES.map((identity, index) => {
    const defaults = DEFAULT_BUSINESS_SIGNUP_CONTENT.categories.find(category => category.id === identity.slug)!;
    const presentation = publishedCategories?.find(category => category.id === identity.slug) ?? defaults;
    return {
      id: identity.slug,
      name: presentation.name,
      image: presentation.image,
      fallbackImage: defaults.image.src,
      order: presentation.order ?? index,
      description: descriptions[identity.slug],
      destination: BUSINESS_DISCOVERY_DESTINATIONS[identity.slug],
    };
  }).sort((left, right) => left.order - right.order);
}
