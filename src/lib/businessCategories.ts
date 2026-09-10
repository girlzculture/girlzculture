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

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];
export type WaitlistCategory = Extract<BusinessCategory, { live: false }>;

export function waitlistCategory(value: unknown): WaitlistCategory | undefined {
  return BUSINESS_CATEGORIES.find((category): category is WaitlistCategory => !category.live && category.slug === value);
}

export function businessCategoryHref(category: BusinessCategory, liveHref: string) {
  return category.live ? liveHref : `/business/waitlist?category=${category.slug}`;
}

/** Canonicalize only the retired public business CTA, retaining its query/hash. */
export function businessEntryHref(href: string) {
  return href.replace(/^\/partner\/?(?=[?#]|$)/, "/business/signup");
}
