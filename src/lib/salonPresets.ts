export const SIZE_OPTIONS = ["X-Small", "Small", "Small-Medium", "Medium", "Large", "Jumbo"] as const;

export const LENGTH_OPTIONS = ["Shoulder", "Bra-strap", "Mid-back", "Waist", "Butt/Hip", "Tailbone", "Classic", "Mid-thigh", "Knee"] as const;

export const ADD_ON_OPTIONS = [
  "Boho curls",
  "Beads",
  "Color",
  "Curly ends",
  "Wash & blow-dry",
  "Scalp treatment",
  "Take-down/removal",
  "Kids' style",
  "Men's style",
  "Other",
] as const;

export const MATERIAL_OPTIONS = [
  "Kanekalon (standard)",
  "X-Pression (premium)",
  "Pre-stretched (premium)",
  "Human hair (luxury)",
  "Client provides own hair",
] as const;

export const MATERIAL_QUALITY_OPTIONS = ["Good", "Better", "Best", "Luxury"] as const;
export const MATERIAL_LONGEVITY_WEEKS = Array.from({ length: 12 }, (_, index) => index + 1);

export const INCLUDED_ITEM_OPTIONS = [
  "Consultation",
  "Wash & blow-dry",
  "Scalp treatment",
  "Braiding hair",
  "Premium hair",
  "Style & finish",
  "Aftercare tips",
] as const;

export const MASTER_STYLE_SEED = [
  ["Knotless Braids", "Braids"],
  ["Box Braids", "Braids"],
  ["Cornrows", "Braids"],
  ["Locs", "Locs"],
  ["Goddess Locs", "Locs"],
  ["Feed-in Braids", "Braids"],
  ["Boho Braids", "Braids"],
  ["Fulani/Tribal Braids", "Braids"],
  ["Passion Twists", "Twists"],
  ["Senegalese Twists", "Twists"],
  ["Kinky Twists", "Twists"],
  ["Butterfly Locs", "Locs"],
  ["Faux Locs", "Locs"],
  ["Stitch Braids", "Braids"],
  ["Lemonade Braids", "Braids"],
  ["Crochet Braids", "Braids"],
  ["Micro Braids", "Braids"],
  ["Kids' Braids", "Braids"],
  ["Men's Braids", "Braids"],
  ["Two-Strand Twists", "Twists"],
] as const;

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const STORE_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const displayHour = hour % 12 || 12;
  const label = `${displayHour}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  return { value, label };
});

