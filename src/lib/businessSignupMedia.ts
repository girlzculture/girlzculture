import type { CSSProperties } from "react";

export type BusinessPhotoAsset = {
  src: string;
  alt: string;
  objectFit?: CSSProperties["objectFit"];
  objectPosition?: CSSProperties["objectPosition"];
  aspectRatio?: CSSProperties["aspectRatio"];
};
export type BusinessSignupPanel = { id: string; photo: BusinessPhotoAsset };
export type BusinessSignupVideo = { src: string; poster: BusinessPhotoAsset };

// Independent local assets; provenance is in public/images/business/media-sources.json.
// Empty alt avoids repeating adjacent category names. Final assets/design are pending.
export const BUSINESS_CATEGORY_PHOTOS = {
  hair: { src: "/images/business/hair-service.avif", alt: "" },
  nails: { src: "/images/business/nails-service.avif", alt: "" },
  massage: { src: "/images/business/massage-service.avif", alt: "" },
  facial: { src: "/images/business/facial-service.avif", alt: "" },
  tattoo: { src: "/images/business/tattoo-service.avif", alt: "" },
  lashes: { src: "/images/business/lashes-service.avif", alt: "" },
  barber: { src: "/images/business/barber-service.avif", alt: "" },
  other: { src: "/images/business/other-service.avif", alt: "" },
} as const satisfies Record<string, BusinessPhotoAsset>;

export const BUSINESS_SIGNUP_MEDIA: readonly BusinessSignupPanel[] = [
  { id: "hair", photo: BUSINESS_CATEGORY_PHOTOS.hair },
  { id: "nails", photo: BUSINESS_CATEGORY_PHOTOS.nails },
  { id: "wellness", photo: BUSINESS_CATEGORY_PHOTOS.facial },
  { id: "tattoo", photo: BUSINESS_CATEGORY_PHOTOS.tattoo },
];

// Enable only after the final file and poster have been supplied. See the handoff.
// Future src: /videos/business/business-signup-hero.mp4
export const BUSINESS_SIGNUP_HERO_VIDEO: BusinessSignupVideo | undefined = undefined;
