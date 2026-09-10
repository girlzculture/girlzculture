export type BusinessPhotoAsset = { src: string; position: string };
export type BusinessSignupPanel = {
  id: "hair" | "nails" | "wellness" | "tattoo";
  poster: string;
  position: string;
  videoUrl?: string;
};

// Unchanged licensed service photographs, hosted locally. Full provenance is in
// public/images/business/media-sources.json. No mockup thumbnail is enlarged.
export const BUSINESS_CATEGORY_PHOTOS = {
  hair: { src: "/images/business/hair-service.avif", position: "50% 48%" },
  nails: { src: "/images/business/nails-service.avif", position: "50% 50%" },
  massage: { src: "/images/business/massage-service.avif", position: "50% 48%" },
  facial: { src: "/images/business/facial-service.avif", position: "50% 50%" },
  tattoo: { src: "/images/business/tattoo-service.avif", position: "50% 48%" },
  lashes: { src: "/images/business/lashes-service.avif", position: "50% 50%" },
  barber: { src: "/images/business/barber-service.avif", position: "50% 45%" },
  other: { src: "/images/business/other-service.avif", position: "50% 50%" },
} as const satisfies Record<string, BusinessPhotoAsset>;

// Optional local video slots retain reduced-motion and failed-autoplay posters.
// Only add a clip after it is available locally and its license is recorded.
export const BUSINESS_SIGNUP_MEDIA: readonly BusinessSignupPanel[] = [
  { id: "hair", poster: BUSINESS_CATEGORY_PHOTOS.hair.src, position: "50% 48%" },
  { id: "nails", poster: BUSINESS_CATEGORY_PHOTOS.nails.src, position: "50% 50%" },
  { id: "wellness", poster: BUSINESS_CATEGORY_PHOTOS.facial.src, position: "50% 48%" },
  { id: "tattoo", poster: BUSINESS_CATEGORY_PHOTOS.tattoo.src, position: "50% 48%" },
];
