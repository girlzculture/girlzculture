export const BUSINESS_CATEGORIES = [
  { slug: "hair-salon-braiding", name: "Hair Salon & Braiding", photo: "hair", live: true },
  { slug: "nail-studio", name: "Nail Studio", photo: "nails", live: false },
  { slug: "massage-wellness", name: "Massage & Wellness", photo: "massage", live: false },
  { slug: "aesthetics-clinic", name: "Aesthetics Clinic", photo: "facial", live: false },
  { slug: "tattoo-studio", name: "Tattoo Studio", photo: "tattoo", live: false },
  { slug: "lash-brow-bar", name: "Lash & Brow Bar", photo: "lashes", live: false },
  { slug: "barbershop", name: "Barbershop", photo: "barber", live: false },
  { slug: "other", name: "Other", photo: "other", live: false },
] as const;

// Keep the retired stable identity only for old CMS snapshots and records.
export const ACTIVE_BUSINESS_CATEGORIES = BUSINESS_CATEGORIES.filter(category => category.slug !== "other");
export const categoryOpeningMessage = (name: string) => `We're opening access to more beauty and wellness businesses in your area soon. Join the waitlist and we'll reach out when onboarding opens for ${name} businesses in your area.`;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
export type WaitlistCategory = Extract<BusinessCategory, { live: false }>;

export function waitlistCategory(value: unknown): WaitlistCategory | undefined {
  return BUSINESS_CATEGORIES.find((category): category is WaitlistCategory => !category.live && category.slug !== "other" && category.slug === value);
}

export function businessCategoryHref(category: BusinessCategory, liveHref: string) {
  return category.live ? liveHref : `/business/waitlist?category=${category.slug}`;
}
