export type BusinessSignupPanel = {
  id: "hair" | "nails" | "wellness" | "tattoo";
  poster: string;
  position: string;
  crop?: BusinessPhotoCrop;
  videoUrl?: string;
};

export type BusinessPhotoCrop = { x: number; y: number; width: number; height: number };

// The founder-supplied reference is stored unchanged. CSS windows display only
// its photographic regions; all page copy and controls remain accessible HTML.
// Coordinates refer to the original 1672 x 941 image, excluding baked-in text.
export const BUSINESS_REFERENCE_PHOTO = "/images/business/approved-business-reference.png";
export const BUSINESS_REFERENCE_SIZE = { width: 1672, height: 941 };

export const BUSINESS_SIGNUP_MEDIA: readonly BusinessSignupPanel[] = [
  { id: "hair", poster: BUSINESS_REFERENCE_PHOTO, position: "50% 50%", crop: { x: 0, y: 58, width: 425, height: 340 } },
  { id: "nails", poster: BUSINESS_REFERENCE_PHOTO, position: "50% 50%", crop: { x: 426, y: 0, width: 409, height: 219 } },
  { id: "wellness", poster: BUSINESS_REFERENCE_PHOTO, position: "50% 50%", crop: { x: 837, y: 0, width: 388, height: 219 } },
  { id: "tattoo", poster: BUSINESS_REFERENCE_PHOTO, position: "50% 50%", crop: { x: 1227, y: 60, width: 445, height: 340 } },
];

export const BUSINESS_CATEGORY_PHOTOS = {
  hair: { x: 274, y: 495, width: 83, height: 73 },
  nails: { x: 565, y: 495, width: 80, height: 73 },
  massage: { x: 864, y: 495, width: 78, height: 73 },
  aesthetics: { x: 1163, y: 495, width: 78, height: 73 },
  tattoo: { x: 274, y: 607, width: 83, height: 78 },
  lashes: { x: 565, y: 607, width: 80, height: 78 },
  barber: { x: 864, y: 607, width: 78, height: 78 },
  other: { x: 1163, y: 607, width: 78, height: 78 },
} as const satisfies Record<string, BusinessPhotoCrop>;
