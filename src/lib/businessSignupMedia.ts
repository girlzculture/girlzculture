export type BusinessSignupPanel = {
  id: "hair" | "nails" | "wellness" | "tattoo";
  poster: string;
  position: string;
  videoUrl?: string;
};

// Slots for founder-approved clips. Existing repository photos are temporary
// decorative posters; do not imply that unavailable verticals are operational.
// Add an approved local videoUrl only when the corresponding file exists.
export const BUSINESS_SIGNUP_MEDIA: readonly BusinessSignupPanel[] = [
  { id: "hair", poster: "/images/hero-braids.jpg", position: "50% 40%" },
  { id: "nails", poster: "/images/salon-blush.jpg", position: "65% 50%" },
  { id: "wellness", poster: "/images/salon-modern.jpg", position: "35% 50%" },
  { id: "tattoo", poster: "/images/salon-warm.jpg", position: "65% 50%" },
];
